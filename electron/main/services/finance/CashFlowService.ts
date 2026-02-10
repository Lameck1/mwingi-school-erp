import { db } from '../../database'

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

    // Calculate Cash Flow Statement (Direct Method)
    static getCashFlowStatement(startDate: string, endDate: string): CashFlowStatement {
        if (!db) {throw new Error('Database not initialized')}

        // 1. Operating Activities
        // Inflows: Fee Payments + Other Income
        const feeInflow = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total 
            FROM receipt 
            WHERE receipt_date BETWEEN ? AND ?
        `).get(startDate, endDate) as { total: number }

        const otherIncome = db.prepare(`
            SELECT COALESCE(SUM(lt.amount), 0) as total 
            FROM ledger_transaction lt
            JOIN transaction_category tc ON lt.category_id = tc.id
            WHERE lt.transaction_date BETWEEN ? AND ? 
            AND tc.category_type = 'INCOME'
        `).get(startDate, endDate) as { total: number }

        // Outflows: Expenses + Payroll (Gross)
        const expenseOutflow = db.prepare(`
            SELECT COALESCE(SUM(lt.amount), 0) as total 
            FROM ledger_transaction lt
            JOIN transaction_category tc ON lt.category_id = tc.id
            WHERE lt.transaction_date BETWEEN ? AND ? 
            AND tc.category_type = 'EXPENSE'
        `).get(startDate, endDate) as { total: number }

        // Payroll schema compatibility should be verified in integration tests; fallback remains conservative.
        // For this MVP, we assume payroll is recorded as EXPENSE in ledger_transaction if system is integrated correctly.
        // If not, we would query 'payroll' table directly. Let's add a separate query just in case it's separate.
        const payrollOutflow = db.prepare(`
            SELECT COALESCE(SUM(net_salary), 0) as total
            FROM payroll
            WHERE payment_date BETWEEN ? AND ?
        `).get(startDate, endDate) as { total: number }


        // 2. Investing Activities
        // Outflows: Asset purchases (assuming captured in ledger with specific category or asset table)
        // For now, we'll assume 'Fixed Asset' category exists in ledger.
        const assetOutflow = db.prepare(`
            SELECT COALESCE(SUM(lt.amount), 0) as total
            FROM ledger_transaction lt
            JOIN transaction_category tc ON lt.category_id = tc.id
            WHERE lt.transaction_date BETWEEN ? AND ?
            AND tc.category_name LIKE '%Asset%'
        `).get(startDate, endDate) as { total: number }

        // 3. Financing Activities
        // Inflows: Loans (Liability)
        // Outflows: Loan Repayment
        // Placeholder for now as schema support is minimal
        const finInflow = 0
        const finOutflow = 0

        const op_inflow = feeInflow.total + otherIncome.total
        const op_outflow = expenseOutflow.total + payrollOutflow.total

        // Investing logic correction: avoid double counting if assets are also expenses.
        // Usually assets are capitalized, not expenses. 
        // We will assume Expense Ledger DOES NOT contain assets, or we filter.
        // For MVP, simplistic:

        const cf: CashFlowStatement = {
            op_inflow,
            op_outflow,
            op_net: op_inflow - op_outflow,
            inv_inflow: 0,
            inv_outflow: assetOutflow.total,
            inv_net: 0 - assetOutflow.total,
            fin_inflow: finInflow,
            fin_outflow: finOutflow,
            fin_net: finInflow - finOutflow,
            net_change: 0,
            opening_balance: 0,
            closing_balance: 0
        }

        cf.net_change = cf.op_net + cf.inv_net + cf.fin_net

        // Opening Balance: Sum of all net flows prior to startDate
        // This is expensive to calc from scratch every time. 
        // Better to check 'bank_account' current balance, but that's "Closing".
        // Opening = Closing - NetChange(Period). 
        // Or Opening = Sum(All Historic) < StartDate.
        // Let's use simple sum for MVP reliability.
        /*
        const historicIn = db.prepare('SELECT SUM(amount) as t FROM receipt WHERE payment_date < ?').get(startDate).t || 0
        const historicOut = db.prepare('SELECT SUM(amount) as t FROM ledger_transaction WHERE transaction_date < ? AND type="EXPENSE"').get(startDate).t || 0
        cf.opening_balance = historicIn - historicOut
        */

        // Correct approach: Sum of all Bank Accounts Opening Balances + Transactions < StartDate
        // Assuming we rely on cash flow sum:
        cf.opening_balance = 0 // Placeholder logic to be refined with Bank Account table
        cf.closing_balance = cf.opening_balance + cf.net_change

        return cf
    }

    static getForecast(monthsToProject: number = 6): FinancialForecast {
        if (!db) {throw new Error('Database not initialized')}

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
            const mStr = lastMonth.toISOString().slice(0, 7)
            labels.push(mStr)
            projected.push(avg) // Linear projection for MVP
        }

        // Pad actuals with nulls for chart
        // Pad projected with nulls for first part

        return {
            labels,
            actual,
            projected: [...Array(results.length).fill(null), ...projected],
            trend_slope: 0
        }
    }
}
