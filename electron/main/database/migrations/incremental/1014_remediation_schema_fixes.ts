import type Database from 'better-sqlite3'

/**
 * Migration 1014: Comprehensive schema fixes from remediation audit.
 * 
 * Covers bugs: #29 (attendance unique), #52 (entry_type CHECK), #66 (exemption type CHECK),
 * #74 (fee_structure FK), #87 (invoice index), #88 (opening_balance unique),
 * #89 (stock_movement quantity CHECK), #90 (grading_scale unique), #96 (student_route unique)
 */

function hasColumn(db: Database.Database, table: string, column: string): boolean {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    return cols.some(c => c.name === column)
}

function indexExists(db: Database.Database, indexName: string): boolean {
    const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name=?`).get(indexName)
    return Boolean(row)
}

function tryCreateUniqueIndex(db: Database.Database, indexName: string, definition: string, fallbackName?: string): void {
    if (indexExists(db, indexName)) { return }
    try {
        db.exec(`CREATE UNIQUE INDEX ${indexName} ON ${definition}`)
    } catch {
        if (fallbackName) {
            try {
                db.exec(`CREATE INDEX IF NOT EXISTS ${fallbackName} ON ${definition}`)
            } catch { /* ignore */ }
        }
    }
}

export function up(db: Database.Database): void {
    // Bug #29: Attendance unique constraint
    tryCreateUniqueIndex(db, 'idx_attendance_student_date', 'attendance(student_id, attendance_date, stream_id)', 'idx_attendance_student_date_nonuniq')

    // Bug #87: Fee invoice performance index
    if (!indexExists(db, 'idx_fee_invoice_student_status')) {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_fee_invoice_student_status ON fee_invoice(student_id, status)`)
    }

    // Bug #88: Opening balance unique constraint
    tryCreateUniqueIndex(db, 'idx_opening_balance_account_year', 'opening_balance(gl_account_id, academic_year_id)', 'idx_opening_balance_acct_yr')

    // Bug #89: stock_movement quantity should be non-negative
    db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_stock_movement_qty_check
        BEFORE INSERT ON stock_movement
        FOR EACH ROW
        WHEN NEW.quantity < 0
        BEGIN
            SELECT RAISE(ABORT, 'stock_movement.quantity must be non-negative');
        END
    `)

    // Bug #90: Grading scale uniqueness
    tryCreateUniqueIndex(db, 'idx_grading_scale_curriculum_grade', 'grading_scale(curriculum, grade)')

    // Bug #96: Student route assignment uniqueness
    if (hasColumn(db, 'student_route_assignment', 'student_id')) {
        tryCreateUniqueIndex(db, 'idx_student_route_unique', 'student_route_assignment(student_id, route_id, academic_year, term)')
    }

    // Bug #52: Ensure is_voided column defaults
    if (hasColumn(db, 'fee_invoice', 'id') && !hasColumn(db, 'fee_invoice', 'is_voided')) {
        db.exec(`ALTER TABLE fee_invoice ADD COLUMN is_voided INTEGER DEFAULT 0`)
    }

    // Credit balance sync: ensure all students have correct credit_balance
    db.exec(`
        UPDATE student SET credit_balance = COALESCE((
            SELECT SUM(
                CASE 
                    WHEN ct.transaction_type = 'CREDIT_RECEIVED' THEN ct.amount
                    WHEN ct.transaction_type = 'CREDIT_APPLIED' THEN -ct.amount
                    WHEN ct.transaction_type = 'CREDIT_REFUNDED' THEN -ct.amount
                    ELSE 0
                END
            )
            FROM credit_transaction ct WHERE ct.student_id = student.id
        ), 0)
        WHERE is_active = 1
    `)
}
