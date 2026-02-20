import { getDatabase } from '../../database';

import type Database from 'better-sqlite3';


/**
 * Profit and Loss Service
 * 
 * Generates Profit & Loss (Income Statement) reports from the general ledger
 */

export interface ProfitAndLoss {
  period_start: string;
  period_end: string;
  revenue: AccountBalance[];
  expenses: AccountBalance[];
  total_revenue: number;
  total_expenses: number;
  net_profit: number;
  revenue_by_category: CategoryBalance[];
  expenses_by_category: CategoryBalance[];
}

export interface AccountBalance {
  account_code: string;
  account_name: string;
  balance: number;
}

export interface CategoryBalance {
  category: string;
  amount: number;
  percentage: number;
}

export class ProfitAndLossService {
  private readonly db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  /**
   * Generate Profit & Loss Statement
   */
  async generateProfitAndLoss(startDate: string, endDate: string): Promise<ProfitAndLoss> {
    // Get all revenue accounts (4000-4999)
    const revenueAccounts = this.db.prepare(`
      SELECT
        ga.account_code,
        ga.account_name,
        COALESCE(SUM(jel.credit_amount), 0) - COALESCE(SUM(jel.debit_amount), 0) as balance
      FROM gl_account ga
      LEFT JOIN journal_entry_line jel ON ga.id = jel.gl_account_id
      LEFT JOIN journal_entry je ON jel.journal_entry_id = je.id
      WHERE ga.account_type = 'REVENUE'
        AND ga.is_active = 1
        AND (je.entry_date IS NULL OR (je.entry_date BETWEEN ? AND ?))
        AND (je.is_posted IS NULL OR je.is_posted = 1)
        AND (je.is_voided IS NULL OR je.is_voided = 0)
      GROUP BY ga.id, ga.account_code, ga.account_name
      HAVING balance > 0
      ORDER BY ga.account_code
    `).all(startDate, endDate) as AccountBalance[];

    // Get all expense accounts (5000-5999)
    const expenseAccounts = this.db.prepare(`
      SELECT
        ga.account_code,
        ga.account_name,
        COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0) as balance
      FROM gl_account ga
      LEFT JOIN journal_entry_line jel ON ga.id = jel.gl_account_id
      LEFT JOIN journal_entry je ON jel.journal_entry_id = je.id
      WHERE ga.account_type = 'EXPENSE'
        AND ga.is_active = 1
        AND (je.entry_date IS NULL OR (je.entry_date BETWEEN ? AND ?))
        AND (je.is_posted IS NULL OR je.is_posted = 1)
        AND (je.is_voided IS NULL OR je.is_voided = 0)
      GROUP BY ga.id, ga.account_code, ga.account_name
      HAVING balance > 0
      ORDER BY ga.account_code
    `).all(startDate, endDate) as AccountBalance[];

    // Calculate totals
    const totalRevenue = revenueAccounts.reduce((sum, acc) => sum + acc.balance, 0);
    const totalExpenses = expenseAccounts.reduce((sum, acc) => sum + acc.balance, 0);
    const netProfit = totalRevenue - totalExpenses;

    // Categorize revenue
    const revenueByCategory = this.categorizeRevenue(revenueAccounts, totalRevenue);

    // Categorize expenses
    const expensesByCategory = this.categorizeExpenses(expenseAccounts, totalExpenses);

    return {
      period_start: startDate,
      period_end: endDate,
      revenue: revenueAccounts,
      expenses: expenseAccounts,
      total_revenue: totalRevenue,
      total_expenses: totalExpenses,
      net_profit: netProfit,
      revenue_by_category: revenueByCategory,
      expenses_by_category: expensesByCategory
    };
  }

  /**
   * Generate comparative P&L (current period vs prior period)
   */
  async generateComparativeProfitAndLoss(
    currentStart: string,
    currentEnd: string,
    priorStart: string,
    priorEnd: string
  ): Promise<{
    current: ProfitAndLoss;
    prior: ProfitAndLoss;
    variance: {
      revenue_variance: number;
      revenue_variance_percent: number;
      expense_variance: number;
      expense_variance_percent: number;
      net_profit_variance: number;
      net_profit_variance_percent: number;
    };
  }> {
    const current = await this.generateProfitAndLoss(currentStart, currentEnd);
    const prior = await this.generateProfitAndLoss(priorStart, priorEnd);

    const revenueVariance = current.total_revenue - prior.total_revenue;
    const expenseVariance = current.total_expenses - prior.total_expenses;
    const netProfitVariance = current.net_profit - prior.net_profit;

    return {
      current,
      prior,
      variance: {
        revenue_variance: revenueVariance,
        revenue_variance_percent: prior.total_revenue > 0
          ? (revenueVariance / prior.total_revenue) * 100
          : 0,
        expense_variance: expenseVariance,
        expense_variance_percent: prior.total_expenses > 0
          ? (expenseVariance / prior.total_expenses) * 100
          : 0,
        net_profit_variance: netProfitVariance,
        net_profit_variance_percent: prior.net_profit === 0
          ? 0
          : (netProfitVariance / prior.net_profit) * 100
      }
    };
  }

  /**
   * Get revenue breakdown by segment (Tuition, Boarding, Transport, etc.)
   */
  async getRevenueBreakdown(startDate: string, endDate: string): Promise<CategoryBalance[]> {
    const revenue = await this.generateProfitAndLoss(startDate, endDate);
    return revenue.revenue_by_category;
  }

  /**
   * Get expense breakdown by category
   */
  async getExpenseBreakdown(startDate: string, endDate: string): Promise<CategoryBalance[]> {
    const pl = await this.generateProfitAndLoss(startDate, endDate);
    return pl.expenses_by_category;
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private categorizeRevenue(
    revenueAccounts: AccountBalance[],
    totalRevenue: number
  ): CategoryBalance[] {
    const categories: Record<string, number> = {
      'Tuition Fees': 0,
      'Boarding Fees': 0,
      'Transport Fees': 0,
      'Activity Fees': 0,
      'Exam Fees': 0,
      'Government Grants': 0,
      'Donations': 0,
      'Other Income': 0
    };

    for (const account of revenueAccounts) {
      const code = account.account_code;

      if (code.startsWith('401')) {
        categories['Tuition Fees'] = (categories['Tuition Fees'] ?? 0) + account.balance;
      } else if (code.startsWith('402')) {
        categories['Boarding Fees'] = (categories['Boarding Fees'] ?? 0) + account.balance;
      } else if (code.startsWith('403')) {
        categories['Transport Fees'] = (categories['Transport Fees'] ?? 0) + account.balance;
      } else if (code.startsWith('404')) {
        categories['Activity Fees'] = (categories['Activity Fees'] ?? 0) + account.balance;
      } else if (code.startsWith('405')) {
        categories['Exam Fees'] = (categories['Exam Fees'] ?? 0) + account.balance;
      } else if (code.startsWith('41')) {
        categories['Government Grants'] = (categories['Government Grants'] ?? 0) + account.balance;
      } else if (code.startsWith('42')) {
        categories['Donations'] = (categories['Donations'] ?? 0) + account.balance;
      } else {
        categories['Other Income'] = (categories['Other Income'] ?? 0) + account.balance;
      }
    }

    return Object.entries(categories)
      .filter(([_, amount]) => amount > 0)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: totalRevenue > 0 ? (amount / totalRevenue) * 100 : 0
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  private categorizeExpenses(
    expenseAccounts: AccountBalance[],
    totalExpenses: number
  ): CategoryBalance[] {
    const categories: Record<string, number> = {
      'Salaries & Wages': 0,
      'Statutory Deductions': 0,
      'Food & Catering': 0,
      'Transport': 0,
      'Utilities': 0,
      'Supplies': 0,
      'Repairs & Maintenance': 0,
      'Depreciation': 0,
      'Other Expenses': 0
    };

    for (const account of expenseAccounts) {
      const category = this.resolveExpenseCategory(account.account_code)
      categories[category] = (categories[category] ?? 0) + account.balance
    }

    return Object.entries(categories)
      .filter(([_, amount]) => amount > 0)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  private resolveExpenseCategory(code: string): string {
    const categoryMatchers: ReadonlyArray<{ category: string; matches: (accountCode: string) => boolean }> = [
      { category: 'Salaries & Wages', matches: (accountCode) => accountCode.startsWith('501') || accountCode.startsWith('502') },
      { category: 'Statutory Deductions', matches: (accountCode) => accountCode.startsWith('503') || accountCode.startsWith('504') || accountCode.startsWith('505') },
      { category: 'Food & Catering', matches: (accountCode) => accountCode.startsWith('510') },
      { category: 'Transport', matches: (accountCode) => accountCode.startsWith('520') || accountCode === '5210' },
      { category: 'Utilities', matches: (accountCode) => accountCode.startsWith('53') },
      { category: 'Supplies', matches: (accountCode) => accountCode.startsWith('54') },
      { category: 'Repairs & Maintenance', matches: (accountCode) => accountCode === '5500' },
      { category: 'Depreciation', matches: (accountCode) => accountCode === '5600' }
    ]

    const matchedCategory = categoryMatchers.find((matcher) => matcher.matches(code))
    return matchedCategory?.category || 'Other Expenses'
  }
}
