import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db
}))

import { ExamAnalysisService } from '../ExamAnalysisService'

describe('ExamAnalysisService enrollment-aware filtering', () => {
  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE student (
        id INTEGER PRIMARY KEY,
        admission_number TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL
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

      CREATE TABLE subject (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      );

      CREATE TABLE exam_result (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        subject_id INTEGER NOT NULL,
        score REAL NOT NULL
      );

      CREATE TABLE grading_scale (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        curriculum TEXT NOT NULL,
        grade TEXT NOT NULL,
        remarks TEXT NOT NULL,
        min_score REAL NOT NULL,
        max_score REAL NOT NULL
      );

      INSERT INTO grading_scale (curriculum, grade, remarks, min_score, max_score)
      VALUES ('8-4-4', 'A', 'Excellent', 80, 100), ('8-4-4', 'B', 'Good', 60, 79), ('8-4-4', 'C', 'Fair', 0, 59);

      INSERT INTO subject (id, name) VALUES (1, 'Mathematics');
      INSERT INTO exam (id, academic_year_id, term_id) VALUES (10, 2026, 1), (11, 2026, 2);

      INSERT INTO student (id, admission_number, first_name, last_name)
      VALUES
        (1, 'ADM/001', 'Grace', 'Mutua'),
        (2, 'ADM/002', 'Sarah', 'Ochieng');

      INSERT INTO enrollment (student_id, academic_year_id, term_id, stream_id, status)
      VALUES
        (1, 2026, 2, 1, 'ACTIVE'),
        (2, 2026, 2, 2, 'ACTIVE');

      INSERT INTO exam_result (exam_id, student_id, subject_id, score)
      VALUES
        (11, 1, 1, 80),
        (11, 2, 1, 40),
        (10, 1, 1, 70);
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('filters subject analysis by stream using enrollment records', async () => {
    const service = new ExamAnalysisService()
    const analysis = await service.getSubjectAnalysis(11, 1, 1)

    expect(analysis.student_count).toBe(1)
    expect(analysis.mean_score).toBe(80)
    expect(analysis.subject_name).toBe('Mathematics')
  })

  it('builds student analysis name from first and last name columns', async () => {
    const service = new ExamAnalysisService()
    const analysis = await service.getStudentPerformance(1, 11)

    expect(analysis.student_name).toBe('Grace Mutua')
    expect(analysis.admission_number).toBe('ADM/001')
  })

  it('scopes analyzeAllSubjects to requested stream enrollment', async () => {
    const service = new ExamAnalysisService()
    const analyses = await service.analyzeAllSubjects(11, 1)

    expect(analyses).toHaveLength(1)
    expect(analyses[0]?.student_count).toBe(1)
    expect(analyses[0]?.mean_score).toBe(80)
  })
})
