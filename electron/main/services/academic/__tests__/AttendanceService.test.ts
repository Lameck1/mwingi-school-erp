import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db,
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn(),
}))

import { AttendanceService } from '../AttendanceService'

describe('AttendanceService.markAttendance', () => {
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

      CREATE TABLE user (id INTEGER PRIMARY KEY);
      CREATE TABLE stream (id INTEGER PRIMARY KEY);
      CREATE TABLE academic_year (id INTEGER PRIMARY KEY);
      CREATE TABLE term (id INTEGER PRIMARY KEY);
      CREATE TABLE student (id INTEGER PRIMARY KEY);

      CREATE TABLE enrollment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        stream_id INTEGER NOT NULL,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        status TEXT NOT NULL
      );

      CREATE TABLE attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        stream_id INTEGER NOT NULL,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        attendance_date DATE NOT NULL,
        status TEXT NOT NULL,
        notes TEXT,
        marked_by_user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE UNIQUE INDEX idx_attendance_student_day_term_unique
      ON attendance(student_id, academic_year_id, term_id, attendance_date);

      INSERT INTO user (id) VALUES (5);
      INSERT INTO stream (id) VALUES (10);
      INSERT INTO academic_year (id) VALUES (2026);
      INSERT INTO term (id) VALUES (1);
      INSERT INTO student (id) VALUES (100), (101), (102);
      INSERT INTO enrollment (student_id, stream_id, academic_year_id, term_id, status)
      VALUES
        (100, 10, 2026, 1, 'ACTIVE'),
        (101, 10, 2026, 1, 'ACTIVE');
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('upserts attendance rows without destructive delete behavior', async () => {
    const service = new AttendanceService()
    const date = '2026-02-14'

    const firstRun = await service.markAttendance(
      [
        { student_id: 100, status: 'PRESENT' },
        { student_id: 101, status: 'ABSENT' },
      ],
      10,
      date,
      2026,
      1,
      5,
    )

    expect(firstRun.success).toBe(true)
    expect(firstRun.marked).toBe(2)

    const secondRun = await service.markAttendance(
      [{ student_id: 100, status: 'LATE', notes: 'Traffic delay' }],
      10,
      date,
      2026,
      1,
      5,
    )

    expect(secondRun.success).toBe(true)
    expect(secondRun.marked).toBe(1)

    const rows = db.prepare(`
      SELECT student_id, status, notes
      FROM attendance
      WHERE attendance_date = ?
      ORDER BY student_id
    `).all(date) as Array<{ student_id: number; status: string; notes: string | null }>

    expect(rows).toEqual([
      { student_id: 100, status: 'LATE', notes: 'Traffic delay' },
      { student_id: 101, status: 'ABSENT', notes: null },
    ])
  })

  it('rejects entries for students not actively enrolled in stream/year/term', async () => {
    const service = new AttendanceService()
    const result = await service.markAttendance(
      [{ student_id: 102, status: 'PRESENT' }],
      10,
      '2026-02-14',
      2026,
      1,
      5,
    )

    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('not actively enrolled')

    const count = db.prepare('SELECT COUNT(*) as count FROM attendance').get() as { count: number }
    expect(count.count).toBe(0)
  })

  it('rejects attendance date in the future', async () => {
    const service = new AttendanceService()
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const futureDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`

    const result = await service.markAttendance(
      [{ student_id: 100, status: 'PRESENT' }],
      10,
      futureDate,
      2026,
      1,
      5,
    )

    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('future')
  })
})

describe('AttendanceService read methods and validation', () => {
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
      account_code TEXT NOT NULL UNIQUE, account_name TEXT NOT NULL,
      account_type TEXT NOT NULL, normal_balance TEXT NOT NULL, is_active BOOLEAN DEFAULT 1
    );
    INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1100', 'Accounts Receivable', 'ASSET', 'DEBIT');
    INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('2020', 'Student Credit Balance', 'LIABILITY', 'CREDIT');
    INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1010', 'Cash', 'ASSET', 'DEBIT');
    INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1020', 'Bank', 'ASSET', 'DEBIT');
    INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('4010', 'Tuition Revenue', 'REVENUE', 'CREDIT');
    CREATE TABLE IF NOT EXISTS journal_entry (
      id INTEGER PRIMARY KEY AUTOINCREMENT, entry_ref TEXT NOT NULL UNIQUE,
      entry_date DATE NOT NULL, entry_type TEXT NOT NULL, description TEXT NOT NULL,
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

      CREATE TABLE user (id INTEGER PRIMARY KEY);
      CREATE TABLE stream (id INTEGER PRIMARY KEY);
      CREATE TABLE academic_year (id INTEGER PRIMARY KEY, start_date DATE, end_date DATE);
      CREATE TABLE term (id INTEGER PRIMARY KEY, academic_year_id INTEGER, start_date DATE, end_date DATE);
      CREATE TABLE student (
        id INTEGER PRIMARY KEY,
        first_name TEXT DEFAULT '',
        last_name TEXT DEFAULT '',
        admission_number TEXT DEFAULT '',
        is_active BOOLEAN DEFAULT 1
      );

      CREATE TABLE enrollment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        stream_id INTEGER NOT NULL,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        status TEXT NOT NULL
      );

      CREATE TABLE attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        stream_id INTEGER NOT NULL,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        attendance_date DATE NOT NULL,
        status TEXT NOT NULL,
        notes TEXT,
        marked_by_user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE UNIQUE INDEX idx_attendance_student_day_term_unique
      ON attendance(student_id, academic_year_id, term_id, attendance_date);

      INSERT INTO user (id) VALUES (5);
      INSERT INTO stream (id) VALUES (10);
      INSERT INTO academic_year (id, start_date, end_date) VALUES (2026, '2026-01-01', '2026-12-31');
      INSERT INTO term (id, academic_year_id, start_date, end_date) VALUES (1, 2026, '2026-01-05', '2026-04-10');
      INSERT INTO student (id, first_name, last_name, admission_number) VALUES
        (100, 'Alice', 'Mwangi', 'ADM-100'),
        (101, 'Bob', 'Kamau', 'ADM-101'),
        (102, 'Carol', 'Wanjiku', 'ADM-102');
      INSERT INTO enrollment (student_id, stream_id, academic_year_id, term_id, status)
      VALUES
        (100, 10, 2026, 1, 'ACTIVE'),
        (101, 10, 2026, 1, 'ACTIVE');

      INSERT INTO attendance (student_id, stream_id, academic_year_id, term_id, attendance_date, status, marked_by_user_id)
      VALUES
        (100, 10, 2026, 1, '2026-02-10', 'PRESENT', 5),
        (100, 10, 2026, 1, '2026-02-11', 'PRESENT', 5),
        (100, 10, 2026, 1, '2026-02-12', 'ABSENT', 5),
        (101, 10, 2026, 1, '2026-02-10', 'PRESENT', 5),
        (101, 10, 2026, 1, '2026-02-11', 'LATE', 5);
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('getAttendanceByDate returns records for given stream and date', async () => {
    const service = new AttendanceService()
    const records = await service.getAttendanceByDate(10, '2026-02-10', 2026, 1)
    expect(records).toHaveLength(2)
    expect(records[0].student_name).toBeDefined()
  })

  it('getStudentAttendanceSummary returns summary with term filter', async () => {
    const service = new AttendanceService()
    const summary = await service.getStudentAttendanceSummary(100, 2026, 1)
    expect(summary.total_days).toBe(3)
    expect(summary.present).toBe(2)
    expect(summary.absent).toBe(1)
    expect(summary.attendance_rate).toBeGreaterThan(0)
  })

  it('getStudentAttendanceSummary returns summary without term filter', async () => {
    const service = new AttendanceService()
    const summary = await service.getStudentAttendanceSummary(100, 2026)
    expect(summary.total_days).toBe(3)
  })

  it('getClassAttendanceSummary returns aggregated counts', async () => {
    const service = new AttendanceService()
    const summary = await service.getClassAttendanceSummary(10, '2026-02-10', 2026, 1)
    expect(summary.total).toBe(2)
    expect(summary.present).toBe(2)
  })

  it('getStudentsForAttendance returns enrolled students', async () => {
    const service = new AttendanceService()
    const students = await service.getStudentsForAttendance(10, 2026, 1)
    expect(students).toHaveLength(2)
    expect(students[0].student_name).toBeDefined()
    expect(students[0].admission_number).toBeDefined()
  })

  it('markAttendance rejects invalid stream/year/term context', async () => {
    const service = new AttendanceService()
    const result = await service.markAttendance(
      [{ student_id: 100, status: 'PRESENT' }], 0, '2026-02-14', 2026, 1, 5,
    )
    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('Invalid attendance context')
  })

  it('markAttendance rejects invalid user context', async () => {
    const service = new AttendanceService()
    const result = await service.markAttendance(
      [{ student_id: 100, status: 'PRESENT' }], 10, '2026-02-14', 2026, 1, 0,
    )
    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('Invalid user context')
  })

  it('markAttendance rejects empty entries', async () => {
    const service = new AttendanceService()
    const result = await service.markAttendance([], 10, '2026-02-14', 2026, 1, 5)
    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('At least one')
  })

  it('markAttendance rejects duplicate student_id entries', async () => {
    const service = new AttendanceService()
    const result = await service.markAttendance(
      [
        { student_id: 100, status: 'PRESENT' },
        { student_id: 100, status: 'ABSENT' },
      ],
      10, '2026-02-14', 2026, 1, 5,
    )
    expect(result.success).toBe(false)
    expect(result.errors!.join(',')).toContain('Duplicate')
  })

  it('markAttendance rejects invalid attendance status', async () => {
    const service = new AttendanceService()
    const result = await service.markAttendance(
      [{ student_id: 100, status: 'INVALID' as 'PRESENT' }],
      10, '2026-02-14', 2026, 1, 5,
    )
    expect(result.success).toBe(false)
    expect(result.errors!.join(',')).toContain('Invalid attendance status')
  })

  it('markAttendance rejects invalid date format', async () => {
    const service = new AttendanceService()
    const result = await service.markAttendance(
      [{ student_id: 100, status: 'PRESENT' }],
      10, '14-02-2026', 2026, 1, 5,
    )
    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('YYYY-MM-DD')
  })

  it('markAttendance rejects date outside term period', async () => {
    const service = new AttendanceService()
    const result = await service.markAttendance(
      [{ student_id: 100, status: 'PRESENT' }],
      10, '2025-12-01', 2026, 1, 5,
    )
    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('within the selected')
  })

  it('markAttendance rejects invalid student_id', async () => {
    const service = new AttendanceService()
    const result = await service.markAttendance(
      [{ student_id: -1, status: 'PRESENT' }],
      10, '2026-02-14', 2026, 1, 5,
    )
    expect(result.success).toBe(false)
    expect(result.errors!.join(',')).toContain('invalid student IDs')
  })

  it('markAttendance rejects future dates', async () => {
    const service = new AttendanceService()
    const result = await service.markAttendance(
      [{ student_id: 100, status: 'PRESENT' }],
      10, '2099-12-31', 2026, 1, 5,
    )
    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('future')
  })

  it('markAttendance rejects date outside academic year window', async () => {
    // Term dates pass (2026-01-05 to 2026-04-10)
    // but academic year starts 2026-01-01, ends 2026-12-31
    // So a date within academic year but outside term should fail at term check
    // We test date outside academic year entirely
    const service = new AttendanceService()
    const result = await service.markAttendance(
      [{ student_id: 100, status: 'PRESENT' }],
      10, '2025-06-15', 2026, 1, 5,
    )
    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('within the selected')
  })

  it('getStudentAttendanceSummary returns zero stats for student with no records', async () => {
    const service = new AttendanceService()
    const summary = await service.getStudentAttendanceSummary(102, 2026, 1)
    expect(summary.total_days).toBe(0)
    expect(summary.present).toBe(0)
    expect(summary.absent).toBe(0)
    expect(summary.attendance_rate).toBe(0)
  })

  it('markAttendance succeeds for valid entries', async () => {
    const service = new AttendanceService()
    const result = await service.markAttendance(
      [{ student_id: 100, status: 'PRESENT' }, { student_id: 101, status: 'ABSENT' }],
      10, '2026-02-14', 2026, 1, 5,
    )
    expect(result.success).toBe(true)
    expect(result.marked).toBe(2)
  })

  // ── branch coverage: hasColumn catch block (L70) ──
  it('skips term/year date checks when PRAGMA table_info throws (hasColumn catch)', async () => {
    const service = new AttendanceService()
    const origPrepare = db.prepare.bind(db)
    vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('PRAGMA table_info')) {
        throw new Error('simulated PRAGMA failure')
      }
      return origPrepare(sql)
    })
    const result = await service.markAttendance(
      [{ student_id: 100, status: 'PRESENT' }],
      10, '2026-02-14', 2026, 1, 5,
    )
    expect(result.success).toBe(true)
    vi.restoreAllMocks()
  })

  // ── branch coverage: termWindow undefined (L93) ──
  it('markAttendance rejects when term row not found for given term/year combo', async () => {
    const service = new AttendanceService()
    const result = await service.markAttendance(
      [{ student_id: 100, status: 'PRESENT' }],
      10, '2026-02-14', 2026, 99, 5,
    )
    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('term context is invalid')
  })

  // ── branch coverage: yearWindow undefined (L109) ──
  it('markAttendance rejects when academic year row not found after term check passes', async () => {
    db.prepare(`INSERT INTO term (id, academic_year_id, start_date, end_date) VALUES (99, 9999, '2026-01-01', '2026-12-31')`).run()
    const service = new AttendanceService()
    const result = await service.markAttendance(
      [{ student_id: 100, status: 'PRESENT' }],
      10, '2026-02-14', 9999, 99, 5,
    )
    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('academic year context is invalid')
  })

  // ── branch coverage: date outside academic year period (L112) ──
  it('markAttendance rejects date within term but outside academic year range', async () => {
    db.prepare(`INSERT INTO academic_year (id, start_date, end_date) VALUES (7777, '2026-03-01', '2026-09-30')`).run()
    db.prepare(`INSERT INTO term (id, academic_year_id, start_date, end_date) VALUES (77, 7777, '2026-01-01', '2026-12-31')`).run()
    const service = new AttendanceService()
    const result = await service.markAttendance(
      [{ student_id: 100, status: 'PRESENT' }],
      10, '2026-02-14', 7777, 77, 5,
    )
    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('within the selected academic year')
  })

  // ── branch coverage: non-Error exception in markAttendance catch (L245) ──
  it('markAttendance returns Unknown error for non-Error exception in transaction', async () => {
    const service = new AttendanceService()
    const origPrepare = db.prepare.bind(db)
    vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO attendance')) {
        return { run: () => { throw 42 } } as any // NOSONAR
      }
      return origPrepare(sql)
    })
    const result = await service.markAttendance(
      [{ student_id: 100, status: 'PRESENT' }],
      10, '2026-02-14', 2026, 1, 5,
    )
    expect(result.success).toBe(false)
    expect(result.errors).toEqual(['Unknown error'])
    vi.restoreAllMocks()
  })

  // ── branch coverage: real Error exception in markAttendance catch (L245 true) ──
  it('markAttendance returns error message for real Error exception in transaction', async () => {
    db.exec("CREATE TRIGGER fail_att BEFORE INSERT ON attendance BEGIN SELECT RAISE(FAIL, 'forced DB error'); END")
    const service = new AttendanceService()
    const result = await service.markAttendance(
      [{ student_id: 100, status: 'PRESENT' }],
      10, '2026-02-14', 2026, 1, 5,
    )
    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('forced DB error')
    db.exec('DROP TRIGGER IF EXISTS fail_att')
  })

  // ── branch coverage L323, L327: getClassAttendanceSummary returns zeros for no matching rows ──
  it('getClassAttendanceSummary returns all zeros when no attendance records match', async () => {
    const service = new AttendanceService()
    // Use a stream_id that has NO attendance records → SUM returns null, COUNT returns 0
    const summary = await service.getClassAttendanceSummary(9999, '2099-12-31', 9999, 9999)
    expect(summary.present).toBe(0)
    expect(summary.absent).toBe(0)
    expect(summary.late).toBe(0)
    expect(summary.excused).toBe(0)
    expect(summary.total).toBe(0)
  })
})
