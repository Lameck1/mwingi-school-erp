import { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from '../../electron-env'
import { getDatabase } from '../../database/index'
import { logAudit } from '../../database/utils/audit'
import type { StaffMember } from './types'

interface StaffAllowanceRow {
    id: number
    staff_id: number
    allowance_name: string
    amount: number
    is_active: number
}

export function registerPayrollHandlers(): void {
    const db = getDatabase()

    // ======== PAYROLL ========
    ipcMain.handle('payroll:run', async (_event: IpcMainInvokeEvent, month: number, year: number, userId: number) => {
        return db.transaction(() => {
            // 1. Check if payroll already exists
            const existing = db.prepare('SELECT id FROM payroll_period WHERE month = ? AND year = ?').get(month, year) as { id: number } | undefined
            if (existing) return { success: false, error: 'Payroll for this period already exists' }

            // 2. Create Payroll Period
            const periodName = `${new Date(year, month - 1).toLocaleString('default', { month: 'long' })} ${year}`
            const startDate = `${year}-${String(month).padStart(2, '0')}-01`
            const endDate = new Date(year, month, 0).toISOString().split('T')[0]

            const periodResult = db.prepare(`INSERT INTO payroll_period (
                period_name, month, year, start_date, end_date, status, created_at
            ) VALUES (?, ?, ?, ?, ?, 'DRAFT', CURRENT_TIMESTAMP)`).run(periodName, month, year, startDate, endDate)

            const periodId = periodResult.lastInsertRowid

            logAudit(userId, 'CREATE', 'payroll_period', periodId as number, null, { month, year, periodName })

            // 3. Get Active Staff
            const staffList = db.prepare('SELECT * FROM staff WHERE is_active = 1').all() as StaffMember[]

            // 4. Calculate for each staff
            const payrollStmt = db.prepare(`INSERT INTO payroll (
                period_id, staff_id, basic_salary, gross_salary, total_deductions, net_salary
            ) VALUES (?, ?, ?, ?, ?, ?)`)

            const results = []

            for (const staff of staffList) {
                const basic = staff.basic_salary || 0

                // Fetch staff allowances from staff_allowance table
                const staffAllowances = db.prepare(
                    'SELECT * FROM staff_allowance WHERE staff_id = ? AND is_active = 1'
                ).all(staff.id) as StaffAllowanceRow[]
                const allowances = staffAllowances.reduce((sum, a) => sum + a.amount, 0)

                const gross = basic + allowances

                // Calculation Logic (Simplified Kenya 2024)
                // NSSF (Tier I + II) - approx 6% capped
                const nssf = Math.min(gross * 0.06, 2160)

                // NHIF (Using SHIF 2.75% for modern compliance or old bands)
                let nhif = 150
                if (gross >= 100000) nhif = 1700
                else if (gross >= 50000) nhif = 1500
                else if (gross >= 20000) nhif = 750
                else nhif = 500

                // PAYE
                const taxable = gross - nssf
                let tax = 0
                if (taxable > 24000) {
                    const band1 = 24000 * 0.1
                    const remainder = taxable - 24000
                    if (remainder > 8333) {
                        const band2 = 8333 * 0.25
                        const band3 = (remainder - 8333) * 0.3
                        tax = band1 + band2 + band3
                    } else {
                        tax = band1 + (remainder * 0.25)
                    }
                } else {
                    tax = taxable * 0.1
                }
                const paye = Math.max(0, tax - 2400)

                const totalDeductions = nssf + nhif + paye
                const net = gross - totalDeductions

                const payrollResult = payrollStmt.run(periodId, staff.id, basic, gross, totalDeductions, net)
                const payrollId = payrollResult.lastInsertRowid

                // Store individual allowances in payroll_allowance table
                const allowanceStmt = db.prepare('INSERT INTO payroll_allowance (payroll_id, allowance_name, amount) VALUES (?, ?, ?)')
                for (const allowance of staffAllowances) {
                    allowanceStmt.run(payrollId, allowance.allowance_name, allowance.amount)
                }

                results.push({
                    staff_name: `${staff.first_name} ${staff.middle_name || ''} ${staff.last_name}`.replace(/  +/g, ' ').trim(),
                    basic_salary: basic,
                    allowances,
                    gross_salary: gross,
                    paye, nhif, nssf,
                    other_deductions: 0,
                    net_salary: net
                })
            }

            return { success: true, periodId, results }
        })()
    })

    ipcMain.handle('payroll:getHistory', async () => {
        return db.prepare('SELECT * FROM payroll_period ORDER BY year DESC, month DESC').all()
    })

    ipcMain.handle('payroll:getDetails', async (_event: IpcMainInvokeEvent, periodId: number) => {
        const period = db.prepare('SELECT * FROM payroll_period WHERE id = ?').get(periodId)
        if (!period) return { success: false, error: 'Period not found' }

        const results = db.prepare(`
            SELECT p.*, 
                   (s.first_name || ' ' || COALESCE(s.middle_name || ' ', '') || s.last_name) as staff_name, 
                   s.staff_number, s.department, s.job_title, s.phone
            FROM payroll p
            JOIN staff s ON p.staff_id = s.id
            WHERE p.period_id = ?
        `).all(periodId)

        return { success: true, period, results }
    })

    // ======== STAFF ALLOWANCES ========
    ipcMain.handle('staff:getAllowances', async (_event: IpcMainInvokeEvent, staffId: number) => {
        return db.prepare('SELECT * FROM staff_allowance WHERE staff_id = ? AND is_active = 1 ORDER BY allowance_name').all(staffId)
    })

    ipcMain.handle('staff:addAllowance', async (_event: IpcMainInvokeEvent, staffId: number, allowanceName: string, amount: number) => {
        const result = db.prepare(
            'INSERT INTO staff_allowance (staff_id, allowance_name, amount) VALUES (?, ?, ?)'
        ).run(staffId, allowanceName, amount)
        return { success: true, id: result.lastInsertRowid }
    })

    ipcMain.handle('staff:deleteAllowance', async (_event: IpcMainInvokeEvent, allowanceId: number) => {
        db.prepare('UPDATE staff_allowance SET is_active = 0 WHERE id = ?').run(allowanceId)
        return { success: true }
    })
}

















