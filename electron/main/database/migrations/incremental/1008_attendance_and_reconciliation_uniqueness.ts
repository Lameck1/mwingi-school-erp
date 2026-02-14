import type Database from 'better-sqlite3'

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName) as { name: string } | undefined
  return Boolean(row?.name)
}

export function up(db: Database.Database): void {
  if (tableExists(db, 'attendance')) {
    db.exec(`
      DELETE FROM attendance
      WHERE id IN (
        SELECT id
        FROM (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY student_id, academic_year_id, term_id, attendance_date
              ORDER BY COALESCE(created_at, CURRENT_TIMESTAMP) DESC, id DESC
            ) AS rn
          FROM attendance
        )
        WHERE rn > 1
      )
    `)

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_student_day_term_unique
      ON attendance(student_id, academic_year_id, term_id, attendance_date)
    `)
  }

  if (tableExists(db, 'bank_statement_line')) {
    db.exec(`
      UPDATE bank_statement_line
      SET is_matched = 0,
          matched_transaction_id = NULL
      WHERE id IN (
        SELECT id
        FROM (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY matched_transaction_id
              ORDER BY id ASC
            ) AS rn
          FROM bank_statement_line
          WHERE matched_transaction_id IS NOT NULL
        )
        WHERE rn > 1
      )
    `)

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_statement_line_match_unique
      ON bank_statement_line(matched_transaction_id)
      WHERE matched_transaction_id IS NOT NULL
    `)
  }
}
