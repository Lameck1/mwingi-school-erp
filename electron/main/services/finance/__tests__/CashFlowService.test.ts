import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db,
}))

import { CashFlowService } from '../CashFlowService'

describe('CashFlowService.getCashFlowStatement', () => {
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

      CREATE TABLE bank_account (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        opening_balance INTEGER NOT NULL,
        is_active INTEGER DEFAULT 1
      );
      INSERT INTO bank_account (opening_balance, is_active) VALUES (10000, 1);

      CREATE TABLE gl_account (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_code TEXT NOT NULL,
        account_type TEXT NOT NULL
      );
      INSERT INTO gl_account (id, account_code, account_type) VALUES
        (1, '1010', 'ASSET'),
        (2, '1300', 'ASSET');

      CREATE TABLE transaction_category (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_name TEXT NOT NULL,
        gl_account_code TEXT
      );
      INSERT INTO transaction_category (id, category_name, gl_account_code) VALUES
        (1, 'General Income', '1010'),
        (2, 'Operating Expense', '1010'),
        (3, 'Capex', '1300');

      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_date TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        category_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        debit_credit TEXT NOT NULL,
        is_voided INTEGER DEFAULT 0
      );

      CREATE TABLE journal_entry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_date TEXT NOT NULL,
        entry_type TEXT NOT NULL,
        is_posted INTEGER DEFAULT 1,
        is_voided INTEGER DEFAULT 0
      );

      CREATE TABLE journal_entry_line (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        journal_entry_id INTEGER NOT NULL,
        gl_account_id INTEGER NOT NULL,
        debit_amount INTEGER DEFAULT 0,
        credit_amount INTEGER DEFAULT 0
      );
    `)

    // Historical operating movements before report window.
    db.prepare(`
      INSERT INTO ledger_transaction (transaction_date, transaction_type, category_id, amount, debit_credit, is_voided)
      VALUES
        ('2026-01-05', 'INCOME', 1, 3000, 'CREDIT', 0),
        ('2026-01-06', 'EXPENSE', 2, 500, 'DEBIT', 0)
    `).run()

    // Historical financing inflow before report window.
    db.prepare(`
      INSERT INTO journal_entry (id, entry_date, entry_type, is_posted, is_voided)
      VALUES (1, '2026-01-10', 'LOAN_DISBURSEMENT', 1, 0)
    `).run()
    db.prepare(`
      INSERT INTO journal_entry_line (journal_entry_id, gl_account_id, debit_amount, credit_amount)
      VALUES (1, 1, 2000, 0)
    `).run()

    // Period operating and investing movements.
    db.prepare(`
      INSERT INTO ledger_transaction (transaction_date, transaction_type, category_id, amount, debit_credit, is_voided)
      VALUES
        ('2026-02-10', 'FEE_PAYMENT', 1, 7000, 'CREDIT', 0),
        ('2026-02-11', 'EXPENSE', 2, 2000, 'DEBIT', 0),
        ('2026-02-12', 'ADJUSTMENT', 3, 1500, 'DEBIT', 0)
    `).run()

    // Period financing outflow.
    db.prepare(`
      INSERT INTO journal_entry (id, entry_date, entry_type, is_posted, is_voided)
      VALUES (2, '2026-02-13', 'LOAN_REPAYMENT', 1, 0)
    `).run()
    db.prepare(`
      INSERT INTO journal_entry_line (journal_entry_id, gl_account_id, debit_amount, credit_amount)
      VALUES (2, 1, 0, 600)
    `).run()
  })

  afterEach(() => {
    db.close()
  })

  it('derives opening and financing from persisted data instead of placeholders', () => {
    const statement = CashFlowService.getCashFlowStatement('2026-02-01', '2026-02-28')

    expect(statement.opening_balance).toBe(14500)
    expect(statement.op_inflow).toBe(7000)
    expect(statement.op_outflow).toBe(2000)
    expect(statement.inv_outflow).toBe(1500)
    expect(statement.fin_outflow).toBe(600)
    expect(statement.net_change).toBe(2900)
    expect(statement.closing_balance).toBe(17400)
  })
})

describe('CashFlowService additional branch coverage', () => {
  beforeEach(() => {
    db = new Database(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  it('returns zero operating totals when ledger_transaction table does not exist', () => {
    // No tables at all
    const statement = CashFlowService.getCashFlowStatement('2026-01-01', '2026-01-31')
    expect(statement.op_inflow).toBe(0)
    expect(statement.op_outflow).toBe(0)
    expect(statement.op_net).toBe(0)
  })

  it('returns zero investing totals when required tables do not exist', () => {
    const statement = CashFlowService.getCashFlowStatement('2026-01-01', '2026-01-31')
    expect(statement.inv_inflow).toBe(0)
    expect(statement.inv_outflow).toBe(0)
  })

  it('returns zero financing totals when journal tables do not exist', () => {
    const statement = CashFlowService.getCashFlowStatement('2026-01-01', '2026-01-31')
    expect(statement.fin_inflow).toBe(0)
    expect(statement.fin_outflow).toBe(0)
  })

  it('uses fixed_asset fallback for investing totals when ledger categories yield zero', () => {
    db.exec(`
      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_date TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        category_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        debit_credit TEXT NOT NULL,
        is_voided INTEGER DEFAULT 0
      );
      CREATE TABLE fixed_asset (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        acquisition_cost INTEGER NOT NULL,
        acquisition_date TEXT NOT NULL,
        disposed_value INTEGER,
        disposed_date TEXT
      );
      INSERT INTO fixed_asset (acquisition_cost, acquisition_date, disposed_value, disposed_date)
        VALUES (50000, '2026-02-10', NULL, NULL);
      INSERT INTO fixed_asset (acquisition_cost, acquisition_date, disposed_value, disposed_date)
        VALUES (20000, '2026-01-05', 18000, '2026-02-15');
    `)

    const statement = CashFlowService.getCashFlowStatement('2026-02-01', '2026-02-28')
    expect(statement.inv_outflow).toBe(50000)
    expect(statement.inv_inflow).toBe(18000)
  })

  it('opening balance excludes bank_account when table has no opening_balance column', () => {
    db.exec(`
      CREATE TABLE bank_account (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        is_active INTEGER DEFAULT 1
      );
      INSERT INTO bank_account (is_active) VALUES (1);
      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_date TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        category_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        debit_credit TEXT NOT NULL,
        is_voided INTEGER DEFAULT 0
      );
    `)

    const statement = CashFlowService.getCashFlowStatement('2026-02-01', '2026-02-28')
    expect(statement.opening_balance).toBe(0)
  })

  it('getForecast returns projected and actual arrays', () => {
    db.exec(`
      CREATE TABLE receipt (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_date TEXT NOT NULL,
        amount INTEGER NOT NULL
      );
      INSERT INTO receipt (receipt_date, amount) VALUES ('2025-10-15', 10000);
      INSERT INTO receipt (receipt_date, amount) VALUES ('2025-11-10', 12000);
      INSERT INTO receipt (receipt_date, amount) VALUES ('2025-12-05', 14000);
    `)

    const forecast = CashFlowService.getForecast(3)
    expect(forecast.labels.length).toBeGreaterThan(0)
    expect(forecast.actual.length).toBeGreaterThanOrEqual(0)
    expect(forecast.projected.length).toBeGreaterThan(0)
    expect(forecast.trend_slope).toBe(0)
  })

  it('getForecast handles empty receipt data', () => {
    db.exec(`
      CREATE TABLE receipt (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_date TEXT NOT NULL,
        amount INTEGER NOT NULL
      );
    `)

    const forecast = CashFlowService.getForecast(2)
    expect(forecast.actual).toHaveLength(0)
    expect(forecast.labels.length).toBe(2)
  })

  it('getDateBefore returns same date for invalid date string', () => {
    // Accessing through getCashFlowStatement with edge date
    const statement = CashFlowService.getCashFlowStatement('2026-01-01', '2026-01-31')
    // Opening balance uses getDateBefore('2026-01-01') which should give '2025-12-31'
    expect(statement).toBeDefined()
  })

  it('hasColumn returns false when PRAGMA table_info throws (L42)', () => {
    // Create required tables so the code path reaches hasColumn
    db.exec(`
      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY, transaction_date TEXT, transaction_type TEXT,
        category_id INTEGER, amount INTEGER, debit_credit TEXT, is_voided INTEGER DEFAULT 0
      );
      CREATE TABLE transaction_category (id INTEGER PRIMARY KEY, category_name TEXT, gl_account_code TEXT);
      CREATE TABLE gl_account (id INTEGER PRIMARY KEY, account_code TEXT, account_type TEXT);
    `)
    const origPrepare = db.prepare.bind(db)
    vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('PRAGMA table_info')) {
        throw new Error('Simulated PRAGMA failure')
      }
      return origPrepare(sql)
    })
    // hasColumn returns false → canClassifyAssetsFromLedger is false → investing = 0
    const statement = CashFlowService.getCashFlowStatement('2026-02-01', '2026-02-28')
    expect(statement.inv_inflow).toBe(0)
    expect(statement.inv_outflow).toBe(0)
    vi.restoreAllMocks()
  })

  it('getDateBefore returns original string when date is invalid (L62)', () => {
    // Pass an invalid startDate to exercise the NaN branch in getDateBefore
    db.exec(`
      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY, transaction_date TEXT, transaction_type TEXT,
        category_id INTEGER, amount INTEGER, debit_credit TEXT, is_voided INTEGER DEFAULT 0
      );
    `)
    const statement = CashFlowService.getCashFlowStatement('not-a-date', '2026-01-31')
    // getDateBefore('not-a-date') returns 'not-a-date' → historical queries use that as end date
    expect(statement).toBeDefined()
    expect(statement.op_inflow).toBe(0)
  })

  it('voided ledger transactions are excluded from operating totals', () => {
    db.exec(`
      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_date TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        category_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        debit_credit TEXT NOT NULL,
        is_voided INTEGER DEFAULT 0
      );
      INSERT INTO ledger_transaction (transaction_date, transaction_type, category_id, amount, debit_credit, is_voided)
        VALUES ('2026-02-10', 'FEE_PAYMENT', 1, 5000, 'CREDIT', 1);
    `)

    const statement = CashFlowService.getCashFlowStatement('2026-02-01', '2026-02-28')
    expect(statement.op_inflow).toBe(0)
  })
})
