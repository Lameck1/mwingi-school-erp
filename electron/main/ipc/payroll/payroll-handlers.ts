import { z } from 'zod'

import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'
import { DoubleEntryJournalService } from '../../services/accounting/DoubleEntryJournalService'
import { SystemAccounts } from '../../services/accounting/SystemAccounts'
import { PayrollJournalService } from '../../services/finance/PayrollJournalService'
import { ROLES } from '../ipc-result'
import { PayrollRunSchema, PayrollConfirmSchema, PayrollMarkPaidSchema, PayrollRevertSchema, StaffAllowanceAddSchema, StaffAllowanceDeleteSchema } from '../schemas/payroll-schemas'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

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

interface PayrollComputationResult {
    staff_id: number
    staff_name: string
    staff_number: string
    department: string
    job_title: string
    phone: string
    basic_salary: number
    allowances: number
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

const PAYROLL_VIEW_ROLES = ['ADMIN', 'ACCOUNTS_CLERK', 'PRINCIPAL', 'DEPUTY_PRINCIPAL'] as const

const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

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
    const endDate = formatLocalDate(new Date(year, month, 0))

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
    const basicCents = staff.basic_salary || 0
    const staffAllowances = db.prepare('SELECT * FROM staff_allowance WHERE staff_id = ? AND is_active = 1').all(staff.id) as StaffAllowanceRow[]
    const totalAllowancesCents = staffAllowances.reduce((sum, a) => sum + a.amount, 0)
    const grossCents = basicCents + totalAllowancesCents

    // Convert to KSh for statutory calculations (rates/bands are denominated in KSh)
    const grossKsh = grossCents / 100
    const statutory = calculateStatutoryDeductions(grossKsh, rates, payeBands)

    // Convert statutory results back to cents for consistent storage
    const nssfCents = Math.round(statutory.nssf * 100)
    const housingLevyCents = Math.round(statutory.housingLevy * 100)
    const shifCents = Math.round(statutory.shif * 100)
    const payeCents = Math.round(statutory.paye * 100)
    const totalDeductionsCents = nssfCents + housingLevyCents + shifCents + payeCents
    const netCents = grossCents - totalDeductionsCents

    const payrollResult = payrollStmt.run([periodId, staff.id, basicCents, grossCents, totalDeductionsCents, netCents])
    const payrollId = payrollResult.lastInsertRowid

    deductionStmt.run([payrollId, 'NSSF', nssfCents])
    deductionStmt.run([payrollId, 'Housing Levy', housingLevyCents])
    deductionStmt.run([payrollId, 'SHIF', shifCents])
    deductionStmt.run([payrollId, 'PAYE', payeCents])

    for (const allowance of staffAllowances) {
        allowanceStmt.run([payrollId, allowance.allowance_name, allowance.amount])
    }

    return {
        staff_id: staff.id,
        staff_name: `${staff.first_name} ${staff.last_name}`.trim(),
        staff_number: staff.staff_number,
        department: staff.department,
        job_title: staff.job_title,
        phone: staff.phone || '',
        basic_salary: basicCents,
        allowances: totalAllowancesCents,
        gross_salary: grossCents,
        nssf: nssfCents,
        housing_levy: housingLevyCents,
        shif: shifCents,
        paye: payeCents,
        total_deductions: totalDeductionsCents,
        net_salary: netCents
    }
}

const runPayrollForPeriod = (
    db: ReturnType<typeof getDatabase>,
    month: number,
    year: number,
    userId: number
): { success: true; periodId: number; results: PayrollComputationResult[] } | { success: false; error: string } => {
    const periodCreation = createPayrollPeriod(db, month, year, userId)
    if (!periodCreation.success) {
        return { success: false, error: periodCreation.error }
    }
    if (!periodCreation.periodId) {
        return { success: false, error: 'Failed to create payroll period' }
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

function getOrCreateSalaryCategoryId(db: ReturnType<typeof getDatabase>): number {
    const row = db.prepare("SELECT id FROM transaction_category WHERE category_name = 'Salary Payment' LIMIT 1").get() as { id: number } | undefined
    if (row?.id) {
        return row.id
    }
    const result = db.prepare("INSERT INTO transaction_category (category_name, category_type, is_system, is_active) VALUES ('Salary Payment', 'EXPENSE', 1, 1)").run()
    return result.lastInsertRowid as number
}

const PERIOD_NOT_FOUND = 'Period not found'
const SELECT_PERIOD = 'SELECT * FROM payroll_period WHERE id = ?'

function getPeriodOrFail(db: ReturnType<typeof getDatabase>, periodId: number): { id: number; status: string; period_name?: string } | null {
    return (db.prepare(SELECT_PERIOD).get(periodId) as { id: number; status: string; period_name?: string } | undefined) ?? null
}


function registerPayrollStatusHandlers(db: ReturnType<typeof getDatabase>, journalService: DoubleEntryJournalService): void {
    validatedHandlerMulti('payroll:confirm', ROLES.FINANCE, PayrollConfirmSchema, (event, [periodId, _legacyId], actorCtx) => {
        const actorId = actorCtx.id
        return db.transaction(() => {
            const period = getPeriodOrFail(db, periodId)
            if (!period) { return { success: false, error: PERIOD_NOT_FOUND } }
            if (period.status !== 'DRAFT') { return { success: false, error: 'Only DRAFT payrolls can be confirmed' } }
            db.prepare('UPDATE payroll_period SET status = ?, approved_by_user_id = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?')
                .run('CONFIRMED', actorId, periodId)
            logAudit(actorId, 'UPDATE', 'payroll_period', periodId, { status: 'DRAFT' }, { status: 'CONFIRMED' })
            return { success: true }
        })()
    })

    validatedHandlerMulti('payroll:markPaid', ROLES.FINANCE, PayrollMarkPaidSchema, (event, [periodId, _legacyId], actorCtx) => {
        const actorId = actorCtx.id
        return db.transaction(() => {
            const period = getPeriodOrFail(db, periodId)
            if (!period) { return { success: false, error: PERIOD_NOT_FOUND } }
            if (period.status !== 'CONFIRMED') { return { success: false, error: 'Only CONFIRMED payrolls can be marked as paid' } }
            const paymentDate = formatLocalDate(new Date())
            db.prepare('UPDATE payroll_period SET status = ? WHERE id = ?').run('PAID', periodId)
            db.prepare('UPDATE payroll SET payment_status = ?, payment_date = ? WHERE period_id = ?')
                .run('PAID', paymentDate, periodId)

            const totalNet = (db.prepare('SELECT COALESCE(SUM(net_salary), 0) as total FROM payroll WHERE period_id = ?').get(periodId) as { total: number }).total
            if (totalNet > 0) {
                const salaryCategoryId = getOrCreateSalaryCategoryId(db)

                db.prepare(`
                    INSERT INTO ledger_transaction (
                        transaction_ref, amount, transaction_date, transaction_type,
                        category_id, debit_credit, description, payment_method,
                        recorded_by_user_id
                    ) VALUES (?, ?, ?, 'EXPENSE', ?, 'DEBIT', ?, 'BANK_TRANSFER', ?)
                `).run(
                    `PAY-${periodId}-${Date.now()}`,
                    totalNet,
                    paymentDate,
                    salaryCategoryId,
                    `Salary payment for period #${periodId}`,
                    actorId
                )

                const journalResult = journalService.createJournalEntrySync({
                    entry_date: paymentDate,
                    entry_type: 'SALARY',
                    description: `Salary payment for period #${periodId}`,
                    created_by_user_id: actorId,
                    lines: [
                        {
                            gl_account_code: SystemAccounts.SALARY_PAYABLE,
                            debit_amount: totalNet,
                            credit_amount: 0,
                            description: 'Salary payment - reduce payable'
                        },
                        {
                            gl_account_code: SystemAccounts.BANK,
                            debit_amount: 0,
                            credit_amount: totalNet,
                            description: 'Bank transfer for salaries'
                        }
                    ]
                })
                if (!journalResult.success) {
                    throw new Error(journalResult.error || 'Failed to create journal entry for salary payment')
                }
            }

            logAudit(actorId, 'UPDATE', 'payroll_period', periodId, { status: 'CONFIRMED' }, { status: 'PAID' })
            return { success: true }
        })()
    })

    validatedHandlerMulti('payroll:revertToDraft', ROLES.FINANCE, PayrollRevertSchema, (event, [periodId, _legacyId], actorCtx) => {
        const actorId = actorCtx.id
        return db.transaction(() => {
            const period = getPeriodOrFail(db, periodId)
            if (!period) { return { success: false, error: PERIOD_NOT_FOUND } }
            if (period.status !== 'CONFIRMED') { return { success: false, error: 'Only CONFIRMED payrolls can be reverted to draft' } }
            db.prepare('UPDATE payroll_period SET status = ?, approved_by_user_id = NULL, approved_at = NULL WHERE id = ?')
                .run('DRAFT', periodId)
            logAudit(actorId, 'UPDATE', 'payroll_period', periodId, { status: 'CONFIRMED' }, { status: 'DRAFT' })
            return { success: true }
        })()
    })

    validatedHandlerMulti('payroll:delete', ROLES.FINANCE, PayrollRevertSchema, (event, [periodId, _legacyId], actorCtx) => {
        const actorId = actorCtx.id
        return db.transaction(() => {
            const period = getPeriodOrFail(db, periodId)
            if (!period) { return { success: false, error: PERIOD_NOT_FOUND } }
            if (period.status !== 'DRAFT') { return { success: false, error: 'Only DRAFT payrolls can be deleted' } }
            db.prepare('DELETE FROM payroll_allowance WHERE payroll_id IN (SELECT id FROM payroll WHERE period_id = ?)').run(periodId)
            db.prepare('DELETE FROM payroll_deduction WHERE payroll_id IN (SELECT id FROM payroll WHERE period_id = ?)').run(periodId)
            db.prepare('DELETE FROM payroll WHERE period_id = ?').run(periodId)
            db.prepare('DELETE FROM payroll_period WHERE id = ?').run(periodId)
            logAudit(actorId, 'DELETE', 'payroll_period', periodId, { period_name: period.period_name }, null)
            return { success: true }
        })()
    })

    validatedHandlerMulti('payroll:recalculate', ROLES.FINANCE, PayrollRevertSchema, (event, [periodId, _legacyId], actorCtx) => {
        return db.transaction(() => recalculatePayroll(db, periodId, actorCtx.id))()
    })
}

function recalculatePayroll(db: ReturnType<typeof getDatabase>, periodId: number, userId: number) {
    const period = getPeriodOrFail(db, periodId)
    if (!period) { return { success: false, error: PERIOD_NOT_FOUND } }
    if (period.status !== 'DRAFT') { return { success: false, error: 'Only DRAFT payrolls can be recalculated' } }

    db.prepare('DELETE FROM payroll_allowance WHERE payroll_id IN (SELECT id FROM payroll WHERE period_id = ?)').run(periodId)
    db.prepare('DELETE FROM payroll_deduction WHERE payroll_id IN (SELECT id FROM payroll WHERE period_id = ?)').run(periodId)
    db.prepare('DELETE FROM payroll WHERE period_id = ?').run(periodId)

    const rates = db.prepare('SELECT * FROM statutory_rates WHERE is_current = 1').all() as StatutoryRate[]
    if (rates.length === 0) {
        return { success: false, error: 'No statutory rates configured. Please set up PAYE bands, NSSF, and NHIF rates before running payroll.' }
    }
    const payeBands = getPayeBands(rates)
    const staffList = db.prepare('SELECT * FROM staff WHERE is_active = 1').all() as StaffMember[]
    if (staffList.length === 0) {
        return { success: false, error: 'No active staff found to process payroll' }
    }

    const payrollStmt = db.prepare(`
        INSERT INTO payroll (period_id, staff_id, basic_salary, gross_salary, total_deductions, net_salary)
        VALUES (?, ?, ?, ?, ?, ?)
    `)
    const deductionStmt = db.prepare('INSERT INTO payroll_deduction (payroll_id, deduction_name, amount) VALUES (?, ?, ?)')
    const allowanceStmt = db.prepare('INSERT INTO payroll_allowance (payroll_id, allowance_name, amount) VALUES (?, ?, ?)')

    const results = staffList.map((staff) => computeStaffPayroll({
        db, staff, periodId, rates, payeBands, payrollStmt, deductionStmt, allowanceStmt
    }))

    logAudit(userId, 'UPDATE', 'payroll_period', periodId, null, { action: 'recalculate', staffCount: results.length })
    return { success: true, periodId, results }
}

function registerStaffAllowanceHandlers(db: ReturnType<typeof getDatabase>): void {
    validatedHandler('staff:getAllowances', ROLES.STAFF, z.number(), (_event, staffId) => {
        return db.prepare('SELECT * FROM staff_allowance WHERE staff_id = ? AND is_active = 1 ORDER BY allowance_name').all(staffId)
    })

    validatedHandlerMulti('staff:addAllowance', ROLES.FINANCE, StaffAllowanceAddSchema, (_event, [staffId, allowanceName, amount], _actor) => {
        const result = db.prepare(
            'INSERT INTO staff_allowance (staff_id, allowance_name, amount) VALUES (?, ?, ?)'
        ).run(staffId, allowanceName, amount)
        return { success: true, id: result.lastInsertRowid }
    })

    validatedHandler('staff:deleteAllowance', ROLES.FINANCE, StaffAllowanceDeleteSchema, (_event, allowanceId) => {
        db.prepare('UPDATE staff_allowance SET is_active = 0 WHERE id = ?').run(allowanceId)
        return { success: true }
    })
}

export function registerPayrollHandlers(): void {
    const db = getDatabase()
    const payrollJournalService = new PayrollJournalService(db)

    validatedHandlerMulti('payroll:run', ROLES.FINANCE, PayrollRunSchema, (event, [month, year, _legacyId], actorCtx) => {
        return db.transaction(() => runPayrollForPeriod(db, month, year, actorCtx.id))()
    })

    validatedHandler('payroll:getHistory', PAYROLL_VIEW_ROLES, z.void(), () => {
        return db.prepare('SELECT * FROM payroll_period ORDER BY year DESC, month DESC').all()
    })

    validatedHandler('payroll:getDetails', PAYROLL_VIEW_ROLES, z.number(), (_event, periodId) => {
        const period = db.prepare(SELECT_PERIOD).get(periodId)
        if (!period) { return { success: false, error: PERIOD_NOT_FOUND } }

        const results = db.prepare(`
            SELECT p.*,
                (s.first_name || ' ' || COALESCE(s.middle_name || ' ', '') || s.last_name) as staff_name,
                s.staff_number, s.department, s.job_title, s.phone,
                COALESCE((SELECT SUM(a.amount) FROM payroll_allowance a WHERE a.payroll_id = p.id), 0) as allowances,
                COALESCE((SELECT d.amount FROM payroll_deduction d WHERE d.payroll_id = p.id AND d.deduction_name = 'PAYE'), 0) as paye,
                COALESCE((SELECT d.amount FROM payroll_deduction d WHERE d.payroll_id = p.id AND d.deduction_name = 'NSSF'), 0) as nssf,
                COALESCE((SELECT d.amount FROM payroll_deduction d WHERE d.payroll_id = p.id AND d.deduction_name = 'SHIF'), 0) as shif,
                COALESCE((SELECT d.amount FROM payroll_deduction d WHERE d.payroll_id = p.id AND d.deduction_name = 'Housing Levy'), 0) as housing_levy
            FROM payroll p
            JOIN staff s ON p.staff_id = s.id
            WHERE p.period_id = ?
        `).all(periodId)

        return { success: true, period, results }
    })

    validatedHandlerMulti('payroll:postToGL', ROLES.FINANCE, PayrollRevertSchema, async (event, [periodId, _legacyId], actorCtx) => {
        return payrollJournalService.postPayrollToGL(periodId, actorCtx.id)
    })

    const journalService = new DoubleEntryJournalService(db)
    registerPayrollStatusHandlers(db, journalService)
    registerStaffAllowanceHandlers(db)
}



