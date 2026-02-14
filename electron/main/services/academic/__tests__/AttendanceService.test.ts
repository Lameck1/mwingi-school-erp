import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db,
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn(),
}))

import { AttendanceService } from '../AttendanceService'

describe('AttendanceService.markAttendance', () => {
  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE user (id INTEGER PRIMARY KEY);
      CREATE TABLE stream (id INTEGER PRIMARY KEY);
      CREATE TABLE academic_year (id INTEGER PRIMARY KEY);
      CREATE TABLE term (id INTEGER PRIMARY KEY);
      CREATE TABLE student (id INTEGER PRIMARY KEY);

      CREATE TABLE enrollment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        stream_id INTEGER NOT NULL,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        status TEXT NOT NULL
      );

      CREATE TABLE attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        stream_id INTEGER NOT NULL,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        attendance_date DATE NOT NULL,
        status TEXT NOT NULL,
        notes TEXT,
        marked_by_user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE UNIQUE INDEX idx_attendance_student_day_term_unique
      ON attendance(student_id, academic_year_id, term_id, attendance_date);

      INSERT INTO user (id) VALUES (5);
      INSERT INTO stream (id) VALUES (10);
      INSERT INTO academic_year (id) VALUES (2026);
      INSERT INTO term (id) VALUES (1);
      INSERT INTO student (id) VALUES (100), (101), (102);
      INSERT INTO enrollment (student_id, stream_id, academic_year_id, term_id, status)
      VALUES
        (100, 10, 2026, 1, 'ACTIVE'),
        (101, 10, 2026, 1, 'ACTIVE');
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('upserts attendance rows without destructive delete behavior', async () => {
    const service = new AttendanceService()
    const date = '2026-02-14'

    const firstRun = await service.markAttendance(
      [
        { student_id: 100, status: 'PRESENT' },
        { student_id: 101, status: 'ABSENT' },
      ],
      10,
      date,
      2026,
      1,
      5,
    )

    expect(firstRun.success).toBe(true)
    expect(firstRun.marked).toBe(2)

    const secondRun = await service.markAttendance(
      [{ student_id: 100, status: 'LATE', notes: 'Traffic delay' }],
      10,
      date,
      2026,
      1,
      5,
    )

    expect(secondRun.success).toBe(true)
    expect(secondRun.marked).toBe(1)

    const rows = db.prepare(`
      SELECT student_id, status, notes
      FROM attendance
      WHERE attendance_date = ?
      ORDER BY student_id
    `).all(date) as Array<{ student_id: number; status: string; notes: string | null }>

    expect(rows).toEqual([
      { student_id: 100, status: 'LATE', notes: 'Traffic delay' },
      { student_id: 101, status: 'ABSENT', notes: null },
    ])
  })

  it('rejects entries for students not actively enrolled in stream/year/term', async () => {
    const service = new AttendanceService()
    const result = await service.markAttendance(
      [{ student_id: 102, status: 'PRESENT' }],
      10,
      '2026-02-14',
      2026,
      1,
      5,
    )

    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('not actively enrolled')

    const count = db.prepare('SELECT COUNT(*) as count FROM attendance').get() as { count: number }
    expect(count.count).toBe(0)
  })

  it('rejects attendance date in the future', async () => {
    const service = new AttendanceService()
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const futureDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`

    const result = await service.markAttendance(
      [{ student_id: 100, status: 'PRESENT' }],
      10,
      futureDate,
      2026,
      1,
      5,
    )

    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('future')
  })
})
