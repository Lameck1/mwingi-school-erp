import type Database from 'better-sqlite3'

/**
 * Migration 1020: Seed the Other Revenue (4900) GL account.
 *
 * SystemAccounts.OTHER_REVENUE was previously mapped to '4300' (duplicating
 * HIRE_REVENUE). It has been changed to '4900'. This migration ensures the
 * GL account exists for both fresh installs and upgrades.
 */
export function up(db: Database.Database): void {
    db.prepare(`
        INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance, is_system_account, is_active)
        VALUES ('4900', 'Other Revenue', 'REVENUE', 'CREDIT', 1, 1)
    `).run()
}
