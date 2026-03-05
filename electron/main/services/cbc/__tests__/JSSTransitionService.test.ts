import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db
}))

import { JSSTransitionService } from '../JSSTransitionService'

describe('JSSTransitionService', () => {
  let service: JSSTransitionService

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
      entry_ref TEXT NOT NULL UNIQUE, entry_date DATE NOT NULL,
      entry_type TEXT NOT NULL, description TEXT NOT NULL,
      student_id INTEGER, staff_id INTEGER, term_id INTEGER,
      is_posted BOOLEAN DEFAULT 0, posted_by_user_id INTEGER, posted_at DATETIME,
      is_voided BOOLEAN DEFAULT 0, voided_reason TEXT, voided_by_user_id INTEGER, voided_at DATETIME,
      requires_approval BOOLEAN DEFAULT 0, approval_status TEXT DEFAULT 'PENDING',
      approved_by_user_id INTEGER, approved_at DATETIME,
      created_by_user_id INTEGER NOT NULL, source_ledger_txn_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS journal_entry_line (
      id INTEGER PRIMARY KEY AUTOINCREMENT, journal_entry_id INTEGER NOT NULL,
      line_number INTEGER NOT NULL, gl_account_id INTEGER NOT NULL,
      debit_amount INTEGER DEFAULT 0, credit_amount INTEGER DEFAULT 0, description TEXT
    );
    CREATE TABLE IF NOT EXISTS approval_rule (
      id INTEGER PRIMARY KEY AUTOINCREMENT, rule_name TEXT NOT NULL UNIQUE,
      description TEXT, transaction_type TEXT NOT NULL,
      min_amount INTEGER, max_amount INTEGER, days_since_transaction INTEGER,
      required_role_id INTEGER, is_active BOOLEAN DEFAULT 1,
      created_by_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE jss_fee_structure (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grade INTEGER NOT NULL,
      fiscal_year INTEGER NOT NULL,
      tuition_fee_cents INTEGER DEFAULT 0,
      boarding_fee_cents INTEGER,
      activity_fee_cents INTEGER,
      exam_fee_cents INTEGER,
      library_fee_cents INTEGER,
      lab_fee_cents INTEGER,
      ict_fee_cents INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE grade_transition (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      from_grade INTEGER NOT NULL,
      to_grade INTEGER NOT NULL,
      transition_date TEXT NOT NULL,
      old_fee_structure_id INTEGER,
      new_fee_structure_id INTEGER NOT NULL,
      outstanding_balance_cents INTEGER DEFAULT 0,
      boarding_status_change TEXT DEFAULT 'NO_CHANGE',
      transition_notes TEXT,
      processed_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE student (
      id INTEGER PRIMARY KEY,
      admission_number TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      student_type TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_at DATETIME
    );

    CREATE TABLE stream (
      id INTEGER PRIMARY KEY,
      stream_name TEXT,
      level_order INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE enrollment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      stream_id INTEGER NOT NULL,
      student_type TEXT NOT NULL,
      enrollment_date TEXT,
      status TEXT NOT NULL
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

    -- Seed: Fee structure for grade 7
    INSERT INTO jss_fee_structure (id, grade, fiscal_year, tuition_fee_cents, boarding_fee_cents, activity_fee_cents, exam_fee_cents, is_active)
      VALUES (1, 7, 2026, 50000, 30000, 5000, 2000, 1);
    INSERT INTO jss_fee_structure (id, grade, fiscal_year, tuition_fee_cents, is_active)
      VALUES (2, 8, 2026, 55000, 1);

    -- Streams: grade 6 = level_order 6, grade 7 = level_order 7
    INSERT INTO stream (id, stream_name, level_order, is_active) VALUES (100, 'Grade 6A', 6, 1);
    INSERT INTO stream (id, stream_name, level_order, is_active) VALUES (200, 'Grade 7A', 7, 1);

    -- Students
    INSERT INTO student (id, admission_number, first_name, last_name, student_type, is_active)
      VALUES (10, 'ADM-10', 'Grace', 'Mutua', 'DAY_SCHOLAR', 1);
    INSERT INTO student (id, admission_number, first_name, last_name, student_type, is_active)
      VALUES (11, 'ADM-11', 'Sarah', 'Ochieng', 'BOARDER', 1);

    -- Enrollments: both in grade 6 stream
    INSERT INTO enrollment (id, student_id, stream_id, student_type, enrollment_date, status)
      VALUES (1, 10, 100, 'DAY_SCHOLAR', '2025-01-15', 'ACTIVE');
    INSERT INTO enrollment (id, student_id, stream_id, student_type, enrollment_date, status)
      VALUES (2, 11, 100, 'BOARDER', '2025-01-15', 'ACTIVE');

    -- Invoices
    INSERT INTO fee_invoice (id, student_id, total_amount, amount_due, amount, amount_paid, status)
      VALUES (1, 10, 0, 17000, 17000, 0, 'partial');
    INSERT INTO fee_invoice (id, student_id, total_amount, amount_due, amount, amount_paid, status)
      VALUES (2, 10, 7000, 7000, 7000, 8500, 'PARTIAL');
    INSERT INTO fee_invoice (id, student_id, total_amount, amount_due, amount, amount_paid, status)
      VALUES (3, 10, 9000, 9000, 9000, 0, 'cancelled');
    INSERT INTO fee_invoice (id, student_id, total_amount, amount_due, amount, amount_paid, status)
      VALUES (4, 11, NULL, NULL, 12000, 2000, 'OUTSTANDING');
    `)

    service = new JSSTransitionService()
  })

  afterEach(() => {
    db.close()
  })

  // ── Fee Structure ─────────────────────────────────────────────
  describe('getJSSFeeStructure', () => {
    it('returns fee structure for valid grade and year', () => {
      const fs = service.getJSSFeeStructure(7, 2026)
      expect(fs).not.toBeNull()
      expect(fs!.tuition_fee_cents).toBe(50000)
      expect(fs!.boarding_fee_cents).toBe(30000)
    })

    it('returns null for non-existent year', () => {
      const fs = service.getJSSFeeStructure(7, 1999)
      expect(fs).toBeNull()
    })

    it('rejects non-JSS grades', () => {
      expect(() => service.getJSSFeeStructure(5, 2026)).toThrow('JSS grades are 7, 8, and 9 only')
      expect(() => service.getJSSFeeStructure(10, 2026)).toThrow('JSS grades are 7, 8, and 9 only')
    })
  })

  describe('getAllJSSFeeStructures', () => {
    it('returns all active fee structures for a year', () => {
      const structures = service.getAllJSSFeeStructures(2026)
      expect(structures.length).toBe(2) // grade 7 and 8
    })

    it('returns empty for year with no structures', () => {
      const structures = service.getAllJSSFeeStructures(1999)
      expect(structures.length).toBe(0)
    })
  })

  describe('setJSSFeeStructure', () => {
    it('creates new fee structure and deactivates old', () => {
      const id = service.setJSSFeeStructure({
        grade: 7, fiscal_year: 2026,
        tuition_fee_cents: 60000, boarding_fee_cents: 35000,
      })
      expect(id).toBeGreaterThan(0)
      // Old grade 7 structure should be deactivated
      const old = db.prepare('SELECT is_active FROM jss_fee_structure WHERE id = 1').get() as any
      expect(old.is_active).toBe(0)
      // New one should be active
      const fs = service.getJSSFeeStructure(7, 2026)
      expect(fs!.tuition_fee_cents).toBe(60000)
    })

    it('rejects non-JSS grade', () => {
      expect(() => service.setJSSFeeStructure({
        grade: 5, fiscal_year: 2026, tuition_fee_cents: 10000,
      })).toThrow('JSS grades are 7, 8, and 9 only')
    })
  })

  describe('calculateJSSFeeForStudent', () => {
    it('calculates total for day scholar (no boarding)', () => {
      const total = service.calculateJSSFeeForStudent(7, 2026, false)
      // tuition 50000 + activity 5000 + exam 2000 = 57000 (no boarding)
      expect(total).toBe(57000)
    })

    it('calculates total for boarder (includes boarding)', () => {
      const total = service.calculateJSSFeeForStudent(7, 2026, true)
      // tuition 50000 + boarding 30000 + activity 5000 + exam 2000 = 87000
      expect(total).toBe(87000)
    })

    it('throws when no fee structure exists', () => {
      expect(() => service.calculateJSSFeeForStudent(9, 2026, false)).toThrow('No fee structure found')
    })
  })

  // ── Transition Processing ─────────────────────────────────────
  describe('processStudentTransition', () => {
    it('creates transition record and updates enrollment stream', () => {
      const transitionId = service.processStudentTransition({
        student_id: 10,
        from_grade: 6,
        to_grade: 7,
        transition_date: '2026-01-15',
        processed_by: 1,
      })
      expect(transitionId).toBeGreaterThan(0)

      // Grade transition record should exist
      const transition = db.prepare('SELECT * FROM grade_transition WHERE id = ?').get(transitionId) as any
      expect(transition.student_id).toBe(10)
      expect(transition.new_fee_structure_id).toBe(1)
      expect(transition.boarding_status_change).toBe('NO_CHANGE')

      // Enrollment stream should be updated to grade 7 stream (id=200)
      const enrollment = db.prepare('SELECT stream_id FROM enrollment WHERE id = 1').get() as any
      expect(enrollment.stream_id).toBe(200)
    })

    it('rejects invalid grade transitions', () => {
      expect(() => service.processStudentTransition({
        student_id: 10, from_grade: 6, to_grade: 8,
        transition_date: '2026-01-15', processed_by: 1,
      })).toThrow('Can only promote to next grade')
    })

    it('rejects non-JSS target grades', () => {
      expect(() => service.processStudentTransition({
        student_id: 10, from_grade: 5, to_grade: 6,
        transition_date: '2026-01-15', processed_by: 1,
      })).toThrow('grades 7-9 only')
    })

    it('throws when no fee structure for target grade', () => {
      expect(() => service.processStudentTransition({
        student_id: 10, from_grade: 8, to_grade: 9,
        transition_date: '2026-01-15', processed_by: 1,
      })).toThrow('No JSS fee structure found for grade 9')
    })

    it('updates boarding status when TO_BOARDER', () => {
      service.processStudentTransition({
        student_id: 10, from_grade: 6, to_grade: 7,
        transition_date: '2026-01-15',
        boarding_status_change: 'TO_BOARDER',
        processed_by: 1,
      })
      const student = db.prepare('SELECT student_type FROM student WHERE id = 10').get() as any
      expect(student.student_type).toBe('BOARDER')
    })

    it('updates boarding status when TO_DAY_SCHOLAR', () => {
      service.processStudentTransition({
        student_id: 11, from_grade: 6, to_grade: 7,
        transition_date: '2026-01-15',
        boarding_status_change: 'TO_DAY_SCHOLAR',
        processed_by: 1,
      })
      const student = db.prepare('SELECT student_type FROM student WHERE id = 11').get() as any
      expect(student.student_type).toBe('DAY_SCHOLAR')
    })
  })

  // ── Eligible Students ─────────────────────────────────────────
  describe('getEligibleStudentsForTransition', () => {
    it('calculates transition balances using normalized invoice amounts', () => {
      const students = service.getEligibleStudentsForTransition(6, 2026)
      expect(students).toHaveLength(2)
      const grace = students.find(s => s.student_id === 10)
      const sarah = students.find(s => s.student_id === 11)
      expect(grace?.outstanding_balance_cents).toBe(15500)
      expect(sarah?.outstanding_balance_cents).toBe(10000)
      expect(grace?.recommended_fee_structure).not.toBeNull()
    })

    it('returns empty for non-JSS target grade', () => {
      const students = service.getEligibleStudentsForTransition(9, 2026) // to_grade=10
      expect(students).toHaveLength(0)
    })
  })

  // ── Batch Processing ──────────────────────────────────────────
  describe('batchProcessTransitions', () => {
    it('processes multiple students and reports successes/failures', () => {
      const result = service.batchProcessTransitions({
        student_ids: [10, 11, 999],
        from_grade: 6, to_grade: 7,
        transition_date: '2026-01-15', processed_by: 1,
      })
      expect(result.successful).toContain(10)
      expect(result.successful).toContain(11)
      // Student 999 doesn't exist but processStudentTransition won't fail on non-existent
      // (it just creates the record). Let's check:
      expect(result.successful.length + result.failed.length).toBe(3)
    })
  })

  // ── History & Summary ─────────────────────────────────────────
  describe('getStudentTransitionHistory', () => {
    it('returns transition history for a student', () => {
      service.processStudentTransition({
        student_id: 10, from_grade: 6, to_grade: 7,
        transition_date: '2026-01-15', processed_by: 1,
      })
      const history = service.getStudentTransitionHistory(10)
      expect(history.length).toBe(1)
      expect(history[0].from_grade).toBe(6)
      expect(history[0].to_grade).toBe(7)
    })

    it('returns empty for no transitions', () => {
      const history = service.getStudentTransitionHistory(999)
      expect(history.length).toBe(0)
    })
  })

  describe('getTransitionSummary', () => {
    it('returns fiscal year summary with counts', () => {
      service.processStudentTransition({
        student_id: 10, from_grade: 6, to_grade: 7,
        transition_date: '2026-03-15',
        boarding_status_change: 'TO_BOARDER', processed_by: 1,
      })
      service.processStudentTransition({
        student_id: 11, from_grade: 6, to_grade: 7,
        transition_date: '2026-03-20', processed_by: 1,
      })

      const summary = service.getTransitionSummary(2026)
      expect(summary.fiscal_year).toBe(2026)
      expect(summary.total_transitions).toBe(2)
      expect(summary.grade_6_to_7).toBe(2)
      expect(summary.to_boarder_count).toBe(1)
    })

    it('returns zeros for year with no transitions', () => {
      const summary = service.getTransitionSummary(1990)
      expect(summary.total_transitions).toBe(0)
      expect(summary.grade_6_to_7).toBe(0)
    })
  })

  // ── Additional branch coverage ────────────────────────────────
  describe('additional branch coverage', () => {
    it('processStudentTransition with transition_notes stores the notes', () => {
      const id = service.processStudentTransition({
        student_id: 10, from_grade: 6, to_grade: 7,
        transition_date: '2026-01-15',
        transition_notes: 'Special case student',
        processed_by: 1,
      })
      const row = db.prepare('SELECT transition_notes FROM grade_transition WHERE id = ?').get(id) as any
      expect(row.transition_notes).toBe('Special case student')
    })

    it('processStudentTransition keeps current stream when no target stream found', () => {
      // Remove grade-7 streams so no target is found
      db.prepare('DELETE FROM stream WHERE level_order = 7').run()
      const id = service.processStudentTransition({
        student_id: 10, from_grade: 6, to_grade: 7,
        transition_date: '2026-01-15', processed_by: 1,
      })
      expect(id).toBeGreaterThan(0)
      // Enrollment should keep original stream (100) since no target found
      const enrollment = db.prepare('SELECT stream_id FROM enrollment WHERE student_id = 10 AND status = ?').get('ACTIVE') as any
      expect(enrollment.stream_id).toBe(100)
    })

    it('processStudentTransition with no active enrollment still creates transition', () => {
      // Deactivate all enrollments for student 10
      db.prepare("UPDATE enrollment SET status = 'INACTIVE' WHERE student_id = 10").run()
      const id = service.processStudentTransition({
        student_id: 10, from_grade: 6, to_grade: 7,
        transition_date: '2026-01-15', processed_by: 1,
      })
      expect(id).toBeGreaterThan(0)
    })

    it('batchProcessTransitions records failures for invalid transitions', () => {
      const result = service.batchProcessTransitions({
        student_ids: [10],
        from_grade: 6, to_grade: 8, // skip grade → throws
        transition_date: '2026-01-15', processed_by: 1,
      })
      expect(result.failed.length).toBe(1)
      expect(result.failed[0]!.error).toContain('next grade')
      expect(result.successful.length).toBe(0)
    })

    it('batchProcessTransitions records Unknown error for non-Error throws', () => {
      vi.spyOn(service, 'processStudentTransition').mockImplementation(() => {
        throw 'some string error' // NOSONAR
      })
      const result = service.batchProcessTransitions({
        student_ids: [10],
        from_grade: 6, to_grade: 7,
        transition_date: '2026-01-15', processed_by: 1,
      })
      expect(result.failed.length).toBe(1)
      expect(result.failed[0]!.error).toBe('Unknown error')
      expect(result.successful.length).toBe(0)
    })

    it('setJSSFeeStructure with all optional fee fields as 0 stores null', () => {
      const id = service.setJSSFeeStructure({
        grade: 9, fiscal_year: 2026,
        tuition_fee_cents: 40000,
        boarding_fee_cents: 0,
        activity_fee_cents: 0,
        exam_fee_cents: 0,
        library_fee_cents: 0,
        lab_fee_cents: 0,
        ict_fee_cents: 0,
      })
      expect(id).toBeGreaterThan(0)
      const fs = db.prepare('SELECT * FROM jss_fee_structure WHERE id = ?').get(id) as any
      // 0 is falsy → || null → stored as null
      expect(fs.boarding_fee_cents).toBeNull()
      expect(fs.library_fee_cents).toBeNull()
    })

    it('calculateJSSFeeForStudent includes library, lab, ict fees', () => {
      service.setJSSFeeStructure({
        grade: 9, fiscal_year: 2026,
        tuition_fee_cents: 40000,
        boarding_fee_cents: 20000,
        activity_fee_cents: 3000,
        exam_fee_cents: 1000,
        library_fee_cents: 500,
        lab_fee_cents: 700,
        ict_fee_cents: 800,
      })
      const total = service.calculateJSSFeeForStudent(9, 2026, true)
      // 40000 + 20000 + 3000 + 1000 + 500 + 700 + 800 = 66000
      expect(total).toBe(66000)
    })

    it('calculateJSSFeeForStudent falls back to 0 for null activity and exam fees', () => {
      // Grade 8 seed has tuition_fee_cents only; activity/exam are null
      const total = service.calculateJSSFeeForStudent(8, 2026, false)
      // tuition 55000, everything else null → || 0
      expect(total).toBe(55000)
    })
  })
})
