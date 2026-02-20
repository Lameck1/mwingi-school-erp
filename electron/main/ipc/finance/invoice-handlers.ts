import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { generateBatchInvoices, generateSingleStudentInvoice, type FinanceContext } from './finance-handler-utils'
import { logAudit } from '../../database/utils/audit'
import { container } from '../../services/base/ServiceContainer'
import {
    buildFeeInvoiceAmountSql,
    buildFeeInvoiceOutstandingBalanceSql,
    buildFeeInvoiceOutstandingStatusPredicate
} from '../../utils/feeInvoiceSql'
import { ROLES } from '../ipc-result'
import {
    CreateInvoiceTuple,
    FeeCategoryTuple, GetFeeStructureTuple, SaveFeeStructureTuple,
    GenerateBatchTuple, GenerateStudentInvoiceTuple
} from '../schemas/finance-transaction-schemas'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

import type { InvoiceItem, FeeInvoiceDB, FeeInvoiceWithDetails, FeeStructureWithDetails } from './types'
import type { getDatabase } from '../../database'

function createInvoice(
    db: ReturnType<typeof getDatabase>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: any[],
    userId: number
) {
    // ... existing implementation ...
    // Copying the implementation because I need to replace the whole file content helper is generic
    // Actually, I can just keep the helpers if I just change the register functions?
    // The previous view_file showed helpers `createInvoice` inside the file. 
    // I should preserve it.

    // I will use the code from previous view_file, just replacing register functions.
    // BUT `replace_file_content` for large blocks might be error prone if unchanged lines not perfectly matched.
    // I will write the WHOLE file.

    // Helper helpers from original file:
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const normalizeItems = (rows: any[]) => rows
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isSameItemSet = (a: any[], b: any[]) => {
        if (a.length !== b.length) { return false }
        const left = normalizeItems(a)
        const right = normalizeItems(b)
        return left.every((item, index) => {
            const other = right[index]
            if (!other) { return false }
            return item.fee_category_id === other.fee_category_id &&
                item.amount === other.amount &&
                item.description === other.description
        })
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

export const registerInvoiceHandlers = (context: FinanceContext): void => {
    const { db } = context
    const invoiceAmountSql = buildFeeInvoiceAmountSql(db, 'fi')
    const outstandingBalanceSql = buildFeeInvoiceOutstandingBalanceSql(db, 'fi')
    const outstandingStatusPredicate = buildFeeInvoiceOutstandingStatusPredicate(db, 'fi')

    validatedHandler('invoice:getItems', ROLES.STAFF, z.number().int().positive(), (_event, invoiceId) => {
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

    validatedHandlerMulti('invoice:create', ROLES.FINANCE, CreateInvoiceTuple, (event, [data, items, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        // data and items validated by schema
        return createInvoice(db, data, items, actor.id)
    })

    validatedHandler('invoice:getByStudent', ROLES.STAFF, z.number().int().positive(), (_event, studentId) => {
        return db.prepare('SELECT * FROM fee_invoice WHERE student_id = ? ORDER BY invoice_date DESC').all(studentId) as FeeInvoiceDB[]
    })

    validatedHandler('invoice:getAll', ROLES.STAFF, z.void(), (_event) => {
        const invoices = db.prepare(`
            SELECT fi.*,
                   s.first_name || ' ' || s.last_name as student_name,
                   t.term_name,
                   ${invoiceAmountSql} as normalized_total_amount,
                   COALESCE(fi.amount_paid, 0) as normalized_amount_paid,
                   CASE
                     WHEN ${outstandingStatusPredicate}
                       THEN MAX(${outstandingBalanceSql}, 0)
                     ELSE 0
                   END as normalized_balance
            FROM fee_invoice fi
            JOIN student s ON fi.student_id = s.id
            LEFT JOIN term t ON fi.term_id = t.id
            ORDER BY fi.invoice_date DESC
        `).all() as Array<FeeInvoiceWithDetails & {
            normalized_total_amount: number
            normalized_amount_paid: number
            normalized_balance: number
        }>

        return invoices.map(invoice => ({
            ...invoice,
            total_amount: invoice.normalized_total_amount,
            amount_paid: invoice.normalized_amount_paid,
            balance: invoice.normalized_balance
        }))
    })
}

export const registerFeeStructureHandlers = (context: FinanceContext): void => {
    const { db } = context

    validatedHandler('fee:getCategories', ROLES.STAFF, z.void(), (_event) => {
        return db.prepare('SELECT * FROM fee_category WHERE is_active = 1').all()
    })

    validatedHandlerMulti('fee:createCategory', ROLES.FINANCE, FeeCategoryTuple, (event, [name, description, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        const trimmedName = name.trim()
        const existing = db.prepare('SELECT id FROM fee_category WHERE category_name = ? AND is_active = 1').get(trimmedName)
        if (existing) {
            // return { success: false, error: ... }
            // validatedHandler catches errors. Throwing is fine or returning object.
            // But existing patterns in this file return { success: false, error: ... }
            // Let's return error object to be consistent with client expectation?
            // validatedHandler doesn't enforce return type, but calls handler.
            return { success: false, error: 'A fee category with this name already exists' }
        }

        const statement = db.prepare('INSERT INTO fee_category (category_name, description) VALUES (?, ?)')
        const result = statement.run(trimmedName, description.trim() || '')

        logAudit(actor.id, 'CREATE', 'fee_category', result.lastInsertRowid as number, null, { name: trimmedName, description })

        return { success: true, id: result.lastInsertRowid }
    })

    validatedHandlerMulti('fee:getStructure', ROLES.STAFF, GetFeeStructureTuple, (_event, [academicYearId, termId]) => {
        return db.prepare(`
            SELECT fs.*, fc.category_name, s.stream_name
            FROM fee_structure fs
            JOIN fee_category fc ON fs.fee_category_id = fc.id
            JOIN stream s ON fs.stream_id = s.id
            WHERE fs.academic_year_id = ? AND fs.term_id = ?
        `).all(academicYearId, termId) as FeeStructureWithDetails[]
    })

    validatedHandlerMulti('fee:saveStructure', ROLES.FINANCE, SaveFeeStructureTuple, (event, [data, academicYearId, termId, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        // data validation handled by schema

        const deleteStatement = db.prepare('DELETE FROM fee_structure WHERE academic_year_id = ? AND term_id = ?')
        const insertStatement = db.prepare(`
            INSERT INTO fee_structure (academic_year_id, term_id, stream_id, student_type, fee_category_id, amount)
            VALUES (?, ?, ?, ?, ?, ?)
        `)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const execute = db.transaction((items: any[]) => {
            deleteStatement.run(academicYearId, termId)
            for (const item of items) {
                insertStatement.run(academicYearId, termId, item.stream_id, item.student_type, item.fee_category_id, item.amount)
            }

            logAudit(actor.id, 'UPDATE', 'fee_structure', 0, null, {
                academicYearId, termId, itemCount: items.length
            })
        })

        execute(data)
        return { success: true }
    })

    validatedHandlerMulti('invoice:generateBatch', ROLES.FINANCE, GenerateBatchTuple, (event, [academicYearId, termId, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        return generateBatchInvoices(context, academicYearId, termId, actor.id)
    })

    validatedHandlerMulti('invoice:generateForStudent', ROLES.FINANCE, GenerateStudentInvoiceTuple, (event, [studentId, academicYearId, termId, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        return generateSingleStudentInvoice(context, studentId, academicYearId, termId, actor.id)
    })
}
