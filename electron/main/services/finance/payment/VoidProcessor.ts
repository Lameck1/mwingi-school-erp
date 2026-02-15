import { randomUUID } from 'node:crypto'

import { getDatabase } from '../../../database'
import { logAudit } from '../../../database/utils/audit'
import { SchemaHelper } from '../../../database/utils/schema'
import { VoidAuditRepository } from './PaymentTransactionRepository'

import type { PaymentResult, PaymentTransaction, VoidPaymentData } from '../PaymentService.types'
import type Database from 'better-sqlite3'

export class VoidProcessor {
  private readonly db: Database.Database
  private readonly voidAuditRepo: VoidAuditRepository
  private readonly schemaHelper: SchemaHelper

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.voidAuditRepo = new VoidAuditRepository(this.db)
    this.schemaHelper = new SchemaHelper(this.db)
  }

  private hasSourceLedgerColumn(): boolean {
    return this.schemaHelper.columnExists('journal_entry', 'source_ledger_txn_id')
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

      // If no invoice specific linkage, assume it was an On Account payment
      // and return the full amount to be deducted from credit balance.
      const invoiceId = (transaction as unknown as { invoice_id: number | null }).invoice_id
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

        // Use Repository to record audit
        void this.voidAuditRepo.recordVoid({
          transactionId: data.transaction_id,
          studentId: transaction.student_id,
          amount: transaction.amount,
          description: transaction.description,
          voidReason: data.void_reason,
          voidedBy: data.voided_by,
          recoveryMethod: data.recovery_method
        })

        const creditedAmount = this.reversePaymentAllocations(transaction)
        this.reverseStudentCredit(transaction.student_id, creditedAmount, transaction.id)
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
    const reversalRef = `VOID-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomUUID().slice(0, 8)}`
    const result = this.db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, student_id, transaction_type, amount, debit_credit,
        transaction_date, description,
        payment_method, payment_reference, recorded_by_user_id, category_id,
        is_voided, voided_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reversalRef, transaction.student_id, 'REFUND', transaction.amount, 'DEBIT',
      new Date().toISOString().split('T')[0],
      `Void of transaction #${data.transaction_id}: ${data.void_reason}`,
      'CASH', `VOID_REF_${transaction.student_id}_${Date.now()}`,
      data.voided_by, categoryId, 0, data.void_reason
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
