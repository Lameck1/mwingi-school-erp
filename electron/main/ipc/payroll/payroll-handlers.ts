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

interface StatutoryRate {
    id: number
    rate_type: string
    min_amount: number
    max_amount?: number
    rate: number
    fixed_amount: number
    is_current: number
}

export function registerPayrollHandlers(): void {
    const db = getDatabase()

    // ======== PAYROLL ========
    ipcMain.handle('payroll:run', async (_event: IpcMainInvokeEvent, month: number, year: number, userId: number) => {
        return db.transaction(() => {
            // 1. Check if payroll already exists
            const existing = db.prepare('SELECT id FROM payroll_period WHERE month = ? AND year = ?').get(month, year) as { id: number } | undefined
            if (existing) return { success: false, error: 'Payroll for this period already exists' }

            // 2. Fetch Active Statutory Rates
            const rates = db.prepare('SELECT * FROM statutory_rates WHERE is_current = 1').all() as StatutoryRate[]
            const getRate = (type: string) => rates.find(r => r.rate_type === type)
            const payeBands = rates.filter(r => r.rate_type === 'PAYE_BAND').sort((a, b) => a.min_amount - b.min_amount)

            // 3. Create Payroll Period
            const periodName = `${new Date(year, month - 1).toLocaleString('default', { month: 'long' })} ${year}`
            const startDate = `${year}-${String(month).padStart(2, '0')}-01`
            const endDate = new Date(year, month, 0).toISOString().split('T')[0]

            const periodResult = db.prepare(`INSERT INTO payroll_period (
                period_name, month, year, start_date, end_date, status, created_at
            ) VALUES (?, ?, ?, ?, ?, 'DRAFT', CURRENT_TIMESTAMP)`).run(periodName, month, year, startDate, endDate)

            const periodId = periodResult.lastInsertRowid

            logAudit(userId, 'CREATE', 'payroll_period', periodId as number, null, { month, year, periodName })

            // 4. Get Active Staff
            const staffList = db.prepare('SELECT * FROM staff WHERE is_active = 1').all() as StaffMember[]

            const payrollStmt = db.prepare(`INSERT INTO payroll (
                period_id, staff_id, basic_salary, gross_salary, total_deductions, net_salary
            ) VALUES (?, ?, ?, ?, ?, ?)`)

            const deductionStmt = db.prepare('INSERT INTO payroll_deduction (payroll_id, deduction_name, amount) VALUES (?, ?, ?)')
            const allowanceStmt = db.prepare('INSERT INTO payroll_allowance (payroll_id, allowance_name, amount) VALUES (?, ?, ?)')

            const results = []

            for (const staff of staffList) {
                const basic = staff.basic_salary || 0
                const staffAllowances = db.prepare('SELECT * FROM staff_allowance WHERE staff_id = ? AND is_active = 1').all(staff.id) as StaffAllowanceRow[]
                const totalAllowances = staffAllowances.reduce((sum, a) => sum + a.amount, 0)
                const gross = basic + totalAllowances

                // --- ROBUST STATUTORY CALCULATIONS ---

                // 1. NSSF (Tier I + II)
                const nssfTier1 = getRate('NSSF_TIER_I')?.fixed_amount || 720
                const nssfTier2 = getRate('NSSF_TIER_II')?.fixed_amount || 1440
                const nssf = nssfTier1 + (gross > 7000 ? nssfTier2 : 0)

                // 2. Housing Levy (1.5%)
                const housingLevyRate = getRate('HOUSING_LEVY')?.rate || 0.015
                const housingLevy = gross * housingLevyRate

                // 3. SHIF (2.75%)
                const shifRate = getRate('SHIF')?.rate || 0.0275
                const shif = gross * shifRate

                // 4. PAYE Calculation
                const taxablePay = gross - nssf
                let paye = 0
                let remainingTaxable = taxablePay

                for (const band of payeBands) {
                    const bandRange = (band.max_amount || 99999999) - band.min_amount
                    const amountInBand = Math.min(remainingTaxable, bandRange)
                    if (amountInBand > 0) {
                        paye += amountInBand * band.rate
                        remainingTaxable -= amountInBand
                    }
                }

                // Apply Personal Relief
                const personalRelief = getRate('PERSONAL_RELIEF')?.fixed_amount || 2400
                paye = Math.max(0, paye - personalRelief)

                const totalDeductions = Math.round(nssf + housingLevy + shif + paye)
                const net = gross - totalDeductions

                // Save Payroll
                const payrollResult = payrollStmt.run(periodId, staff.id, basic, gross, totalDeductions, net)
                const payrollId = payrollResult.lastInsertRowid

                // Save Deductions Breakdown
                deductionStmt.run(payrollId, 'NSSF', nssf)
                deductionStmt.run(payrollId, 'Housing Levy', housingLevy)
                deductionStmt.run(payrollId, 'SHIF', shif)
                deductionStmt.run(payrollId, 'PAYE', paye)

                for (const allowance of staffAllowances) {
                    allowanceStmt.run(payrollId, allowance.allowance_name, allowance.amount)
                }

                results.push({
                    staff_name: `${staff.first_name} ${staff.last_name}`.trim(),
                    staff_number: staff.staff_number,
                    gross_salary: gross,
                    nssf, housing_levy: housingLevy, shif, paye,
                    total_deductions: totalDeductions,
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

















