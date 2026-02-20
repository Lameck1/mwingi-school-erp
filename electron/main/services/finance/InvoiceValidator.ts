import { getDatabase } from '../../database'
import {
    buildFeeInvoiceOutstandingBalanceSql,
    buildFeeInvoiceOutstandingStatusPredicate
} from '../../utils/feeInvoiceSql'

import type {
    Invoice,
    IPaymentValidator,
    ValidationResult
} from './PaymentService.types'
import type Database from 'better-sqlite3'

export class InvoiceValidator implements IPaymentValidator {
    private readonly db: Database.Database
    private readonly invoiceOutstandingBalanceSql: string
    private readonly invoiceOutstandingStatusPredicate: string

    constructor(db?: Database.Database) {
        this.db = db || getDatabase()
        this.invoiceOutstandingBalanceSql = buildFeeInvoiceOutstandingBalanceSql(this.db, 'fi')
        this.invoiceOutstandingStatusPredicate = buildFeeInvoiceOutstandingStatusPredicate(this.db, 'fi')
    }

    validatePaymentAgainstInvoices(studentId: number, amount: number): ValidationResult {
        const db = this.db

        try {
            const invoices = db.prepare(`
        SELECT
          fi.*,
          ${this.invoiceOutstandingBalanceSql} as outstanding_balance
        FROM fee_invoice fi
        WHERE fi.student_id = ?
          AND ${this.invoiceOutstandingStatusPredicate}
          AND (${this.invoiceOutstandingBalanceSql}) > 0
        ORDER BY COALESCE(fi.due_date, fi.invoice_date, substr(fi.created_at, 1, 10)) ASC
      `).all(studentId) as Array<Invoice & { outstanding_balance: number }>

            if (invoices.length === 0) {
                return {
                    valid: true,
                    message: 'No outstanding invoices for this student',
                    invoices: []
                }
            }

            const totalOutstanding = invoices.reduce((sum, inv) => {
                return sum + Math.max(inv.outstanding_balance || 0, 0)
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
