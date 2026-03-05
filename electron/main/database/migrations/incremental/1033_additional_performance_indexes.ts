import type Database from 'better-sqlite3'

/**
 * Migration 1033: Additional Performance Indexes
 *
 * Adds indexes identified by the audit as missing on high-read-volume tables:
 * - enrollment(stream_id)         → JOIN lookups from schedule / reporting queries
 * - audit_log(created_at)         → ORDER BY / range scans on the dashboard
 * - ledger_transaction(transaction_type) → filtered reads in finance reports
 */
export function up(db: Database.Database): void {
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_enrollment_stream_id
        ON enrollment (stream_id);
    `)

    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
        ON audit_log (created_at);
    `)

    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_ledger_transaction_type
        ON ledger_transaction (transaction_type);
    `)
}
