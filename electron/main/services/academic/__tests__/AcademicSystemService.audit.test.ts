import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database
const logAuditMock = vi.fn()

vi.mock('../../../database', () => ({
  getDatabase: () => db
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: (...args: unknown[]) => logAuditMock(...args)
}))

import { AcademicSystemService } from '../AcademicSystemService'

describe('AcademicSystemService audit logging', () => {
  beforeEach(() => {
    logAuditMock.mockClear()
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE term (
        id INTEGER PRIMARY KEY,
        status TEXT
      );
      CREATE TABLE exam (
        id INTEGER PRIMARY KEY,
        term_id INTEGER NOT NULL
      );
      CREATE TABLE user (
        id INTEGER PRIMARY KEY,
        role TEXT NOT NULL
      );
      CREATE TABLE exam_result (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        subject_id INTEGER NOT NULL,
        score REAL,
        competency_level INTEGER,
        teacher_remarks TEXT,
        entered_by_user_id INTEGER NOT NULL,
        UNIQUE(exam_id, student_id, subject_id)
      );

      INSERT INTO term (id, status) VALUES (1, 'OPEN');
      INSERT INTO exam (id, term_id) VALUES (10, 1);
      INSERT INTO user (id, role) VALUES (99, 'ADMIN');
    `)
  })

  it('emits SAVE_RESULTS audit event with exam and row count', async () => {
    const service = new AcademicSystemService()

    await service.saveResults(10, [
      {
        student_id: 1,
        subject_id: 3,
        score: 87,
        competency_level: null,
        teacher_remarks: 'Great'
      },
      {
        student_id: 2,
        subject_id: 3,
        score: 74,
        competency_level: null,
        teacher_remarks: 'Good'
      }
    ], 99)

    expect(logAuditMock).toHaveBeenCalledWith(
      99,
      'SAVE_RESULTS',
      'exam_result',
      10,
      null,
      { examId: 10, rows: 2 }
    )
  })
})
