import type Database from 'better-sqlite3'

export function up(db: Database.Database): void {
  db.exec(`
    UPDATE enrollment
    SET status = 'INACTIVE'
    WHERE id IN (
      SELECT e1.id
      FROM enrollment e1
      JOIN enrollment e2
        ON e1.student_id = e2.student_id
       AND e1.academic_year_id = e2.academic_year_id
       AND e1.term_id = e2.term_id
       AND e1.status = 'ACTIVE'
       AND e2.status = 'ACTIVE'
       AND e1.id < e2.id
    );
  `)

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollment_active_unique
    ON enrollment(student_id, academic_year_id, term_id)
    WHERE status = 'ACTIVE';
  `)
}

