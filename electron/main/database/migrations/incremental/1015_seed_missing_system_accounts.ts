import type Database from 'better-sqlite3'

/**
 * Migration 1015: Add missing system GL accounts.
 *
 * Adds GL accounts required by SystemAccounts that were absent from the
 * original seed: Scholarship Expense (5250), Boarding Expense (6000),
 * and Inventory Consumption (6100).
 *
 * Also fixes the Maintenance fee category GL mapping from expense account
 * 5500 (Repairs & Maintenance) to revenue account 4300 (Other Income).
 */
export function up(db: Database.Database): void {
    const insertGL = db.prepare(`
        INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance, is_system_account, is_active)
        VALUES (?, ?, ?, ?, 1, 1)
    `)

    insertGL.run('5250', 'Scholarship Expense', 'EXPENSE', 'DEBIT')
    insertGL.run('6000', 'Boarding Expense', 'EXPENSE', 'DEBIT')
    insertGL.run('6100', 'Inventory Consumption', 'EXPENSE', 'DEBIT')

    // Fix Maintenance fee category: should credit a revenue account, not an expense account
    const expenseGL = db.prepare('SELECT id FROM gl_account WHERE account_code = ?').get('5500') as { id: number } | undefined
    const revenueGL = db.prepare('SELECT id FROM gl_account WHERE account_code = ?').get('4300') as { id: number } | undefined

    if (expenseGL && revenueGL) {
        db.prepare('UPDATE fee_category SET gl_account_id = ? WHERE category_name = ? AND gl_account_id = ?')
            .run(revenueGL.id, 'Maintenance', expenseGL.id)
    }
}
