/**
 * Tests for BoardingCostService
 *
 * Targets branch coverage for journal entry failure path in recordBoardingExpense
 * (catch block at lines 243-244).
 */
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db,
}))

const journalMock = {
  createJournalEntrySync: vi.fn().mockReturnValue({ success: true, entryId: 1 }),
}

vi.mock('../../accounting/DoubleEntryJournalService', () => ({
  DoubleEntryJournalService: class {
    createJournalEntrySync = journalMock.createJournalEntrySync
  },
}))

import BoardingCostService from '../BoardingCostService'

function createSchema(targetDb: Database.Database): void {
  targetDb.exec(`
    CREATE TABLE academic_year (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year_name TEXT NOT NULL,
      is_current INTEGER DEFAULT 0
    );
    CREATE TABLE term (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      academic_year_id INTEGER NOT NULL,
      term_number INTEGER NOT NULL,
      is_current INTEGER DEFAULT 0
    );
    CREATE TABLE user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL DEFAULT 'h',
      full_name TEXT NOT NULL,
      role TEXT NOT NULL,
      is_active INTEGER DEFAULT 1
    );
    CREATE TABLE gl_account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_code TEXT NOT NULL UNIQUE,
      account_name TEXT NOT NULL,
      account_type TEXT NOT NULL,
      normal_balance TEXT NOT NULL,
      is_active INTEGER DEFAULT 1
    );
    CREATE TABLE boarding_facility (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 0,
      current_occupancy INTEGER NOT NULL DEFAULT 0,
      matron_id INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE boarding_expense (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      facility_id INTEGER NOT NULL,
      gl_account_code TEXT NOT NULL,
      fiscal_year INTEGER NOT NULL,
      term INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      expense_type TEXT NOT NULL,
      description TEXT,
      recorded_date DATETIME,
      recorded_by INTEGER NOT NULL
    );
    CREATE TABLE fee_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_name TEXT NOT NULL
    );
    CREATE TABLE fee_invoice (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER,
      term_id INTEGER,
      invoice_date TEXT,
      due_date TEXT,
      created_at TEXT
    );
    CREATE TABLE invoice_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      fee_category_id INTEGER NOT NULL,
      amount INTEGER NOT NULL DEFAULT 0
    );
  `)
}

function seedDefaults(targetDb: Database.Database): void {
  targetDb.exec(`
    INSERT INTO academic_year (id, year_name, is_current) VALUES (1, '2026', 1);
    INSERT INTO term (id, academic_year_id, term_number, is_current) VALUES (1, 1, 1, 1);
    INSERT INTO user (id, username, full_name, role) VALUES (1, 'admin', 'Admin User', 'ADMIN');
    INSERT INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('6000', 'Boarding Expense', 'EXPENSE', 'DEBIT');
    INSERT INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1010', 'Cash', 'ASSET', 'DEBIT');
    INSERT INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1020', 'Bank', 'ASSET', 'DEBIT');
    INSERT INTO boarding_facility (id, name, capacity, current_occupancy, is_active) VALUES (1, 'Boys Hostel', 100, 80, 1);
  `)
}

describe('BoardingCostService', () => {
  let service: BoardingCostService

  const validParams = {
    facility_id: 1,
    gl_account_code: '6000',
    fiscal_year: 2026,
    term: 1 as 1 | 2 | 3,
    amount_cents: 500000,
    expense_type: 'FOOD' as const,
    description: 'Monthly food supplies',
    recorded_by: 1,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    db = new Database(':memory:')
    createSchema(db)
    seedDefaults(db)
    service = new BoardingCostService()
  })

  afterEach(() => {
    db.close()
  })

  describe('recordBoardingExpense', () => {

    it('records expense and creates journal entry successfully', () => {
      const id = service.recordBoardingExpense(validParams)
      expect(id).toBeGreaterThan(0)
      expect(journalMock.createJournalEntrySync).toHaveBeenCalledTimes(1)
    })

    it('uses CASH as credit account when payment_method is not BANK', () => {
      service.recordBoardingExpense({ ...validParams, payment_method: 'CASH' })
      const call = journalMock.createJournalEntrySync.mock.calls[0][0]
      expect(call.lines[1].gl_account_code).toBe('1010') // SystemAccounts.CASH
    })

    it('uses BANK as credit account when payment_method is BANK', () => {
      service.recordBoardingExpense({ ...validParams, payment_method: 'BANK' })
      const call = journalMock.createJournalEntrySync.mock.calls[0][0]
      expect(call.lines[1].gl_account_code).toBe('1020') // SystemAccounts.BANK
    })

    // ── Branch coverage: journal entry creation failure (lines 243-244) ──
    it('throws when journal entry creation fails', () => {
      journalMock.createJournalEntrySync.mockImplementationOnce(() => {
        throw new Error('Journal creation failed: GL accounts not balanced')
      })

      expect(() => service.recordBoardingExpense(validParams)).toThrow('Journal creation failed: GL accounts not balanced')

      // Verify the expense was still inserted (INSERT happens before the journal try block)
      const expenses = db.prepare('SELECT * FROM boarding_expense WHERE facility_id = 1').all()
      expect(expenses.length).toBe(1)
    })

    // ── Validation branches ──
    it('rejects invalid facility_id', () => {
      expect(() => service.recordBoardingExpense({ ...validParams, facility_id: 0 }))
        .toThrow('Valid boarding facility is required')
    })

    it('rejects invalid fiscal year', () => {
      expect(() => service.recordBoardingExpense({ ...validParams, fiscal_year: 1999 }))
        .toThrow('Invalid fiscal year')
    })

    it('rejects invalid term', () => {
      expect(() => service.recordBoardingExpense({ ...validParams, term: 4 as any }))
        .toThrow('Invalid academic term')
    })

    it('rejects non-integer amount', () => {
      expect(() => service.recordBoardingExpense({ ...validParams, amount_cents: 0 }))
        .toThrow('Expense amount must be greater than zero')
    })

    it('rejects invalid recorded_by', () => {
      expect(() => service.recordBoardingExpense({ ...validParams, recorded_by: 0 }))
        .toThrow('Recorded by user is required')
    })

    it('rejects inactive facility', () => {
      db.prepare('UPDATE boarding_facility SET is_active = 0 WHERE id = 1').run()
      expect(() => service.recordBoardingExpense(validParams))
        .toThrow('Selected boarding facility is invalid or inactive')
    })
  })

  // ── branch coverage: non-numeric year_name in getCurrentAcademicContext (L82) ──
  it('throws when academic year name is not numeric', () => {
    db.prepare("UPDATE academic_year SET year_name = 'Twenty-six' WHERE id = 1").run()
    expect(() => service.recordBoardingExpense(validParams))
      .toThrow("Active academic year 'Twenty-six' is not numeric")
  })

  // ── branch coverage: assertValidGLAccount empty string (L102) ──
  it('rejects empty gl_account_code', () => {
    expect(() => service.recordBoardingExpense({ ...validParams, gl_account_code: '' }))
      .toThrow('GL account code is required')
  })

  // ── branch coverage: assertValidGLAccount whitespace-only (L102) ──
  it('rejects whitespace-only gl_account_code', () => {
    expect(() => service.recordBoardingExpense({ ...validParams, gl_account_code: '   ' }))
      .toThrow('GL account code is required')
  })

  // ── branch coverage: assertValidGLAccount with non-existent code (L114) ──
  it('rejects non-existent gl_account_code', () => {
    expect(() => service.recordBoardingExpense({ ...validParams, gl_account_code: '9999' }))
      .toThrow('Invalid or inactive GL account code: 9999')
  })

  // ── branch coverage: assertValidRecorder with inactive user (L127) ──
  it('rejects inactive recorded_by user', () => {
    db.prepare('UPDATE user SET is_active = 0 WHERE id = 1').run()
    expect(() => service.recordBoardingExpense(validParams))
      .toThrow('Recorded by user is invalid or inactive')
  })

  // ── branch coverage: assertActiveExpensePeriod mismatch (L91) ──
  it('rejects expense for non-active fiscal year', () => {
    expect(() => service.recordBoardingExpense({ ...validParams, fiscal_year: 2025 }))
      .toThrow('Boarding expenses must be recorded in the active period')
  })

  // ── branch coverage: assertActiveExpensePeriod term mismatch (L91) ──
  it('rejects expense for non-active term', () => {
    expect(() => service.recordBoardingExpense({ ...validParams, term: 2 as 1 | 2 | 3 }))
      .toThrow('Boarding expenses must be recorded in the active period')
  })

  // ── branch coverage: description?.trim() || null (L216) ──
  it('records expense with undefined description', () => {
    const id = service.recordBoardingExpense({ ...validParams, description: undefined as unknown as string })
    expect(id).toBeGreaterThan(0)
    const row = db.prepare('SELECT description FROM boarding_expense WHERE id = ?').get(id) as { description: string | null }
    expect(row.description).toBeNull()
  })

  describe('getFacilityExpenses', () => {
    it('returns expenses filtered by term when provided', () => {
      db.prepare(`INSERT INTO boarding_expense (facility_id, gl_account_code, fiscal_year, term, amount_cents, expense_type, description, recorded_date, recorded_by)
        VALUES (1, '6000', 2026, 1, 100000, 'FOOD', 'Food', datetime('now'), 1)`).run()
      db.prepare(`INSERT INTO boarding_expense (facility_id, gl_account_code, fiscal_year, term, amount_cents, expense_type, description, recorded_date, recorded_by)
        VALUES (1, '6000', 2026, 2, 200000, 'FOOD', 'Food T2', datetime('now'), 1)`).run()

      const all = service.getFacilityExpenses(1, 2026)
      expect(all.length).toBe(2)

      const term1Only = service.getFacilityExpenses(1, 2026, 1)
      expect(term1Only.length).toBe(1)
      expect(term1Only[0].amount_cents).toBe(100000)
    })
  })

  // ── branch coverage: calculateBoardingRevenue with totalOccupancy <= 0 (L355) ──
  describe('calculateFacilityProfitability', () => {
    it('returns zero revenue when all facilities have zero occupancy', () => {
      db.prepare('UPDATE boarding_facility SET current_occupancy = 0 WHERE id = 1').run()
      db.prepare(`INSERT INTO boarding_expense (facility_id, gl_account_code, fiscal_year, term, amount_cents, expense_type, description, recorded_date, recorded_by)
        VALUES (1, '6000', 2026, 1, 100000, 'FOOD', 'Food', datetime('now'), 1)`).run()
      const result = service.calculateFacilityProfitability(1, 2026)
      expect(result.total_revenue_cents).toBe(0)
    })

    it('throws when facility does not exist', () => {
      expect(() => service.calculateFacilityProfitability(999, 2026))
        .toThrow('Boarding facility 999 not found')
    })
  })

  // ── branch coverage: getExpenseSummaryByType with and without term ──
  describe('getExpenseSummaryByType', () => {
    it('returns expense summary grouped by type', () => {
      db.prepare(`INSERT INTO boarding_expense (facility_id, gl_account_code, fiscal_year, term, amount_cents, expense_type, description, recorded_date, recorded_by)
        VALUES (1, '6000', 2026, 1, 100000, 'FOOD', 'Food', datetime('now'), 1)`).run()
      db.prepare(`INSERT INTO boarding_expense (facility_id, gl_account_code, fiscal_year, term, amount_cents, expense_type, description, recorded_date, recorded_by)
        VALUES (1, '6000', 2026, 1, 50000, 'UTILITIES', 'Electric', datetime('now'), 1)`).run()

      const result = service.getExpenseSummaryByType(1, 2026)
      expect(result.length).toBe(2)
      expect(result[0].percentage + result[1].percentage).toBeCloseTo(100)
    })

    it('returns empty with zero percentage for no expenses', () => {
      const result = service.getExpenseSummaryByType(1, 2026)
      expect(result).toEqual([])
    })

    it('filters by term when provided', () => {
      db.prepare(`INSERT INTO boarding_expense (facility_id, gl_account_code, fiscal_year, term, amount_cents, expense_type, description, recorded_date, recorded_by)
        VALUES (1, '6000', 2026, 1, 100000, 'FOOD', 'T1', datetime('now'), 1)`).run()
      db.prepare(`INSERT INTO boarding_expense (facility_id, gl_account_code, fiscal_year, term, amount_cents, expense_type, description, recorded_date, recorded_by)
        VALUES (1, '6000', 2026, 2, 200000, 'FOOD', 'T2', datetime('now'), 1)`).run()
      const result = service.getExpenseSummaryByType(1, 2026, 1)
      expect(result.length).toBe(1)
      expect(result[0].total_amount_cents).toBe(100000)
    })
  })

  // ── branch coverage: generateProfitabilitySummary edge cases ──
  describe('generateProfitabilitySummary', () => {
    it('returns zero margins when no revenue and no expenses', () => {
      const summary = service.generateProfitabilitySummary(2026)
      expect(summary.profit_margin).toBe(0)
      expect(summary.average_cost_per_boarder_cents).toBe(0)
    })
  })
})
