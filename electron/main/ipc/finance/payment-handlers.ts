import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { getErrorMessage, getTodayDate, type FinanceContext, UNKNOWN_ERROR_MESSAGE } from './finance-handler-utils'
import { type getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'
import { container } from '../../services/base/ServiceContainer'
import {
    buildFeeInvoiceAmountSql,
    buildFeeInvoiceOutstandingBalanceSql,
} from '../../utils/feeInvoiceSql'
import { OUTSTANDING_INVOICE_STATUSES } from '../../utils/financeTransactionTypes'
import { sanitizeString } from '../../utils/validation' // still use sanitizeString maybe, or assume Zod did enough? Zod checks types, but sanitization (trimming) is useful.
import { ROLES } from '../ipc-result'
import {
    RecordPaymentTuple, PayWithCreditTuple, VoidPaymentTuple
} from '../schemas/finance-transaction-schemas'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

import type { PaymentData } from './types'

const registerPaymentRecordHandler = (context: FinanceContext): void => {
    const { paymentService, db } = context
    let hasIdempotencyColumn: boolean | null = null

    const supportsIdempotency = () => {
        if (hasIdempotencyColumn !== null) {
            return hasIdempotencyColumn
        }
        const columns = db.prepare('PRAGMA table_info(ledger_transaction)').all() as Array<{ name: string }>
        hasIdempotencyColumn = columns.some(column => column.name === 'idempotency_key')
        return hasIdempotencyColumn
    }

    const normalizeIdempotencyKey = (raw: unknown): string | undefined => {
        if (typeof raw !== 'string') {
            return undefined
        }
        const trimmed = raw.trim()
        if (!trimmed) {
            return undefined
        }
        return trimmed.slice(0, 128)
    }

    const findByIdempotencyKey = (idempotencyKey: string) => {
        if (!supportsIdempotency()) {
            return null
        }
        return db.prepare(`
            SELECT lt.id, lt.transaction_ref, r.receipt_number
            FROM ledger_transaction lt
            LEFT JOIN receipt r ON r.transaction_id = lt.id
            WHERE lt.idempotency_key = ?
            LIMIT 1
        `).get(idempotencyKey) as { id: number; transaction_ref: string; receipt_number: string | null } | undefined
    }

    validatedHandlerMulti('payment:record', ROLES.FINANCE, RecordPaymentTuple, (event, [data, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        const actorId = actor.id

        // Data validated by schema (RecordPaymentTuple -> PaymentDataSchema)

        try {
            const executePaymentRecord = db.transaction(() => {
                const idempotencyKey = normalizeIdempotencyKey(data.idempotency_key)
                if (idempotencyKey) {
                    const existingForKey = findByIdempotencyKey(idempotencyKey)
                    if (existingForKey) {
                        return {
                            success: true,
                            message: 'Idempotent replay detected; returning existing transaction',
                            transactionRef: existingForKey.transaction_ref,
                            receiptNumber: existingForKey.receipt_number || undefined
                        }
                    }
                }

                const paymentResult = paymentService.recordPayment({
                    student_id: data.student_id,
                    amount: data.amount,
                    transaction_date: data.transaction_date,
                    payment_method: data.payment_method,
                    payment_reference: sanitizeString(data.payment_reference),
                    idempotency_key: idempotencyKey,
                    description: sanitizeString(data.description) || 'Tuition Fee Payment',
                    recorded_by_user_id: actorId,
                    invoice_id: data.invoice_id,
                    term_id: data.term_id || 0,
                    amount_in_words: data.amount_in_words
                })

                if (paymentResult?.success) {
                    return {
                        success: true,
                        message: paymentResult.message || 'Payment recorded',
                        transactionRef: paymentResult.transactionRef,
                        receiptNumber: paymentResult.receiptNumber
                    }
                }

                return {
                    success: false,
                    error: paymentResult?.error || paymentResult?.message || 'Payment failed'
                }
            })

            return executePaymentRecord()
        } catch (error) {
            const message = getErrorMessage(error, UNKNOWN_ERROR_MESSAGE)
            if (message.includes('UNIQUE constraint failed: ledger_transaction.idempotency_key')) {
                const idempotencyKey = normalizeIdempotencyKey(data.idempotency_key)
                if (idempotencyKey) {
                    const existing = findByIdempotencyKey(idempotencyKey)
                    if (existing) {
                        return {
                            success: true,
                            message: 'Idempotent replay detected; returning existing transaction',
                            transactionRef: existing.transaction_ref,
                            receiptNumber: existing.receipt_number || undefined
                        }
                    }
                }
            }
            console.error('Payment processing error:', error)
            return { success: false, error: message }
        }
    })
}

const registerPaymentQueryHandlers = (context: FinanceContext): void => {
    const { db } = context

    validatedHandler('payment:getByStudent', ROLES.STAFF, z.number().int().positive(), (_event, studentId) => {
        const payments = db.prepare(`SELECT lt.*, r.receipt_number FROM ledger_transaction lt
      LEFT JOIN receipt r ON lt.id = r.transaction_id
      WHERE lt.student_id = ? AND lt.transaction_type = 'FEE_PAYMENT' AND lt.is_voided = 0
      ORDER BY lt.transaction_date DESC`).all(studentId) as (PaymentData & { receipt_number: string, id: number })[]

        return payments.map(payment => ({
            ...payment,
            amount: payment.amount
        }))
    })
}

const registerPayWithCreditHandler = (context: FinanceContext): void => {
    const { db, getOrCreateCategoryId } = context
    const _invoiceAmountSql = buildFeeInvoiceAmountSql(db, 'fee_invoice') // Used 'fi' in select, but inside transaction update uses 'fee_invoice' implicit?
    // Wait, original used 'fi' for select alias. For update it needs simple sql.
    const invoiceAmountSqlForUpdate = buildFeeInvoiceAmountSql(db, 'fee_invoice')
    const outstandingBalanceSql = buildFeeInvoiceOutstandingBalanceSql(db, 'fi')

    validatedHandlerMulti('payment:payWithCredit', ROLES.FINANCE, PayWithCreditTuple, (event, [data, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        const actorId = actor.id

        return db.transaction(() => {
            // Validated by schema: data.studentId, invoiceId, amount (positive)

            const student = db.prepare('SELECT credit_balance FROM student WHERE id = ?').get(data.studentId) as { credit_balance: number } | undefined
            if (!student) {
                return { success: false, error: 'Student not found' }
            }

            const invoice = db.prepare(`
                SELECT
                    fi.id,
                    fi.student_id,
                    ${buildFeeInvoiceAmountSql(db, 'fi')} as invoice_amount,
                    COALESCE(fi.amount_paid, 0) as amount_paid,
                    COALESCE(fi.status, 'PENDING') as status,
                    ${outstandingBalanceSql} as outstanding_balance
                FROM fee_invoice fi
                WHERE fi.id = ?
            `)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .get(data.invoiceId) as any // Typed above

            if (!invoice) {
                return { success: false, error: 'Invoice not found' }
            }
            if (invoice.student_id !== data.studentId) {
                return { success: false, error: 'Invoice does not belong to selected student' }
            }
            if (!OUTSTANDING_INVOICE_STATUSES.includes(invoice.status.toUpperCase())) {
                return { success: false, error: `Invoice cannot accept payments in ${invoice.status} state` }
            }

            const availableBalance = Math.max(0, invoice.outstanding_balance || 0)
            if (data.amount > availableBalance) {
                return { success: false, error: 'Payment amount exceeds invoice balance' }
            }

            const currentCredit = student.credit_balance || 0
            const amountCents = data.amount

            if (currentCredit < amountCents) {
                return { success: false, error: 'Insufficient credit balance' }
            }

            // ... idempotency logic (same as before) ...

            // Idempotency guard: suppress immediate replay of identical credit payment payload.
            const duplicate = db.prepare(`
                SELECT id, transaction_ref
                FROM ledger_transaction
                WHERE transaction_type = 'FEE_PAYMENT'
                  AND is_voided = 0
                  AND student_id = ?
                  AND invoice_id = ?
                  AND amount = ?
                  AND payment_method = 'CASH'
                  AND payment_reference = 'CREDIT_BALANCE'
                  AND recorded_by_user_id = ?
                  AND transaction_date = ?
                  AND created_at >= datetime('now', '-15 seconds')
                ORDER BY id DESC
                LIMIT 1
            `).get(
                data.studentId,
                data.invoiceId,
                amountCents,
                actorId,
                getTodayDate()
            ) as { id: number, transaction_ref: string } | undefined

            if (duplicate) {
                return {
                    success: true,
                    message: 'Duplicate credit payment request detected; returning existing transaction',
                    transactionRef: duplicate.transaction_ref
                }
            }

            // ... Transaction insert ...
            const transactionDate = getTodayDate()
            const transactionRef = `TXN-CREDIT-${Date.now()}`
            const categoryId = getOrCreateCategoryId('School Fees', 'INCOME')
            const transactionStatement = db.prepare(`INSERT INTO ledger_transaction (
                transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
                student_id, payment_method, payment_reference, description, recorded_by_user_id, invoice_id
            ) VALUES (?, ?, 'FEE_PAYMENT', ?, ?, 'CREDIT', ?, 'CREDIT', 'CREDIT_BALANCE', 'Payment via Credit Balance', ?, ?)`)

            const transactionResult = transactionStatement.run(
                transactionRef,
                transactionDate,
                categoryId,
                amountCents,
                data.studentId,
                actorId,
                data.invoiceId
            )

            const transactionId = transactionResult.lastInsertRowid as number
            const receiptNumber = `RCP-CREDIT-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`
            db.prepare(`
                INSERT INTO receipt (
                    receipt_number, transaction_id, receipt_date, student_id, amount,
                    payment_method, payment_reference, created_by_user_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                receiptNumber,
                transactionId,
                transactionDate,
                data.studentId,
                amountCents,
                'CREDIT',
                'CREDIT_BALANCE',
                actorId
            )

            db.prepare(`UPDATE fee_invoice SET amount_paid = amount_paid + ?,
                status = CASE
                    WHEN COALESCE(amount_paid, 0) + ? >= (${invoiceAmountSqlForUpdate}) THEN 'PAID'
                    WHEN COALESCE(amount_paid, 0) + ? <= 0 THEN 'PENDING'
                    ELSE 'PARTIAL'
                END
                WHERE id = ?`).run(amountCents, amountCents, amountCents, data.invoiceId)

            db.prepare('UPDATE student SET credit_balance = credit_balance - ? WHERE id = ?').run(amountCents, data.studentId)

            db.prepare(`
                INSERT INTO payment_invoice_allocation (transaction_id, invoice_id, applied_amount)
                VALUES (?, ?, ?)
            `).run(transactionId, data.invoiceId, amountCents)

            db.prepare(`
                INSERT INTO credit_transaction (student_id, amount, transaction_type, reference_invoice_id, notes)
                VALUES (?, ?, 'CREDIT_APPLIED', ?, ?)
            `).run(
                data.studentId,
                amountCents,
                data.invoiceId,
                `Applied credit balance via payment ${transactionRef}`
            )

            const journalService = container.resolve('DoubleEntryJournalService')
            const journalResult = journalService.recordPaymentSync(
                data.studentId,
                amountCents,
                'CREDIT',
                'CREDIT_BALANCE',
                transactionDate,
                actorId,
                transactionId
            )
            if (!journalResult.success) {
                throw new Error(journalResult.error || 'Failed to create journal entry for credit payment')
            }

            logAudit(actorId, 'CREATE', 'ledger_transaction', transactionId, null, {
                action: 'PAY_WITH_CREDIT',
                amount: amountCents,
                invoiceId: data.invoiceId
            })

            return { success: true, transactionRef, receiptNumber }
        })()
    })
}

const registerPaymentVoidHandler = (context: FinanceContext): void => {
    const { paymentService } = context

    validatedHandlerMulti('payment:void', ROLES.FINANCE, VoidPaymentTuple, async (event, [transactionId, voidReason, legacyUserId, recoveryMethod], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        const actorId = actor.id

        try {
            return await paymentService.voidPayment({
                transaction_id: transactionId,
                void_reason: voidReason.trim(),
                voided_by: actorId,
                recovery_method: recoveryMethod
            })
        } catch (error) {
            console.error('Payment void error:', error)
            return { success: false, error: getErrorMessage(error, 'Failed to void payment') }
        }
    })
}

export const registerPaymentHandlers = (context: FinanceContext): void => {
    registerPaymentRecordHandler(context)
    registerPaymentQueryHandlers(context)
    registerPayWithCreditHandler(context)
    registerPaymentVoidHandler(context)
}

export const registerReceiptHandlers = (db: ReturnType<typeof getDatabase>): void => {
    validatedHandler('receipt:getByTransaction', ROLES.STAFF, z.number().int().positive(), (_event, transactionId) => {
        return db.prepare('SELECT * FROM receipt WHERE transaction_id = ?').get(transactionId) || null
    })

    validatedHandler('receipt:markPrinted', ROLES.STAFF, z.number().int().positive(), (_event, receiptId) => {
        const receipt = db.prepare('SELECT id FROM receipt WHERE id = ?').get(receiptId)
        if (!receipt) { return { success: false, error: 'Receipt not found' } }
        db.prepare('UPDATE receipt SET printed_count = COALESCE(printed_count, 0) + 1, last_printed_at = CURRENT_TIMESTAMP WHERE id = ?').run(receiptId)
        return { success: true }
    })
}
