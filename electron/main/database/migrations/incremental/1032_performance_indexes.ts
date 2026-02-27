import type Database from 'better-sqlite3'

/**
 * Migration 1032: Performance Indexes
 *
 * - Adds composite index on fee_invoice(student_id, status) for the student balance
 *   correlated subquery used in student:getAll.
 * - Adds index on enrollment(student_id, id DESC) to speed up latest-enrollment lookup.
 */
export function up(db: Database.Database): void {
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_fee_invoice_student_status
        ON fee_invoice (student_id, status);
    `)

    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_enrollment_student_id_desc
        ON enrollment (student_id, id DESC);
    `)
}
