import { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from '../../electron-env'
import { getDatabase } from '../../database/index'
import { NEMISExportService } from '../../services/reports/NEMISExportService'

interface CountResult { count: number }
interface TotalResult { total: number }
interface TransactionRow {
    transaction_date: string
    transaction_type: string
    amount: number
    debit_credit: string
    description: string
    payment_method: string
    receipt_number: string
    invoice_number: string
    term_name: string
}

export function registerReportsHandlers(): void {
    const db = new Proxy({} as any, {
        get: (_target, prop) => (getDatabase() as any)[prop]
    });

    // ======== REPORTS ========
    ipcMain.handle('report:defaulters', async (_event: IpcMainInvokeEvent, termId?: number) => {
        // SQL Injection Protection: Query is structured with parameterized values
        // Added s.guardian_phone for SMS functionality
        let query = `SELECT s.id, s.admission_number, s.first_name, s.last_name, 
            s.guardian_phone, st.stream_name, fi.invoice_number, fi.total_amount, fi.amount_paid,
            (fi.total_amount - fi.amount_paid) as balance, fi.due_date
        FROM student s
        JOIN fee_invoice fi ON s.id = fi.student_id
        LEFT JOIN enrollment e ON s.id = e.student_id AND e.id = (
            SELECT MAX(id) FROM enrollment WHERE student_id = s.id
        )
        LEFT JOIN stream st ON e.stream_id = st.id
        WHERE fi.status != 'PAID' AND fi.status != 'CANCELLED'`

        const params: any[] = []
        if (termId) {
            query += ` AND fi.term_id = ?`
            params.push(termId)
        }

        query += ` ORDER BY balance DESC`
        return db.prepare(query).all(...params)
    })

    ipcMain.handle('report:financialSummary', async (_event: IpcMainInvokeEvent, startDate: string, endDate: string) => {
        // Standardize Income: FEE_PAYMENT + DONATION + GRANT + INCOME
        const income = db.prepare(`
            SELECT SUM(amount) as total FROM ledger_transaction 
            WHERE (transaction_type IN ('INCOME', 'FEE_PAYMENT', 'DONATION', 'GRANT'))
            AND is_voided = 0 
            AND transaction_date BETWEEN ? AND ?
        `).get(startDate, endDate) as TotalResult | undefined

        const expenses = db.prepare(`
            SELECT SUM(amount) as total FROM ledger_transaction 
            WHERE (transaction_type IN ('EXPENSE', 'SALARY_PAYMENT'))
            AND is_voided = 0 
            AND transaction_date BETWEEN ? AND ?
        `).get(startDate, endDate) as TotalResult | undefined

        const feePayments = db.prepare(`
            SELECT SUM(amount) as total FROM ledger_transaction 
            WHERE transaction_type = 'FEE_PAYMENT' AND is_voided = 0 
            AND transaction_date BETWEEN ? AND ?
        `).get(startDate, endDate) as TotalResult | undefined

        return {
            totalIncome: income?.total || 0,
            totalExpense: expenses?.total || 0,
            feePayments: feePayments?.total || 0,
            netBalance: (income?.total || 0) - (expenses?.total || 0)
        }
    })

    ipcMain.handle('report:studentLedger', async (_event: IpcMainInvokeEvent, studentId: number) => {
        const student = db.prepare('SELECT * FROM student WHERE id = ?').get(studentId)
        if (!student) return { success: false, error: 'Student not found' }

        const transactions = db.prepare(`
            SELECT 
                lt.transaction_date, lt.transaction_type, lt.amount, lt.debit_credit,
                lt.description, lt.payment_method, r.receipt_number,
                fi.invoice_number, t.term_name
            FROM ledger_transaction lt
            LEFT JOIN receipt r ON lt.id = r.transaction_id
            LEFT JOIN fee_invoice fi ON lt.invoice_id = fi.id
            LEFT JOIN term t ON lt.term_id = t.id
            WHERE lt.student_id = ? AND lt.is_voided = 0
            ORDER BY lt.transaction_date DESC
        `).all(studentId) as TransactionRow[]

        const openingBalance = 0 // TODO: Calculate opening balance from previous periods

        let runningBalance = openingBalance
        const ledger = transactions.map((tx) => {
            const amount = tx.debit_credit === 'DEBIT' ? -tx.amount : tx.amount
            runningBalance += amount
            return { ...tx, amount, runningBalance }
        })

        return { student, openingBalance, ledger, closingBalance: runningBalance }
    })

    ipcMain.handle('report:attendance', async (_event: IpcMainInvokeEvent, startDate: string, endDate: string, streamId?: number) => {
        let query = `
            SELECT 
                s.id, s.admission_number, s.first_name, s.last_name,
                st.stream_name,
                COUNT(a.id) as total_days,
                SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) as present_days,
                SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) as absent_days,
                SUM(CASE WHEN a.status = 'LATE' THEN 1 ELSE 0 END) as late_days
            FROM student s
            LEFT JOIN enrollment e ON s.id = e.student_id AND e.id = (
                SELECT MAX(id) FROM enrollment WHERE student_id = s.id
            )
            LEFT JOIN stream st ON e.stream_id = st.id
            LEFT JOIN attendance a ON s.id = a.student_id AND a.attendance_date BETWEEN ? AND ?
            WHERE s.is_active = 1
        `

        const params: unknown[] = [startDate, endDate]

        if (streamId) {
            query += ` AND e.stream_id = ?`
            params.push(streamId)
        }

        query += ` GROUP BY s.id ORDER BY st.stream_name, s.admission_number`
        return db.prepare(query).all(...params)
    })

    ipcMain.handle('report:inventoryValuation', async () => {
        return db.prepare(`
            SELECT 
                i.item_code, i.item_name, c.category_name,
                i.current_stock, i.unit_cost, (i.current_stock * i.unit_cost) as total_value,
                i.reorder_level
            FROM inventory_item i
            LEFT JOIN inventory_category c ON i.category_id = c.id
            WHERE i.is_active = 1
            ORDER BY total_value DESC
        `).all()
    })

    ipcMain.handle('report:staffPayroll', async (_event: IpcMainInvokeEvent, periodId: number) => {
        const period = db.prepare('SELECT * FROM payroll_period WHERE id = ?').get(periodId)
        if (!period) return { success: false, error: 'Payroll period not found' }

        const payroll = db.prepare(`
            SELECT 
                p.*, s.first_name, s.last_name, s.staff_number, s.department, s.job_title
            FROM payroll p
            JOIN staff s ON p.staff_id = s.id
            WHERE p.period_id = ?
            ORDER BY s.department, s.staff_number
        `).all(periodId)

        const summary = db.prepare(`
            SELECT 
                SUM(gross_salary) as total_gross,
                SUM(total_deductions) as total_deductions,
                SUM(net_salary) as total_net,
                COUNT(*) as staff_count
            FROM payroll
            WHERE period_id = ?
        `).get(periodId)

        return { period, payroll, summary }
    })

    ipcMain.handle('report:feeCollection', async (_event: IpcMainInvokeEvent, startDate: string, endDate: string) => {
        return db.prepare(`
            SELECT 
                DATE(transaction_date) as payment_date, 
                SUM(amount) as amount,
                payment_method, 
                COUNT(*) as count 
            FROM ledger_transaction
            WHERE transaction_type = 'FEE_PAYMENT' AND is_voided = 0
            AND transaction_date BETWEEN ? AND ? 
            GROUP BY DATE(transaction_date), payment_method
            ORDER BY DATE(transaction_date) ASC
        `).all(startDate, endDate)
    })

    ipcMain.handle('report:dashboard', async () => {
        const totalStudents = db.prepare('SELECT COUNT(*) as count FROM student WHERE is_active = 1').get() as CountResult | undefined
        const totalStaff = db.prepare('SELECT COUNT(*) as count FROM staff WHERE is_active = 1').get() as CountResult | undefined
        const feeCollected = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM ledger_transaction 
      WHERE transaction_type = 'FEE_PAYMENT' AND is_voided = 0`).get() as TotalResult | undefined
        const outstandingBalance = db.prepare(`SELECT COALESCE(SUM(total_amount - amount_paid), 0) as total 
      FROM fee_invoice WHERE status IN ('PENDING', 'PARTIAL')`).get() as TotalResult | undefined

        return {
            totalStudents: totalStudents?.count || 0,
            totalStaff: totalStaff?.count || 0,
            feeCollected: feeCollected?.total || 0,
            outstandingBalance: outstandingBalance?.total || 0
        }
    })

    ipcMain.handle('report:revenueByCategory', async (_event: IpcMainInvokeEvent, startDate: string, endDate: string) => {
        return db.prepare(`
            SELECT 
                tc.category_name as name, 
                SUM(lt.amount) as value
            FROM ledger_transaction lt
            JOIN transaction_category tc ON lt.category_id = tc.id
            WHERE lt.transaction_type IN ('INCOME', 'FEE_PAYMENT', 'DONATION', 'GRANT')
            AND lt.is_voided = 0
            AND lt.transaction_date BETWEEN ? AND ?
            GROUP BY tc.id, tc.category_name
            HAVING value > 0
            ORDER BY value DESC
        `).all(startDate, endDate)
    })

    ipcMain.handle('report:expenseByCategory', async (_event: IpcMainInvokeEvent, startDate: string, endDate: string) => {
        return db.prepare(`
            SELECT 
                tc.category_name as name, 
                SUM(lt.amount) as value
            FROM ledger_transaction lt
            JOIN transaction_category tc ON lt.category_id = tc.id
            WHERE lt.transaction_type IN ('EXPENSE', 'SALARY_PAYMENT', 'REFUND')
            AND lt.is_voided = 0
            AND lt.transaction_date BETWEEN ? AND ?
            GROUP BY tc.id, tc.category_name
            HAVING value > 0
            ORDER BY value DESC
        `).all(startDate, endDate)
    })

    ipcMain.handle('report:dailyCollection', async (_event: IpcMainInvokeEvent, date: string) => {
        return db.prepare(`
            SELECT 
                lt.transaction_date as date,
                s.first_name || ' ' || s.last_name as student_name,
                lt.payment_method,
                lt.payment_reference,
                lt.amount,
                lt.description
            FROM ledger_transaction lt
            JOIN student s ON lt.student_id = s.id
            WHERE lt.transaction_type = 'FEE_PAYMENT'
            AND lt.is_voided = 0
            AND lt.transaction_date = ?
            ORDER BY lt.created_at ASC
        `).all(date)
    })

    ipcMain.handle('report:feeCategoryBreakdown', async () => {
        return db.prepare(`
            SELECT 
                tc.category_name as name, 
                SUM(lt.amount) as value
            FROM ledger_transaction lt
            JOIN transaction_category tc ON lt.category_id = tc.id
            WHERE lt.transaction_type = 'FEE_PAYMENT'
            AND lt.is_voided = 0
            GROUP BY tc.id, tc.category_name
            HAVING value > 0
            ORDER BY value DESC
        `).all()
    })

    // ======== PHASE 3: NEMIS EXPORT ========
    const nemisService = new NEMISExportService()

    ipcMain.handle('reports:extractStudentData', async (_event: IpcMainInvokeEvent, filters?: any) => {
        try {
            return await nemisService.extractStudentData(filters)
        } catch (error) {
            throw new Error(error instanceof Error ? error.message : 'Failed to extract student data')
        }
    })

    ipcMain.handle('reports:extractStaffData', async (_event: IpcMainInvokeEvent) => {
        try {
            return await nemisService.extractStaffData()
        } catch (error) {
            throw new Error(error instanceof Error ? error.message : 'Failed to extract staff data')
        }
    })

    ipcMain.handle('reports:extractEnrollmentData', async (_event: IpcMainInvokeEvent, academicYear: string) => {
        try {
            return await nemisService.extractEnrollmentData(academicYear)
        } catch (error) {
            throw new Error(error instanceof Error ? error.message : 'Failed to extract enrollment data')
        }
    })

    ipcMain.handle('reports:createNEMISExport', async (_event: IpcMainInvokeEvent, exportConfig: any, userId: number) => {
        try {
            return await nemisService.createExport(exportConfig, userId)
        } catch (error) {
            return { success: false, message: error instanceof Error ? error.message : 'Unknown error' }
        }
    })

    ipcMain.handle('reports:getNEMISExportHistory', async (_event: IpcMainInvokeEvent, limit?: number) => {
        try {
            return await nemisService.getExportHistory(limit)
        } catch (error) {
            throw new Error(error instanceof Error ? error.message : 'Failed to get export history')
        }
    })

    ipcMain.handle('reports:validateNEMISStudentData', async (_event: IpcMainInvokeEvent, student: any) => {
        try {
            return nemisService.validateStudentData(student)
        } catch (error) {
            throw new Error(error instanceof Error ? error.message : 'Failed to validate student data')
        }
    })
}



















