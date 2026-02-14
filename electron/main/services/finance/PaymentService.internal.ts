
import { randomUUID } from 'node:crypto'

import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'
import { OUTSTANDING_INVOICE_STATUSES, asSqlInList } from '../../utils/financeTransactionTypes'
import { DoubleEntryJournalService } from '../accounting/DoubleEntryJournalService'

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

const PAYABLE_INVOICE_STATUSES_SQL = asSqlInList(OUTSTANDING_INVOICE_STATUSES)

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
    const transactionRef = `TXN-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8)}`
    const result = db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, student_id, transaction_type, amount, debit_credit,
        transaction_date, description,
        payment_method, payment_reference, recorded_by_user_id, category_id, term_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      transactionRef,
      data.student_id,
      'FEE_PAYMENT',
      data.amount,
      'CREDIT',
      data.transaction_date,
      data.description || `Payment received: ${data.payment_reference}`,
      data.payment_method,
      data.payment_reference,
      data.recorded_by_user_id,
      1, // default category; callers should resolve properly
      data.term_id
    )
    return result.lastInsertRowid as number
  }

  async createReversal(studentId: number, originalAmount: number, voidReason: string, voidedBy: number, categoryId: number): Promise<number> {
    const db = this.db
    const reversalRef = `VOID-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8)}`
    const result = db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, student_id, transaction_type, amount, debit_credit,
        transaction_date, description,
        payment_method, payment_reference, recorded_by_user_id, category_id,
        is_voided, voided_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reversalRef,
      studentId,
      'REFUND',
      -originalAmount,
      'DEBIT',
      new Date().toISOString().split('T')[0],
      `Void of transaction: ${voidReason}`,
      'CASH',
      `VOID_REF_${studentId}_${Date.now()}`,
      voidedBy,
      categoryId,
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
      WHERE student_id = ?
        AND transaction_type = 'FEE_PAYMENT'
        AND is_voided = 0
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
        WHERE student_id = ? AND status IN (${PAYABLE_INVOICE_STATUSES_SQL})
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
  private allocationTableAvailable: boolean | null = null
  private idempotencyColumnAvailable: boolean | null = null

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  private hasIdempotencyColumn(): boolean {
    if (this.idempotencyColumnAvailable !== null) {
      return this.idempotencyColumnAvailable
    }
    const columns = this.db.prepare('PRAGMA table_info(ledger_transaction)').all() as Array<{ name: string }>
    this.idempotencyColumnAvailable = columns.some(column => column.name === 'idempotency_key')
    return this.idempotencyColumnAvailable
  }

  private hasAllocationTable(): boolean {
    if (this.allocationTableAvailable !== null) {
      return this.allocationTableAvailable
    }
    const table = this.db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'payment_invoice_allocation'
      LIMIT 1
    `).get() as { name: string } | undefined
    this.allocationTableAvailable = !!table
    return this.allocationTableAvailable
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
    const hasIdempotency = this.hasIdempotencyColumn()
    const statement = hasIdempotency
      ? this.db.prepare(`
          INSERT INTO ledger_transaction (
            transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
            student_id, payment_method, payment_reference, description, term_id, recorded_by_user_id, invoice_id,
            idempotency_key
          )
          VALUES (?, ?, 'FEE_PAYMENT', ?, ?, 'CREDIT', ?, ?, ?, ?, ?, ?, ?, ?)
        `)
      : this.db.prepare(`
          INSERT INTO ledger_transaction (
            transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
            student_id, payment_method, payment_reference, description, term_id, recorded_by_user_id, invoice_id
          )
          VALUES (?, ?, 'FEE_PAYMENT', ?, ?, 'CREDIT', ?, ?, ?, ?, ?, ?, ?)
        `)

    const result = hasIdempotency
      ? statement.run(
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
          data.invoice_id || null,
          data.idempotency_key || null
        )
      : statement.run(
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

  private recordPaymentAllocation(transactionId: number, invoiceId: number, appliedAmount: number): void {
    if (appliedAmount <= 0) {
      return
    }
    if (!this.hasAllocationTable()) {
      return
    }
    this.db.prepare(`
      INSERT INTO payment_invoice_allocation (transaction_id, invoice_id, applied_amount)
      VALUES (?, ?, ?)
    `).run(transactionId, invoiceId, appliedAmount)
  }

  private applyPaymentToSpecificInvoice(transactionId: number, invoiceId: number, amount: number): number {
    const invoice = this.db.prepare(`
      SELECT total_amount, amount_paid, status
      FROM fee_invoice
      WHERE id = ?
    `).get(invoiceId) as { total_amount: number; amount_paid: number; status: string } | undefined

    if (
      !invoice ||
      !OUTSTANDING_INVOICE_STATUSES.includes(invoice.status as (typeof OUTSTANDING_INVOICE_STATUSES)[number])
    ) {
      return amount
    }

    const outstanding = Math.max(0, invoice.total_amount - (invoice.amount_paid || 0))
    const appliedAmount = Math.min(amount, outstanding)
    const remainingAmount = amount - appliedAmount

    if (appliedAmount > 0) {
      this.db.prepare(`
        UPDATE fee_invoice
        SET amount_paid = amount_paid + ?,
            status = CASE
                WHEN amount_paid + ? >= total_amount THEN 'PAID'
                WHEN amount_paid + ? <= 0 THEN 'PENDING'
                ELSE 'PARTIAL'
            END
        WHERE id = ?
      `).run(appliedAmount, appliedAmount, appliedAmount, invoiceId)
      this.recordPaymentAllocation(transactionId, invoiceId, appliedAmount)
    }

    return remainingAmount
  }

  private applyPaymentAcrossOutstandingInvoices(transactionId: number, studentId: number, paymentAmount: number): number {
    let remainingAmount = paymentAmount
    const pendingInvoices = this.db.prepare(`
      SELECT id, total_amount, amount_paid
      FROM fee_invoice
      WHERE student_id = ? AND status IN (${PAYABLE_INVOICE_STATUSES_SQL})
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
      this.recordPaymentAllocation(transactionId, invoice.id, appliedAmount)
      remainingAmount -= appliedAmount
    }

    return remainingAmount
  }

  private applyInvoiceAndCreditUpdates(data: PaymentData, transactionId: number): void {
    let remainingAmount = data.amount

    if (data.invoice_id) {
      remainingAmount = this.applyPaymentToSpecificInvoice(transactionId, data.invoice_id, data.amount)
    } else {
      remainingAmount = this.applyPaymentAcrossOutstandingInvoices(transactionId, data.student_id, data.amount)
    }

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
    this.applyInvoiceAndCreditUpdates(data, transactionId)
    this.logPaymentAudit(data, transactionId, transactionRef, receiptNumber)

    // Create corresponding journal entry for GL reporting and fail fast on mismatch.
    const journalService = new DoubleEntryJournalService(this.db)
    const journalResult = journalService.recordPaymentSync(
      data.student_id,
      data.amount,
      data.payment_method,
      data.payment_reference,
      data.transaction_date,
      data.recorded_by_user_id,
      transactionId
    )
    if (!journalResult.success) {
      throw new Error(journalResult.error || 'Failed to create journal entry for payment')
    }

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
  private allocationTableAvailable: boolean | null = null
  private sourceLedgerColumnAvailable: boolean | null = null

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.transactionRepo = new PaymentTransactionRepository(this.db)
    this.voidAuditRepo = new VoidAuditRepository(this.db)
  }

  private hasAllocationTable(): boolean {
    if (this.allocationTableAvailable !== null) {
      return this.allocationTableAvailable
    }
    const table = this.db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'payment_invoice_allocation'
      LIMIT 1
    `).get() as { name: string } | undefined
    this.allocationTableAvailable = !!table
    return this.allocationTableAvailable
  }

  private hasSourceLedgerColumn(): boolean {
    if (this.sourceLedgerColumnAvailable !== null) {
      return this.sourceLedgerColumnAvailable
    }
    const columns = this.db.prepare('PRAGMA table_info(journal_entry)').all() as Array<{ name: string }>
    this.sourceLedgerColumnAvailable = columns.some(column => column.name === 'source_ledger_txn_id')
    return this.sourceLedgerColumnAvailable
  }

  private getPaymentAllocations(transactionId: number): Array<{ invoice_id: number; applied_amount: number }> {
    if (!this.hasAllocationTable()) {
      return []
    }
    return this.db.prepare(`
      SELECT invoice_id, applied_amount
      FROM payment_invoice_allocation
      WHERE transaction_id = ?
      ORDER BY id ASC
    `).all(transactionId) as Array<{ invoice_id: number; applied_amount: number }>
  }

  private reverseInvoiceAllocation(invoiceId: number, appliedAmount: number): void {
    const invoice = this.db.prepare(`
      SELECT total_amount, amount_paid
      FROM fee_invoice
      WHERE id = ?
    `).get(invoiceId) as { total_amount: number; amount_paid: number } | undefined

    if (!invoice) {
      return
    }

    const newPaid = Math.max(0, (invoice.amount_paid || 0) - appliedAmount)
    const status = newPaid <= 0 ? 'PENDING' : (newPaid >= invoice.total_amount ? 'PAID' : 'PARTIAL')

    this.db.prepare(`
      UPDATE fee_invoice
      SET amount_paid = ?, status = ?
      WHERE id = ?
    `).run(newPaid, status, invoiceId)
  }

  private reversePaymentAllocations(transaction: PaymentTransaction): number {
    const allocations = this.getPaymentAllocations(transaction.id)
    if (allocations.length === 0) {
      this.reverseInvoiceApplication(transaction)
      return 0
    }

    let totalApplied = 0
    for (const allocation of allocations) {
      this.reverseInvoiceAllocation(allocation.invoice_id, allocation.applied_amount)
      totalApplied += allocation.applied_amount
    }

    return Math.max(0, transaction.amount - totalApplied)
  }

  private reverseStudentCredit(studentId: number, creditAmount: number): void {
    if (creditAmount <= 0) {
      return
    }

    const student = this.db.prepare(`SELECT credit_balance FROM student WHERE id = ?`).get(studentId) as { credit_balance: number } | undefined
    const currentCredit = student?.credit_balance || 0
    const decrement = Math.min(currentCredit, creditAmount)
    if (decrement <= 0) {
      return
    }

    this.db.prepare(`UPDATE student SET credit_balance = credit_balance - ? WHERE id = ?`).run(decrement, studentId)
  }

  private voidLinkedJournalEntries(transactionId: number, data: VoidPaymentData): void {
    if (!this.hasSourceLedgerColumn()) {
      return
    }

    const linkedEntries = this.db.prepare(`
      SELECT id
      FROM journal_entry
      WHERE source_ledger_txn_id = ?
        AND is_voided = 0
    `).all(transactionId) as Array<{ id: number }>

    if (linkedEntries.length === 0) {
      return
    }

    const updateLinkedEntry = this.db.prepare(`
      UPDATE journal_entry
      SET
        is_voided = 1,
        voided_reason = ?,
        voided_by_user_id = ?,
        voided_at = CURRENT_TIMESTAMP,
        approval_status = CASE WHEN approval_status = 'PENDING' THEN 'REJECTED' ELSE approval_status END
      WHERE id = ?
        AND is_voided = 0
    `)

    for (const entry of linkedEntries) {
      updateLinkedEntry.run(
        `Payment void #${transactionId}: ${data.void_reason}`,
        data.voided_by,
        entry.id
      )

      logAudit(data.voided_by, 'VOID', 'journal_entry', entry.id, null, {
        source_ledger_txn_id: transactionId,
        void_reason: data.void_reason
      })
    }
  }

  async voidPayment(data: VoidPaymentData): Promise<PaymentResult> {
    try {
      const run = this.db.transaction(() => {
        const transaction = this.db.prepare(`
          SELECT * FROM ledger_transaction
          WHERE id = ? AND is_voided = 0
        `).get(data.transaction_id) as PaymentTransaction | null

        if (!transaction) {
          return {
            success: false,
            message: 'Transaction not found or already voided'
          }
        }

        // Resolve category for reversal entry
        const categoryId = (transaction as unknown as { category_id: number }).category_id || 1

        const reversalId = this.createReversalTransaction(transaction, data, categoryId)
        this.markTransactionVoided(data)
        this.recordVoidAudit(transaction, data)
        const creditedAmount = this.reversePaymentAllocations(transaction)
        this.reverseStudentCredit(transaction.student_id, creditedAmount)
        this.voidLinkedJournalEntries(transaction.id, data)

        logAudit(data.voided_by, 'VOID', 'ledger_transaction', reversalId, null,
          { original_transaction_id: data.transaction_id, void_reason: data.void_reason })

        return {
          success: true,
          message: `Payment voided successfully. Reversal transaction: #${reversalId}`,
          transaction_id: reversalId
        }
      })

      return run()
    } catch (error) {
      throw new Error(`Failed to void payment: ${(error as Error).message}`)
    }
  }

  private createReversalTransaction(transaction: PaymentTransaction, data: VoidPaymentData, categoryId: number): number {
    const reversalRef = `VOID-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8)}`
    const result = this.db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, student_id, transaction_type, amount, debit_credit,
        transaction_date, description,
        payment_method, payment_reference, recorded_by_user_id, category_id,
        is_voided, voided_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reversalRef, transaction.student_id, 'REFUND', -transaction.amount, 'DEBIT',
      new Date().toISOString().split('T')[0],
      `Void of transaction #${data.transaction_id}: ${data.void_reason}`,
      'CASH', `VOID_REF_${transaction.student_id}_${Date.now()}`,
      data.voided_by, categoryId, 1, data.void_reason
    )
    return result.lastInsertRowid as number
  }

  private markTransactionVoided(data: VoidPaymentData): void {
    const result = this.db.prepare(`
      UPDATE ledger_transaction SET is_voided = 1, voided_reason = ?, voided_by_user_id = ?, voided_at = CURRENT_TIMESTAMP
      WHERE id = ? AND is_voided = 0
    `).run(data.void_reason, data.voided_by, data.transaction_id)
    if (result.changes === 0) {
      throw new Error('Transaction was already voided')
    }
  }

  private recordVoidAudit(transaction: PaymentTransaction, data: VoidPaymentData): void {
    this.db.prepare(`
      INSERT INTO void_audit (
        transaction_id, transaction_type, original_amount, student_id, description,
        void_reason, voided_by, voided_at, recovered_method, recovered_by, recovered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.transaction_id, 'PAYMENT', transaction.amount, transaction.student_id,
      transaction.description, data.void_reason, data.voided_by,
      new Date().toISOString(), data.recovery_method || null, null, null
    )
  }

  private reverseInvoiceApplication(transaction: PaymentTransaction): void {
    const invoiceId = (transaction as unknown as { invoice_id: number | null }).invoice_id
    if (invoiceId) {
      this.db.prepare(`
        UPDATE fee_invoice
        SET amount_paid = MAX(amount_paid - ?, 0),
            status = CASE
                WHEN MAX(amount_paid - ?, 0) <= 0 THEN 'PENDING'
                WHEN MAX(amount_paid - ?, 0) >= total_amount THEN 'PAID'
                ELSE 'PARTIAL'
            END
        WHERE id = ?
      `).run(transaction.amount, transaction.amount, transaction.amount, invoiceId)
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
      LEFT JOIN student s ON ar.reference_id LIKE ('PAYMENT_%_' || s.id)
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



