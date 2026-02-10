import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'
import { ipcMain } from '../../electron-env'

import type { StaffMember } from './types'
import type { IpcMainInvokeEvent } from 'electron'

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

interface PayrollComputationResult {
    staff_name: string
    staff_number: string
    gross_salary: number
    nssf: number
    housing_levy: number
    shif: number
    paye: number
    total_deductions: number
    net_salary: number
}

interface PayrollStatutoryComputation {
    nssf: number
    housingLevy: number
    shif: number
    paye: number
    totalDeductions: number
}

type PayrollPeriodCreationResult =
    | { success: true; periodId: number }
    | { success: false; error: string }

interface PayrollStaffComputationContext {
    db: ReturnType<typeof getDatabase>
    staff: StaffMember
    periodId: number
    rates: StatutoryRate[]
    payeBands: StatutoryRate[]
    payrollStmt: ReturnType<ReturnType<typeof getDatabase>['prepare']>
    deductionStmt: ReturnType<ReturnType<typeof getDatabase>['prepare']>
    allowanceStmt: ReturnType<ReturnType<typeof getDatabase>['prepare']>
}

const findRate = (rates: StatutoryRate[], rateType: string): StatutoryRate | undefined =>
    rates.find((rate) => rate.rate_type === rateType)

const getPayeBands = (rates: StatutoryRate[]): StatutoryRate[] =>
    rates
        .filter((rate) => rate.rate_type === 'PAYE_BAND')
        .sort((a, b) => a.min_amount - b.min_amount)

const calculatePaye = (taxablePay: number, payeBands: StatutoryRate[]): number => {
    let paye = 0
    let remainingTaxable = taxablePay

    for (const band of payeBands) {
        const bandRange = (band.max_amount || 99_999_999) - band.min_amount
        const amountInBand = Math.min(remainingTaxable, bandRange)
        if (amountInBand <= 0) {
            continue
        }
        paye += amountInBand * band.rate
        remainingTaxable -= amountInBand
    }

    return paye
}

const createPayrollPeriod = (
    db: ReturnType<typeof getDatabase>,
    month: number,
    year: number,
    userId: number
): PayrollPeriodCreationResult => {
    const existing = db.prepare('SELECT id FROM payroll_period WHERE month = ? AND year = ?').get(month, year) as { id: number } | undefined
    if (existing) {
        return { success: false, error: 'Payroll for this period already exists' }
    }

    const periodName = `${new Date(year, month - 1).toLocaleString('default', { month: 'long' })} ${year}`
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]

    const periodResult = db.prepare(`
        INSERT INTO payroll_period (
            period_name, month, year, start_date, end_date, status, created_at
        ) VALUES (?, ?, ?, ?, ?, 'DRAFT', CURRENT_TIMESTAMP)
    `).run(periodName, month, year, startDate, endDate)

    const periodId = periodResult.lastInsertRowid as number
    logAudit(userId, 'CREATE', 'payroll_period', periodId, null, { month, year, periodName })
    return { success: true, periodId }
}

const calculateStatutoryDeductions = (
    gross: number,
    rates: StatutoryRate[],
    payeBands: StatutoryRate[]
): PayrollStatutoryComputation => {
    const nssfTier1 = findRate(rates, 'NSSF_TIER_I')?.fixed_amount || 720
    const nssfTier2 = findRate(rates, 'NSSF_TIER_II')?.fixed_amount || 1440
    const nssf = nssfTier1 + (gross > 7000 ? nssfTier2 : 0)

    const housingLevyRate = findRate(rates, 'HOUSING_LEVY')?.rate || 0.015
    const housingLevy = gross * housingLevyRate

    const shifRate = findRate(rates, 'SHIF')?.rate || 0.0275
    const shif = gross * shifRate

    const taxablePay = gross - nssf
    const rawPaye = calculatePaye(taxablePay, payeBands)
    const personalRelief = findRate(rates, 'PERSONAL_RELIEF')?.fixed_amount || 2400
    const paye = Math.max(0, rawPaye - personalRelief)

    const totalDeductions = Math.round(nssf + housingLevy + shif + paye)
    return { nssf, housingLevy, shif, paye, totalDeductions }
}

const computeStaffPayroll = ({
    db,
    staff,
    periodId,
    rates,
    payeBands,
    payrollStmt,
    deductionStmt,
    allowanceStmt
}: PayrollStaffComputationContext): PayrollComputationResult => {
    const basic = staff.basic_salary || 0
    const staffAllowances = db.prepare('SELECT * FROM staff_allowance WHERE staff_id = ? AND is_active = 1').all(staff.id) as StaffAllowanceRow[]
    const totalAllowances = staffAllowances.reduce((sum, allowance) => sum + allowance.amount, 0)
    const gross = basic + totalAllowances

    const { nssf, housingLevy, shif, paye, totalDeductions } = calculateStatutoryDeductions(gross, rates, payeBands)
    const net = gross - totalDeductions

    const payrollResult = payrollStmt.run(periodId, staff.id, basic, gross, totalDeductions, net)
    const payrollId = payrollResult.lastInsertRowid

    deductionStmt.run(payrollId, 'NSSF', nssf)
    deductionStmt.run(payrollId, 'Housing Levy', housingLevy)
    deductionStmt.run(payrollId, 'SHIF', shif)
    deductionStmt.run(payrollId, 'PAYE', paye)

    for (const allowance of staffAllowances) {
        allowanceStmt.run(payrollId, allowance.allowance_name, allowance.amount)
    }

    return {
        staff_name: `${staff.first_name} ${staff.last_name}`.trim(),
        staff_number: staff.staff_number,
        gross_salary: gross,
        nssf,
        housing_levy: housingLevy,
        shif,
        paye,
        total_deductions: totalDeductions,
        net_salary: net
    }
}

const runPayrollForPeriod = (
    db: ReturnType<typeof getDatabase>,
    month: number,
    year: number,
    userId: number
): { success: true; periodId: number; results: PayrollComputationResult[] } | { success: false; error: string } => {
    const periodCreation = createPayrollPeriod(db, month, year, userId)
    if (!periodCreation.success || !periodCreation.periodId) {
        return { success: false, error: periodCreation.error || 'Failed to create payroll period' }
    }
    const periodId = periodCreation.periodId

    const rates = db.prepare('SELECT * FROM statutory_rates WHERE is_current = 1').all() as StatutoryRate[]
    const payeBands = getPayeBands(rates)
    const staffList = db.prepare('SELECT * FROM staff WHERE is_active = 1').all() as StaffMember[]

    const payrollStmt = db.prepare(`
        INSERT INTO payroll (period_id, staff_id, basic_salary, gross_salary, total_deductions, net_salary)
        VALUES (?, ?, ?, ?, ?, ?)
    `)
    const deductionStmt = db.prepare('INSERT INTO payroll_deduction (payroll_id, deduction_name, amount) VALUES (?, ?, ?)')
    const allowanceStmt = db.prepare('INSERT INTO payroll_allowance (payroll_id, allowance_name, amount) VALUES (?, ?, ?)')

    const results = staffList.map((staff) => computeStaffPayroll({
        db,
        staff,
        periodId,
        rates,
        payeBands,
        payrollStmt,
        deductionStmt,
        allowanceStmt
    }))

    return { success: true, periodId, results }
}

export function registerPayrollHandlers(): void {
    const db = getDatabase()

    // ======== PAYROLL ========
    ipcMain.handle('payroll:run', async (_event: IpcMainInvokeEvent, month: number, year: number, userId: number) => {
        return db.transaction(() => runPayrollForPeriod(db, month, year, userId))()
    })

    ipcMain.handle('payroll:getHistory', async () => {
        return db.prepare('SELECT * FROM payroll_period ORDER BY year DESC, month DESC').all()
    })

    ipcMain.handle('payroll:getDetails', async (_event: IpcMainInvokeEvent, periodId: number) => {
        const period = db.prepare('SELECT * FROM payroll_period WHERE id = ?').get(periodId)
        if (!period) {return { success: false, error: 'Period not found' }}

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


















