import { getDatabase } from '../../database'
import { container } from '../../services/base/ServiceContainer'
import { REPORT_EXPENSE_TRANSACTION_TYPES, REPORT_INCOME_TRANSACTION_TYPES, OUTSTANDING_INVOICE_STATUSES, asSqlInList } from '../../utils/financeTransactionTypes'
import { safeHandleRaw } from '../ipc-result'

import type { NEMISExportConfig, NEMISStudent } from '../../services/reports/NEMISExportService.types'

interface CountResult { count: number }
interface TotalResult { total: number }
function registerStudentAccountReports(db: ReturnType<typeof getDatabase>): void {
    safeHandleRaw('report:defaulters', (_event, termId?: number) => {
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

        const params: Array<number | string> = []
        if (termId) {
            query += ` AND fi.term_id = ?`
            params.push(termId)
        }

        query += ` ORDER BY balance DESC`
        return db.prepare(query).all(...params)
    })
}

function registerAttendanceAndCollectionReports(db: ReturnType<typeof getDatabase>): void {
    safeHandleRaw('report:attendance', (_event, startDate: string, endDate: string, streamId?: number) => {
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

    safeHandleRaw('report:dailyCollection', (_event, date: string) => {
        return db.prepare(`
            SELECT 
                lt.transaction_date as date,
                s.admission_number,
                s.first_name || ' ' || s.last_name as student_name,
                st.stream_name,
                lt.payment_method,
                lt.payment_reference,
                lt.amount,
                lt.description
            FROM ledger_transaction lt
            JOIN student s ON lt.student_id = s.id
            LEFT JOIN enrollment e ON s.id = e.student_id AND e.id = (
                SELECT MAX(id) FROM enrollment WHERE student_id = s.id
            )
            LEFT JOIN stream st ON e.stream_id = st.id
            WHERE lt.transaction_type = 'FEE_PAYMENT'
            AND lt.is_voided = 0
            AND lt.transaction_date = ?
            ORDER BY lt.created_at ASC
        `).all(date)
    })
}

function registerFinancialSummaryAndDashboardReports(db: ReturnType<typeof getDatabase>): void {
    const incomeTypesSql = asSqlInList(REPORT_INCOME_TRANSACTION_TYPES)
    const expenseTypesSql = asSqlInList(REPORT_EXPENSE_TRANSACTION_TYPES)
    const outstandingStatusesSql = asSqlInList(OUTSTANDING_INVOICE_STATUSES)

    safeHandleRaw('report:financialSummary', (_event, startDate: string, endDate: string) => {
        const income = db.prepare(`
            SELECT SUM(amount) as total FROM ledger_transaction 
            WHERE (transaction_type IN (${incomeTypesSql}))
            AND is_voided = 0 
            AND transaction_date BETWEEN ? AND ?
        `).get(startDate, endDate) as TotalResult | undefined

        const expenses = db.prepare(`
            SELECT SUM(amount) as total FROM ledger_transaction 
            WHERE (transaction_type IN (${expenseTypesSql}))
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

    safeHandleRaw('report:dashboard', () => {
        const totalStudents = db.prepare('SELECT COUNT(*) as count FROM student WHERE is_active = 1').get() as CountResult | undefined
        const totalStaff = db.prepare('SELECT COUNT(*) as count FROM staff WHERE is_active = 1').get() as CountResult | undefined
        const feeCollected = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM ledger_transaction 
      WHERE transaction_type = 'FEE_PAYMENT' AND is_voided = 0`).get() as TotalResult | undefined
        const outstandingBalance = db.prepare(`SELECT COALESCE(SUM(total_amount - amount_paid), 0) as total 
      FROM fee_invoice WHERE status IN (${outstandingStatusesSql})`).get() as TotalResult | undefined

        return {
            totalStudents: totalStudents?.count || 0,
            totalStaff: totalStaff?.count || 0,
            feeCollected: feeCollected?.total || 0,
            outstandingBalance: outstandingBalance?.total || 0
        }
    })
}

function registerCategoryBreakdownReports(db: ReturnType<typeof getDatabase>): void {
    const incomeTypesSql = asSqlInList(REPORT_INCOME_TRANSACTION_TYPES)
    const expenseTypesSql = asSqlInList(REPORT_EXPENSE_TRANSACTION_TYPES)

    safeHandleRaw('report:revenueByCategory', (_event, startDate: string, endDate: string) => {
        return db.prepare(`
            SELECT 
                COALESCE(tc.category_name, 'Uncategorized') as name, 
                SUM(lt.amount) as value
            FROM ledger_transaction lt
            LEFT JOIN transaction_category tc ON lt.category_id = tc.id
            WHERE lt.transaction_type IN (${incomeTypesSql})
            AND lt.is_voided = 0
            AND lt.transaction_date BETWEEN ? AND ?
            GROUP BY COALESCE(tc.id, 0), COALESCE(tc.category_name, 'Uncategorized')
            HAVING value > 0
            ORDER BY value DESC
        `).all(startDate, endDate)
    })

    safeHandleRaw('report:expenseByCategory', (_event, startDate: string, endDate: string) => {
        return db.prepare(`
            SELECT 
                COALESCE(tc.category_name, 'Uncategorized') as name, 
                SUM(lt.amount) as value
            FROM ledger_transaction lt
            LEFT JOIN transaction_category tc ON lt.category_id = tc.id
            WHERE lt.transaction_type IN (${expenseTypesSql})
            AND lt.is_voided = 0
            AND lt.transaction_date BETWEEN ? AND ?
            GROUP BY COALESCE(tc.id, 0), COALESCE(tc.category_name, 'Uncategorized')
            HAVING value > 0
            ORDER BY value DESC
        `).all(startDate, endDate)
    })

    safeHandleRaw('report:feeCategoryBreakdown', () => {
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
}

function registerOperationsReports(db: ReturnType<typeof getDatabase>): void {
    safeHandleRaw('report:inventoryValuation', () => {
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

    safeHandleRaw('report:staffPayroll', (_event, periodId: number) => {
        const period = db.prepare('SELECT * FROM payroll_period WHERE id = ?').get(periodId)
        if (!period) { return { success: false, error: 'Payroll period not found' } }

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

    safeHandleRaw('report:feeCollection', (_event, startDate: string, endDate: string) => {
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
}

function registerNemisExportHandlers(): void {
    const nemisService = container.resolve('NEMISExportService')

    safeHandleRaw('reports:extractStudentData', async (_event, filters?: {
        academicYear?: string
        streamId?: number
        status?: string
    }) => {
        try {
            return await nemisService.extractStudentData(filters)
        } catch (error) {
            throw new Error(error instanceof Error ? error.message : 'Failed to extract student data')
        }
    })

    safeHandleRaw('reports:extractStaffData', async () => {
        try {
            return await nemisService.extractStaffData()
        } catch (error) {
            throw new Error(error instanceof Error ? error.message : 'Failed to extract staff data')
        }
    })

    safeHandleRaw('reports:extractEnrollmentData', async (_event, academicYear: string) => {
        try {
            return await nemisService.extractEnrollmentData(academicYear)
        } catch (error) {
            throw new Error(error instanceof Error ? error.message : 'Failed to extract enrollment data')
        }
    })

    safeHandleRaw('reports:createNEMISExport', async (_event, exportConfig: NEMISExportConfig, userId: number) => {
        try {
            return await nemisService.createExport(exportConfig, userId)
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
        }
    })

    safeHandleRaw('reports:getNEMISExportHistory', async (_event, limit?: number) => {
        try {
            return await nemisService.getExportHistory(limit)
        } catch (error) {
            throw new Error(error instanceof Error ? error.message : 'Failed to get export history')
        }
    })

    safeHandleRaw('reports:validateNEMISStudentData', (_event, student: NEMISStudent) => {
        try {
            return nemisService.validateStudentData(student)
        } catch (error) {
            throw new Error(error instanceof Error ? error.message : 'Failed to validate student data')
        }
    })
}

export function registerReportsHandlers(): void {
    const db = getDatabase()
    registerStudentAccountReports(db)
    registerAttendanceAndCollectionReports(db)
    registerFinancialSummaryAndDashboardReports(db)
    registerCategoryBreakdownReports(db)
    registerOperationsReports(db)
    registerNemisExportHandlers()
}
