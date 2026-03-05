/**
 * Tests for BudgetEnforcementService.
 *
 * The service initialises `this.db = getDatabase()` with no constructor
 * injection, so we mock `../../database` to return our in-memory DB.
 */
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applySchema, seedTestUser } from '../../__tests__/helpers/schema'

/* ── Database mock (must be before import) ────────────────────────── */
let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db,
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn(),
}))

vi.mock('../../../utils/money', () => ({
  centsToShillings: (v: number) => v / 100,
}))

import type { BudgetEnforcementService as BESType } from '../BudgetEnforcementService'

let BudgetEnforcementService: typeof BESType

const TABLES = [
  'user', 'audit_log', 'gl_account', 'journal_entry', 'journal_entry_line',
  'accounting_period', 'budget_allocation',
] as const

/* ── Helpers ──────────────────────────────────────────────────────── */
function seedAccounts(d: Database.Database): void {
  const accts = [
    ['5010', 'Salary Academic',   'EXPENSE', 'DEBIT'],
    ['5030', 'NSSF Employer',     'EXPENSE', 'DEBIT'],
    ['6100', 'Supplies',          'EXPENSE', 'DEBIT'],
    ['1020', 'Bank',              'ASSET',   'DEBIT'],
  ] as const

  const stmt = d.prepare(
    `INSERT INTO gl_account (account_code, account_name, account_type, normal_balance, is_active)
     VALUES (?, ?, ?, ?, 1)`,
  )
  for (const [code, name, type, normal] of accts) {
    stmt.run(code, name, type, normal)
  }
}

function postExpense(
  d: Database.Database,
  glCode: string,
  amount: number,
  date: string,
  department: string | null = null,
): void {
  const ref = `E-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const result = d.prepare(`
    INSERT INTO journal_entry (entry_ref, entry_date, entry_type, description, department, is_posted, approval_status, created_by_user_id)
    VALUES (?, ?, 'EXPENSE', 'Test expense', ?, 1, 'APPROVED', 1)
  `).run(ref, date, department)
  const entryId = result.lastInsertRowid as number

  const acct = d.prepare('SELECT id FROM gl_account WHERE account_code = ?').get(glCode) as { id: number }
  const bank = d.prepare("SELECT id FROM gl_account WHERE account_code = '1020'").get() as { id: number }

  d.prepare(`INSERT INTO journal_entry_line (journal_entry_id, line_number, gl_account_id, debit_amount, credit_amount) VALUES (?, 1, ?, ?, 0)`).run(entryId, acct.id, amount)
  d.prepare(`INSERT INTO journal_entry_line (journal_entry_id, line_number, gl_account_id, debit_amount, credit_amount) VALUES (?, 2, ?, 0, ?)`).run(entryId, bank.id, amount)
}

/* ── Setup ────────────────────────────────────────────────────────── */
let svc: BESType

beforeEach(async () => {
  db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  applySchema(db, [...TABLES])
  seedTestUser(db)
  seedAccounts(db)

  // Seed accounting period for fiscal year 2025
  db.prepare(`
    INSERT INTO accounting_period (period_name, start_date, end_date, status)
    VALUES ('FY 2025', '2025-01-01', '2025-12-31', 'OPEN')
  `).run()

  // Dynamic import AFTER mock is set up so getDatabase() returns our in-memory DB
  vi.resetModules()
  const mod = await import('../BudgetEnforcementService')
  BudgetEnforcementService = mod.BudgetEnforcementService
  svc = new BudgetEnforcementService()
})

afterEach(() => { db.close() })

/* ==================================================================
 *  setBudgetAllocation
 * ================================================================== */
describe('setBudgetAllocation', () => {
  it('creates a new budget allocation', async () => {
    const result = await svc.setBudgetAllocation('5010', 2025, 10_000_000, null, 1)
    expect(result.success).toBe(true)
    expect(result.message).toContain('created')
    expect(result.allocationId).toBeGreaterThan(0)
  })

  it('updates an existing allocation', async () => {
    await svc.setBudgetAllocation('5010', 2025, 10_000_000, null, 1)
    const result = await svc.setBudgetAllocation('5010', 2025, 15_000_000, null, 1)
    expect(result.success).toBe(true)
    expect(result.message).toContain('updated')
  })

  it('separates by department', async () => {
    const r1 = await svc.setBudgetAllocation('5010', 2025, 8_000_000, 'ADMIN', 1)
    const r2 = await svc.setBudgetAllocation('5010', 2025, 6_000_000, 'ACADEMIC', 1)
    expect(r1.allocationId).not.toBe(r2.allocationId)
  })
})

/* ==================================================================
 *  validateTransaction
 * ================================================================== */
describe('validateTransaction', () => {
  it('allows when no budget allocation set', async () => {
    const result = await svc.validateTransaction('5010', 10000, 2025)
    expect(result.is_allowed).toBe(true)
    expect(result.message).toContain('No budget allocation')
  })

  it('allows a transaction within budget', async () => {
    await svc.setBudgetAllocation('5010', 2025, 10_000_000, null, 1)
    const result = await svc.validateTransaction('5010', 2_000_000, 2025)
    expect(result.is_allowed).toBe(true)
    expect(result.budget_status?.after_transaction.spent).toBe(2_000_000)
  })

  it('blocks a transaction that would exceed budget', async () => {
    await svc.setBudgetAllocation('5010', 2025, 5_000_000, null, 1)
    postExpense(db, '5010', 4_500_000, '2025-06-01')

    const result = await svc.validateTransaction('5010', 1_000_000, 2025)
    expect(result.is_allowed).toBe(false)
    expect(result.message).toContain('exceed budget')
  })

  it('warns at 80% utilization threshold', async () => {
    await svc.setBudgetAllocation('5010', 2025, 10_000_000, null, 1)
    // Spend 75% first
    postExpense(db, '5010', 7_500_000, '2025-06-01')

    // Adding 8% should push over 80%
    const result = await svc.validateTransaction('5010', 800_000, 2025)
    expect(result.is_allowed).toBe(true)
    expect(result.message).toContain('Notice')
    expect(result.message).toContain('utilization')
  })

  it('warns at 90% utilization threshold', async () => {
    await svc.setBudgetAllocation('5010', 2025, 10_000_000, null, 1)
    // Spend 85% first
    postExpense(db, '5010', 8_500_000, '2025-06-01')

    // Adding 6% should push over 90%
    const result = await svc.validateTransaction('5010', 600_000, 2025)
    expect(result.is_allowed).toBe(true)
    expect(result.message).toContain('Warning')
  })

  it('filters by department', async () => {
    await svc.setBudgetAllocation('5010', 2025, 5_000_000, 'ADMIN', 1)
    postExpense(db, '5010', 4_000_000, '2025-06-01', 'ADMIN')

    // Would exceed ADMIN budget
    const adminResult = await svc.validateTransaction('5010', 2_000_000, 2025, 'ADMIN')
    expect(adminResult.is_allowed).toBe(false)

    // No allocation for ACADEMIC — allowed
    const academicResult = await svc.validateTransaction('5010', 2_000_000, 2025, 'ACADEMIC')
    expect(academicResult.is_allowed).toBe(true)
  })

  it('returns budget status in result', async () => {
    await svc.setBudgetAllocation('5010', 2025, 10_000_000, null, 1)
    postExpense(db, '5010', 3_000_000, '2025-06-01')

    const result = await svc.validateTransaction('5010', 2_000_000, 2025)
    expect(result.budget_status).toBeDefined()
    expect(result.budget_status?.allocated).toBe(10_000_000)
    expect(result.budget_status?.spent).toBe(3_000_000)
    expect(result.budget_status?.remaining).toBe(7_000_000)
    expect(result.budget_status?.after_transaction.spent).toBe(5_000_000)
  })
})

/* ==================================================================
 *  getBudgetAllocations
 * ================================================================== */
describe('getBudgetAllocations', () => {
  it('returns all allocations for a fiscal year', async () => {
    await svc.setBudgetAllocation('5010', 2025, 10_000_000, null, 1)
    await svc.setBudgetAllocation('6100', 2025, 2_000_000, null, 1)

    const allocations = await svc.getBudgetAllocations(2025)
    expect(allocations).toHaveLength(2)
  })

  it('includes spent and remaining amounts', async () => {
    await svc.setBudgetAllocation('5010', 2025, 10_000_000, null, 1)
    postExpense(db, '5010', 3_000_000, '2025-06-01')

    const allocs = await svc.getBudgetAllocations(2025)
    expect(allocs[0].spent_amount).toBe(3_000_000)
    expect(allocs[0].remaining_amount).toBe(7_000_000)
    expect(allocs[0].utilization_percentage).toBe(30)
  })

  it('returns empty for non-existent fiscal year', async () => {
    const allocations = await svc.getBudgetAllocations(2030)
    expect(allocations).toHaveLength(0)
  })
})

/* ==================================================================
 *  generateBudgetVarianceReport
 * ================================================================== */
describe('generateBudgetVarianceReport', () => {
  it('generates variance items with correct status', async () => {
    await svc.setBudgetAllocation('5010', 2025, 10_000_000, null, 1)
    postExpense(db, '5010', 3_000_000, '2025-06-01')

    const report = await svc.generateBudgetVarianceReport(2025)
    expect(report.fiscal_year).toBe(2025)
    expect(report.items).toHaveLength(1)
    expect(report.items[0].status).toBe('UNDER_BUDGET')
    expect(report.items[0].variance).toBe(7_000_000)
  })

  it('marks OVER_BUDGET when spent exceeds allocation', async () => {
    await svc.setBudgetAllocation('5010', 2025, 5_000_000, null, 1)
    postExpense(db, '5010', 6_000_000, '2025-06-01')

    const report = await svc.generateBudgetVarianceReport(2025)
    expect(report.items[0].status).toBe('OVER_BUDGET')
    expect(report.items[0].variance).toBe(-1_000_000)
  })

  it('marks ON_BUDGET when utilization ≥95%', async () => {
    await svc.setBudgetAllocation('5010', 2025, 10_000_000, null, 1)
    postExpense(db, '5010', 9_600_000, '2025-06-01')

    const report = await svc.generateBudgetVarianceReport(2025)
    expect(report.items[0].status).toBe('ON_BUDGET')
  })

  it('summarizes total allocated/spent/remaining', async () => {
    await svc.setBudgetAllocation('5010', 2025, 10_000_000, null, 1)
    await svc.setBudgetAllocation('6100', 2025, 5_000_000, null, 1)
    postExpense(db, '5010', 3_000_000, '2025-06-01')
    postExpense(db, '6100', 1_000_000, '2025-06-01')

    const report = await svc.generateBudgetVarianceReport(2025)
    expect(report.summary.total_allocated).toBe(15_000_000)
    expect(report.summary.total_spent).toBe(4_000_000)
    expect(report.summary.total_remaining).toBe(11_000_000)
  })
})

/* ==================================================================
 *  getBudgetAlerts
 * ================================================================== */
describe('getBudgetAlerts', () => {
  it('returns alerts for accounts above threshold', async () => {
    await svc.setBudgetAllocation('5010', 2025, 10_000_000, null, 1)
    await svc.setBudgetAllocation('6100', 2025, 5_000_000, null, 1)
    postExpense(db, '5010', 8_500_000, '2025-06-01') // 85%
    postExpense(db, '6100', 1_000_000, '2025-06-01') // 20%

    const alerts = await svc.getBudgetAlerts(2025)
    expect(alerts).toHaveLength(1) // Only 5010 at 85%
    expect(alerts[0].alert_type).toBe('WARNING')
  })

  it('classifies CRITICAL for ≥90%', async () => {
    await svc.setBudgetAllocation('5010', 2025, 10_000_000, null, 1)
    postExpense(db, '5010', 9_200_000, '2025-06-01')

    const alerts = await svc.getBudgetAlerts(2025)
    expect(alerts[0].alert_type).toBe('CRITICAL')
  })

  it('classifies EXCEEDED for ≥100%', async () => {
    await svc.setBudgetAllocation('5010', 2025, 5_000_000, null, 1)
    postExpense(db, '5010', 5_500_000, '2025-06-01')

    const alerts = await svc.getBudgetAlerts(2025)
    expect(alerts[0].alert_type).toBe('EXCEEDED')
  })

  it('uses custom threshold', async () => {
    await svc.setBudgetAllocation('5010', 2025, 10_000_000, null, 1)
    postExpense(db, '5010', 5_500_000, '2025-06-01') // 55% — below 80, above 50

    const defaultAlerts = await svc.getBudgetAlerts(2025) // 80 default
    expect(defaultAlerts).toHaveLength(0)

    const customAlerts = await svc.getBudgetAlerts(2025, 50)
    expect(customAlerts).toHaveLength(1)
  })

  it('sorts by utilization descending', async () => {
    await svc.setBudgetAllocation('5010', 2025, 10_000_000, null, 1)
    await svc.setBudgetAllocation('6100', 2025, 5_000_000, null, 1)
    postExpense(db, '5010', 8_200_000, '2025-06-01') // 82%
    postExpense(db, '6100', 4_500_000, '2025-06-01') // 90%

    const alerts = await svc.getBudgetAlerts(2025)
    expect(alerts).toHaveLength(2)
    expect(alerts[0].utilization_percentage).toBeGreaterThan(alerts[1].utilization_percentage)
  })
})

/* ==================================================================
 *  deactivateBudgetAllocation
 * ================================================================== */
describe('deactivateBudgetAllocation', () => {
  it('deactivates an allocation', async () => {
    const { allocationId } = await svc.setBudgetAllocation('5010', 2025, 10_000_000, null, 1)
    await svc.deactivateBudgetAllocation(allocationId!, 1)

    // Deactivated allocation should not appear in getBudgetAllocations
    // (getBudgetAllocations queries all, but validateTransaction only sees active)
    const result = await svc.validateTransaction('5010', 10000, 2025)
    expect(result.is_allowed).toBe(true)
    expect(result.message).toContain('No budget allocation')
  })
})

/* ==================================================================
 *  Division-by-zero guard (allocatedAmount === 0)
 * ================================================================== */
describe('zero-allocation budget (division-by-zero guard)', () => {
  it('reports 0% utilization for zero allocation with no spending', async () => {
    await svc.setBudgetAllocation('5010', 2025, 0, null, 1)

    const result = await svc.validateTransaction('5010', 0, 2025)
    expect(result.budget_status).toBeDefined()
    expect(result.budget_status?.utilization_percentage).toBe(0)
    expect(Number.isNaN(result.budget_status?.utilization_percentage)).toBe(false)
  })

  it('reports 100% utilization for zero allocation with spending > 0', async () => {
    await svc.setBudgetAllocation('5010', 2025, 0, null, 1)

    const result = await svc.validateTransaction('5010', 500, 2025)
    expect(result.budget_status).toBeDefined()
    expect(result.budget_status?.after_transaction.utilization_percentage).toBe(100)
    expect(Number.isFinite(result.budget_status?.after_transaction.utilization_percentage)).toBe(true)
  })

  it('blocks transaction against a zero-allocation budget', async () => {
    await svc.setBudgetAllocation('5010', 2025, 0, null, 1)

    const result = await svc.validateTransaction('5010', 1000, 2025)
    expect(result.is_allowed).toBe(false)
  })
})

/* ==================================================================
 *  setBudgetAllocation – error branch (getErrorMessage)
 * ================================================================== */
describe('setBudgetAllocation – error handling', () => {
  it('returns failure message when DB operation throws', async () => {
    // Close db to trigger an error
    db.close()
    const result = await svc.setBudgetAllocation('BADCODE', 2025, 100, null, 1)
    expect(result.success).toBe(false)
    expect(result.message).toContain('Failed to set budget allocation')
  })
})

/* ==================================================================
 *  getBudgetAllocations – error branch
 * ================================================================== */
describe('getBudgetAllocations – error handling', () => {
  it('returns empty array when DB query throws', async () => {
    db.close()
    const result = await svc.getBudgetAllocations(2025)
    expect(result).toEqual([])
  })
})

/* ==================================================================
 *  validateTransaction – error branch (fail closed)
 * ================================================================== */
describe('validateTransaction – error branch', () => {
  it('blocks transaction and returns error when validation throws', async () => {
    await svc.setBudgetAllocation('5010', 2025, 10_000_000, null, 1)
    db.close()
    const result = await svc.validateTransaction('5010', 1000, 2025)
    expect(result.is_allowed).toBe(false)
    expect(result.message).toContain('Budget validation failed')
  })
})

/* ==================================================================
 *  calculateSpentAmount – department NULL path
 * ================================================================== */
describe('calculateSpentAmount – department null filtering', () => {
  it('correctly filters spending when department is null', async () => {
    await svc.setBudgetAllocation('5010', 2025, 10_000_000, null, 1)
    postExpense(db, '5010', 2_000_000, '2025-06-01', null)

    const result = await svc.validateTransaction('5010', 1_000_000, 2025, null)
    expect(result.budget_status?.spent).toBe(2_000_000)
  })
})

/* ==================================================================
 *  generateBudgetVarianceReport – zero allocated amount
 * ================================================================== */
describe('generateBudgetVarianceReport – edge cases', () => {
  it('handles zero allocated_amount for variance_percentage', async () => {
    await svc.setBudgetAllocation('5010', 2025, 0, null, 1)

    const report = await svc.generateBudgetVarianceReport(2025)
    expect(report.items.length).toBe(1)
    expect(report.items[0].variance_percentage).toBe(0)
    expect(Number.isFinite(report.items[0].variance_percentage)).toBe(true)
  })

  it('handles no accounting_period matching fiscal year (falls back to Jan-Dec)', async () => {
    // Remove seeded accounting_period
    db.exec('DELETE FROM accounting_period')
    await svc.setBudgetAllocation('5010', 2025, 10_000_000, null, 1)
    postExpense(db, '5010', 3_000_000, '2025-06-01')

    const report = await svc.generateBudgetVarianceReport(2025)
    expect(report.items[0].spent).toBe(3_000_000)
  })

  it('allocations with department populate department in variance items', async () => {
    await svc.setBudgetAllocation('5010', 2025, 5_000_000, 'ADMIN', 1)
    postExpense(db, '5010', 2_000_000, '2025-06-01', 'ADMIN')

    const report = await svc.generateBudgetVarianceReport(2025)
    expect(report.items[0].department).toBe('ADMIN')
  })

  /* ==================================================================
   *  Branch coverage: getErrorMessage with non-Error (L6)
   * ================================================================== */
  it('validateTransaction catches and returns error message from non-Error throw', async () => {
    // Drop budget_allocation to force an error in validateTransaction
    db.exec('ALTER TABLE budget_allocation RENAME TO budget_allocation_bak')
    const result = await svc.validateTransaction('5010', 1000, 2025)
    expect(result.is_allowed).toBe(false) // fail closed on error
    expect(result.message).toContain('Budget validation failed')
    db.exec('ALTER TABLE budget_allocation_bak RENAME TO budget_allocation')
  })

  /* ==================================================================
   *  Branch coverage: buildBudgetStatus – allocatedAmount=0 with spent>0 (L112)
   * ================================================================== */
  it('buildBudgetStatus shows 100% utilization when allocated=0 but spent>0', async () => {
    // Set budget to 0 and post an expense
    await svc.setBudgetAllocation('5010', 2025, 0, null, 1)
    postExpense(db, '5010', 1000, '2025-06-01')
    const result = await svc.validateTransaction('5010', 500, 2025)
    expect(result.budget_status).toBeDefined()
    if (result.budget_status) {
      expect(result.budget_status.utilization_percentage).toBe(100)
    }
  })

  /* ==================================================================
   *  Branch coverage: getBudgetAlerts – WARNING/CRITICAL/EXCEEDED (L428-445)
   * ================================================================== */
  it('getBudgetAlerts returns WARNING for 80-89% utilization', async () => {
    await svc.setBudgetAllocation('5010', 2025, 10_000_000, null, 1)
    postExpense(db, '5010', 8_500_000, '2025-06-01')
    const alerts = await svc.getBudgetAlerts(2025, 80)
    expect(alerts.length).toBeGreaterThanOrEqual(1)
    expect(alerts[0].alert_type).toBe('WARNING')
  })

  it('getBudgetAlerts returns CRITICAL for 90-99% utilization', async () => {
    await svc.setBudgetAllocation('5010', 2025, 10_000_000, null, 1)
    postExpense(db, '5010', 9_500_000, '2025-06-01')
    const alerts = await svc.getBudgetAlerts(2025, 80)
    const criticalAlerts = alerts.filter(a => a.alert_type === 'CRITICAL')
    expect(criticalAlerts.length).toBeGreaterThanOrEqual(1)
  })

  it('getBudgetAlerts returns EXCEEDED for 100%+ utilization', async () => {
    await svc.setBudgetAllocation('5010', 2025, 10_000_000, null, 1)
    postExpense(db, '5010', 11_000_000, '2025-06-01')
    const alerts = await svc.getBudgetAlerts(2025, 80)
    const exceeded = alerts.filter(a => a.alert_type === 'EXCEEDED')
    expect(exceeded.length).toBeGreaterThanOrEqual(1)
  })

  /* ==================================================================
   *  Branch coverage: variance report status: ON_BUDGET (L384), OVER_BUDGET (L370)
   * ================================================================== */
  it('variance report shows OVER_BUDGET when spent > allocated', async () => {
    await svc.setBudgetAllocation('5010', 2025, 5_000_000, null, 1)
    postExpense(db, '5010', 6_000_000, '2025-06-01')
    const report = await svc.generateBudgetVarianceReport(2025)
    expect(report.items[0].status).toBe('OVER_BUDGET')
  })

  it('variance report shows ON_BUDGET when utilization >= 95%', async () => {
    await svc.setBudgetAllocation('5010', 2025, 10_000_000, null, 1)
    postExpense(db, '5010', 9_600_000, '2025-06-01')
    const report = await svc.generateBudgetVarianceReport(2025)
    expect(report.items[0].status).toBe('ON_BUDGET')
  })

  /* ==================================================================
   *  Branch coverage: deactivateBudgetAllocation
   * ================================================================== */
  it('deactivateBudgetAllocation sets is_active to 0', async () => {
    await svc.setBudgetAllocation('5010', 2025, 5_000_000, null, 1)
    const alloc = db.prepare("SELECT id FROM budget_allocation WHERE gl_account_code = '5010'").get() as any
    await svc.deactivateBudgetAllocation(alloc.id, 1)
    const updated = db.prepare('SELECT is_active FROM budget_allocation WHERE id = ?').get(alloc.id) as any
    expect(updated.is_active).toBe(0)
  })

  /* ==================================================================
   *  Branch coverage: getErrorMessage – String(error) for non-Error (L6)
   * ================================================================== */
  it('getErrorMessage returns String(error) when a non-Error is thrown', async () => {
    const origPrepare = db.prepare.bind(db)
    ;(db as any).prepare = (sql: string) => {
      if (sql.includes('budget_allocation')) {
        throw 'non-error string value' // NOSONAR
      }
      return origPrepare(sql)
    }
    const result = await svc.validateTransaction('5010', 1000, 2025)
    expect(result.is_allowed).toBe(false)
    expect(result.message).toContain('non-error string value')
    ;(db as any).prepare = origPrepare
  })

  /* ==================================================================
   *  Branch coverage: variance report with zero spending (L370, L384, etc.)
   *  Covers || 0 fallback branches for spent_amount, utilization_percentage
   * ================================================================== */
  it('variance report handles allocation with zero spending', async () => {
    await svc.setBudgetAllocation('5010', 2025, 10_000_000, null, 1)
    // No expenses posted — spent_amount will be 0
    const report = await svc.generateBudgetVarianceReport(2025)
    expect(report.items.length).toBe(1)
    expect(report.items[0].spent).toBe(0)
    expect(report.items[0].status).toBe('UNDER_BUDGET')
  })

  /* ==================================================================
   *  Branch coverage: getBudgetAlerts with 0 utilization (L428-L445)
   *  threshold=0 includes allocations with 0% utilization, covering || 0
   * ================================================================== */
  it('getBudgetAlerts with threshold 0 includes zero-utilization allocations', async () => {
    await svc.setBudgetAllocation('5010', 2025, 10_000_000, null, 1)
    // No expenses → 0% utilization
    const alerts = await svc.getBudgetAlerts(2025, 0)
    expect(alerts.length).toBeGreaterThanOrEqual(1)
    expect(alerts[0].alert_type).toBe('WARNING')
    expect(alerts[0].spent).toBe(0)
    expect(alerts[0].utilization_percentage).toBe(0)
  })

  /* ==================================================================
   *  Branch coverage: variance report with NaN utilization (L370:30)
   *  Direct insert of allocation with allocated_amount=0
   * ================================================================== */
  it('variance report handles allocation with zero allocated amount (NaN guard)', async () => {
    // Bypass validation by inserting directly
    db.prepare(`INSERT INTO budget_allocation (gl_account_code, fiscal_year, allocated_amount, is_active) VALUES ('5010', 2025, 0, 1)`).run()
    const report = await svc.generateBudgetVarianceReport(2025)
    expect(report.items.length).toBe(1)
    expect(report.items[0].variance_percentage).toBe(0) // Falls back to 0 when allocated=0
    expect(Number.isFinite(report.summary.overall_utilization_percentage)).toBe(false) // NaN or Infinity from 0/0
  })

  // ── Branch: setBudgetAllocation getErrorMessage String(error) for non-Error ──
  it('setBudgetAllocation returns String(error) for non-Error throw', async () => {
    const origPrepare = db.prepare.bind(db)
    ;(db as any).prepare = (sql: string) => {
      if (sql.includes('SELECT id FROM budget_allocation')) {
        throw 42 // NOSONAR
      }
      return origPrepare(sql)
    }
    const result = await svc.setBudgetAllocation('5010', 2025, 1000, null, 1)
    expect(result.success).toBe(false)
    expect(result.message).toContain('42')
    ;(db as any).prepare = origPrepare
  })

  // ── Branch: getBudgetAllocations with department-bearing allocation ──
  it('getBudgetAllocations includes department when allocation has department set', async () => {
    await svc.setBudgetAllocation('5010', 2025, 10_000_000, 'ADMIN', 1)
    const allocs = await svc.getBudgetAllocations(2025)
    expect(allocs).toHaveLength(1)
    expect(allocs[0].department).toBe('ADMIN')
  })

  // ── Branch: generateBudgetVarianceReport with no allocations (NaN overall_utilization) ──
  it('generateBudgetVarianceReport handles empty allocations (NaN overall utilization)', async () => {
    const report = await svc.generateBudgetVarianceReport(2025)
    expect(report.items).toHaveLength(0)
    expect(report.summary.total_allocated).toBe(0)
    expect(report.summary.total_spent).toBe(0)
    expect(Number.isNaN(report.summary.overall_utilization_percentage)).toBe(true)
  })

  // ── Branch: getBudgetAlerts with department-bearing allocation ──
  it('getBudgetAlerts includes department in alert when allocation has department', async () => {
    await svc.setBudgetAllocation('5010', 2025, 10_000_000, 'ADMIN', 1)
    postExpense(db, '5010', 9_500_000, '2025-06-01', 'ADMIN')
    const alerts = await svc.getBudgetAlerts(2025, 80)
    expect(alerts.length).toBeGreaterThanOrEqual(1)
    expect(alerts[0].department).toBe('ADMIN')
    expect(alerts[0].alert_type).toBe('CRITICAL')
  })

  // ── Branch: validateTransaction – already above 90% before this txn (no 90% warning) ──
  it('validateTransaction returns within-budget when utilization already above 90%', async () => {
    await svc.setBudgetAllocation('5010', 2025, 10_000_000, null, 1)
    // Spend 92% so utilization is already >= 90
    postExpense(db, '5010', 9_200_000, '2025-06-01')
    // Add a small amount that keeps us under 100% but already above 90%
    const result = await svc.validateTransaction('5010', 200_000, 2025)
    expect(result.is_allowed).toBe(true)
    // Should NOT contain the 90% warning since we were already above 90
    expect(result.message).toBe('Transaction is within budget.')
  })

  // ── Branch: validateTransaction – already above 80% before this txn (no 80% notice) ──
  it('validateTransaction returns within-budget when utilization already above 80%', async () => {
    await svc.setBudgetAllocation('5010', 2025, 10_000_000, null, 1)
    // Spend 82% so utilization is already >= 80 but < 90
    postExpense(db, '5010', 8_200_000, '2025-06-01')
    // Add a small amount that keeps under 90
    const result = await svc.validateTransaction('5010', 200_000, 2025)
    expect(result.is_allowed).toBe(true)
    // Should NOT contain the 80% notice since we were already above 80
    expect(result.message).toBe('Transaction is within budget.')
  })
})
