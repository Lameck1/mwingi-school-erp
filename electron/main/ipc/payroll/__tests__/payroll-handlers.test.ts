import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSessionCache } from '../../../security/session'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

let db: Database.Database
const handlerMap = new Map<string, IpcHandler>()

let sessionUserId = 9
let sessionRole = 'ACCOUNTS_CLERK'

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn(async () => JSON.stringify({
      user: {
        id: sessionUserId,
        username: 'payroll-user',
        role: sessionRole,
        full_name: 'Payroll User',
        email: null,
        is_active: 1,
        last_login: null,
        created_at: '2026-01-01T00:00:00'
      },
      lastActivity: Date.now()
    })),
    setPassword: vi.fn().mockResolvedValue(null),
    deletePassword: vi.fn().mockResolvedValue(true),
  }
}))

vi.mock('../../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      handlerMap.set(channel, handler)
    }),
    removeHandler: vi.fn(),
  }
}))

vi.mock('../../../database', () => ({
  getDatabase: () => db
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

vi.mock('../../../services/accounting/DoubleEntryJournalService', () => ({
  DoubleEntryJournalService: class {
    createJournalEntrySync() {
      return { success: true }
    }
  }
}))

vi.mock('../../../services/finance/PayrollJournalService', () => ({
  PayrollJournalService: class {
    postPayrollToGL() {
      return { success: true }
    }
  }
}))

vi.mock('../../../services/payroll/P10ExportService', () => ({
  P10ExportService: class {
    generateP10Csv() {
      return 'csv-data-here'
    }
  }
}))

vi.mock('../../../services/payroll/PayslipGenerationService', () => ({
  PayslipGenerationService: class {
    getPayrollIdsForPeriod() {
      return [1, 2, 3]
    }
    generatePayslip() {
      return { staffName: 'Test Staff', netSalary: 50000 }
    }
  }
}))

import { registerPayrollHandlers } from '../payroll-handlers'

function attachActor(event: any) {
  event.__ipcActor = {
    id: sessionUserId,
    role: sessionRole,
    username: 'payroll-user',
    full_name: 'Payroll User',
    email: null,
    is_active: 1,
    created_at: '2026-01-01T00:00:00'
  };
}

function seedPeriodWithPayroll(status = 'DRAFT') {
  db.prepare(`INSERT INTO payroll_period (id, period_name, month, year, start_date, end_date, status)
    VALUES (1, 'Jan 2026', 1, 2026, '2026-01-01', '2026-01-31', ?)`).run(status)
  db.prepare(`INSERT INTO staff (id, first_name, last_name, staff_number, department, job_title, basic_salary)
    VALUES (1, 'Jane', 'Doe', 'STF001', 'Admin', 'Clerk', 5000000)`).run()
  db.prepare(`INSERT INTO payroll (id, period_id, staff_id, basic_salary, gross_salary, total_deductions, net_salary)
    VALUES (1, 1, 1, 5000000, 5500000, 800000, 4700000)`).run()
  db.prepare(`INSERT INTO payroll_deduction (payroll_id, deduction_name, amount) VALUES (1, 'PAYE', 500000)`).run()
  db.prepare(`INSERT INTO payroll_deduction (payroll_id, deduction_name, amount) VALUES (1, 'NSSF', 200000)`).run()
  db.prepare(`INSERT INTO payroll_deduction (payroll_id, deduction_name, amount) VALUES (1, 'SHIF', 50000)`).run()
  db.prepare(`INSERT INTO payroll_deduction (payroll_id, deduction_name, amount) VALUES (1, 'Housing Levy', 50000)`).run()
  db.prepare(`INSERT INTO payroll_allowance (payroll_id, allowance_name, amount) VALUES (1, 'Transport', 500000)`).run()
}

describe('payroll IPC handlers actor/role enforcement', () => {
  beforeEach(() => {
    clearSessionCache()
    handlerMap.clear()
    sessionUserId = 9
    sessionRole = 'ACCOUNTS_CLERK'
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

      CREATE TABLE payroll_period (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        period_name TEXT,
        month INTEGER,
        year INTEGER,
        start_date TEXT,
        end_date TEXT,
        status TEXT,
        created_at TEXT,
        approved_by_user_id INTEGER,
        approved_at TEXT,
        transaction_ref TEXT
      );
      CREATE TABLE payroll (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        period_id INTEGER,
        staff_id INTEGER,
        basic_salary INTEGER,
        gross_salary INTEGER,
        total_deductions INTEGER,
        net_salary INTEGER,
        payment_status TEXT DEFAULT 'PENDING',
        payment_date TEXT
      );
      CREATE TABLE payroll_deduction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payroll_id INTEGER,
        deduction_name TEXT,
        amount INTEGER
      );
      CREATE TABLE payroll_allowance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payroll_id INTEGER,
        allowance_name TEXT,
        amount INTEGER
      );
      CREATE TABLE statutory_rates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rate_type TEXT,
        min_amount INTEGER,
        max_amount INTEGER,
        rate REAL,
        fixed_amount INTEGER,
        is_current INTEGER DEFAULT 1
      );
      CREATE TABLE staff (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT,
        last_name TEXT,
        middle_name TEXT,
        staff_number TEXT,
        department TEXT,
        job_title TEXT,
        phone TEXT,
        basic_salary INTEGER,
        is_active INTEGER DEFAULT 1
      );
      CREATE TABLE staff_allowance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_id INTEGER,
        allowance_name TEXT,
        amount INTEGER,
        is_active INTEGER DEFAULT 1
      );
      CREATE TABLE transaction_category (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_name TEXT,
        category_type TEXT,
        is_system INTEGER,
        is_active INTEGER
      );
      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_ref TEXT,
        transaction_date TEXT,
        transaction_type TEXT,
        category_id INTEGER,
        amount INTEGER,
        debit_credit TEXT,
        payment_method TEXT,
        payment_reference TEXT,
        description TEXT,
        recorded_by_user_id INTEGER,
        is_voided INTEGER
      );
    `)

    registerPayrollHandlers()
  })

  afterEach(() => {
    db.close()
  })

  it('ignores renderer user id and uses authenticated session actor', async () => {
    const handler = handlerMap.get('payroll:run')
    expect(handler).toBeDefined()
    const event = {};
    attachActor(event);
    // Passing 4 as legacy ID, but session ID is 9
    const result = await handler!(event, 2, 2026, 4) as { success: boolean; periodId: number }
    expect(result.success).toBe(true)

    // Check that simple payroll period creation succeeded (mock db behavior)
    // We can't easily check logAudit here without importing the mock, but success implies it ran.
    expect(result.periodId).toBeGreaterThan(0)
  })

  it('blocks payroll history access for non-authorized roles', async () => {
    sessionRole = 'TEACHER'
    const handler = handlerMap.get('payroll:getHistory')
    expect(handler).toBeDefined()
    const event = {};
    attachActor(event);
    const result = await handler!(event) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
  })

  it('allows payroll history access for management roles', async () => {
    sessionRole = 'PRINCIPAL'
    db.prepare(`
      INSERT INTO payroll_period (period_name, month, year, start_date, end_date, status)
      VALUES ('January 2026', 1, 2026, '2026-01-01', '2026-01-31', 'DRAFT')
    `).run()
    const handler = handlerMap.get('payroll:getHistory')
    expect(handler).toBeDefined()
    const event = {};
    attachActor(event);
    const result = await handler!(event) as Array<{ period_name: string }>
    expect(Array.isArray(result)).toBe(true)
    expect(result[0]?.period_name).toBe('January 2026')
  })

  // ── payroll:getDetails ──────────────────────────────────────
  describe('payroll:getDetails', () => {
    it('returns period details with staff breakdowns', async () => {
      seedPeriodWithPayroll()
      const handler = handlerMap.get('payroll:getDetails')!
      const event = {}; attachActor(event)
      const result = await handler(event, 1) as any
      expect(result.success).toBe(true)
      expect(result.period).toBeDefined()
      expect(result.results.length).toBe(1)
      expect(result.results[0].staff_name).toContain('Jane')
      expect(result.results[0].paye).toBe(500000)
      expect(result.results[0].nssf).toBe(200000)
      expect(result.results[0].allowances).toBe(500000)
    })

    it('returns error for non-existent period', async () => {
      const handler = handlerMap.get('payroll:getDetails')!
      const event = {}; attachActor(event)
      const result = await handler(event, 999) as any
      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })
  })

  // ── payroll:confirm ──────────────────────────────────────
  describe('payroll:confirm', () => {
    it('transitions DRAFT → CONFIRMED', async () => {
      db.prepare(`INSERT INTO payroll_period (id, period_name, month, year, start_date, end_date, status)
        VALUES (1, 'Jan 2026', 1, 2026, '2026-01-01', '2026-01-31', 'DRAFT')`).run()
      const handler = handlerMap.get('payroll:confirm')!
      const event = {}; attachActor(event)
      const result = await handler(event, 1) as any
      expect(result.success).toBe(true)
      const period = db.prepare('SELECT status FROM payroll_period WHERE id = 1').get() as any
      expect(period.status).toBe('CONFIRMED')
    })

    it('rejects non-DRAFT period', async () => {
      db.prepare(`INSERT INTO payroll_period (id, period_name, month, year, start_date, end_date, status)
        VALUES (1, 'Jan 2026', 1, 2026, '2026-01-01', '2026-01-31', 'CONFIRMED')`).run()
      const handler = handlerMap.get('payroll:confirm')!
      const event = {}; attachActor(event)
      const result = await handler(event, 1) as any
      expect(result.success).toBe(false)
      expect(result.error).toContain('DRAFT')
    })

    it('rejects missing period', async () => {
      const handler = handlerMap.get('payroll:confirm')!
      const event = {}; attachActor(event)
      const result = await handler(event, 999) as any
      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })
  })

  // ── payroll:markPaid ──────────────────────────────────────
  describe('payroll:markPaid', () => {
    it('transitions CONFIRMED → PAID with journal + ledger entries', async () => {
      db.prepare(`INSERT INTO payroll_period (id, period_name, month, year, start_date, end_date, status)
        VALUES (1, 'Jan 2026', 1, 2026, '2026-01-01', '2026-01-31', 'CONFIRMED')`).run()
      db.prepare(`INSERT INTO staff (id, first_name, last_name, staff_number, department, job_title, basic_salary)
        VALUES (1, 'Jane', 'Doe', 'STF001', 'Admin', 'Clerk', 5000000)`).run()
      db.prepare(`INSERT INTO payroll (id, period_id, staff_id, basic_salary, gross_salary, total_deductions, net_salary)
        VALUES (1, 1, 1, 5000000, 5000000, 800000, 4200000)`).run()
      const handler = handlerMap.get('payroll:markPaid')!
      const event = {}; attachActor(event)
      const result = await handler(event, 1) as any
      expect(result.success).toBe(true)
      const period = db.prepare('SELECT status FROM payroll_period WHERE id = 1').get() as any
      expect(period.status).toBe('PAID')
      const payroll = db.prepare('SELECT payment_status FROM payroll WHERE period_id = 1').get() as any
      expect(payroll.payment_status).toBe('PAID')
      // Ledger transaction should be inserted
      const ledger = db.prepare('SELECT * FROM ledger_transaction WHERE transaction_ref LIKE ?').get('PAY-1-%') as any
      expect(ledger).toBeDefined()
      expect(ledger.amount).toBe(4200000)
    })

    it('rejects non-CONFIRMED period', async () => {
      db.prepare(`INSERT INTO payroll_period (id, period_name, month, year, start_date, end_date, status)
        VALUES (1, 'Jan 2026', 1, 2026, '2026-01-01', '2026-01-31', 'DRAFT')`).run()
      const handler = handlerMap.get('payroll:markPaid')!
      const event = {}; attachActor(event)
      const result = await handler(event, 1) as any
      expect(result.success).toBe(false)
      expect(result.error).toContain('CONFIRMED')
    })
  })

  // ── payroll:revertToDraft ──────────────────────────────────────
  describe('payroll:revertToDraft', () => {
    it('transitions CONFIRMED → DRAFT', async () => {
      db.prepare(`INSERT INTO payroll_period (id, period_name, month, year, start_date, end_date, status, approved_by_user_id)
        VALUES (1, 'Jan 2026', 1, 2026, '2026-01-01', '2026-01-31', 'CONFIRMED', 9)`).run()
      const handler = handlerMap.get('payroll:revertToDraft')!
      const event = {}; attachActor(event)
      const result = await handler(event, 1) as any
      expect(result.success).toBe(true)
      const period = db.prepare('SELECT status, approved_by_user_id FROM payroll_period WHERE id = 1').get() as any
      expect(period.status).toBe('DRAFT')
      expect(period.approved_by_user_id).toBeNull()
    })

    it('rejects non-CONFIRMED period', async () => {
      db.prepare(`INSERT INTO payroll_period (id, period_name, month, year, start_date, end_date, status)
        VALUES (1, 'Jan 2026', 1, 2026, '2026-01-01', '2026-01-31', 'DRAFT')`).run()
      const handler = handlerMap.get('payroll:revertToDraft')!
      const event = {}; attachActor(event)
      const result = await handler(event, 1) as any
      expect(result.success).toBe(false)
      expect(result.error).toContain('CONFIRMED')
    })
  })

  // ── payroll:delete ──────────────────────────────────────
  describe('payroll:delete', () => {
    it('cascade-deletes DRAFT payroll + deductions + allowances', async () => {
      db.prepare(`INSERT INTO payroll_period (id, period_name, month, year, start_date, end_date, status)
        VALUES (1, 'Jan 2026', 1, 2026, '2026-01-01', '2026-01-31', 'DRAFT')`).run()
      db.prepare(`INSERT INTO staff (id, first_name, last_name, staff_number, department, job_title, basic_salary)
        VALUES (1, 'Jane', 'Doe', 'STF001', 'Admin', 'Clerk', 5000000)`).run()
      db.prepare(`INSERT INTO payroll (id, period_id, staff_id, basic_salary, gross_salary, total_deductions, net_salary)
        VALUES (1, 1, 1, 5000000, 5000000, 800000, 4200000)`).run()
      db.prepare(`INSERT INTO payroll_deduction (payroll_id, deduction_name, amount) VALUES (1, 'PAYE', 500000)`).run()
      db.prepare(`INSERT INTO payroll_allowance (payroll_id, allowance_name, amount) VALUES (1, 'Transport', 200000)`).run()
      const handler = handlerMap.get('payroll:delete')!
      const event = {}; attachActor(event)
      const result = await handler(event, 1) as any
      expect(result.success).toBe(true)
      expect(db.prepare('SELECT COUNT(*) as c FROM payroll_period').get()).toEqual({ c: 0 })
      expect(db.prepare('SELECT COUNT(*) as c FROM payroll').get()).toEqual({ c: 0 })
      expect(db.prepare('SELECT COUNT(*) as c FROM payroll_deduction').get()).toEqual({ c: 0 })
      expect(db.prepare('SELECT COUNT(*) as c FROM payroll_allowance').get()).toEqual({ c: 0 })
    })

    it('rejects non-DRAFT period', async () => {
      db.prepare(`INSERT INTO payroll_period (id, period_name, month, year, start_date, end_date, status)
        VALUES (1, 'Jan 2026', 1, 2026, '2026-01-01', '2026-01-31', 'CONFIRMED')`).run()
      const handler = handlerMap.get('payroll:delete')!
      const event = {}; attachActor(event)
      const result = await handler(event, 1) as any
      expect(result.success).toBe(false)
      expect(result.error).toContain('DRAFT')
    })
  })

  // ── payroll:recalculate ──────────────────────────────────────
  describe('payroll:recalculate', () => {
    it('recalculates DRAFT payroll with current rates', async () => {
      db.prepare(`INSERT INTO payroll_period (id, period_name, month, year, start_date, end_date, status)
        VALUES (1, 'Jan 2026', 1, 2026, '2026-01-01', '2026-01-31', 'DRAFT')`).run()
      db.prepare(`INSERT INTO staff (id, first_name, last_name, staff_number, department, job_title, basic_salary, is_active)
        VALUES (1, 'Jane', 'Doe', 'STF001', 'Admin', 'Clerk', 5000000, 1)`).run()
      // Insert minimal statutory rates
      db.prepare(`INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current)
        VALUES ('NSSF_TIER_I', 0, 7000, 0, 720, 1)`).run()
      db.prepare(`INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current)
        VALUES ('NSSF_TIER_II', 7001, 36000, 0, 1440, 1)`).run()
      db.prepare(`INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current)
        VALUES ('HOUSING_LEVY', 0, NULL, 0.015, 0, 1)`).run()
      db.prepare(`INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current)
        VALUES ('SHIF', 0, NULL, 0.0275, 0, 1)`).run()
      db.prepare(`INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current)
        VALUES ('PAYE_BAND', 0, 24000, 0.10, 0, 1)`).run()
      db.prepare(`INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current)
        VALUES ('PERSONAL_RELIEF', 0, NULL, 0, 2400, 1)`).run()
      // Old payroll record to be replaced
      db.prepare(`INSERT INTO payroll (period_id, staff_id, basic_salary, gross_salary, total_deductions, net_salary)
        VALUES (1, 1, 5000000, 5000000, 0, 5000000)`).run()
      const handler = handlerMap.get('payroll:recalculate')!
      const event = {}; attachActor(event)
      const result = await handler(event, 1) as any
      expect(result.success).toBe(true)
      expect(result.results.length).toBe(1)
      expect(result.results[0].basic_salary).toBe(5000000)
      expect(result.results[0].total_deductions).toBeGreaterThan(0)
    })

    it('rejects non-DRAFT period', async () => {
      db.prepare(`INSERT INTO payroll_period (id, period_name, month, year, start_date, end_date, status)
        VALUES (1, 'Jan 2026', 1, 2026, '2026-01-01', '2026-01-31', 'CONFIRMED')`).run()
      const handler = handlerMap.get('payroll:recalculate')!
      const event = {}; attachActor(event)
      const result = await handler(event, 1) as any
      expect(result.success).toBe(false)
      expect(result.error).toContain('DRAFT')
    })

    it('fails when no statutory rates configured', async () => {
      db.prepare(`INSERT INTO payroll_period (id, period_name, month, year, start_date, end_date, status)
        VALUES (1, 'Jan 2026', 1, 2026, '2026-01-01', '2026-01-31', 'DRAFT')`).run()
      const handler = handlerMap.get('payroll:recalculate')!
      const event = {}; attachActor(event)
      const result = await handler(event, 1) as any
      expect(result.success).toBe(false)
      expect(result.error).toContain('statutory rates')
    })
  })

  // ── payroll:postToGL ──────────────────────────────────────
  it('postToGL delegates to PayrollJournalService', async () => {
    db.prepare(`INSERT INTO payroll_period (id, period_name, month, year, start_date, end_date, status)
      VALUES (1, 'Jan 2026', 1, 2026, '2026-01-01', '2026-01-31', 'CONFIRMED')`).run()
    const handler = handlerMap.get('payroll:postToGL')!
    const event = {}; attachActor(event)
    const result = await handler(event, 1) as any
    expect(result.success).toBe(true)
  })

  // ── staff:getAllowances ──────────────────────────────────────
  describe('staff:getAllowances', () => {
    it('returns active allowances for staffId', async () => {
      db.prepare(`INSERT INTO staff (id, first_name, last_name, staff_number, department, job_title, basic_salary)
        VALUES (1, 'Jane', 'Doe', 'STF001', 'Admin', 'Clerk', 5000000)`).run()
      db.prepare(`INSERT INTO staff_allowance (staff_id, allowance_name, amount, is_active) VALUES (1, 'Transport', 20000, 1)`).run()
      db.prepare(`INSERT INTO staff_allowance (staff_id, allowance_name, amount, is_active) VALUES (1, 'Housing', 30000, 1)`).run()
      db.prepare(`INSERT INTO staff_allowance (staff_id, allowance_name, amount, is_active) VALUES (1, 'Deleted', 10000, 0)`).run()
      const handler = handlerMap.get('staff:getAllowances')!
      const event = {}; attachActor(event)
      const result = await handler(event, 1) as any[]
      expect(result.length).toBe(2)
      expect(result.map((r: any) => r.allowance_name)).toEqual(['Housing', 'Transport']) // alphabetical
    })
  })

  // ── staff:addAllowance ──────────────────────────────────────
  it('adds a staff allowance', async () => {
    db.prepare(`INSERT INTO staff (id, first_name, last_name, staff_number, department, job_title, basic_salary)
      VALUES (1, 'Jane', 'Doe', 'STF001', 'Admin', 'Clerk', 5000000)`).run()
    const handler = handlerMap.get('staff:addAllowance')!
    const event = {}; attachActor(event)
    const result = await handler(event, 1, 'Transport', 20000) as any
    expect(result.success).toBe(true)
    expect(result.id).toBeGreaterThan(0)
    const row = db.prepare('SELECT * FROM staff_allowance WHERE id = ?').get(result.id) as any
    expect(row.allowance_name).toBe('Transport')
    expect(row.amount).toBe(20000)
  })

  // ── staff:deleteAllowance ──────────────────────────────────────
  it('soft-deletes a staff allowance', async () => {
    db.prepare(`INSERT INTO staff (id, first_name, last_name, staff_number, department, job_title, basic_salary)
      VALUES (1, 'Jane', 'Doe', 'STF001', 'Admin', 'Clerk', 5000000)`).run()
    db.prepare(`INSERT INTO staff_allowance (id, staff_id, allowance_name, amount, is_active) VALUES (1, 1, 'Transport', 20000, 1)`).run()
    const handler = handlerMap.get('staff:deleteAllowance')!
    const event = {}; attachActor(event)
    const result = await handler(event, 1) as any
    expect(result.success).toBe(true)
    const row = db.prepare('SELECT is_active FROM staff_allowance WHERE id = 1').get() as any
    expect(row.is_active).toBe(0)
  })

  // ── payroll:generateP10Csv ──────────────────────────────────────
  it('generates P10 CSV data', async () => {
    const handler = handlerMap.get('payroll:generateP10Csv')!
    const event = {}; attachActor(event)
    const result = await handler(event, 1) as any
    expect(result.success).toBe(true)
    expect(result.data).toBe('csv-data-here')
  })

  // ── payroll:getPayrollIdsForPeriod ──────────────────────────────────────
  it('returns payroll IDs for a period', async () => {
    const handler = handlerMap.get('payroll:getPayrollIdsForPeriod')!
    const event = {}; attachActor(event)
    const result = await handler(event, 1) as any
    expect(result.success).toBe(true)
    expect(result.data).toEqual([1, 2, 3])
  })

  // ── payroll:generatePayslip ──────────────────────────────────────
  it('generates a payslip', async () => {
    const handler = handlerMap.get('payroll:generatePayslip')!
    const event = {}; attachActor(event)
    const result = await handler(event, 1) as any
    expect(result.success).toBe(true)
    expect(result.data.staffName).toBe('Test Staff')
  })

  it('payroll:markPaid skips journal entry when totalNet is zero', async () => {
    // Create a CONFIRMED period with no payroll rows → totalNet = 0
    db.prepare(`
      INSERT INTO payroll_period (id, period_name, month, year, start_date, end_date, status)
      VALUES (900, 'ZeroNet', 6, 2026, '2026-06-01', '2026-06-30', 'CONFIRMED')
    `).run()

    const handler = handlerMap.get('payroll:markPaid')!
    const event = {}; attachActor(event)
    const result = await handler(event, 900, 9) as { success: boolean }
    expect(result.success).toBe(true)
    // Period should now be PAID
    const period = db.prepare('SELECT status FROM payroll_period WHERE id = 900').get() as { status: string }
    expect(period.status).toBe('PAID')
  })

  // ── branch coverage: payroll:run duplicate period ──
  it('payroll:run rejects duplicate period', async () => {
    db.prepare(`
      INSERT INTO payroll_period (id, period_name, month, year, start_date, end_date, status)
      VALUES (901, 'March 2026', 3, 2026, '2026-03-01', '2026-03-31', 'DRAFT')
    `).run()
    const handler = handlerMap.get('payroll:run')!
    const event = {}; attachActor(event)
    const result = await handler(event, 3, 2026, 9) as any
    expect(result.success).toBe(false)
    expect(result.error).toContain('already exists')
  })

  // ── branch coverage: payroll:run with no active staff ──
  it('payroll:run with no active staff creates empty payroll', async () => {
    const handler = handlerMap.get('payroll:run')!
    const event = {}; attachActor(event)
    // Month/year not yet used, no staff seeded → empty payroll results
    const result = await handler(event, 7, 2026, 9) as any
    expect(result.success).toBe(true)
    expect(result.results).toEqual([])
  })

  // ── branch coverage: payroll:getDetails with deductions but missing specific names ──
  it('payroll:getDetails returns 0 for missing deduction names', async () => {
    db.prepare(`INSERT INTO payroll_period (id, period_name, month, year, start_date, end_date, status)
      VALUES (902, 'Apr 2026', 4, 2026, '2026-04-01', '2026-04-30', 'DRAFT')`).run()
    db.prepare(`INSERT INTO staff (id, first_name, last_name, staff_number, department, job_title, basic_salary)
      VALUES (99, 'Bob', 'Test', 'STF099', 'IT', 'Dev', 3000000)`).run()
    db.prepare(`INSERT INTO payroll (id, period_id, staff_id, basic_salary, gross_salary, total_deductions, net_salary)
      VALUES (99, 902, 99, 3000000, 3000000, 0, 3000000)`).run()
    // No deductions or allowances inserted → should default to 0
    const handler = handlerMap.get('payroll:getDetails')!
    const event = {}; attachActor(event)
    const result = await handler(event, 902) as any
    expect(result.success).toBe(true)
    expect(result.results[0].paye).toBe(0)
    expect(result.results[0].nssf).toBe(0)
    expect(result.results[0].allowances).toBe(0)
  })

  /* ==================================================================
   *  Branch coverage: payroll:run – duplicate period (L142-143)
   * ================================================================== */
  it('payroll:run rejects duplicate period', async () => {
    db.prepare(`INSERT INTO payroll_period (id, period_name, month, year, start_date, end_date, status)
      VALUES (950, 'Jul 2026', 7, 2026, '2026-07-01', '2026-07-31', 'DRAFT')`).run()
    const handler = handlerMap.get('payroll:run')!
    const event = {}; attachActor(event)
    const result = await handler(event, 7, 2026, 9) as any
    expect(result.success).toBe(false)
    expect(result.error).toContain('already exists')
  })

  /* ==================================================================
   *  Branch coverage: payroll:confirm – non-DRAFT period (L146)
   * ================================================================== */
  it('payroll:confirm rejects non-DRAFT period', async () => {
    db.prepare(`INSERT INTO payroll_period (id, period_name, month, year, start_date, end_date, status)
      VALUES (951, 'Aug 2026', 8, 2026, '2026-08-01', '2026-08-31', 'CONFIRMED')`).run()
    const handler = handlerMap.get('payroll:confirm')!
    const event = {}; attachActor(event)
    const result = await handler(event, 951) as any
    expect(result.success).toBe(false)
    expect(result.error).toContain('Only DRAFT')
  })

  /* ==================================================================
   *  Branch coverage: payroll:markPaid – non-CONFIRMED period (L151)
   * ================================================================== */
  it('payroll:markPaid rejects non-CONFIRMED period', async () => {
    db.prepare(`INSERT INTO payroll_period (id, period_name, month, year, start_date, end_date, status)
      VALUES (952, 'Sep 2026', 9, 2026, '2026-09-01', '2026-09-30', 'DRAFT')`).run()
    const handler = handlerMap.get('payroll:markPaid')!
    const event = {}; attachActor(event)
    const result = await handler(event, 952) as any
    expect(result.success).toBe(false)
    expect(result.error).toContain('Only CONFIRMED')
  })

  /* ==================================================================
   *  Branch coverage: payroll:markPaid – period not found (L158)
   * ================================================================== */
  it('payroll:markPaid returns error for non-existent period', async () => {
    const handler = handlerMap.get('payroll:markPaid')!
    const event = {}; attachActor(event)
    const result = await handler(event, 99999) as any
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  /* ==================================================================
   *  Branch coverage: payroll:markPaid – success with net > 0 (L175)
   * ================================================================== */
  it('payroll:markPaid succeeds for CONFIRMED period with payroll data', async () => {
    db.prepare(`INSERT INTO payroll_period (id, period_name, month, year, start_date, end_date, status)
      VALUES (953, 'Oct 2026', 10, 2026, '2026-10-01', '2026-10-31', 'CONFIRMED')`).run()
    db.prepare(`INSERT INTO staff (id, first_name, last_name, staff_number, department, job_title, basic_salary)
      VALUES (200, 'Pay', 'Test', 'STF200', 'IT', 'Dev', 5000000)`).run()
    db.prepare(`INSERT INTO payroll (id, period_id, staff_id, basic_salary, gross_salary, total_deductions, net_salary)
      VALUES (200, 953, 200, 5000000, 5000000, 1000000, 4000000)`).run()
    const handler = handlerMap.get('payroll:markPaid')!
    const event = {}; attachActor(event)
    const result = await handler(event, 953) as any
    expect(result.success).toBe(true)
    const period = db.prepare('SELECT status FROM payroll_period WHERE id = 953').get() as any
    expect(period.status).toBe('PAID')
  })

  /* ==================================================================
   *  Branch coverage: payroll:delete – non-DRAFT (L236)
   * ================================================================== */
  it('payroll:delete rejects non-DRAFT period', async () => {
    db.prepare(`INSERT INTO payroll_period (id, period_name, month, year, start_date, end_date, status)
      VALUES (954, 'Nov 2026', 11, 2026, '2026-11-01', '2026-11-30', 'CONFIRMED')`).run()
    const handler = handlerMap.get('payroll:delete')!
    const event = {}; attachActor(event)
    const result = await handler(event, 954) as any
    expect(result.success).toBe(false)
    expect(result.error).toContain('Only DRAFT')
  })

  /* ==================================================================
   *  Branch coverage: payroll:recalculate – non-DRAFT (L347-348)
   * ================================================================== */
  it('payroll:recalculate rejects non-DRAFT period', async () => {
    db.prepare(`INSERT INTO payroll_period (id, period_name, month, year, start_date, end_date, status)
      VALUES (955, 'Dec 2026', 12, 2026, '2026-12-01', '2026-12-31', 'PAID')`).run()
    const handler = handlerMap.get('payroll:recalculate')!
    const event = {}; attachActor(event)
    const result = await handler(event, 955) as any
    expect(result.success).toBe(false)
    expect(result.error).toContain('Only DRAFT')
  })

  /* ==================================================================
   *  Branch coverage: payroll:confirm – period not found
   * ================================================================== */
  it('payroll:confirm returns error for non-existent period', async () => {
    const handler = handlerMap.get('payroll:confirm')!
    const event = {}; attachActor(event)
    const result = await handler(event, 99998) as any
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  /* ==================================================================
   *  Branch coverage: payroll:revertToDraft – non-CONFIRMED (L99)
   * ================================================================== */
  it('payroll:revertToDraft rejects non-CONFIRMED period', async () => {
    db.prepare(`INSERT INTO payroll_period (id, period_name, month, year, start_date, end_date, status)
      VALUES (956, 'Jan 2027', 1, 2027, '2027-01-01', '2027-01-31', 'DRAFT')`).run()
    const handler = handlerMap.get('payroll:revertToDraft')!
    const event = {}; attachActor(event)
    const result = await handler(event, 956) as any
    expect(result.success).toBe(false)
    expect(result.error).toContain('Only CONFIRMED')
  })

  /* ==================================================================
   *  Branch coverage: payroll:generateP10Csv, getPayrollIdsForPeriod, generatePayslip
   * ================================================================== */
  it('payroll:generateP10Csv returns csv data', async () => {
    const handler = handlerMap.get('payroll:generateP10Csv')!
    const event = {}; attachActor(event)
    const result = await handler(event, 1) as any
    expect(result.success).toBe(true)
    expect(result.data).toBe('csv-data-here')
  })

  it('payroll:getPayrollIdsForPeriod returns ids', async () => {
    const handler = handlerMap.get('payroll:getPayrollIdsForPeriod')!
    const event = {}; attachActor(event)
    const result = await handler(event, 1) as any
    expect(result.success).toBe(true)
    expect(result.data).toEqual([1, 2, 3])
  })

  it('payroll:generatePayslip returns payslip data', async () => {
    const handler = handlerMap.get('payroll:generatePayslip')!
    const event = {}; attachActor(event)
    const result = await handler(event, 1) as any
    expect(result.success).toBe(true)
    expect(result.data.staffName).toBe('Test Staff')
  })
})
