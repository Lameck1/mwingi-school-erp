import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

let db: Database.Database
const handlerMap = new Map<string, IpcHandler>()

const sessionUserId = 9
const sessionRole = 'ACCOUNTS_CLERK'

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
    constructor(_db: unknown) { }
    postPayrollToGL() {
      return { success: true }
    }
  }
}))

import { registerPayrollHandlers } from '../payroll-handlers'

/**
 * Payroll Statutory Computation Tests
 *
 * Validates the PAYE calculation against 2024/2025 Kenyan tax law:
 * - NSSF: Tier I (KSh 720) + Tier II (KSh 1,440 if gross > 7,000)
 * - SHIF: 2.75% of gross
 * - Housing Levy: 1.5% of gross (employee) + 1.5% of gross (employer match)
 * - PAYE: Progressive bands on (Gross - NSSF - SHIF - Housing Levy), less personal relief
 */
describe('payroll statutory computation', () => {
  function attachActor(event: Record<string, unknown>) {
    event.__ipcActor = {
      id: sessionUserId,
      role: sessionRole,
      username: 'payroll-user',
      full_name: 'Payroll User',
      email: null,
      is_active: 1,
      created_at: '2026-01-01T00:00:00'
    }
  }

  beforeEach(() => {
    handlerMap.clear()
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE fee_category (
        id INTEGER PRIMARY KEY AUTOINCREMENT, category_name TEXT NOT NULL UNIQUE,
        description TEXT, is_active BOOLEAN DEFAULT 1, priority INTEGER DEFAULT 99,
        gl_account_id INTEGER
      );
      CREATE TABLE invoice_item (
        id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL,
        fee_category_id INTEGER NOT NULL, description TEXT NOT NULL, amount INTEGER NOT NULL
      );
      CREATE TABLE receipt (
        id INTEGER PRIMARY KEY AUTOINCREMENT, receipt_number TEXT NOT NULL UNIQUE,
        transaction_id INTEGER NOT NULL UNIQUE, receipt_date DATE NOT NULL,
        student_id INTEGER NOT NULL, amount INTEGER NOT NULL, amount_in_words TEXT,
        payment_method TEXT NOT NULL, payment_reference TEXT, printed_count INTEGER DEFAULT 0,
        created_by_user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE gl_account (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_code TEXT NOT NULL UNIQUE,
        account_name TEXT NOT NULL,
        account_type TEXT NOT NULL,
        normal_balance TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 1
      );
      INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance)
        VALUES ('1100', 'Accounts Receivable', 'ASSET', 'DEBIT');
      INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance)
        VALUES ('2020', 'Student Credit Balance', 'LIABILITY', 'CREDIT');
      INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance)
        VALUES ('1010', 'Cash', 'ASSET', 'DEBIT');
      INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance)
        VALUES ('1020', 'Bank', 'ASSET', 'DEBIT');
      INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance)
        VALUES ('4010', 'Tuition Revenue', 'REVENUE', 'CREDIT');

      CREATE TABLE journal_entry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_ref TEXT NOT NULL UNIQUE,
        entry_date DATE NOT NULL,
        entry_type TEXT NOT NULL,
        description TEXT NOT NULL,
        student_id INTEGER, staff_id INTEGER, term_id INTEGER,
        is_posted BOOLEAN DEFAULT 0, posted_by_user_id INTEGER, posted_at DATETIME,
        is_voided BOOLEAN DEFAULT 0, voided_reason TEXT, voided_by_user_id INTEGER, voided_at DATETIME,
        requires_approval BOOLEAN DEFAULT 0, approval_status TEXT DEFAULT 'PENDING',
        approved_by_user_id INTEGER, approved_at DATETIME,
        created_by_user_id INTEGER NOT NULL, source_ledger_txn_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE journal_entry_line (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        journal_entry_id INTEGER NOT NULL,
        line_number INTEGER NOT NULL,
        gl_account_id INTEGER NOT NULL,
        debit_amount INTEGER DEFAULT 0,
        credit_amount INTEGER DEFAULT 0,
        description TEXT
      );
      CREATE TABLE approval_rule (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rule_name TEXT NOT NULL UNIQUE,
        description TEXT,
        transaction_type TEXT NOT NULL,
        min_amount INTEGER, max_amount INTEGER,
        days_since_transaction INTEGER,
        required_role_id INTEGER,
        is_active BOOLEAN DEFAULT 1,
        created_by_user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE payroll_period (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        period_name TEXT, month INTEGER, year INTEGER,
        start_date TEXT, end_date TEXT, status TEXT,
        created_at TEXT, approved_by_user_id INTEGER, approved_at TEXT,
        transaction_ref TEXT
      );
      CREATE TABLE payroll (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        period_id INTEGER, staff_id INTEGER,
        basic_salary INTEGER, gross_salary INTEGER,
        total_deductions INTEGER, net_salary INTEGER,
        payment_status TEXT DEFAULT 'PENDING', payment_date TEXT
      );
      CREATE TABLE payroll_deduction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payroll_id INTEGER, deduction_name TEXT, amount INTEGER
      );
      CREATE TABLE payroll_allowance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payroll_id INTEGER, allowance_name TEXT, amount INTEGER
      );
      CREATE TABLE statutory_rates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rate_type TEXT, min_amount INTEGER, max_amount INTEGER,
        rate REAL, fixed_amount INTEGER, is_current INTEGER DEFAULT 1
      );
      CREATE TABLE staff (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT, last_name TEXT, middle_name TEXT,
        staff_number TEXT, department TEXT, job_title TEXT,
        phone TEXT, basic_salary INTEGER, is_active INTEGER DEFAULT 1
      );
      CREATE TABLE staff_allowance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_id INTEGER, allowance_name TEXT, amount INTEGER,
        is_active INTEGER DEFAULT 1
      );
      CREATE TABLE transaction_category (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_name TEXT, category_type TEXT, is_system INTEGER, is_active INTEGER
      );
      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_ref TEXT, transaction_date TEXT, transaction_type TEXT,
        category_id INTEGER, amount INTEGER, debit_credit TEXT,
        payment_method TEXT, payment_reference TEXT, description TEXT,
        recorded_by_user_id INTEGER, is_voided INTEGER
      );
    `)

    // Seed statutory rates as per 2024/2025 Kenya law
    db.exec(`
      INSERT INTO statutory_rates (rate_type, min_amount, max_amount, fixed_amount, is_current)
        VALUES ('NSSF_TIER_I', 0, 7000, 720, 1);
      INSERT INTO statutory_rates (rate_type, min_amount, max_amount, fixed_amount, is_current)
        VALUES ('NSSF_TIER_II', 7001, 36000, 1440, 1);
      INSERT INTO statutory_rates (rate_type, rate, is_current)
        VALUES ('HOUSING_LEVY', 0.015, 1);
      INSERT INTO statutory_rates (rate_type, rate, is_current)
        VALUES ('SHIF', 0.0275, 1);
      INSERT INTO statutory_rates (rate_type, min_amount, max_amount, rate, is_current) VALUES
        ('PAYE_BAND', 0, 24000, 0.1, 1),
        ('PAYE_BAND', 24001, 32333, 0.25, 1),
        ('PAYE_BAND', 32334, 500000, 0.3, 1),
        ('PAYE_BAND', 500001, 800000, 0.325, 1),
        ('PAYE_BAND', 800001, 99999999, 0.35, 1);
      INSERT INTO statutory_rates (rate_type, fixed_amount, is_current)
        VALUES ('PERSONAL_RELIEF', 2400, 1);
    `)

    registerPayrollHandlers()
  })

  afterEach(() => {
    db.close()
  })

  it('correctly computes statutory deductions for a KSh 50,000 salary', async () => {
    // Insert a staff member with 50,000 KSh basic salary (5,000,000 cents)
    db.prepare(`
      INSERT INTO staff (first_name, last_name, staff_number, department, job_title, basic_salary, is_active)
      VALUES ('Jane', 'Doe', 'EMP001', 'Administration', 'Secretary', 5000000, 1)
    `).run()

    const handler = handlerMap.get('payroll:run')
    expect(handler).toBeDefined()
    const event: Record<string, unknown> = {}
    attachActor(event)

    const result = await handler!(event, 3, 2026, 0) as {
      success: boolean
      periodId: number
      results: Array<{
        staff_id: number
        basic_salary: number
        gross_salary: number
        nssf: number
        shif: number
        housing_levy: number
        employer_housing_levy: number
        paye: number
        total_deductions: number
        net_salary: number
      }>
    }

    expect(result.success).toBe(true)
    expect(result.results).toHaveLength(1)

    const r = result.results[0]
    const grossKsh = 50_000

    // NSSF: Tier I (720) + Tier II (1440) = 2160
    const expectedNssf = 2160
    expect(r.nssf).toBe(expectedNssf * 100)

    // SHIF: 2.75% of 50,000 = 1375
    const expectedShif = grossKsh * 0.0275
    expect(r.shif).toBe(Math.round(expectedShif * 100))

    // Housing Levy: 1.5% of 50,000 = 750
    const expectedHousingLevy = grossKsh * 0.015
    expect(r.housing_levy).toBe(Math.round(expectedHousingLevy * 100))

    // Employer Housing Levy should match employee portion
    expect(r.employer_housing_levy).toBe(r.housing_levy)

    // Taxable Pay = 50,000 - 2160 (NSSF) - 1375 (SHIF) - 750 (Housing Levy) = 45,715
    const taxablePay = grossKsh - expectedNssf - expectedShif - expectedHousingLevy

    // Compute PAYE using the same iterative band logic as production code
    const bands = [
      { min: 0, max: 24000, rate: 0.1 },
      { min: 24001, max: 32333, rate: 0.25 },
      { min: 32334, max: 500000, rate: 0.3 },
    ]
    let rawPaye = 0
    let remaining = taxablePay
    for (const band of bands) {
      const bandRange = band.max - band.min
      const amountInBand = Math.min(remaining, bandRange)
      if (amountInBand <= 0) {
        break
      }
      rawPaye += amountInBand * band.rate
      remaining -= amountInBand
    }
    const expectedPaye = Math.max(0, rawPaye - 2400) // personal relief
    expect(r.paye).toBe(Math.round(expectedPaye * 100))

    // Total deductions = NSSF + SHIF + Housing Levy + PAYE
    const expectedTotal = Math.round(expectedNssf * 100) + Math.round(expectedShif * 100) +
      Math.round(expectedHousingLevy * 100) + Math.round(expectedPaye * 100)
    expect(r.total_deductions).toBe(expectedTotal)

    // Net = Gross - Deductions
    expect(r.net_salary).toBe(r.gross_salary - r.total_deductions)
  })

  it('computes zero PAYE when salary is below personal relief threshold', async () => {
    // Insert a staff member with 15,000 KSh basic salary (1,500,000 cents)
    db.prepare(`
      INSERT INTO staff (first_name, last_name, staff_number, department, job_title, basic_salary, is_active)
      VALUES ('Low', 'Salary', 'EMP002', 'Support', 'Cleaner', 1500000, 1)
    `).run()

    const handler = handlerMap.get('payroll:run')
    const event: Record<string, unknown> = {}
    attachActor(event)
    const result = await handler!(event, 4, 2026, 0) as {
      success: boolean
      results: Array<{
        paye: number
        nssf: number
        shif: number
        housing_levy: number
        net_salary: number
        gross_salary: number
      }>
    }

    expect(result.success).toBe(true)
    const r = result.results[0]

    // Gross = 15,000 KSh
    // NSSF: Tier I (720) + Tier II (1440 because 15k > 7k) = 2160
    // SHIF: 15,000 * 0.0275 = 412.5
    // HL: 15,000 * 0.015 = 225
    // Taxable: 15,000 - 2160 - 412.5 - 225 = 12,202.5
    // PAYE on 12,202.5: all in band 1 (0-24,000 at 10%) = 1,220.25
    // Less relief: 1,220.25 - 2400 = negative → clamped to 0
    expect(r.paye).toBe(0)
  })

  it('includes allowances in gross pay for statutory calculation', async () => {
    db.prepare(`
      INSERT INTO staff (first_name, last_name, staff_number, department, job_title, basic_salary, is_active)
      VALUES ('With', 'Allowance', 'EMP003', 'Teaching', 'Teacher', 3000000, 1)
    `).run()
    const staffId = db.prepare('SELECT id FROM staff WHERE staff_number = ?').get('EMP003') as { id: number }

    // Add a house allowance of 10,000 KSh (1,000,000 cents)
    db.prepare('INSERT INTO staff_allowance (staff_id, allowance_name, amount, is_active) VALUES (?, ?, ?, 1)')
      .run(staffId.id, 'House Allowance', 1000000)

    const handler = handlerMap.get('payroll:run')
    const event: Record<string, unknown> = {}
    attachActor(event)
    const result = await handler!(event, 5, 2026, 0) as {
      success: boolean
      results: Array<{
        basic_salary: number
        allowances: number
        gross_salary: number
        nssf: number
      }>
    }

    expect(result.success).toBe(true)
    const r = result.results[0]

    expect(r.basic_salary).toBe(3000000) // 30,000 KSh
    expect(r.allowances).toBe(1000000)   // 10,000 KSh
    expect(r.gross_salary).toBe(4000000) // 40,000 KSh

    // NSSF computed on gross (40,000 > 7,000 so both tiers)
    expect(r.nssf).toBe(216000) // (720 + 1440) * 100
  })

  it('records employer housing levy separately in deductions table', async () => {
    db.prepare(`
      INSERT INTO staff (first_name, last_name, staff_number, department, job_title, basic_salary, is_active)
      VALUES ('Emp', 'Match', 'EMP004', 'Support', 'Guard', 2000000, 1)
    `).run()

    const handler = handlerMap.get('payroll:run')
    const event: Record<string, unknown> = {}
    attachActor(event)
    const result = await handler!(event, 6, 2026, 0) as { success: boolean; periodId: number }

    expect(result.success).toBe(true)

    // Check the deductions table for employer housing levy
    const deductions = db.prepare(`
      SELECT deduction_name, amount FROM payroll_deduction
      WHERE payroll_id = (SELECT id FROM payroll WHERE period_id = ? LIMIT 1)
      ORDER BY deduction_name
    `).all(result.periodId) as Array<{ deduction_name: string; amount: number }>

    const employerHL = deductions.find(d => d.deduction_name === 'Employer Housing Levy')
    const employeeHL = deductions.find(d => d.deduction_name === 'Housing Levy')

    expect(employerHL).toBeDefined()
    expect(employeeHL).toBeDefined()
    // Employer match equals employee contribution
    expect(employerHL!.amount).toBe(employeeHL!.amount)

    // For 20,000 KSh, Housing Levy = 20,000 * 0.015 = 300 KSh = 30,000 cents
    expect(employeeHL!.amount).toBe(30000)
  })
})
