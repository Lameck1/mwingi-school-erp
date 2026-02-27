
import { getDatabase } from '../../database'

import type Database from 'better-sqlite3'

// ============================================================================
// TYPES
// ============================================================================

interface PayslipData {
    readonly payslip_id: string
    readonly generated_at: string
    readonly school_name: string
    readonly period_name: string

    readonly employee: {
        readonly staff_number: string
        readonly name: string
        readonly id_number: string
        readonly kra_pin: string
        readonly department: string
        readonly job_title: string
    }

    readonly earnings: {
        readonly basic_salary: number
        readonly allowances: ReadonlyArray<{ name: string; amount: number }>
        readonly gross_pay: number
    }

    readonly deductions: {
        readonly items: ReadonlyArray<{ name: string; amount: number }>
        readonly total_deductions: number
    }

    readonly net_pay: number
}

// ============================================================================
// SERVICE
// ============================================================================

class PayslipGenerationService {
    private readonly db: Database.Database

    constructor(db?: Database.Database) {
        this.db = db || getDatabase()
    }

    /**
     * Generate a structured JSON payslip for a specific employee and period.
     * This structure is designed for the React frontend to easily render or print as PDF.
     */
    generatePayslip(payrollId: number): PayslipData {
        const payroll = this.db.prepare(`
      SELECT 
        p.id, p.basic_salary, p.gross_salary, p.total_deductions, p.net_salary,
        pp.period_name, pp.month, pp.year,
        s.staff_number, s.first_name || ' ' || COALESCE(s.last_name, '') as name,
        s.id_number, s.kra_pin, s.department, s.job_title
      FROM payroll p
      JOIN payroll_period pp ON p.period_id = pp.id
      JOIN staff s ON p.staff_id = s.id
      WHERE p.id = ?
    `).get(payrollId) as {
            id: number
            basic_salary: number
            gross_salary: number
            total_deductions: number
            net_salary: number
            period_name: string
            month: number
            year: number
            staff_number: string
            name: string
            id_number: string | null
            kra_pin: string | null
            department: string | null
            job_title: string | null
        } | undefined

        if (!payroll) {
            throw new Error(`Payroll record ${payrollId} not found`)
        }

        const allowances = this.db.prepare(
            'SELECT allowance_name as name, amount FROM payroll_allowance WHERE payroll_id = ?'
        ).all(payrollId) as Array<{ name: string; amount: number }>

        const deductions = this.db.prepare(
            'SELECT deduction_name as name, amount FROM payroll_deduction WHERE payroll_id = ?'
        ).all(payrollId) as Array<{ name: string; amount: number }>

        // Note: Usually the school name comes from a settings table, 
        // but for now we default to the ERP's generic name.
        const schoolSettings = this.db.prepare(
            "SELECT setting_value FROM system_settings WHERE setting_key = 'SCHOOL_NAME'"
        ).get() as { setting_value: string } | undefined

        const schoolName = schoolSettings?.setting_value || 'Mwingi School'

        return {
            payslip_id: `PS-${payroll.year}-${payroll.month.toString().padStart(2, '0')}-${payroll.staff_number}`,
            generated_at: new Date().toISOString(),
            school_name: schoolName,
            period_name: payroll.period_name,
            employee: {
                staff_number: payroll.staff_number,
                name: payroll.name.trim(),
                id_number: payroll.id_number || 'N/A',
                kra_pin: payroll.kra_pin || 'N/A',
                department: payroll.department || 'N/A',
                job_title: payroll.job_title || 'N/A'
            },
            earnings: {
                basic_salary: payroll.basic_salary,
                allowances,
                gross_pay: payroll.gross_salary
            },
            deductions: {
                items: deductions,
                total_deductions: payroll.total_deductions
            },
            net_pay: payroll.net_salary
        }
    }

    /**
     * Get all payroll IDs for a given period to batch generate payslips.
     */
    getPayrollIdsForPeriod(periodId: number): number[] {
        const records = this.db.prepare(
            'SELECT id FROM payroll WHERE period_id = ? ORDER BY id ASC'
        ).all(periodId) as Array<{ id: number }>
        return records.map(r => r.id)
    }
}

export { PayslipGenerationService }
export type { PayslipData }
