import { randomUUID } from 'node:crypto'

import { createGetOrCreateCategoryId, generateBatchInvoices, generateSingleStudentInvoice, getErrorMessage, getTodayDate, type FinanceContext, UNKNOWN_ERROR_MESSAGE } from './finance-handler-utils'
import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'
import { container } from '../../services/base/ServiceContainer'
import { CashFlowService } from '../../services/finance/CashFlowService'
import { validateAmount, validateDate, validateId, sanitizeString, validatePastOrTodayDate } from '../../utils/validation'
import { safeHandleRaw, safeHandleRawWithRole, ROLES } from '../ipc-result'

import type { PaymentData, PaymentResult, TransactionData, InvoiceData, InvoiceItem, FeeStructureItemData, FeeInvoiceDB, FeeInvoiceWithDetails, FeeStructureWithDetails } from './types'
import type { ScholarshipData, AllocationData } from '../../services/finance/ScholarshipService'

const registerCashFlowHandlers = (): void => {
    safeHandleRaw('finance:getCashFlow', (_event, startDate: string, endDate: string) => {
        return CashFlowService.getCashFlowStatement(startDate, endDate)
    })

    safeHandleRaw('finance:getForecast', (_event, months: number) => {
        return CashFlowService.getForecast(months)
    })
}

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

    const findDuplicatePayment = (data: PaymentData, userId: number) => {
        return db.prepare(`
            SELECT lt.id, lt.transaction_ref, r.receipt_number
            FROM ledger_transaction lt
            LEFT JOIN receipt r ON r.transaction_id = lt.id
            WHERE lt.transaction_type = 'FEE_PAYMENT'
              AND lt.is_voided = 0
              AND lt.student_id = ?
              AND lt.amount = ?
              AND lt.transaction_date = ?
              AND lt.payment_method = ?
              AND COALESCE(lt.payment_reference, '') = COALESCE(?, '')
              AND lt.recorded_by_user_id = ?
              AND (
                (lt.invoice_id IS NULL AND ? IS NULL)
                OR lt.invoice_id = ?
              )
            ORDER BY lt.id DESC
            LIMIT 1
        `).get(
            data.student_id,
            data.amount,
            data.transaction_date,
            data.payment_method,
            data.payment_reference ?? '',
            userId,
            data.invoice_id ?? null,
            data.invoice_id ?? null
        ) as { id: number; transaction_ref: string; receipt_number: string | null } | undefined
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

    safeHandleRaw('payment:record', (_event, data: PaymentData, userId: number): PaymentResult | { success: false, error: string } => {
        const amountValidation = validateAmount(data.amount)
        if (!amountValidation.success) {
            return { success: false, error: amountValidation.error! }
        }
        if ((amountValidation.data || 0) <= 0) {
            return { success: false, error: 'Payment amount must be greater than zero' }
        }

        const studentValidation = validateId(data.student_id, 'Student')
        if (!studentValidation.success) {
            return { success: false, error: studentValidation.error! }
        }
        const dateValidation = validatePastOrTodayDate(data.transaction_date)
        if (!dateValidation.success) {
            return { success: false, error: dateValidation.error! }
        }

        try {
            const executePaymentRecord = db.transaction(() => {
                const idempotencyKey = normalizeIdempotencyKey((data as PaymentData & { idempotency_key?: unknown }).idempotency_key)
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

                const duplicate = findDuplicatePayment({
                    ...data,
                    amount: amountValidation.data!,
                    transaction_date: dateValidation.data!,
                    payment_reference: sanitizeString(data.payment_reference),
                    description: sanitizeString(data.description) || 'Tuition Fee Payment'
                }, userId)
                if (duplicate) {
                    return {
                        success: true,
                        message: 'Duplicate payment request detected; returning existing transaction',
                        transactionRef: duplicate.transaction_ref,
                        receiptNumber: duplicate.receipt_number || undefined
                    }
                }

                const paymentResult = paymentService.recordPayment({
                    student_id: data.student_id,
                    amount: amountValidation.data!,
                    transaction_date: dateValidation.data!,
                    payment_method: data.payment_method,
                    payment_reference: sanitizeString(data.payment_reference),
                    idempotency_key: idempotencyKey,
                    description: sanitizeString(data.description) || 'Tuition Fee Payment',
                    recorded_by_user_id: userId,
                    invoice_id: data.invoice_id,
                    term_id: data.term_id || 0,
                    amount_in_words: data.amount_in_words
                })

                if (paymentResult.success) {
                    return {
                        success: true,
                        message: paymentResult.message || 'Payment recorded',
                        transactionRef: paymentResult.transactionRef,
                        receiptNumber: paymentResult.receiptNumber
                    }
                }

                return { success: false, error: paymentResult.error || paymentResult.message || 'Payment failed' }
            })

            return executePaymentRecord()
        } catch (error) {
            const message = getErrorMessage(error, UNKNOWN_ERROR_MESSAGE)
            if (message.includes('UNIQUE constraint failed: ledger_transaction.idempotency_key')) {
                const idempotencyKey = normalizeIdempotencyKey((data as PaymentData & { idempotency_key?: unknown }).idempotency_key)
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

    safeHandleRaw('payment:getByStudent', (_event, studentId: number) => {
        const payments = db.prepare(`SELECT lt.*, r.receipt_number FROM ledger_transaction lt
      LEFT JOIN receipt r ON lt.id = r.transaction_id
      WHERE lt.student_id = ? AND lt.transaction_type = 'FEE_PAYMENT' AND lt.is_voided = 0
      ORDER BY lt.transaction_date DESC`).all(studentId) as (TransactionData & { receipt_number: string, id: number })[]

        return payments.map(payment => ({
            ...payment,
            amount: payment.amount
        }))
    })
}

const registerPayWithCreditHandler = (context: FinanceContext): void => {
    const { db, getOrCreateCategoryId } = context

    safeHandleRaw('payment:payWithCredit', (_event, data: { studentId: number, invoiceId: number, amount: number }, userId: number) => {
        return db.transaction(() => {
            if (!data.studentId || !data.invoiceId || !Number.isFinite(data.amount) || data.amount <= 0) {
                return { success: false, error: 'Invalid payment payload' }
            }

            const student = db.prepare('SELECT credit_balance FROM student WHERE id = ?').get(data.studentId) as { credit_balance: number } | undefined
            if (!student) {
                return { success: false, error: 'Student not found' }
            }

            const invoice = db.prepare(`
                SELECT id, student_id, total_amount, amount_paid, status
                FROM fee_invoice
                WHERE id = ?
            `).get(data.invoiceId) as { id: number, student_id: number, total_amount: number, amount_paid: number, status: string } | undefined
            if (!invoice) {
                return { success: false, error: 'Invoice not found' }
            }
            if (invoice.student_id !== data.studentId) {
                return { success: false, error: 'Invoice does not belong to selected student' }
            }
            if (invoice.status === 'PAID' || invoice.status === 'CANCELLED') {
                return { success: false, error: `Invoice cannot accept payments in ${invoice.status} state` }
            }

            const availableBalance = Math.max(0, invoice.total_amount - invoice.amount_paid)
            if (data.amount > availableBalance) {
                return { success: false, error: 'Payment amount exceeds invoice balance' }
            }

            const currentCredit = student.credit_balance || 0
            const amountCents = data.amount

            if (currentCredit < amountCents) {
                return { success: false, error: 'Insufficient credit balance' }
            }

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
                userId,
                getTodayDate()
            ) as { id: number, transaction_ref: string } | undefined

            if (duplicate) {
                return {
                    success: true,
                    message: 'Duplicate credit payment request detected; returning existing transaction',
                    transactionRef: duplicate.transaction_ref
                }
            }

            const transactionDate = getTodayDate()
            const transactionRef = `TXN-CREDIT-${Date.now()}`
            const categoryId = getOrCreateCategoryId('School Fees', 'INCOME')
            const transactionStatement = db.prepare(`INSERT INTO ledger_transaction (
                transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
                student_id, payment_method, payment_reference, description, recorded_by_user_id, invoice_id
            ) VALUES (?, ?, 'FEE_PAYMENT', ?, ?, 'CREDIT', ?, 'CASH', 'CREDIT_BALANCE', 'Payment via Credit Balance', ?, ?)`)

            const transactionResult = transactionStatement.run(
                transactionRef,
                transactionDate,
                categoryId,
                amountCents,
                data.studentId,
                userId,
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
                'CASH',
                'CREDIT_BALANCE',
                userId
            )

            db.prepare(`UPDATE fee_invoice SET amount_paid = amount_paid + ?,
                status = CASE WHEN amount_paid + ? >= total_amount THEN 'PAID' ELSE 'PARTIAL' END
                WHERE id = ?`).run(amountCents, amountCents, data.invoiceId)

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
                'CASH',
                'CREDIT_BALANCE',
                transactionDate,
                userId,
                transactionId
            )
            if (!journalResult.success) {
                throw new Error(journalResult.error || 'Failed to create journal entry for credit payment')
            }

            logAudit(userId, 'CREATE', 'ledger_transaction', transactionId, null, {
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

    safeHandleRawWithRole('payment:void', ROLES.FINANCE, async (
        _event,
        transactionId: number,
        voidReason: string,
        userId: number,
        recoveryMethod?: string
    ) => {
        if (!transactionId || transactionId <= 0) {
            return { success: false, error: 'Invalid transaction ID' }
        }
        if (!voidReason.trim()) {
            return { success: false, error: 'Void reason is required' }
        }
        if (!userId || userId <= 0) {
            return { success: false, error: 'Invalid user session' }
        }

        try {
            return await paymentService.voidPayment({
                transaction_id: transactionId,
                void_reason: voidReason.trim(),
                voided_by: userId,
                recovery_method: recoveryMethod
            })
        } catch (error) {
            console.error('Payment void error:', error)
            return { success: false, error: getErrorMessage(error, 'Failed to void payment') }
        }
    })
}

const registerPaymentHandlers = (context: FinanceContext): void => {
    registerPaymentRecordHandler(context)
    registerPaymentQueryHandlers(context)
    registerPayWithCreditHandler(context)
    registerPaymentVoidHandler(context)
}

function createInvoice(
    db: ReturnType<typeof getDatabase>,
    data: InvoiceData,
    items: InvoiceItem[],
    userId: number
) {
    const normalizeItems = (rows: InvoiceItem[]) => rows
        .map((item) => ({
            fee_category_id: item.fee_category_id,
            description: (item.description || '').trim(),
            amount: item.amount
        }))
        .sort((a, b) => {
            if (a.fee_category_id !== b.fee_category_id) {
                return a.fee_category_id - b.fee_category_id
            }
            if (a.amount !== b.amount) {
                return a.amount - b.amount
            }
            return a.description.localeCompare(b.description)
        })

    const isSameItemSet = (a: InvoiceItem[], b: InvoiceItem[]) => {
        if (a.length !== b.length) {
            return false
        }
        const left = normalizeItems(a)
        const right = normalizeItems(b)
        return left.every((item, index) =>
            item.fee_category_id === right[index].fee_category_id &&
            item.amount === right[index].amount &&
            item.description === right[index].description
        )
    }

    return db.transaction(() => {
        const itemsInCents = items.map(item => ({ ...item, amount: item.amount }))
        const totalCents = itemsInCents.reduce((sum: number, item) => sum + item.amount, 0)

        const recentCandidates = db.prepare(`
            SELECT id, invoice_number
            FROM fee_invoice
            WHERE student_id = ?
              AND term_id = ?
              AND invoice_date = ?
              AND due_date = ?
              AND total_amount = ?
              AND created_by_user_id = ?
              AND created_at >= datetime('now', '-15 seconds')
            ORDER BY id DESC
            LIMIT 5
        `).all(
            data.student_id,
            data.term_id,
            data.invoice_date,
            data.due_date,
            totalCents,
            userId
        ) as Array<{ id: number; invoice_number: string }>

        for (const candidate of recentCandidates) {
            const existingItems = db.prepare(`
                SELECT fee_category_id, description, amount
                FROM invoice_item
                WHERE invoice_id = ?
            `).all(candidate.id) as InvoiceItem[]
            if (isSameItemSet(existingItems, itemsInCents)) {
                return {
                    success: true,
                    invoiceNumber: candidate.invoice_number,
                    id: candidate.id,
                    message: 'Duplicate invoice request detected; returning existing invoice'
                }
            }
        }

        const invoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`
        const invoiceResult = db.prepare(`INSERT INTO fee_invoice (
            invoice_number, student_id, term_id, academic_term_id, invoice_date, due_date,
            total_amount, amount, amount_due, original_amount, created_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
            invoiceNumber, data.student_id, data.term_id, data.term_id,
            data.invoice_date, data.due_date, totalCents, totalCents, totalCents, totalCents, userId
        )

        logAudit(userId, 'CREATE', 'fee_invoice', invoiceResult.lastInsertRowid as number, null, {
            ...data, total: totalCents, items: itemsInCents
        })

        const itemStatement = db.prepare('INSERT INTO invoice_item (invoice_id, fee_category_id, description, amount) VALUES (?, ?, ?, ?)')
        for (const item of itemsInCents) {
            itemStatement.run(invoiceResult.lastInsertRowid, item.fee_category_id, item.description, item.amount)
        }

        const journalService = container.resolve('DoubleEntryJournalService')
        const glLookup = db.prepare(
            `SELECT ga.account_code FROM gl_account ga
             JOIN fee_category fc ON fc.gl_account_id = ga.id
             WHERE fc.id = ?`
        )
        const invoiceJournalItems = itemsInCents.map((item) => {
            const row = glLookup.get(item.fee_category_id) as { account_code: string } | undefined
            return {
                gl_account_code: row?.account_code ?? '4300',
                amount: item.amount,
                description: item.description ?? 'Fee invoice item'
            }
        })
        const journalResult = journalService.recordInvoiceSync(data.student_id, invoiceJournalItems, data.invoice_date, userId)
        if (!journalResult.success) {
            throw new Error(journalResult.error || 'Failed to create journal entry for invoice')
        }

        return { success: true, invoiceNumber, id: invoiceResult.lastInsertRowid }
    })()
}

const registerInvoiceHandlers = (context: FinanceContext): void => {
    const { db } = context

    safeHandleRaw('invoice:getItems', (_event, invoiceId: number) => {
        const items = db.prepare(`
            SELECT ii.*, fc.category_name
            FROM invoice_item ii
            JOIN fee_category fc ON ii.fee_category_id = fc.id
            WHERE ii.invoice_id = ?
        `).all(invoiceId) as InvoiceItem[]

        return items.map(item => ({
            ...item,
            amount: item.amount
        }))
    })

    safeHandleRaw('invoice:create', (_event, data: InvoiceData, items: InvoiceItem[], userId: number) => {
        const studentValidation = validateId(data.student_id, 'Student')
        if (!studentValidation.success) {
            return { success: false, error: studentValidation.error! }
        }
        const termValidation = validateId(data.term_id, 'Term')
        if (!termValidation.success) {
            return { success: false, error: termValidation.error! }
        }
        const invoiceDateValidation = validateDate(data.invoice_date)
        if (!invoiceDateValidation.success) {
            return { success: false, error: invoiceDateValidation.error! }
        }
        const dueDateValidation = validateDate(data.due_date)
        if (!dueDateValidation.success) {
            return { success: false, error: dueDateValidation.error! }
        }
        if (dueDateValidation.data! < invoiceDateValidation.data!) {
            return { success: false, error: 'Due date cannot be earlier than invoice date' }
        }
        if (!Array.isArray(items) || items.length === 0) {
            return { success: false, error: 'Invoice must include at least one item' }
        }
        if (items.some(item => !Number.isFinite(item.amount) || item.amount <= 0)) {
            return { success: false, error: 'All invoice items must have amounts greater than zero' }
        }

        return createInvoice(db, data, items, userId)
    })

    safeHandleRaw('invoice:getByStudent', (_event, studentId: number) => {
        return db.prepare('SELECT * FROM fee_invoice WHERE student_id = ? ORDER BY invoice_date DESC').all(studentId) as FeeInvoiceDB[]
    })

    safeHandleRaw('invoice:getAll', () => {
        const invoices = db.prepare(`
            SELECT fi.*,
                   s.first_name || ' ' || s.last_name as student_name,
                   t.term_name
            FROM fee_invoice fi
            JOIN student s ON fi.student_id = s.id
            LEFT JOIN term t ON fi.term_id = t.id
            ORDER BY fi.invoice_date DESC
        `).all() as FeeInvoiceWithDetails[]

        return invoices.map(invoice => ({
            ...invoice,
            total_amount: invoice.total_amount,
            amount_paid: invoice.amount_paid,
            balance: (invoice.total_amount - invoice.amount_paid)
        }))
    })
}

const registerFeeStructureHandlers = (context: FinanceContext): void => {
    const { db } = context

    safeHandleRaw('fee:getCategories', () => {
        return db.prepare('SELECT * FROM fee_category WHERE is_active = 1').all()
    })

    safeHandleRaw('fee:createCategory', (_event, name: string, description: string, userId?: number) => {
        const trimmedName = name.trim()
        if (!trimmedName) {
            return { success: false, error: 'Category name is required' }
        }

        const existing = db.prepare('SELECT id FROM fee_category WHERE category_name = ? AND is_active = 1').get(trimmedName)
        if (existing) {
            return { success: false, error: 'A fee category with this name already exists' }
        }

        const statement = db.prepare('INSERT INTO fee_category (category_name, description) VALUES (?, ?)')
        const result = statement.run(trimmedName, description.trim() || '')

        if (userId) {
            logAudit(userId, 'CREATE', 'fee_category', result.lastInsertRowid as number, null, { name: trimmedName, description })
        }

        return { success: true, id: result.lastInsertRowid }
    })

    safeHandleRaw('fee:getStructure', (_event, academicYearId: number, termId: number) => {
        return db.prepare(`
            SELECT fs.*, fc.category_name, s.stream_name
            FROM fee_structure fs
            JOIN fee_category fc ON fs.fee_category_id = fc.id
            JOIN stream s ON fs.stream_id = s.id
            WHERE fs.academic_year_id = ? AND fs.term_id = ?
        `).all(academicYearId, termId) as FeeStructureWithDetails[]
    })

    safeHandleRaw('fee:saveStructure', (_event, data: FeeStructureItemData[], academicYearId: number, termId: number, userId?: number) => {
        if (!Array.isArray(data) || data.length === 0) {
            return { success: false, error: 'At least one fee structure item is required' }
        }
        for (const item of data) {
            if (!item.stream_id || !item.fee_category_id || !Number.isFinite(item.amount) || item.amount <= 0) {
                return { success: false, error: 'All fee structure items must have a stream, category, and positive amount' }
            }
        }

        const deleteStatement = db.prepare('DELETE FROM fee_structure WHERE academic_year_id = ? AND term_id = ?')
        const insertStatement = db.prepare(`
            INSERT INTO fee_structure (academic_year_id, term_id, stream_id, student_type, fee_category_id, amount)
            VALUES (?, ?, ?, ?, ?, ?)
        `)

        const execute = db.transaction((items: FeeStructureItemData[]) => {
            deleteStatement.run(academicYearId, termId)
            for (const item of items) {
                insertStatement.run(academicYearId, termId, item.stream_id, item.student_type, item.fee_category_id, item.amount)
            }

            if (userId) {
                logAudit(userId, 'UPDATE', 'fee_structure', 0, null, {
                    academicYearId, termId, itemCount: items.length
                })
            }
        })

        execute(data)
        return { success: true }
    })

    safeHandleRaw('invoice:generateBatch', (_event, academicYearId: number, termId: number, userId: number) => {
        return generateBatchInvoices(context, academicYearId, termId, userId)
    })

    safeHandleRaw('invoice:generateForStudent', (_event, studentId: number, academicYearId: number, termId: number, userId: number) => {
        return generateSingleStudentInvoice(context, studentId, academicYearId, termId, userId)
    })
}

const registerCreditHandlers = (): void => {
    const creditService = container.resolve('CreditAutoApplicationService')

    safeHandleRaw('finance:allocateCredits', async (_event, studentId: number, userId: number) => {
        try {
            return await creditService.allocateCreditsToInvoices(studentId, userId)
        } catch (error) {
            return { success: false, error: getErrorMessage(error, UNKNOWN_ERROR_MESSAGE) }
        }
    })

    safeHandleRaw('finance:getCreditBalance', async (_event, studentId: number) => {
        try {
            return await creditService.getStudentCreditBalance(studentId)
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to get credit balance'))
        }
    })

    safeHandleRaw('finance:getCreditTransactions', async (_event, studentId: number, limit?: number) => {
        try {
            return await creditService.getCreditTransactions(studentId, limit)
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to get credit transactions'))
        }
    })

    safeHandleRaw('finance:addCredit', async (_event, studentId: number, amount: number, notes: string, userId: number) => {
        try {
            return await creditService.addCreditToStudent(studentId, amount, notes, userId)
        } catch (error) {
            return { success: false, error: getErrorMessage(error, UNKNOWN_ERROR_MESSAGE) }
        }
    })
}

const registerProrationHandlers = (): void => {
    const prorationService = container.resolve('FeeProrationService')

    safeHandleRaw('finance:calculateProRatedFee', (
        _event,
        fullAmount: number,
        termStartDate: string,
        termEndDate: string,
        enrollmentDate: string
    ) => {
        try {
            return prorationService.calculateProRatedFee(fullAmount, termStartDate, termEndDate, enrollmentDate)
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to calculate pro-rated fee'))
        }
    })

    safeHandleRaw('finance:validateEnrollmentDate', (
        _event,
        termStartDate: string,
        termEndDate: string,
        enrollmentDate: string
    ) => {
        try {
            return prorationService.validateEnrollmentDate(termStartDate, termEndDate, enrollmentDate)
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to validate enrollment date'))
        }
    })

    safeHandleRaw('finance:generateProRatedInvoice', async (
        _event,
        studentId: number,
        templateInvoiceId: number,
        enrollmentDate: string,
        userId: number
    ) => {
        try {
            return await prorationService.generateProRatedInvoice(studentId, templateInvoiceId, enrollmentDate, userId)
        } catch (error) {
            return { success: false, error: getErrorMessage(error, UNKNOWN_ERROR_MESSAGE) }
        }
    })

    safeHandleRaw('finance:getProRationHistory', async (_event, studentId: number) => {
        try {
            return await prorationService.getStudentProRationHistory(studentId)
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to get proration history'))
        }
    })
}

const registerScholarshipHandlers = (): void => {
    const scholarshipService = container.resolve('ScholarshipService')

    safeHandleRaw('finance:createScholarship', async (_event, data: ScholarshipData, userId: number) => {
        try {
            return await scholarshipService.createScholarship(data, userId)
        } catch (error) {
            return { success: false, error: getErrorMessage(error, UNKNOWN_ERROR_MESSAGE) }
        }
    })

    safeHandleRaw('finance:allocateScholarship', async (_event, allocationData: AllocationData, userId: number) => {
        try {
            return await scholarshipService.allocateScholarshipToStudent(allocationData, userId)
        } catch (error) {
            return { success: false, error: getErrorMessage(error, UNKNOWN_ERROR_MESSAGE) }
        }
    })

    safeHandleRaw('finance:validateScholarshipEligibility', async (_event, studentId: number, scholarshipId: number) => {
        try {
            return await scholarshipService.validateScholarshipEligibility(studentId, scholarshipId)
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to validate eligibility'))
        }
    })

    safeHandleRaw('finance:getActiveScholarships', async () => {
        try {
            return await scholarshipService.getActiveScholarships()
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to get scholarships'))
        }
    })

    safeHandleRaw('finance:getStudentScholarships', async (_event, studentId: number) => {
        try {
            return await scholarshipService.getStudentScholarships(studentId)
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to get student scholarships'))
        }
    })

    safeHandleRaw('finance:getScholarshipAllocations', async (_event, scholarshipId: number) => {
        try {
            return await scholarshipService.getScholarshipAllocations(scholarshipId)
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to get allocations'))
        }
    })

    safeHandleRaw('finance:applyScholarshipToInvoice', async (
        _event,
        studentScholarshipId: number,
        invoiceId: number,
        amountToApply: number,
        userId: number
    ) => {
        try {
            return await scholarshipService.applyScholarshipToInvoice(studentScholarshipId, invoiceId, amountToApply, userId)
        } catch (error) {
            return { success: false, error: getErrorMessage(error, UNKNOWN_ERROR_MESSAGE) }
        }
    })
}

const registerReceiptHandlers = (db: ReturnType<typeof getDatabase>): void => {
    safeHandleRaw('receipt:getByTransaction', (_event, transactionId: number) => {
        return db.prepare('SELECT * FROM receipt WHERE transaction_id = ?').get(transactionId) || null
    })

    safeHandleRaw('receipt:markPrinted', (_event, receiptId: number) => {
        const receipt = db.prepare('SELECT id FROM receipt WHERE id = ?').get(receiptId)
        if (!receipt) { return { success: false, error: 'Receipt not found' } }
        db.prepare('UPDATE receipt SET printed_count = COALESCE(printed_count, 0) + 1, last_printed_at = CURRENT_TIMESTAMP WHERE id = ?').run(receiptId)
        return { success: true }
    })
}

export function registerFinanceHandlers(): void {
    const db = getDatabase()
    const context: FinanceContext = {
        db,
        exemptionService: container.resolve('ExemptionService'),
        paymentService: container.resolve('PaymentService'),
        getOrCreateCategoryId: createGetOrCreateCategoryId(db)
    }

    registerCashFlowHandlers()
    registerPaymentHandlers(context)
    registerInvoiceHandlers(context)
    registerFeeStructureHandlers(context)
    registerCreditHandlers()
    registerProrationHandlers()
    registerScholarshipHandlers()
    registerReceiptHandlers(db)
}
