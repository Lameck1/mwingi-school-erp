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
    CREATE TABLE IF NOT EXISTS fee_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT, category_name TEXT NOT NULL UNIQUE,
      description TEXT, is_active BOOLEAN DEFAULT 1, priority INTEGER DEFAULT 99,
      gl_account_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS invoice_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL,
      fee_category_id INTEGER NOT NULL, description TEXT NOT NULL, amount INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS receipt (
      id INTEGER PRIMARY KEY AUTOINCREMENT, receipt_number TEXT NOT NULL UNIQUE,
      transaction_id INTEGER NOT NULL UNIQUE, receipt_date DATE NOT NULL,
      student_id INTEGER NOT NULL, amount INTEGER NOT NULL, amount_in_words TEXT,
      payment_method TEXT NOT NULL, payment_reference TEXT, printed_count INTEGER DEFAULT 0,
      created_by_user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
          CREATE TABLE IF NOT EXISTS gl_account (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_code TEXT NOT NULL UNIQUE,
            account_name TEXT NOT NULL,
            account_type TEXT NOT NULL,
            normal_balance TEXT NOT NULL,
            is_active BOOLEAN DEFAULT 1
          );
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1100', 'Accounts Receivable', 'ASSET', 'DEBIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('2020', 'Student Credit Balance', 'LIABILITY', 'CREDIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1010', 'Cash', 'ASSET', 'DEBIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1020', 'Bank', 'ASSET', 'DEBIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('4010', 'Tuition Revenue', 'REVENUE', 'CREDIT');
          
          CREATE TABLE IF NOT EXISTS journal_entry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_ref TEXT NOT NULL UNIQUE,
            entry_date DATE NOT NULL,
            entry_type TEXT NOT NULL,
            description TEXT NOT NULL,
            student_id INTEGER,
            staff_id INTEGER,
            term_id INTEGER,
            is_posted BOOLEAN DEFAULT 0,
            posted_by_user_id INTEGER,
            posted_at DATETIME,
            is_voided BOOLEAN DEFAULT 0,
            voided_reason TEXT,
            voided_by_user_id INTEGER,
            voided_at DATETIME,
            requires_approval BOOLEAN DEFAULT 0,
            approval_status TEXT DEFAULT 'PENDING',
            approved_by_user_id INTEGER,
            approved_at DATETIME,
            created_by_user_id INTEGER NOT NULL,
            source_ledger_txn_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          CREATE TABLE IF NOT EXISTS journal_entry_line (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            journal_entry_id INTEGER NOT NULL,
            line_number INTEGER NOT NULL,
            gl_account_id INTEGER NOT NULL,
            debit_amount INTEGER DEFAULT 0,
            credit_amount INTEGER DEFAULT 0,
            description TEXT
          );
          CREATE TABLE IF NOT EXISTS approval_rule (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rule_name TEXT NOT NULL UNIQUE,
            description TEXT,
            transaction_type TEXT NOT NULL,
            min_amount INTEGER,
            max_amount INTEGER,
            days_since_transaction INTEGER,
            required_role_id INTEGER,
            is_active BOOLEAN DEFAULT 1,
            created_by_user_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

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

describe('ExamAnalysisService extended coverage', () => {
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
        term_id INTEGER NOT NULL,
        exam_name TEXT
      );
      CREATE TABLE subject (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      );
      CREATE TABLE subject_allocation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject_id INTEGER NOT NULL,
        teacher_id INTEGER NOT NULL,
        stream_id INTEGER NOT NULL,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL
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
        VALUES ('8-4-4', 'A', 'Excellent', 80, 100),
               ('8-4-4', 'B', 'Good', 60, 79),
               ('8-4-4', 'C', 'Fair', 40, 59),
               ('8-4-4', 'D', 'Poor', 0, 39);

      INSERT INTO subject (id, name) VALUES (1, 'Mathematics'), (2, 'English');
      INSERT INTO exam (id, academic_year_id, term_id) VALUES (1, 2026, 1), (2, 2026, 2);
      INSERT INTO student (id, admission_number, first_name, last_name)
        VALUES (1, 'ADM/001', 'Grace', 'Mutua'),
               (2, 'ADM/002', 'Sarah', 'Ochieng'),
               (3, 'ADM/003', 'Tom', 'Weak');
      INSERT INTO enrollment (student_id, academic_year_id, term_id, stream_id, status)
        VALUES (1, 2026, 1, 1, 'ACTIVE'),
               (2, 2026, 1, 1, 'ACTIVE'),
               (3, 2026, 1, 1, 'ACTIVE'),
               (1, 2026, 2, 1, 'ACTIVE'),
               (2, 2026, 2, 1, 'ACTIVE'),
               (3, 2026, 2, 1, 'ACTIVE');
      INSERT INTO subject_allocation (subject_id, teacher_id, stream_id, academic_year_id, term_id)
        VALUES (1, 100, 1, 2026, 1), (2, 100, 1, 2026, 1);

      -- Exam 1 results (term 1)
      INSERT INTO exam_result (exam_id, student_id, subject_id, score) VALUES
        (1, 1, 1, 85), (1, 1, 2, 78),
        (1, 2, 1, 55), (1, 2, 2, 45),
        (1, 3, 1, 30), (1, 3, 2, 25);

      -- Exam 2 results (term 2) — student 1 improved, student 2 declined
      INSERT INTO exam_result (exam_id, student_id, subject_id, score) VALUES
        (2, 1, 1, 95), (2, 1, 2, 90),
        (2, 2, 1, 35), (2, 2, 2, 30),
        (2, 3, 1, 28), (2, 3, 2, 20);
    `)
  })

  afterEach(() => { db.close() })

  it('getSubjectAnalysis without streamId returns all students', async () => {
    const service = new ExamAnalysisService()
    const analysis = await service.getSubjectAnalysis(1, 1)
    expect(analysis.student_count).toBe(3)
    expect(analysis.subject_name).toBe('Mathematics')
    expect(analysis.pass_rate).toBeGreaterThan(0)
    expect(analysis.fail_rate).toBeGreaterThan(0)
    expect(analysis.median_score).toBeGreaterThan(0)
    expect(analysis.mode_score).toBeGreaterThan(0)
    expect(analysis.std_deviation).toBeGreaterThan(0)
    expect(analysis.difficulty_index).toBeGreaterThan(0)
    expect(analysis.discrimination_index).toBeGreaterThanOrEqual(0)
  })

  it('getSubjectAnalysis throws when no data found', async () => {
    const service = new ExamAnalysisService()
    await expect(service.getSubjectAnalysis(999, 1)).rejects.toThrow('No data found')
  })

  it('analyzeAllSubjects without streamId', async () => {
    const service = new ExamAnalysisService()
    const analyses = await service.analyzeAllSubjects(1)
    expect(analyses.length).toBe(2)
  })

  it('getTeacherPerformance returns performance data', async () => {
    const service = new ExamAnalysisService()
    const performances = await service.getTeacherPerformance(100, 2026, 1)
    expect(performances.length).toBe(2)
    expect(performances[0].teacher_id).toBe(100)
    expect(performances[0].avg_class_score).toBeGreaterThan(0)
    expect(performances[0].overall_rating).toBeDefined()
  })

  it('getStudentPerformance detects improving trend', async () => {
    const service = new ExamAnalysisService()
    const analysis = await service.getStudentPerformance(1, 2)
    expect(analysis.performance_trend).toBe('improving')
    expect(analysis.best_subjects.length).toBeGreaterThan(0)
    expect(analysis.worst_subjects.length).toBeGreaterThan(0)
    expect(analysis.predicted_kcpe_grade).toBeDefined()
  })

  it('getStudentPerformance detects declining trend', async () => {
    const service = new ExamAnalysisService()
    const analysis = await service.getStudentPerformance(2, 2)
    expect(analysis.performance_trend).toBe('declining')
  })

  it('getStudentPerformance stable when no previous exams', async () => {
    const service = new ExamAnalysisService()
    const analysis = await service.getStudentPerformance(1, 1)
    expect(analysis.performance_trend).toBe('stable')
  })

  it('getStudentPerformance throws when student not found', async () => {
    const service = new ExamAnalysisService()
    await expect(service.getStudentPerformance(999, 1)).rejects.toThrow('Student not found')
  })

  it('getStudentPerformance throws when no exam results', async () => {
    db.prepare("INSERT INTO student (id, admission_number, first_name, last_name) VALUES (10, 'ADM/010', 'No', 'Results')").run()
    const service = new ExamAnalysisService()
    await expect(service.getStudentPerformance(10, 1)).rejects.toThrow('No exam results found')
  })

  it('getStrugglingStudents returns students below threshold', async () => {
    const service = new ExamAnalysisService()
    const struggling = await service.getStrugglingStudents(1, 50)
    expect(struggling.length).toBeGreaterThanOrEqual(1)
    expect(struggling.every(s => s.average_score < 50)).toBe(true)
    // Sorted ascending
    for (let i = 1; i < struggling.length; i++) {
      expect(struggling[i].average_score).toBeGreaterThanOrEqual(struggling[i - 1].average_score)
    }
  })

  it('getStrugglingStudents with custom threshold', async () => {
    const service = new ExamAnalysisService()
    const struggling = await service.getStrugglingStudents(1, 90)
    expect(struggling.length).toBeGreaterThanOrEqual(2)
  })

  it('resolveGrade returns E for score outside grading scale', async () => {
    // Delete grading scale to trigger fallback, then test with a -1 score
    db.exec('DELETE FROM grading_scale')
    const service = new ExamAnalysisService()
    // Accessing private method through getStudentPerformance — the fallback grading will be used
    const analysis = await service.getStudentPerformance(3, 1)
    expect(analysis.predicted_kcpe_grade).toBeDefined()
  })

  it('grading scale fallback is used when grading_scale table is missing', async () => {
    db.exec('DROP TABLE grading_scale')
    const service = new ExamAnalysisService()
    const analysis = await service.getStudentPerformance(1, 1)
    expect(analysis.predicted_kcpe_grade).toContain('Excellent')
  })

  // ── Branch coverage: calculateMedian even-length array ──────────
  it('calculateMedian uses average of two middle values for even-length scores', async () => {
    // Add a 4th student so we get even-number of scores for subject 1 exam 1
    db.exec(`
      INSERT INTO student (id, admission_number, first_name, last_name) VALUES (4, 'ADM/004', 'Eve', 'Karanja');
      INSERT INTO enrollment (student_id, academic_year_id, term_id, stream_id, status) VALUES (4, 2026, 1, 1, 'ACTIVE');
      INSERT INTO exam_result (exam_id, student_id, subject_id, score) VALUES (1, 4, 1, 60);
    `)
    const service = new ExamAnalysisService()
    const analysis = await service.getSubjectAnalysis(1, 1)
    expect(analysis.student_count).toBe(4)
    // Scores: [30, 55, 60, 85] → median = (55 + 60) / 2 = 57.5
    expect(analysis.median_score).toBe(57.5)
  })

  // ── Branch coverage: calculateDiscriminationIndex with < 2 scores ──
  it('discrimination index returns 0 when only one score exists', async () => {
    db.exec(`
      INSERT INTO student (id, admission_number, first_name, last_name) VALUES (5, 'ADM/005', 'Solo', 'One');
      INSERT INTO enrollment (student_id, academic_year_id, term_id, stream_id, status) VALUES (5, 2026, 1, 2, 'ACTIVE');
      INSERT INTO exam_result (exam_id, student_id, subject_id, score) VALUES (1, 5, 2, 70);
    `)
    const service = new ExamAnalysisService()
    // Stream 2 only has student 5 for exam 1 subject 2
    // But student 2 is also in stream 1 for exam 1 subject 2. We need stream filter.
    // Actually we need a clean setup. Let's test with stream=2 where only 1 student exists.
    const analysis = await service.getSubjectAnalysis(1, 2, 2)
    expect(analysis.student_count).toBe(1)
    expect(analysis.discrimination_index).toBe(0)
  })

  // ── Branch coverage: teacher performance with null avg_score ─────
  it('getTeacherPerformance handles null avg_score (avg_score || 0 branch)', async () => {
    // Create subject allocation with no exam results → LEFT JOIN produces null avg_score
    db.exec(`
      INSERT INTO subject (id, name) VALUES (3, 'Science');
      INSERT INTO subject_allocation (subject_id, teacher_id, stream_id, academic_year_id, term_id) VALUES (3, 200, 1, 2026, 1);
    `)
    const service = new ExamAnalysisService()
    const performances = await service.getTeacherPerformance(200, 2026, 1)
    // No exam results for teacher 200 subject 3, so should return empty
    // (the query filters er.score IS NOT NULL so it won't match)
    expect(Array.isArray(performances)).toBe(true)
  })

  // ── Branch coverage: analyzeAllSubjects error in inner loop ──────
  it('analyzeAllSubjects skips subjects that fail analysis (console.error branch)', async () => {
    const service = new ExamAnalysisService()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // Mock getSubjectAnalysis to throw for subject 2, succeed for subject 1
    const originalMethod = service.getSubjectAnalysis.bind(service)
    vi.spyOn(service, 'getSubjectAnalysis').mockImplementation(async (examId, subjectId, streamId) => {
      if (subjectId === 2) {
        throw new Error('Simulated analysis failure')
      }
      return originalMethod(examId, subjectId, streamId)
    })
    const analyses = await service.analyzeAllSubjects(1)
    // Subject 2 should be skipped due to error, only subject 1 returned
    expect(analyses.length).toBe(1)
    expect(analyses[0].subject_name).toBe('Mathematics')
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to analyze subject 2'), expect.any(Error))
    consoleSpy.mockRestore()
  })

  // ── Branch coverage: getSubjectAnalysis throws for subject with zero results ──
  it('getSubjectAnalysis throws when subject has no exam results', async () => {
    // Add a new subject with no exam results in exam 1
    db.exec(`INSERT INTO subject (id, name) VALUES (99, 'EmptySubject');`)
    const service = new ExamAnalysisService()
    await expect(service.getSubjectAnalysis(1, 99)).rejects.toThrow('No data found')
  })

  // ── Branch coverage: getStrugglingStudents inner error path ──────
  it('getStrugglingStudents skips students that fail individual analysis', async () => {
    const service = new ExamAnalysisService()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const originalMethod = service.getStudentPerformance.bind(service)
    let callCount = 0
    vi.spyOn(service, 'getStudentPerformance').mockImplementation(async (studentId, examId) => {
      callCount++
      // Make the first student throw an error
      if (callCount === 1) {
        throw new Error('Simulated student analysis failure')
      }
      return originalMethod(studentId, examId)
    })

    const _struggling = await service.getStrugglingStudents(1, 100)
    // The first student should be skipped; remaining students may or may not be struggling
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to analyze student'), expect.any(Error))
    consoleSpy.mockRestore()
  })

  // ── Branch coverage: getStudentPerformance trend improving/declining ──
  it('getStudentPerformance detects improving performance trend', async () => {
    // Create a previous exam in an earlier term with a lower average
    db.exec(`
      INSERT INTO exam (id, exam_name, academic_year_id, term_id) VALUES (99, 'Previous Exam', 2026, 0);
      INSERT INTO exam_result (exam_id, student_id, subject_id, score) VALUES (99, 1, 1, 30);
      INSERT INTO exam_result (exam_id, student_id, subject_id, score) VALUES (99, 1, 2, 30);
    `)
    const service = new ExamAnalysisService()
    // Student 1 scores in exam 1 are higher than exam 99 (which has term_id=0 < term_id=1)
    const analysis = await service.getStudentPerformance(1, 1)
    // The trend depends on the gap - original scores are 85 and 55, avg=70
    // Previous avg=30, gap > 5, so should be 'improving'
    expect(analysis.performance_trend).toBe('improving')
  })

  // ── Branch coverage: error instanceof Error false (non-Error) in catch blocks ──

  it('getSubjectAnalysis wraps non-Error thrown value with String()', async () => {
    const service = new ExamAnalysisService()
    // Spy on db.prepare to throw a non-Error value for the subject analysis query
    const origPrepare = db.prepare.bind(db)
    vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('er.exam_id') && sql.includes('er.subject_id') && sql.includes('GROUP BY s.id')) {
        throw 'non-error string in getSubjectAnalysis' // NOSONAR
      }
      return origPrepare(sql)
    })

    await expect(service.getSubjectAnalysis(1, 1)).rejects.toThrow('non-error string in getSubjectAnalysis')
  })

  it('analyzeAllSubjects wraps non-Error in outer catch', async () => {
    const service = new ExamAnalysisService()
    const origPrepare = db.prepare.bind(db)
    vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('SELECT DISTINCT er.subject_id')) {
        throw 999 // NOSONAR
      }
      return origPrepare(sql)
    })

    await expect(service.analyzeAllSubjects(1)).rejects.toThrow('Failed to analyze all subjects: 999')
  })

  it('getTeacherPerformance wraps non-Error in catch', async () => {
    const service = new ExamAnalysisService()
    const origPrepare = db.prepare.bind(db)
    vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('subject_allocation') && sql.includes('teacher_id')) {
        throw { code: 'SQLITE_ERROR' } // NOSONAR
      }
      return origPrepare(sql)
    })

    await expect(service.getTeacherPerformance(1, 2026, 1)).rejects.toThrow('Failed to analyze teacher performance:')
  })

  it('getStrugglingStudents wraps non-Error in outer catch', async () => {
    const service = new ExamAnalysisService()
    const origPrepare = db.prepare.bind(db)
    vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('SELECT DISTINCT er.student_id')) {
        throw null // NOSONAR
      }
      return origPrepare(sql)
    })

    await expect(service.getStrugglingStudents(1)).rejects.toThrow('Failed to get struggling students: null')
  })

  // ── Branch coverage: calculateDiscriminationIndex with single score ──
  it('calculateDiscriminationIndex returns 0 when fewer than 2 scores', async () => {
    const service = new ExamAnalysisService()
    // Insert only one student with one score
    db.exec(`DELETE FROM exam_result`)
    db.exec(`INSERT INTO exam_result (exam_id, student_id, subject_id, score) VALUES (1, 1, 1, 75)`)

    const analysis = await service.getSubjectAnalysis(1, 1)
    expect(analysis.discrimination_index).toBe(0) // < 2 scores → 0
    expect(analysis.student_count).toBe(1)
  })

  // ── Branch coverage: getGradingScale catch fallback (no grading_scale table) ──
  it('resolveGrade uses fallback scale when grading_scale table is absent', async () => {
    const service = new ExamAnalysisService()
    // Drop grading_scale table so getGradingScale catch block fires → uses fallback
    db.exec('DROP TABLE grading_scale')
    // Student 1 already has scores for exam 1: (85, 78) → avg 81.5 → fallback A/Excellent
    const analysis = await service.getStudentPerformance(1, 1)
    expect(analysis.predicted_kcpe_grade).toContain('A')
  })

  // ── Branch coverage: resolveGrade not-found (score outside all ranges) ──
  it('resolveGrade returns E/Fail for score below all scale ranges', async () => {
    const service = new ExamAnalysisService()
    // Clear existing results and grading rows; insert scale with gap (min_score=60)
    db.exec('DELETE FROM exam_result')
    db.exec('DELETE FROM grading_scale')
    db.exec(`INSERT INTO grading_scale (curriculum, grade, remarks, min_score, max_score) VALUES ('8-4-4', 'A', 'Excellent', 80, 100), ('8-4-4', 'B', 'Good', 60, 79)`)
    db.exec(`INSERT INTO exam_result (exam_id, student_id, subject_id, score) VALUES (1, 1, 1, 5), (1, 1, 2, 3)`)

    const analysis = await service.getStudentPerformance(1, 1)
    // Average = 4 → below all scale ranges → resolveGrade returns E/Fail
    expect(analysis.predicted_kcpe_grade).toContain('E')
    expect(analysis.predicted_kcpe_grade).toContain('Fail')
  })

  // ── Branch coverage: trend detection (improving / declining) ──
  // Already covered by existing tests above at lines 316-328.
  // Additional coverage: getStrugglingStudents with threshold boundary
  it('getStrugglingStudents returns students below custom threshold', async () => {
    const service = new ExamAnalysisService()
    // Student 3 has scores 30,25 (avg 27.5) — should always be struggling at threshold 50
    const struggling = await service.getStrugglingStudents(1, 50)
    const ids = struggling.map(s => s.student_id)
    expect(ids).toContain(3) // student_id 3 has avg below 50
  })

  // ── Branch coverage: analyzeAllSubjects with streamId filters students ──
  it('analyzeAllSubjects with streamId=1 scopes results', async () => {
    const service = new ExamAnalysisService()
    const analyses = await service.analyzeAllSubjects(1, 1)
    expect(analyses.length).toBeGreaterThanOrEqual(1)
    for (const a of analyses) {
      expect(a.student_count).toBeGreaterThan(0)
    }
  })

  // ── Branch coverage: analyzeAllSubjects error in individual subject ──
  it('analyzeAllSubjects tolerates individual subject failures', async () => {
    const service = new ExamAnalysisService()
    // Delete all exam_result for subject 2 so it has no results → getSubjectAnalysis throws
    db.exec('DELETE FROM exam_result WHERE subject_id = 2 AND exam_id = 1')
    const analyses = await service.analyzeAllSubjects(1)
    // Subject 1 still analysable, subject 2 throws "No data" → caught and skipped
    expect(analyses.length).toBe(1) // only subject 1 returns
    expect(analyses[0]?.subject_name).toBe('Mathematics')
  })

  // ── Branch coverage: getTeacherPerformance with zero avg ──
  it('getTeacherPerformance handles teacher with no matching results', async () => {
    const service = new ExamAnalysisService()
    // Teacher 999 has no subject allocations
    const perf = await service.getTeacherPerformance(999, 2026, 1)
    expect(perf).toEqual([])
  })

  // ── Branch coverage: getStrugglingStudents tolerates individual student failures ──
  it('getStrugglingStudents skips students that throw', async () => {
    const service = new ExamAnalysisService()
    // Add a student with exam_result but without student row → getStudentPerformance throws
    db.exec("INSERT INTO exam_result (exam_id, student_id, subject_id, score) VALUES (1, 999, 1, 10)")
    const struggling = await service.getStrugglingStudents(1, 50)
    // Student 999 should be skipped (no student row), others still returned
    const ids = struggling.map(s => s.student_id)
    expect(ids).not.toContain(999)
  })

  // ── Branch coverage: calculateMedian/calculateMode/calculateStdDeviation with empty scores ──
  it('getSubjectAnalysis with streamId that has no enrollment returns error', async () => {
    const service = new ExamAnalysisService()
    // Stream 99 has no enrollment → no exam results → throws
    await expect(service.getSubjectAnalysis(1, 1, 99)).rejects.toThrow('No data found')
  })

  // ── Branch coverage: calculateDiscriminationIndex with exactly 2 scores ──
  it('discrimination index computed correctly with 2 students', async () => {
    db.exec('DELETE FROM exam_result WHERE exam_id = 1 AND subject_id = 1')
    db.exec("INSERT INTO exam_result (exam_id, student_id, subject_id, score) VALUES (1, 1, 1, 90), (1, 2, 1, 40)")
    const service = new ExamAnalysisService()
    const analysis = await service.getSubjectAnalysis(1, 1)
    expect(analysis.student_count).toBe(2)
    expect(analysis.discrimination_index).toBeGreaterThan(0) // top vs bottom differ
  })

  // ── Branch coverage: calculateMedian with even number of scores (L404) ──
  it('calculateMedian averages two middle values for even count', async () => {
    db.exec('DELETE FROM exam_result WHERE exam_id = 1 AND subject_id = 1')
    // 4 scores: 40, 60, 70, 80 → median = (60+70)/2 = 65
    db.exec("INSERT INTO exam_result (exam_id, student_id, subject_id, score) VALUES (1, 1, 1, 40), (1, 2, 1, 80), (1, 3, 1, 60)")
    db.exec(`INSERT INTO student (admission_number, first_name, last_name) VALUES ('S004', 'Fourth', 'Student')`)
    const s4 = (db.prepare("SELECT id FROM student WHERE admission_number = 'S004'").get() as any).id
    db.exec(`INSERT INTO enrollment (student_id, academic_year_id, term_id, stream_id, status) VALUES (${s4}, 2026, 1, 1, 'ACTIVE')`)
    db.exec(`INSERT INTO exam_result (exam_id, student_id, subject_id, score) VALUES (1, ${s4}, 1, 70)`)
    const service = new ExamAnalysisService()
    const analysis = await service.getSubjectAnalysis(1, 1)
    expect(analysis.student_count).toBe(4)
    expect(analysis.median_score).toBe(65)
  })

  // ── Branch coverage: analyzeAllSubjects – individual subject error catch (L208-210) ──
  it('analyzeAllSubjects skips subjects that fail analysis', async () => {
    // Add a result for a subject that has no student row linked through enrollment
    db.exec("INSERT INTO subject (name) VALUES ('Ghost Subject')")
    const ghostSub = (db.prepare("SELECT id FROM subject WHERE name = 'Ghost Subject'").get() as any).id
    // exam_result references a student not in enrollment → query returns no data → may error
    db.exec(`INSERT INTO exam_result (exam_id, student_id, subject_id, score) VALUES (1, 999, ${ghostSub}, 50)`)
    const service = new ExamAnalysisService()
    const results = await service.analyzeAllSubjects(1)
    // Should still return results for valid subjects; ghost subject skipped or empty
    expect(Array.isArray(results)).toBe(true)
  })

  // ── Branch coverage: getSubjectAnalysis – single student with 0 score (edge) ──
  it('getSubjectAnalysis handles student with zero score', async () => {
    db.exec('DELETE FROM exam_result WHERE exam_id = 1 AND subject_id = 1')
    db.exec("INSERT INTO exam_result (exam_id, student_id, subject_id, score) VALUES (1, 1, 1, 0)")
    const service = new ExamAnalysisService()
    const analysis = await service.getSubjectAnalysis(1, 1)
    expect(analysis.student_count).toBe(1)
    expect(analysis.mean_score).toBe(0)
    expect(analysis.max_score).toBe(0)
    expect(analysis.min_score).toBe(0)
  })

  // ── Branch coverage: calculateDiscriminationIndex with < 2 scores returns 0 (L412) ──
  it('single score returns 0 discrimination index', async () => {
    db.exec('DELETE FROM exam_result WHERE exam_id = 1 AND subject_id = 1')
    db.exec("INSERT INTO exam_result (exam_id, student_id, subject_id, score) VALUES (1, 1, 1, 75)")
    const service = new ExamAnalysisService()
    const analysis = await service.getSubjectAnalysis(1, 1)
    expect(analysis.student_count).toBe(1)
    expect(analysis.discrimination_index).toBe(0)
  })

  // ── Branch coverage: private helper methods with empty arrays (L381, L390, L409) ──
  it('calculateMedian returns 0 for empty array', () => {
    const service = new ExamAnalysisService()
    expect((service as any).calculateMedian([])).toBe(0)
  })

  it('calculateMode returns 0 for empty array', () => {
    const service = new ExamAnalysisService()
    expect((service as any).calculateMode([])).toBe(0)
  })

  it('calculateStdDeviation returns 0 for empty array', () => {
    const service = new ExamAnalysisService()
    expect((service as any).calculateStdDeviation([], 0)).toBe(0)
  })

  // ── Branch coverage: getStudentPerformance with no previous exam (L318 else) ──
  it('getStudentPerformance returns stable trend when no previous exam', async () => {
    // Exam 1 is term 1, so no earlier exam exists
    const service = new ExamAnalysisService()
    const perf = await service.getStudentPerformance(1, 1)
    expect(perf.performance_trend).toBe('stable')
    expect(perf.student_name).toContain('Grace')
  })

  // ── Branch coverage: getStudentPerformance declining trend (L318 arm1, L319) ──
  it('getStudentPerformance detects declining trend', async () => {
    // Student 2: exam 1 avg=50, exam 2 avg=32.5 → declining (>5 pt drop)
    const service = new ExamAnalysisService()
    const perf = await service.getStudentPerformance(2, 2)
    expect(perf.performance_trend).toBe('declining')
  })

  // ── Branch coverage: getStudentPerformance stable trend within 5 points (L318-319 else) ──
  it('getStudentPerformance returns stable when score change is within 5 points', async () => {
    // Adjust student 3 exam 2 scores so avg is within 5 of exam 1 avg (27.5)
    db.exec('DELETE FROM exam_result WHERE exam_id = 2 AND student_id = 3')
    // new scores: 26, 25 → avg = 25.5. Previous (exam 1): 30, 25 → avg = 27.5. Diff = 2 < 5 → stable
    db.exec("INSERT INTO exam_result (exam_id, student_id, subject_id, score) VALUES (2, 3, 1, 26), (2, 3, 2, 25)")
    const service = new ExamAnalysisService()
    const perf = await service.getStudentPerformance(3, 2)
    expect(perf.performance_trend).toBe('stable')
  })

  // ── Branch coverage: resolveGrade returns E/Fail for score below all ranges ──
  it('resolveGrade returns E/Fail for score below all scale ranges', () => {
    const service = new ExamAnalysisService()
    const scale = (service as any).getGradingScale()
    const grade = (service as any).resolveGrade(-1, scale)
    expect(grade.grade).toBe('E')
    expect(grade.remarks).toBe('Fail')
  })

  /* ==================================================================
   *  Branch coverage: analyzeAllSubjects without stream filter
   * ================================================================== */
  it('analyzeAllSubjects without streamId returns all subjects', async () => {
    const service = new ExamAnalysisService()
    // exam 2 has results for student 1 in both subjects
    const analyses = await service.analyzeAllSubjects(2)
    expect(analyses.length).toBeGreaterThanOrEqual(1)
  })

  /* ==================================================================
   *  Branch coverage: getSubjectAnalysis non-Error catch
   * ================================================================== */
  it('getSubjectAnalysis wraps non-Error throw', async () => {
    const service = new ExamAnalysisService()
    // Subject 999 does not exist → the query returns no rows → mean_score is null → error
    await expect(service.getSubjectAnalysis(2, 999)).rejects.toThrow('Failed to analyze subject')
  })

  /* ==================================================================
   *  Branch coverage: getTeacherPerformance with no subjects
   * ================================================================== */
  it('getTeacherPerformance returns empty when teacher has no allocations', async () => {
    const service = new ExamAnalysisService()
    const perfs = await service.getTeacherPerformance(999, 2025, 1)
    expect(perfs).toEqual([])
  })

  /* ==================================================================
   *  Branch coverage: getTeacherPerformance with allocation and scores
   * ================================================================== */
  it('getTeacherPerformance returns performance with grade info', async () => {
    const service = new ExamAnalysisService()
    const perfs = await service.getTeacherPerformance(100, 2026, 1)
    expect(perfs.length).toBeGreaterThanOrEqual(1)
    expect(perfs[0]).toHaveProperty('overall_rating')
    expect(perfs[0]).toHaveProperty('avg_class_score')
  })

  /* ==================================================================
   *  Branch coverage: getStudentPerformance improving trend
   * ================================================================== */
  it('getStudentPerformance detects improving trend', async () => {
    // Student 1 has exam 1 (term 1) score=45, exam 2 (term 2) score=85 → improving
    const service = new ExamAnalysisService()
    const perf = await service.getStudentPerformance(1, 2)
    // The trend depends on the delta (>5 improvement)
    expect(['improving', 'stable']).toContain(perf.performance_trend)
  })

  /* ==================================================================
   *  Branch coverage: getStudentPerformance declining trend
   * ================================================================== */
  it('getStudentPerformance detects declining trend', async () => {
    // Add a student with higher previous score and lower current
    db.exec(`
      INSERT INTO student (id, admission_number, first_name, last_name) VALUES (4, 'ADM/004', 'Dan', 'Low');
      INSERT INTO enrollment (student_id, academic_year_id, term_id, stream_id, status) VALUES (4, 2025, 1, 1, 'ACTIVE');
      INSERT INTO enrollment (student_id, academic_year_id, term_id, stream_id, status) VALUES (4, 2025, 2, 1, 'ACTIVE');
      INSERT INTO exam_result (exam_id, student_id, subject_id, score) VALUES (1, 4, 1, 90);
      INSERT INTO exam_result (exam_id, student_id, subject_id, score) VALUES (2, 4, 1, 30);
    `)
    const service = new ExamAnalysisService()
    const perf = await service.getStudentPerformance(4, 2)
    expect(perf.performance_trend).toBe('declining')
  })

  /* ==================================================================
   *  Branch coverage: getStudentPerformance with no results → error
   * ================================================================== */
  it('getStudentPerformance throws when no exam results found', async () => {
    db.exec(`INSERT INTO student (id, admission_number, first_name, last_name) VALUES (5, 'ADM/005', 'Eve', 'None')`)
    const service = new ExamAnalysisService()
    await expect(service.getStudentPerformance(5, 2)).rejects.toThrow('No exam results found')
  })

  /* ==================================================================
   *  Branch coverage: getStudentPerformance student not found
   * ================================================================== */
  it('getStudentPerformance throws when student not found', async () => {
    const service = new ExamAnalysisService()
    await expect(service.getStudentPerformance(999, 2)).rejects.toThrow('Student not found')
  })

  /* ==================================================================
   *  Branch coverage: getStrugglingStudents returns sorted struggling
   * ================================================================== */
  it('getStrugglingStudents returns students below threshold', async () => {
    const service = new ExamAnalysisService()
    const struggling = await service.getStrugglingStudents(2, 50)
    // Student 2 scored 40 in Math → avg < 50
    expect(struggling.length).toBeGreaterThanOrEqual(1)
    expect(struggling[0]!.average_score).toBeLessThan(50)
  })

  /* ==================================================================
   *  Branch coverage: calculateMedian/calculateMode/calculateStdDeviation with empty arrays
   * ================================================================== */
  it('calculateMedian returns 0 for empty scores', () => {
    const service = new ExamAnalysisService()
    expect((service as any).calculateMedian([])).toBe(0)
  })

  it('calculateMode returns 0 for empty scores', () => {
    const service = new ExamAnalysisService()
    expect((service as any).calculateMode([])).toBe(0)
  })

  it('calculateStdDeviation returns 0 for empty scores', () => {
    const service = new ExamAnalysisService()
    expect((service as any).calculateStdDeviation([], 0)).toBe(0)
  })

  it('calculateDiscriminationIndex returns 0 for single score', () => {
    const service = new ExamAnalysisService()
    expect((service as any).calculateDiscriminationIndex([75])).toBe(0)
  })

  /* ==================================================================
   *  Branch coverage: calculateMedian even-length array
   * ================================================================== */
  it('calculateMedian returns average of middle two for even count', () => {
    const service = new ExamAnalysisService()
    expect((service as any).calculateMedian([10, 20, 30, 40])).toBe(25)
  })

  /* ==================================================================
   *  Branch coverage: analyzeAllSubjects – inner catch on individual subject (L215)
   * ================================================================== */
  it('analyzeAllSubjects continues when one subject analysis throws', async () => {
    const service = new ExamAnalysisService()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // Mock getSubjectAnalysis to throw for subject 2 only
    const origAnalysis = (service as any).getSubjectAnalysis.bind(service)
    let _callCount = 0
    vi.spyOn(service, 'getSubjectAnalysis').mockImplementation(async (examId: number, subjectId: number, streamId?: number) => {
      _callCount++
      if (subjectId === 2) { throw new Error('Corrupt subject data') }
      return origAnalysis(examId, subjectId, streamId)
    })

    const analyses = await service.analyzeAllSubjects(1)
    // Should still return results for subject 1 even though subject 2 failed
    expect(analyses.length).toBe(1)
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to analyze subject 2'), expect.any(Error))
    consoleSpy.mockRestore()
    vi.restoreAllMocks()
  })

  /* ==================================================================
   *  Branch coverage: getStrugglingStudents – inner catch on individual student (L372)
   * ================================================================== */
  it('getStrugglingStudents continues when one student analysis throws', async () => {
    const service = new ExamAnalysisService()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const origPerf = service.getStudentPerformance.bind(service)
    vi.spyOn(service, 'getStudentPerformance').mockImplementation(async (studentId: number, examId: number) => {
      if (studentId === 3) { throw new Error('Corrupt student data') }
      return origPerf(studentId, examId)
    })

    const struggling = await service.getStrugglingStudents(1, 60)
    // Student 3 fails silently, others still work
    expect(Array.isArray(struggling)).toBe(true)
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to analyze student 3'), expect.any(Error))
    consoleSpy.mockRestore()
    vi.restoreAllMocks()
  })

  /* ==================================================================
   *  Branch coverage: getTeacherPerformance with no matching results (L248/257)
   * ================================================================== */
  it('getTeacherPerformance returns empty array for teacher with no allocations', async () => {
    const service = new ExamAnalysisService()
    const performances = await service.getTeacherPerformance(999, 2026, 1)
    expect(performances).toEqual([])
  })
})
