import { createGetOrCreateCategoryId, generateBatchInvoices, getErrorMessage, getTodayDate, type FinanceContext, UNKNOWN_ERROR_MESSAGE } from './finance-handler-utils'
import { type PaymentData, type PaymentResult, type TransactionData, type InvoiceData, type InvoiceItem, type FeeStructureItemData, type FeeInvoiceDB, type FeeInvoiceWithDetails, type FeeStructureWithDetails } from './types'
import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'
import { ipcMain } from '../../electron-env'
import { CashFlowService } from '../../services/finance/CashFlowService'
import { CreditAutoApplicationService } from '../../services/finance/CreditAutoApplicationService'
import { ExemptionService } from '../../services/finance/ExemptionService'
import { FeeProrationService } from '../../services/finance/FeeProrationService'
import { PaymentService } from '../../services/finance/PaymentService'
import { ScholarshipService, type ScholarshipData, type AllocationData } from '../../services/finance/ScholarshipService'
import { validateAmount, validateId, sanitizeString } from '../../utils/validation'

import type { IpcMainInvokeEvent } from 'electron'

const registerCashFlowHandlers = (): void => {
    ipcMain.handle('finance:getCashFlow', async (_event: IpcMainInvokeEvent, startDate: string, endDate: string) => {
        return CashFlowService.getCashFlowStatement(startDate, endDate)
    })

    ipcMain.handle('finance:getForecast', async (_event: IpcMainInvokeEvent, months: number) => {
        return CashFlowService.getForecast(months)
    })
}

const registerPaymentRecordHandler = (context: FinanceContext): void => {
    const { paymentService } = context

    ipcMain.handle('payment:record', async (_event: IpcMainInvokeEvent, data: PaymentData, userId: number): Promise<PaymentResult | { success: false, message: string }> => {
        const amountValidation = validateAmount(data.amount)
        if (!amountValidation.success) {
            return { success: false, message: amountValidation.error! }
        }

        const studentValidation = validateId(data.student_id, 'Student')
        if (!studentValidation.success) {
            return { success: false, message: studentValidation.error! }
        }

        try {
            const paymentResult = paymentService.recordPayment({
                student_id: data.student_id,
                amount: amountValidation.data!,
                transaction_date: data.transaction_date,
                payment_method: data.payment_method,
                payment_reference: sanitizeString(data.payment_reference),
                description: sanitizeString(data.description) || 'Tuition Fee Payment',
                recorded_by_user_id: userId,
                invoice_id: data.invoice_id,
                term_id: data.term_id || 0,
                amount_in_words: data.amount_in_words
            })

            if (paymentResult.success) {
                return {
                    success: true,
                    transactionRef: paymentResult.transactionRef!,
                    receiptNumber: paymentResult.receiptNumber!
                }
            }

            return { success: false, message: paymentResult.message }
        } catch (error) {
            console.error('Payment processing error:', error)
            return { success: false, message: getErrorMessage(error, UNKNOWN_ERROR_MESSAGE) }
        }
    })
}

const registerPaymentQueryHandlers = (context: FinanceContext): void => {
    const { db } = context

    ipcMain.handle('payment:getByStudent', async (_event: IpcMainInvokeEvent, studentId: number) => {
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

    ipcMain.handle('payment:payWithCredit', async (_event: IpcMainInvokeEvent, data: { studentId: number, invoiceId: number, amount: number }, userId: number) => {
        return db.transaction(() => {
            const student = db.prepare('SELECT credit_balance FROM student WHERE id = ?').get(data.studentId) as { credit_balance: number }
            const currentCredit = student.credit_balance || 0
            const amountCents = data.amount

            if (currentCredit < amountCents) {
                return { success: false, message: 'Insufficient credit balance' }
            }

            const categoryId = getOrCreateCategoryId('School Fees', 'INCOME')
            const transactionStatement = db.prepare(`INSERT INTO ledger_transaction (
                transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
                student_id, payment_method, payment_reference, description, recorded_by_user_id, invoice_id
            ) VALUES (?, ?, 'FEE_PAYMENT', ?, ?, 'CREDIT', ?, 'CASH', 'CREDIT_BALANCE', 'Payment via Credit Balance', ?, ?)`)

            const transactionResult = transactionStatement.run(
                `TXN-CREDIT-${Date.now()}`,
                getTodayDate(),
                categoryId,
                amountCents,
                data.studentId,
                userId,
                data.invoiceId
            )

            db.prepare(`UPDATE fee_invoice SET amount_paid = amount_paid + ?,
                status = CASE WHEN amount_paid + ? >= total_amount THEN 'PAID' ELSE 'PARTIAL' END
                WHERE id = ?`).run(amountCents, amountCents, data.invoiceId)

            db.prepare('UPDATE student SET credit_balance = credit_balance - ? WHERE id = ?').run(amountCents, data.studentId)

            logAudit(userId, 'CREATE', 'ledger_transaction', transactionResult.lastInsertRowid as number, null, {
                action: 'PAY_WITH_CREDIT',
                amount: amountCents,
                invoiceId: data.invoiceId
            })

            return { success: true }
        })()
    })
}

const registerPaymentHandlers = (context: FinanceContext): void => {
    registerPaymentRecordHandler(context)
    registerPaymentQueryHandlers(context)
    registerPayWithCreditHandler(context)
}

const registerInvoiceHandlers = (context: FinanceContext): void => {
    const { db } = context

    ipcMain.handle('invoice:getItems', async (_event: IpcMainInvokeEvent, invoiceId: number) => {
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

    ipcMain.handle('invoice:create', async (_event: IpcMainInvokeEvent, data: InvoiceData, items: InvoiceItem[], userId: number) => {
        return db.transaction(() => {
            const invoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${String(Date.now()).slice(-6)}`
            const itemsInCents = items.map(item => ({ ...item, amount: item.amount }))
            const totalCents = itemsInCents.reduce((sum: number, item) => sum + item.amount, 0)

            const invoiceStatement = db.prepare(`INSERT INTO fee_invoice (
                invoice_number, student_id, term_id, academic_term_id, invoice_date, due_date,
                total_amount, amount, amount_due, original_amount, created_by_user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)

            const invoiceResult = invoiceStatement.run(
                invoiceNumber,
                data.student_id,
                data.term_id,
                data.term_id,
                data.invoice_date,
                data.due_date,
                totalCents,
                totalCents,
                totalCents,
                totalCents,
                userId
            )

            logAudit(userId, 'CREATE', 'fee_invoice', invoiceResult.lastInsertRowid as number, null, {
                ...data,
                total: totalCents,
                items: itemsInCents
            })

            const itemStatement = db.prepare('INSERT INTO invoice_item (invoice_id, fee_category_id, description, amount) VALUES (?, ?, ?, ?)')
            for (const item of itemsInCents) {
                itemStatement.run(invoiceResult.lastInsertRowid, item.fee_category_id, item.description, item.amount)
            }

            return { success: true, invoiceNumber, id: invoiceResult.lastInsertRowid }
        })()
    })

    ipcMain.handle('invoice:getByStudent', async (_event: IpcMainInvokeEvent, studentId: number) => {
        return db.prepare('SELECT * FROM fee_invoice WHERE student_id = ? ORDER BY invoice_date DESC').all(studentId) as FeeInvoiceDB[]
    })

    ipcMain.handle('invoice:getAll', async (_event: IpcMainInvokeEvent) => {
        const invoices = db.prepare(`
            SELECT fi.*,
                   s.first_name || ' ' || s.last_name as student_name,
                   t.term_name
            FROM fee_invoice fi
            JOIN student s ON fi.student_id = s.id
            JOIN term t ON fi.term_id = t.id
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

    ipcMain.handle('fee:getCategories', async (_event: IpcMainInvokeEvent) => {
        return db.prepare('SELECT * FROM fee_category WHERE is_active = 1').all()
    })

    ipcMain.handle('fee:createCategory', async (_event: IpcMainInvokeEvent, name: string, description: string) => {
        const statement = db.prepare('INSERT INTO fee_category (category_name, description) VALUES (?, ?)')
        const result = statement.run(name, description)
        return { success: true, id: result.lastInsertRowid }
    })

    ipcMain.handle('fee:getStructure', async (_event: IpcMainInvokeEvent, academicYearId: number, termId: number) => {
        return db.prepare(`
            SELECT fs.*, fc.category_name, s.stream_name
            FROM fee_structure fs
            JOIN fee_category fc ON fs.fee_category_id = fc.id
            JOIN stream s ON fs.stream_id = s.id
            WHERE fs.academic_year_id = ? AND fs.term_id = ?
        `).all(academicYearId, termId) as FeeStructureWithDetails[]
    })

    ipcMain.handle('fee:saveStructure', async (_event: IpcMainInvokeEvent, data: FeeStructureItemData[], academicYearId: number, termId: number) => {
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
        })

        execute(data)
        return { success: true }
    })

    ipcMain.handle('invoice:generateBatch', async (_event: IpcMainInvokeEvent, academicYearId: number, termId: number, userId: number) => {
        return generateBatchInvoices(context, academicYearId, termId, userId)
    })
}

const registerCreditHandlers = (): void => {
    const creditService = new CreditAutoApplicationService()

    ipcMain.handle('finance:allocateCredits', async (_event: IpcMainInvokeEvent, studentId: number, userId: number) => {
        try {
            return await creditService.allocateCreditsToInvoices(studentId, userId)
        } catch (error) {
            return { success: false, message: getErrorMessage(error, UNKNOWN_ERROR_MESSAGE) }
        }
    })

    ipcMain.handle('finance:getCreditBalance', async (_event: IpcMainInvokeEvent, studentId: number) => {
        try {
            return await creditService.getStudentCreditBalance(studentId)
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to get credit balance'))
        }
    })

    ipcMain.handle('finance:getCreditTransactions', async (_event: IpcMainInvokeEvent, studentId: number, limit?: number) => {
        try {
            return await creditService.getCreditTransactions(studentId, limit)
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to get credit transactions'))
        }
    })

    ipcMain.handle('finance:addCredit', async (_event: IpcMainInvokeEvent, studentId: number, amount: number, notes: string, userId: number) => {
        try {
            return await creditService.addCreditToStudent(studentId, amount, notes, userId)
        } catch (error) {
            return { success: false, message: getErrorMessage(error, UNKNOWN_ERROR_MESSAGE) }
        }
    })
}

const registerProrationHandlers = (): void => {
    const prorationService = new FeeProrationService()

    ipcMain.handle('finance:calculateProRatedFee', async (
        _event: IpcMainInvokeEvent,
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

    ipcMain.handle('finance:validateEnrollmentDate', async (
        _event: IpcMainInvokeEvent,
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

    ipcMain.handle('finance:generateProRatedInvoice', async (
        _event: IpcMainInvokeEvent,
        studentId: number,
        templateInvoiceId: number,
        enrollmentDate: string,
        userId: number
    ) => {
        try {
            return await prorationService.generateProRatedInvoice(studentId, templateInvoiceId, enrollmentDate, userId)
        } catch (error) {
            return { success: false, message: getErrorMessage(error, UNKNOWN_ERROR_MESSAGE) }
        }
    })

    ipcMain.handle('finance:getProRationHistory', async (_event: IpcMainInvokeEvent, studentId: number) => {
        try {
            return await prorationService.getStudentProRationHistory(studentId)
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to get proration history'))
        }
    })
}

const registerScholarshipHandlers = (): void => {
    const scholarshipService = new ScholarshipService()

    ipcMain.handle('finance:createScholarship', async (_event: IpcMainInvokeEvent, data: ScholarshipData, userId: number) => {
        try {
            return await scholarshipService.createScholarship(data, userId)
        } catch (error) {
            return { success: false, message: getErrorMessage(error, UNKNOWN_ERROR_MESSAGE) }
        }
    })

    ipcMain.handle('finance:allocateScholarship', async (_event: IpcMainInvokeEvent, allocationData: AllocationData, userId: number) => {
        try {
            return await scholarshipService.allocateScholarshipToStudent(allocationData, userId)
        } catch (error) {
            return { success: false, message: getErrorMessage(error, UNKNOWN_ERROR_MESSAGE) }
        }
    })

    ipcMain.handle('finance:validateScholarshipEligibility', async (_event: IpcMainInvokeEvent, studentId: number, scholarshipId: number) => {
        try {
            return await scholarshipService.validateScholarshipEligibility(studentId, scholarshipId)
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to validate eligibility'))
        }
    })

    ipcMain.handle('finance:getActiveScholarships', async (_event: IpcMainInvokeEvent) => {
        try {
            return await scholarshipService.getActiveScholarships()
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to get scholarships'))
        }
    })

    ipcMain.handle('finance:getStudentScholarships', async (_event: IpcMainInvokeEvent, studentId: number) => {
        try {
            return await scholarshipService.getStudentScholarships(studentId)
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to get student scholarships'))
        }
    })

    ipcMain.handle('finance:getScholarshipAllocations', async (_event: IpcMainInvokeEvent, scholarshipId: number) => {
        try {
            return await scholarshipService.getScholarshipAllocations(scholarshipId)
        } catch (error) {
            throw new Error(getErrorMessage(error, 'Failed to get allocations'))
        }
    })

    ipcMain.handle('finance:applyScholarshipToInvoice', async (
        _event: IpcMainInvokeEvent,
        studentScholarshipId: number,
        invoiceId: number,
        amountToApply: number,
        userId: number
    ) => {
        try {
            return await scholarshipService.applyScholarshipToInvoice(studentScholarshipId, invoiceId, amountToApply, userId)
        } catch (error) {
            return { success: false, message: getErrorMessage(error, UNKNOWN_ERROR_MESSAGE) }
        }
    })
}

export function registerFinanceHandlers(): void {
    const db = getDatabase()
    const context: FinanceContext = {
        db,
        exemptionService: new ExemptionService(),
        paymentService: new PaymentService(),
        getOrCreateCategoryId: createGetOrCreateCategoryId(db)
    }

    registerCashFlowHandlers()
    registerPaymentHandlers(context)
    registerInvoiceHandlers(context)
    registerFeeStructureHandlers(context)
    registerCreditHandlers()
    registerProrationHandlers()
    registerScholarshipHandlers()
}
