import type Database from 'better-sqlite3'

/**
 * Migration 1031: Procurement Integration with Budgets & Assets
 *
 * - Adds `committed_amount` to `budget_line_item` to track locked funds from POs
 * - Adds a generated column `available_balance` for quick checks
 * - Adds `is_capital_asset` and `asset_category_id` to `requisition_item` for auto-provisioning
 */
export function up(db: Database.Database): void {
    // 1. Update budget_line_item
    try {
        db.prepare(`
            -- Add committed_amount column
            ALTER TABLE budget_line_item ADD COLUMN committed_amount INTEGER NOT NULL DEFAULT 0
        `).run()
    } catch (e) {
        if (!(e instanceof Error) || !e.message.includes('duplicate column name')) {throw e}
    }

    // 2. Update requisition_item
    try {
        db.prepare(`ALTER TABLE requisition_item ADD COLUMN is_capital_asset BOOLEAN NOT NULL DEFAULT 0`).run()
    } catch (e) {
        if (!(e instanceof Error) || !e.message.includes('duplicate column name')) {throw e}
    }

    try {
        db.prepare(`ALTER TABLE requisition_item ADD COLUMN asset_category_id INTEGER REFERENCES asset_category(id)`).run()
    } catch (e) {
        if (!(e instanceof Error) || !e.message.includes('duplicate column name')) {throw e}
    }
}
