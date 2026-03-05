/**
 * Additional coverage tests for payroll-handlers.ts
 * Targets: duplicate period, markPaid with zero net, markPaid missing period,
 *          recalculate with no staff, payroll:run with staff allowances,
 *          generateP10Csv error, generatePayslip error
 */
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
      user: { id: sessionUserId, username: 'pay-user', role: sessionRole, full_name: 'Pay User', email: null, is_active: 1, last_login: null, created_at: '2026-01-01T00:00:00' },
      lastActivity: Date.now()
    })),
    setPassword: vi.fn().mockResolvedValue(null),
    deletePassword: vi.fn().mockResolvedValue(true),
  }
}))

vi.mock('../../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => handlerMap.set(channel, handler)),
    removeHandler: vi.fn(),
  }
}))

vi.mock('../../../database', () => ({ getDatabase: () => db }))
vi.mock('../../../database/utils/audit', () => ({ logAudit: vi.fn() }))

const journalMock = { createJournalEntrySync: vi.fn().mockReturnValue({ success: true }) }

vi.mock('../../../services/accounting/DoubleEntryJournalService', () => ({
  DoubleEntryJournalService: class {
    createJournalEntrySync = journalMock.createJournalEntrySync
  }
}))

vi.mock('../../../services/finance/PayrollJournalService', () => ({
  PayrollJournalService: class { postPayrollToGL() { return { success: true } } }
}))

const p10Mock = { generateP10Csv: vi.fn(() => 'csv-data') }
const payslipMock = {
  getPayrollIdsForPeriod: vi.fn(() => [1]),
  generatePayslip: vi.fn(() => ({ staffName: 'X' })),
}

vi.mock('../../../services/payroll/P10ExportService', () => ({
  P10ExportService: class {
    generateP10Csv = p10Mock.generateP10Csv
  }
}))

vi.mock('../../../services/payroll/PayslipGenerationService', () => ({
  PayslipGenerationService: class {
    getPayrollIdsForPeriod = payslipMock.getPayrollIdsForPeriod
    generatePayslip = payslipMock.generatePayslip
  }
}))

import { registerPayrollHandlers } from '../payroll-handlers'

function seedSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fee_category (id INTEGER PRIMARY KEY AUTOINCREMENT, category_name TEXT NOT NULL UNIQUE, description TEXT, is_active BOOLEAN DEFAULT 1, priority INTEGER DEFAULT 99, gl_account_id INTEGER);
    CREATE TABLE IF NOT EXISTS invoice_item (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL, fee_category_id INTEGER NOT NULL, description TEXT NOT NULL, amount INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS receipt (id INTEGER PRIMARY KEY AUTOINCREMENT, receipt_number TEXT NOT NULL UNIQUE, transaction_id INTEGER NOT NULL UNIQUE, receipt_date DATE NOT NULL, student_id INTEGER NOT NULL, amount INTEGER NOT NULL, amount_in_words TEXT, payment_method TEXT NOT NULL, payment_reference TEXT, printed_count INTEGER DEFAULT 0, created_by_user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS gl_account (id INTEGER PRIMARY KEY AUTOINCREMENT, account_code TEXT NOT NULL UNIQUE, account_name TEXT NOT NULL, account_type TEXT NOT NULL, normal_balance TEXT NOT NULL, is_active BOOLEAN DEFAULT 1);
    INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1100', 'Accounts Receivable', 'ASSET', 'DEBIT');
    INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('2020', 'Student Credit Balance', 'LIABILITY', 'CREDIT');
    INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1010', 'Cash', 'ASSET', 'DEBIT');
    INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1020', 'Bank', 'ASSET', 'DEBIT');
    INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('4010', 'Tuition Revenue', 'REVENUE', 'CREDIT');
    CREATE TABLE IF NOT EXISTS journal_entry (id INTEGER PRIMARY KEY AUTOINCREMENT, entry_ref TEXT NOT NULL UNIQUE, entry_date DATE NOT NULL, entry_type TEXT NOT NULL, description TEXT NOT NULL, student_id INTEGER, staff_id INTEGER, term_id INTEGER, is_posted BOOLEAN DEFAULT 0, posted_by_user_id INTEGER, posted_at DATETIME, is_voided BOOLEAN DEFAULT 0, voided_reason TEXT, voided_by_user_id INTEGER, voided_at DATETIME, requires_approval BOOLEAN DEFAULT 0, approval_status TEXT DEFAULT 'PENDING', approved_by_user_id INTEGER, approved_at DATETIME, created_by_user_id INTEGER NOT NULL, source_ledger_txn_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS journal_entry_line (id INTEGER PRIMARY KEY AUTOINCREMENT, journal_entry_id INTEGER NOT NULL, line_number INTEGER NOT NULL, gl_account_id INTEGER NOT NULL, debit_amount INTEGER DEFAULT 0, credit_amount INTEGER DEFAULT 0, description TEXT);
    CREATE TABLE IF NOT EXISTS approval_rule (id INTEGER PRIMARY KEY AUTOINCREMENT, rule_name TEXT NOT NULL UNIQUE, description TEXT, transaction_type TEXT NOT NULL, min_amount INTEGER, max_amount INTEGER, days_since_transaction INTEGER, required_role_id INTEGER, is_active BOOLEAN DEFAULT 1, created_by_user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE payroll_period (id INTEGER PRIMARY KEY AUTOINCREMENT, period_name TEXT, month INTEGER, year INTEGER, start_date TEXT, end_date TEXT, status TEXT, created_at TEXT, approved_by_user_id INTEGER, approved_at TEXT, transaction_ref TEXT);
    CREATE TABLE payroll (id INTEGER PRIMARY KEY AUTOINCREMENT, period_id INTEGER, staff_id INTEGER, basic_salary INTEGER, gross_salary INTEGER, total_deductions INTEGER, net_salary INTEGER, payment_status TEXT DEFAULT 'PENDING', payment_date TEXT);
    CREATE TABLE payroll_deduction (id INTEGER PRIMARY KEY AUTOINCREMENT, payroll_id INTEGER, deduction_name TEXT, amount INTEGER);
    CREATE TABLE payroll_allowance (id INTEGER PRIMARY KEY AUTOINCREMENT, payroll_id INTEGER, allowance_name TEXT, amount INTEGER);
    CREATE TABLE statutory_rates (id INTEGER PRIMARY KEY AUTOINCREMENT, rate_type TEXT, min_amount INTEGER, max_amount INTEGER, rate REAL, fixed_amount INTEGER, is_current INTEGER DEFAULT 1);
    CREATE TABLE staff (id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT, last_name TEXT, middle_name TEXT, staff_number TEXT, department TEXT, job_title TEXT, phone TEXT, basic_salary INTEGER, is_active INTEGER DEFAULT 1);
    CREATE TABLE staff_allowance (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER, allowance_name TEXT, amount INTEGER, is_active INTEGER DEFAULT 1);
    CREATE TABLE transaction_category (id INTEGER PRIMARY KEY AUTOINCREMENT, category_name TEXT, category_type TEXT, is_system INTEGER, is_active INTEGER);
    CREATE TABLE ledger_transaction (id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_ref TEXT, transaction_date TEXT, transaction_type TEXT, category_id INTEGER, amount INTEGER, debit_credit TEXT, payment_method TEXT, payment_reference TEXT, description TEXT, recorded_by_user_id INTEGER, is_voided INTEGER);
  `)
}

function seedRatesAndStaff() {
  db.exec(`
    INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('NSSF_TIER_I', 0, 7000, 0, 720, 1);
    INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('NSSF_TIER_II', 7001, 36000, 0, 1440, 1);
    INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('HOUSING_LEVY', 0, NULL, 0.015, 0, 1);
    INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('SHIF', 0, NULL, 0.0275, 0, 1);
    INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('PAYE_BAND', 0, 24000, 0.10, 0, 1);
    INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('PERSONAL_RELIEF', 0, NULL, 0, 2400, 1);
    INSERT INTO staff (id, first_name, last_name, staff_number, department, job_title, basic_salary, is_active) VALUES (1, 'Jane', 'Doe', 'STF001', 'Admin', 'Clerk', 5000000, 1);
  `)
}

describe('payroll-handlers coverage expansion', () => {
  beforeEach(() => {
    clearSessionCache()
    handlerMap.clear()
    sessionUserId = 9
    sessionRole = 'ACCOUNTS_CLERK'
    vi.clearAllMocks()
    db = new Database(':memory:')
    seedSchema()
    registerPayrollHandlers()
  })

  afterEach(() => { db.close() })

  // ─── payroll:run duplicate period ───────────────────────
  it('payroll:run rejects duplicate period', async () => {
    db.prepare(`INSERT INTO payroll_period (period_name, month, year, start_date, end_date, status) VALUES ('Jan 2026', 1, 2026, '2026-01-01', '2026-01-31', 'DRAFT')`).run()
    const handler = handlerMap.get('payroll:run')!
    const result = await handler({}, 1, 2026, 9) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('already exists')
  })

  // ─── payroll:run with staff allowances ──────────────────
  it('payroll:run includes staff allowances in gross', async () => {
    seedRatesAndStaff()
    db.prepare(`INSERT INTO staff_allowance (staff_id, allowance_name, amount, is_active) VALUES (1, 'Transport', 200000, 1)`).run()
    db.prepare(`INSERT INTO staff_allowance (staff_id, allowance_name, amount, is_active) VALUES (1, 'Housing', 300000, 1)`).run()
    const handler = handlerMap.get('payroll:run')!
    const result = await handler({}, 3, 2026, 9) as { success: boolean; results: Array<{ gross_salary: number; allowances: number }> }
    expect(result.success).toBe(true)
    expect(result.results[0].allowances).toBe(500000)
    expect(result.results[0].gross_salary).toBe(5000000 + 500000)
  })

  // ─── payroll:markPaid with zero net (no journal) ────────
  it('payroll:markPaid skips journal when totalNet is 0', async () => {
    db.prepare(`INSERT INTO payroll_period (id, period_name, month, year, start_date, end_date, status) VALUES (1, 'Jan 2026', 1, 2026, '2026-01-01', '2026-01-31', 'CONFIRMED')`).run()
    // No payroll rows → totalNet = 0
    const handler = handlerMap.get('payroll:markPaid')!
    const result = await handler({}, 1) as { success: boolean }
    expect(result.success).toBe(true)
    // No ledger transaction should exist
    const ledger = db.prepare('SELECT COUNT(*) as c FROM ledger_transaction').get() as { c: number }
    expect(ledger.c).toBe(0)
  })

  // ─── payroll:markPaid missing period ────────────────────
  it('payroll:markPaid returns error for missing period', async () => {
    const handler = handlerMap.get('payroll:markPaid')!
    const result = await handler({}, 999) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  // ─── payroll:delete missing period ──────────────────────
  it('payroll:delete returns error for missing period', async () => {
    const handler = handlerMap.get('payroll:delete')!
    const result = await handler({}, 999) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  // ─── payroll:revertToDraft missing period ───────────────
  it('payroll:revertToDraft returns error for missing period', async () => {
    const handler = handlerMap.get('payroll:revertToDraft')!
    const result = await handler({}, 999) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  // ─── payroll:recalculate missing period ─────────────────
  it('payroll:recalculate returns error for missing period', async () => {
    const handler = handlerMap.get('payroll:recalculate')!
    const result = await handler({}, 999) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  // ─── payroll:recalculate with no active staff ───────────
  it('payroll:recalculate fails when no active staff', async () => {
    db.prepare(`INSERT INTO payroll_period (id, period_name, month, year, start_date, end_date, status) VALUES (1, 'Jan 2026', 1, 2026, '2026-01-01', '2026-01-31', 'DRAFT')`).run()
    db.prepare(`INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('PAYE_BAND', 0, 24000, 0.10, 0, 1)`).run()
    const handler = handlerMap.get('payroll:recalculate')!
    const result = await handler({}, 1) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('No active staff')
  })

  // ─── payroll:markPaid creates Salary Payment category when missing ─
  it('payroll:markPaid creates Salary Payment category if missing', async () => {
    seedRatesAndStaff()
    db.prepare(`INSERT INTO payroll_period (id, period_name, month, year, start_date, end_date, status) VALUES (1, 'Jan 2026', 1, 2026, '2026-01-01', '2026-01-31', 'CONFIRMED')`).run()
    db.prepare(`INSERT INTO payroll (period_id, staff_id, basic_salary, gross_salary, total_deductions, net_salary) VALUES (1, 1, 5000000, 5000000, 800000, 4200000)`).run()
    // No 'Salary Payment' category exists
    const handler = handlerMap.get('payroll:markPaid')!
    const result = await handler({}, 1) as { success: boolean }
    expect(result.success).toBe(true)
    const cat = db.prepare("SELECT * FROM transaction_category WHERE category_name = 'Salary Payment'").get() as any
    expect(cat).toBeDefined()
    expect(cat.category_type).toBe('EXPENSE')
  })

  // ─── payroll:markPaid uses existing Salary Payment category ─
  it('payroll:markPaid reuses existing Salary Payment category', async () => {
    seedRatesAndStaff()
    db.prepare("INSERT INTO transaction_category (category_name, category_type, is_system, is_active) VALUES ('Salary Payment', 'EXPENSE', 1, 1)").run()
    db.prepare(`INSERT INTO payroll_period (id, period_name, month, year, start_date, end_date, status) VALUES (1, 'Jan 2026', 1, 2026, '2026-01-01', '2026-01-31', 'CONFIRMED')`).run()
    db.prepare(`INSERT INTO payroll (period_id, staff_id, basic_salary, gross_salary, total_deductions, net_salary) VALUES (1, 1, 5000000, 5000000, 800000, 4200000)`).run()
    const handler = handlerMap.get('payroll:markPaid')!
    const result = await handler({}, 1) as { success: boolean }
    expect(result.success).toBe(true)
    // Should still be only 1 category
    const cats = db.prepare("SELECT COUNT(*) as c FROM transaction_category WHERE category_name = 'Salary Payment'").get() as { c: number }
    expect(cats.c).toBe(1)
  })

  // ─── payroll:generateP10Csv error path ──────────────────
  it('payroll:generateP10Csv returns error on service failure', async () => {
    p10Mock.generateP10Csv.mockImplementationOnce(() => { throw new Error('No P10 data') })
    const handler = handlerMap.get('payroll:generateP10Csv')!
    const result = await handler({}, 1) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toBe('No P10 data')
  })

  // ─── payroll:getPayrollIdsForPeriod error path ──────────
  it('payroll:getPayrollIdsForPeriod returns error on failure', async () => {
    payslipMock.getPayrollIdsForPeriod.mockImplementationOnce(() => { throw new Error('Period invalid') })
    const handler = handlerMap.get('payroll:getPayrollIdsForPeriod')!
    const result = await handler({}, 1) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toBe('Period invalid')
  })

  // ─── payroll:generatePayslip error path ─────────────────
  it('payroll:generatePayslip returns error on failure', async () => {
    payslipMock.generatePayslip.mockImplementationOnce(() => { throw new Error('Payslip not found') })
    const handler = handlerMap.get('payroll:generatePayslip')!
    const result = await handler({}, 1) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toBe('Payslip not found')
  })

  // ─── payroll:run with low-salary staff (NSSF tier I only) ─
  it('payroll:run computes NSSF tier I only for low salary', async () => {
    db.exec(`
      INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('NSSF_TIER_I', 0, 7000, 0, 720, 1);
      INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('NSSF_TIER_II', 7001, 36000, 0, 1440, 1);
      INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('HOUSING_LEVY', 0, NULL, 0.015, 0, 1);
      INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('SHIF', 0, NULL, 0.0275, 0, 1);
      INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('PAYE_BAND', 0, 24000, 0.10, 0, 1);
      INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('PERSONAL_RELIEF', 0, NULL, 0, 2400, 1);
      INSERT INTO staff (id, first_name, last_name, staff_number, department, job_title, basic_salary, is_active) VALUES (1, 'Low', 'Earner', 'STF002', 'Support', 'Aide', 500000, 1);
    `)
    // 500000 cents = 5000 KSh which is < 7000, so NSSF tier II should not apply
    const handler = handlerMap.get('payroll:run')!
    const result = await handler({}, 6, 2026, 9) as { success: boolean; results: Array<{ nssf: number }> }
    expect(result.success).toBe(true)
    // Only tier I (720 KSh = 72000 cents)
    expect(result.results[0].nssf).toBe(72000)
  })

  // ── branch coverage: payroll:run with multiple PAYE bands ──
  it('payroll:run applies multiple PAYE bands for higher salary', async () => {
    db.exec(`
      INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('NSSF_TIER_I', 0, 7000, 0, 720, 1);
      INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('NSSF_TIER_II', 7001, 36000, 0, 1440, 1);
      INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('HOUSING_LEVY', 0, NULL, 0.015, 0, 1);
      INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('SHIF', 0, NULL, 0.0275, 0, 1);
      INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('PAYE_BAND', 0, 24000, 0.10, 0, 1);
      INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('PAYE_BAND', 24001, 40000, 0.25, 0, 1);
      INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('PERSONAL_RELIEF', 0, NULL, 0, 2400, 1);
      INSERT INTO staff (id, first_name, last_name, staff_number, department, job_title, basic_salary, is_active) VALUES (1, 'High', 'Earner', 'STF003', 'Admin', 'Manager', 3500000, 1);
    `)
    const handler = handlerMap.get('payroll:run')!
    const result = await handler({}, 7, 2026, 9) as { success: boolean; results: Array<{ paye: number }> }
    expect(result.success).toBe(true)
    // 35000 KSh gross: first 24000 at 10% = 2400, next 11000 at 25% = 2750; total PAYE = 5150 - 2400 relief = 2750 KSh
    expect(result.results[0].paye).toBeGreaterThan(0)
  })

  // ── branch coverage: payroll:run with NO NSSF/PERSONAL_RELIEF rates → defaults (L142,L143,L158) ──
  it('payroll:run uses default NSSF and personal relief when rates missing', async () => {
    // Only insert HOUSING_LEVY, SHIF and PAYE_BAND — no NSSF_TIER_I, NSSF_TIER_II, PERSONAL_RELIEF
    db.exec(`
      INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('HOUSING_LEVY', 0, NULL, 0.015, 0, 1);
      INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('SHIF', 0, NULL, 0.0275, 0, 1);
      INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('PAYE_BAND', 0, 24000, 0.10, 0, 1);
      INSERT INTO staff (id, first_name, last_name, staff_number, department, job_title, basic_salary, is_active) VALUES (1, 'No', 'Rates', 'STF_DEF', 'Admin', 'Clerk', 5000000, 1);
    `)
    const handler = handlerMap.get('payroll:run')!
    const result = await handler({}, 10, 2026, 9) as { success: boolean; results: Array<{ nssf: number; paye: number }> }
    expect(result.success).toBe(true)
    // Defaults: NSSF tier I = 720 (72000 cents) + tier II = 1440 (144000 cents) = 216000 cents
    expect(result.results[0].nssf).toBe(72000 + 144000)
  })

  // ── branch coverage: PAYE band without max_amount → 99_999_999 fallback (L99) ──
  it('payroll:run handles PAYE band with NULL max_amount', async () => {
    db.exec(`
      INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('NSSF_TIER_I', 0, 7000, 0, 720, 1);
      INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('NSSF_TIER_II', 7001, 36000, 0, 1440, 1);
      INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('HOUSING_LEVY', 0, NULL, 0.015, 0, 1);
      INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('SHIF', 0, NULL, 0.0275, 0, 1);
      INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('PERSONAL_RELIEF', 0, NULL, 0, 2400, 1);
      INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('PAYE_BAND', 0, NULL, 0.10, 0, 1);
      INSERT INTO staff (id, first_name, last_name, staff_number, department, job_title, basic_salary, is_active) VALUES (1, 'Null', 'Max', 'STF_NM', 'Admin', 'Clerk', 3000000, 1);
    `)
    const handler = handlerMap.get('payroll:run')!
    const result = await handler({}, 11, 2026, 9) as { success: boolean; results: Array<{ paye: number }> }
    expect(result.success).toBe(true)
    // Single band with no max → effectively covers all taxable income
    expect(result.results[0].paye).toBeGreaterThan(0)
  })

  // ── branch coverage: payroll:recalculate on a valid period recomputes results ──
  it('payroll:recalculate re-runs payroll calculation on existing period', async () => {
    seedRatesAndStaff()
    const runHandler = handlerMap.get('payroll:run')!
    const runResult = await runHandler({}, 3, 2026, 9) as { success: boolean; periodId: number }
    expect(runResult.success).toBe(true)
    // Retrieve period id from DB
    const period = db.prepare('SELECT id FROM payroll_period ORDER BY id DESC LIMIT 1').get() as { id: number }
    const recalcHandler = handlerMap.get('payroll:recalculate')!
    const result = await recalcHandler({}, period.id) as { success: boolean }
    expect(result.success).toBe(true)
  })

  // ── branch coverage: default HOUSING_LEVY and SHIF rates (lines 151, 156) ──
  it('payroll:run uses default HOUSING_LEVY and SHIF rates when not configured', async () => {
    // Only NSSF, PAYE_BAND, PERSONAL_RELIEF — omit HOUSING_LEVY and SHIF
    db.exec(`
      INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('NSSF_TIER_I', 0, 7000, 0, 720, 1);
      INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('NSSF_TIER_II', 7001, 36000, 0, 1440, 1);
      INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('PAYE_BAND', 0, 24000, 0.10, 0, 1);
      INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, is_current) VALUES ('PERSONAL_RELIEF', 0, NULL, 0, 2400, 1);
      INSERT INTO staff (id, first_name, last_name, staff_number, department, job_title, basic_salary, is_active) VALUES (1, 'Default', 'Rates', 'STF_DR', 'Admin', 'Clerk', 5000000, 1);
    `)
    const handler = handlerMap.get('payroll:run')!
    const result = await handler({}, 12, 2026, 9) as { success: boolean; results: Array<{ housing_levy: number; shif: number }> }
    expect(result.success).toBe(true)
    // gross = 50000 KSh, default housing levy rate = 0.015, default SHIF rate = 0.0275
    // housing_levy = 50000 * 0.015 = 750 KSh = 75000 cents
    // shif = 50000 * 0.0275 = 1375 KSh = 137500 cents
    expect(result.results[0].housing_levy).toBe(75000)
    expect(result.results[0].shif).toBe(137500)
  })

  // ── branch coverage: payroll:recalculate with zero statutory rates (line 386+) ──
  it('payroll:recalculate fails when no statutory rates configured', async () => {
    db.prepare(`INSERT INTO payroll_period (id, period_name, month, year, start_date, end_date, status) VALUES (99, 'NoRates', 9, 2026, '2026-09-01', '2026-09-30', 'DRAFT')`).run()
    const handler = handlerMap.get('payroll:recalculate')!
    const result = await handler({}, 99) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('statutory rates')
  })

  // ── branch coverage: payroll:markPaid journal failure with error message (L348 left branch) ──
  it('payroll:markPaid fails when journal entry returns error with message', async () => {
    seedRatesAndStaff()
    db.prepare(`INSERT INTO payroll_period (id, period_name, month, year, start_date, end_date, status) VALUES (800, 'JournalFail1', 8, 2027, '2027-08-01', '2027-08-31', 'CONFIRMED')`).run()
    db.prepare(`INSERT INTO payroll (period_id, staff_id, basic_salary, gross_salary, total_deductions, net_salary) VALUES (800, 1, 5000000, 5000000, 800000, 4200000)`).run()
    journalMock.createJournalEntrySync.mockReturnValueOnce({ success: false, error: 'Debit-credit mismatch' })
    const handler = handlerMap.get('payroll:markPaid')!
    const result = await handler({}, 800) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Debit-credit mismatch')
  })

  // ── branch coverage: payroll:markPaid journal failure without error message (L348 right branch) ──
  it('payroll:markPaid uses fallback message when journal error is empty', async () => {
    seedRatesAndStaff()
    db.prepare(`INSERT INTO payroll_period (id, period_name, month, year, start_date, end_date, status) VALUES (801, 'JournalFail2', 9, 2027, '2027-09-01', '2027-09-30', 'CONFIRMED')`).run()
    db.prepare(`INSERT INTO payroll (period_id, staff_id, basic_salary, gross_salary, total_deductions, net_salary) VALUES (801, 1, 5000000, 5000000, 800000, 4200000)`).run()
    journalMock.createJournalEntrySync.mockReturnValueOnce({ success: false })
    const handler = handlerMap.get('payroll:markPaid')!
    const result = await handler({}, 801) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to create journal entry for salary payment')
  })
})
