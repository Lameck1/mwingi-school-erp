import { getDatabase } from '../../../database'
import { asSqlInList } from '../../../utils/financeTransactionTypes'
import { OUTSTANDING_INVOICE_STATUSES } from '../../../utils/financeTransactionTypes'

import type { Invoice, IPaymentValidator, ValidationResult } from '../PaymentService.types'
import type Database from 'better-sqlite3'

const PAYABLE_INVOICE_STATUSES_SQL = asSqlInList(OUTSTANDING_INVOICE_STATUSES)

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
