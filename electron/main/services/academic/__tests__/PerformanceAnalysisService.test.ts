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
        (2, 'ADM/002', 'Sarah', 'Ochieng', 1),
        (3, 'ADM/003', 'James', 'Otieno', 1);

      CREATE TABLE subject (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      );

      INSERT INTO subject (id, name) VALUES (1, 'Mathematics'), (2, 'English');

      INSERT INTO enrollment (student_id, academic_year_id, term_id, stream_id, status)
      VALUES
        (1, 2026, 2, 1, 'ACTIVE'),
        (2, 2026, 2, 2, 'ACTIVE'),
        (3, 2026, 2, 1, 'ACTIVE');

      INSERT INTO report_card_summary (exam_id, student_id, mean_score)
      VALUES
        (101, 1, 50),
        (101, 2, 50),
        (102, 1, 72),
        (102, 2, 55),
        (101, 3, 30),
        (102, 3, 30);

      INSERT INTO exam_result (exam_id, student_id, subject_id, score)
      VALUES
        (102, 1, 1, 50),
        (102, 1, 2, 55),
        (102, 2, 1, 65),
        (102, 2, 2, 60),
        (101, 1, 1, 45),
        (101, 1, 2, 40),
        (102, 3, 1, 30),
        (102, 3, 2, 25);
    `)
  })

  afterEach(() => {
    db.close()
  })

  /* ---------------------------------------------------------------- */
  /*  getMostImprovedStudents                                          */
  /* ---------------------------------------------------------------- */
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

  it('returns all improved students without stream filter', async () => {
    const service = new PerformanceAnalysisService()
    const result = await service.getMostImprovedStudents({
      academicYearId: 2026,
      currentTermId: 2,
      comparisonTermId: 1,
      minimumImprovement: 1
    })
    // Grace improved from 50→72 (22 pts), Sarah from 50→55 (5 pts)
    // James had 30→30 (0 pts) so filtered out by minimumImprovement=1
    expect(result).toHaveLength(2)
    expect(result[0]?.student_name).toBe('Grace Mutua') // highest improvement first
    expect(result[0]?.improvement_points).toBe(22)
  })

  it('filters by default minimumImprovement=5 when not specified', async () => {
    const service = new PerformanceAnalysisService()
    const result = await service.getMostImprovedStudents({
      academicYearId: 2026,
      currentTermId: 2,
      comparisonTermId: 1
    })
    // Grace (22 pts) and Sarah (5 pts) both meet default 5 threshold
    expect(result).toHaveLength(2)
  })

  it('includes grade_improvement string', async () => {
    const service = new PerformanceAnalysisService()
    const result = await service.getMostImprovedStudents({
      academicYearId: 2026,
      currentTermId: 2,
      comparisonTermId: 1,
      minimumImprovement: 1
    })
    // Grace: 50 → 72 → C → B+
    expect(result[0]?.grade_improvement).toContain('→')
    expect(result[0]?.grade_improvement).toBe('C → B+')
  })

  it('calculates improvement_percentage relative to previous average', async () => {
    const service = new PerformanceAnalysisService()
    const result = await service.getMostImprovedStudents({
      academicYearId: 2026,
      currentTermId: 2,
      comparisonTermId: 1,
      minimumImprovement: 1
    })
    // Grace: improvement_points=22, previous=50, percentage=(22/50)*100=44%
    expect(result[0]?.improvement_percentage).toBeCloseTo(44, 0)
  })

  /* ---------------------------------------------------------------- */
  /*  getStrugglingStudents                                            */
  /* ---------------------------------------------------------------- */
  it('returns struggling students with valid stream filtering and having clause', async () => {
    const service = new PerformanceAnalysisService()
    const result = await service.getStrugglingStudents(2026, 2, 60, 1)

    expect(result).toHaveLength(2) // Grace (50,55 both < 60) + James (30,25 both < 60)
    // Ordered by failing_subjects DESC, average_score ASC → James first (avg 27.5)
    expect(result[0]?.student_name).toBe('James Otieno')
    expect(result[0]?.failing_subjects).toBe(2)
  })

  it('returns struggling students without stream filter', async () => {
    const service = new PerformanceAnalysisService()
    const result = await service.getStrugglingStudents(2026, 2, 60)
    // All students with at least 1 failing subject (score < 60):
    // Grace: 50,55 → 2 failing; Sarah: 65 not failing, 60 not failing (>=60) → 0; James: 30,25 → 2
    // Actually: Sarah term 2 scores are 65 and 60. passThreshold=60; score < 60 → 60 is NOT failing
    expect(result.length).toBeGreaterThanOrEqual(2)
  })

  it('returns empty when everyone passes at low threshold', async () => {
    const service = new PerformanceAnalysisService()
    const result = await service.getStrugglingStudents(2026, 2, 10) // threshold 10
    // James lowest is 25 > 10, all pass
    expect(result).toHaveLength(0)
  })

  /* ---------------------------------------------------------------- */
  /*  getPerformanceTrends                                             */
  /* ---------------------------------------------------------------- */
  it('builds term trends using term_name column', async () => {
    const service = new PerformanceAnalysisService()
    const trends = await service.getPerformanceTrends(1, 2026, 2)

    expect(trends.length).toBeGreaterThan(0)
    expect(trends[0]?.term_name).toBe('Term 2')
  })

  it('returns trends ordered by term_number DESC limited to N terms', async () => {
    const service = new PerformanceAnalysisService()
    const trends = await service.getPerformanceTrends(1, 2026, 10) // limit 10
    expect(trends.length).toBe(2) // only 2 terms have data for student 1
    expect(trends[0]?.term_number).toBe(2)
    expect(trends[1]?.term_number).toBe(1)
  })

  it('calculates lowest/highest scores per term', async () => {
    const service = new PerformanceAnalysisService()
    const trends = await service.getPerformanceTrends(1, 2026, 2)
    const term2 = trends.find(t => t.term_number === 2)!
    // Student 1 term 2: scores 50, 55
    expect(term2.lowest_score).toBe(50)
    expect(term2.highest_score).toBe(55)
    expect(term2.subject_count).toBe(2)
  })

  it('returns empty for student with no results', async () => {
    // Student 99 doesn't exist
    const service = new PerformanceAnalysisService()
    const trends = await service.getPerformanceTrends(99, 2026, 3)
    expect(trends).toHaveLength(0)
  })

  /* ---------------------------------------------------------------- */
  /*  getStudentPerformanceComparison                                  */
  /* ---------------------------------------------------------------- */
  it('returns null for non-existent student', async () => {
    const service = new PerformanceAnalysisService()
    const result = await service.getStudentPerformanceComparison(999, 2026, 2, 1)
    expect(result).toBeNull()
  })

  it('returns performance comparison with subject-level detail', async () => {
    const service = new PerformanceAnalysisService()
    const result = await service.getStudentPerformanceComparison(1, 2026, 2, 1)
    expect(result).not.toBeNull()
    expect(result!.student_id).toBe(1)
    expect(result!.admission_number).toBe('ADM/001')
    expect(result!.student_name).toBe('Grace Mutua')
    expect(result!.subjects).toHaveLength(2)
  })

  it('calculates per-subject improvement (current - previous)', async () => {
    const service = new PerformanceAnalysisService()
    const result = await service.getStudentPerformanceComparison(1, 2026, 2, 1)
    const math = result!.subjects.find(s => s.subject_name === 'Mathematics')!
    // Term 1 score: 45, Term 2 score: 50 → improvement = 5
    expect(math.current_score).toBe(50)
    expect(math.previous_score).toBe(45)
    expect(math.improvement).toBe(5)
    expect(math.improvement_percentage).toBeCloseTo((5 / 45) * 100, 1)
  })

  it('assigns correct grades for current and previous scores', async () => {
    const service = new PerformanceAnalysisService()
    const result = await service.getStudentPerformanceComparison(1, 2026, 2, 1)
    const math = result!.subjects.find(s => s.subject_name === 'Mathematics')!
    // 50 → C, 45 → C-
    expect(math.current_grade).toBe('C')
    expect(math.previous_grade).toBe('C-')
  })

  it('classifies excellent improvement_level (>= 20%)', async () => {
    const service = new PerformanceAnalysisService()
    const result = await service.getStudentPerformanceComparison(1, 2026, 2, 1)
    // Grace: Math 45→50 (11.1% improvement), English 40→55 (37.5% improvement)
    // Average improvement% = (11.1 + 37.5) / 2 = 24.3% → 'excellent'
    expect(result!.improvement_level).toBe('excellent')
  })

  it('classifies declined improvement_level when scores drop', async () => {
    // Add a student whose scores go down
    db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, is_active)
      VALUES (4, 'ADM/004', 'Test', 'Decline', 1)`).run()
    db.prepare(`INSERT INTO exam_result (exam_id, student_id, subject_id, score)
      VALUES (101, 4, 1, 80), (102, 4, 1, 40)`).run()

    const service = new PerformanceAnalysisService()
    const result = await service.getStudentPerformanceComparison(4, 2026, 2, 1)
    // 80 → 40 = -50% improvement → 'declined'
    expect(result!.improvement_level).toBe('declined')
  })

  it('uses 0 as previous_score when no prior term data', async () => {
    // Student 2 does not have term 1 exam_result for subject 1
    const service = new PerformanceAnalysisService()
    const result = await service.getStudentPerformanceComparison(2, 2026, 2, 1)
    // Sarah has term 2 results (65, 60) but no term 1 exam_result entries
    // Previous scores default to 0 → improvement_percentage = 0 for each
    const subj = result!.subjects[0]!
    expect(subj.previous_score).toBe(0)
    expect(subj.improvement_percentage).toBe(0)
  })

  it('classifies good improvement_level (10-19%)', async () => {
    db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, is_active)
      VALUES (5, 'ADM/005', 'Good', 'Improver', 1)`).run()
    db.prepare(`INSERT INTO exam_result (exam_id, student_id, subject_id, score)
      VALUES (101, 5, 1, 100), (102, 5, 1, 115)`).run()

    const service = new PerformanceAnalysisService()
    const result = await service.getStudentPerformanceComparison(5, 2026, 2, 1)
    // 100 → 115 = 15% improvement → 'good'
    expect(result!.improvement_level).toBe('good')
  })

  it('classifies moderate improvement_level (5-9%)', async () => {
    db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, is_active)
      VALUES (6, 'ADM/006', 'Mod', 'Improver', 1)`).run()
    db.prepare(`INSERT INTO exam_result (exam_id, student_id, subject_id, score)
      VALUES (101, 6, 1, 100), (102, 6, 1, 107)`).run()

    const service = new PerformanceAnalysisService()
    const result = await service.getStudentPerformanceComparison(6, 2026, 2, 1)
    // 100 → 107 = 7% → 'moderate'
    expect(result!.improvement_level).toBe('moderate')
  })

  it('classifies slight improvement_level (0-4%)', async () => {
    db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, is_active)
      VALUES (7, 'ADM/007', 'Slight', 'Improver', 1)`).run()
    db.prepare(`INSERT INTO exam_result (exam_id, student_id, subject_id, score)
      VALUES (101, 7, 1, 100), (102, 7, 1, 102)`).run()

    const service = new PerformanceAnalysisService()
    const result = await service.getStudentPerformanceComparison(7, 2026, 2, 1)
    // 100 → 102 = 2% → 'slight'
    expect(result!.improvement_level).toBe('slight')
  })

  /* ---------------------------------------------------------------- */
  /*  scoreToGrade coverage – all grade bands                          */
  /* ---------------------------------------------------------------- */
  it('scoreToGrade maps scores to correct grades via grade_improvement', async () => {
    const service = new PerformanceAnalysisService()
    // We can test scoreToGrade indirectly through getStudentPerformanceComparison
    // by setting up specific scores for each grade band:
    // A: 80+, A-: 75-79, B+: 70-74, B: 65-69, B-: 60-64, C+: 55-59, C: 50-54, C-: 45-49, E: <45

    // Student 8: math=76 (A-), english=67 (B)
    db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, is_active)
      VALUES (8, 'ADM/008', 'Grade', 'Test', 1)`).run()
    db.prepare(`INSERT INTO exam_result (exam_id, student_id, subject_id, score)
      VALUES (101, 8, 1, 85), (101, 8, 2, 62),
             (102, 8, 1, 76), (102, 8, 2, 67)`).run()

    const result = await service.getStudentPerformanceComparison(8, 2026, 2, 1)
    const math = result!.subjects.find(s => s.subject_name === 'Mathematics')!
    const eng = result!.subjects.find(s => s.subject_name === 'English')!

    expect(math.current_grade).toBe('A-')    // 76
    expect(math.previous_grade).toBe('A')     // 85
    expect(eng.current_grade).toBe('B')       // 67
    expect(eng.previous_grade).toBe('B-')     // 62
  })

  it('scoreToGrade correct for B+ (70-74) and C+ (55-59)', async () => {
    db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, is_active)
      VALUES (9, 'ADM/009', 'Mid', 'Grades', 1)`).run()
    db.prepare(`INSERT INTO exam_result (exam_id, student_id, subject_id, score)
      VALUES (101, 9, 1, 57), (102, 9, 1, 72)`).run()

    const service = new PerformanceAnalysisService()
    const result = await service.getStudentPerformanceComparison(9, 2026, 2, 1)
    const math = result!.subjects.find(s => s.subject_name === 'Mathematics')!
    expect(math.current_grade).toBe('B+')     // 72
    expect(math.previous_grade).toBe('C+')    // 57
  })

  it('scoreToGrade returns E for very low scores', async () => {
    db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, is_active)
      VALUES (10, 'ADM/010', 'Low', 'Score', 1)`).run()
    db.prepare(`INSERT INTO exam_result (exam_id, student_id, subject_id, score)
      VALUES (101, 10, 1, 20), (102, 10, 1, 30)`).run()

    const service = new PerformanceAnalysisService()
    const result = await service.getStudentPerformanceComparison(10, 2026, 2, 1)
    const math = result!.subjects.find(s => s.subject_name === 'Mathematics')!
    expect(math.current_grade).toBe('E')      // 30
    expect(math.previous_grade).toBe('E')     // 20
  })

  /* ---------------------------------------------------------------- */
  /*  Error handling branches                                          */
  /* ---------------------------------------------------------------- */
  it('getMostImprovedStudents throws wrapped error when DB fails', async () => {
    db.close()
    db = new Database(':memory:') // re-assign so afterEach close works
    const service = new PerformanceAnalysisService()
    await expect(service.getMostImprovedStudents({
      academicYearId: 2026, currentTermId: 2, comparisonTermId: 1
    })).rejects.toThrow('Failed to get most improved students')
  })

  it('getStrugglingStudents throws wrapped error when DB fails', async () => {
    db.close()
    db = new Database(':memory:')
    const service = new PerformanceAnalysisService()
    await expect(service.getStrugglingStudents(2026, 2)).rejects.toThrow('Failed to get struggling students')
  })

  it('getPerformanceTrends throws wrapped error when DB fails', async () => {
    db.close()
    db = new Database(':memory:')
    const service = new PerformanceAnalysisService()
    await expect(service.getPerformanceTrends(1, 2026)).rejects.toThrow('Failed to get performance trends')
  })

  it('getStudentPerformanceComparison throws wrapped error when DB fails', async () => {
    db.close()
    db = new Database(':memory:')
    const service = new PerformanceAnalysisService()
    await expect(service.getStudentPerformanceComparison(1, 2026, 2, 1)).rejects.toThrow('Failed to get performance comparison')
  })

  /* ---------------------------------------------------------------- */
  /*  Branch: subjects.length > 0 false → improvementPercentage = 0   */
  /* ---------------------------------------------------------------- */
  it('returns 0 improvement_percentage when student has no current-term results', async () => {
    // Student 11 exists but has no exam_result rows in current term
    db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, is_active)
      VALUES (11, 'ADM/011', 'No', 'Results', 1)`).run()

    const service = new PerformanceAnalysisService()
    const result = await service.getStudentPerformanceComparison(11, 2026, 2, 1)
    expect(result).not.toBeNull()
    expect(result!.subjects).toHaveLength(0)
    expect(result!.improvement_percentage).toBe(0)
    expect(result!.total_improvement).toBe(0)
    expect(result!.improvement_level).toBe('declined')
  })

  /* ---------------------------------------------------------------- */
  /*  Branch: getMostImprovedStudents with previous_term_average = 0   */
  /* ---------------------------------------------------------------- */
  it('handles improvement_percentage = 0 when previous average is zero in results', async () => {
    // Insert student with mean_score = 0 for the comparison term (prev)
    // and a positive mean_score for current term
    db.prepare(`INSERT INTO student (id, admission_number, first_name, last_name, is_active)
      VALUES (12, 'ADM/012', 'Zero', 'Prev', 1)`).run()
    db.prepare(`INSERT INTO enrollment (student_id, academic_year_id, term_id, stream_id, status)
      VALUES (12, 2026, 2, 1, 'ACTIVE')`).run()
    // prev exam → mean_score 0 (filtered by SQL WHERE > 0, so won't appear)
    db.prepare(`INSERT INTO report_card_summary (exam_id, student_id, mean_score)
      VALUES (101, 12, 0)`).run()
    db.prepare(`INSERT INTO report_card_summary (exam_id, student_id, mean_score)
      VALUES (102, 12, 60)`).run()

    const service = new PerformanceAnalysisService()
    const result = await service.getMostImprovedStudents({
      academicYearId: 2026,
      currentTermId: 2,
      comparisonTermId: 1,
      minimumImprovement: 1
    })
    // Student 12 has prev=0, filtered by SQL WHERE clause, should not appear
    const student12 = result.find(r => r.student_id === 12)
    expect(student12).toBeUndefined()
  })

  /* ---------------------------------------------------------------- */
  /*  Branch: String(error) fallback when non-Error value is thrown     */
  /* ---------------------------------------------------------------- */
  it('getMostImprovedStudents wraps non-Error thrown values via String()', async () => {
    const realDb = db
    db = { prepare() { throw 'raw string error' } } as any // NOSONAR
    const service = new PerformanceAnalysisService()
    await expect(service.getMostImprovedStudents({
      academicYearId: 2026, currentTermId: 2, comparisonTermId: 1
    })).rejects.toThrow('Failed to get most improved students: raw string error')
    db = realDb
  })

  it('getStudentPerformanceComparison wraps non-Error thrown values via String()', async () => {
    const realDb = db
    db = { prepare() { throw 42 } } as any // NOSONAR
    const service = new PerformanceAnalysisService()
    await expect(service.getStudentPerformanceComparison(1, 2026, 2, 1)).rejects.toThrow('Failed to get performance comparison: 42')
    db = realDb
  })

  it('getStrugglingStudents wraps non-Error thrown values via String()', async () => {
    const realDb = db
    db = { prepare() { throw 'string thrown' } } as any // NOSONAR
    const service = new PerformanceAnalysisService()
    await expect(service.getStrugglingStudents(2026, 2)).rejects.toThrow('Failed to get struggling students: string thrown')
    db = realDb
  })

  it('getPerformanceTrends wraps non-Error thrown values via String()', async () => {
    const realDb = db
    db = { prepare() { throw 'string thrown' } } as any // NOSONAR
    const service = new PerformanceAnalysisService()
    await expect(service.getPerformanceTrends(1, 2026)).rejects.toThrow('Failed to get performance trends: string thrown')
    db = realDb
  })
})
