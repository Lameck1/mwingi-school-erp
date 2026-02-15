import type { AccountBalance, BalanceSheetData } from '../JournalService.types';
import type Database from 'better-sqlite3';

export class FinancialReportService {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  async getTrialBalance(startDate: string, endDate: string): Promise<{
    accounts: Array<{ account_code: string; account_name: string; debit_total: number; credit_total: number }>;
    total_debits: number;
    total_credits: number;
    is_balanced: boolean;
  }> {
    const accounts = this.db.prepare(`
      SELECT
        ga.account_code,
        ga.account_name,
        SUM(jel.debit_amount) as debit_total,
        SUM(jel.credit_amount) as credit_total
      FROM gl_account ga
      LEFT JOIN journal_entry_line jel ON ga.id = jel.gl_account_id
      LEFT JOIN journal_entry je ON jel.journal_entry_id = je.id
      WHERE je.entry_date BETWEEN ? AND ?
        AND je.is_posted = 1
        AND je.is_voided = 0
      GROUP BY ga.id, ga.account_code, ga.account_name
      ORDER BY ga.account_code
    `).all(startDate, endDate) as Array<{
      account_code: string;
      account_name: string;
      debit_total: number;
      credit_total: number;
    }>;

    const totalDebits = accounts.reduce((sum, acc) => sum + (acc.debit_total || 0), 0);
    const totalCredits = accounts.reduce((sum, acc) => sum + (acc.credit_total || 0), 0);

    return {
      accounts,
      total_debits: totalDebits,
      total_credits: totalCredits,
      is_balanced: totalDebits === totalCredits
    };
  }

  async getBalanceSheet(asOfDate: string): Promise<BalanceSheetData> {
    const accountBalances = this.db.prepare(`
      SELECT
        ga.account_code,
        ga.account_name,
        ga.account_type,
        ga.normal_balance,
        SUM(jel.debit_amount) as total_debit,
        SUM(jel.credit_amount) as total_credit
      FROM gl_account ga
      LEFT JOIN journal_entry_line jel ON ga.id = jel.gl_account_id
      LEFT JOIN journal_entry je ON jel.journal_entry_id = je.id
      WHERE je.entry_date <= ?
        AND je.is_posted = 1
        AND je.is_voided = 0
        AND ga.account_type IN ('ASSET', 'LIABILITY', 'EQUITY')
      GROUP BY ga.id
      ORDER BY ga.account_code
    `).all(asOfDate) as Array<{
      account_code: string;
      account_name: string;
      account_type: string;
      normal_balance: string;
      total_debit: number;
      total_credit: number;
    }>;

    const assets: AccountBalance[] = [];
    const liabilities: AccountBalance[] = [];
    const equity: AccountBalance[] = [];

    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;

    accountBalances.forEach((acc) => {
      const balance =
        acc.normal_balance === 'DEBIT'
          ? (acc.total_debit || 0) - (acc.total_credit || 0)
          : (acc.total_credit || 0) - (acc.total_debit || 0);

      const accountBalance: AccountBalance = {
        account_code: acc.account_code,
        account_name: acc.account_name,
        balance
      };

      if (acc.account_type === 'ASSET') {
        assets.push(accountBalance);
        totalAssets += balance;
      } else if (acc.account_type === 'LIABILITY') {
        liabilities.push(accountBalance);
        totalLiabilities += balance;
      } else if (acc.account_type === 'EQUITY') {
        equity.push(accountBalance);
        totalEquity += balance;
      }
    });

    const netIncome = this.calculateNetIncome(asOfDate);

    return {
      assets,
      liabilities,
      equity,
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      total_equity: totalEquity,
      net_income: netIncome,
      is_balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity + netIncome)) < 1 // Allow 1 cent rounding
    };
  }

  private calculateNetIncome(asOfDate: string): number {
    const incomeData = this.db.prepare(`
      SELECT
        ga.account_type,
        COALESCE(SUM(jel.debit_amount), 0) as total_debit,
        COALESCE(SUM(jel.credit_amount), 0) as total_credit
      FROM gl_account ga
      JOIN journal_entry_line jel ON ga.id = jel.gl_account_id
      JOIN journal_entry je ON jel.journal_entry_id = je.id
      WHERE je.entry_date <= ?
        AND je.is_posted = 1
        AND je.is_voided = 0
        AND ga.account_type IN ('REVENUE', 'EXPENSE')
      GROUP BY ga.account_type
    `).all(asOfDate) as Array<{
      account_type: string;
      total_debit: number;
      total_credit: number;
    }>;

    let totalRevenue = 0;
    let totalExpenses = 0;

    for (const row of incomeData) {
      if (row.account_type === 'REVENUE') {
        totalRevenue = (row.total_credit || 0) - (row.total_debit || 0);
      } else if (row.account_type === 'EXPENSE') {
        totalExpenses = (row.total_debit || 0) - (row.total_credit || 0);
      }
    }

    return totalRevenue - totalExpenses;
  }
}
