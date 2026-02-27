
import { getDatabase } from '../../database'

import type Database from 'better-sqlite3'

// ============================================================================
// TYPES
// ============================================================================

interface P10Row {
    readonly kra_pin: string
    readonly employee_name: string
    readonly residential_status: 'Resident' | 'Non-Resident'
    readonly basic_salary: number
    readonly housing_allowance: number
    readonly transport_allowance: number
    readonly leave_pay: number
    readonly overtime_allowance: number
    readonly director_fee: number
    readonly lump_sum_payment: number
    readonly other_allowances: number
    readonly gross_pay: number
    readonly e1_30_percent_of_basic: number
    readonly e2_actual_contribution: number
    readonly e3_permissible_limit: number
    readonly allowable_pension_deduction: number
    readonly personal_relief: number
    readonly insurance_relief: number
    readonly paye_tax: number
    readonly type_of_employee: 'Primary' | 'Secondary'
}

const P10_FIELDS: Array<{ label: string; key: keyof P10Row }> = [
    { label: 'KRA PIN', key: 'kra_pin' },
    { label: 'Employee Name', key: 'employee_name' },
    { label: 'Residential Status', key: 'residential_status' },
    { label: 'Type of Employee', key: 'type_of_employee' },
    { label: 'Basic Salary', key: 'basic_salary' },
    { label: 'Housing Allowance', key: 'housing_allowance' },
    { label: 'Transport Allowance', key: 'transport_allowance' },
    { label: 'Leave Pay', key: 'leave_pay' },
    { label: 'Overtime Allowance', key: 'overtime_allowance' },
    { label: 'Director Fee', key: 'director_fee' },
    { label: 'Lump Sum Payment', key: 'lump_sum_payment' },
    { label: 'Other Allowances', key: 'other_allowances' },
    { label: 'Gross Pay', key: 'gross_pay' },
    { label: 'E1', key: 'e1_30_percent_of_basic' },
    { label: 'E2', key: 'e2_actual_contribution' },
    { label: 'E3', key: 'e3_permissible_limit' },
    { label: 'Allowable Pension Deduction', key: 'allowable_pension_deduction' },
    { label: 'Personal Relief', key: 'personal_relief' },
    { label: 'Insurance Relief', key: 'insurance_relief' },
    { label: 'PAYE Tax', key: 'paye_tax' }
]

function getAllowanceBreakdown(allowances: Array<{ allowance_name: string; amount: number }>) {
    let housing = 0; let transport = 0; let leave = 0; let overtime = 0; let other = 0
    for (const al of allowances) {
        const name = al.allowance_name.toLowerCase()
        if (name.includes('house') || name.includes('housing')) { housing += al.amount }
        else if (name.includes('transport') || name.includes('travel') || name.includes('commute')) { transport += al.amount }
        else if (name.includes('leave')) { leave += al.amount }
        else if (name.includes('overtime')) { overtime += al.amount }
        else { other += al.amount }
    }
    return { housing, transport, leave, overtime, other }
}

function getDeductions(deductions: Array<{ deduction_name: string; amount: number }>) {
    let paye = 0
    let personalRelief = 0
    let nssf = 0
    for (const ded of deductions) {
        const name = ded.deduction_name.toLowerCase()
        if (name === 'paye') { paye = ded.amount }
        else if (name === 'nssf') { nssf = ded.amount }
        else if (name === 'personal_relief') { personalRelief = ded.amount }
    }
    return { paye, nssf, personalRelief }
}
// ============================================================================
// SERVICE
// ============================================================================

class P10ExportService {
    private readonly db: Database.Database

    constructor(db?: Database.Database) {
        this.db = db || getDatabase()
    }

    /**
     * Extract payroll data for a specific period and map it into the KRA P10 format.
     * Returns a raw CSV string ready to be saved to disk and uploaded to iTax.
     */
    generateP10Csv(periodId: number): string {
        const period = this.db.prepare(
            'SELECT month, year FROM payroll_period WHERE id = ?'
        ).get(periodId) as { month: number; year: number } | undefined

        if (!period) {
            throw new Error(`Payroll period ${periodId} not found`)
        }

        const payrolls = this.db.prepare(`
      SELECT p.id as payroll_id, p.basic_salary, p.gross_salary,
             s.kra_pin, s.first_name || ' ' || COALESCE(s.last_name, '') as name
      FROM payroll p
      JOIN staff s ON p.staff_id = s.id
      WHERE p.period_id = ?
    `).all(periodId) as Array<{
            payroll_id: number; basic_salary: number; gross_salary: number;
            kra_pin: string; name: string
        }>

        const rows: P10Row[] = []

        for (const p of payrolls) {
            // Get all allowances for this payroll
            const allowances = this.db.prepare(
                'SELECT allowance_name, amount FROM payroll_allowance WHERE payroll_id = ?'
            ).all(p.payroll_id) as Array<{ allowance_name: string; amount: number }>
            const { housing, transport, leave, overtime, other } = getAllowanceBreakdown(allowances)

            // Get deductions
            const deductions = this.db.prepare(
                'SELECT deduction_name, amount FROM payroll_deduction WHERE payroll_id = ?'
            ).all(p.payroll_id) as Array<{ deduction_name: string; amount: number }>
            const { paye, nssf, personalRelief } = getDeductions(deductions)

            // P10 Computation Logic (Simplified mapping for KRA upload structure)
            const e1 = p.basic_salary * 0.30
            const e2 = nssf
            const e3 = 20000 // Statutory max permissible limit for Pension
            const allowablePension = Math.min(e1, e2, e3)

            rows.push({
                kra_pin: p.kra_pin || 'NOT_PROVIDED',
                employee_name: p.name.trim(),
                residential_status: 'Resident', // Defaulting to Resident
                basic_salary: p.basic_salary,
                housing_allowance: housing,
                transport_allowance: transport,
                leave_pay: leave,
                overtime_allowance: overtime,
                director_fee: 0,
                lump_sum_payment: 0,
                other_allowances: other,
                gross_pay: p.gross_salary,
                e1_30_percent_of_basic: e1,
                e2_actual_contribution: e2,
                e3_permissible_limit: e3,
                allowable_pension_deduction: allowablePension,
                personal_relief: personalRelief || 2400, // standard P10 personal relief is 2400 Ksh/month
                insurance_relief: 0, // NHIF relief if active, default 0
                paye_tax: Math.max(0, paye), // Ensure non-negative
                type_of_employee: 'Primary' // Assuming all are primary employment in the school
            })
        }

        if (rows.length === 0) {
            return '' // No data
        }

        // Export as CSV matching KRA iTax columns
        const fields = P10_FIELDS

        const header = fields.map(f => `"${f.label}"`).join(',')

        const dataRows = rows.map(row => {
            return fields.map(f => {
                const val = row[f.key]
                if (typeof val === 'number') {
                    return val.toString()
                }
                if (typeof val === 'string') {
                    return `"${val.replace(/"/g, '""')}"`
                }
                return ''
            }).join(',')
        })

        return [header, ...dataRows].join('\n')
    }
}

export { P10ExportService }
export type { P10Row }
