import type { Database } from 'better-sqlite3'

/**
 * Migration 1016: Add Supplier ID to Journal Entry
 * 
 * Adds supplier_id to journal_entry for vendor reconciliation and aging analysis.
 */
export function up(db: Database): void {
    const columns = db.pragma('table_info(journal_entry)') as Array<{ name: string }>
    const hasSupplierId = columns.some(c => c.name === 'supplier_id')

    if (!hasSupplierId) {
        db.exec(`ALTER TABLE journal_entry ADD COLUMN supplier_id INTEGER REFERENCES supplier(id)`)
        console.warn('  Added supplier_id column to journal_entry table')
    }
}

export function down(_db: Database): void {
    // SQLite does not support dropping columns easily, but we can leave it
}
