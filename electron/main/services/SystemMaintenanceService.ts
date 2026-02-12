import { db } from '../database/index'
import { logAudit } from '../database/utils/audit'
import { shillingsToCents } from '../utils/money'
import { DoubleEntryJournalService } from './accounting/DoubleEntryJournalService'

interface Stream {
    id: number
    stream_code: string
    stream_name: string
}

interface FeeCategory {
    id: number
    category_name: string
}

interface TransactionCategory {
    id: number
    category_name: string
    category_type: string
}

interface FeeStructureResult {
    fee_category_id: number
    category_name: string
    amount: number
}

interface AcademicPeriod {
    yearId: number
    termId: number
}

interface CurrencyStats {
    feeCount: number
    feeAverage: number
    feeMaximum: number
    invoiceAverage: number
    invoiceMaximum: number
}

const RESET_TABLES: ReadonlyArray<string> = [
    'attendance', 'exam_result', 'report_card_summary', 'exam',
    'subject_allocation', 'stock_movement', 'inventory_item',
    'receipt', 'invoice_item', 'fee_invoice', 'ledger_transaction',
    'journal_entry_line', 'journal_entry',
    'fee_structure', 'enrollment', 'student', 'payroll_deduction',
    'payroll_allowance', 'payroll', 'payroll_period', 'staff_allowance',
    'staff', 'reconciliation_adjustment', 'bank_statement_line',
    'bank_statement', 'budget_revision', 'budget_line_item', 'budget',
    'approval_request', 'fixed_asset', 'report_execution_log',
    'term', 'academic_year', 'financial_period', 'audit_log',
    'message_log', 'backup_log', 'fee_category', 'stream'
]

const STUDENT_FIRST_NAMES: ReadonlyArray<string> = [
    'Samuel', 'Grace', 'David', 'Mercy', 'John', 'Sarah', 'Isaac', 'Faith', 'Peter', 'Mary',
    'James', 'Ruth', 'Paul', 'Esther', 'Luke', 'Lydia', 'Mark', 'Martha', 'Silas', 'Chloe',
    'Timothy', 'Phoebe', 'Andrew', 'Tabitha'
]

const STUDENT_LAST_NAMES: ReadonlyArray<string> = [
    'Kamau', 'Mutua', 'Ochieng', 'Wambui', 'Njoroge', 'Cherono', 'Kipruto', 'Anyango', 'Maina', 'Atieno',
    'Njenga', 'Muli', 'Karanja', 'Achieng', 'Kibet', 'Wanjiku', 'Omondi', 'Mwangi', 'Kirui', 'Naliaka',
    'Gitu', 'Aoko', 'Masai', 'Zahara'
]

const STAFF_SPECS: ReadonlyArray<{ no: string; first: string; last: string; job: string; salaryShillings: number }> = [
    { no: 'ST-001', first: 'Joseph', last: 'Omondi', job: 'Head Teacher', salaryShillings: 85_000 },
    { no: 'ST-002', first: 'Catherine', last: 'Mutuku', job: 'Senior Teacher', salaryShillings: 65_000 },
    { no: 'ST-003', first: 'Philip', last: 'Kamau', job: 'Accounts Clerk', salaryShillings: 50_000 }
]

const FEE_MAP_SHILLINGS: Partial<Record<string, { DAY: [number, number, number]; BOARDER: [number, number, number] }>> = {
    BABY: { DAY: [3000, 3500, 500], BOARDER: [3000, 5000, 9000] },
    PP1: { DAY: [3000, 3500, 500], BOARDER: [3000, 5000, 9000] },
    PP2: { DAY: [3000, 3500, 500], BOARDER: [3000, 5000, 9000] },
    G1: { DAY: [5500, 3500, 500], BOARDER: [5500, 5000, 6500] },
    G2: { DAY: [5500, 3500, 500], BOARDER: [5500, 5000, 6500] },
    G3: { DAY: [5500, 3500, 500], BOARDER: [5500, 5000, 6500] },
    G4: { DAY: [5500, 3500, 700], BOARDER: [5500, 5000, 6500] },
    G5: { DAY: [5500, 3500, 700], BOARDER: [5500, 5000, 6500] },
    G6: { DAY: [5500, 3500, 1000], BOARDER: [5500, 5000, 6500] },
    G7: { DAY: [7000, 3500, 1500], BOARDER: [7000, 5000, 7500] },
    G8: { DAY: [7000, 3500, 1500], BOARDER: [7000, 5000, 7500] },
    G9: { DAY: [7000, 3500, 1500], BOARDER: [7000, 5000, 7500] }
}

const CURRENCY_COLUMNS: ReadonlyArray<{ table: string; columns: ReadonlyArray<string>; nonNullOnly?: boolean }> = [
    { table: 'fee_structure', columns: ['amount'] },
    { table: 'fee_invoice', columns: ['total_amount', 'amount', 'amount_due', 'original_amount', 'amount_paid'] },
    { table: 'invoice_item', columns: ['amount', 'original_amount', 'exemption_amount'] },
    { table: 'ledger_transaction', columns: ['amount'] },
    { table: 'receipt', columns: ['amount'] },
    { table: 'student', columns: ['credit_balance'], nonNullOnly: true }
]

export class SystemMaintenanceService {
    async resetAndSeed2026(userId: number): Promise<{ success: boolean; message: string }> {
        if (!db) {
            throw new Error('Database not initialized')
        }

        try {
            db.pragma('foreign_keys = OFF')
            db.transaction(() => {
                this.runResetTransaction(userId)
            })()
            const normalization = await this.normalizeCurrencyScale(userId)
            const normalizationSuffix = normalization.success ? ` ${normalization.message}` : ''
            await this.seedJournalEntries(userId)
            return {
                success: true,
                message: `Institutional environment for 2026 established successfully.${normalizationSuffix}`
            }
        } catch (error) {
            console.error('Data reset failed:', error)
            return { success: false, message: error instanceof Error ? error.message : 'Reset failed' }
        } finally {
            this.restoreForeignKeys()
        }
    }

    private runResetTransaction(userId: number): void {
        this.clearResetTables()
        this.seedCoreReferenceData()

        const period = this.seedAcademicCalendar()
        const streams = this.getStreams()
        const feeCategories = this.getFeeCategories()
        const transactionCategories = this.getTransactionCategories()

        this.seedFeeStructures(streams, feeCategories, period)
        this.seedStudentsAndInvoices(streams, period, transactionCategories, userId)
        this.seedExpenses(transactionCategories, userId)
        this.seedStaffAndPayroll()
        this.seedInventory(userId)
        this.seedAttendance(period, userId)
        this.logResetAudit(userId)
    }

    private clearResetTables(): void {
        for (const tableName of RESET_TABLES) {
            const exists = db!.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(tableName)
            if (!exists) {
                continue
            }
            db!.prepare(`DELETE FROM ${tableName}`).run()
            db!.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run(tableName)
        }
    }

    private seedCoreReferenceData(): void {
        db!.exec(`
            INSERT INTO stream (stream_code, stream_name, level_order, is_junior_secondary) VALUES
            ('BABY', 'Baby Class', 1, 0), ('PP1', 'Pre-Primary 1', 2, 0), ('PP2', 'Pre-Primary 2', 3, 0),
            ('G1', 'Grade 1', 4, 0), ('G2', 'Grade 2', 5, 0), ('G3', 'Grade 3', 6, 0),
            ('G4', 'Grade 4', 7, 0), ('G5', 'Grade 5', 8, 0), ('G6', 'Grade 6', 9, 0),
            ('G7', 'Grade 7', 10, 1), ('G8', 'Grade 8', 11, 1), ('G9', 'Grade 9', 12, 1);

            INSERT INTO fee_category (category_name, description) VALUES
            ('Tuition', 'Tuition fees'), ('Feeding', 'Meals/Feeding fees'), ('Maintenance', 'School maintenance'),
            ('Boarding', 'Boarding fees for boarders');
        `)
    }

    private seedAcademicCalendar(): AcademicPeriod {
        const yearId = db!.prepare(`
            INSERT INTO academic_year (year_name, start_date, end_date, is_current)
            VALUES ('2026', '2026-01-05', '2026-11-27', 1)
        `).run().lastInsertRowid as number

        const termId = db!.prepare(`
            INSERT INTO term (academic_year_id, term_number, term_name, start_date, end_date, is_current, status)
            VALUES (?, 1, 'Term 1', '2026-01-05', '2026-04-10', 1, 'OPEN')
        `).run(yearId).lastInsertRowid as number

        return { yearId, termId }
    }

    private getStreams(): Stream[] {
        return db!.prepare('SELECT id, stream_code, stream_name FROM stream WHERE is_active = 1').all() as Stream[]
    }

    private getFeeCategories(): FeeCategory[] {
        return db!.prepare('SELECT id, category_name FROM fee_category WHERE is_active = 1').all() as FeeCategory[]
    }

    private getTransactionCategories(): TransactionCategory[] {
        return db!.prepare('SELECT id, category_name, category_type FROM transaction_category WHERE is_active = 1').all() as TransactionCategory[]
    }

    private seedFeeStructures(streams: Stream[], categories: FeeCategory[], period: AcademicPeriod): void {
        const tuitionCategory = categories.find(category => category.category_name === 'Tuition')?.id
        const feedingCategory = categories.find(category => category.category_name === 'Feeding')?.id
        const maintenanceCategory = categories.find(category => category.category_name === 'Maintenance')?.id
        const boardingCategory = categories.find(category => category.category_name === 'Boarding')?.id

        for (const stream of streams) {
            const fees = FEE_MAP_SHILLINGS[stream.stream_code]
            if (!fees) {
                continue
            }
            this.insertFeeRow({ period, stream, studentType: 'DAY_SCHOLAR', categoryId: tuitionCategory, amountShillings: fees.DAY[0], descriptionPrefix: 'Tuition' })
            this.insertFeeRow({ period, stream, studentType: 'DAY_SCHOLAR', categoryId: feedingCategory, amountShillings: fees.DAY[1], descriptionPrefix: 'Feeding' })
            this.insertFeeRow({ period, stream, studentType: 'DAY_SCHOLAR', categoryId: maintenanceCategory, amountShillings: fees.DAY[2], descriptionPrefix: 'Maintenance' })
            this.insertFeeRow({ period, stream, studentType: 'BOARDER', categoryId: tuitionCategory, amountShillings: fees.BOARDER[0], descriptionPrefix: 'Tuition' })
            this.insertFeeRow({ period, stream, studentType: 'BOARDER', categoryId: feedingCategory, amountShillings: fees.BOARDER[1], descriptionPrefix: 'Feeding' })
            this.insertFeeRow({ period, stream, studentType: 'BOARDER', categoryId: boardingCategory, amountShillings: fees.BOARDER[2], descriptionPrefix: 'Boarding' })
        }
    }

    private insertFeeRow(args: {
        period: AcademicPeriod
        stream: Stream
        studentType: 'DAY_SCHOLAR' | 'BOARDER'
        categoryId: number | undefined
        amountShillings: number
        descriptionPrefix: string
    }): void {
        if (!args.categoryId || args.amountShillings <= 0) {
            return
        }

        db!.prepare(`
            INSERT INTO fee_structure (academic_year_id, stream_id, student_type, term_id, fee_category_id, amount, description)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            args.period.yearId,
            args.stream.id,
            args.studentType,
            args.period.termId,
            args.categoryId,
            shillingsToCents(args.amountShillings),
            `${args.descriptionPrefix} - ${args.stream.stream_name}`
        )
    }

    private seedStudentsAndInvoices(streams: Stream[], period: AcademicPeriod, categories: TransactionCategory[], userId: number): void {
        const schoolFeesCategory = categories.find(category => category.category_name === 'School Fees')?.id
        let studentIndex = 0

        for (const stream of streams) {
            for (let slot = 0; slot < 2; slot++) {
                this.seedSingleStudent(stream, period, schoolFeesCategory, userId, studentIndex)
                studentIndex += 1
            }
        }
    }

    private seedSingleStudent(stream: Stream, period: AcademicPeriod, categoryId: number | undefined, userId: number, studentIndex: number): void {
        const firstName = STUDENT_FIRST_NAMES[studentIndex % STUDENT_FIRST_NAMES.length]
        const lastName = STUDENT_LAST_NAMES[studentIndex % STUDENT_LAST_NAMES.length]
        const studentType = studentIndex % 3 === 0 ? 'BOARDER' : 'DAY_SCHOLAR'
        const gender = studentIndex % 2 === 0 ? 'M' : 'F'
        const admissionNumber = `2026/${String(studentIndex + 1).padStart(3, '0')}`

        const studentId = db!.prepare(`
            INSERT INTO student (admission_number, first_name, last_name, student_type, gender, admission_date, is_active)
            VALUES (?, ?, ?, ?, ?, '2026-01-05', 1)
        `).run(admissionNumber, firstName, lastName, studentType, gender).lastInsertRowid as number

        db!.prepare(`
            INSERT INTO enrollment (student_id, academic_year_id, term_id, stream_id, student_type, enrollment_date, status)
            VALUES (?, ?, ?, ?, ?, '2026-01-05', 'ACTIVE')
        `).run(studentId, period.yearId, period.termId, stream.id, studentType)

        const invoiceId = db!.prepare(`
            INSERT INTO fee_invoice (invoice_number, student_id, term_id, invoice_date, due_date, total_amount, amount_paid, status, created_by_user_id)
            VALUES (?, ?, ?, '2026-01-05', '2026-02-05', 0, 0, 'PENDING', ?)
        `).run(`INV-${admissionNumber}-T1`, studentId, period.termId, userId).lastInsertRowid as number

        const totalInvoiceAmount = this.seedInvoiceItems(invoiceId, stream.id, studentType, period.termId)
        db!.prepare('UPDATE fee_invoice SET total_amount = ? WHERE id = ?').run(totalInvoiceAmount, invoiceId)

        const paymentAmount = this.resolveSeedPayment(studentIndex, totalInvoiceAmount)
        if (paymentAmount > 0) {
            this.seedPayment({
                admissionNumber,
                firstName,
                streamCode: stream.stream_code,
                studentId,
                invoiceId,
                totalAmount: totalInvoiceAmount,
                paymentAmount,
                categoryId,
                userId
            })
        }
    }

    private seedInvoiceItems(invoiceId: number, streamId: number, studentType: string, termId: number): number {
        const structures = db!.prepare(`
            SELECT fs.fee_category_id, fc.category_name, fs.amount
            FROM fee_structure fs
            JOIN fee_category fc ON fs.fee_category_id = fc.id
            WHERE fs.stream_id = ? AND fs.student_type = ? AND fs.term_id = ?
        `).all(streamId, studentType, termId) as FeeStructureResult[]

        let total = 0
        for (const structure of structures) {
            db!.prepare(`
                INSERT INTO invoice_item (invoice_id, fee_category_id, description, amount)
                VALUES (?, ?, ?, ?)
            `).run(invoiceId, structure.fee_category_id, structure.category_name, structure.amount)
            total += structure.amount
        }
        return total
    }

    private resolveSeedPayment(studentIndex: number, totalAmount: number): number {
        const ratio = (studentIndex % 10) / 10
        if (ratio > 0.6) {
            return totalAmount
        }
        if (ratio > 0.3) {
            return Math.floor(totalAmount * 0.5)
        }
        return 0
    }

    private seedPayment(args: {
        admissionNumber: string
        firstName: string
        streamCode: string
        studentId: number
        invoiceId: number
        totalAmount: number
        paymentAmount: number
        categoryId: number | undefined
        userId: number
    }): void {
        const transactionReference = `PAY-${args.admissionNumber}-T1`
        const paymentReference = `34262K ${args.firstName} ${args.streamCode}`

        const transactionId = db!.prepare(`
            INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, payment_method, payment_reference, description, recorded_by_user_id)
            VALUES (?, '2026-01-10', 'FEE_PAYMENT', ?, ?, 'CREDIT', ?, 'MPESA', ?, 'Term 1 Fee Payment', ?)
        `).run(transactionReference, args.categoryId, args.paymentAmount, args.studentId, paymentReference, args.userId).lastInsertRowid as number

        db!.prepare(`
            INSERT INTO receipt (receipt_number, transaction_id, receipt_date, student_id, amount, payment_method, payment_reference, created_by_user_id)
            VALUES (?, ?, '2026-01-10', ?, ?, 'MPESA', ?, ?)
        `).run(`REC-${args.admissionNumber}-T1`, transactionId, args.studentId, args.paymentAmount, paymentReference, args.userId)

        db!.prepare('UPDATE fee_invoice SET amount_paid = ?, status = ? WHERE id = ?').run(
            args.paymentAmount,
            args.paymentAmount >= args.totalAmount ? 'PAID' : 'PARTIAL',
            args.invoiceId
        )
    }

    private seedExpenses(categories: TransactionCategory[], userId: number): void {
        const utilitiesCategory = categories.find(category => category.category_name === 'Utilities')?.id
        db!.prepare(`
            INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, description, recorded_by_user_id)
            VALUES ('EXP-2026-001', '2026-01-15', 'EXPENSE', ?, ?, 'DEBIT', 'January Electricity Bill', ?)
        `).run(utilitiesCategory, shillingsToCents(25_000), userId)
    }

    private seedStaffAndPayroll(): void {
        const periodId = db!.prepare(`
            INSERT INTO payroll_period (period_name, month, year, start_date, end_date, status)
            VALUES ('January 2026', 1, 2026, '2026-01-01', '2026-01-31', 'OPEN')
        `).run().lastInsertRowid as number

        for (const staffSpec of STAFF_SPECS) {
            const salaryCents = shillingsToCents(staffSpec.salaryShillings)
            const staffId = db!.prepare(`
                INSERT INTO staff (staff_number, first_name, last_name, job_title, basic_salary, is_active, employment_date)
                VALUES (?, ?, ?, ?, ?, 1, '2024-01-01')
            `).run(staffSpec.no, staffSpec.first, staffSpec.last, staffSpec.job, salaryCents).lastInsertRowid as number

            db!.prepare(`
                INSERT INTO payroll (period_id, staff_id, basic_salary, gross_salary, total_deductions, net_salary, payment_status)
                VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
            `).run(periodId, staffId, salaryCents, salaryCents, 0, salaryCents)
        }
    }

    private seedInventory(userId: number): void {
        const inventoryCategory = db!.prepare('SELECT id FROM inventory_category LIMIT 1').get() as { id: number } | undefined
        if (!inventoryCategory) {
            return
        }

        const unitCost = shillingsToCents(250)
        const itemId = db!.prepare(`
            INSERT INTO inventory_item (item_code, item_name, category_id, unit_of_measure, current_stock, unit_cost)
            VALUES ('STA-001', 'Chalks White (Box)', ?, 'Box', 100, ?)
        `).run(inventoryCategory.id, unitCost).lastInsertRowid as number

        db!.prepare(`
            INSERT INTO stock_movement (item_id, movement_type, quantity, unit_cost, total_cost, description, movement_date, recorded_by_user_id)
            VALUES (?, 'IN', 100, ?, ?, 'Opening Stock', '2026-01-05', ?)
        `).run(itemId, unitCost, unitCost * 100, userId)

        db!.prepare(`
            INSERT INTO stock_movement (item_id, movement_type, quantity, description, movement_date, recorded_by_user_id)
            VALUES (?, 'OUT', 10, 'Issued to Grade 1', '2026-01-10', ?)
        `).run(itemId, userId)

        db!.prepare('UPDATE inventory_item SET current_stock = 90 WHERE id = ?').run(itemId)
    }

    private seedAttendance(period: AcademicPeriod, userId: number): void {
        const firstEnrollment = db!.prepare('SELECT student_id as id, stream_id FROM enrollment LIMIT 1').get() as { id: number; stream_id: number } | undefined
        if (!firstEnrollment) {
            return
        }

        db!.prepare(`
            INSERT INTO attendance (student_id, stream_id, academic_year_id, term_id, attendance_date, status, marked_by_user_id)
            VALUES (?, ?, ?, ?, '2026-01-05', 'PRESENT', ?)
        `).run(firstEnrollment.id, firstEnrollment.stream_id, period.yearId, period.termId, userId)
    }

    private logResetAudit(userId: number): void {
        db!.prepare(`
            INSERT INTO audit_log (user_id, action_type, table_name, record_id, new_values)
            VALUES (?, 'SYSTEM_RESET', 'DATABASE', 0, 'Full Institutional Seeding for 2026 Done')
        `).run(userId)
    }

    async normalizeCurrencyScale(userId: number): Promise<{ success: boolean; message: string }> {
        if (!db) {
            throw new Error('Database not initialized')
        }

        try {
            const stats = this.collectCurrencyStats()
            if (stats.feeCount === 0) {
                return { success: false, message: 'No fee structure data found. Nothing to normalize.' }
            }

            const divisor = this.determineCurrencyDivisor(stats)
            if (divisor === 1) {
                return { success: false, message: 'Currency values appear within expected ranges. No changes applied.' }
            }

            db.transaction(() => {
                this.applyCurrencyNormalization(divisor)
            })()

            logAudit(userId, 'UPDATE', 'currency_normalization', 0, null, {
                avg_amount: stats.feeAverage,
                max_amount: stats.feeMaximum,
                action: `Divide by ${divisor} for core financial tables`
            })

            return { success: true, message: `Currency values normalized (divide by ${divisor}) for core financial tables.` }
        } catch (error) {
            console.error('Currency normalization failed:', error)
            return { success: false, message: error instanceof Error ? error.message : 'Normalization failed' }
        }
    }

    private collectCurrencyStats(): CurrencyStats {
        const feeStats = db!.prepare(`
            SELECT COUNT(*) as count, AVG(amount) as avg_amount, MAX(amount) as max_amount
            FROM fee_structure
        `).get() as { count: number; avg_amount: number | null; max_amount: number | null }

        const invoiceStats = db!.prepare(`
            SELECT AVG(total_amount) as avg_total, MAX(total_amount) as max_total
            FROM fee_invoice
        `).get() as { avg_total: number | null; max_total: number | null }

        return {
            feeCount: feeStats.count,
            feeAverage: feeStats.avg_amount ?? 0,
            feeMaximum: feeStats.max_amount ?? 0,
            invoiceAverage: invoiceStats.avg_total ?? 0,
            invoiceMaximum: invoiceStats.max_total ?? 0
        }
    }

    private determineCurrencyDivisor(stats: CurrencyStats): number {
        const likelyScaled = (
            stats.feeMaximum >= 50_000_000 ||
            stats.feeAverage >= 20_000_000 ||
            stats.invoiceMaximum >= 50_000_000 ||
            stats.invoiceAverage >= 20_000_000
        )
        return likelyScaled ? 100 : 1
    }

    private applyCurrencyNormalization(divisor: number): void {
        for (const tableConfig of CURRENCY_COLUMNS) {
            if (!this.tableExists(tableConfig.table)) {
                continue
            }
            for (const column of tableConfig.columns) {
                if (!this.columnExists(tableConfig.table, column)) {
                    continue
                }
                const whereClause = tableConfig.nonNullOnly ? ` WHERE ${column} IS NOT NULL` : ''
                db!.prepare(`
                    UPDATE ${tableConfig.table}
                    SET ${column} = CAST(ROUND(${column} / ${divisor}.0) AS INTEGER)
                    ${whereClause}
                `).run()
            }
        }
    }

    private tableExists(tableName: string): boolean {
        const result = db!.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName) as { name?: string } | undefined
        return Boolean(result?.name)
    }

    private columnExists(tableName: string, columnName: string): boolean {
        const columns = db!.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[]
        return columns.some(column => column.name === columnName)
    }

    private restoreForeignKeys(): void {
        try {
            db?.pragma('foreign_keys = ON')
        } catch {
            // Ignore pragma errors in cleanup path.
        }
    }

    /**
     * Seeds proper double-entry journal entries for all seeded transactions.
     * Runs AFTER the synchronous seed transaction so that ledger_transaction,
     * fee_invoice, invoice_item, and gl_account rows already exist.
     */
    private async seedJournalEntries(userId: number): Promise<void> {
        const journalService = new DoubleEntryJournalService()

        // 1. Journal entries for fee invoices: DR AR (1100), CR Revenue per category
        const invoices = db!.prepare(`
            SELECT fi.id, fi.student_id, fi.invoice_date
            FROM fee_invoice fi ORDER BY fi.id
        `).all() as Array<{ id: number; student_id: number; invoice_date: string }>

        for (const invoice of invoices) {
            const items = db!.prepare(`
                SELECT ii.amount, fc.gl_account_id, ga.account_code, fc.category_name
                FROM invoice_item ii
                JOIN fee_category fc ON ii.fee_category_id = fc.id
                LEFT JOIN gl_account ga ON fc.gl_account_id = ga.id
                WHERE ii.invoice_id = ?
            `).all(invoice.id) as Array<{ amount: number; gl_account_id: number | null; account_code: string | null; category_name: string }>

            const invoiceItems = items.map(item => ({
                gl_account_code: item.account_code ?? '4300',
                amount: item.amount,
                description: item.category_name
            }))

            if (invoiceItems.length > 0) {
                await journalService.recordInvoice(invoice.student_id, invoiceItems, invoice.invoice_date, userId)
            }
        }

        // 2. Journal entries for fee payments: DR Bank (1020), CR AR (1100)
        const payments = db!.prepare(`
            SELECT lt.student_id, lt.amount, lt.payment_method, lt.payment_reference, lt.transaction_date
            FROM ledger_transaction lt
            WHERE lt.transaction_type = 'FEE_PAYMENT' AND (lt.is_voided = 0 OR lt.is_voided IS NULL)
            ORDER BY lt.id
        `).all() as Array<{ student_id: number; amount: number; payment_method: string; payment_reference: string; transaction_date: string }>

        if (payments.length === 0) {
            throw new Error('DEBUG: No payments found in ledger_transaction to seed journal entries from!')
        }

        for (const payment of payments) {
            const result = await journalService.recordPayment(
                payment.student_id,
                payment.amount,
                payment.payment_method ?? 'MPESA',
                payment.payment_reference ?? 'Seed payment',
                payment.transaction_date,
                userId
            )

            // Ensure seeded payments are posted immediately (bypass approval rules)
            if (result.success && result.entry_id) {
                db!.prepare(`
                    UPDATE journal_entry 
                    SET is_posted = 1, approval_status = 'APPROVED', posted_by_user_id = ?, posted_at = CURRENT_TIMESTAMP 
                    WHERE id = ? AND is_posted = 0
                `).run(userId, result.entry_id)
            }
        }

        // 3. Journal entry for expenses: DR Expense account, CR Bank (1020)
        const expenses = db!.prepare(`
            SELECT lt.amount, lt.description, lt.transaction_date
            FROM ledger_transaction lt
            WHERE lt.transaction_type = 'EXPENSE' AND (lt.is_voided = 0 OR lt.is_voided IS NULL)
            ORDER BY lt.id
        `).all() as Array<{ amount: number; description: string; transaction_date: string }>

        for (const expense of expenses) {
            const expenseAccount = expense.description?.toLowerCase().includes('electric') ? '5300' : '5900'
            await journalService.createJournalEntry({
                entry_date: expense.transaction_date,
                entry_type: 'EXPENSE',
                description: expense.description || 'Seed expense',
                created_by_user_id: userId,
                lines: [
                    { gl_account_code: expenseAccount, debit_amount: expense.amount, credit_amount: 0, description: expense.description },
                    { gl_account_code: '1020', debit_amount: 0, credit_amount: expense.amount, description: 'Payment from bank' }
                ]
            })
        }
    }
}
