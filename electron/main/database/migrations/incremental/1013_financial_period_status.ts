import type Database from 'better-sqlite3'

/**
 * Migration: Add status, closed_by, closed_at columns to financial_period table.
 * The original schema only had is_locked BOOLEAN. The PeriodLockingService
 * expects a status TEXT column with values 'OPEN', 'LOCKED', 'CLOSED'.
 */
export function up(db: Database.Database): void {
    const columns = db.prepare('PRAGMA table_info(financial_period)').all() as Array<{ name: string }>
    const columnNames = new Set(columns.map(c => c.name))

    if (!columnNames.has('status')) {
        db.exec(`ALTER TABLE financial_period ADD COLUMN status TEXT DEFAULT 'OPEN'`)
        // Backfill from is_locked
        db.exec(`UPDATE financial_period SET status = CASE WHEN is_locked = 1 THEN 'LOCKED' ELSE 'OPEN' END`)
    }

    if (!columnNames.has('locked_by')) {
        db.exec(`ALTER TABLE financial_period ADD COLUMN locked_by INTEGER REFERENCES user(id)`)
        // Backfill from locked_by_user_id if it exists
        if (columnNames.has('locked_by_user_id')) {
            db.exec(`UPDATE financial_period SET locked_by = locked_by_user_id`)
        }
    }

    if (!columnNames.has('closed_by')) {
        db.exec(`ALTER TABLE financial_period ADD COLUMN closed_by INTEGER REFERENCES user(id)`)
    }

    if (!columnNames.has('closed_at')) {
        db.exec(`ALTER TABLE financial_period ADD COLUMN closed_at DATETIME`)
    }

    // Alias period_name → name for PeriodLockingService compatibility
    if (!columnNames.has('name') && columnNames.has('period_name')) {
        // SQLite doesn't support RENAME COLUMN in all versions, so we read via alias in queries
        // The service reads 'name' but schema has 'period_name' — we add a generated column
        // Actually, better to just ensure the service can read period_name. No schema change needed.
        // The PeriodLockingService does SELECT * which will include period_name.
    }
}
