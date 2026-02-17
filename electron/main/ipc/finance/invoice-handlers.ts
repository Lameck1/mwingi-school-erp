import { randomUUID } from 'node:crypto'

import { generateBatchInvoices, generateSingleStudentInvoice, type FinanceContext } from './finance-handler-utils'
import { logAudit } from '../../database/utils/audit'
import { container } from '../../services/base/ServiceContainer'
import {
    buildFeeInvoiceAmountSql,
    buildFeeInvoiceOutstandingBalanceSql,
    buildFeeInvoiceOutstandingStatusPredicate
} from '../../utils/feeInvoiceSql'
import { validateDate, validateId } from '../../utils/validation'
import { safeHandleRawWithRole, ROLES, resolveActorId } from '../ipc-result'

import type { InvoiceData, InvoiceItem, FeeStructureItemData, FeeInvoiceDB, FeeInvoiceWithDetails, FeeStructureWithDetails } from './types'
import type { getDatabase } from '../../database'

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

export const registerInvoiceHandlers = (context: FinanceContext): void => {
    const { db } = context
    const invoiceAmountSql = buildFeeInvoiceAmountSql(db, 'fi')
    const outstandingBalanceSql = buildFeeInvoiceOutstandingBalanceSql(db, 'fi')
    const outstandingStatusPredicate = buildFeeInvoiceOutstandingStatusPredicate(db, 'fi')

    safeHandleRawWithRole('invoice:getItems', ROLES.STAFF, (_event, invoiceId: number) => {
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

    safeHandleRawWithRole('invoice:create', ROLES.FINANCE, (event, data: InvoiceData, items: InvoiceItem[], legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) {
            return { success: false, error: actor.error }
        }

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

        return createInvoice(db, data, items, actor.actorId)
    })

    safeHandleRawWithRole('invoice:getByStudent', ROLES.STAFF, (_event, studentId: number) => {
        return db.prepare('SELECT * FROM fee_invoice WHERE student_id = ? ORDER BY invoice_date DESC').all(studentId) as FeeInvoiceDB[]
    })

    safeHandleRawWithRole('invoice:getAll', ROLES.STAFF, (_event) => {
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

    safeHandleRawWithRole('fee:getCategories', ROLES.STAFF, (_event) => {
        return db.prepare('SELECT * FROM fee_category WHERE is_active = 1').all()
    })

    safeHandleRawWithRole('fee:createCategory', ROLES.FINANCE, (event, name: string, description: string, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) {
            return { success: false, error: actor.error }
        }

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

        logAudit(actor.actorId, 'CREATE', 'fee_category', result.lastInsertRowid as number, null, { name: trimmedName, description })

        return { success: true, id: result.lastInsertRowid }
    })

    safeHandleRawWithRole('fee:getStructure', ROLES.STAFF, (_event, academicYearId: number, termId: number) => {
        return db.prepare(`
            SELECT fs.*, fc.category_name, s.stream_name
            FROM fee_structure fs
            JOIN fee_category fc ON fs.fee_category_id = fc.id
            JOIN stream s ON fs.stream_id = s.id
            WHERE fs.academic_year_id = ? AND fs.term_id = ?
        `).all(academicYearId, termId) as FeeStructureWithDetails[]
    })

    safeHandleRawWithRole('fee:saveStructure', ROLES.FINANCE, (event, data: FeeStructureItemData[], academicYearId: number, termId: number, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) {
            return { success: false, error: actor.error }
        }

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

            logAudit(actor.actorId, 'UPDATE', 'fee_structure', 0, null, {
                academicYearId, termId, itemCount: items.length
            })
        })

        execute(data)
        return { success: true }
    })

    safeHandleRawWithRole('invoice:generateBatch', ROLES.FINANCE, (event, academicYearId: number, termId: number, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) {
            return { success: false, error: actor.error }
        }
        return generateBatchInvoices(context, academicYearId, termId, actor.actorId)
    })

    safeHandleRawWithRole('invoice:generateForStudent', ROLES.FINANCE, (event, studentId: number, academicYearId: number, termId: number, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) {
            return { success: false, error: actor.error }
        }
        return generateSingleStudentInvoice(context, studentId, academicYearId, termId, actor.actorId)
    })
}
