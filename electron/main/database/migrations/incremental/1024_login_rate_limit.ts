import type { Database } from 'better-sqlite3'

export function up(db: Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS login_attempt (
            username TEXT PRIMARY KEY,
            failed_count INTEGER NOT NULL DEFAULT 0,
            last_failed_at INTEGER NOT NULL DEFAULT 0,
            lockout_until INTEGER NOT NULL DEFAULT 0
        )
    `)
}
