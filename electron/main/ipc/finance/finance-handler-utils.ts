import { type ExemptionService } from '../../services/finance/ExemptionService'
import { type PaymentService } from '../../services/finance/PaymentService'

import type { InvoiceItemCreation } from './types'
import type { getDatabase } from '../../database'

type FinanceDb = ReturnType<typeof getDatabase>

type CategoryType = 'INCOME' | 'EXPENSE'

interface FeeStructureRecord {
    id: number
    academic_year_id: number
    term_id: number
    stream_id: number
    student_type: string
    fee_category_id: number
    amount: number
    fee_items: string
    total_amount: number
    created_at: string
}

interface EnrollmentRecord {
    id: number
    student_id: number
    academic_year_id: number
    term_id: number
    stream_id: number
    student_type: string
    class_id: number
    status: string
    first_name: string
    last_name: string
}

interface StudentExemption {
    id: number
    fee_category_id: number | null
    status: string
    exemption_percentage: number
}

interface InvoiceComputation {
    invoiceItems: InvoiceItemCreation[]
    invoiceTotal: number
    originalTotal: number
}

export interface FinanceContext {
    db: FinanceDb
    exemptionService: ExemptionService
    paymentService: PaymentService
    getOrCreateCategoryId: (name: string, type?: CategoryType) => number
}

const NO_ENROLLMENTS_MESSAGE = 'No active enrollments found for this term. Please enroll students first.'
const NO_FEE_STRUCTURE_MESSAGE = 'No fee structure defined for this term'
const TERM_FEE_DESCRIPTION = 'Term Fee'

export const UNKNOWN_ERROR_MESSAGE = 'Unknown error'
export const UNKNOWN_ERROR_OCCURRED_MESSAGE = 'Unknown error occurred'

export const getTodayDate = (): string => new Date().toISOString().slice(0, 10)

export const getErrorMessage = (error: unknown, fallbackMessage: string): string => {
    if (error instanceof Error) {
        return error.message
    }

    return fallbackMessage
}

export const createGetOrCreateCategoryId = (db: FinanceDb): ((name: string, type?: CategoryType) => number) => {
    return (name: string, type: CategoryType = 'INCOME') => {
        const row = db.prepare('SELECT id FROM transaction_category WHERE category_name = ? LIMIT 1').get(name) as { id: number } | undefined
        if (row?.id) {
            return row.id
        }

        const result = db.prepare('INSERT INTO transaction_category (category_name, category_type, is_system, is_active) VALUES (?, ?, 1, 1)').run(name, type)
        return result.lastInsertRowid as number
    }
}

const fetchFeeStructure = (db: FinanceDb, academicYearId: number, termId: number): FeeStructureRecord[] => {
    return db.prepare(`
        SELECT * FROM fee_structure
        WHERE academic_year_id = ? AND term_id = ?
    `).all(academicYearId, termId) as FeeStructureRecord[]
}

const fetchActiveEnrollments = (db: FinanceDb, academicYearId: number, termId: number): EnrollmentRecord[] => {
    return db.prepare(`
        SELECT e.*, s.first_name, s.last_name
        FROM enrollment e
        JOIN student s ON e.student_id = s.id
        WHERE e.academic_year_id = ? AND e.term_id = ? AND e.status = 'ACTIVE'
    `).all(academicYearId, termId) as EnrollmentRecord[]
}

const getApplicableFees = (structure: FeeStructureRecord[], enrollment: EnrollmentRecord): FeeStructureRecord[] => {
    return structure.filter(fee => fee.stream_id === enrollment.stream_id && fee.student_type === enrollment.student_type)
}

const computeInvoiceItems = (fees: FeeStructureRecord[], exemptions: StudentExemption[]): InvoiceComputation => {
    let invoiceTotal = 0
    let originalTotal = 0
    const invoiceItems: InvoiceItemCreation[] = []

    for (const fee of fees) {
        const originalAmount = fee.amount
        const specificExemption = exemptions.find(item => item.fee_category_id === fee.fee_category_id && item.status === 'ACTIVE')
        const blanketExemption = exemptions.find(item => !item.fee_category_id && item.status === 'ACTIVE')
        const activeExemption = specificExemption ?? blanketExemption

        let finalAmount = originalAmount
        let exemptionAmount = 0
        let exemptionId: number | null = null

        if (activeExemption) {
            exemptionAmount = Math.round((originalAmount * activeExemption.exemption_percentage) / 100)
            finalAmount = originalAmount - exemptionAmount
            exemptionId = activeExemption.id
        }

        invoiceTotal += finalAmount
        originalTotal += originalAmount

        invoiceItems.push({
            fee_category_id: fee.fee_category_id,
            description: TERM_FEE_DESCRIPTION,
            amount: finalAmount,
            exemption_id: exemptionId,
            original_amount: originalAmount,
            exemption_amount: exemptionAmount
        })
    }

    return { invoiceItems, invoiceTotal, originalTotal }
}

const createBatchInvoiceNumber = (academicYearId: number, termId: number, studentId: number): string => {
    return `INV-${academicYearId}-${termId}-${studentId}-${Date.now().toString().slice(-4)}`
}

export const generateBatchInvoices = (context: FinanceContext, academicYearId: number, termId: number, userId: number): { success: boolean, count?: number, message?: string } => {
    const { db, exemptionService } = context
    const structure = fetchFeeStructure(db, academicYearId, termId)
    if (structure.length === 0) {
        return { success: false, message: NO_FEE_STRUCTURE_MESSAGE }
    }

    const enrollments = fetchActiveEnrollments(db, academicYearId, termId)
    if (enrollments.length === 0) {
        return { success: false, message: NO_ENROLLMENTS_MESSAGE }
    }

    let count = 0
    const checkInvoiceStmt = db.prepare('SELECT id FROM fee_invoice WHERE student_id = ? AND term_id = ?')
    const insertInvoiceStmt = db.prepare(`
        INSERT INTO fee_invoice (
            invoice_number, student_id, term_id, academic_term_id,
            invoice_date, due_date, total_amount, amount, amount_due, original_amount, created_by_user_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insertItemStmt = db.prepare(`
        INSERT INTO invoice_item (invoice_id, fee_category_id, description, amount, exemption_id, original_amount, exemption_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    const execute = db.transaction(() => {
        for (const enrollment of enrollments) {
            const existingInvoice = checkInvoiceStmt.get(enrollment.student_id, enrollment.term_id)
            if (existingInvoice) {
                continue
            }

            const fees = getApplicableFees(structure, enrollment)
            if (fees.length === 0) {
                continue
            }

            const exemptions = exemptionService.getStudentExemptions(enrollment.student_id, academicYearId, termId) as StudentExemption[]
            const { invoiceItems, invoiceTotal, originalTotal } = computeInvoiceItems(fees, exemptions)
            const invoiceDate = getTodayDate()

            const insertResult = insertInvoiceStmt.run(
                createBatchInvoiceNumber(academicYearId, termId, enrollment.student_id),
                enrollment.student_id,
                enrollment.term_id,
                enrollment.term_id,
                invoiceDate,
                invoiceDate,
                invoiceTotal,
                invoiceTotal,
                invoiceTotal,
                originalTotal,
                userId
            )

            const invoiceId = insertResult.lastInsertRowid
            for (const item of invoiceItems) {
                insertItemStmt.run(
                    invoiceId,
                    item.fee_category_id,
                    item.description,
                    item.amount,
                    item.exemption_id,
                    item.original_amount,
                    item.exemption_amount
                )
            }

            count += 1
        }
    })

    try {
        execute()
        return { success: true, count }
    } catch (error) {
        console.error(error)
        return { success: false, message: getErrorMessage(error, UNKNOWN_ERROR_OCCURRED_MESSAGE) }
    }
}
