
import { getDatabase } from '../../database'
import {
    buildFeeInvoiceAmountSql,
    buildFeeInvoiceOutstandingBalanceSql
} from '../../utils/feeInvoiceSql'

import type Database from 'better-sqlite3'

// ============================================================================
// TYPES
// ============================================================================

interface KpiMetric {
    readonly name: string
    readonly value: number
    readonly label: string
    readonly unit: string
    readonly trend?: 'UP' | 'DOWN' | 'STABLE'
    readonly target?: number
}

interface KpiDashboard {
    readonly generated_at: string
    readonly metrics: ReadonlyArray<KpiMetric>
}

// ============================================================================
// SERVICE
// ============================================================================

class KpiDashboardService {
    private readonly db: Database.Database

    constructor(db?: Database.Database) {
        this.db = db || getDatabase()
    }

    /**
     * Generate all KPI metrics for the dashboard.
     */
    generateDashboard(): KpiDashboard {
        const metrics: KpiMetric[] = [
            this.feeCollectionEfficiency(),
            this.currentRatio(),
            this.adminCostRatio(),
            this.budgetUtilization(),
            this.agedReceivablesDays(),
            this.revenuePerStudent(),
            this.costPerStudent(),
        ]

        return {
            generated_at: new Date().toISOString(),
            metrics
        }
    }

    /**
     * KPI 1: Fee Collection Efficiency (FCE)
     * = Total Collected / Total Invoiced × 100
     */
    private feeCollectionEfficiency(): KpiMetric {
        const invoiceAmountSql = buildFeeInvoiceAmountSql(this.db, 'fi')
        const result = this.db.prepare(`
      SELECT
        COALESCE(SUM(${invoiceAmountSql}), 0) as total_invoiced,
        COALESCE(SUM(fi.amount_paid), 0) as total_collected
      FROM fee_invoice fi
      WHERE fi.status != 'VOIDED'
    `).get() as { total_invoiced: number; total_collected: number }

        const fce = result.total_invoiced > 0
            ? Math.round((result.total_collected / result.total_invoiced) * 10000) / 100
            : 0

        return {
            name: 'fee_collection_efficiency',
            value: fce,
            label: 'Fee Collection Efficiency',
            unit: '%',
            target: 90
        }
    }

    /**
     * KPI 2: Current (Liquidity) Ratio
     * = Current Assets / Current Liabilities
     */
    private currentRatio(): KpiMetric {
        const assets = this.getPostedBalance('ASSET')
        const liabilities = this.getPostedBalance('LIABILITY')

        const ratio = liabilities > 0
            ? Math.round((assets / liabilities) * 100) / 100
            : assets > 0 ? 999 : 0

        return {
            name: 'current_ratio',
            value: ratio,
            label: 'Liquidity Ratio',
            unit: ':1',
            target: 1.5
        }
    }

    /**
     * KPI 3: Admin Cost Ratio
     * = Administration Expenses / Total Expenses × 100
     */
    private adminCostRatio(): KpiMetric {
        const totalExpenses = this.getPostedTotal('EXPENSE')
        const adminExpenses = this.getAdminExpenses()

        const ratio = totalExpenses > 0
            ? Math.round((adminExpenses / totalExpenses) * 10000) / 100
            : 0

        return {
            name: 'admin_cost_ratio',
            value: ratio,
            label: 'Admin Cost Ratio',
            unit: '%',
            target: 15
        }
    }

    /**
     * KPI 4: Budget Utilization
     * = Total Actuals / Total Budget × 100
     */
    private budgetUtilization(): KpiMetric {
        const result = this.db.prepare(`
      SELECT
        COALESCE(SUM(amount), 0) as total_budget,
        COALESCE(SUM(utilized), 0) as total_utilized
      FROM budget_allocation
    `).get() as { total_budget: number; total_utilized: number } | undefined

        const utilization = (result?.total_budget ?? 0) > 0
            ? Math.round(((result?.total_utilized ?? 0) / (result?.total_budget ?? 1)) * 10000) / 100
            : 0

        return {
            name: 'budget_utilization',
            value: utilization,
            label: 'Budget Utilization',
            unit: '%',
            target: 85
        }
    }

    /**
     * KPI 5: Average Aged Receivables Days
     * = Average days between invoice date and today for unpaid invoices
     */
    private agedReceivablesDays(): KpiMetric {
        const outstandingSql = buildFeeInvoiceOutstandingBalanceSql(this.db, 'fi')
        const result = this.db.prepare(`
      SELECT AVG(
        julianday('now') - julianday(COALESCE(fi.invoice_date, fi.due_date, fi.created_at))
      ) as avg_days
      FROM fee_invoice fi
      WHERE (${outstandingSql}) > 0
        AND fi.status NOT IN ('PAID', 'VOIDED', 'CANCELLED')
    `).get() as { avg_days: number | null }

        return {
            name: 'aged_receivables_days',
            value: Math.round(result.avg_days ?? 0),
            label: 'Avg. Receivables Age',
            unit: 'days',
            target: 30
        }
    }

    /**
     * KPI 6: Revenue per Student
     * = Total Revenue / Active Students
     */
    private revenuePerStudent(): KpiMetric {
        const revenue = this.getPostedTotal('REVENUE')
        const activeStudents = this.getActiveStudentCount()

        const perStudent = activeStudents > 0
            ? Math.round(revenue / activeStudents)
            : 0

        return {
            name: 'revenue_per_student',
            value: perStudent,
            label: 'Revenue per Student',
            unit: 'KES'
        }
    }

    /**
     * KPI 7: Cost per Student
     * = Total Expenses / Active Students
     */
    private costPerStudent(): KpiMetric {
        const expenses = this.getPostedTotal('EXPENSE')
        const activeStudents = this.getActiveStudentCount()

        const perStudent = activeStudents > 0
            ? Math.round(expenses / activeStudents)
            : 0

        return {
            name: 'cost_per_student',
            value: perStudent,
            label: 'Cost per Student',
            unit: 'KES'
        }
    }

    // ── HELPERS ────────────────────────────────────────────────────────

    private getPostedBalance(accountType: string): number {
        const result = this.db.prepare(`
      SELECT COALESCE(SUM(
        CASE WHEN ga.normal_balance = 'DEBIT'
          THEN COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)
          ELSE COALESCE(jel.credit_amount, 0) - COALESCE(jel.debit_amount, 0)
        END
      ), 0) as balance
      FROM journal_entry_line jel
      JOIN journal_entry je ON jel.journal_entry_id = je.id
      JOIN gl_account ga ON jel.gl_account_id = ga.id
      WHERE ga.account_type = ?
        AND je.is_voided = 0 AND je.is_posted = 1
    `).get(accountType) as { balance: number }
        return result.balance
    }

    private getPostedTotal(accountType: string): number {
        const result = this.db.prepare(`
      SELECT COALESCE(SUM(
        CASE WHEN ga.normal_balance = 'CREDIT'
          THEN COALESCE(jel.credit_amount, 0) - COALESCE(jel.debit_amount, 0)
          ELSE COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)
        END
      ), 0) as total
      FROM journal_entry_line jel
      JOIN journal_entry je ON jel.journal_entry_id = je.id
      JOIN gl_account ga ON jel.gl_account_id = ga.id
      WHERE ga.account_type = ?
        AND je.is_voided = 0 AND je.is_posted = 1
    `).get(accountType) as { total: number }
        return result.total
    }

    private getAdminExpenses(): number {
        const result = this.db.prepare(`
      SELECT COALESCE(SUM(
        COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)
      ), 0) as total
      FROM journal_entry_line jel
      JOIN journal_entry je ON jel.journal_entry_id = je.id
      JOIN gl_account ga ON jel.gl_account_id = ga.id
      WHERE ga.account_type = 'EXPENSE'
        AND LOWER(COALESCE(ga.account_subtype, '')) LIKE '%admin%'
        AND je.is_voided = 0 AND je.is_posted = 1
    `).get() as { total: number }
        return result.total
    }

    private getActiveStudentCount(): number {
        const result = this.db.prepare(
            'SELECT COUNT(*) as count FROM student WHERE is_active = 1'
        ).get() as { count: number }
        return result.count
    }
}

export { KpiDashboardService }
export type { KpiDashboard, KpiMetric }
