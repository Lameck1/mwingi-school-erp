/**
 * Tests for ReportCardAnalyticsService.
 *
 * Uses in-memory SQLite with minimal schemas for: students, enrollments,
 * report_card, report_card_subject, subjects, exams.
 * Also tests the module-level pure function calculateMedian.
 */
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let testDb: Database.Database
vi.mock('../../../database', () => ({ getDatabase: () => testDb }))

import reportCardAnalyticsService from '../ReportCardAnalyticsService'

/* ── Schema ───────────────────────────────────────────────────────── */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    admission_number TEXT NOT NULL UNIQUE,
    deleted_at DATETIME DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    stream_id INTEGER NOT NULL,
    FOREIGN KEY (student_id) REFERENCES students(id)
  );

  CREATE TABLE IF NOT EXISTS exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    academic_year_id INTEGER NOT NULL,
    term_id INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS report_card (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    exam_id INTEGER NOT NULL,
    stream_id INTEGER NOT NULL,
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (exam_id) REFERENCES exams(id)
  );

  CREATE TABLE IF NOT EXISTS report_card_subject (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_card_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    exam_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    marks REAL,
    grade TEXT,
    FOREIGN KEY (report_card_id) REFERENCES report_card(id),
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
  );

  CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    deleted_at DATETIME DEFAULT NULL
  );
`

/* ── Seed helpers ─────────────────────────────────────────────────── */
function seedStudentWithScores(
  studentId: number,
  firstName: string,
  lastName: string,
  admNo: string,
  streamId: number,
  examId: number,
  scores: Array<{ subjectId: number; marks: number; grade?: string }>
) {
  testDb.prepare(
    'INSERT OR IGNORE INTO students (id, first_name, last_name, admission_number) VALUES (?, ?, ?, ?)'
  ).run(studentId, firstName, lastName, admNo)

  testDb.prepare(
    'INSERT OR IGNORE INTO enrollments (student_id, stream_id) VALUES (?, ?)'
  ).run(studentId, streamId)

  const rc = testDb.prepare(
    'INSERT INTO report_card (student_id, exam_id, stream_id) VALUES (?, ?, ?)'
  ).run(studentId, examId, streamId)
  const rcId = rc.lastInsertRowid

  for (const s of scores) {
    testDb.prepare(
      'INSERT INTO report_card_subject (report_card_id, student_id, exam_id, subject_id, marks, grade) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(rcId, studentId, examId, s.subjectId, s.marks, s.grade ?? null)
  }
}

function seedSubjects(...names: string[]) {
  for (let i = 0; i < names.length; i++) {
    testDb.prepare('INSERT OR IGNORE INTO subjects (id, name) VALUES (?, ?)').run(i + 1, names[i])
  }
}

function seedExam(id: number, name: string, ayId: number, termId: number) {
  testDb.prepare('INSERT OR IGNORE INTO exams (id, name, academic_year_id, term_id) VALUES (?, ?, ?, ?)').run(id, name, ayId, termId)
}

/* ── Setup / teardown ─────────────────────────────────────────────── */
beforeEach(() => {
  testDb = new Database(':memory:')
  testDb.pragma('journal_mode = WAL')
  testDb.exec(SCHEMA)
})

afterEach(() => {
  testDb.close()
})

/* ================================================================== */
/*  calculateMedian (pure function — test via re-import)              */
/* ================================================================== */
describe('calculateMedian()', () => {
  // We need to test the module-level function. It's not exported, but we can
  // test it indirectly through getPerformanceSummary (median_score field).

  it('returns 0 for empty scores (via getPerformanceSummary)', async () => {
    seedExam(1, 'Exam 1', 1, 1)
    const summary = await reportCardAnalyticsService.getPerformanceSummary(1, 1)
    expect(summary.median_score).toBe(0)
  })

  it('returns the single value for one score', async () => {
    seedExam(1, 'Exam 1', 1, 1)
    seedSubjects('Math')
    seedStudentWithScores(1, 'A', 'B', 'ADM001', 1, 1, [{ subjectId: 1, marks: 75 }])

    const summary = await reportCardAnalyticsService.getPerformanceSummary(1, 1)
    expect(summary.median_score).toBe(75)
  })

  it('returns average of two middle values for even count', async () => {
    seedExam(1, 'Exam 1', 1, 1)
    seedSubjects('Math')
    // Two students: scores 60 and 80 → sorted [60,80] → median=(60+80)/2=70
    seedStudentWithScores(1, 'A', 'B', 'ADM001', 1, 1, [{ subjectId: 1, marks: 60 }])
    seedStudentWithScores(2, 'C', 'D', 'ADM002', 1, 1, [{ subjectId: 1, marks: 80 }])

    const summary = await reportCardAnalyticsService.getPerformanceSummary(1, 1)
    expect(summary.median_score).toBe(70)
  })

  it('returns the middle value for odd count', async () => {
    seedExam(1, 'Exam 1', 1, 1)
    seedSubjects('Math')
    seedStudentWithScores(1, 'A', 'B', 'ADM001', 1, 1, [{ subjectId: 1, marks: 50 }])
    seedStudentWithScores(2, 'C', 'D', 'ADM002', 1, 1, [{ subjectId: 1, marks: 70 }])
    seedStudentWithScores(3, 'E', 'F', 'ADM003', 1, 1, [{ subjectId: 1, marks: 90 }])

    const summary = await reportCardAnalyticsService.getPerformanceSummary(1, 1)
    expect(summary.median_score).toBe(70)
  })
})

/* ================================================================== */
/*  getPerformanceSummary()                                            */
/* ================================================================== */
describe('getPerformanceSummary()', () => {
  it('returns zeroed summary when no students are enrolled', async () => {
    seedExam(1, 'Exam 1', 1, 1)
    const summary = await reportCardAnalyticsService.getPerformanceSummary(1, 1)
    expect(summary.total_students).toBe(0)
    expect(summary.mean_score).toBe(0)
    expect(summary.median_score).toBe(0)
    expect(summary.pass_count).toBe(0)
    expect(summary.fail_count).toBe(0)
    expect(summary.pass_rate).toBe(0)
    expect(summary.fail_rate).toBe(0)
    expect(summary.top_performer).toBe('N/A')
    expect(summary.top_performer_score).toBe(0)
  })

  it('calculates correct mean from multiple students', async () => {
    seedExam(1, 'Exam 1', 1, 1)
    seedSubjects('Math', 'English')
    // Student 1: avg = (80+60)/2 = 70
    seedStudentWithScores(1, 'Alice', 'One', 'ADM001', 1, 1, [
      { subjectId: 1, marks: 80 },
      { subjectId: 2, marks: 60 }
    ])
    // Student 2: avg = (40+20)/2 = 30
    seedStudentWithScores(2, 'Bob', 'Two', 'ADM002', 1, 1, [
      { subjectId: 1, marks: 40 },
      { subjectId: 2, marks: 20 }
    ])

    const summary = await reportCardAnalyticsService.getPerformanceSummary(1, 1)
    expect(summary.total_students).toBe(2)
    expect(summary.mean_score).toBe(50) // (70+30)/2
  })

  it('correctly identifies top performer', async () => {
    seedExam(1, 'Exam 1', 1, 1)
    seedSubjects('Math')
    seedStudentWithScores(1, 'Alice', 'A', 'ADM001', 1, 1, [{ subjectId: 1, marks: 90 }])
    seedStudentWithScores(2, 'Bob', 'B', 'ADM002', 1, 1, [{ subjectId: 1, marks: 60 }])

    const summary = await reportCardAnalyticsService.getPerformanceSummary(1, 1)
    expect(summary.top_performer).toBe('Alice A')
    expect(summary.top_performer_score).toBe(90)
  })

  it('calculates pass/fail rates (threshold=40)', async () => {
    seedExam(1, 'Exam 1', 1, 1)
    seedSubjects('Math')
    seedStudentWithScores(1, 'Pass1', 'P', 'ADM001', 1, 1, [{ subjectId: 1, marks: 50 }])
    seedStudentWithScores(2, 'Pass2', 'P', 'ADM002', 1, 1, [{ subjectId: 1, marks: 40 }])
    seedStudentWithScores(3, 'Fail1', 'F', 'ADM003', 1, 1, [{ subjectId: 1, marks: 39 }])
    seedStudentWithScores(4, 'Fail2', 'F', 'ADM004', 1, 1, [{ subjectId: 1, marks: 10 }])

    const summary = await reportCardAnalyticsService.getPerformanceSummary(1, 1)
    expect(summary.pass_count).toBe(2)
    expect(summary.fail_count).toBe(2)
    expect(summary.pass_rate).toBe(50)
    expect(summary.fail_rate).toBe(50)
  })

  it('excludes soft-deleted students', async () => {
    seedExam(1, 'Exam 1', 1, 1)
    seedSubjects('Math')
    seedStudentWithScores(1, 'Active', 'A', 'ADM001', 1, 1, [{ subjectId: 1, marks: 80 }])
    seedStudentWithScores(2, 'Deleted', 'D', 'ADM002', 1, 1, [{ subjectId: 1, marks: 20 }])
    testDb.prepare("UPDATE students SET deleted_at = '2025-01-01' WHERE id = 2").run()

    const summary = await reportCardAnalyticsService.getPerformanceSummary(1, 1)
    expect(summary.total_students).toBe(1)
    expect(summary.top_performer).toBe('Active A')
  })

  it('calculates mode correctly', async () => {
    seedExam(1, 'Exam 1', 1, 1)
    seedSubjects('Math')
    // Three students all scoring 55 (single subject) → mode=55
    seedStudentWithScores(1, 'A', 'A', 'ADM001', 1, 1, [{ subjectId: 1, marks: 55 }])
    seedStudentWithScores(2, 'B', 'B', 'ADM002', 1, 1, [{ subjectId: 1, marks: 55 }])
    seedStudentWithScores(3, 'C', 'C', 'ADM003', 1, 1, [{ subjectId: 1, marks: 70 }])

    const summary = await reportCardAnalyticsService.getPerformanceSummary(1, 1)
    expect(summary.mode_score).toBe(55)
  })
})

/* ================================================================== */
/*  getGradeDistribution()                                             */
/* ================================================================== */
describe('getGradeDistribution()', () => {
  it('returns empty array when no graded entries exist', async () => {
    seedExam(1, 'Exam 1', 1, 1)
    const dist = await reportCardAnalyticsService.getGradeDistribution(1, 1)
    expect(dist).toEqual([])
  })

  it('returns correct grade counts and percentages', async () => {
    seedExam(1, 'Exam 1', 1, 1)
    seedSubjects('Math', 'English')

    seedStudentWithScores(1, 'A', 'A', 'ADM001', 1, 1, [
      { subjectId: 1, marks: 90, grade: 'EE1' },
      { subjectId: 2, marks: 80, grade: 'ME1' }
    ])
    seedStudentWithScores(2, 'B', 'B', 'ADM002', 1, 1, [
      { subjectId: 1, marks: 70, grade: 'ME1' },
      { subjectId: 2, marks: 60, grade: 'AE1' }
    ])

    const dist = await reportCardAnalyticsService.getGradeDistribution(1, 1)
    // EE1: 1, ME1: 2, AE1: 1 = 4 total
    expect(dist.length).toBeGreaterThanOrEqual(3)

    const ee1 = dist.find(d => d.grade === 'EE1')
    expect(ee1).toBeDefined()
    expect(ee1!.count).toBe(1)
    expect(ee1!.percentage).toBe(25) // 1/4 * 100

    const me1 = dist.find(d => d.grade === 'ME1')
    expect(me1).toBeDefined()
    expect(me1!.count).toBe(2)
    expect(me1!.percentage).toBe(50) // 2/4 * 100
  })

  it('excludes entries with NULL grade', async () => {
    seedExam(1, 'Exam 1', 1, 1)
    seedSubjects('Math')

    seedStudentWithScores(1, 'A', 'A', 'ADM001', 1, 1, [
      { subjectId: 1, marks: 90, grade: 'EE1' }
    ])
    // Add a null grade entry directly
    testDb.prepare(`
      INSERT INTO report_card (student_id, exam_id, stream_id) VALUES (1, 1, 1)
    `).run()
    const rcId = testDb.prepare('SELECT MAX(id) as id FROM report_card').get() as { id: number }
    testDb.prepare(`
      INSERT INTO report_card_subject (report_card_id, student_id, exam_id, subject_id, marks, grade)
      VALUES (?, 1, 1, 1, 50, NULL)
    `).run(rcId.id)

    const dist = await reportCardAnalyticsService.getGradeDistribution(1, 1)
    const total = dist.reduce((s, d) => s + d.count, 0)
    expect(total).toBe(1) // only the EE1 entry
  })
})

/* ================================================================== */
/*  getSubjectPerformance()                                            */
/* ================================================================== */
describe('getSubjectPerformance()', () => {
  it('returns empty when no subjects exist', async () => {
    seedExam(1, 'Exam 1', 1, 1)
    const perf = await reportCardAnalyticsService.getSubjectPerformance(1, 1)
    expect(perf).toEqual([])
  })

  it('returns empty for subjects with no scores', async () => {
    seedExam(1, 'Exam 1', 1, 1)
    seedSubjects('Math')
    // No report_card_subject entries

    const perf = await reportCardAnalyticsService.getSubjectPerformance(1, 1)
    expect(perf).toEqual([])
  })

  it('calculates mean, pass rate, difficulty and discrimination indices', async () => {
    seedExam(1, 'Exam 1', 1, 1)
    seedSubjects('Math')

    // 4 students: scores 90, 70, 50, 30
    seedStudentWithScores(1, 'A', 'A', 'ADM001', 1, 1, [{ subjectId: 1, marks: 90 }])
    seedStudentWithScores(2, 'B', 'B', 'ADM002', 1, 1, [{ subjectId: 1, marks: 70 }])
    seedStudentWithScores(3, 'C', 'C', 'ADM003', 1, 1, [{ subjectId: 1, marks: 50 }])
    seedStudentWithScores(4, 'D', 'D', 'ADM004', 1, 1, [{ subjectId: 1, marks: 30 }])

    const perf = await reportCardAnalyticsService.getSubjectPerformance(1, 1)
    expect(perf).toHaveLength(1)

    const math = perf[0]
    expect(math.subject_name).toBe('Math')
    expect(math.mean_score).toBe(60) // (90+70+50+30)/4
    expect(math.pass_rate).toBe(75) // 3 of 4 >= 40
    expect(math.difficulty_index).toBe(40) // 100 - 60
    // discrimination_index: topCount = ceil(4*0.27) = 2
    // top 2 sorted desc: [90,70] → mean=80, bottom 2: [50,30] → mean=40
    // discrimination = 80 - 40 = 40
    expect(math.discrimination_index).toBe(40)
  })

  it('sorts subjects by descending mean score', async () => {
    seedExam(1, 'Exam 1', 1, 1)
    seedSubjects('Math', 'English')

    seedStudentWithScores(1, 'A', 'A', 'ADM001', 1, 1, [
      { subjectId: 1, marks: 50 },
      { subjectId: 2, marks: 80 }
    ])

    const perf = await reportCardAnalyticsService.getSubjectPerformance(1, 1)
    expect(perf).toHaveLength(2)
    expect(perf[0].subject_name).toBe('English')
    expect(perf[1].subject_name).toBe('Math')
  })

  it('excludes soft-deleted subjects', async () => {
    seedExam(1, 'Exam 1', 1, 1)
    seedSubjects('Math', 'Deleted')
    testDb.prepare("UPDATE subjects SET deleted_at = '2025-01-01' WHERE name = 'Deleted'").run()

    seedStudentWithScores(1, 'A', 'A', 'ADM001', 1, 1, [
      { subjectId: 1, marks: 80 },
      { subjectId: 2, marks: 50 } // this subject is soft-deleted, but report_card_subject still has it
    ])

    const perf = await reportCardAnalyticsService.getSubjectPerformance(1, 1)
    // Only Math should show (Deleted subject is filtered out from subjects query)
    expect(perf).toHaveLength(1)
    expect(perf[0].subject_name).toBe('Math')
  })
})

/* ================================================================== */
/*  getStrugglingStu()                                                 */
/* ================================================================== */
describe('getStrugglingStu()', () => {
  it('returns empty when no students are below threshold', async () => {
    seedExam(1, 'Exam 1', 1, 1)
    seedSubjects('Math')
    seedStudentWithScores(1, 'A', 'A', 'ADM001', 1, 1, [{ subjectId: 1, marks: 80 }])

    const result = await reportCardAnalyticsService.getStrugglingStu(1, 1, 50)
    expect(result).toEqual([])
  })

  it('returns students below the default threshold of 50', async () => {
    seedExam(1, 'Exam 1', 1, 1)
    seedSubjects('Math')
    seedStudentWithScores(1, 'Low', 'Score', 'ADM001', 1, 1, [{ subjectId: 1, marks: 30 }])
    seedStudentWithScores(2, 'High', 'Score', 'ADM002', 1, 1, [{ subjectId: 1, marks: 60 }])

    const result = await reportCardAnalyticsService.getStrugglingStu(1, 1)
    expect(result).toHaveLength(1)
    expect(result[0].student_name).toBe('Low Score')
    expect(result[0].needs_intervention).toBe(true)
  })

  it('uses custom threshold', async () => {
    seedExam(1, 'Exam 1', 1, 1)
    seedSubjects('Math')
    seedStudentWithScores(1, 'A', 'A', 'ADM001', 1, 1, [{ subjectId: 1, marks: 60 }])
    seedStudentWithScores(2, 'B', 'B', 'ADM002', 1, 1, [{ subjectId: 1, marks: 80 }])

    const result = await reportCardAnalyticsService.getStrugglingStu(1, 1, 70)
    expect(result).toHaveLength(1)
    expect(result[0].student_name).toBe('A A')
  })

  it('assigns "Intensive intervention required" for score < 20', async () => {
    seedExam(1, 'Exam 1', 1, 1)
    seedSubjects('Math')
    seedStudentWithScores(1, 'V', 'Low', 'ADM001', 1, 1, [{ subjectId: 1, marks: 10 }])

    const result = await reportCardAnalyticsService.getStrugglingStu(1, 1)
    expect(result[0].recommended_action).toBe('Intensive intervention required')
  })

  it('assigns "Structured remedial classes" for score 20-34', async () => {
    seedExam(1, 'Exam 1', 1, 1)
    seedSubjects('Math')
    seedStudentWithScores(1, 'M', 'Low', 'ADM001', 1, 1, [{ subjectId: 1, marks: 25 }])

    const result = await reportCardAnalyticsService.getStrugglingStu(1, 1)
    expect(result[0].recommended_action).toBe('Structured remedial classes')
  })

  it('assigns "Regular extra coaching" for score 35-49', async () => {
    seedExam(1, 'Exam 1', 1, 1)
    seedSubjects('Math')
    seedStudentWithScores(1, 'S', 'Low', 'ADM001', 1, 1, [{ subjectId: 1, marks: 42 }])

    const result = await reportCardAnalyticsService.getStrugglingStu(1, 1)
    expect(result[0].recommended_action).toBe('Regular extra coaching')
  })

  it('orders by ascending average_score', async () => {
    seedExam(1, 'Exam 1', 1, 1)
    seedSubjects('Math')
    seedStudentWithScores(1, 'Mid', 'S', 'ADM001', 1, 1, [{ subjectId: 1, marks: 35 }])
    seedStudentWithScores(2, 'Low', 'S', 'ADM002', 1, 1, [{ subjectId: 1, marks: 15 }])
    seedStudentWithScores(3, 'Med', 'S', 'ADM003', 1, 1, [{ subjectId: 1, marks: 45 }])

    const result = await reportCardAnalyticsService.getStrugglingStu(1, 1)
    expect(result[0].average_score).toBe(15)
    expect(result[1].average_score).toBe(35)
    expect(result[2].average_score).toBe(45)
  })
})

/* ================================================================== */
/*  getTermComparison()                                                */
/* ================================================================== */
describe('getTermComparison()', () => {
  it('returns empty when exam not found', async () => {
    const result = await reportCardAnalyticsService.getTermComparison(999, 1)
    expect(result).toEqual([])
  })

  it('returns current exam comparison with improvement=0', async () => {
    seedExam(1, 'Mid Term', 1, 1)
    seedSubjects('Math')
    seedStudentWithScores(1, 'A', 'A', 'ADM001', 1, 1, [{ subjectId: 1, marks: 70 }])

    const result = await reportCardAnalyticsService.getTermComparison(1, 1)
    expect(result).toHaveLength(1)
    expect(result[0].term_name).toContain('Current')
    expect(result[0].improvement).toBe(0)
  })

  it('includes previous exams and calculates improvement', async () => {
    // Current exam: year=2, term=2
    seedExam(3, 'Current Exam', 2, 2)
    // Previous exams
    seedExam(2, 'Prev Exam 1', 2, 1)
    seedExam(1, 'Prev Exam 2', 1, 3)

    seedSubjects('Math')

    // Stream 1 scores for each exam
    seedStudentWithScores(1, 'A', 'A', 'ADM001', 1, 3, [{ subjectId: 1, marks: 80 }])
    seedStudentWithScores(1, 'A', 'A', 'ADM001', 1, 2, [{ subjectId: 1, marks: 60 }])
    seedStudentWithScores(1, 'A', 'A', 'ADM001', 1, 1, [{ subjectId: 1, marks: 50 }])

    const result = await reportCardAnalyticsService.getTermComparison(3, 1)
    expect(result.length).toBeGreaterThanOrEqual(2) // current + at least 1 previous
    expect(result[0].term_name).toContain('Current')
  })
})

/* ================================================================== */
/*  Branch coverage: term comparison with previous mean_score = 0      */
/* ================================================================== */
describe('getTermComparison() – previous exam with mean_score = 0', () => {
  it('sets improvement to 0 when previous exam mean_score is 0', async () => {
    // Current exam (year=2, term=2) with scores
    seedExam(10, 'Current Term', 2, 2)
    // Previous exam (year=2, term=1) with NO scores → mean=0
    seedExam(9, 'Prev Term', 2, 1)

    seedSubjects('Math')
    // Only seed scores for the current exam, not the previous
    seedStudentWithScores(1, 'A', 'A', 'ADM001', 1, 10, [{ subjectId: 1, marks: 70 }])

    const result = await reportCardAnalyticsService.getTermComparison(10, 1)
    expect(result.length).toBeGreaterThanOrEqual(2)
    // The previous exam entry should have improvement = 0 (mean_score = 0 path)
    const prevEntry = result.find(r => r.term_name === 'Prev Term')
    expect(prevEntry).toBeDefined()
    expect(prevEntry!.improvement).toBe(0)
  })
})

/* ================================================================== */
/*  Branch coverage: getErrorMessage with non-Error value              */
/* ================================================================== */
describe('getErrorMessage – non-Error thrown value', () => {
  it('uses UNKNOWN_ERROR when a non-Error is thrown (via getTermComparison)', async () => {
    // Force getPerformanceSummary to throw a non-Error by breaking the DB
    // First set up a valid exam so we get past the initial query
    seedExam(1, 'Test', 1, 1)
    seedSubjects('Math')
    seedStudentWithScores(1, 'A', 'A', 'ADM001', 1, 1, [{ subjectId: 1, marks: 70 }])

    // Now break the DB in a way that causes a non-Error throw
    const origPrepare = testDb.prepare.bind(testDb)
    let callCount = 0
    vi.spyOn(testDb, 'prepare').mockImplementation((sql: string) => {
      callCount++
      // Let the first prepare (exam lookup) succeed, then throw a string on the second
      if (callCount <= 1) { return origPrepare(sql) }
      throw 'non-error-string' // NOSONAR
    })

    await expect(reportCardAnalyticsService.getTermComparison(1, 1))
      .rejects.toThrow('Unknown error')
  })
})

/* ================================================================== */
/*  Error handling                                                     */
/* ================================================================== */
describe('error handling', () => {
  it('getPerformanceSummary wraps DB errors', async () => {
    testDb.close() // force DB error
    testDb = new Database(':memory:') // re-assign so afterEach close works
    // The closed db in the mock will throw
    // Re-create to not break afterEach, but the original mock still points to closed
    // Actually this is tricky — let's break the DB differently
    const brokenDb = new Database(':memory:')
    brokenDb.close()
    const originalDb = testDb
    testDb = brokenDb as unknown as Database.Database

    await expect(reportCardAnalyticsService.getPerformanceSummary(1, 1)).rejects.toThrow('Failed to get performance summary')

    testDb = originalDb
  })

  it('getGradeDistribution wraps DB errors', async () => {
    const originalDb = testDb
    const brokenDb = new Database(':memory:')
    brokenDb.close()
    testDb = brokenDb as unknown as Database.Database

    await expect(reportCardAnalyticsService.getGradeDistribution(1, 1)).rejects.toThrow('Failed to get grade distribution')

    testDb = originalDb
  })

  it('getSubjectPerformance wraps DB errors', async () => {
    const originalDb = testDb
    const brokenDb = new Database(':memory:')
    brokenDb.close()
    testDb = brokenDb as unknown as Database.Database

    await expect(reportCardAnalyticsService.getSubjectPerformance(1, 1)).rejects.toThrow('Failed to get subject performance')

    testDb = originalDb
  })

  it('getStrugglingStu wraps DB errors', async () => {
    const originalDb = testDb
    const brokenDb = new Database(':memory:')
    brokenDb.close()
    testDb = brokenDb as unknown as Database.Database

    await expect(reportCardAnalyticsService.getStrugglingStu(1, 1)).rejects.toThrow('Failed to get struggling students')

    testDb = originalDb
  })

  it('getTermComparison wraps DB errors', async () => {
    const originalDb = testDb
    const brokenDb = new Database(':memory:')
    brokenDb.close()
    testDb = brokenDb as unknown as Database.Database

    await expect(reportCardAnalyticsService.getTermComparison(1, 1)).rejects.toThrow('Failed to get term comparison')

    testDb = originalDb
  })
})
