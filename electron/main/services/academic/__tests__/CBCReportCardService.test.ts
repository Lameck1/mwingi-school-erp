import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db
}))

import { CBCReportCardService } from '../CBCReportCardService'

interface FeesBalanceAccessor {
  getFeesBalance(studentId: number): number
}

describe('CBCReportCardService fee balance normalization', () => {
  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY,
        student_id INTEGER NOT NULL,
        total_amount REAL,
        amount_due REAL,
        amount REAL,
        amount_paid REAL,
        status TEXT
      );
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('uses normalized invoice amount and excludes cancelled invoices', () => {
    db.exec(`
      INSERT INTO fee_invoice (id, student_id, total_amount, amount_due, amount, amount_paid, status)
      VALUES
        (1, 10, 0, 17000, 17000, 0, 'pending'),
        (2, 10, 7000, 7000, 7000, 8500, 'PARTIAL'),
        (3, 10, 9000, 9000, 9000, 0, 'cancelled');
    `)

    const service = new CBCReportCardService()
    const balance = (service as unknown as FeesBalanceAccessor).getFeesBalance(10)

    expect(balance).toBe(15500)
  })

  it('falls back to legacy amount column when newer amount columns are empty', () => {
    db.exec(`
      INSERT INTO fee_invoice (id, student_id, total_amount, amount_due, amount, amount_paid, status)
      VALUES
        (4, 22, NULL, NULL, 12000, 2000, 'OUTSTANDING');
    `)

    const service = new CBCReportCardService()
    const balance = (service as unknown as FeesBalanceAccessor).getFeesBalance(22)

    expect(balance).toBe(10000)
  })
})

describe('CBCReportCardService report card correctness', () => {
  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE subject_allocation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject_id INTEGER NOT NULL,
        teacher_id INTEGER NOT NULL,
        stream_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        is_active BOOLEAN DEFAULT 1
      );

      CREATE TABLE exam (
        id INTEGER PRIMARY KEY,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        exam_name TEXT
      );

      CREATE TABLE student (
        id INTEGER PRIMARY KEY,
        admission_number TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        student_type TEXT,
        is_active INTEGER DEFAULT 1
      );

      CREATE TABLE enrollment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        stream_id INTEGER NOT NULL,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        enrollment_date TEXT NOT NULL
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
        score REAL NOT NULL,
        teacher_remarks TEXT
      );

      CREATE TABLE attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        status TEXT NOT NULL
      );

      CREATE TABLE stream (
        id INTEGER PRIMARY KEY,
        stream_name TEXT NOT NULL
      );

      CREATE TABLE academic_year (
        id INTEGER PRIMARY KEY,
        year_name TEXT NOT NULL
      );

      CREATE TABLE term (
        id INTEGER PRIMARY KEY,
        academic_year_id INTEGER NOT NULL,
        term_name TEXT NOT NULL,
        term_number INTEGER NOT NULL,
        start_date TEXT
      );

      CREATE TABLE report_card (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        stream_id INTEGER NOT NULL,
        generated_by_user_id INTEGER NOT NULL,
        overall_grade TEXT,
        total_marks REAL,
        average_marks REAL,
        position_in_class INTEGER,
        position_in_stream INTEGER,
        class_teacher_remarks TEXT,
        principal_remarks TEXT,
        attendance_days_present INTEGER,
        attendance_days_absent INTEGER,
        attendance_percentage REAL,
        qr_code_token TEXT,
        generated_at TEXT
      );

      CREATE TABLE report_card_subject (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_card_id INTEGER NOT NULL,
        subject_id INTEGER NOT NULL,
        marks REAL,
        grade TEXT,
        percentage REAL,
        teacher_comment TEXT,
        competency_level TEXT
      );

      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY,
        student_id INTEGER NOT NULL,
        total_amount REAL,
        amount_due REAL,
        amount REAL,
        amount_paid REAL,
        status TEXT
      );

      INSERT INTO exam (id, academic_year_id, term_id) VALUES (1, 2026, 1);
      INSERT INTO academic_year (id, year_name) VALUES (2026, '2026');
      INSERT INTO term (id, academic_year_id, term_name, term_number, start_date) VALUES (1, 2026, 'Term 1', 1, '2026-01-10');
      INSERT INTO stream (id, stream_name) VALUES (1, 'Grade 7A');

      INSERT INTO student (id, admission_number, first_name, last_name, student_type, is_active)
      VALUES
        (1, 'ADM/1', 'Grace', 'Mutua', 'DAY_SCHOLAR', 1),
        (2, 'ADM/2', 'Sarah', 'Ochieng', 'DAY_SCHOLAR', 1),
        (3, 'ADM/3', 'John', 'Kamau', 'DAY_SCHOLAR', 1);

      INSERT INTO enrollment (student_id, stream_id, academic_year_id, term_id, status, enrollment_date)
      VALUES
        (1, 1, 2026, 1, 'ACTIVE', '2026-01-12'),
        (2, 1, 2026, 1, 'ACTIVE', '2026-01-12'),
        (3, 1, 2026, 1, 'ACTIVE', '2026-01-12');

      INSERT INTO subject (id, name) VALUES (10, 'Mathematics'), (11, 'English');
      INSERT INTO subject_allocation (subject_id, teacher_id, stream_id, term_id) VALUES (10, 1, 1, 1), (11, 1, 1, 1);

      INSERT INTO exam_result (exam_id, student_id, subject_id, score, teacher_remarks)
      VALUES
        (1, 1, 10, 90, 'Great'),
        (1, 1, 11, 90, 'Great'),
        (1, 2, 10, 80, 'Good'),
        (1, 2, 11, 80, 'Good'),
        (1, 3, 10, 70, 'Fair'),
        (1, 3, 11, 70, 'Fair');

      INSERT INTO fee_invoice (id, student_id, total_amount, amount_due, amount, amount_paid, status)
      VALUES (5, 2, 10000, 10000, 10000, 2000, 'PENDING');
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('calculates class position as one-based ranking', async () => {
    const service = new CBCReportCardService()
    const report = await service.generateReportCard(2, 1, 99)

    expect(report.position_in_class).toBe(2)
    expect(report.position_in_stream).toBe(2)
  })

  it('returns stored report card with subject names and current fee balance', async () => {
    const service = new CBCReportCardService()
    await service.generateReportCard(2, 1, 99)

    const report = await service.getReportCard(1, 2)
    expect(report).not.toBeNull()
    expect(report?.subjects.map((subject) => subject.subject_name)).toContain('Mathematics')
    expect(report?.fees_balance).toBe(8000)
  })
})

describe('CBCReportCardService extended coverage', () => {
  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE subject_allocation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject_id INTEGER NOT NULL,
        teacher_id INTEGER NOT NULL,
        stream_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        is_active BOOLEAN DEFAULT 1
      );
      CREATE TABLE exam (
        id INTEGER PRIMARY KEY,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        exam_name TEXT
      );
      CREATE TABLE student (
        id INTEGER PRIMARY KEY,
        admission_number TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        student_type TEXT,
        is_active INTEGER DEFAULT 1
      );
      CREATE TABLE enrollment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        stream_id INTEGER NOT NULL,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        enrollment_date TEXT NOT NULL
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
        score REAL NOT NULL,
        teacher_remarks TEXT
      );
      CREATE TABLE attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        status TEXT NOT NULL
      );
      CREATE TABLE stream (
        id INTEGER PRIMARY KEY,
        stream_name TEXT NOT NULL
      );
      CREATE TABLE academic_year (
        id INTEGER PRIMARY KEY,
        year_name TEXT NOT NULL
      );
      CREATE TABLE term (
        id INTEGER PRIMARY KEY,
        academic_year_id INTEGER NOT NULL,
        term_name TEXT NOT NULL,
        term_number INTEGER NOT NULL,
        start_date TEXT
      );
      CREATE TABLE report_card (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        stream_id INTEGER NOT NULL,
        generated_by_user_id INTEGER NOT NULL,
        overall_grade TEXT,
        total_marks REAL,
        average_marks REAL,
        position_in_class INTEGER,
        position_in_stream INTEGER,
        class_teacher_remarks TEXT,
        principal_remarks TEXT,
        attendance_days_present INTEGER,
        attendance_days_absent INTEGER,
        attendance_percentage REAL,
        qr_code_token TEXT,
        generated_at TEXT,
        email_sent_at TEXT
      );
      CREATE TABLE report_card_subject (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_card_id INTEGER NOT NULL,
        subject_id INTEGER NOT NULL,
        marks REAL,
        grade TEXT,
        percentage REAL,
        teacher_comment TEXT,
        competency_level TEXT
      );
      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY,
        student_id INTEGER NOT NULL,
        total_amount REAL,
        amount_due REAL,
        amount REAL,
        amount_paid REAL,
        status TEXT
      );

      INSERT INTO academic_year (id, year_name) VALUES (2026, '2026'), (2027, '2027');
      INSERT INTO term (id, academic_year_id, term_name, term_number, start_date)
        VALUES (1, 2026, 'Term 1', 1, '2026-01-10'),
               (2, 2026, 'Term 2', 2, '2026-05-01'),
               (3, 2027, 'Term 1', 1, '2027-01-10');
      INSERT INTO stream (id, stream_name) VALUES (1, 'Grade 7A');
      INSERT INTO exam (id, academic_year_id, term_id) VALUES (1, 2026, 1);

      INSERT INTO student (id, admission_number, first_name, last_name, student_type, is_active)
        VALUES (1, 'ADM/1', 'Grace', 'Mutua', 'DAY_SCHOLAR', 1),
               (2, 'ADM/2', 'Sarah', 'Ochieng', 'DAY_SCHOLAR', 1),
               (5, 'ADM/5', 'No', 'Stream', 'DAY_SCHOLAR', 1);

      INSERT INTO enrollment (student_id, stream_id, academic_year_id, term_id, status, enrollment_date)
        VALUES (1, 1, 2026, 1, 'ACTIVE', '2026-01-12'),
               (2, 1, 2026, 1, 'ACTIVE', '2026-01-12');

      INSERT INTO subject (id, name) VALUES (10, 'Mathematics'), (11, 'English');
      INSERT INTO subject_allocation (subject_id, teacher_id, stream_id, term_id) VALUES (10, 1, 1, 1), (11, 1, 1, 1);

      INSERT INTO exam_result (exam_id, student_id, subject_id, score, teacher_remarks)
        VALUES (1, 1, 10, 95, 'Excellent'),
               (1, 1, 11, 88, 'Great'),
               (1, 2, 10, 45, 'Fair'),
               (1, 2, 11, 38, 'Needs improvement');

      INSERT INTO attendance (student_id, academic_year_id, term_id, status)
        VALUES (1, 2026, 1, 'PRESENT'),
               (1, 2026, 1, 'PRESENT'),
               (1, 2026, 1, 'ABSENT'),
               (2, 2026, 1, 'ABSENT');
    `)
  })

  afterEach(() => { db.close() })

  it('getReportCard returns null when no report card exists', async () => {
    const service = new CBCReportCardService()
    const report = await service.getReportCard(999, 999)
    expect(report).toBeNull()
  })

  it('generateReportCard throws when exam not found', async () => {
    const service = new CBCReportCardService()
    await expect(service.generateReportCard(1, 999, 99)).rejects.toThrow('Exam not found')
  })

  it('generateReportCard throws when student not enrolled', async () => {
    const service = new CBCReportCardService()
    await expect(service.generateReportCard(999, 1, 99)).rejects.toThrow('Student not found or not enrolled')
  })

  it('generateReportCard throws when student not enrolled for exam term', async () => {
    // Student 5 exists but has no enrollment for exam 1's term
    const service = new CBCReportCardService()
    await expect(service.generateReportCard(5, 1, 99)).rejects.toThrow('Student not found or not enrolled')
  })

  it('generateReportCard includes attendance metrics', async () => {
    const service = new CBCReportCardService()
    const report = await service.generateReportCard(1, 1, 99)
    expect(report.days_present).toBe(2)
    expect(report.days_absent).toBe(1)
    expect(report.attendance_percentage).toBeCloseTo(66.67, 0)
  })

  it('getNextTermDate returns next term in same academic year', async () => {
    const service = new CBCReportCardService()
    const report = await service.generateReportCard(1, 1, 99)
    // Term 1 -> Term 2 in same year
    expect(report.next_term_begin_date).toBe('2026-05-01')
  })

  it('getNextTermDate returns first term of next academic year when no next term in current year', async () => {
    // Use term 2 (last in 2026 year)
    db.prepare(`INSERT INTO exam (id, academic_year_id, term_id) VALUES (2, 2026, 2)`).run()
    db.prepare(`INSERT INTO enrollment (student_id, stream_id, academic_year_id, term_id, status, enrollment_date) VALUES (1, 1, 2026, 2, 'ACTIVE', '2026-05-01')`).run()
    db.prepare(`INSERT INTO subject_allocation (subject_id, teacher_id, stream_id, term_id) VALUES (10, 1, 1, 2), (11, 1, 1, 2)`).run()
    db.prepare(`INSERT INTO exam_result (exam_id, student_id, subject_id, score) VALUES (2, 1, 10, 90), (2, 1, 11, 85)`).run()

    const service = new CBCReportCardService()
    const report = await service.generateReportCard(1, 2, 99)
    expect(report.next_term_begin_date).toBe('2027-01-10')
  })

  it('getNextTermDate returns empty when current term not found', async () => {
    // Delete term record
    db.prepare('DELETE FROM term WHERE id = 1').run()
    const service = new CBCReportCardService()
    const report = await service.generateReportCard(1, 1, 99)
    expect(report.next_term_begin_date).toBe('')
  })

  it('grade mapping covers all CBC grade levels', () => {
    const service = new CBCReportCardService() as any
    expect(service.getGrade(95)).toBe('EE1')
    expect(service.getGrade(80)).toBe('EE2')
    expect(service.getGrade(60)).toBe('ME1')
    expect(service.getGrade(50)).toBe('ME2')
    expect(service.getGrade(35)).toBe('AE1')
    expect(service.getGrade(25)).toBe('AE2')
    expect(service.getGrade(15)).toBe('BE1')
    expect(service.getGrade(5)).toBe('BE2')
  })

  it('points mapping returns correct values', () => {
    const service = new CBCReportCardService() as any
    expect(service.getPoints('EE1')).toBe(4)
    expect(service.getPoints('ME1')).toBe(3)
    expect(service.getPoints('AE1')).toBe(2)
    expect(service.getPoints('BE1')).toBe(1)
    expect(service.getPoints('UNKNOWN')).toBe(0)
  })

  it('generateBatchReportCards generates for multiple students', async () => {
    const service = new CBCReportCardService()
    const result = await service.generateBatchReportCards(1, 1, 99)
    expect(result.total).toBe(2)
    expect(result.generated.length).toBe(2)
    expect(result.failed).toBe(0)
  })

  it('generateBatchReportCards handles individual failures gracefully', async () => {
    // Remove exam results for student 2 so their generation fails
    db.prepare('DELETE FROM exam_result WHERE student_id = 2').run()
    const service = new CBCReportCardService()
    const result = await service.generateBatchReportCards(1, 1, 99)
    expect(result.total).toBe(2)
    expect(result.generated.length).toBe(1)
    expect(result.failed).toBe(1)
    expect(result.failures[0].student_id).toBe(2)
  })

  it('generateBatchReportCards throws when exam not found', async () => {
    const service = new CBCReportCardService()
    await expect(service.generateBatchReportCards(999, 1, 99)).rejects.toThrow('Exam not found')
  })

  it('getReportCard returns stored report with email_sent_at if present', async () => {
    const service = new CBCReportCardService()
    await service.generateReportCard(1, 1, 99)
    db.prepare(`UPDATE report_card SET email_sent_at = '2026-01-20T10:00:00.000Z' WHERE exam_id = 1 AND student_id = 1`).run()

    const report = await service.getReportCard(1, 1)
    expect(report).not.toBeNull()
    expect(report?.email_sent_at).toBe('2026-01-20T10:00:00.000Z')
  })

  it('classPosition returns 1 when student has no finite average', async () => {
    const service = new CBCReportCardService() as any
    const exam = { academic_year_id: 2026, term_id: 1 }
    // Student with no exam results
    db.prepare("INSERT INTO student (id, admission_number, first_name, last_name, is_active) VALUES (99, 'ADM/99', 'Z', 'Z', 1)").run()
    db.prepare(`INSERT INTO enrollment (student_id, stream_id, academic_year_id, term_id, status, enrollment_date) VALUES (99, 1, 2026, 1, 'ACTIVE', '2026-01-12')`).run()
    const position = service.getClassPosition(exam, 1, 99, 1)
    expect(position).toBe(1)
  })

  // ─── Additional branch coverage ────────────────────────────────────

  it('resolveSubjectNameColumn throws when subject table has neither name nor subject_name', () => {
    // Drop the subject table and recreate with unrelated columns
    db.exec('DROP TABLE IF EXISTS subject')
    db.exec('CREATE TABLE subject (id INTEGER PRIMARY KEY, code TEXT NOT NULL)')
    const service = new CBCReportCardService() as any
    expect(() => service.resolveSubjectNameColumn()).toThrow('Subject schema mismatch')
  })

  it('resolveSubjectNameColumn detects subject_name column', () => {
    // Drop and recreate subject table with subject_name instead of name
    db.exec('DROP TABLE IF EXISTS subject')
    db.exec('CREATE TABLE subject (id INTEGER PRIMARY KEY, subject_name TEXT NOT NULL)')
    db.prepare("INSERT INTO subject (id, subject_name) VALUES (10, 'Maths'), (11, 'English')").run()
    const service = new CBCReportCardService() as any
    const col = service.resolveSubjectNameColumn()
    expect(col).toBe('subject_name')
  })

  it('resolveSubjectNameColumn uses cache on second call', () => {
    const service = new CBCReportCardService() as any
    const col1 = service.resolveSubjectNameColumn()
    const col2 = service.resolveSubjectNameColumn()
    expect(col1).toBe(col2)
  })

  it('getReportCard returns null for non-existent report', async () => {
    const service = new CBCReportCardService()
    const report = await service.getReportCard(999, 999)
    expect(report).toBeNull()
  })

  it('generateReportCard maps subject with null subject_name to Unknown', async () => {
    // Generate, then remove subject entry to make the LEFT JOIN return null
    const service = new CBCReportCardService()
    await service.generateReportCard(1, 1, 99)
    db.exec('DELETE FROM subject WHERE id = 10')
    const report = await service.getReportCard(1, 1)
    expect(report).not.toBeNull()
    const subjectNames = report!.subjects.map(s => s.subject_name)
    expect(subjectNames).toContain('Unknown')
  })

  it('generateReportCard throws when student stream_id is null', async () => {
    // Recreate enrollment table without NOT NULL on stream_id so we can insert NULL
    db.exec(`DROP TABLE IF EXISTS enrollment`)
    db.exec(`CREATE TABLE enrollment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      stream_id INTEGER,
      academic_year_id INTEGER NOT NULL,
      term_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      enrollment_date TEXT NOT NULL
    )`)
    db.exec(`INSERT INTO enrollment (student_id, stream_id, academic_year_id, term_id, status, enrollment_date)
      VALUES (5, NULL, 2026, 1, 'ACTIVE', '2026-01-12')`)
    const service = new CBCReportCardService()
    await expect(service.generateReportCard(5, 1, 99)).rejects.toThrow('Student stream is missing')
  })

  it('getAttendanceMetrics returns 0% when no attendance records exist', async () => {
    // Student 2 has only ABSENT attendance; student 1 has mixed.
    // Remove all attendance for student 1 to test totalDays=0
    db.exec('DELETE FROM attendance WHERE student_id = 1')
    const service = new CBCReportCardService()
    const report = await service.generateReportCard(1, 1, 99)
    expect(report.attendance_percentage).toBe(0)
    expect(report.days_present).toBe(0)
    expect(report.days_absent).toBe(0)
  })

  it('getNextTermDate returns empty when no next academic year exists', async () => {
    // Delete all other terms/years so there's no next term
    db.exec('DELETE FROM term WHERE id != 1')
    db.exec('DELETE FROM academic_year WHERE id != 2026')
    const service = new CBCReportCardService()
    // Term 1 is last term, and no next academic year
    const report = await service.generateReportCard(1, 1, 99)
    expect(report.next_term_begin_date).toBe('')
  })

  it('buildReportCardFromRecord returns Unknown student when student is deleted', async () => {
    const service = new CBCReportCardService()
    await service.generateReportCard(1, 1, 99)
    // Delete the student record after generating the report card
    db.exec('DELETE FROM student WHERE id = 1')
    const report = await service.getReportCard(1, 1)
    expect(report).not.toBeNull()
    expect(report!.student_name).toBe('Unknown')
    expect(report!.admission_number).toBe('')
  })

  // ── Branch coverage: zero subjects → average_points = 0 ───
  it('buildReportCardFromRecord returns average_points 0 when no subjects exist', async () => {
    const service = new CBCReportCardService()
    await service.generateReportCard(1, 1, 99)
    // Remove all report card subjects to hit subjects.length === 0
    db.exec('DELETE FROM report_card_subject')
    const report = await service.getReportCard(1, 1)
    expect(report).not.toBeNull()
    expect(report!.subjects).toHaveLength(0)
    expect(report!.average_points).toBe(0)
    expect(report!.total_points).toBe(0)
  })

  // ── Branch coverage: mapStoredReportCardSubjects rethrows non-column errors ───
  it('getReportCard rethrows DB errors that are not "no such column"', async () => {
    const service = new CBCReportCardService()
    await service.generateReportCard(1, 1, 99)
    // Corrupt the report_card_subject table to trigger an error that is NOT "no such column"
    db.exec('DROP TABLE report_card_subject')
    db.exec('CREATE TABLE report_card_subject (id INTEGER PRIMARY KEY)') // missing required columns
    await expect(service.getReportCard(1, 1)).rejects.toThrow()
  })

  // ── Branch coverage: mapStoredReportCardSubjects cache invalidation on column miss ───
  it('mapStoredReportCardSubjects recovers when cached column name is stale', async () => {
    const service = new CBCReportCardService()
    await service.generateReportCard(1, 1, 99)
    // Force cache to 'name', then recreate subject table with 'subject_name' column
    ;(service as any).subjectNameColumnCache = 'name'
    db.exec('DROP TABLE IF EXISTS subject')
    db.exec('CREATE TABLE subject (id INTEGER PRIMARY KEY, subject_name TEXT NOT NULL)')
    db.exec("INSERT INTO subject (id, subject_name) VALUES (10, 'Mathematics'), (11, 'English')")
    const report = await service.getReportCard(1, 1)
    expect(report).not.toBeNull()
    // Should have recovered by re-resolving the column
    expect(report!.subjects.length).toBeGreaterThan(0)
    expect(report!.subjects[0].subject_name).not.toBe('Unknown')
  })

  // ── Branch coverage: non-Error catch in generateReportCard ───────
  it('generateReportCard wraps non-Error throws with String(error)', async () => {
    const service = new CBCReportCardService()
    // Spy on db.prepare to throw a non-Error value when the exam query runs
    const origPrepare = db.prepare.bind(db)
    let callCount = 0
    vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      callCount++
      // The first prepare call in generateReportCard is getExamOrThrow
      if (callCount === 1) {
        throw 42 // NOSONAR
      }
      return origPrepare(sql)
    })
    await expect(service.generateReportCard(1, 1, 99)).rejects.toThrow('Failed to generate report card: 42')
    vi.restoreAllMocks()
  })

  // ── Branch coverage: non-Error catch in getReportCard ────────────
  it('getReportCard wraps non-Error throws with String(error)', async () => {
    const service = new CBCReportCardService()
    vi.spyOn(db, 'prepare').mockImplementation(() => {
      throw 'db-crash' // NOSONAR
    })
    await expect(service.getReportCard(1, 1)).rejects.toThrow('Failed to get report card: db-crash')
    vi.restoreAllMocks()
  })

  // ── Branch coverage: non-Error catch in generateBatchReportCards outer ──
  it('generateBatchReportCards wraps non-Error throws in outer catch', async () => {
    const service = new CBCReportCardService()
    // First prepare (exam lookup) throws non-Error
    vi.spyOn(db, 'prepare').mockImplementation(() => {
      throw { code: 'BOOM' } // NOSONAR
    })
    await expect(service.generateBatchReportCards(1, 1, 99)).rejects.toThrow(
      'Failed to batch generate report cards: [object Object]'
    )
    vi.restoreAllMocks()
  })

  // ── Branch coverage: report_card_subject with cat1/cat2/mid/final fields ──
  it('mapStoredReportCardSubjects includes cat1/cat2/mid/final when present', async () => {
    const service = new CBCReportCardService()
    await service.generateReportCard(1, 1, 99)
    // Add cat1, cat2, mid, final columns to report_card_subject table
    db.exec('ALTER TABLE report_card_subject ADD COLUMN cat1 REAL')
    db.exec('ALTER TABLE report_card_subject ADD COLUMN cat2 REAL')
    db.exec('ALTER TABLE report_card_subject ADD COLUMN mid REAL')
    db.exec('ALTER TABLE report_card_subject ADD COLUMN final REAL')
    db.exec('UPDATE report_card_subject SET cat1 = 25, cat2 = 30, mid = 40, final = 80')
    const report = await service.getReportCard(1, 1)
    expect(report).not.toBeNull()
    expect(report!.subjects[0]).toHaveProperty('cat1', 25)
    expect(report!.subjects[0]).toHaveProperty('cat2', 30)
    expect(report!.subjects[0]).toHaveProperty('mid', 40)
    expect(report!.subjects[0]).toHaveProperty('final', 80)
  })

  // ── Branch coverage: getReportCard catch with real Error (L504-505 instanceof Error true) ──
  it('getReportCard uses error.message when a real Error is thrown', async () => {
    const service = new CBCReportCardService()
    await service.generateReportCard(1, 1, 99)
    // Corrupt report_card table so db.prepare().get() throws a real Error
    db.exec('DROP TABLE report_card')
    db.exec('CREATE TABLE report_card (id INTEGER PRIMARY KEY)') // missing all columns
    await expect(service.getReportCard(1, 1)).rejects.toThrow('Failed to get report card:')
  })

  // ── Branch coverage: null teacher_comment and competency_level → '' fallback ──
  it('mapStoredReportCardSubjects falls back to empty string for null teacher_comment/competency_level', async () => {
    const service = new CBCReportCardService()
    await service.generateReportCard(1, 1, 99)
    // Set teacher_comment and competency_level to NULL
    db.exec('UPDATE report_card_subject SET teacher_comment = NULL, competency_level = NULL')
    const report = await service.getReportCard(1, 1)
    expect(report).not.toBeNull()
    for (const s of report!.subjects) {
      expect(s.teacher_comment).toBe('')
      expect(s.competency_level).toBe('')
    }
  })

  // ── Branch coverage: buildReportCardFromRecord null fallbacks for stream/year/term ──
  it('buildReportCardFromRecord uses Unknown fallback when stream/year/term are missing', async () => {
    const service = new CBCReportCardService()
    await service.generateReportCard(1, 1, 99)
    // Delete stream and academic_year records to trigger fallback
    db.exec('DELETE FROM stream')
    db.exec('DELETE FROM academic_year')
    db.exec('DELETE FROM term')
    const report = await service.getReportCard(1, 1)
    expect(report).not.toBeNull()
    expect(report!.stream_name).toBe('Unknown')
    expect(report!.academic_year).toBe('Unknown')
  })

  // ── Branch coverage: buildReportCardFromRecord null class_teacher_remarks and principal_remarks ──
  it('buildReportCardFromRecord falls back to empty string for null remarks', async () => {
    const service = new CBCReportCardService()
    await service.generateReportCard(1, 1, 99)
    db.exec('UPDATE report_card SET class_teacher_remarks = NULL, principal_remarks = NULL, qr_code_token = NULL')
    const report = await service.getReportCard(1, 1)
    expect(report).not.toBeNull()
    expect(report!.class_teacher_comment).toBe('')
    expect(report!.principal_comment).toBe('')
    expect(report!.qr_code_token).toBe('')
  })

  // ── Branch coverage: getNextTermDate returns '' when next year has no terms ──
  it('getNextTermDate returns empty when next year has no terms', async () => {
    // Remove all terms except term 3 of 2026 (last term), and add year 2027 but no terms in it
    db.exec('DELETE FROM term')
    db.exec("INSERT INTO term (id, academic_year_id, term_name, term_number, start_date) VALUES (99, 2026, 'Term 3', 3, '2026-09-01')")
    // Exam points to term 99
    db.exec('UPDATE exam SET term_id = 99')
    db.exec('UPDATE enrollment SET term_id = 99')
    // Year 2027 exists but has no terms
    const service = new CBCReportCardService()
    const report = await service.generateReportCard(1, 1, 99)
    expect(report.next_term_begin_date).toBe('')
  })
})

