import { getDatabase } from '../database'
import { shillingsToCents } from '../utils/money'
import { DoubleEntryJournalService } from './accounting/DoubleEntryJournalService'
import { CurrencyNormalizationService } from './maintenance/CurrencyNormalizationService'
import {
    FEE_MAP_SHILLINGS,
    RESET_TABLES,
    STAFF_SPECS,
    STUDENT_FIRST_NAMES,
    STUDENT_LAST_NAMES,
    CBC_SUBJECTS,
    EXAM_TYPES,
} from './maintenance/seed-constants'

import type { AcademicPeriod, FeeCategory, FeeStructureResult, Stream, TransactionCategory } from './maintenance/seed-constants'

export class SystemMaintenanceService {
    private readonly currencyNormalization = new CurrencyNormalizationService()

    async resetAndSeed2026(userId: number): Promise<{ success: boolean; error?: string }> {
        const db = getDatabase()
        let period: AcademicPeriod | undefined // Declare period here

        try {
            db.pragma('foreign_keys = OFF')
            db.transaction(() => {
                period = this.runResetTransaction(db, userId)
            })()
            await this.currencyNormalization.normalize(userId)
            await this.seedJournalEntries(db, userId)
            if (period) { // Ensure period is defined before using it
                this.seedExaminationData(db, period, userId)
            }
            return { success: true }
        } catch (error) {
            console.error('Data reset failed:', error)
            return { success: false, error: error instanceof Error ? error.message : 'Reset failed' }
        } finally {
            try { db.pragma('foreign_keys = ON') } catch { /* ignore */ }
        }
    }

    async normalizeCurrencyScale(userId: number): Promise<{ success: boolean; error?: string }> {
        return this.currencyNormalization.normalize(userId)
    }

    private runResetTransaction(db: ReturnType<typeof getDatabase>, userId: number): AcademicPeriod {
        this.clearResetTables(db)
        this.seedCoreReferenceData(db)

        const period = this.seedAcademicCalendar(db)
        const streams = db.prepare('SELECT id, stream_code, stream_name FROM stream WHERE is_active = 1').all() as Stream[]
        const feeCategories = db.prepare('SELECT id, category_name FROM fee_category WHERE is_active = 1').all() as FeeCategory[]
        const transactionCategories = db.prepare('SELECT id, category_name, category_type FROM transaction_category WHERE is_active = 1').all() as TransactionCategory[]

        this.seedFeeStructures(db, streams, feeCategories, period)
        this.seedStudentsAndInvoices(db, streams, period, transactionCategories, userId)
        this.seedExpenses(db, transactionCategories, userId)
        this.seedStaffAndPayroll(db)
        this.seedInventory(db, userId)
        this.seedAttendance(db, period, userId)

        db.prepare(`
            INSERT INTO audit_log (user_id, action_type, table_name, record_id, new_values)
            VALUES (?, 'SYSTEM_RESET', 'DATABASE', 0, 'Full Institutional Seeding for 2026 Done')
        `).run(userId)

        return period
    }

    private clearResetTables(db: ReturnType<typeof getDatabase>): void {
        for (const tableName of RESET_TABLES) {
            const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(tableName)
            if (!exists) { continue }
            db.prepare(`DELETE FROM ${tableName}`).run()
            db.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run(tableName)
        }
    }

    private seedCoreReferenceData(db: ReturnType<typeof getDatabase>): void {
        db.exec(`
            INSERT INTO stream (stream_code, stream_name, level_order, is_junior_secondary) VALUES
            ('BABY', 'Baby Class', 1, 0), ('PP1', 'Pre-Primary 1', 2, 0), ('PP2', 'Pre-Primary 2', 3, 0),
            ('G1', 'Grade 1', 4, 0), ('G2', 'Grade 2', 5, 0), ('G3', 'Grade 3', 6, 0),
            ('G4', 'Grade 4', 7, 0), ('G5', 'Grade 5', 8, 0), ('G6', 'Grade 6', 9, 0),
            ('G7', 'Grade 7', 10, 1), ('G8', 'Grade 8', 11, 1), ('G9', 'Grade 9', 12, 1);

            INSERT INTO fee_category (category_name, description) VALUES
            ('Tuition', 'Tuition fees'), ('Feeding', 'Meals/Feeding fees'), ('Maintenance', 'School maintenance'),
            ('Boarding', 'Boarding fees for boarders');

            INSERT INTO grading_scale (curriculum, grade, min_score, max_score, points, remarks) VALUES
            ('CBC', 'EE1', 90, 100, 4, 'Exceeding Expectations'),
            ('CBC', 'EE2', 75, 89, 4, 'Exceeding Expectations'),
            ('CBC', 'ME1', 58, 74, 3, 'Meeting Expectations'),
            ('CBC', 'ME2', 41, 57, 3, 'Meeting Expectations'),
            ('CBC', 'AE1', 31, 40, 2, 'Approaching Expectations'),
            ('CBC', 'AE2', 21, 30, 2, 'Approaching Expectations'),
            ('CBC', 'BE1', 11, 20, 1, 'Below Expectations'),
            ('CBC', 'BE2', 1, 10, 1, 'Below Expectations'),
            ('8-4-4', 'A', 80, 100, 12, 'Plain'),
            ('8-4-4', 'A-', 75, 79, 11, 'Minus'),
            ('8-4-4', 'B+', 70, 74, 10, 'Plus'),
            ('8-4-4', 'B', 65, 69, 9, 'Plain'),
            ('8-4-4', 'B-', 60, 64, 8, 'Minus'),
            ('8-4-4', 'C+', 55, 59, 7, 'Plus'),
            ('8-4-4', 'C', 50, 54, 6, 'Plain'),
            ('8-4-4', 'C-', 45, 49, 5, 'Minus'),
            ('8-4-4', 'D+', 40, 44, 4, 'Plus'),
            ('8-4-4', 'D', 35, 39, 3, 'Plain'),
            ('8-4-4', 'D-', 30, 34, 2, 'Minus'),
            ('8-4-4', 'E', 0, 29, 1, 'Plain');
        `)
    }

    private seedAcademicCalendar(db: ReturnType<typeof getDatabase>): AcademicPeriod {
        const yearId = db.prepare(`
            INSERT INTO academic_year (year_name, start_date, end_date, is_current)
            VALUES ('2026', '2026-01-05', '2026-11-27', 1)
        `).run().lastInsertRowid as number

        const termId = db.prepare(`
            INSERT INTO term (academic_year_id, term_number, term_name, start_date, end_date, is_current, status)
            VALUES (?, 1, 'Term 1', '2026-01-05', '2026-04-10', 1, 'OPEN')
        `).run(yearId).lastInsertRowid as number

        return { yearId, termId }
    }

    private seedFeeStructures(db: ReturnType<typeof getDatabase>, streams: Stream[], categories: FeeCategory[], period: AcademicPeriod): void {
        const tuitionCategory = categories.find(c => c.category_name === 'Tuition')?.id
        const feedingCategory = categories.find(c => c.category_name === 'Feeding')?.id
        const maintenanceCategory = categories.find(c => c.category_name === 'Maintenance')?.id
        const boardingCategory = categories.find(c => c.category_name === 'Boarding')?.id

        const insertFee = (streamId: number, studentType: string, categoryId: number | undefined, amountShillings: number, desc: string) => {
            if (!categoryId || amountShillings <= 0) { return }
            db.prepare(`INSERT INTO fee_structure (academic_year_id, stream_id, student_type, term_id, fee_category_id, amount, description) VALUES (?, ?, ?, ?, ?, ?, ?)`)
                .run(period.yearId, streamId, studentType, period.termId, categoryId, shillingsToCents(amountShillings), desc)
        }

        for (const stream of streams) {
            const fees = FEE_MAP_SHILLINGS[stream.stream_code]
            if (!fees) { continue }
            insertFee(stream.id, 'DAY_SCHOLAR', tuitionCategory, fees.DAY[0], `Tuition - ${stream.stream_name}`)
            insertFee(stream.id, 'DAY_SCHOLAR', feedingCategory, fees.DAY[1], `Feeding - ${stream.stream_name}`)
            insertFee(stream.id, 'DAY_SCHOLAR', maintenanceCategory, fees.DAY[2], `Maintenance - ${stream.stream_name}`)
            insertFee(stream.id, 'BOARDER', tuitionCategory, fees.BOARDER[0], `Tuition - ${stream.stream_name}`)
            insertFee(stream.id, 'BOARDER', feedingCategory, fees.BOARDER[1], `Feeding - ${stream.stream_name}`)
            insertFee(stream.id, 'BOARDER', boardingCategory, fees.BOARDER[2], `Boarding - ${stream.stream_name}`)
        }
    }

    private seedStudentsAndInvoices(db: ReturnType<typeof getDatabase>, streams: Stream[], period: AcademicPeriod, categories: TransactionCategory[], userId: number): void {
        const schoolFeesCategory = categories.find(c => c.category_name === 'School Fees')?.id
        let studentIndex = 0

        for (const stream of streams) {
            for (let slot = 0; slot < 2; slot++) {
                this.seedSingleStudent(db, { stream, period, categoryId: schoolFeesCategory, userId, idx: studentIndex })
                studentIndex += 1
            }
        }
    }

    private seedSingleStudent(db: ReturnType<typeof getDatabase>, args: { stream: Stream; period: AcademicPeriod; categoryId: number | undefined; userId: number; idx: number }): void {
        const { stream, period, categoryId, userId, idx } = args
        const firstName = STUDENT_FIRST_NAMES[idx % STUDENT_FIRST_NAMES.length]
        const lastName = STUDENT_LAST_NAMES[idx % STUDENT_LAST_NAMES.length]
        const studentType = idx % 3 === 0 ? 'BOARDER' : 'DAY_SCHOLAR'
        const gender = idx % 2 === 0 ? 'M' : 'F'
        const admNo = `2026/${String(idx + 1).padStart(3, '0')}`

        const studentId = db.prepare(`INSERT INTO student (admission_number, first_name, last_name, student_type, gender, admission_date, is_active) VALUES (?, ?, ?, ?, ?, '2026-01-05', 1)`)
            .run(admNo, firstName, lastName, studentType, gender).lastInsertRowid as number

        db.prepare(`INSERT INTO enrollment (student_id, academic_year_id, term_id, stream_id, student_type, enrollment_date, status) VALUES (?, ?, ?, ?, ?, '2026-01-05', 'ACTIVE')`)
            .run(studentId, period.yearId, period.termId, stream.id, studentType)

        const invoiceId = db.prepare(`INSERT INTO fee_invoice (invoice_number, student_id, term_id, invoice_date, due_date, total_amount, amount_paid, status, created_by_user_id) VALUES (?, ?, ?, '2026-01-05', '2026-02-05', 0, 0, 'PENDING', ?)`)
            .run(`INV-${admNo}-T1`, studentId, period.termId, userId).lastInsertRowid as number

        const structures = db.prepare(`SELECT fs.fee_category_id, fc.category_name, fs.amount FROM fee_structure fs JOIN fee_category fc ON fs.fee_category_id = fc.id WHERE fs.stream_id = ? AND fs.student_type = ? AND fs.term_id = ?`)
            .all(stream.id, studentType, period.termId) as FeeStructureResult[]
        let total = 0
        for (const s of structures) {
            db.prepare(`INSERT INTO invoice_item (invoice_id, fee_category_id, description, amount) VALUES (?, ?, ?, ?)`).run(invoiceId, s.fee_category_id, s.category_name, s.amount)
            total += s.amount
        }
        db.prepare('UPDATE fee_invoice SET total_amount = ? WHERE id = ?').run(total, invoiceId)

        const ratio = (idx % 10) / 10
        let paymentAmount = 0
        if (ratio > 0.6) { paymentAmount = total }
        else if (ratio > 0.3) { paymentAmount = Math.floor(total * 0.5) }
        if (paymentAmount > 0) {
            const txnRef = `PAY-${admNo}-T1`
            const payRef = `34262K ${firstName} ${stream.stream_code}`
            const txnId = db.prepare(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, payment_method, payment_reference, description, recorded_by_user_id) VALUES (?, '2026-01-10', 'FEE_PAYMENT', ?, ?, 'CREDIT', ?, 'MPESA', ?, 'Term 1 Fee Payment', ?)`)
                .run(txnRef, categoryId, paymentAmount, studentId, payRef, userId).lastInsertRowid as number
            db.prepare(`INSERT INTO receipt (receipt_number, transaction_id, receipt_date, student_id, amount, payment_method, payment_reference, created_by_user_id) VALUES (?, ?, '2026-01-10', ?, ?, 'MPESA', ?, ?)`)
                .run(`REC-${admNo}-T1`, txnId, studentId, paymentAmount, payRef, userId)
            db.prepare('UPDATE fee_invoice SET amount_paid = ?, status = ? WHERE id = ?')
                .run(paymentAmount, paymentAmount >= total ? 'PAID' : 'PARTIAL', invoiceId)
        }
    }

    private seedExpenses(db: ReturnType<typeof getDatabase>, categories: TransactionCategory[], userId: number): void {
        const utilitiesCategory = categories.find(c => c.category_name === 'Utilities')?.id
        db.prepare(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, description, recorded_by_user_id) VALUES ('EXP-2026-001', '2026-01-15', 'EXPENSE', ?, ?, 'DEBIT', 'January Electricity Bill', ?)`)
            .run(utilitiesCategory, shillingsToCents(25_000), userId)
    }

    private seedStaffAndPayroll(db: ReturnType<typeof getDatabase>): void {
        const periodId = db.prepare(`INSERT INTO payroll_period (period_name, month, year, start_date, end_date, status) VALUES ('January 2026', 1, 2026, '2026-01-01', '2026-01-31', 'OPEN')`)
            .run().lastInsertRowid as number

        for (const spec of STAFF_SPECS) {
            const cents = shillingsToCents(spec.salaryShillings)
            const staffId = db.prepare(`INSERT INTO staff (staff_number, first_name, last_name, job_title, basic_salary, is_active, employment_date) VALUES (?, ?, ?, ?, ?, 1, '2024-01-01')`)
                .run(spec.no, spec.first, spec.last, spec.job, cents).lastInsertRowid as number
            db.prepare(`INSERT INTO payroll (period_id, staff_id, basic_salary, gross_salary, total_deductions, net_salary, payment_status) VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`)
                .run(periodId, staffId, cents, cents, 0, cents)
        }
    }

    private seedInventory(db: ReturnType<typeof getDatabase>, userId: number): void {
        const cat = db.prepare('SELECT id FROM inventory_category LIMIT 1').get() as { id: number } | undefined
        if (!cat) { return }

        const unitCost = shillingsToCents(250)
        const itemId = db.prepare(`INSERT INTO inventory_item (item_code, item_name, category_id, unit_of_measure, current_stock, unit_cost) VALUES ('STA-001', 'Chalks White (Box)', ?, 'Box', 100, ?)`)
            .run(cat.id, unitCost).lastInsertRowid as number
        db.prepare(`INSERT INTO stock_movement (item_id, movement_type, quantity, unit_cost, total_cost, description, movement_date, recorded_by_user_id) VALUES (?, 'IN', 100, ?, ?, 'Opening Stock', '2026-01-05', ?)`)
            .run(itemId, unitCost, unitCost * 100, userId)
        db.prepare(`INSERT INTO stock_movement (item_id, movement_type, quantity, description, movement_date, recorded_by_user_id) VALUES (?, 'OUT', 10, 'Issued to Grade 1', '2026-01-10', ?)`)
            .run(itemId, userId)
        db.prepare('UPDATE inventory_item SET current_stock = 90 WHERE id = ?').run(itemId)
    }

    private seedAttendance(db: ReturnType<typeof getDatabase>, period: AcademicPeriod, userId: number): void {
        const row = db.prepare('SELECT student_id as id, stream_id FROM enrollment LIMIT 1').get() as { id: number; stream_id: number } | undefined
        if (!row) { return }
        db.prepare(`INSERT INTO attendance (student_id, stream_id, academic_year_id, term_id, attendance_date, status, marked_by_user_id) VALUES (?, ?, ?, ?, '2026-01-05', 'PRESENT', ?)`)
            .run(row.id, row.stream_id, period.yearId, period.termId, userId)
    }

    private async seedJournalEntries(db: ReturnType<typeof getDatabase>, userId: number): Promise<void> {
        const journalService = new DoubleEntryJournalService(db)

        const invoices = db.prepare(`SELECT fi.id, fi.student_id, fi.invoice_date FROM fee_invoice fi ORDER BY fi.id`)
            .all() as Array<{ id: number; student_id: number; invoice_date: string }>

        for (const invoice of invoices) {
            const items = db.prepare(`SELECT ii.amount, fc.gl_account_id, ga.account_code, fc.category_name FROM invoice_item ii JOIN fee_category fc ON ii.fee_category_id = fc.id LEFT JOIN gl_account ga ON fc.gl_account_id = ga.id WHERE ii.invoice_id = ?`)
                .all(invoice.id) as Array<{ amount: number; gl_account_id: number | null; account_code: string | null; category_name: string }>
            const mapped = items.map(i => ({ gl_account_code: i.account_code ?? '4300', amount: i.amount, description: i.category_name }))
            if (mapped.length > 0) {
                await journalService.recordInvoice(invoice.student_id, mapped, invoice.invoice_date, userId)
            }
        }

        const payments = db.prepare(`SELECT lt.student_id, lt.amount, lt.payment_method, lt.payment_reference, lt.transaction_date FROM ledger_transaction lt WHERE lt.transaction_type = 'FEE_PAYMENT' AND (lt.is_voided = 0 OR lt.is_voided IS NULL) ORDER BY lt.id`)
            .all() as Array<{ student_id: number; amount: number; payment_method: string; payment_reference: string; transaction_date: string }>
        if (payments.length === 0) {
            console.warn('No fee payment transactions found while seeding journal entries; skipping payment journal posting.')
        }
        for (const p of payments) {
            const result = await journalService.recordPayment(p.student_id, p.amount, p.payment_method, p.payment_reference, p.transaction_date, userId)
            if (result.success && result.entry_id) {
                db.prepare(`UPDATE journal_entry SET is_posted = 1, approval_status = 'APPROVED', posted_by_user_id = ?, posted_at = CURRENT_TIMESTAMP WHERE id = ? AND is_posted = 0`).run(userId, result.entry_id)
            }
        }

        const expenses = db.prepare(`SELECT lt.amount, lt.description, lt.transaction_date FROM ledger_transaction lt WHERE lt.transaction_type = 'EXPENSE' AND (lt.is_voided = 0 OR lt.is_voided IS NULL) ORDER BY lt.id`)
            .all() as Array<{ amount: number; description: string; transaction_date: string }>
        for (const exp of expenses) {
            const acct = exp.description.toLowerCase().includes('electric') ? '5300' : '5900'
            await journalService.createJournalEntry({
                entry_date: exp.transaction_date, entry_type: 'EXPENSE',
                description: exp.description || 'Seed expense', created_by_user_id: userId,
                lines: [
                    { gl_account_code: acct, debit_amount: exp.amount, credit_amount: 0, description: exp.description },
                    { gl_account_code: '1020', debit_amount: 0, credit_amount: exp.amount, description: 'Payment from bank' }
                ]
            })
        }
    }

    async seedExamsOnly(userId: number): Promise<{ success: boolean; error?: string }> {
        const db = getDatabase()
        try {
            const periodRow = db.prepare('SELECT academic_year_id as yearId, id as termId FROM term WHERE is_current = 1 LIMIT 1').get() as AcademicPeriod | undefined
            if (!periodRow) {
                return { success: false, error: 'No current academic period found. Please initialize the calendar first.' }
            }

            db.transaction(() => {
                this.seedExaminationData(db, periodRow, userId)
            })()
            return { success: true }
        } catch (error) {
            console.error('Standalone exam seeding failed:', error)
            return { success: false, error: error instanceof Error ? error.message : 'Seeding failed' }
        }
    }

    private seedExaminationData(db: ReturnType<typeof getDatabase>, period: AcademicPeriod, userId: number): void {
        // 1. Seed Subjects
        const subjectInsert = db.prepare(`
            INSERT OR IGNORE INTO subject (code, name, curriculum, is_compulsory)
            VALUES (?, ?, ? , ?)
        `)
        for (const s of CBC_SUBJECTS) {
            subjectInsert.run(s.code, s.name, 'CBC', s.isCompulsory ? 1 : 0)
        }

        const subjects = db.prepare('SELECT id, name, code FROM subject WHERE is_active = 1').all() as Array<{ id: number; name: string; code: string }>
        const streams = db.prepare('SELECT id, stream_code FROM stream WHERE is_active = 1').all() as Array<{ id: number; stream_code: string }>
        const teacher = db.prepare('SELECT id FROM staff WHERE staff_number = ?').get('ST-002') as { id: number } | undefined

        // 2. Seed Subject Allocations
        if (teacher) {
            const allocationInsert = db.prepare(`
                INSERT OR IGNORE INTO subject_allocation (academic_year_id, term_id, stream_id, subject_id, teacher_id)
                VALUES (?, ?, ?, ?, ?)
            `)
            for (const stream of streams) {
                const levelSubjects = CBC_SUBJECTS.filter(s => s.levels.includes(stream.stream_code))
                const levelSubjectCodes = new Set(levelSubjects.map(s => s.code))

                for (const subject of subjects) {
                    if (levelSubjectCodes.has(subject.code)) {
                        allocationInsert.run(period.yearId, period.termId, stream.id, subject.id, teacher.id)
                    }
                }
            }
        }

        const students = db.prepare(`
            SELECT e.student_id, st.stream_code, e.stream_id
            FROM enrollment e 
            JOIN stream st ON e.stream_id = st.id
            WHERE e.term_id = ? AND e.status = 'ACTIVE'
        `).all(period.termId) as Array<{ student_id: number; stream_code: string; stream_id: number }>

        if (subjects.length === 0 || students.length === 0) {
            console.warn('No subjects or students found to seed exam results.')
            return
        }

        // 3. Seed Exams
        const examInsert = db.prepare(`
            INSERT INTO exam (exam_name, academic_year_id, term_id, start_date, is_active)
            VALUES (?, ?, ?, ?, 1)
        `)

        const academicExamInsert = db.prepare(`
            INSERT INTO academic_exam (name, academic_year_id, term_id, exam_type, is_active)
            VALUES (?, ?, ?, ?, 1)
        `)

        for (const type of EXAM_TYPES) {
            const examId = examInsert.run(`${type.name} - ${period.termId}`, period.yearId, period.termId, '2026-02-15').lastInsertRowid as number

            // Also seed relevant academic_exam table
            try {
                academicExamInsert.run(`${type.name}`, period.yearId, period.termId, type.suffix)
            } catch {
                // Ignore if table doesn't exist or other error
            }

            // 4. Seed Exam Results
            this.seedStudentResults(db, examId, students, subjects, period, userId)
        }
    }

    private seedStudentResults(
        db: ReturnType<typeof getDatabase>,
        examId: number,
        students: Array<{ student_id: number; stream_code: string; stream_id: number }>,
        subjects: Array<{ id: number; name: string; code: string }>,
        period: AcademicPeriod,
        userId: number
    ): void {
        const resultInsert = db.prepare(`
            INSERT OR IGNORE INTO exam_result (exam_id, student_id, subject_id, score, competency_level, teacher_remarks, entered_by_user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `)

        for (const student of students) {
            // Find subjects allocated to this student's stream
            const allocatedSubjects = db.prepare(`
                SELECT subject_id FROM subject_allocation 
                WHERE academic_year_id = ? AND term_id = ? AND stream_id = ?
            `).all(period.yearId, period.termId, student.stream_id) as Array<{ subject_id: number }>

            for (const { subject_id } of allocatedSubjects) {
                const subject = subjects.find(s => s.id === subject_id)
                if (!subject) { continue }

                const score = 20 + Math.floor(Math.random() * 81) // 20-100
                let level = 8
                let remarks = 'Below Expectations'
                if (score >= 90) { level = 1; remarks = 'Exceeding Expectations' }
                else if (score >= 75) { level = 2; remarks = 'Exceeding Expectations' }
                else if (score >= 58) { level = 3; remarks = 'Meeting Expectations' }
                else if (score >= 41) { level = 4; remarks = 'Meeting Expectations' }
                else if (score >= 31) { level = 5; remarks = 'Approaching Expectations' }
                else if (score >= 21) { level = 6; remarks = 'Approaching Expectations' }
                else if (score >= 11) { level = 7; }

                resultInsert.run(examId, student.student_id, subject.id, score, level, `${remarks} in ${subject.name}`, userId)
            }
        }
    }
}
