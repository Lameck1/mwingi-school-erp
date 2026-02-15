import { randomUUID } from 'node:crypto'

import { getDatabase } from '../../../database'
import { logAudit } from '../../../database/utils/audit'
import { OUTSTANDING_INVOICE_STATUSES, asSqlInList } from '../../../utils/financeTransactionTypes'
import { DoubleEntryJournalService } from '../../accounting/DoubleEntryJournalService'

import type { PaymentData } from '../PaymentService.types'
import type Database from 'better-sqlite3'

const PAYABLE_INVOICE_STATUSES_SQL = asSqlInList(OUTSTANDING_INVOICE_STATUSES)

export class PaymentProcessor {
  private readonly db: Database.Database
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
