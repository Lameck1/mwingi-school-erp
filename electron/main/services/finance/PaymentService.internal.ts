
import { randomUUID } from 'node:crypto'

import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

import type {
  ApprovalQueueItem,
  Invoice,
  IPaymentQueryService,
  IPaymentValidator,
  IPaymentVoidProcessor,
  PaymentData,
  PaymentResult,
  PaymentTransaction,
  ValidationResult,
  VoidPaymentData,
  VoidedTransaction
} from './PaymentService.types'
import type Database from 'better-sqlite3'

interface VoidAuditRecordData {
  transactionId: number
  studentId: number
  amount: number
  description: string
  voidReason: string
  voidedBy: number
  recoveryMethod?: string
}


// ============================================================================
// REPOSITORY LAYER (SRP)
// ============================================================================

export class PaymentTransactionRepository {
  private readonly db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  async createTransaction(data: PaymentData): Promise<number> {
    const db = this.db
    const result = db.prepare(`
      INSERT INTO ledger_transaction (
        student_id, transaction_type, amount, transaction_date, description,
        payment_method, payment_reference, recorded_by_user_id, cheque_number, bank_name,
        is_approved, approval_status, term_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.student_id,
      'CREDIT',
      data.amount,
      data.transaction_date,
      data.description || `Payment received: ${data.payment_reference}`,
      data.payment_method,
      data.payment_reference,
      data.recorded_by_user_id,
      data.cheque_number || null,
      data.bank_name || null,
      1,
      'APPROVED',
      data.term_id
    )
    return result.lastInsertRowid as number
  }

  async createReversal(studentId: number, originalAmount: number, voidReason: string, voidedBy: number): Promise<number> {
    const db = this.db
    const result = db.prepare(`
      INSERT INTO ledger_transaction (
        student_id, transaction_type, amount, transaction_date, description,
        payment_method, reference, recorded_by, is_voided, void_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      studentId,
      'REVERSAL',
      -originalAmount,
      new Date().toISOString().split('T')[0],
      `Void of transaction`,
      'VOID',
      `VOID_REF_${studentId}_${Date.now()}`,
      voidedBy,
      1,
      voidReason
    )
    return result.lastInsertRowid as number
  }

  async getTransaction(id: number): Promise<PaymentTransaction | null> {
    const db = this.db
    return db.prepare(`SELECT * FROM ledger_transaction WHERE id = ?`).get(id) as PaymentTransaction | null
  }

  async getStudentHistory(studentId: number, limit: number): Promise<PaymentTransaction[]> {
    const db = this.db
    return db.prepare(`
      SELECT * FROM ledger_transaction
      WHERE student_id = ? AND transaction_type IN ('CREDIT', 'PAYMENT')
      ORDER BY transaction_date DESC, created_at DESC
      LIMIT ?
    `).all(studentId, limit) as PaymentTransaction[]
  }

  async updateStudentBalance(studentId: number, newBalance: number): Promise<void> {
    const db = this.db
    db.prepare(`UPDATE student SET credit_balance = ? WHERE id = ?`).run(newBalance, studentId)
  }

  async getStudentBalance(studentId: number): Promise<number> {
    const db = this.db
    const result = db.prepare(`SELECT credit_balance FROM student WHERE id = ?`).get(studentId) as { credit_balance: number } | undefined
    return result?.credit_balance || 0
  }

  async getStudentById(studentId: number): Promise<{ id: number; credit_balance: number } | null> {
    const db = this.db
    return db.prepare(`SELECT id, credit_balance FROM student WHERE id = ?`).get(studentId) as { id: number; credit_balance: number } | null
  }
}

// ============================================================================
// VOID AUDIT REPOSITORY (SRP)
// ============================================================================

export class VoidAuditRepository {
  private readonly db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  async recordVoid(data: VoidAuditRecordData): Promise<number> {
    const db = this.db
    const result = db.prepare(`
      INSERT INTO void_audit (
        transaction_id, transaction_type, original_amount, student_id, description,
        void_reason, voided_by, voided_at, recovered_method, recovered_by, recovered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.transactionId,
      'PAYMENT',
      data.amount,
      data.studentId,
      data.description,
      data.voidReason,
      data.voidedBy,
      new Date().toISOString(),
      data.recoveryMethod || null,
      null,
      null
    )
    return result.lastInsertRowid as number
  }

  async getVoidReport(startDate: string, endDate: string): Promise<VoidedTransaction[]> {
    const db = this.db
    return db.prepare(`
      SELECT va.*, u.first_name, u.last_name, s.admission_number, s.first_name as student_first_name
      FROM void_audit va
      LEFT JOIN user u ON va.voided_by = u.id
      LEFT JOIN student s ON va.student_id = s.id
      WHERE va.voided_at >= ? AND va.voided_at <= ?
      ORDER BY va.voided_at DESC
    `).all(startDate, endDate) as VoidedTransaction[]
  }
}

// ============================================================================
// INVOICE VALIDATOR (SRP)
// ============================================================================

export class InvoiceValidator implements IPaymentValidator {
  private readonly db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  validatePaymentAgainstInvoices(studentId: number, amount: number): ValidationResult {
    const db = this.db

    try {
      const invoices = db.prepare(`
        SELECT * FROM fee_invoice
        WHERE student_id = ? AND status = 'OUTSTANDING'
        ORDER BY due_date ASC
      `).all(studentId) as Invoice[]

      if (invoices.length === 0) {
        return {
          valid: true,
          message: 'No outstanding invoices for this student',
          invoices: []
        }
      }

        const totalOutstanding = invoices.reduce((sum, inv) => {
          const total = typeof inv.total_amount === 'number' ? inv.total_amount : (inv.amount ?? 0)
          const paid = typeof inv.amount_paid === 'number' ? inv.amount_paid : 0
          return sum + Math.max(total - paid, 0)
        }, 0)

      if (amount > totalOutstanding) {
        return {
          valid: true,
          message: `Payment exceeds outstanding balance. Overpayment will be credited.`,
          invoices
        }
      }

      return {
        valid: true,
        message: `Payment applied to ${invoices.length} outstanding invoice(s)`,
        invoices
      }
    } catch (error) {
      throw new Error(`Failed to validate payment: ${(error as Error).message}`)
    }
  }
}

// ============================================================================
// PAYMENT PROCESSOR (SRP)
// ============================================================================

export class PaymentProcessor {
  private readonly db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  private getOrCreateSchoolFeesCategory(): number {
    const categoryRow = this.db.prepare(`
      SELECT id
      FROM transaction_category
      WHERE category_name = 'School Fees'
      LIMIT 1
    `).get() as { id: number } | undefined

    if (categoryRow?.id) {
      return categoryRow.id
    }

    const insert = this.db.prepare(`
      INSERT INTO transaction_category (category_name, category_type, is_system, is_active)
      VALUES (?, ?, 1, 1)
    `)

    const result = insert.run('School Fees', 'INCOME')
    return result.lastInsertRowid as number
  }

  private createTransactionRefs(): { transactionRef: string; receiptNumber: string } {
    const timestamp = new Date().toISOString().slice(0, 10).replaceAll('-', '')
    const nonce = randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()
    const uniqueSegment = String(Date.now())
    return {
      transactionRef: `TXN-${timestamp}-${uniqueSegment}-${nonce}`,
      receiptNumber: `RCP-${timestamp}-${uniqueSegment}-${nonce}`
    }
  }

  private insertLedgerTransaction(
    data: PaymentData,
    categoryId: number,
    transactionRef: string,
    description: string
  ): number {
    const statement = this.db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
        student_id, payment_method, payment_reference, description, term_id, recorded_by_user_id, invoice_id
      )
      VALUES (?, ?, 'FEE_PAYMENT', ?, ?, 'CREDIT', ?, ?, ?, ?, ?, ?, ?)
    `)

    const result = statement.run(
      transactionRef,
      data.transaction_date,
      categoryId,
      data.amount,
      data.student_id,
      data.payment_method,
      data.payment_reference,
      description,
      data.term_id,
      data.recorded_by_user_id,
      data.invoice_id || null
    )

    return result.lastInsertRowid as number
  }

  private insertReceipt(data: PaymentData, transactionId: number, receiptNumber: string): void {
    const statement = this.db.prepare(`
      INSERT INTO receipt (
        receipt_number, transaction_id, receipt_date, student_id, amount,
        amount_in_words, payment_method, payment_reference, created_by_user_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    statement.run(
      receiptNumber,
      transactionId,
      data.transaction_date,
      data.student_id,
      data.amount,
      data.amount_in_words || '',
      data.payment_method,
      data.payment_reference,
      data.recorded_by_user_id
    )
  }

  private applyPaymentToSpecificInvoice(invoiceId: number, amount: number): void {
    const invoice = this.db.prepare(`
      SELECT total_amount, amount_paid
      FROM fee_invoice
      WHERE id = ?
    `).get(invoiceId) as { total_amount: number; amount_paid: number } | undefined

    if (!invoice) {
      return
    }

    this.db.prepare(`
      UPDATE fee_invoice
      SET amount_paid = amount_paid + ?,
          status = CASE WHEN amount_paid + ? >= total_amount THEN 'PAID' ELSE 'PARTIAL' END
      WHERE id = ?
    `).run(amount, amount, invoiceId)
  }

  private applyPaymentAcrossOutstandingInvoices(studentId: number, paymentAmount: number): number {
    let remainingAmount = paymentAmount
    const pendingInvoices = this.db.prepare(`
      SELECT id, total_amount, amount_paid
      FROM fee_invoice
      WHERE student_id = ? AND status != 'PAID'
      ORDER BY invoice_date ASC
    `).all(studentId) as Array<{ id: number; total_amount: number; amount_paid: number }>

    const updateInvoiceStatement = this.db.prepare(`
      UPDATE fee_invoice
      SET amount_paid = amount_paid + ?,
          status = CASE WHEN amount_paid + ? >= total_amount THEN 'PAID' ELSE 'PARTIAL' END
      WHERE id = ?
    `)

    for (const invoice of pendingInvoices) {
      if (remainingAmount <= 0) {
        break
      }

      const outstanding = invoice.total_amount - (invoice.amount_paid || 0)
      const appliedAmount = Math.min(remainingAmount, outstanding)

      updateInvoiceStatement.run(appliedAmount, appliedAmount, invoice.id)
      remainingAmount -= appliedAmount
    }

    return remainingAmount
  }

  private applyInvoiceAndCreditUpdates(data: PaymentData): void {
    if (data.invoice_id) {
      this.applyPaymentToSpecificInvoice(data.invoice_id, data.amount)
      return
    }

    const remainingAmount = this.applyPaymentAcrossOutstandingInvoices(data.student_id, data.amount)
    if (remainingAmount > 0) {
      this.db.prepare(`
        UPDATE student
        SET credit_balance = COALESCE(credit_balance, 0) + ?
        WHERE id = ?
      `).run(remainingAmount, data.student_id)
    }
  }

  private logPaymentAudit(data: PaymentData, transactionId: number, transactionRef: string, receiptNumber: string): void {
    logAudit(
      data.recorded_by_user_id,
      'CREATE',
      'ledger_transaction',
      transactionId,
      null,
      {
        amount: data.amount,
        student_id: data.student_id,
        payment_method: data.payment_method,
        txnRef: transactionRef,
        rcpNum: receiptNumber
      }
    )
  }

  processPayment(data: PaymentData): { transactionId: number; transactionRef: string; receiptNumber: string } {
    const { transactionRef, receiptNumber } = this.createTransactionRefs()
    const description = data.description || 'Tuition Fee Payment'
    const categoryId = this.getOrCreateSchoolFeesCategory()

    const transactionId = this.insertLedgerTransaction(data, categoryId, transactionRef, description)
    this.insertReceipt(data, transactionId, receiptNumber)
    this.applyInvoiceAndCreditUpdates(data)
    this.logPaymentAudit(data, transactionId, transactionRef, receiptNumber)

    return { transactionId, transactionRef, receiptNumber }
  }
}

// ============================================================================
// VOID PROCESSOR (SRP)
// ============================================================================

export class VoidProcessor implements IPaymentVoidProcessor {
  private readonly db: Database.Database
  private readonly transactionRepo: PaymentTransactionRepository
  private readonly voidAuditRepo: VoidAuditRepository

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.transactionRepo = new PaymentTransactionRepository(this.db)
    this.voidAuditRepo = new VoidAuditRepository(this.db)
  }

  async voidPayment(data: VoidPaymentData): Promise<PaymentResult> {
    try {
      const transaction = await this.transactionRepo.getTransaction(data.transaction_id)

      if (!transaction) {
        return {
          success: false,
          message: 'Transaction not found'
        }
      }

      const reversalId = await this.transactionRepo.createReversal(
        transaction.student_id,
        transaction.amount,
        data.void_reason,
        data.voided_by
      )

      await this.voidAuditRepo.recordVoid({
        transactionId: data.transaction_id,
        studentId: transaction.student_id,
        amount: transaction.amount,
        description: transaction.description,
        voidReason: data.void_reason,
        voidedBy: data.voided_by,
        recoveryMethod: data.recovery_method
      })

      const currentBalance = await this.transactionRepo.getStudentBalance(transaction.student_id)
      const newBalance = currentBalance - transaction.amount
      await this.transactionRepo.updateStudentBalance(transaction.student_id, newBalance)

      logAudit(
        data.voided_by,
        'VOID',
        'void_audit',
        reversalId,
        null,
        { original_transaction_id: data.transaction_id, void_reason: data.void_reason }
      )

      return {
        success: true,
        message: `Payment voided successfully. Reversal transaction: #${reversalId}`,
        transaction_id: reversalId
      }
    } catch (error) {
      throw new Error(`Failed to void payment: ${(error as Error).message}`)
    }
  }
}

// ============================================================================
// PAYMENT QUERY SERVICE (SRP)
// ============================================================================

export class PaymentQueryService implements IPaymentQueryService {
  private readonly db: Database.Database
  private readonly transactionRepo: PaymentTransactionRepository
  private readonly voidAuditRepo: VoidAuditRepository

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.transactionRepo = this.createTransactionRepository()
    this.voidAuditRepo = this.createVoidAuditRepository()
  }

  private createTransactionRepository(): PaymentTransactionRepository {
    return new PaymentTransactionRepository(this.db)
  }

  private createVoidAuditRepository(): VoidAuditRepository {
    return new VoidAuditRepository(this.db)
  }

  async getStudentPaymentHistory(studentId: number, limit = 50): Promise<PaymentTransaction[]> {
    return this.transactionRepo.getStudentHistory(studentId, limit)
  }

  async getVoidedTransactionsReport(startDate: string, endDate: string): Promise<VoidedTransaction[]> {
    return this.voidAuditRepo.getVoidReport(startDate, endDate)
  }

  async getPaymentApprovalQueue(role: string): Promise<ApprovalQueueItem[]> {
    const db = this.db
    return db.prepare(`
      SELECT ar.*, s.first_name as student_first_name, s.last_name as student_last_name
      FROM approval_request ar
      LEFT JOIN student s ON ar.reference_id LIKE CONCAT('PAYMENT_%_', s.id)
      WHERE ar.transaction_type = 'PAYMENT'
        AND ar.status IN ('PENDING', 'APPROVED_LEVEL_1')
        AND ar.current_approver_role = ?
      ORDER BY ar.requested_at ASC
    `).all(role) as ApprovalQueueItem[]
  }
}

// ============================================================================
// FACADE - SOLID-COMPLIANT INTERFACE
// ============================================================================



