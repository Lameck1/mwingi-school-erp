import type { Database } from 'better-sqlite3'

export function up(db: Database): void {
    const insertGL = db.prepare(`
    INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance, is_system_account, is_active)
    VALUES (?, ?, ?, ?, 1, 1)
  `)

    // Align with SystemAccounts.ts
    insertGL.run('1510', 'Fixed Assets', 'ASSET', 'DEBIT')
    insertGL.run('1520', 'Accumulated Depreciation', 'ASSET', 'CREDIT')
}
