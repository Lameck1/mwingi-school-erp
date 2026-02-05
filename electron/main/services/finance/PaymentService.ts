import Database from 'better-sqlite3-multiple-ciphers'
import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

// ============================================================================
// SEGREGATED INTERFACES (ISP)
// ============================================================================

export interface IPaymentRecorder {
  recordPayment(data: PaymentData): Promise<PaymentResult>
}

export interface IPaymentVoidProcessor {
  voidPayment(data: VoidPaymentData): Promise<PaymentResult>
}

export interface IPaymentValidator {
  validatePaymentAgainstInvoices(studentId: number, amount: number): Promise<ValidationResult>
}

export interface IPaymentQueryService {
  getStudentPaymentHistory(studentId: number, limit?: number): Promise<PaymentTransaction[]>
  getVoidedTransactionsReport(startDate: string, endDate: string): Promise<VoidedTransaction[]>
  getPaymentApprovalQueue(role: string): Promise<ApprovalQueueItem[]>
}

export interface PaymentData {
  student_id: number
  amount: number
  transaction_date: string // Renamed from payment_date to match handler
  payment_method: string
  payment_reference: string // Renamed from reference
  description?: string
  recorded_by_user_id: number // Renamed from recorded_by
  invoice_id?: number
  cheque_number?: string
  bank_name?: string
  amount_in_words?: string
  term_id: number
}

export interface PaymentResult {
  success: boolean
  message: string
  transaction_id?: number
  transactionRef?: string
  receiptNumber?: string
  approval_request_id?: number
  requires_approval?: boolean
}

export interface VoidPaymentData {
  transaction_id: number
  void_reason: string
  voided_by: number
  recovery_method?: string
}

export interface ValidationResult {
  valid: boolean
  message: string
  invoices?: Invoice[]
}

export interface PaymentTransaction {
  id: number
  student_id: number
  amount: number
  transaction_date: string
  payment_method: string
  reference: string
  description: string
}

export interface VoidedTransaction {
  id: number
  transaction_id: number
  student_id: number
  amount: number
  void_reason: string
  voided_by: number
  voided_at: string
}

export interface ApprovalQueueItem {
  id: number
  student_id: number
  amount: number
  status: string
}

export interface Invoice {
  id: number
  student_id: number
  amount: number
  status: string
}

// ============================================================================
// REPOSITORY LAYER (SRP)
// ============================================================================

class PaymentTransactionRepository {
  private db: Database.Database

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

class VoidAuditRepository {
  private db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  async recordVoid(transactionId: number, studentId: number, amount: number, description: string, voidReason: string, voidedBy: number, recoveryMethod?: string): Promise<number> {
    const db = this.db
    const result = db.prepare(`
      INSERT INTO void_audit (
        transaction_id, transaction_type, original_amount, student_id, description,
        void_reason, voided_by, voided_at, recovered_method, recovered_by, recovered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      transactionId,
      'PAYMENT',
      amount,
      studentId,
      description,
      voidReason,
      voidedBy,
      new Date().toISOString(),
      recoveryMethod || null,
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

class InvoiceValidator implements IPaymentValidator {
  private db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  async validatePaymentAgainstInvoices(studentId: number, amount: number): Promise<ValidationResult> {
    const db = this.db

    try {
      const invoices = db.prepare(`
        SELECT * FROM fee_invoice
        WHERE student_id = ? AND status = 'OUTSTANDING'
        ORDER BY due_date ASC
      `).all(studentId) as Invoice[]

      if (!invoices || invoices.length === 0) {
        return {
          valid: true,
          message: 'No outstanding invoices for this student',
          invoices: []
        }
      }

      const totalOutstanding = invoices.reduce((sum, inv) => sum + inv.amount, 0)

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

class PaymentProcessor {
  private db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  async processPayment(data: PaymentData): Promise<{ transactionId: number; transactionRef: string; receiptNumber: string }> {
    const db = this.db

    // 1. Transaction & Receipt Refs
    const txnRef = `TXN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-6)}`
    const rcpNum = `RCP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-6)}`
    const description = data.description || 'Tuition Fee Payment'

    // 2. Insert Transaction
    const txnStmt = db.prepare(`INSERT INTO ledger_transaction (
      transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
      student_id, payment_method, payment_reference, description, term_id, recorded_by_user_id, invoice_id
    ) VALUES (?, ?, 'FEE_PAYMENT', (SELECT id FROM transaction_category WHERE category_name = 'School Fees'), ?, 'CREDIT', ?, ?, ?, ?, ?, ?, ?)`)

    const txnResult = txnStmt.run(
      txnRef, data.transaction_date, data.amount, data.student_id,
      data.payment_method, data.payment_reference, description,
      data.term_id, data.recorded_by_user_id, data.invoice_id || null
    )
    const transactionId = txnResult.lastInsertRowid as number

    // 3. Create Receipt
    const rcpStmt = db.prepare(`INSERT INTO receipt (
      receipt_number, transaction_id, receipt_date, student_id, amount,
      amount_in_words, payment_method, payment_reference, created_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)

    rcpStmt.run(rcpNum, transactionId, data.transaction_date, data.student_id,
      data.amount, data.amount_in_words || '', data.payment_method, data.payment_reference, data.recorded_by_user_id)

    // 4. Update Invoices
    let remainingAmount = data.amount

    if (data.invoice_id) {
      const inv = db.prepare('SELECT total_amount, amount_paid FROM fee_invoice WHERE id = ?').get(data.invoice_id) as { total_amount: number; amount_paid: number } | undefined
      if (inv) {
        db.prepare(`UPDATE fee_invoice SET amount_paid = amount_paid + ?, 
                status = CASE WHEN amount_paid + ? >= total_amount THEN 'PAID' ELSE 'PARTIAL' END 
                WHERE id = ?`).run(data.amount, data.amount, data.invoice_id)
      }
    } else {
      const pendingInvoices = db.prepare(`
            SELECT id, total_amount, amount_paid 
            FROM fee_invoice 
            WHERE student_id = ? AND status != 'PAID'
            ORDER BY invoice_date ASC
        `).all(data.student_id) as Array<{ id: number; total_amount: number; amount_paid: number }>

      const updateInvStmt = db.prepare(`
            UPDATE fee_invoice 
            SET amount_paid = amount_paid + ?, 
                status = CASE WHEN amount_paid + ? >= total_amount THEN 'PAID' ELSE 'PARTIAL' END 
            WHERE id = ?
        `)

      for (const inv of pendingInvoices) {
        if (remainingAmount <= 0) break

        const outstanding = inv.total_amount - (inv.amount_paid || 0)
        const payAmount = Math.min(remainingAmount, outstanding)

        updateInvStmt.run(payAmount, payAmount, inv.id)
        remainingAmount -= payAmount
      }

      // 5. Update Credit Balance (if any remaining)
      if (remainingAmount > 0) {
        db.prepare('UPDATE student SET credit_balance = COALESCE(credit_balance, 0) + ? WHERE id = ?').run(remainingAmount, data.student_id)
      }
    }

    // 6. Audit Log
    logAudit(
      data.recorded_by_user_id,
      'CREATE',
      'ledger_transaction',
      transactionId,
      null,
      { amount: data.amount, student_id: data.student_id, payment_method: data.payment_method, txnRef, rcpNum }
    )

    return { transactionId, transactionRef: txnRef, receiptNumber: rcpNum }
  }
}

// ============================================================================
// VOID PROCESSOR (SRP)
// ============================================================================

class VoidProcessor implements IPaymentVoidProcessor {
  private db: Database.Database
  private transactionRepo: PaymentTransactionRepository
  private voidAuditRepo: VoidAuditRepository

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

      await this.voidAuditRepo.recordVoid(
        data.transaction_id,
        transaction.student_id,
        transaction.amount,
        transaction.description,
        data.void_reason,
        data.voided_by,
        data.recovery_method
      )

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

class PaymentQueryService implements IPaymentQueryService {
  private db: Database.Database
  private transactionRepo: PaymentTransactionRepository
  private voidAuditRepo: VoidAuditRepository

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.transactionRepo = new PaymentTransactionRepository(this.db)
    this.voidAuditRepo = new VoidAuditRepository(this.db)
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

export class PaymentService implements IPaymentRecorder, IPaymentVoidProcessor, IPaymentValidator, IPaymentQueryService {
  private db: Database.Database
  private readonly processor: PaymentProcessor
  private readonly voidProcessor: VoidProcessor
  private readonly validator: InvoiceValidator
  private readonly queryService: PaymentQueryService

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.processor = new PaymentProcessor(this.db)
    this.voidProcessor = new VoidProcessor(this.db)
    this.validator = new InvoiceValidator(this.db)
    this.queryService = new PaymentQueryService(this.db)
  }

  async recordPayment(data: PaymentData): Promise<PaymentResult> {
    try {
      const validation = await this.validator.validatePaymentAgainstInvoices(data.student_id, data.amount)
      if (!validation.valid) {
        return {
          success: false,
          message: validation.message
        }
      }

      const result = await this.processor.processPayment(data)

      return {
        success: true,
        message: `Payment recorded successfully`,
        transaction_id: result.transactionId,
        transactionRef: result.transactionRef,
        receiptNumber: result.receiptNumber
      }
    } catch (error) {
      throw new Error(`Failed to record payment: ${(error as Error).message}`)
    }
  }

  async voidPayment(data: VoidPaymentData): Promise<PaymentResult> {
    return this.voidProcessor.voidPayment(data)
  }

  async validatePaymentAgainstInvoices(studentId: number, amount: number): Promise<ValidationResult> {
    return this.validator.validatePaymentAgainstInvoices(studentId, amount)
  }

  async getStudentPaymentHistory(studentId: number, limit = 50): Promise<PaymentTransaction[]> {
    return this.queryService.getStudentPaymentHistory(studentId, limit)
  }

  async getVoidedTransactionsReport(startDate: string, endDate: string): Promise<VoidedTransaction[]> {
    return this.queryService.getVoidedTransactionsReport(startDate, endDate)
  }

  async getPaymentApprovalQueue(role: string): Promise<ApprovalQueueItem[]> {
    return this.queryService.getPaymentApprovalQueue(role)
  }
}
