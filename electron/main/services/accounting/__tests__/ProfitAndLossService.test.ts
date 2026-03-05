/**
 * Tests for ProfitAndLossService.
 *
 * Uses in-memory SQLite. The service takes an optional `db` constructor param.
 */
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applySchema, seedTestUser } from '../../__tests__/helpers/schema'

vi.mock('../../../database', () => ({ getDatabase: () => { throw new Error('Use constructor injection') } }))

import type { ProfitAndLossService as PnLServiceType } from '../ProfitAndLossService'

let ProfitAndLossService: typeof PnLServiceType

const TABLES = ['user', 'audit_log', 'gl_account', 'journal_entry', 'journal_entry_line'] as const

/* ── Helpers ──────────────────────────────────────────────────────── */
function seedAccounts(db: Database.Database): void {
  const accounts = [
    ['1020', 'Bank',              'ASSET',   'DEBIT'],
    ['1100', 'Accounts Receivable','ASSET',  'DEBIT'],
    ['4010', 'Tuition Revenue',   'REVENUE', 'CREDIT'],
    ['4020', 'Boarding Revenue',  'REVENUE', 'CREDIT'],
    ['4200', 'Donations',         'REVENUE', 'CREDIT'],
    ['5010', 'Salary Academic',   'EXPENSE', 'DEBIT'],
    ['5030', 'NSSF Employer',     'EXPENSE', 'DEBIT'],
    ['5600', 'Depreciation',      'EXPENSE', 'DEBIT'],
    ['6100', 'Supplies',          'EXPENSE', 'DEBIT'],
  ] as const

  const stmt = db.prepare(
    `INSERT INTO gl_account (account_code, account_name, account_type, normal_balance, is_active)
     VALUES (?, ?, ?, ?, 1)`,
  )
  for (const [code, name, type, normal] of accounts) {
    stmt.run(code, name, type, normal)
  }
}

/** Post a balanced journal entry (debit + credit). */
function postEntry(
  db: Database.Database,
  debitCode: string,
  creditCode: string,
  amount: number,
  date: string,
  entryType = 'FEE_PAYMENT',
): void {
  const ref = `T-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const header = db.prepare(`
    INSERT INTO journal_entry (entry_ref, entry_date, entry_type, description, is_posted, approval_status, created_by_user_id)
    VALUES (?, ?, ?, 'Test', 1, 'APPROVED', 1)
  `).run(ref, date, entryType)
  const entryId = header.lastInsertRowid as number

  const debitAcct = db.prepare('SELECT id FROM gl_account WHERE account_code = ?').get(debitCode) as { id: number }
  const creditAcct = db.prepare('SELECT id FROM gl_account WHERE account_code = ?').get(creditCode) as { id: number }

  db.prepare(`INSERT INTO journal_entry_line (journal_entry_id, line_number, gl_account_id, debit_amount, credit_amount) VALUES (?, 1, ?, ?, 0)`).run(entryId, debitAcct.id, amount)
  db.prepare(`INSERT INTO journal_entry_line (journal_entry_id, line_number, gl_account_id, debit_amount, credit_amount) VALUES (?, 2, ?, 0, ?)`).run(entryId, creditAcct.id, amount)
}

/* ── Setup ────────────────────────────────────────────────────────── */
let db: Database.Database
let svc: PnLServiceType

beforeEach(async () => {
  db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  applySchema(db, [...TABLES])
  seedTestUser(db)
  seedAccounts(db)

  const mod = await import('../ProfitAndLossService')
  ProfitAndLossService = mod.ProfitAndLossService
  svc = new ProfitAndLossService(db)
})

afterEach(() => { db.close() })

/* ==================================================================
 *  generateProfitAndLoss
 * ================================================================== */
describe('generateProfitAndLoss', () => {
  it('returns zero totals for empty ledger', async () => {
    const pl = await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    expect(pl.total_revenue).toBe(0)
    expect(pl.total_expenses).toBe(0)
    expect(pl.net_profit).toBe(0)
    expect(pl.revenue).toHaveLength(0)
    expect(pl.expenses).toHaveLength(0)
  })

  it('calculates revenue totals', async () => {
    postEntry(db, '1020', '4010', 10000, '2025-06-01')
    postEntry(db, '1020', '4020', 5000, '2025-06-15')

    const pl = await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    expect(pl.total_revenue).toBe(15000)
    expect(pl.revenue).toHaveLength(2)
  })

  it('calculates expense totals', async () => {
    postEntry(db, '5010', '1020', 8000, '2025-06-01', 'EXPENSE')

    const pl = await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    expect(pl.total_expenses).toBe(8000)
  })

  it('correctly computes net profit (revenue - expenses)', async () => {
    postEntry(db, '1020', '4010', 20000, '2025-06-01')
    postEntry(db, '5010', '1020', 12000, '2025-06-01', 'EXPENSE')

    const pl = await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    expect(pl.net_profit).toBe(8000) // 20000 - 12000
  })

  it('filters by date range', async () => {
    postEntry(db, '1020', '4010', 10000, '2025-03-01')
    postEntry(db, '1020', '4010', 5000, '2025-09-01')

    const pl = await svc.generateProfitAndLoss('2025-01-01', '2025-06-30')
    expect(pl.total_revenue).toBe(10000) // Only March entry
  })

  it('excludes voided entries', async () => {
    postEntry(db, '1020', '4010', 10000, '2025-06-01')
    // Mark as voided
    db.prepare('UPDATE journal_entry SET is_voided = 1').run()

    const pl = await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    expect(pl.total_revenue).toBe(0)
  })

  it('excludes unposted entries', async () => {
    postEntry(db, '1020', '4010', 10000, '2025-06-01')
    db.prepare('UPDATE journal_entry SET is_posted = 0').run()

    const pl = await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    expect(pl.total_revenue).toBe(0)
  })

  it('categorizes revenue by account code prefix', async () => {
    postEntry(db, '1020', '4010', 10000, '2025-06-01') // Tuition (401x)
    postEntry(db, '1020', '4200', 3000, '2025-06-01')  // Donations (42x)

    const pl = await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    expect(pl.revenue_by_category.find((c) => c.category === 'Tuition Fees')?.amount).toBe(10000)
    expect(pl.revenue_by_category.find((c) => c.category === 'Donations')?.amount).toBe(3000)
  })

  it('categorizes expenses by account code prefix', async () => {
    postEntry(db, '5010', '1020', 7000, '2025-06-01', 'EXPENSE') // Salary (501x)
    postEntry(db, '5600', '1020', 2000, '2025-06-01', 'EXPENSE') // Depreciation (5600)

    const pl = await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    expect(pl.expenses_by_category.find((c) => c.category === 'Salaries & Wages')?.amount).toBe(7000)
    expect(pl.expenses_by_category.find((c) => c.category === 'Depreciation')?.amount).toBe(2000)
  })

  it('calculates category percentages', async () => {
    postEntry(db, '1020', '4010', 8000, '2025-06-01')
    postEntry(db, '1020', '4200', 2000, '2025-06-01')

    const pl = await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    const tuition = pl.revenue_by_category.find((c) => c.category === 'Tuition Fees')
    expect(tuition?.percentage).toBe(80) // 8000/10000*100
  })

  it('includes period dates in response', async () => {
    const pl = await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    expect(pl.period_start).toBe('2025-01-01')
    expect(pl.period_end).toBe('2025-12-31')
  })
})

/* ==================================================================
 *  generateComparativeProfitAndLoss
 * ================================================================== */
describe('generateComparativeProfitAndLoss', () => {
  it('compares two periods', async () => {
    postEntry(db, '1020', '4010', 10000, '2024-06-01')
    postEntry(db, '5010', '1020', 4000, '2024-06-01', 'EXPENSE')
    postEntry(db, '1020', '4010', 15000, '2025-06-01')
    postEntry(db, '5010', '1020', 5000, '2025-06-01', 'EXPENSE')

    const result = await svc.generateComparativeProfitAndLoss(
      '2025-01-01', '2025-12-31',
      '2024-01-01', '2024-12-31',
    )

    expect(result.current.total_revenue).toBe(15000)
    expect(result.prior.total_revenue).toBe(10000)
    expect(result.variance.revenue_variance).toBe(5000)
    expect(result.variance.revenue_variance_percent).toBe(50)
  })

  it('handles zero prior period gracefully', async () => {
    postEntry(db, '1020', '4010', 10000, '2025-06-01')

    const result = await svc.generateComparativeProfitAndLoss(
      '2025-01-01', '2025-12-31',
      '2024-01-01', '2024-12-31',
    )

    expect(result.prior.total_revenue).toBe(0)
    expect(result.variance.revenue_variance_percent).toBe(0)
    expect(result.variance.net_profit_variance_percent).toBe(0)
  })
})

/* ==================================================================
 *  getRevenueBreakdown & getExpenseBreakdown
 * ================================================================== */
describe('breakdowns', () => {
  it('getRevenueBreakdown returns categorized revenue', async () => {
    postEntry(db, '1020', '4010', 5000, '2025-06-01')

    const breakdown = await svc.getRevenueBreakdown('2025-01-01', '2025-12-31')
    expect(breakdown.length).toBeGreaterThan(0)
    expect(breakdown[0].category).toBe('Tuition Fees')
  })

  it('getExpenseBreakdown returns categorized expenses', async () => {
    postEntry(db, '5010', '1020', 5000, '2025-06-01', 'EXPENSE')

    const breakdown = await svc.getExpenseBreakdown('2025-01-01', '2025-12-31')
    expect(breakdown.length).toBeGreaterThan(0)
    expect(breakdown[0].category).toBe('Salaries & Wages')
  })
})

/* ==================================================================
 *  Revenue categorization: all prefix branches
 * ================================================================== */
describe('revenue categorization branches', () => {
  beforeEach(() => {
    // Add additional revenue GL accounts for uncovered prefixes
    const stmt = db.prepare(
      `INSERT INTO gl_account (account_code, account_name, account_type, normal_balance, is_active)
       VALUES (?, ?, 'REVENUE', 'CREDIT', 1)`,
    )
    stmt.run('4030', 'Transport Revenue')
    stmt.run('4040', 'Activity Revenue')
    stmt.run('4050', 'Exam Revenue')
    stmt.run('4100', 'Government Grant')
    stmt.run('4999', 'Misc Revenue')
  })

  it('categorizes Transport (403x), Activity (404x), Exam (405x) revenue', async () => {
    postEntry(db, '1020', '4030', 3000, '2025-06-01')
    postEntry(db, '1020', '4040', 2000, '2025-06-01')
    postEntry(db, '1020', '4050', 1000, '2025-06-01')

    const pl = await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    expect(pl.revenue_by_category.find(c => c.category === 'Transport Fees')?.amount).toBe(3000)
    expect(pl.revenue_by_category.find(c => c.category === 'Activity Fees')?.amount).toBe(2000)
    expect(pl.revenue_by_category.find(c => c.category === 'Exam Fees')?.amount).toBe(1000)
  })

  it('categorizes Government Grants (41x) revenue', async () => {
    postEntry(db, '1020', '4100', 7000, '2025-06-01')

    const pl = await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    expect(pl.revenue_by_category.find(c => c.category === 'Government Grants')?.amount).toBe(7000)
  })

  it('categorizes Other Income for unrecognized revenue codes', async () => {
    postEntry(db, '1020', '4999', 500, '2025-06-01')

    const pl = await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    expect(pl.revenue_by_category.find(c => c.category === 'Other Income')?.amount).toBe(500)
  })
})

/* ==================================================================
 *  Expense categorization: all prefix branches
 * ================================================================== */
describe('expense categorization branches', () => {
  beforeEach(() => {
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance, is_active)
       VALUES (?, ?, 'EXPENSE', 'DEBIT', 1)`,
    )
    stmt.run('5030', 'Statutory NSSF')
    stmt.run('5040', 'Statutory NHIF')
    stmt.run('5050', 'Statutory PAYE')
    stmt.run('5100', 'Food Expenses')
    stmt.run('5200', 'Transport Expenses')
    stmt.run('5300', 'Water Bill')
    stmt.run('5400', 'Office Supplies')
    stmt.run('5500', 'Repairs & Maint')
    stmt.run('5999', 'Other Misc')
  })

  it('categorizes Statutory (503-505), Food (510), Transport (520), Utilities (53x), Supplies (54x), Repairs (5500)', async () => {
    postEntry(db, '5030', '1020', 1000, '2025-06-01', 'EXPENSE')
    postEntry(db, '5100', '1020', 2000, '2025-06-01', 'EXPENSE')
    postEntry(db, '5200', '1020', 1500, '2025-06-01', 'EXPENSE')
    postEntry(db, '5300', '1020', 800, '2025-06-01', 'EXPENSE')
    postEntry(db, '5400', '1020', 600, '2025-06-01', 'EXPENSE')
    postEntry(db, '5500', '1020', 400, '2025-06-01', 'EXPENSE')

    const pl = await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    expect(pl.expenses_by_category.find(c => c.category === 'Statutory Deductions')?.amount).toBe(1000)
    expect(pl.expenses_by_category.find(c => c.category === 'Food & Catering')?.amount).toBe(2000)
    expect(pl.expenses_by_category.find(c => c.category === 'Transport')?.amount).toBe(1500)
    expect(pl.expenses_by_category.find(c => c.category === 'Utilities')?.amount).toBe(800)
    expect(pl.expenses_by_category.find(c => c.category === 'Supplies')?.amount).toBe(600)
    expect(pl.expenses_by_category.find(c => c.category === 'Repairs & Maintenance')?.amount).toBe(400)
  })

  it('categorizes Other Expenses for unrecognized expense codes', async () => {
    postEntry(db, '5999', '1020', 300, '2025-06-01', 'EXPENSE')

    const pl = await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    expect(pl.expenses_by_category.find(c => c.category === 'Other Expenses')?.amount).toBe(300)
  })
})

/* ==================================================================
 *  Comparative: non-zero prior net_profit variance
 * ================================================================== */
describe('comparative variance with non-zero prior', () => {
  it('calculates net_profit_variance_percent when prior net_profit is non-zero', async () => {
    postEntry(db, '1020', '4010', 10000, '2024-06-01')
    postEntry(db, '5010', '1020', 4000, '2024-06-01', 'EXPENSE')
    // Prior net_profit = 6000
    postEntry(db, '1020', '4010', 15000, '2025-06-01')
    postEntry(db, '5010', '1020', 3000, '2025-06-01', 'EXPENSE')
    // Current net_profit = 12000

    const result = await svc.generateComparativeProfitAndLoss(
      '2025-01-01', '2025-12-31',
      '2024-01-01', '2024-12-31',
    )

    expect(result.variance.net_profit_variance).toBe(6000)
    // (6000 / 6000) * 100 = 100%
    expect(result.variance.net_profit_variance_percent).toBe(100)
  })

  it('calculates expense_variance_percent when prior expenses are non-zero', async () => {
    postEntry(db, '5010', '1020', 4000, '2024-06-01', 'EXPENSE')
    postEntry(db, '5010', '1020', 6000, '2025-06-01', 'EXPENSE')

    const result = await svc.generateComparativeProfitAndLoss(
      '2025-01-01', '2025-12-31',
      '2024-01-01', '2024-12-31',
    )

    expect(result.variance.expense_variance).toBe(2000)
    expect(result.variance.expense_variance_percent).toBe(50)
  })
})

/* ==================================================================
 *  Branch coverage: Boarding revenue (402x) prefix categorization
 * ================================================================== */
describe('revenue categorization – Boarding prefix 402', () => {
  it('categorizes 402x accounts as Boarding Fees', async () => {
    postEntry(db, '1020', '4020', 7500, '2025-06-01')

    const pl = await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    const boarding = pl.revenue_by_category.find(c => c.category === 'Boarding Fees')
    expect(boarding).toBeDefined()
    expect(boarding!.amount).toBe(7500)
  })
})

/* ==================================================================
 *  Branch coverage: zero totalRevenue → percentage = 0
 * ================================================================== */
describe('percentage guard when totalRevenue is zero', () => {
  it('returns percentage 0 for revenue categories when total is zero', async () => {
    // Only expenses, no revenue → totalRevenue = 0
    postEntry(db, '5010', '1020', 3000, '2025-06-01', 'EXPENSE')

    const pl = await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    expect(pl.total_revenue).toBe(0)
    // No revenue categories should exist
    for (const cat of pl.revenue_by_category) {
      expect(cat.percentage).toBe(0)
    }
  })

  it('returns percentage 0 for expense categories when total is zero', async () => {
    // Only revenue, no expenses → totalExpenses = 0
    postEntry(db, '1020', '4010', 5000, '2025-06-01')

    const pl = await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    expect(pl.total_expenses).toBe(0)
    for (const cat of pl.expenses_by_category) {
      expect(cat.percentage).toBe(0)
    }
  })
})

/* ==================================================================
 *  Branch coverage: Revenue categorization for remaining prefixes
 * ================================================================== */
describe('revenue categorization – remaining prefixes', () => {
  it('categorizes 403x accounts as Transport Fees', async () => {
    db.exec(`INSERT INTO gl_account (account_code, account_name, account_type, normal_balance, is_active) VALUES ('4030', 'Transport Revenue', 'REVENUE', 'CREDIT', 1)`)
    postEntry(db, '1020', '4030', 3000, '2025-06-01')

    const pl = await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    const transport = pl.revenue_by_category.find(c => c.category === 'Transport Fees')
    expect(transport).toBeDefined()
    expect(transport!.amount).toBe(3000)
  })

  it('categorizes 404x accounts as Activity Fees', async () => {
    db.exec(`INSERT INTO gl_account (account_code, account_name, account_type, normal_balance, is_active) VALUES ('4040', 'Activity Revenue', 'REVENUE', 'CREDIT', 1)`)
    postEntry(db, '1020', '4040', 2000, '2025-06-01')

    const pl = await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    const activity = pl.revenue_by_category.find(c => c.category === 'Activity Fees')
    expect(activity).toBeDefined()
    expect(activity!.amount).toBe(2000)
  })

  it('categorizes 405x accounts as Exam Fees', async () => {
    db.exec(`INSERT INTO gl_account (account_code, account_name, account_type, normal_balance, is_active) VALUES ('4050', 'Exam Revenue', 'REVENUE', 'CREDIT', 1)`)
    postEntry(db, '1020', '4050', 1500, '2025-06-01')

    const pl = await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    const exam = pl.revenue_by_category.find(c => c.category === 'Exam Fees')
    expect(exam).toBeDefined()
    expect(exam!.amount).toBe(1500)
  })

  it('categorizes 41x accounts as Government Grants', async () => {
    db.exec(`INSERT INTO gl_account (account_code, account_name, account_type, normal_balance, is_active) VALUES ('4100', 'Govt Grant', 'REVENUE', 'CREDIT', 1)`)
    postEntry(db, '1020', '4100', 5000, '2025-06-01')

    const pl = await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    const grants = pl.revenue_by_category.find(c => c.category === 'Government Grants')
    expect(grants).toBeDefined()
    expect(grants!.amount).toBe(5000)
  })

  it('categorizes unrecognized accounts as Other Income', async () => {
    db.exec(`INSERT INTO gl_account (account_code, account_name, account_type, normal_balance, is_active) VALUES ('4900', 'Misc Income', 'REVENUE', 'CREDIT', 1)`)
    postEntry(db, '1020', '4900', 800, '2025-06-01')

    const pl = await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    const other = pl.revenue_by_category.find(c => c.category === 'Other Income')
    expect(other).toBeDefined()
    expect(other!.amount).toBe(800)
  })
})

/* ==================================================================
 *  Branch coverage: Expense categorization for remaining prefixes
 * ================================================================== */
describe('expense categorization – remaining prefixes', () => {
  it('categorizes 503/504/505 as Statutory Deductions', async () => {
    db.exec(`INSERT INTO gl_account (account_code, account_name, account_type, normal_balance, is_active) VALUES ('5040', 'NHIF Expense', 'EXPENSE', 'DEBIT', 1)`)
    postEntry(db, '5040', '1020', 1000, '2025-06-01', 'EXPENSE')

    const pl = await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    const stat = pl.expenses_by_category.find(c => c.category === 'Statutory Deductions')
    expect(stat).toBeDefined()
  })

  it('categorizes 510 as Food & Catering', async () => {
    db.exec(`INSERT INTO gl_account (account_code, account_name, account_type, normal_balance, is_active) VALUES ('5100', 'Food Expense', 'EXPENSE', 'DEBIT', 1)`)
    postEntry(db, '5100', '1020', 2000, '2025-06-01', 'EXPENSE')

    const pl = await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    const food = pl.expenses_by_category.find(c => c.category === 'Food & Catering')
    expect(food).toBeDefined()
    expect(food!.amount).toBe(2000)
  })

  it('categorizes 520/5210 as Transport', async () => {
    db.exec(`INSERT INTO gl_account (account_code, account_name, account_type, normal_balance, is_active) VALUES ('5200', 'Transport Expense', 'EXPENSE', 'DEBIT', 1)`)
    postEntry(db, '5200', '1020', 1500, '2025-06-01', 'EXPENSE')

    const pl = await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    const transport = pl.expenses_by_category.find(c => c.category === 'Transport')
    expect(transport).toBeDefined()
  })

  it('categorizes 53x as Utilities', async () => {
    db.exec(`INSERT INTO gl_account (account_code, account_name, account_type, normal_balance, is_active) VALUES ('5300', 'Electricity', 'EXPENSE', 'DEBIT', 1)`)
    postEntry(db, '5300', '1020', 800, '2025-06-01', 'EXPENSE')

    const pl = await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    const utilities = pl.expenses_by_category.find(c => c.category === 'Utilities')
    expect(utilities).toBeDefined()
  })

  it('categorizes 54x as Supplies', async () => {
    postEntry(db, '6100', '1020', 600, '2025-06-01', 'EXPENSE')

    await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    // 6100 = 'Supplies' account in seeds → won't match any prefix → Other Expenses
    // But we need 54x → let's create one
    db.exec(`INSERT INTO gl_account (account_code, account_name, account_type, normal_balance, is_active) VALUES ('5400', 'Lab Supplies', 'EXPENSE', 'DEBIT', 1)`)
    postEntry(db, '5400', '1020', 400, '2025-07-01', 'EXPENSE')

    const pl2 = await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    const supplies = pl2.expenses_by_category.find(c => c.category === 'Supplies')
    expect(supplies).toBeDefined()
  })

  it('categorizes 5500 as Repairs & Maintenance', async () => {
    db.exec(`INSERT INTO gl_account (account_code, account_name, account_type, normal_balance, is_active) VALUES ('5500', 'Repairs', 'EXPENSE', 'DEBIT', 1)`)
    postEntry(db, '5500', '1020', 900, '2025-06-01', 'EXPENSE')

    const pl = await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    const repairs = pl.expenses_by_category.find(c => c.category === 'Repairs & Maintenance')
    expect(repairs).toBeDefined()
  })

  it('categorizes 5600 as Depreciation', async () => {
    postEntry(db, '5600', '1020', 1200, '2025-06-01', 'EXPENSE')

    const pl = await svc.generateProfitAndLoss('2025-01-01', '2025-12-31')
    const depreciation = pl.expenses_by_category.find(c => c.category === 'Depreciation')
    expect(depreciation).toBeDefined()
    expect(depreciation!.amount).toBe(1200)
  })
})
