import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db,
}))

import { MeritListService } from '../MeritListService'

describe('MeritListService schema-compatible ranking queries', () => {
  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE exam (
        id INTEGER PRIMARY KEY,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE report_card_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        class_position INTEGER NOT NULL,
        total_marks REAL NOT NULL,
        mean_score REAL NOT NULL,
        mean_grade TEXT NOT NULL
      );

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
        stream_id INTEGER NOT NULL,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        status TEXT NOT NULL
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
        min_score REAL NOT NULL,
        max_score REAL NOT NULL
      );

      CREATE TABLE merit_list (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        stream_id INTEGER NOT NULL,
        exam_id INTEGER NOT NULL,
        list_type TEXT NOT NULL,
        generated_by_user_id INTEGER NOT NULL,
        generated_date TEXT NOT NULL,
        total_students INTEGER NOT NULL
      );

      CREATE TABLE merit_list_entry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        merit_list_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        position INTEGER NOT NULL,
        total_marks REAL NOT NULL,
        average_marks REAL NOT NULL,
        grade TEXT NOT NULL,
        percentage REAL NOT NULL,
        class_position INTEGER NOT NULL,
        tied_count INTEGER NOT NULL
      );

      INSERT INTO exam (id, academic_year_id, term_id, created_at) VALUES (10, 2026, 1, '2026-03-01');
      INSERT INTO student (id, admission_number, first_name, last_name, is_active)
      VALUES
        (1, 'ADM/001', 'Grace', 'Mutua', 1),
        (2, 'ADM/002', 'Sarah', 'Ochieng', 1);

      INSERT INTO enrollment (student_id, stream_id, academic_year_id, term_id, status)
      VALUES
        (1, 5, 2026, 1, 'ACTIVE'),
        (2, 5, 2026, 1, 'ACTIVE');

      INSERT INTO report_card_summary (exam_id, student_id, class_position, total_marks, mean_score, mean_grade)
      VALUES
        (10, 1, 1, 540, 90, 'A'),
        (10, 2, 2, 480, 80, 'B');

      INSERT INTO exam_result (exam_id, student_id, subject_id, score)
      VALUES
        (10, 1, 1, 90),
        (10, 1, 2, 90),
        (10, 2, 1, 80),
        (10, 2, 2, 80);

      INSERT INTO grading_scale (curriculum, grade, min_score, max_score)
      VALUES ('CBC', 'A', 80, 100), ('CBC', 'B', 60, 79), ('CBC', 'C', 0, 59);
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('generates merit list without relying on removed student stream/name columns', async () => {
    const service = new MeritListService()
    const list = await service.generateMeritList({ academicYearId: 2026, termId: 1, streamId: 5 })

    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({ admission_number: 'ADM/001', student_name: 'Grace Mutua', position: 1 })
    expect(list[1]).toMatchObject({ admission_number: 'ADM/002', student_name: 'Sarah Ochieng', position: 2 })
  })

  it('builds class merit entries using active enrollments scoped to exam term/year', async () => {
    const service = new MeritListService()
    const result = await service.generateClassMeritList(2026, 1, 5, 10, 42)

    expect(result.total_students).toBe(2)
    expect(result.rankings[0].student_name).toBe('Grace Mutua')
    expect(result.rankings[0].position).toBe(1)

    const storedEntries = db.prepare('SELECT COUNT(*) as count FROM merit_list_entry').get() as { count: number }
    expect(storedEntries.count).toBe(2)
  })
})
