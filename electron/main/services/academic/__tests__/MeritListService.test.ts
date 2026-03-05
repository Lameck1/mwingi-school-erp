import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db,
}))

import { MeritListService } from '../MeritListService'

const SCHEMA = `
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
  CREATE TABLE subject (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT
  );
`

const SEED = `
  INSERT INTO exam (id, academic_year_id, term_id, created_at) VALUES (10, 2026, 1, '2026-03-01');
  INSERT INTO exam (id, academic_year_id, term_id, created_at) VALUES (11, 2026, 2, '2026-06-01');
  INSERT INTO student (id, admission_number, first_name, last_name, is_active)
  VALUES
    (1, 'ADM/001', 'Grace', 'Mutua', 1),
    (2, 'ADM/002', 'Sarah', 'Ochieng', 1),
    (3, 'ADM/003', 'James', 'Kibet', 1),
    (4, 'ADM/004', 'Inactive', 'Student', 0);

  INSERT INTO enrollment (student_id, stream_id, academic_year_id, term_id, status)
  VALUES
    (1, 5, 2026, 1, 'ACTIVE'),
    (2, 5, 2026, 1, 'ACTIVE'),
    (3, 5, 2026, 1, 'ACTIVE'),
    (1, 5, 2026, 2, 'ACTIVE'),
    (2, 5, 2026, 2, 'ACTIVE'),
    (3, 5, 2026, 2, 'ACTIVE');

  INSERT INTO subject (id, name, code) VALUES (1, 'Mathematics', 'MATH'), (2, 'English', 'ENG'), (3, 'Science', 'SCI');

  INSERT INTO report_card_summary (exam_id, student_id, class_position, total_marks, mean_score, mean_grade)
  VALUES
    (10, 1, 1, 540, 90, 'A'),
    (10, 2, 2, 480, 80, 'B'),
    (10, 3, 3, 300, 50, 'C');

  INSERT INTO exam_result (exam_id, student_id, subject_id, score)
  VALUES
    (10, 1, 1, 95), (10, 1, 2, 85), (10, 1, 3, 90),
    (10, 2, 1, 80), (10, 2, 2, 80), (10, 2, 3, 80),
    (10, 3, 1, 45), (10, 3, 2, 55), (10, 3, 3, 50);

  INSERT INTO grading_scale (curriculum, grade, min_score, max_score)
  VALUES ('CBC', 'A', 80, 100), ('CBC', 'B', 60, 79), ('CBC', 'C', 40, 59), ('CBC', 'D', 20, 39), ('CBC', 'E', 0, 19);

  -- Term 2 results for performance improvement tests
  INSERT INTO report_card_summary (exam_id, student_id, class_position, total_marks, mean_score, mean_grade)
  VALUES
    (11, 1, 1, 570, 95, 'A'),
    (11, 2, 3, 420, 70, 'B'),
    (11, 3, 2, 450, 75, 'B');

  INSERT INTO exam_result (exam_id, student_id, subject_id, score)
  VALUES
    (11, 1, 1, 98), (11, 1, 2, 92), (11, 1, 3, 95),
    (11, 2, 1, 70), (11, 2, 2, 70), (11, 2, 3, 70),
    (11, 3, 1, 75), (11, 3, 2, 75), (11, 3, 3, 75);
`

describe('MeritListService', () => {
  let service: MeritListService

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(SCHEMA)
    db.exec(SEED)
    service = new MeritListService()
  })

  afterEach(() => {
    db.close()
  })

  // ── generateMeritList ──
  describe('generateMeritList', () => {
    it('returns ranked students from report_card_summary', async () => {
      const list = await service.generateMeritList({ academicYearId: 2026, termId: 1, streamId: 5 })
      expect(list).toHaveLength(3)
      expect(list[0]).toMatchObject({ position: 1, admission_number: 'ADM/001', student_name: 'Grace Mutua' })
      expect(list[1]).toMatchObject({ position: 2, admission_number: 'ADM/002', student_name: 'Sarah Ochieng' })
      expect(list[2]).toMatchObject({ position: 3, admission_number: 'ADM/003', student_name: 'James Kibet' })
    })

    it('throws when no exam found for given term/year', async () => {
      await expect(service.generateMeritList({ academicYearId: 9999, termId: 9, streamId: 5 }))
        .rejects.toThrow('No exam found')
    })

    it('excludes inactive students', async () => {
      // Student 4 is inactive — should not appear even if enrolled
      db.exec(`
        INSERT INTO enrollment (student_id, stream_id, academic_year_id, term_id, status) VALUES (4, 5, 2026, 1, 'ACTIVE');
        INSERT INTO report_card_summary (exam_id, student_id, class_position, total_marks, mean_score, mean_grade) VALUES (10, 4, 4, 200, 40, 'D');
      `)
      const list = await service.generateMeritList({ academicYearId: 2026, termId: 1, streamId: 5 })
      expect(list.every(s => s.student_id !== 4)).toBe(true)
    })

    it('excludes students with non-ACTIVE enrollment', async () => {
      db.exec(`UPDATE enrollment SET status = 'WITHDRAWN' WHERE student_id = 3 AND term_id = 1`)
      const list = await service.generateMeritList({ academicYearId: 2026, termId: 1, streamId: 5 })
      expect(list).toHaveLength(2)
    })

    it('returns empty when stream has no enrollments', async () => {
      const list = await service.generateMeritList({ academicYearId: 2026, termId: 1, streamId: 999 })
      expect(list).toHaveLength(0)
    })
  })

  // ── generateClassMeritList ──
  describe('generateClassMeritList', () => {
    it('creates merit_list record and entries from exam_result', async () => {
      const result = await service.generateClassMeritList(2026, 1, 5, 10, 42)
      expect(result.total_students).toBe(3)
      expect(result.rankings).toHaveLength(3)
      expect(result.rankings[0]!.student_name).toBe('Grace Mutua')
      expect(result.rankings[0]!.position).toBe(1)

      const entries = db.prepare('SELECT COUNT(*) as count FROM merit_list_entry').get() as { count: number }
      expect(entries.count).toBe(3)

      const record = db.prepare('SELECT * FROM merit_list WHERE id = ?').get(result.id) as Record<string, unknown>
      expect(record.list_type).toBe('overall')
      expect(record.generated_by_user_id).toBe(42)
    })

    it('assigns correct grades from CBC grading scale', async () => {
      const result = await service.generateClassMeritList(2026, 1, 5, 10, 42)
      // Grace avg 90 → A, Sarah avg 80 → A, James avg 50 → C
      expect(result.rankings[0]!.grade).toBe('A')
      expect(result.rankings[2]!.grade).toBe('C')
    })

    it('handles tied students — same average gives same position', async () => {
      // Make students 1 and 2 have identical averages
      db.exec(`
        DELETE FROM exam_result WHERE exam_id = 10;
        INSERT INTO exam_result (exam_id, student_id, subject_id, score) VALUES
          (10, 1, 1, 80), (10, 1, 2, 80),
          (10, 2, 1, 80), (10, 2, 2, 80),
          (10, 3, 1, 50), (10, 3, 2, 50);
      `)
      const result = await service.generateClassMeritList(2026, 1, 5, 10, 42)
      // First two should share position 1, tied_with arrays populated
      expect(result.rankings[0]!.position).toBe(1)
      expect(result.rankings[1]!.position).toBe(1)
      expect(result.rankings[0]!.tied_with.length).toBeGreaterThan(0)
      expect(result.rankings[2]!.position).toBe(3)
    })

    it('throws when no exam results exist for the class', async () => {
      await expect(service.generateClassMeritList(2026, 1, 999, 10, 42))
        .rejects.toThrow('No exam results found')
    })
  })

  // ── getSubjectMeritList ──
  describe('getSubjectMeritList', () => {
    it('returns students ranked by score for a specific subject', async () => {
      const list = await service.getSubjectMeritList(10, 1, 5)
      expect(list).toHaveLength(3)
      expect(list[0]!.student_name).toBe('Grace Mutua')
      expect(list[0]!.marks).toBe(95)
      expect(list[0]!.position).toBe(1)
      expect(list[2]!.student_name).toBe('James Kibet')
      expect(list[2]!.marks).toBe(45)
      expect(list[2]!.position).toBe(3)
    })

    it('returns empty for non-existent subject', async () => {
      const list = await service.getSubjectMeritList(10, 999, 5)
      expect(list).toHaveLength(0)
    })

    it('scopes to stream via enrollment', async () => {
      const list = await service.getSubjectMeritList(10, 1, 999)
      expect(list).toHaveLength(0)
    })
  })

  // ── getSubjectDifficulty ──
  describe('getSubjectDifficulty', () => {
    it('calculates mean, median, pass_rate, difficulty and verdict', async () => {
      const diff = await service.getSubjectDifficulty(10, 1, 5)
      // Scores: 95, 80, 45 → mean=73.33, median=80, 2/3 pass (>=50) = 66.67%
      expect(diff.subject_name).toBe('Mathematics')
      expect(diff.mean_score).toBeCloseTo(73.33, 1)
      expect(diff.median_score).toBe(80)
      expect(diff.pass_rate).toBeCloseTo(66.67, 1)
      expect(diff.verdict).toBe('Easy') // mean >= 70
    })

    it('returns zeroed stats with "Insufficient data" when no results', async () => {
      const diff = await service.getSubjectDifficulty(10, 999, 5)
      expect(diff.mean_score).toBe(0)
      expect(diff.median_score).toBe(0)
      expect(diff.pass_rate).toBe(0)
      expect(diff.verdict).toBe('Insufficient data')
    })

    it('verdict is Moderate for mean 50-69', async () => {
      // Subject 3 (Science): scores 90, 80, 50 → mean=73.33 (Easy)
      // Let's insert data where mean is moderate
      db.exec(`
        DELETE FROM exam_result WHERE exam_id = 10 AND subject_id = 3;
        INSERT INTO exam_result (exam_id, student_id, subject_id, score) VALUES
          (10, 1, 3, 60), (10, 2, 3, 55), (10, 3, 3, 50);
      `)
      const diff = await service.getSubjectDifficulty(10, 3, 5)
      expect(diff.mean_score).toBeCloseTo(55, 0)
      expect(diff.verdict).toBe('Moderate')
    })

    it('verdict is Difficult for mean < 50', async () => {
      db.exec(`
        DELETE FROM exam_result WHERE exam_id = 10 AND subject_id = 3;
        INSERT INTO exam_result (exam_id, student_id, subject_id, score) VALUES
          (10, 1, 3, 40), (10, 2, 3, 30), (10, 3, 3, 20);
      `)
      const diff = await service.getSubjectDifficulty(10, 3, 5)
      expect(diff.mean_score).toBeCloseTo(30, 0)
      expect(diff.verdict).toBe('Difficult')
    })

    it('calculates discrimination index from top/bottom 27%', async () => {
      const diff = await service.getSubjectDifficulty(10, 1, 5)
      // 3 students: band = max(1, floor(3 * 0.27)) = 1
      // top 1 = [95], bottom 1 = [45] → discrimination = 95 - 45 = 50
      expect(diff.discrimination_index).toBe(50)
    })
  })

  // ── calculatePerformanceImprovements ──
  describe('calculatePerformanceImprovements', () => {
    it('computes improvement between two terms', async () => {
      const improvements = await service.calculatePerformanceImprovements(2026, 2, 1)
      expect(improvements.length).toBeGreaterThan(0)

      // James improved from 50 → 75 = +50%
      const james = improvements.find(i => i.student_name === 'James Kibet')
      expect(james).toBeDefined()
      expect(james!.improvement_points).toBe(25)
      expect(james!.improvement_percentage).toBeCloseTo(50, 0)
    })

    it('shows negative improvement for declining students', async () => {
      const improvements = await service.calculatePerformanceImprovements(2026, 2, 1)
      // Sarah went from 80 → 70 = -12.5%
      const sarah = improvements.find(i => i.student_name === 'Sarah Ochieng')
      expect(sarah!.improvement_points).toBe(-10)
      expect(sarah!.improvement_percentage).toBeCloseTo(-12.5, 0)
    })

    it('includes grade_improvement string (e.g. "B → A")', async () => {
      const improvements = await service.calculatePerformanceImprovements(2026, 2, 1)
      const james = improvements.find(i => i.student_name === 'James Kibet')
      // 50 → C, 75 → A- per scoreToGrade
      expect(james!.grade_improvement).toContain('→')
    })

    it('filters by streamId when provided', async () => {
      const improvements = await service.calculatePerformanceImprovements(2026, 2, 1, 5)
      expect(improvements.length).toBeGreaterThan(0)

      const none = await service.calculatePerformanceImprovements(2026, 2, 1, 999)
      expect(none).toHaveLength(0)
    })

    it('handles zero previous average without division error', async () => {
      // Insert student with term 1 avg=0 and term 2 avg=60
      db.exec(`
        INSERT INTO student (id, admission_number, first_name, last_name, is_active) VALUES (5, 'ADM/005', 'Zero', 'Prev', 1);
        INSERT INTO enrollment (student_id, stream_id, academic_year_id, term_id, status)
        VALUES (5, 5, 2026, 1, 'ACTIVE'), (5, 5, 2026, 2, 'ACTIVE');
        INSERT INTO report_card_summary (exam_id, student_id, class_position, total_marks, mean_score, mean_grade)
        VALUES (11, 5, 4, 360, 60, 'B');
      `)
      const improvements = await service.calculatePerformanceImprovements(2026, 2, 1)
      const zero = improvements.find(i => i.student_name === 'Zero Prev')
      expect(zero).toBeDefined()
      expect(zero!.improvement_percentage).toBe(0) // previous_average == 0 → 0%
    })
  })

  // ── getSubjectName (PRAGMA table_info detection) ──
  describe('getSubjectName (via getSubjectDifficulty)', () => {
    it('resolves name from "name" column in subject table', async () => {
      const diff = await service.getSubjectDifficulty(10, 1, 5)
      expect(diff.subject_name).toBe('Mathematics')
    })

    it('returns "Unknown" for non-existent subject', async () => {
      // Insert a dummy result so the method gets past the "no rows" check
      db.exec(`INSERT INTO exam_result (exam_id, student_id, subject_id, score) VALUES (10, 1, 999, 70)`)
      const diff = await service.getSubjectDifficulty(10, 999, 5)
      expect(diff.subject_name).toBe('Unknown')
    })

    it('falls back to subject_name column in legacy schema', async () => {
      // Drop and recreate subject table with legacy column
      db.exec(`
        DROP TABLE subject;
        CREATE TABLE subject (id INTEGER PRIMARY KEY, subject_name TEXT NOT NULL);
        INSERT INTO subject (id, subject_name) VALUES (1, 'Maths Legacy');
      `)
      const diff = await service.getSubjectDifficulty(10, 1, 5)
      expect(diff.subject_name).toBe('Maths Legacy')
    })

    it('returns Unknown when subject table has neither name nor subject_name', async () => {
      db.exec(`
        DROP TABLE subject;
        CREATE TABLE subject (id INTEGER PRIMARY KEY, code TEXT);
        INSERT INTO subject (id, code) VALUES (1, 'MATH');
      `)
      const diff = await service.getSubjectDifficulty(10, 1, 5)
      expect(diff.subject_name).toBe('Unknown')
    })

    it('calculates median correctly for even number of scores', async () => {
      // Add a 4th student so we have even count
      db.exec(`
        INSERT INTO student (id, admission_number, first_name, last_name, is_active) VALUES (5, 'ADM/005', 'Even', 'Count', 1);
        INSERT INTO enrollment (student_id, stream_id, academic_year_id, term_id, status) VALUES (5, 5, 2026, 1, 'ACTIVE');
        INSERT INTO exam_result (exam_id, student_id, subject_id, score) VALUES (10, 5, 1, 60);
      `)
      // Scores for subject 1: 95, 80, 60, 45 → sorted: 45, 60, 80, 95 → median = (60+80)/2 = 70
      const diff = await service.getSubjectDifficulty(10, 1, 5)
      expect(diff.median_score).toBe(70)
    })
  })

  // ── scoreToGrade (via getGradeChange in calculatePerformanceImprovements) ──
  describe('scoreToGrade coverage via calculatePerformanceImprovements', () => {
    it('maps C- grade for score 45-49', async () => {
      db.exec(`
        INSERT INTO student (id, admission_number, first_name, last_name, is_active) VALUES (6, 'ADM/006', 'Test', 'CMinus', 1);
        INSERT INTO enrollment (student_id, stream_id, academic_year_id, term_id, status)
        VALUES (6, 5, 2026, 1, 'ACTIVE'), (6, 5, 2026, 2, 'ACTIVE');
        INSERT INTO report_card_summary (exam_id, student_id, class_position, total_marks, mean_score, mean_grade)
        VALUES (10, 6, 5, 280, 46, 'C-'), (11, 6, 5, 320, 56, 'C+');
      `)
      const improvements = await service.calculatePerformanceImprovements(2026, 2, 1)
      const student = improvements.find(i => i.student_name === 'Test CMinus')
      // 46 → C-, 56 → C+
      expect(student!.grade_improvement).toContain('C-')
      expect(student!.grade_improvement).toContain('C+')
    })

    it('maps B- grade for score 60-64', async () => {
      db.exec(`
        INSERT INTO student (id, admission_number, first_name, last_name, is_active) VALUES (7, 'ADM/007', 'Test', 'BMinus', 1);
        INSERT INTO enrollment (student_id, stream_id, academic_year_id, term_id, status)
        VALUES (7, 5, 2026, 1, 'ACTIVE'), (7, 5, 2026, 2, 'ACTIVE');
        INSERT INTO report_card_summary (exam_id, student_id, class_position, total_marks, mean_score, mean_grade)
        VALUES (10, 7, 5, 370, 62, 'B-'), (11, 7, 5, 430, 72, 'B+');
      `)
      const improvements = await service.calculatePerformanceImprovements(2026, 2, 1)
      const student = improvements.find(i => i.student_name === 'Test BMinus')
      // 62 → B-, 72 → B+
      expect(student!.grade_improvement).toContain('B-')
      expect(student!.grade_improvement).toContain('B+')
    })

    it('maps E grade for score < 45', async () => {
      db.exec(`
        INSERT INTO student (id, admission_number, first_name, last_name, is_active) VALUES (8, 'ADM/008', 'Test', 'EGrade', 1);
        INSERT INTO enrollment (student_id, stream_id, academic_year_id, term_id, status)
        VALUES (8, 5, 2026, 1, 'ACTIVE'), (8, 5, 2026, 2, 'ACTIVE');
        INSERT INTO report_card_summary (exam_id, student_id, class_position, total_marks, mean_score, mean_grade)
        VALUES (10, 8, 5, 200, 30, 'E'), (11, 8, 5, 300, 50, 'C');
      `)
      const improvements = await service.calculatePerformanceImprovements(2026, 2, 1)
      const student = improvements.find(i => i.student_name === 'Test EGrade')
      // 30 → E, 50 → C
      expect(student!.grade_improvement).toContain('E')
      expect(student!.grade_improvement).toContain('C')
    })
  })

  // ── getGrade with empty grading scale ──
  describe('getGrade fallback to E when grading scale has no match', () => {
    it('returns E when score falls outside all grading scale ranges', async () => {
      // Clear CBC grading scale but keep a narrow range
      db.exec(`
        DELETE FROM grading_scale;
        INSERT INTO grading_scale (curriculum, grade, min_score, max_score) VALUES ('CBC', 'A', 90, 100);
      `)
      // Student with avg 50 won't match any CBC range → getGrade returns 'E'
      const result = await service.generateClassMeritList(2026, 1, 5, 10, 42)
      const james = result.rankings.find(r => r.student_id === 3)
      expect(james!.grade).toBe('E') // avg 50, no matching CBC range
    })
  })

  /* ==================================================================
   *  Branch coverage: getSubjectName with legacy 'subject_name' column
   * ================================================================== */
  describe('getSubjectName legacy column fallback', () => {
    it('uses subject_name column when name column does not exist', async () => {
      // Drop and recreate subject table with legacy column
      db.exec(`
        DROP TABLE subject;
        CREATE TABLE subject (id INTEGER PRIMARY KEY, subject_name TEXT NOT NULL, code TEXT);
        INSERT INTO subject (id, subject_name, code) VALUES (1, 'Maths', 'MATH'), (2, 'Eng', 'ENG'), (3, 'Sci', 'SCI');
      `)
      const result = await service.getSubjectDifficulty(10, 1, 5)
      expect(result.subject_name).toBe('Maths')
    })

    it('returns Unknown when subject with given id does not exist', async () => {
      const result = await service.getSubjectDifficulty(10, 999, 5)
      expect(result.subject_name).toBe('Unknown')
    })
  })

  /* ==================================================================
   *  Branch coverage: getSubjectMeritList
   * ================================================================== */
  describe('getSubjectMeritList', () => {
    it('returns ranked students for a subject', async () => {
      const result = await service.getSubjectMeritList(10, 1, 5)
      expect(result.length).toBe(3)
      expect(result[0]!.position).toBe(1)
      expect(result[0]!.marks).toBe(95) // Grace, highest in Math
    })
  })

  /* ==================================================================
   *  Branch coverage: getSubjectDifficulty with even number of scores
   * ================================================================== */
  describe('getSubjectDifficulty – even number of scores (median branch)', () => {
    it('calculates median correctly for even-length array', async () => {
      // Add a 4th student to make 4 exam results
      db.exec(`
        INSERT INTO student (id, admission_number, first_name, last_name, is_active) VALUES (9, 'ADM/009', 'Even', 'Count', 1);
        INSERT INTO enrollment (student_id, stream_id, academic_year_id, term_id, status) VALUES (9, 5, 2026, 1, 'ACTIVE');
        INSERT INTO exam_result (exam_id, student_id, subject_id, score) VALUES (10, 9, 1, 70);
      `)
      const result = await service.getSubjectDifficulty(10, 1, 5)
      // Scores: 45, 70, 80, 95 (sorted). Median = (70+80)/2 = 75
      expect(result.median_score).toBe(75)
      expect(result.pass_rate).toBeGreaterThan(0)
    })
  })

  /* ==================================================================
   *  Branch coverage: getSubjectDifficulty with no results
   * ================================================================== */
  describe('getSubjectDifficulty – no results', () => {
    it('returns zero metrics with "Insufficient data" verdict', async () => {
      const result = await service.getSubjectDifficulty(10, 999, 5)
      expect(result.mean_score).toBe(0)
      expect(result.verdict).toBe('Insufficient data')
    })
  })

  /* ==================================================================
   *  Branch coverage: calculatePerformanceImprovements with streamId
   * ================================================================== */
  describe('calculatePerformanceImprovements – with streamId filter', () => {
    it('filters by streamId when provided', async () => {
      const improvements = await service.calculatePerformanceImprovements(2026, 2, 1, 5)
      expect(improvements.length).toBeGreaterThanOrEqual(1)
    })
  })

  /* ==================================================================
   *  Branch coverage: calculatePerformanceImprovements – previous_average = 0
   * ================================================================== */
  describe('calculatePerformanceImprovements – no previous scores', () => {
    it('returns 0 improvement_percentage when previous average is 0', async () => {
      db.exec(`
        INSERT INTO student (id, admission_number, first_name, last_name, is_active) VALUES (10, 'ADM/010', 'New', 'Student', 1);
        INSERT INTO enrollment (student_id, stream_id, academic_year_id, term_id, status) VALUES (10, 5, 2026, 2, 'ACTIVE');
        INSERT INTO report_card_summary (exam_id, student_id, class_position, total_marks, mean_score, mean_grade)
        VALUES (11, 10, 6, 200, 40, 'D');
      `)
      const improvements = await service.calculatePerformanceImprovements(2026, 2, 1)
      const newStudent = improvements.find(i => i.student_name === 'New Student')
      expect(newStudent!.improvement_percentage).toBe(0)
    })
  })

  /* ==================================================================
   *  Branch coverage: tied students in rankings
   * ================================================================== */
  describe('generateClassMeritList – tied students', () => {
    it('marks tied_with for students with equal average marks', async () => {
      // Make student 2 and student 3 have the same total marks
      db.exec(`
        DELETE FROM exam_result WHERE exam_id = 10 AND student_id IN (2, 3);
        INSERT INTO exam_result (exam_id, student_id, subject_id, score)
        VALUES (10, 2, 1, 70), (10, 2, 2, 70), (10, 2, 3, 70),
               (10, 3, 1, 70), (10, 3, 2, 70), (10, 3, 3, 70);
      `)
      const result = await service.generateClassMeritList(2026, 1, 5, 10, 42)
      // Student 2 and 3 should be tied
      const s2 = result.rankings.find(r => r.student_id === 2)
      const s3 = result.rankings.find(r => r.student_id === 3)
      expect(s2!.position).toBe(s3!.position)
      expect(s2!.tied_with.length + s3!.tied_with.length).toBeGreaterThanOrEqual(1)
    })
  })

  /* ==================================================================
   *  Branch coverage: scoreToGrade – A- / B+ / B / B- / C+ / C / C-
   * ================================================================== */
  describe('scoreToGrade covers all grade boundaries', () => {
    it('A- for score 75-79', async () => {
      db.exec(`
        INSERT INTO student (id, admission_number, first_name, last_name, is_active) VALUES (11, 'ADM/011', 'GradeA-', 'Test', 1);
        INSERT INTO enrollment (student_id, stream_id, academic_year_id, term_id, status) VALUES (11, 5, 2026, 1, 'ACTIVE'), (11, 5, 2026, 2, 'ACTIVE');
        INSERT INTO report_card_summary (exam_id, student_id, class_position, total_marks, mean_score, mean_grade)
        VALUES (10, 11, 6, 225, 75, 'A-'), (11, 11, 6, 285, 95, 'A');
      `)
      const improvements = await service.calculatePerformanceImprovements(2026, 2, 1)
      const student = improvements.find(i => i.student_name === 'GradeA- Test')
      expect(student!.grade_improvement).toContain('A-')
      expect(student!.grade_improvement).toContain('A')
    })

    it('B+ / B / B- / C+ / C / C- via grade change', async () => {
      // Insert multiple students at different avg scores
      const scores = [
        { id: 20, adm: 'ADM/020', name: 'Bplus', prev: 70, curr: 70 },      // B+ → B+
        { id: 21, adm: 'ADM/021', name: 'Bgrade', prev: 65, curr: 65 },     // B → B
        { id: 22, adm: 'ADM/022', name: 'Bminus', prev: 60, curr: 60 },     // B- → B- 
        { id: 23, adm: 'ADM/023', name: 'Cplus', prev: 55, curr: 55 },      // C+ → C+
        { id: 24, adm: 'ADM/024', name: 'Cgrade', prev: 50, curr: 50 },     // C → C
        { id: 25, adm: 'ADM/025', name: 'Cminus', prev: 45, curr: 45 },     // C- → C-
      ]
      for (const s of scores) {
        db.exec(`
          INSERT INTO student (id, admission_number, first_name, last_name, is_active) VALUES (${s.id}, '${s.adm}', '${s.name}', 'G', 1);
          INSERT INTO enrollment (student_id, stream_id, academic_year_id, term_id, status) VALUES (${s.id}, 5, 2026, 1, 'ACTIVE'), (${s.id}, 5, 2026, 2, 'ACTIVE');
          INSERT INTO report_card_summary (exam_id, student_id, class_position, total_marks, mean_score, mean_grade)
          VALUES (10, ${s.id}, 6, ${s.prev * 3}, ${s.prev}, 'X'), (11, ${s.id}, 6, ${s.curr * 3}, ${s.curr}, 'X');
        `)
      }
      const improvements = await service.calculatePerformanceImprovements(2026, 2, 1)
      expect(improvements.find(i => i.student_name === 'Bplus G')!.grade_improvement).toContain('B+')
      expect(improvements.find(i => i.student_name === 'Bgrade G')!.grade_improvement).toContain('B')
      expect(improvements.find(i => i.student_name === 'Bminus G')!.grade_improvement).toContain('B-')
      expect(improvements.find(i => i.student_name === 'Cplus G')!.grade_improvement).toContain('C+')
      expect(improvements.find(i => i.student_name === 'Cgrade G')!.grade_improvement).toContain('→ C')
      expect(improvements.find(i => i.student_name === 'Cminus G')!.grade_improvement).toContain('C-')
    })
  })

  /* ==================================================================
   *  Branch coverage: calculatePerformanceImprovements with streamId filter (L502)
   * ================================================================== */
  describe('calculatePerformanceImprovements – with streamId filter', () => {
    it('filters results by stream when streamId is provided', async () => {
      const improvements = await service.calculatePerformanceImprovements(2026, 2, 1, 5)
      // Only students enrolled in stream 5 should appear
      expect(improvements.length).toBeGreaterThanOrEqual(1)
      expect(improvements.every(i => i.student_name.length > 0)).toBe(true)
    })

    it('returns empty when streamId has no enrollments', async () => {
      const improvements = await service.calculatePerformanceImprovements(2026, 2, 1, 999)
      expect(improvements).toHaveLength(0)
    })
  })

  /* ==================================================================
   *  Branch coverage: calculatePerformanceImprovements with zero previous_average (L516)
   * ================================================================== */
  describe('calculatePerformanceImprovements – zero previous average', () => {
    it('returns 0% improvement when previous_average is 0', async () => {
      db.exec(`
        INSERT INTO student (id, admission_number, first_name, last_name, is_active) VALUES (30, 'ADM/030', 'New', 'Student', 1);
        INSERT INTO enrollment (student_id, stream_id, academic_year_id, term_id, status) VALUES (30, 5, 2026, 1, 'ACTIVE'), (30, 5, 2026, 2, 'ACTIVE');
        INSERT INTO report_card_summary (exam_id, student_id, class_position, total_marks, mean_score, mean_grade)
        VALUES (11, 30, 7, 210, 70, 'B');
      `)
      // No term 1 report_card_summary for student 30 → previous = 0
      const improvements = await service.calculatePerformanceImprovements(2026, 2, 1)
      const stu = improvements.find(i => i.student_name === 'New Student')
      expect(stu).toBeDefined()
      expect(stu!.improvement_percentage).toBe(0)
    })
  })

  /* ==================================================================
   *  Branch coverage: getSubjectName with legacy subject_name column (L315)
   * ================================================================== */
  describe('getSubjectName – legacy subject_name column', () => {
    it('uses subject_name column when name column is absent', async () => {
      // Recreate subject table with subject_name instead of name
      db.exec(`DROP TABLE subject`)
      db.exec(`CREATE TABLE subject (id INTEGER PRIMARY KEY, subject_name TEXT NOT NULL, code TEXT)`)
      db.exec(`INSERT INTO subject (id, subject_name, code) VALUES (1, 'Maths Legacy', 'MATH'), (2, 'English Legacy', 'ENG'), (3, 'Science Legacy', 'SCI')`)
      const difficulty = await service.getSubjectDifficulty(10, 1, 5)
      expect(difficulty.subject_name).toBe('Maths Legacy')
    })
  })

  /* ==================================================================
   *  Branch coverage: getSubjectName returns Unknown when subject not found (L331)
   * ================================================================== */
  describe('getSubjectName – subject not found', () => {
    it('returns Unknown for non-existent subject id', async () => {
      const difficulty = await service.getSubjectDifficulty(10, 999, 5)
      // No exam results for subject 999 → returns insufficient data
      expect(difficulty.subject_name).toBe('Unknown')
      expect(difficulty.verdict).toBe('Insufficient data')
    })
  })

  /* ==================================================================
   *  Branch coverage: getSubjectMeritList by subject + stream (L345+)
   * ================================================================== */
  describe('getSubjectMeritList', () => {
    it('returns subject-level positions', async () => {
      const list = await service.getSubjectMeritList(10, 1, 5)
      expect(list.length).toBe(3)
      expect(list[0]!.position).toBe(1)
      expect(list[0]!.marks).toBe(95) // Grace's Math score
    })
  })

  /* ==================================================================
   *  Branch coverage: calculatePerformanceImprovements non-Error catch (L501)
   * ================================================================== */
  describe('calculatePerformanceImprovements – non-Error thrown in catch', () => {
    it('wraps a non-Error thrown value with String()', async () => {
      const origPrepare = db.prepare.bind(db)
      vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
        // Let the initial exam lookup succeed, then throw a non-Error
        if (sql.includes('SELECT id FROM exam')) {
          return origPrepare(sql)
        }
        throw 'non-error-value' // NOSONAR
      })

      await expect(service.calculatePerformanceImprovements(2026, 2, 1))
        .rejects.toThrow('Failed to calculate improvements: non-error-value')
    })
  })

  /* ==================================================================
   *  Branch coverage: getSubjectDifficulty even-length median (L404 ?? 0)
   * ================================================================== */
  describe('getSubjectDifficulty – even count median', () => {
    it('calculates median correctly with even number of scores', async () => {
      // Add a 4th student with a score to make even count
      db.exec(`
        INSERT INTO student (id, admission_number, first_name, last_name, is_active) VALUES (31, 'ADM/031', 'Even', 'Test', 1);
        INSERT INTO enrollment (student_id, stream_id, academic_year_id, term_id, status) VALUES (31, 5, 2026, 1, 'ACTIVE');
        INSERT INTO exam_result (exam_id, student_id, subject_id, score) VALUES (10, 31, 1, 70);
      `)
      const difficulty = await service.getSubjectDifficulty(10, 1, 5)
      // 4 scores: 45, 70, 80, 95 → median = (70+80)/2 = 75
      expect(difficulty.median_score).toBe(75)
    })
  })

  /* ==================================================================
   *  Branch coverage: generateClassMeritList – non-Error catch path
   * ================================================================== */
  describe('generateClassMeritList – non-Error catch', () => {
    it('wraps a non-Error thrown value with String() in catch', async () => {
      const origPrepare = db.prepare.bind(db)
      vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO merit_list')) {
          throw 'non-error-in-merit-list' // NOSONAR
        }
        return origPrepare(sql)
      })
      await expect(service.generateClassMeritList(2026, 1, 5, 10, 42))
        .rejects.toThrow('Failed to generate merit list: non-error-in-merit-list')
      vi.restoreAllMocks()
    })
  })

  /* ==================================================================
   *  Branch coverage: getSubjectName – legacy column, subject not found
   * ================================================================== */
  describe('getSubjectName – legacy column with missing subject', () => {
    it('returns Unknown when legacy subject_name column exists but subject id not found', async () => {
      db.exec(`DROP TABLE subject`)
      db.exec(`CREATE TABLE subject (id INTEGER PRIMARY KEY, subject_name TEXT NOT NULL)`)
      db.exec(`INSERT INTO subject (id, subject_name) VALUES (1, 'Maths')`) // Only subject 1 exists
      // Query for subject 2 which does not exist → should return 'Unknown'
      db.exec(`INSERT INTO exam_result (exam_id, student_id, subject_id, score) VALUES (10, 1, 2, 70)`)
      const diff = await service.getSubjectDifficulty(10, 2, 5)
      expect(diff.subject_name).toBe('Unknown')
    })
  })

  /* ==================================================================
   *  Branch coverage: calculatePerformanceImprovements – real Error catch
   * ================================================================== */
  describe('calculatePerformanceImprovements – Error instance in catch', () => {
    it('uses error.message when a real Error is thrown', async () => {
      const origPrepare = db.prepare.bind(db)
      vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
        if (sql.includes('student') && sql.includes('enrollment')) {
          throw new Error('Simulated DB failure')
        }
        return origPrepare(sql)
      })
      await expect(service.calculatePerformanceImprovements(2026, 2, 1))
        .rejects.toThrow('Failed to calculate improvements: Simulated DB failure')
      vi.restoreAllMocks()
    })
  })
})
