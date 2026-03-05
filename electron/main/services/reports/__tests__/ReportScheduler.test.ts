import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db
}))

import { ReportScheduler } from '../ReportScheduler'

interface SchedulerInternals {
  generateReportPayload(schedule: {
    id: number
    report_name: string
    report_type: string
    parameters: string
    schedule_type: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'TERM_END' | 'YEAR_END'
    day_of_week: number | null
    day_of_month: number | null
    time_of_day: string
    recipients: string
    export_format: 'PDF' | 'EXCEL' | 'CSV'
    is_active: boolean
    last_run_at: string | null
    next_run_at: string | null
    created_by_user_id: number
    created_at: string
  }, startDate: string, endDate: string): Promise<Array<{ invoice_number: string; balance: number }>>
}

type ScheduleType = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'TERM_END' | 'YEAR_END'

interface TestSchedule {
  id: number
  report_name: string
  report_type: string
  parameters: string
  schedule_type: ScheduleType
  day_of_week: number | null
  day_of_month: number | null
  time_of_day: string
  recipients: string
  export_format: 'PDF' | 'EXCEL' | 'CSV'
  is_active: boolean
  last_run_at: string | null
  next_run_at: string | null
  created_by_user_id: number
  created_at: string
}

describe('ReportScheduler defaulters payload normalization', () => {
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

      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY,
        student_id INTEGER NOT NULL,
        invoice_number TEXT NOT NULL,
        total_amount REAL,
        amount_due REAL,
        amount REAL,
        amount_paid REAL,
        status TEXT,
        due_date TEXT
      );
    `)

    db.exec(`
      INSERT INTO student (id, admission_number, first_name, last_name)
      VALUES
        (1, 'ADM-001', 'Grace', 'Mutua'),
        (2, 'ADM-002', 'Sarah', 'Ochieng');

      INSERT INTO fee_invoice (id, student_id, invoice_number, total_amount, amount_due, amount, amount_paid, status, due_date)
      VALUES
        (1, 1, 'INV-1', 0, 17000, 17000, 0, 'pending', '2026-01-10'),
        (2, 2, 'INV-2', NULL, NULL, 9000, 1000, 'partial', '2026-01-12'),
        (3, 1, 'INV-3', 9000, 9000, 9000, 0, 'cancelled', '2026-01-14');
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('includes lowercase outstanding statuses and excludes cancelled invoices', async () => {
    const scheduler = new ReportScheduler()
    const schedule = {
      id: 1,
      report_name: 'Defaulters',
      report_type: 'DEFAULTERS_LIST',
      parameters: '{}',
      schedule_type: 'DAILY' as const,
      day_of_week: null,
      day_of_month: null,
      time_of_day: '09:00',
      recipients: '[]',
      export_format: 'PDF' as const,
      is_active: true,
      last_run_at: null,
      next_run_at: null,
      created_by_user_id: 1,
      created_at: '2026-01-01T00:00:00.000Z'
    }

    const payload = await (scheduler as unknown as SchedulerInternals)
      .generateReportPayload(schedule, '2026-01-01', '2026-01-31')

    expect(payload).toHaveLength(2)
    expect(payload[0]).toMatchObject({ invoice_number: 'INV-1', balance: 17000 })
    expect(payload[1]).toMatchObject({ invoice_number: 'INV-2', balance: 8000 })
  })
})

/* ==================================================================
 *  Branch-coverage additions: shouldRun, validateSchedule, CRUD,
 *  resolveWindow, parseRecipients, generateReportPayload variants,
 *  initialize/shutdown, executeReport
 * ================================================================== */
describe('ReportScheduler – branch coverage', () => {
  let scheduler: ReportScheduler

  const baseSchedule: TestSchedule = {
    id: 1,
    report_name: 'Test Report',
    report_type: 'DEFAULTERS_LIST',
    parameters: '{}',
    schedule_type: 'DAILY',
    day_of_week: null,
    day_of_month: null,
    time_of_day: '09:00',
    recipients: '["admin@school.com"]',
    export_format: 'PDF',
    is_active: true,
    last_run_at: null,
    next_run_at: null,
    created_by_user_id: 1,
    created_at: '2026-01-01T00:00:00.000Z'
  }

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE IF NOT EXISTS fee_category (id INTEGER PRIMARY KEY, category_name TEXT NOT NULL UNIQUE, description TEXT, is_active BOOLEAN DEFAULT 1, priority INTEGER DEFAULT 99, gl_account_id INTEGER);
      CREATE TABLE IF NOT EXISTS invoice_item (id INTEGER PRIMARY KEY, invoice_id INTEGER NOT NULL, fee_category_id INTEGER NOT NULL, description TEXT NOT NULL, amount INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS receipt (id INTEGER PRIMARY KEY, receipt_number TEXT NOT NULL UNIQUE, transaction_id INTEGER NOT NULL UNIQUE, receipt_date DATE NOT NULL, student_id INTEGER NOT NULL, amount INTEGER NOT NULL, amount_in_words TEXT, payment_method TEXT NOT NULL, payment_reference TEXT, printed_count INTEGER DEFAULT 0, created_by_user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS gl_account (id INTEGER PRIMARY KEY, account_code TEXT NOT NULL UNIQUE, account_name TEXT NOT NULL, account_type TEXT NOT NULL, normal_balance TEXT NOT NULL, is_active BOOLEAN DEFAULT 1);
      INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1100', 'Accounts Receivable', 'ASSET', 'DEBIT');
      INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('2020', 'Student Credit Balance', 'LIABILITY', 'CREDIT');
      INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1010', 'Cash', 'ASSET', 'DEBIT');
      INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1020', 'Bank', 'ASSET', 'DEBIT');
      INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('4010', 'Tuition Revenue', 'REVENUE', 'CREDIT');
      CREATE TABLE IF NOT EXISTS journal_entry (id INTEGER PRIMARY KEY, entry_ref TEXT NOT NULL UNIQUE, entry_date DATE NOT NULL, entry_type TEXT NOT NULL, description TEXT NOT NULL, student_id INTEGER, staff_id INTEGER, term_id INTEGER, is_posted BOOLEAN DEFAULT 0, posted_by_user_id INTEGER, posted_at DATETIME, is_voided BOOLEAN DEFAULT 0, voided_reason TEXT, voided_by_user_id INTEGER, voided_at DATETIME, requires_approval BOOLEAN DEFAULT 0, approval_status TEXT DEFAULT 'PENDING', approved_by_user_id INTEGER, approved_at DATETIME, created_by_user_id INTEGER NOT NULL, source_ledger_txn_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS journal_entry_line (id INTEGER PRIMARY KEY, journal_entry_id INTEGER NOT NULL, line_number INTEGER NOT NULL, gl_account_id INTEGER NOT NULL, debit_amount INTEGER DEFAULT 0, credit_amount INTEGER DEFAULT 0, description TEXT);
      CREATE TABLE IF NOT EXISTS approval_rule (id INTEGER PRIMARY KEY, rule_name TEXT NOT NULL UNIQUE, description TEXT, transaction_type TEXT NOT NULL, min_amount INTEGER, max_amount INTEGER, days_since_transaction INTEGER, required_role_id INTEGER, is_active BOOLEAN DEFAULT 1, created_by_user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS student (id INTEGER PRIMARY KEY, admission_number TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, gender TEXT, admission_date TEXT, is_active BOOLEAN DEFAULT 1);
      CREATE TABLE IF NOT EXISTS fee_invoice (id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL, invoice_number TEXT NOT NULL, total_amount REAL, amount_due REAL, amount REAL, amount_paid REAL, status TEXT, due_date TEXT);
      CREATE TABLE IF NOT EXISTS ledger_transaction (id INTEGER PRIMARY KEY, transaction_ref TEXT, transaction_date TEXT, transaction_type TEXT, category_id INTEGER, amount REAL, debit_credit TEXT, student_id INTEGER, payment_method TEXT, payment_reference TEXT, description TEXT, term_id INTEGER, recorded_by_user_id INTEGER, is_voided INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS transaction_category (id INTEGER PRIMARY KEY, category_name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS scheduled_report (id INTEGER PRIMARY KEY AUTOINCREMENT, report_name TEXT NOT NULL, report_type TEXT NOT NULL, parameters TEXT DEFAULT '{}', schedule_type TEXT NOT NULL, day_of_week INTEGER, day_of_month INTEGER, time_of_day TEXT NOT NULL, recipients TEXT DEFAULT '[]', export_format TEXT DEFAULT 'PDF', is_active BOOLEAN DEFAULT 1, last_run_at DATETIME, next_run_at DATETIME, created_by_user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS report_execution_log (id INTEGER PRIMARY KEY AUTOINCREMENT, scheduled_report_id INTEGER NOT NULL, execution_time DATETIME, status TEXT, recipients_notified INTEGER DEFAULT 0, error_message TEXT);
      CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, action_type TEXT NOT NULL, table_name TEXT NOT NULL, record_id INTEGER, old_values TEXT, new_values TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS academic_year (id INTEGER PRIMARY KEY AUTOINCREMENT, year_name TEXT NOT NULL UNIQUE, start_date DATE NOT NULL, end_date DATE NOT NULL, is_current BOOLEAN DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS term (id INTEGER PRIMARY KEY AUTOINCREMENT, academic_year_id INTEGER NOT NULL, term_number INTEGER NOT NULL, term_name TEXT NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL, is_current BOOLEAN DEFAULT 0, status TEXT DEFAULT 'OPEN', FOREIGN KEY (academic_year_id) REFERENCES academic_year(id), UNIQUE(academic_year_id, term_number));
      INSERT INTO student VALUES (1, 'ADM-001', 'Grace', 'Mutua', 'F', '2024-01-01', 1);
      INSERT INTO fee_invoice VALUES (1, 1, 'INV-1', 17000, 17000, 17000, 0, 'pending', '2026-01-10');
    `)
    scheduler = new ReportScheduler()
  })

  afterEach(() => {
    scheduler.shutdown()
    db.close()
  })

  // ── shouldRun branch coverage ──
  describe('shouldRun', () => {
    const callShouldRun = (sched: TestSchedule, date: Date) =>
      (scheduler as any).shouldRun(sched, date)

    it('returns true for DAILY schedule when time matches', () => {
      const now = new Date('2026-03-15T09:00:00')
      expect(callShouldRun(baseSchedule, now)).toBe(true)
    })

    it('returns false for DAILY schedule when time does not match', () => {
      const now = new Date('2026-03-15T10:00:00')
      expect(callShouldRun(baseSchedule, now)).toBe(false)
    })

    it('returns true for WEEKLY schedule on matching day', () => {
      // 2026-03-16 is a Monday (day_of_week=1)
      const sched = { ...baseSchedule, schedule_type: 'WEEKLY' as const, day_of_week: 1 }
      const now = new Date('2026-03-16T09:00:00')
      expect(callShouldRun(sched, now)).toBe(true)
    })

    it('returns false for WEEKLY schedule on wrong day', () => {
      const sched = { ...baseSchedule, schedule_type: 'WEEKLY' as const, day_of_week: 5 }
      const now = new Date('2026-03-16T09:00:00') // Monday
      expect(callShouldRun(sched, now)).toBe(false)
    })

    it('returns true for MONTHLY schedule on matching day of month', () => {
      const sched = { ...baseSchedule, schedule_type: 'MONTHLY' as const, day_of_month: 15 }
      const now = new Date('2026-03-15T09:00:00')
      expect(callShouldRun(sched, now)).toBe(true)
    })

    it('returns false for MONTHLY schedule on wrong day of month', () => {
      const sched = { ...baseSchedule, schedule_type: 'MONTHLY' as const, day_of_month: 20 }
      const now = new Date('2026-03-15T09:00:00')
      expect(callShouldRun(sched, now)).toBe(false)
    })

    it('returns true for TERM_END schedule when today is term end date', () => {
      db.exec(`
        INSERT INTO academic_year (year_name, start_date, end_date, is_current) VALUES ('2026', '2026-01-01', '2026-12-31', 1);
        INSERT INTO term (academic_year_id, term_number, term_name, start_date, end_date, is_current) VALUES (1, 1, 'Term 1', '2026-01-01', '2026-03-15', 1);
      `)
      const sched = { ...baseSchedule, schedule_type: 'TERM_END' as const }
      const now = new Date('2026-03-15T09:00:00')
      expect(callShouldRun(sched, now)).toBe(true)
    })

    it('returns false for TERM_END schedule when today is not term end date', () => {
      db.exec(`
        INSERT OR IGNORE INTO academic_year (year_name, start_date, end_date, is_current) VALUES ('2026', '2026-01-01', '2026-12-31', 1);
        INSERT OR IGNORE INTO term (academic_year_id, term_number, term_name, start_date, end_date, is_current) VALUES (1, 1, 'Term 1', '2026-01-01', '2026-04-10', 1);
      `)
      const sched = { ...baseSchedule, schedule_type: 'TERM_END' as const }
      const now = new Date('2026-03-15T09:00:00')
      expect(callShouldRun(sched, now)).toBe(false)
    })

    it('returns false for TERM_END schedule when no current term exists', () => {
      const sched = { ...baseSchedule, schedule_type: 'TERM_END' as const }
      const now = new Date('2026-03-15T09:00:00')
      expect(callShouldRun(sched, now)).toBe(false)
    })

    it('returns true for YEAR_END schedule when today is academic year end date', () => {
      db.exec(`
        INSERT OR IGNORE INTO academic_year (year_name, start_date, end_date, is_current) VALUES ('2026', '2026-01-01', '2026-03-15', 1);
      `)
      const sched = { ...baseSchedule, schedule_type: 'YEAR_END' as const }
      const now = new Date('2026-03-15T09:00:00')
      expect(callShouldRun(sched, now)).toBe(true)
    })

    it('returns false for YEAR_END schedule when today is not academic year end date', () => {
      db.exec(`
        INSERT OR IGNORE INTO academic_year (year_name, start_date, end_date, is_current) VALUES ('2026', '2026-01-01', '2026-12-31', 1);
      `)
      const sched = { ...baseSchedule, schedule_type: 'YEAR_END' as const }
      const now = new Date('2026-03-15T09:00:00')
      expect(callShouldRun(sched, now)).toBe(false)
    })

    it('returns false for YEAR_END schedule when no current academic year exists', () => {
      const sched = { ...baseSchedule, schedule_type: 'YEAR_END' as const }
      const now = new Date('2026-03-15T09:00:00')
      expect(callShouldRun(sched, now)).toBe(false)
    })
  })

  // ── parseRecipients branch coverage ──
  describe('parseRecipients', () => {
    const callParse = (raw: string) => (scheduler as any).parseRecipients(raw)

    it('parses valid JSON array of emails', () => {
      expect(callParse('["a@b.com","c@d.com"]')).toEqual(['a@b.com', 'c@d.com'])
    })

    it('returns empty for invalid JSON', () => {
      expect(callParse('not json')).toEqual([])
    })

    it('returns empty for non-array JSON', () => {
      expect(callParse('{"email":"a@b.com"}')).toEqual([])
    })

    it('filters out entries without @ or too short', () => {
      expect(callParse('["ab","x@y.com","no"]')).toEqual(['x@y.com'])
    })
  })

  // ── validateSchedule branch coverage ──
  describe('validateSchedule', () => {
    const callValidate = (data: Partial<TestSchedule>) =>
      (scheduler as any).validateSchedule(data)

    it('returns errors for empty report_name and report_type', () => {
      const errors = callValidate({ report_name: '', report_type: '', time_of_day: '09:00', recipients: '["a@b.com"]' })
      expect(errors).toContain('Report name is required')
      expect(errors).toContain('Report type is required')
    })

    it('rejects invalid time format', () => {
      const errors = callValidate({ ...baseSchedule, time_of_day: '9am' })
      expect(errors).toContain('Time must be in HH:MM 24-hour format')
    })

    it('requires day_of_week for WEEKLY schedules', () => {
      const errors = callValidate({ ...baseSchedule, schedule_type: 'WEEKLY' as const, day_of_week: null })
      expect(errors.some((e: string) => e.includes('day_of_week'))).toBe(true)
    })

    it('requires day_of_month for MONTHLY schedules', () => {
      const errors = callValidate({ ...baseSchedule, schedule_type: 'MONTHLY' as const, day_of_month: null })
      expect(errors.some((e: string) => e.includes('day_of_month'))).toBe(true)
    })

    it('accepts TERM_END schedule type', () => {
      const errors = callValidate({ ...baseSchedule, schedule_type: 'TERM_END' as const })
      expect(errors.every((e: string) => !e.includes('TERM_END'))).toBe(true)
    })

    it('accepts YEAR_END schedule type', () => {
      const errors = callValidate({ ...baseSchedule, schedule_type: 'YEAR_END' as const })
      expect(errors.every((e: string) => !e.includes('YEAR_END'))).toBe(true)
    })

    it('rejects empty recipients list', () => {
      const errors = callValidate({ ...baseSchedule, recipients: '[]' })
      expect(errors.some((e: string) => e.includes('recipient'))).toBe(true)
    })
  })

  // ── CRUD operations ──
  describe('createSchedule / updateSchedule / deleteSchedule', () => {
    it('createSchedule inserts a record and returns id', () => {
      const result = scheduler.createSchedule({
        report_name: 'Fee Collection Daily',
        report_type: 'FEE_COLLECTION',
        parameters: '{}',
        schedule_type: 'DAILY',
        day_of_week: null,
        day_of_month: null,
        time_of_day: '08:00',
        recipients: '["admin@school.com"]',
        export_format: 'PDF',
        is_active: true,
        created_by_user_id: 1
      }, 1)
      expect(result.success).toBe(true)
      expect(result.id).toBeGreaterThan(0)
    })

    it('createSchedule returns errors for invalid data', () => {
      const result = scheduler.createSchedule({
        report_name: '',
        report_type: '',
        parameters: '{}',
        schedule_type: 'DAILY',
        day_of_week: null,
        day_of_month: null,
        time_of_day: '08:00',
        recipients: '[]',
        export_format: 'PDF',
        is_active: true,
        created_by_user_id: 1
      }, 1)
      expect(result.success).toBe(false)
      expect(result.errors!.length).toBeGreaterThan(0)
    })

    it('updateSchedule updates an existing record', () => {
      const created = scheduler.createSchedule({
        report_name: 'Expense Summary',
        report_type: 'EXPENSE_SUMMARY',
        parameters: '{}',
        schedule_type: 'DAILY',
        day_of_week: null,
        day_of_month: null,
        time_of_day: '10:00',
        recipients: '["staff@school.com"]',
        export_format: 'CSV',
        is_active: true,
        created_by_user_id: 1
      }, 1)

      const result = scheduler.updateSchedule(created.id!, { report_name: 'Updated Expense' }, 1)
      expect(result.success).toBe(true)
    })

    it('updateSchedule returns error for non-existent id', () => {
      const result = scheduler.updateSchedule(9999, { report_name: 'Ghost' }, 1)
      expect(result.success).toBe(false)
      expect(result.errors).toContain('Schedule not found')
    })

    it('deleteSchedule removes the record', () => {
      const created = scheduler.createSchedule({
        report_name: 'To Delete',
        report_type: 'STUDENT_LIST',
        parameters: '{}',
        schedule_type: 'DAILY',
        day_of_week: null,
        day_of_month: null,
        time_of_day: '07:00',
        recipients: '["del@test.com"]',
        export_format: 'PDF',
        is_active: true,
        created_by_user_id: 1
      }, 1)

      const result = scheduler.deleteSchedule(created.id!, 1)
      expect(result.success).toBe(true)
    })

    it('deleteSchedule returns error for non-existent id', () => {
      const result = scheduler.deleteSchedule(9999, 1)
      expect(result.success).toBe(false)
      expect(result.errors).toContain('Schedule not found')
    })
  })

  // ── resolveWindow ──
  describe('resolveWindow', () => {
    const callResolve = (sched: TestSchedule, date: Date) =>
      (scheduler as any).resolveWindow(sched, date)

    it('uses parameters dates when valid ISO format', () => {
      const sched = { ...baseSchedule, parameters: '{"start_date":"2026-01-15","end_date":"2026-01-31"}' }
      const result = callResolve(sched, new Date('2026-02-01'))
      expect(result.startDate).toBe('2026-01-15')
      expect(result.endDate).toBe('2026-01-31')
    })

    it('falls back to defaults when parameters are empty', () => {
      const result = callResolve(baseSchedule, new Date('2026-03-15'))
      expect(result.startDate).toBe('2026-03-01')
      expect(result.endDate).toBe('2026-03-15')
    })

    it('falls back when parameters are invalid JSON', () => {
      const sched = { ...baseSchedule, parameters: 'not-json' }
      const result = callResolve(sched, new Date('2026-04-10'))
      expect(result.startDate).toBe('2026-04-01')
      expect(result.endDate).toBe('2026-04-10')
    })

    it('falls back when parameters have non-ISO date strings', () => {
      const sched = { ...baseSchedule, parameters: '{"start_date":"Jan 1","end_date":"Feb 1"}' }
      const result = callResolve(sched, new Date('2026-05-20'))
      expect(result.startDate).toBe('2026-05-01')
      expect(result.endDate).toBe('2026-05-20')
    })
  })

  // ── generateReportPayload variants ──
  describe('generateReportPayload', () => {
    const callGen = (type: string, params = '{}') =>
      (scheduler as any).generateReportPayload(
        { ...baseSchedule, report_type: type, parameters: params },
        '2026-01-01', '2026-01-31'
      )

    it('generates FEE_COLLECTION payload', async () => {
      db.exec(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, amount, payment_method, is_voided) VALUES ('TXN-1', '2026-01-15', 'FEE_PAYMENT', 5000, 'CASH', 0)`)
      const payload = await callGen('FEE_COLLECTION')
      expect(Array.isArray(payload)).toBe(true)
    })

    it('generates EXPENSE_SUMMARY payload', async () => {
      db.exec(`INSERT INTO transaction_category (id, category_name) VALUES (1, 'Stationery')`)
      db.exec(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, is_voided) VALUES ('EXP-1', '2026-01-05', 'EXPENSE', 1, 3000, 0)`)
      const payload = await callGen('EXPENSE_SUMMARY')
      expect(Array.isArray(payload)).toBe(true)
      expect(payload[0].category_name).toBe('Stationery')
    })

    it('generates TRIAL_BALANCE payload', async () => {
      const payload = await callGen('TRIAL_BALANCE')
      expect(payload).toBeDefined()
    })

    it('generates STUDENT_LIST payload', async () => {
      const payload = await callGen('STUDENT_LIST')
      expect(Array.isArray(payload)).toBe(true)
      expect(payload.length).toBeGreaterThan(0)
      expect(payload[0].admission_number).toBeDefined()
    })

    it('throws for unsupported report type', async () => {
      await expect(callGen('UNKNOWN_TYPE')).rejects.toThrow('Unsupported report type')
    })
  })

  // ── initialize / shutdown ──
  describe('initialize / shutdown', () => {
    it('initializes and sets isRunning', () => {
      scheduler.initialize()
      expect((scheduler as any).isRunning).toBe(true)
    })

    it('initialize is idempotent (guard clause)', () => {
      scheduler.initialize()
      const interval1 = (scheduler as any).checkInterval
      scheduler.initialize() // second call should be no-op
      const interval2 = (scheduler as any).checkInterval
      expect(interval1).toBe(interval2)
    })

    it('shutdown clears interval', () => {
      scheduler.initialize()
      scheduler.shutdown()
      expect((scheduler as any).isRunning).toBe(false)
      expect((scheduler as any).checkInterval).toBeNull()
    })
  })

  // ── getScheduledReports ──
  it('getScheduledReports returns all scheduled reports', () => {
    scheduler.createSchedule({
      report_name: 'R1', report_type: 'FEE_COLLECTION', parameters: '{}',
      schedule_type: 'DAILY', day_of_week: null, day_of_month: null,
      time_of_day: '08:00', recipients: '["a@b.com"]', export_format: 'PDF',
      is_active: true, created_by_user_id: 1
    }, 1)
    const reports = scheduler.getScheduledReports()
    expect(reports.length).toBeGreaterThan(0)
  })

  // ── shouldRun null defaults ──
  describe('shouldRun – null day defaults', () => {
    const callShouldRun = (sched: TestSchedule, date: Date) =>
      (scheduler as any).shouldRun(sched, date)

    it('WEEKLY defaults to Monday (1) when day_of_week is null', () => {
      const sched = { ...baseSchedule, schedule_type: 'WEEKLY' as const, day_of_week: null }
      // 2026-03-16 is a Monday
      const now = new Date('2026-03-16T09:00:00')
      expect(callShouldRun(sched, now)).toBe(true)
    })

    it('MONTHLY defaults to 1st when day_of_month is null', () => {
      const sched = { ...baseSchedule, schedule_type: 'MONTHLY' as const, day_of_month: null }
      const now = new Date('2026-03-01T09:00:00')
      expect(callShouldRun(sched, now)).toBe(true)
    })
  })

  // ── executeReport – success and failure paths ──
  describe('executeReport', () => {
    it('logs success when notification succeeds', async () => {
      // Create a schedule in DB
      const created = scheduler.createSchedule({
        report_name: 'Exec Test', report_type: 'STUDENT_LIST', parameters: '{}',
        schedule_type: 'DAILY', day_of_week: null, day_of_month: null,
        time_of_day: '09:00', recipients: '["exec@test.com"]', export_format: 'PDF',
        is_active: true, created_by_user_id: 1
      }, 1)
      const sched = db.prepare('SELECT * FROM scheduled_report WHERE id = ?').get(created.id!) as any

      // Mock notification service
      const ns = (scheduler as any).notificationService;
      (scheduler as any)._notificationService = {
        send: vi.fn().mockResolvedValue({ success: true })
      }

      await (scheduler as any).executeReport(sched)

      const log = db.prepare('SELECT * FROM report_execution_log WHERE scheduled_report_id = ?').get(sched.id) as any
      expect(log.status).toBe('SUCCESS')
      expect(log.recipients_notified).toBe(1)

      // Restore
      ;(scheduler as any)._notificationService = ns
    })

    it('logs FAILED when no valid recipients', async () => {
      // Insert directly into DB to bypass validation
      db.prepare(`INSERT INTO scheduled_report (report_name, report_type, parameters, schedule_type, day_of_week, day_of_month, time_of_day, recipients, export_format, is_active, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run('No Recip', 'STUDENT_LIST', '{}', 'DAILY', null, null, '09:00', '["ab"]', 'PDF', 1, 1)
      const sched = db.prepare('SELECT * FROM scheduled_report ORDER BY id DESC LIMIT 1').get() as any

      await (scheduler as any).executeReport(sched)

      const log = db.prepare('SELECT * FROM report_execution_log WHERE scheduled_report_id = ? ORDER BY id DESC LIMIT 1').get(sched.id) as any
      expect(log.status).toBe('FAILED')
      expect(log.error_message).toContain('No valid recipients')
    })

    it('logs FAILED when all notifications fail', async () => {
      const created = scheduler.createSchedule({
        report_name: 'Fail Notif', report_type: 'STUDENT_LIST', parameters: '{}',
        schedule_type: 'DAILY', day_of_week: null, day_of_month: null,
        time_of_day: '09:00', recipients: '["fail@test.com"]', export_format: 'PDF',
        is_active: true, created_by_user_id: 1
      }, 1)
      const sched = db.prepare('SELECT * FROM scheduled_report WHERE id = ?').get(created.id!) as any

      ;(scheduler as any)._notificationService = {
        send: vi.fn().mockResolvedValue({ success: false, error: 'SMTP down' })
      }

      await (scheduler as any).executeReport(sched)

      const log = db.prepare('SELECT * FROM report_execution_log WHERE scheduled_report_id = ? ORDER BY id DESC LIMIT 1').get(sched.id) as any
      expect(log.status).toBe('FAILED')
    })

    it('handles partial notification success', async () => {
      const created = scheduler.createSchedule({
        report_name: 'Partial', report_type: 'STUDENT_LIST', parameters: '{}',
        schedule_type: 'DAILY', day_of_week: null, day_of_month: null,
        time_of_day: '09:00', recipients: '["ok@test.com","fail@test.com"]', export_format: 'PDF',
        is_active: true, created_by_user_id: 1
      }, 1)
      const sched = db.prepare('SELECT * FROM scheduled_report WHERE id = ?').get(created.id!) as any

      let callCount = 0
      ;(scheduler as any)._notificationService = {
        send: vi.fn().mockImplementation(async () => {
          callCount++
          return callCount === 1 ? { success: true } : { success: false, error: 'fail' }
        })
      }

      await (scheduler as any).executeReport(sched)

      const log = db.prepare('SELECT * FROM report_execution_log WHERE scheduled_report_id = ? ORDER BY id DESC LIMIT 1').get(sched.id) as any
      expect(log.status).toBe('SUCCESS')
      expect(log.recipients_notified).toBe(1)
      expect(log.error_message).toContain('fail@test.com')
    })
  })

  // ── checkAndRunReports ──
  describe('checkAndRunReports', () => {
    it('silently returns when no active schedules', async () => {
      await expect((scheduler as any).checkAndRunReports()).resolves.toBeUndefined()
    })

    it('handles "not initialized" error gracefully', async () => {
      // Temporarily close the db so queries throw
      const origDb = db
      db = { prepare: () => { throw new Error('Database not initialized') } } as any
      await expect((scheduler as any).checkAndRunReports()).resolves.toBeUndefined()
      // Restore
      db = origDb
    })
  })

  // ── buildEmailBody branches ──
  describe('buildEmailBody', () => {
    it('handles string payload directly', () => {
      const body = (scheduler as any).buildEmailBody(baseSchedule, '2026-01-01', '2026-01-31', 'raw string payload')
      expect(body).toContain('raw string payload')
    })

    it('JSON-stringifies non-string payload', () => {
      const body = (scheduler as any).buildEmailBody(baseSchedule, '2026-01-01', '2026-01-31', [{ amount: 100 }])
      expect(body).toContain('"amount"')
    })
  })

  // ── createSchedule defaults and error handling ──
  describe('createSchedule – defaults', () => {
    it('uses default parameters/export_format/recipients when empty', () => {
      const result = scheduler.createSchedule({
        report_name: 'Defaults Test',
        report_type: 'STUDENT_LIST',
        parameters: '',
        schedule_type: 'DAILY',
        day_of_week: null,
        day_of_month: null,
        time_of_day: '08:00',
        recipients: '',
        export_format: '' as any,
        is_active: true,
        created_by_user_id: 1
      }, 1)
      // Will fail validation because empty recipients parse to no valid emails
      expect(result.success).toBe(false)
    })
  })

  // ── updateSchedule validation failure ──
  describe('updateSchedule – validation errors', () => {
    it('rejects update with invalid merged data', () => {
      const created = scheduler.createSchedule({
        report_name: 'Valid', report_type: 'STUDENT_LIST', parameters: '{}',
        schedule_type: 'DAILY', day_of_week: null, day_of_month: null,
        time_of_day: '08:00', recipients: '["a@b.com"]', export_format: 'PDF',
        is_active: true, created_by_user_id: 1
      }, 1)
      const result = scheduler.updateSchedule(created.id!, { time_of_day: 'bad-time' }, 1)
      expect(result.success).toBe(false)
      expect(result.errors!.some(e => e.includes('HH:MM'))).toBe(true)
    })
  })

  // ── Branch coverage: resolveWindow – JSON parse error (L285) ──
  describe('resolveWindow – invalid JSON parameters', () => {
    it('uses default window when parameters are not valid JSON', () => {
      const callResolve = (sched: any) => (scheduler as any).resolveWindow(sched, new Date())
      const sched = { ...baseSchedule, parameters: 'NOT-JSON' }
      const result = callResolve(sched)
      expect(result).toBeDefined()
      expect(result.startDate).toBeDefined()
      expect(result.endDate).toBeDefined()
    })
  })

  // ── Branch coverage: parseRecipients – non-array result (L304) ──
  describe('parseRecipients – non-array JSON', () => {
    it('returns empty array when JSON is not an array', () => {
      const callParse = (raw: string) => (scheduler as any).parseRecipients(raw)
      expect(callParse('{"name":"test"}')).toEqual([])
      expect(callParse('"single@email.com"')).toEqual([])
    })
  })

  // ── Branch coverage: generateReportPayload – STUDENT_LIST type (L340+) ──
  describe('generateReportPayload – STUDENT_LIST report type', () => {
    it('generates student list payload', async () => {
      const sched = { ...baseSchedule, report_type: 'STUDENT_LIST' }
      const payload = await (scheduler as any).generateReportPayload(sched, '2026-01-01', '2026-12-31')
      expect(Array.isArray(payload)).toBe(true)
    })
  })

  // ── Branch coverage: executeReport error handling (L410+) ──
  describe('executeReport – schedule not found', () => {
    it('throws when schedule does not exist', async () => {
      await expect((scheduler as any).executeReport(99999)).rejects.toThrow()
    })
  })

  // ── Branch coverage: shouldRun – unknown schedule_type (default case) ──
  describe('shouldRun – unknown schedule_type', () => {
    it('returns false for unknown schedule type', () => {
      const sched = { ...baseSchedule, schedule_type: 'CUSTOM' as any }
      const now = new Date('2026-03-15T09:00:00')
      expect((scheduler as any).shouldRun(sched, now)).toBe(false)
    })
  })

  // ── Branch coverage: checkAndRunReports – general error (non "not initialized") ──
  describe('checkAndRunReports – general error', () => {
    it('logs error when checkAndRunReports encounters non-init error', async () => {
      const spy = vi.spyOn(scheduler as any, 'getActiveSchedules').mockImplementation(() => {
        throw new Error('Unexpected DB corruption')
      })
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await (scheduler as any).checkAndRunReports()
      expect(consoleSpy).toHaveBeenCalledWith('Report scheduler error:', expect.any(Error))
      spy.mockRestore()
      consoleSpy.mockRestore()
    })
  })

  // ── Branch coverage: createSchedule – DB insert failure (catch block) ──
  describe('createSchedule – DB insert failure', () => {
    it('returns error when DB insert throws', () => {
      // Close the DB to force an error
      db.close()
      const freshDb = new Database(':memory:')
      // No scheduled_report table → insert will fail
      ;(scheduler as any)._db = freshDb
      const result = scheduler.createSchedule({
        report_name: 'Crash Test',
        report_type: 'STUDENT_LIST',
        parameters: '{}',
        schedule_type: 'DAILY',
        day_of_week: null,
        day_of_month: null,
        time_of_day: '10:00',
        recipients: '["a@b.com"]',
        export_format: 'PDF',
        is_active: true,
        created_by_user_id: 1
      }, 1)
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      // Restore DB for afterEach
      db = freshDb
      db.exec(`CREATE TABLE IF NOT EXISTS scheduled_report (id INTEGER PRIMARY KEY AUTOINCREMENT, report_name TEXT, report_type TEXT, parameters TEXT, schedule_type TEXT, day_of_week INTEGER, day_of_month INTEGER, time_of_day TEXT, recipients TEXT, export_format TEXT, is_active BOOLEAN, last_run_at DATETIME, next_run_at DATETIME, created_by_user_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
    })
  })

  // ── Branch coverage: executeReport – non-Error exception → 'Unknown error' ──
  describe('executeReport – non-Error exception', () => {
    it('logs Unknown error for non-Error thrown during execution', async () => {
      const sched = { ...baseSchedule, id: 0, recipients: '["a@b.com"]', report_type: 'STUDENT_LIST' }
      const created = scheduler.createSchedule({
        report_name: sched.report_name, report_type: sched.report_type,
        parameters: sched.parameters, schedule_type: sched.schedule_type,
        day_of_week: sched.day_of_week, day_of_month: sched.day_of_month,
        time_of_day: sched.time_of_day, recipients: sched.recipients,
        export_format: sched.export_format, is_active: sched.is_active,
        created_by_user_id: sched.created_by_user_id
      }, 1)
      expect(created.success).toBe(true)
      // Mock parseRecipients to throw a non-Error
      vi.spyOn(scheduler as any, 'parseRecipients').mockImplementation(() => { throw 42 }) // NOSONAR
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await (scheduler as any).executeReport({ ...sched, id: created.id })
      // Check the execution log has 'Unknown error'
      const log = db.prepare('SELECT * FROM report_execution_log ORDER BY id DESC LIMIT 1').get() as any
      expect(log.error_message).toBe('Unknown error')
      consoleSpy.mockRestore()
    })
  })

  // ── Branch coverage: updateSchedule sets.length === 0 (no fields to update → skip UPDATE) ──
  describe('updateSchedule – empty data', () => {
    it('succeeds but skips SQL update when no recognized fields changed', () => {
      const created = scheduler.createSchedule({
        report_name: 'No-Op Update', report_type: 'STUDENT_LIST',
        parameters: '{}', schedule_type: 'DAILY', day_of_week: null,
        day_of_month: null, time_of_day: '08:00', recipients: '["a@b.com"]',
        export_format: 'PDF', is_active: true, created_by_user_id: 1
      }, 1)
      const result = scheduler.updateSchedule(created.id!, {}, 1)
      expect(result.success).toBe(true)
    })
  })

  // ── Branch coverage: generateReportPayload – DEFAULTERS_LIST type ──
  describe('generateReportPayload – DEFAULTERS_LIST', () => {
    it('generates defaulters list payload', async () => {
      const sched = { ...baseSchedule, report_type: 'DEFAULTERS_LIST' }
      const payload = await (scheduler as any).generateReportPayload(sched, '2026-01-01', '2026-12-31')
      expect(Array.isArray(payload)).toBe(true)
    })
  })

  /* ==================================================================
   *  Branch coverage: shouldRun with WEEKLY null day_of_week → fallback ??1 (L185)
   * ================================================================== */
  describe('shouldRun – null day_of_week fallback', () => {
    const callShouldRun = (sched: TestSchedule, date: Date) =>
      (scheduler as any).shouldRun(sched, date)

    it('WEEKLY with null day_of_week defaults to Monday (day 1)', () => {
      const sched = { ...baseSchedule, schedule_type: 'WEEKLY' as const, day_of_week: null }
      // 2026-03-16 is a Monday (day=1)
      const now = new Date('2026-03-16T09:00:00')
      expect(callShouldRun(sched, now)).toBe(true)
    })

    it('WEEKLY with null day_of_week rejects non-Monday', () => {
      const sched = { ...baseSchedule, schedule_type: 'WEEKLY' as const, day_of_week: null }
      // 2026-03-17 is a Tuesday (day=2)
      const now = new Date('2026-03-17T09:00:00')
      expect(callShouldRun(sched, now)).toBe(false)
    })

    it('MONTHLY with null day_of_month defaults to 1st', () => {
      const sched = { ...baseSchedule, schedule_type: 'MONTHLY' as const, day_of_month: null }
      const now = new Date('2026-03-01T09:00:00')
      expect(callShouldRun(sched, now)).toBe(true)
    })

    it('MONTHLY with null day_of_month rejects other days', () => {
      const sched = { ...baseSchedule, schedule_type: 'MONTHLY' as const, day_of_month: null }
      const now = new Date('2026-03-15T09:00:00')
      expect(callShouldRun(sched, now)).toBe(false)
    })

    it('returns false for unknown schedule_type', () => {
      const sched = { ...baseSchedule, schedule_type: 'CUSTOM' as any }
      const now = new Date('2026-03-15T09:00:00')
      expect(callShouldRun(sched, now)).toBe(false)
    })
  })

  /* ==================================================================
   *  Branch coverage: resolveWindow – custom start/end dates in parameters (L265)
   * ================================================================== */
  describe('resolveWindow – custom parameters', () => {
    const callResolveWindow = (sched: TestSchedule, date: Date) =>
      (scheduler as any).resolveWindow(sched, date)

    it('uses custom start_date and end_date from parameters', () => {
      const sched = { ...baseSchedule, parameters: '{"start_date":"2025-06-01","end_date":"2025-12-31"}' }
      const result = callResolveWindow(sched, new Date('2026-03-15'))
      expect(result.startDate).toBe('2025-06-01')
      expect(result.endDate).toBe('2025-12-31')
    })

    it('falls back to defaults for invalid parameter dates', () => {
      const sched = { ...baseSchedule, parameters: '{"start_date":"bad","end_date":"also-bad"}' }
      const result = callResolveWindow(sched, new Date('2026-03-15'))
      // Should use default month-start and today
      expect(result.startDate).toMatch(/^\d{4}-\d{2}-01$/)
      expect(result.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('falls back to defaults when parameters is empty', () => {
      const sched = { ...baseSchedule, parameters: '' }
      const result = callResolveWindow(sched, new Date('2026-03-15'))
      expect(result.startDate).toMatch(/^\d{4}-\d{2}-01$/)
    })
  })

  /* ==================================================================
   *  Branch coverage: checkAndRunReports with no active schedules (L93)
   * ================================================================== */
  describe('checkAndRunReports – no active schedules', () => {
    it('returns early when no active schedules exist', async () => {
      db.exec('DELETE FROM scheduled_report')
      await expect((scheduler as any).checkAndRunReports()).resolves.toBeUndefined()
    })
  })

  /* ==================================================================
   *  Branch coverage: deleteSchedule non-existent (L251)
   * ================================================================== */
  describe('deleteSchedule – non-existent', () => {
    it('returns error for non-existent schedule', () => {
      const result = scheduler.deleteSchedule(99999, 1)
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('not found')
    })
  })
})
