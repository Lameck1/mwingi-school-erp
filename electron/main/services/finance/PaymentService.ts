import { BaseService } from '../base/BaseService'
import { getDatabase } from '../../database'

export interface PaymentData {
    student_id: number
    invoice_id: number // Optional? No, payment usually against invoice
    amount: number
    payment_method: string
    payment_reference?: string
    transaction_date: string
}

export class PaymentService extends BaseService<unknown, PaymentData> {
    protected tableName = 'ledger_transaction'
    protected primaryKey = 'id'

    getTableName(): string { return this.tableName }
    getPrimaryKey(): string { return this.primaryKey }

    protected buildSelectQuery(): string {
        return 'SELECT * FROM ledger_transaction'
    }

    protected mapRowToEntity(row: any): any {
        return row
    }

    protected validateCreate(data: PaymentData): string[] | null {
        const errors: string[] = []
        if (!data.student_id) errors.push('Student ID is required')
        if (!data.amount || data.amount <= 0) errors.push('Valid amount is required')
        if (!data.payment_method) errors.push('Payment method is required')
        if (!data.transaction_date) errors.push('Transaction date is required')
        return errors.length > 0 ? errors : null
    }

    protected async validateUpdate(id: number, data: Partial<PaymentData>): Promise<string[] | null> {
        return null
    }

    protected executeCreate(data: PaymentData): { lastInsertRowid: number | bigint } {
        return this.db.prepare(`
      INSERT INTO ledger_transaction (
        student_id, invoice_id, amount, payment_method, 
        payment_reference, transaction_date, transaction_type, category_id
      ) VALUES (?, ?, ?, ?, ?, ?, 'CREDIT', 1)
    `).run(
            data.student_id,
            data.invoice_id,
            data.amount,
            data.payment_method,
            data.payment_reference || null,
            data.transaction_date
        )
    }

    protected executeUpdate(id: number, data: Partial<PaymentData>): void {
        // Implementation needed if updates are allowed
    }

    /**
     * Record a payment with business logic validation
     */
    async recordPayment(data: PaymentData, userId: number): Promise<{ success: boolean; receipt_number?: string; transactionRef?: string; errors?: string[] }> {
        const errors = this.validateCreate(data)
        if (errors) return { success: false, errors }

        // 2. Check Period Lock
        const periodLocked = this.checkPeriodLock(data.transaction_date)
        if (periodLocked) {
            return { success: false, errors: ['Cannot record payment in a locked period'] }
        }

        // 3. Perform Transaction
        try {
            let receiptNumber = ''
            let transactionRef = ''

            this.db.transaction(() => {
                // Find open invoices for this student (by student_id, not invoice_id)
                const openInvoices = this.db.prepare(`
                    SELECT id, total_amount, amount_paid 
                    FROM fee_invoice 
                    WHERE student_id = ? AND status != 'PAID' AND status != 'CANCELLED'
                    ORDER BY due_date ASC
                `).all(data.student_id) as any[]

                // Insert the payment transaction
                transactionRef = `PAY-${data.student_id}-${Date.now()}`
                const catId = this.db.prepare(`SELECT id FROM transaction_category WHERE category_name = 'School Fees' LIMIT 1`).get() as any

                const paymentResult = this.db.prepare(`
                    INSERT INTO ledger_transaction (
                        transaction_ref, student_id, amount, payment_method, 
                        payment_reference, transaction_date, transaction_type, 
                        category_id, debit_credit, description, recorded_by_user_id
                    ) VALUES (?, ?, ?, ?, ?, ?, 'FEE_PAYMENT', ?, 'CREDIT', 'Fee Payment', ?)
                `).run(
                    transactionRef,
                    data.student_id,
                    data.amount,
                    data.payment_method,
                    data.payment_reference || null,
                    data.transaction_date,
                    catId?.id || 1,
                    userId
                )
                const paymentId = paymentResult.lastInsertRowid

                // Distribute payment across open invoices (FIFO - oldest first)
                let remainingPayment = data.amount
                for (const invoice of openInvoices) {
                    if (remainingPayment <= 0) break

                    const invoiceBalance = invoice.total_amount - invoice.amount_paid
                    const paymentToApply = Math.min(remainingPayment, invoiceBalance)

                    this.db.prepare(`
                        UPDATE fee_invoice 
                        SET amount_paid = amount_paid + ?, 
                            status = CASE 
                                WHEN amount_paid + ? >= total_amount THEN 'PAID' 
                                ELSE 'PARTIAL' 
                            END
                        WHERE id = ?
                    `).run(paymentToApply, paymentToApply, invoice.id)

                    remainingPayment -= paymentToApply
                }

                // Generate Receipt
                receiptNumber = `RCP-${new Date().getFullYear()}-${String(paymentId).padStart(5, '0')}`

                // Create receipt record
                this.db.prepare(`
                    INSERT INTO receipt (receipt_number, transaction_id, receipt_date, student_id, amount, payment_method, payment_reference, created_by_user_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run(receiptNumber, paymentId, data.transaction_date, data.student_id, data.amount, data.payment_method, data.payment_reference || null, userId)
            })()

            return { success: true, receipt_number: receiptNumber, transactionRef }
        } catch (error) {
            return { success: false, errors: [error instanceof Error ? error.message : 'Transaction failed'] }
        }
    }

    async voidPayment(id: number, reason: string, userId: number): Promise<{ success: boolean; errors?: string[] }> {
        if (!reason) return { success: false, errors: ['Void reason is required'] }

        const payment = this.db.prepare('SELECT * FROM ledger_transaction WHERE id = ?').get(id) as any
        if (!payment) return { success: false, errors: ['Payment not found'] }

        if (payment.is_voided) return { success: false, errors: ['Payment already voided'] }

        try {
            this.db.transaction(() => {
                this.db.prepare('UPDATE ledger_transaction SET is_voided = 1, void_reason = ?, voided_by = ? WHERE id = ?')
                    .run(reason, userId, id)

                // Revert Invoice
                if (payment.invoice_id) {
                    this.db.prepare('UPDATE fee_invoice SET amount_paid = amount_paid - ? WHERE id = ?')
                        .run(payment.amount, payment.invoice_id)
                }
            })()
            return { success: true }
        } catch (error) {
            return { success: false, errors: [error instanceof Error ? error.message : 'Void failed'] }
        }
    }

    private checkPeriodLock(date: string): boolean {
        const row = this.db.prepare(`
        SELECT is_locked FROM financial_period 
        WHERE ? BETWEEN start_date AND end_date
    `).get(date) as any
        return row?.is_locked === 1 || row?.is_locked === true // Handle sqlite boolean (0/1)
    }
}
