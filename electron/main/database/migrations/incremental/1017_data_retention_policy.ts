import type Database from 'better-sqlite3'

/**
 * Migration 1017: Add data retention metadata and purge support.
 *
 * Adds `retention_days` column to message_log and audit_log tables
 * to support configurable data retention policies. Also creates a
 * `data_retention_config` table for system-wide retention settings.
 */
export function up(db: Database.Database): void {
    // Create data retention configuration table
    db.exec(`CREATE TABLE IF NOT EXISTS data_retention_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL UNIQUE,
        retention_days INTEGER NOT NULL DEFAULT 365,
        is_active INTEGER DEFAULT 1,
        last_purge_at DATETIME,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`)

    // Seed default retention policies
    const upsert = db.prepare(`
        INSERT OR IGNORE INTO data_retention_config (table_name, retention_days, is_active)
        VALUES (?, ?, 1)
    `)

    // Message logs: retain 1 year
    upsert.run('message_log', 365)
    // Audit logs: retain 3 years (compliance requirement)
    upsert.run('audit_log', 1095)
    // Backup metadata: retain 2 years
    upsert.run('backup_log', 730)

    console.warn('[migration-1017] ✓ Data retention configuration seeded')
}
