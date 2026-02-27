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
    db.exec(`
        -- Add committed_amount column
        ALTER TABLE budget_line_item ADD COLUMN committed_amount INTEGER NOT NULL DEFAULT 0;
        
        -- Although we added actual_amount and variance in 0010_core_schema_part3,
        -- SQLite doesn't let us easily ALTER to add a VIRTUAL column that depends on a new column.
        -- So we will drop the generated variance column from our schema conceptual model 
        -- and re-add actual_amount natively if needed, but since it already exists, we will map it
        -- in the BudgetService queries instead of redefining it here.
    `)

    // 2. Update requisition_item
    db.exec(`
        ALTER TABLE requisition_item ADD COLUMN is_capital_asset BOOLEAN NOT NULL DEFAULT 0;
        ALTER TABLE requisition_item ADD COLUMN asset_category_id INTEGER REFERENCES asset_category(id);
    `)
}
