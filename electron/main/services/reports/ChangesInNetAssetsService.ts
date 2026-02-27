
import { getDatabase } from '../../database'

import type Database from 'better-sqlite3'

// ============================================================================
// TYPES
// ============================================================================

interface NetAssetsChange {
    readonly category: string
    readonly opening_balance: number
    readonly additions: number
    readonly disposals: number
    readonly revaluations: number
    readonly closing_balance: number
}

interface ChangesInNetAssetsReport {
    readonly report_date: string
    readonly period_start: string
    readonly period_end: string
    readonly opening_net_assets: number
    readonly surplus_deficit: number
    readonly asset_changes: ReadonlyArray<NetAssetsChange>
    readonly liability_changes: ReadonlyArray<NetAssetsChange>
    readonly closing_net_assets: number
}

// ============================================================================
// SERVICE
// ============================================================================

class ChangesInNetAssetsService {
    private readonly db: Database.Database

    constructor(db?: Database.Database) {
        this.db = db || getDatabase()
    }

    /**
     * Generate IPSAS Statement of Changes in Net Assets.
     *
     * Net Assets = Total Assets - Total Liabilities
     * Change = Opening + Surplus/Deficit + Other Movements → Closing
     */
    generateReport(periodStart: string, periodEnd: string): ChangesInNetAssetsReport {
        const openingAssets = this.getAccountTypeBalance('ASSET', periodStart)
        const openingLiabilities = this.getAccountTypeBalance('LIABILITY', periodStart)
        const openingNetAssets = openingAssets - openingLiabilities

        const closingAssets = this.getAccountTypeBalance('ASSET', periodEnd)
        const closingLiabilities = this.getAccountTypeBalance('LIABILITY', periodEnd)
        const closingNetAssets = closingAssets - closingLiabilities

        const surplusDeficit = this.getSurplusDeficit(periodStart, periodEnd)

        const assetChanges = this.getAccountChanges('ASSET', periodStart, periodEnd)
        const liabilityChanges = this.getAccountChanges('LIABILITY', periodStart, periodEnd)

        return {
            report_date: new Date().toISOString().slice(0, 10),
            period_start: periodStart,
            period_end: periodEnd,
            opening_net_assets: openingNetAssets,
            surplus_deficit: surplusDeficit,
            asset_changes: assetChanges,
            liability_changes: liabilityChanges,
            closing_net_assets: closingNetAssets
        }
    }

    private getAccountTypeBalance(accountType: string, asOfDate: string): number {
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
        AND je.entry_date <= ?
        AND je.is_voided = 0
        AND je.is_posted = 1
    `).get(accountType, asOfDate) as { balance: number }
        return result.balance
    }

    private getSurplusDeficit(periodStart: string, periodEnd: string): number {
        const revenue = this.getPeriodTotal('REVENUE', periodStart, periodEnd)
        const expense = this.getPeriodTotal('EXPENSE', periodStart, periodEnd)
        return revenue - expense
    }

    private getPeriodTotal(accountType: string, periodStart: string, periodEnd: string): number {
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
        AND je.entry_date >= ?
        AND je.entry_date <= ?
        AND je.is_voided = 0
        AND je.is_posted = 1
    `).get(accountType, periodStart, periodEnd) as { total: number }
        return result.total
    }

    private getAccountChanges(accountType: string, periodStart: string, periodEnd: string): NetAssetsChange[] {
        const accounts = this.db.prepare(`
      SELECT ga.account_subtype as category,
        COALESCE(SUM(
          CASE WHEN je.entry_date < ?
            THEN CASE WHEN ga.normal_balance = 'DEBIT'
              THEN COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)
              ELSE COALESCE(jel.credit_amount, 0) - COALESCE(jel.debit_amount, 0)
            END
          ELSE 0 END
        ), 0) as opening_balance,
        COALESCE(SUM(
          CASE WHEN je.entry_date >= ? AND je.entry_date <= ? AND je.entry_type IN ('ASSET_PURCHASE', 'OPENING_BALANCE', 'ADJUSTMENT')
            THEN COALESCE(jel.debit_amount, 0)
          ELSE 0 END
        ), 0) as additions,
        COALESCE(SUM(
          CASE WHEN je.entry_date >= ? AND je.entry_date <= ? AND je.entry_type = 'ASSET_DISPOSAL'
            THEN COALESCE(jel.credit_amount, 0)
          ELSE 0 END
        ), 0) as disposals,
        0 as revaluations,
        COALESCE(SUM(
          CASE WHEN je.entry_date <= ?
            THEN CASE WHEN ga.normal_balance = 'DEBIT'
              THEN COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0)
              ELSE COALESCE(jel.credit_amount, 0) - COALESCE(jel.debit_amount, 0)
            END
          ELSE 0 END
        ), 0) as closing_balance
      FROM gl_account ga
      LEFT JOIN journal_entry_line jel ON jel.gl_account_id = ga.id
      LEFT JOIN journal_entry je ON jel.journal_entry_id = je.id AND je.is_voided = 0 AND je.is_posted = 1
      WHERE ga.account_type = ?
        AND ga.is_active = 1
      GROUP BY ga.account_subtype
      HAVING opening_balance != 0 OR additions != 0 OR disposals != 0 OR closing_balance != 0
      ORDER BY ga.account_subtype
    `).all(
            periodStart, periodStart, periodEnd, periodStart, periodEnd, periodEnd, accountType
        ) as NetAssetsChange[]

        return accounts
    }
}

export { ChangesInNetAssetsService }
export type { ChangesInNetAssetsReport, NetAssetsChange }
