import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db
}))

import { PerformanceAnalysisService } from '../PerformanceAnalysisService'

describe('PerformanceAnalysisService schema-safe analytics', () => {
  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE student (
        id INTEGER PRIMARY KEY,
        admission_number TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE enrollment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        stream_id INTEGER NOT NULL,
        status TEXT NOT NULL
      );

      CREATE TABLE exam (
        id INTEGER PRIMARY KEY,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL
      );

      CREATE TABLE report_card_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        mean_score REAL NOT NULL
      );

      CREATE TABLE exam_result (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        subject_id INTEGER NOT NULL,
        score REAL NOT NULL
      );

      CREATE TABLE term (
        id INTEGER PRIMARY KEY,
        term_name TEXT NOT NULL,
        term_number INTEGER NOT NULL
      );

      INSERT INTO term (id, term_name, term_number) VALUES (1, 'Term 1', 1), (2, 'Term 2', 2);
      INSERT INTO exam (id, academic_year_id, term_id) VALUES (101, 2026, 1), (102, 2026, 2);

      INSERT INTO student (id, admission_number, first_name, last_name, is_active)
      VALUES
        (1, 'ADM/001', 'Grace', 'Mutua', 1),
        (2, 'ADM/002', 'Sarah', 'Ochieng', 1);

      INSERT INTO enrollment (student_id, academic_year_id, term_id, stream_id, status)
      VALUES
        (1, 2026, 2, 1, 'ACTIVE'),
        (2, 2026, 2, 2, 'ACTIVE');

      INSERT INTO report_card_summary (exam_id, student_id, mean_score)
      VALUES
        (101, 1, 50),
        (101, 2, 50),
        (102, 1, 72),
        (102, 2, 55);

      INSERT INTO exam_result (exam_id, student_id, subject_id, score)
      VALUES
        (102, 1, 1, 50),
        (102, 1, 2, 55),
        (102, 2, 1, 65),
        (102, 2, 2, 60),
        (101, 1, 1, 45);
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('computes most-improved students with enrollment-based stream filtering', async () => {
    const service = new PerformanceAnalysisService()
    const result = await service.getMostImprovedStudents({
      academicYearId: 2026,
      currentTermId: 2,
      comparisonTermId: 1,
      streamId: 1,
      minimumImprovement: 1
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.student_name).toBe('Grace Mutua')
    expect(result[0]?.improvement_points).toBeGreaterThan(0)
  })

  it('returns struggling students with valid stream filtering and having clause', async () => {
    const service = new PerformanceAnalysisService()
    const result = await service.getStrugglingStudents(2026, 2, 60, 1)

    expect(result).toHaveLength(1)
    expect(result[0]?.student_name).toBe('Grace Mutua')
    expect(result[0]?.failing_subjects).toBe(2)
  })

  it('builds term trends using term_name column', async () => {
    const service = new PerformanceAnalysisService()
    const trends = await service.getPerformanceTrends(1, 2026, 2)

    expect(trends.length).toBeGreaterThan(0)
    expect(trends[0]?.term_name).toBe('Term 2')
  })
})
