import { randomUUID } from 'node:crypto'

import { InvoiceValidator } from './InvoiceValidator'
import { PaymentTransactionRepository, VoidAuditRepository } from './PaymentRepositories'
import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'
import {
  buildFeeInvoiceAmountSql,
  buildFeeInvoiceOutstandingBalanceSql,
  buildFeeInvoiceOutstandingStatusPredicate
} from '../../utils/feeInvoiceSql'
import { OUTSTANDING_INVOICE_STATUSES } from '../../utils/financeTransactionTypes'
import { DoubleEntryJournalService } from '../accounting/DoubleEntryJournalService'

import type {
  ApprovalQueueItem,
  IPaymentQueryService,
  IPaymentVoidProcessor,
  PaymentData,
  PaymentResult,
  PaymentTransaction,
  VoidPaymentData,
  VoidedTransaction
} from './PaymentService.types'
import type Database from 'better-sqlite3'

export { InvoiceValidator, PaymentTransactionRepository, VoidAuditRepository }

const normalizeInvoiceStatus = (status: string | null | undefined): string => (status ?? 'PENDING').toUpperCase()



// ============================================================================
// REPOSITORY LAYER (SRP)
// ============================================================================


// ============================================================================
// PAYMENT PROCESSOR (SRP)
// ============================================================================

export class PaymentProcessor {
  private readonly db: Database.Database
  private readonly invoiceAmountSql: string
  private readonly invoiceAmountSqlForUpdate: string
  private readonly invoiceOutstandingBalanceSql: string
  private readonly invoiceOutstandingStatusPredicate: string
  private idempotencyColumnAvailable: boolean | null = null

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.invoiceAmountSql = buildFeeInvoiceAmountSql(this.db, 'fi')
    this.invoiceAmountSqlForUpdate = buildFeeInvoiceAmountSql(this.db, 'fee_invoice')
    this.invoiceOutstandingBalanceSql = buildFeeInvoiceOutstandingBalanceSql(this.db, 'fi')
    this.invoiceOutstandingStatusPredicate = buildFeeInvoiceOutstandingStatusPredicate(this.db, 'fi')
  }

  private hasIdempotencyColumn(): boolean {
    if (this.idempotencyColumnAvailable !== null) {
      return this.idempotencyColumnAvailable
    }
    const columns = this.db.prepare('PRAGMA table_info(ledger_transaction)').all() as Array<{ name: string }>
    this.idempotencyColumnAvailable = columns.some(column => column.name === 'idempotency_key')
    return this.idempotencyColumnAvailable
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
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const nonce = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()
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
    // Hard check: Table MUST exist. If not, this will throw, which is correct (Data Safeguard).
    this.db.prepare(`
      INSERT INTO payment_invoice_allocation (transaction_id, invoice_id, applied_amount)
      VALUES (?, ?, ?)
    `).run(transactionId, invoiceId, appliedAmount)
  }

  private applyPaymentToSpecificInvoice(transactionId: number, invoiceId: number, amount: number): number {
    const invoice = this.db.prepare(`
      SELECT
        ${this.invoiceAmountSql} as invoice_amount,
        COALESCE(fi.amount_paid, 0) as amount_paid,
        COALESCE(fi.status, 'PENDING') as status
      FROM fee_invoice fi
      WHERE id = ?
    `).get(invoiceId) as { invoice_amount: number; amount_paid: number; status: string } | undefined

    if (
      !invoice ||
      !OUTSTANDING_INVOICE_STATUSES.includes(
        normalizeInvoiceStatus(invoice.status) as (typeof OUTSTANDING_INVOICE_STATUSES)[number]
      )
    ) {
      return amount
    }

    const outstanding = Math.max(0, invoice.invoice_amount - (invoice.amount_paid || 0))
    const appliedAmount = Math.min(amount, outstanding)
    const remainingAmount = amount - appliedAmount

    if (appliedAmount > 0) {
      this.db.prepare(`
        UPDATE fee_invoice
        SET amount_paid = COALESCE(amount_paid, 0) + ?,
            status = CASE
                WHEN COALESCE(amount_paid, 0) + ? >= (${this.invoiceAmountSqlForUpdate}) THEN 'PAID'
                WHEN COALESCE(amount_paid, 0) + ? <= 0 THEN 'PENDING'
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
      SELECT
        fi.id,
        ${this.invoiceOutstandingBalanceSql} as outstanding_balance
      FROM fee_invoice fi
      WHERE fi.student_id = ?
        AND ${this.invoiceOutstandingStatusPredicate}
        AND (${this.invoiceOutstandingBalanceSql}) > 0
      ORDER BY COALESCE(fi.invoice_date, fi.due_date, substr(fi.created_at, 1, 10)) ASC
    `).all(studentId) as Array<{ id: number; outstanding_balance: number }>

    const updateInvoiceStatement = this.db.prepare(`
      UPDATE fee_invoice
      SET amount_paid = COALESCE(amount_paid, 0) + ?,
          status = CASE
            WHEN COALESCE(amount_paid, 0) + ? >= (${this.invoiceAmountSqlForUpdate}) THEN 'PAID'
            WHEN COALESCE(amount_paid, 0) + ? <= 0 THEN 'PENDING'
            ELSE 'PARTIAL'
          END
      WHERE id = ?
    `)

    for (const invoice of pendingInvoices) {
      if (remainingAmount <= 0) {
        break
      }

      const outstanding = Math.max(0, invoice.outstanding_balance || 0)
      if (outstanding <= 0) {
        continue
      }
      const appliedAmount = Math.min(remainingAmount, outstanding)

      updateInvoiceStatement.run(appliedAmount, appliedAmount, appliedAmount, invoice.id)
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
      // Phase 3: Priority Allocation
      remainingAmount = this.applyPaymentAcrossOutstandingInvoicesPriority(transactionId, data.student_id, data.amount)
    }

    if (remainingAmount > 0) {
      this.db.prepare(`
        UPDATE student
        SET credit_balance = COALESCE(credit_balance, 0) + ?
        WHERE id = ?
      `).run(remainingAmount, data.student_id)

      this.db.prepare(`
        INSERT INTO credit_transaction (student_id, amount, transaction_type, notes, created_at)
        VALUES (?, ?, 'CREDIT_RECEIVED', ?, CURRENT_TIMESTAMP)
      `).run(
        data.student_id,
        remainingAmount,
        `Overpayment from transaction #${transactionId}`
      )
    }
  }

  private applyPaymentAcrossOutstandingInvoicesPriority(transactionId: number, studentId: number, paymentAmount: number): number {
    let remainingAmount = paymentAmount
    const pendingInvoices = this.db.prepare(`
      SELECT
        fi.id,
        fc.priority as category_priority,
        ${this.invoiceOutstandingBalanceSql} as outstanding_balance
      FROM fee_invoice fi
      LEFT JOIN fee_category fc ON fi.category_id = fc.id
      WHERE fi.student_id = ?
        AND ${this.invoiceOutstandingStatusPredicate}
        AND (${this.invoiceOutstandingBalanceSql}) > 0
      ORDER BY 
        COALESCE(fc.priority, 99) ASC,
        COALESCE(fi.invoice_date, fi.due_date) ASC,
        fi.id ASC
    `).all(studentId) as Array<{ id: number; outstanding_balance: number }>

    const updateInvoiceStatement = this.db.prepare(`
      UPDATE fee_invoice
      SET amount_paid = COALESCE(amount_paid, 0) + ?,
          status = CASE
            WHEN COALESCE(amount_paid, 0) + ? >= (${this.invoiceAmountSqlForUpdate}) THEN 'PAID'
            WHEN COALESCE(amount_paid, 0) + ? <= 0 THEN 'PENDING'
            ELSE 'PARTIAL'
          END
      WHERE id = ?
    `)

    for (const invoice of pendingInvoices) {
      if (remainingAmount <= 0) { break }

      const outstanding = Math.max(0, invoice.outstanding_balance || 0)
      if (outstanding <= 0) { continue }
      const appliedAmount = Math.min(remainingAmount, outstanding)

      updateInvoiceStatement.run(appliedAmount, appliedAmount, appliedAmount, invoice.id)
      this.recordPaymentAllocation(transactionId, invoice.id, appliedAmount)
      remainingAmount -= appliedAmount
    }

    return remainingAmount
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
  private readonly invoiceAmountSql: string
  private readonly invoiceAmountSqlForUpdate: string
  private sourceLedgerColumnAvailable: boolean | null = null

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.invoiceAmountSql = buildFeeInvoiceAmountSql(this.db, 'fi')
    this.invoiceAmountSqlForUpdate = buildFeeInvoiceAmountSql(this.db, 'fee_invoice')
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
    return this.db.prepare(`
      SELECT invoice_id, applied_amount
      FROM payment_invoice_allocation
      WHERE transaction_id = ?
      ORDER BY id ASC
    `).all(transactionId) as Array<{ invoice_id: number; applied_amount: number }>
  }

  private reverseInvoiceAllocation(invoiceId: number, appliedAmount: number): void {
    const invoice = this.db.prepare(`
      SELECT
        ${this.invoiceAmountSql} as invoice_amount,
        COALESCE(fi.amount_paid, 0) as amount_paid
      FROM fee_invoice fi
      WHERE id = ?
    `).get(invoiceId) as { invoice_amount: number; amount_paid: number } | undefined

    if (!invoice) {
      return
    }

    const newPaid = Math.max(0, (invoice.amount_paid || 0) - appliedAmount)
    const status = newPaid <= 0 ? 'PENDING' : (newPaid >= invoice.invoice_amount ? 'PAID' : 'PARTIAL')

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

      // If no invoice specific linkage, assume it was an On Account payment
      // and return the full amount to be deducted from credit balance.
      const invoiceId = transaction.invoice_id
      if (!invoiceId) {
        return transaction.amount
      }
      return 0
    }

    let totalApplied = 0
    for (const allocation of allocations) {
      this.reverseInvoiceAllocation(allocation.invoice_id, allocation.applied_amount)
      totalApplied += allocation.applied_amount
    }

    return Math.max(0, transaction.amount - totalApplied)
  }

  private reverseStudentCredit(studentId: number, creditAmount: number, transactionId: number): void {
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

    this.db.prepare(`
      INSERT INTO credit_transaction (student_id, amount, transaction_type, notes, created_at)
      VALUES (?, ?, 'CREDIT_REFUNDED', ?, CURRENT_TIMESTAMP)
    `).run(
      studentId,
      decrement,
      `Void reversal of transaction #${transactionId}`
    )
  }

  private async voidLinkedJournalEntries(transactionId: number, data: VoidPaymentData): Promise<void> {
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

    const journalService = new DoubleEntryJournalService(this.db)
    for (const entry of linkedEntries) {
      // Use the canonical service to ensure reversing entries are created
      await journalService.voidJournalEntry(
        entry.id,
        `Payment void #${transactionId}: ${data.void_reason}`,
        data.voided_by
      )
    }
  }

  async voidPayment(data: VoidPaymentData): Promise<PaymentResult> {
    try {
      const transactionResult = this.db.transaction(async () => {
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

        const categoryId = transaction.category_id || 1

        const reversalId = this.createReversalTransaction(transaction, data, categoryId)
        this.markTransactionVoided(data)
        this.recordVoidAudit(transaction, data)
        const creditedAmount = this.reversePaymentAllocations(transaction)
        this.reverseStudentCredit(transaction.student_id, creditedAmount, transaction.id)

        await this.voidLinkedJournalEntries(transaction.id, data)

        logAudit(data.voided_by, 'VOID', 'ledger_transaction', reversalId, null,
          { original_transaction_id: data.transaction_id, void_reason: data.void_reason })

        return {
          success: true,
          message: `Payment voided successfully. Reversal transaction: #${reversalId}`,
          transaction_id: reversalId
        }
      })

      return await transactionResult()
    } catch (error) {
      throw new Error(`Failed to void payment: ${(error as Error).message}`)
    }
  }

  private createReversalTransaction(transaction: PaymentTransaction, data: VoidPaymentData, categoryId: number): number {
    const reversalRef = `VOID-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomUUID().slice(0, 8)}`

    // Phase 3: Dynamic Payment Method for Refunds
    const paymentMethod = transaction.payment_method || 'CASH'
    const paymentRef = `VOID_REF_${transaction.student_id}_${Date.now()}`

    const result = this.db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, student_id, transaction_type, amount, debit_credit,
        transaction_date, description,
        payment_method, payment_reference, recorded_by_user_id, category_id,
        is_voided, voided_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reversalRef,
      transaction.student_id,
      'REFUND',
      transaction.amount,
      'DEBIT',
      new Date().toISOString().split('T')[0],
      `Void of transaction #${data.transaction_id}: ${data.void_reason}`,
      paymentMethod,
      paymentRef,
      data.voided_by,
      categoryId,
      0,
      data.void_reason
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
    const hasApprovalCol = (this.db.prepare(`PRAGMA table_info(void_audit)`).all() as Array<{ name: string }>).some(c => c.name === 'approval_request_id')
    if (hasApprovalCol) {
      this.db.prepare(`
        INSERT INTO void_audit (
          transaction_id, transaction_type, original_amount, student_id, description,
          void_reason, voided_by, voided_at, recovered_method, recovered_by, recovered_at, approval_request_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.transaction_id, 'PAYMENT', transaction.amount, transaction.student_id,
        transaction.description, data.void_reason, data.voided_by,
        new Date().toISOString(), data.recovery_method || null, null, null,
        data.approval_request_id || null
      )
    } else {
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
  }

  private reverseInvoiceApplication(transaction: PaymentTransaction): void {
    const invoiceId = transaction.invoice_id
    if (invoiceId) {
      this.db.prepare(`
        UPDATE fee_invoice
        SET amount_paid = MAX(COALESCE(amount_paid, 0) - ?, 0),
            status = CASE
                WHEN MAX(COALESCE(amount_paid, 0) - ?, 0) <= 0 THEN 'PENDING'
                WHEN MAX(COALESCE(amount_paid, 0) - ?, 0) >= (${this.invoiceAmountSqlForUpdate}) THEN 'PAID'
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

  async getPaymentApprovalQueue(_role: string): Promise<ApprovalQueueItem[]> {
    const db = this.db
    return db.prepare(`
      SELECT ar.*, 
        lt.student_id,
        s.first_name as student_first_name, 
        s.last_name as student_last_name
      FROM approval_request ar
      LEFT JOIN ledger_transaction lt ON ar.entity_id = lt.id AND ar.entity_type = 'PAYMENT'
      LEFT JOIN student s ON lt.student_id = s.id
      WHERE ar.entity_type = 'PAYMENT'
        AND ar.status = 'PENDING'
      ORDER BY ar.created_at ASC
    `).all() as ApprovalQueueItem[]
  }
}

// ============================================================================
// FACADE - SOLID-COMPLIANT INTERFACE
// ============================================================================



