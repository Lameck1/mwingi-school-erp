import type { Database } from 'better-sqlite3'

/**
 * Migration 1023: Add Department to Journal Entry
 * 
 * Adds a department column to journal_entry to allow tagging transactions
 * for departmental budget enforcement.
 */
export function up(db: Database): void {
    // Check if department column already exists
    const columns = db.prepare('PRAGMA table_info(journal_entry)').all() as Array<{ name: string }>
    const hasDepartment = columns.some(col => col.name === 'department')

    if (!hasDepartment) {
        db.exec(`ALTER TABLE journal_entry ADD COLUMN department TEXT`)
        console.warn('  Added department column to journal_entry table')
    }
}

export function down(_db: Database): void {
    // SQLite doesn't support DROP COLUMN easily in older versions, 
    // but we can leave it for now or implement table recreation if required.
}
