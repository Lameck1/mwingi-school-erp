import { getDatabase } from '../../database'

export interface CashFlowStatement {
    op_inflow: number
    op_outflow: number
    op_net: number
    inv_inflow: number
    inv_outflow: number
    inv_net: number
    fin_inflow: number
    fin_outflow: number
    fin_net: number
    net_change: number
    opening_balance: number
    closing_balance: number
}

export interface FinancialForecast {
    labels: string[]
    actual: number[]
    projected: number[]
    trend_slope: number
}

export class CashFlowService {
    private static readonly CASH_ACCOUNT_CODES = ['1010', '1020', '1030'] as const

    private static tableExists(db: ReturnType<typeof getDatabase>, tableName: string): boolean {
        const row = db.prepare(`
            SELECT name
            FROM sqlite_master
            WHERE type = 'table' AND name = ?
        `).get(tableName) as { name: string } | undefined
        return Boolean(row?.name)
    }

    private static hasColumn(db: ReturnType<typeof getDatabase>, tableName: string, columnName: string): boolean {
        try {
            const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
            return columns.some((column) => column.name === columnName)
        } catch {
            return false
        }
    }

    private static formatLocalDate(date: Date): string {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
    }

    private static formatYearMonth(date: Date): string {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        return `${year}-${month}`
    }

    private static getDateBefore(date: string): string {
        const parsed = new Date(`${date}T00:00:00`)
        if (Number.isNaN(parsed.getTime())) {
            return date
        }
        parsed.setDate(parsed.getDate() - 1)
        return this.formatLocalDate(parsed)
    }

    private static getOperatingTotals(
        db: ReturnType<typeof getDatabase>,
        startDate: string,
        endDate: string
    ): { inflow: number; outflow: number } {
        if (!this.tableExists(db, 'ledger_transaction')) {
            return { inflow: 0, outflow: 0 }
        }

        const row = db.prepare(`
            SELECT
                COALESCE(SUM(CASE
                    WHEN transaction_type IN ('FEE_PAYMENT', 'DONATION', 'GRANT', 'INCOME')
                    THEN amount ELSE 0
                END), 0) AS inflow,
                COALESCE(SUM(CASE
                    WHEN transaction_type IN ('EXPENSE', 'SALARY_PAYMENT', 'REFUND')
                    THEN amount ELSE 0
                END), 0) AS outflow
            FROM ledger_transaction
            WHERE transaction_date BETWEEN ? AND ?
              AND COALESCE(is_voided, 0) = 0
        `).get(startDate, endDate) as { inflow: number; outflow: number }

        return { inflow: row?.inflow || 0, outflow: row?.outflow || 0 }
    }

    private static getInvestingTotals(
        db: ReturnType<typeof getDatabase>,
        startDate: string,
        endDate: string
    ): { inflow: number; outflow: number } {
        let inflow = 0
        let outflow = 0

        const canClassifyAssetsFromLedger =
            this.tableExists(db, 'ledger_transaction') &&
            this.tableExists(db, 'transaction_category') &&
            this.tableExists(db, 'gl_account') &&
            this.hasColumn(db, 'transaction_category', 'gl_account_code')

        if (canClassifyAssetsFromLedger) {
            const placeholders = this.CASH_ACCOUNT_CODES.map(() => '?').join(', ')
            const row = db.prepare(`
                SELECT
                    COALESCE(SUM(CASE WHEN lt.debit_credit = 'CREDIT' THEN lt.amount ELSE 0 END), 0) AS inflow,
                    COALESCE(SUM(CASE WHEN lt.debit_credit = 'DEBIT' THEN lt.amount ELSE 0 END), 0) AS outflow
                FROM ledger_transaction lt
                JOIN transaction_category tc ON tc.id = lt.category_id
                JOIN gl_account ga ON ga.account_code = tc.gl_account_code
                WHERE lt.transaction_date BETWEEN ? AND ?
                  AND COALESCE(lt.is_voided, 0) = 0
                  AND ga.account_type = 'ASSET'
                  AND ga.account_code NOT IN (${placeholders})
            `).get(startDate, endDate, ...this.CASH_ACCOUNT_CODES) as { inflow: number; outflow: number }

            inflow += row?.inflow || 0
            outflow += row?.outflow || 0
        }

        // If asset movements are not represented through ledger asset categories,
        // derive movements from fixed-asset lifecycle events.
        if (this.tableExists(db, 'fixed_asset') && inflow === 0 && outflow === 0) {
            const acquisition = db.prepare(`
                SELECT COALESCE(SUM(acquisition_cost), 0) as total
                FROM fixed_asset
                WHERE acquisition_date BETWEEN ? AND ?
            `).get(startDate, endDate) as { total: number }

            const disposal = db.prepare(`
                SELECT COALESCE(SUM(disposed_value), 0) as total
                FROM fixed_asset
                WHERE disposed_date BETWEEN ? AND ?
                  AND disposed_value IS NOT NULL
            `).get(startDate, endDate) as { total: number }

            outflow += acquisition?.total || 0
            inflow += disposal?.total || 0
        }

        return { inflow, outflow }
    }

    private static getFinancingTotals(
        db: ReturnType<typeof getDatabase>,
        startDate: string,
        endDate: string
    ): { inflow: number; outflow: number } {
        if (!this.tableExists(db, 'journal_entry') || !this.tableExists(db, 'journal_entry_line') || !this.tableExists(db, 'gl_account')) {
            return { inflow: 0, outflow: 0 }
        }

        const placeholders = this.CASH_ACCOUNT_CODES.map(() => '?').join(', ')
        const row = db.prepare(`
            SELECT
                COALESCE(SUM(CASE
                    WHEN je.entry_type = 'LOAN_DISBURSEMENT' THEN jel.debit_amount ELSE 0
                END), 0) AS inflow,
                COALESCE(SUM(CASE
                    WHEN je.entry_type = 'LOAN_REPAYMENT' THEN jel.credit_amount ELSE 0
                END), 0) AS outflow
            FROM journal_entry je
            JOIN journal_entry_line jel ON jel.journal_entry_id = je.id
            JOIN gl_account ga ON ga.id = jel.gl_account_id
            WHERE je.entry_date BETWEEN ? AND ?
              AND COALESCE(je.is_voided, 0) = 0
              AND COALESCE(je.is_posted, 1) = 1
              AND ga.account_code IN (${placeholders})
        `).get(startDate, endDate, ...this.CASH_ACCOUNT_CODES) as { inflow: number; outflow: number }

        return { inflow: row?.inflow || 0, outflow: row?.outflow || 0 }
    }

    private static getOpeningBalance(db: ReturnType<typeof getDatabase>, startDate: string): number {
        let openingBalance = 0

        if (this.tableExists(db, 'bank_account') && this.hasColumn(db, 'bank_account', 'opening_balance')) {
            const base = db.prepare(`
                SELECT COALESCE(SUM(opening_balance), 0) as total
                FROM bank_account
                WHERE COALESCE(is_active, 1) = 1
            `).get() as { total: number }
            openingBalance += base?.total || 0
        }

        const historicalEnd = this.getDateBefore(startDate)
        const historicalStart = '1900-01-01'

        const historicalOperating = this.getOperatingTotals(db, historicalStart, historicalEnd)
        const historicalInvesting = this.getInvestingTotals(db, historicalStart, historicalEnd)
        const historicalFinancing = this.getFinancingTotals(db, historicalStart, historicalEnd)

        openingBalance += historicalOperating.inflow - historicalOperating.outflow
        openingBalance += historicalInvesting.inflow - historicalInvesting.outflow
        openingBalance += historicalFinancing.inflow - historicalFinancing.outflow

        return openingBalance
    }

    // Calculate Cash Flow Statement (Direct Method)
    static getCashFlowStatement(startDate: string, endDate: string): CashFlowStatement {
        const db = getDatabase()
        const operating = this.getOperatingTotals(db, startDate, endDate)
        const investing = this.getInvestingTotals(db, startDate, endDate)
        const financing = this.getFinancingTotals(db, startDate, endDate)

        const cf: CashFlowStatement = {
            op_inflow: operating.inflow,
            op_outflow: operating.outflow,
            op_net: operating.inflow - operating.outflow,
            inv_inflow: investing.inflow,
            inv_outflow: investing.outflow,
            inv_net: investing.inflow - investing.outflow,
            fin_inflow: financing.inflow,
            fin_outflow: financing.outflow,
            fin_net: financing.inflow - financing.outflow,
            net_change: 0,
            opening_balance: this.getOpeningBalance(db, startDate),
            closing_balance: 0
        }

        cf.net_change = cf.op_net + cf.inv_net + cf.fin_net
        cf.closing_balance = cf.opening_balance + cf.net_change

        return cf
    }

    static getForecast(monthsToProject: number = 6): FinancialForecast {
        const db = getDatabase()

        // 1. Get last 6 months actuals
        // Group by month
        const results = db.prepare(`
            SELECT strftime('%Y-%m', receipt_date) as m, SUM(amount) as total
            FROM receipt
            WHERE receipt_date >= date('now', '-6 months')
            GROUP BY m
            ORDER BY m ASC
        `).all() as { m: string, total: number }[]

        // Calculate simple trend (average)
        const avg = results.reduce((a, b) => a + b.total, 0) / (results.length || 1)

        // Project
        const labels = results.map(r => r.m)
        const actual = results.map(r => r.total)
        const projected: number[] = []

        const lastMonth = new Date()
        for (let i = 0; i < monthsToProject; i++) {
            lastMonth.setMonth(lastMonth.getMonth() + 1)
            const mStr = this.formatYearMonth(lastMonth)
            labels.push(mStr)
            projected.push(avg) // Linear projection for MVP
        }

        // Pad actuals with nulls for chart
        // Pad projected with nulls for first part

        return {
            labels,
            actual,
            projected: [...new Array(results.length).fill(Number.NaN), ...projected],
            trend_slope: 0
        }
    }
}
