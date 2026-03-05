/**
 * Tests for DoubleEntryJournalService.
 *
 * Uses in-memory SQLite with extended DDL (approval tables, accounting_period).
 * Tests cover: entry creation, payment recording, invoice recording,
 * voiding, trial balance, balance sheet, approval workflows, period‐lock.
 */
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applySchema, seedTestUser } from '../../__tests__/helpers/schema'

/* ── Mocks ────────────────────────────────────────────────────────── */
const mockLogAudit = vi.fn()
vi.mock('../../../database', () => ({ getDatabase: () => { throw new Error('Use constructor injection') } }))
vi.mock('../../../database/utils/audit', () => ({ logAudit: (...args: unknown[]) => mockLogAudit(...args) }))

/* ── Service under test (import AFTER mocks) ─────────────────────── */
import type { DoubleEntryJournalService as DEJSType, JournalEntryData as JEDType } from '../DoubleEntryJournalService'

type DEJS = DEJSType
type JED = JEDType

let DoubleEntryJournalService: typeof DEJSType

const TABLES = [
  'user', 'audit_log', 'gl_account', 'supplier', 'journal_entry', 'journal_entry_line',
  'approval_rule', 'transaction_approval',
  'approval_workflow', 'approval_request', 'approval_history',
  'accounting_period',
] as const

/* ── Seed helpers ─────────────────────────────────────────────────── */
function seedSystemAccounts(db: Database.Database): void {
  const accounts = [
    ['1010', 'Cash',                 'ASSET',     'DEBIT'],
    ['1020', 'Bank',                 'ASSET',     'DEBIT'],
    ['1100', 'Accounts Receivable',  'ASSET',     'DEBIT'],
    ['2010', 'Accounts Payable',     'LIABILITY', 'CREDIT'],
    ['2020', 'Student Credit Balance','LIABILITY','CREDIT'],
    ['4010', 'Tuition Revenue',      'REVENUE',   'CREDIT'],
    ['4200', 'Donations Revenue',    'REVENUE',   'CREDIT'],
    ['5010', 'Salary Expense',       'EXPENSE',   'DEBIT'],
    ['6100', 'Inventory Expense',    'EXPENSE',   'DEBIT'],
  ] as const

  const stmt = db.prepare(
    `INSERT INTO gl_account (account_code, account_name, account_type, normal_balance, is_active, is_system_account)
     VALUES (?, ?, ?, ?, 1, 1)`,
  )
  for (const [code, name, type, normal] of accounts) {
    stmt.run(code, name, type, normal)
  }
}

function makeEntry(overrides?: Partial<JED>): JED {
  return {
    entry_date: '2025-06-01',
    entry_type: 'FEE_PAYMENT',
    description: 'Test entry',
    created_by_user_id: 1,
    lines: [
      { gl_account_code: '1020', debit_amount: 5000, credit_amount: 0, description: 'Debit side' },
      { gl_account_code: '1100', debit_amount: 0, credit_amount: 5000, description: 'Credit side' },
    ],
    ...overrides,
  }
}

/* ── Setup / teardown ─────────────────────────────────────────────── */
let db: Database.Database
let svc: DEJS

beforeEach(async () => {
  db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  applySchema(db, [...TABLES])
  seedTestUser(db)
  seedSystemAccounts(db)
  // Seed suppliers referenced by FK in journal_entry tests
  db.prepare("INSERT INTO supplier (supplier_name) VALUES ('Test Supplier')").run()
  mockLogAudit.mockReset()

  const mod = await import('../DoubleEntryJournalService')
  DoubleEntryJournalService = mod.DoubleEntryJournalService
  svc = new DoubleEntryJournalService(db)
})

afterEach(() => {
  db.close()
  vi.restoreAllMocks()
})

/* ==================================================================
 *  createJournalEntrySync
 * ================================================================== */
describe('createJournalEntrySync', () => {
  it('creates a balanced 2-line entry and posts it', () => {
    const result = svc.createJournalEntrySync(makeEntry())
    expect(result.success).toBe(true)
    expect(result.entry_id).toBeGreaterThan(0)
    expect(result.message).toContain('posted successfully')

    // Verify DB state
    const row = db.prepare('SELECT * FROM journal_entry WHERE id = ?').get(result.entry_id) as Record<string, unknown>
    expect(row.is_posted).toBe(1)
    expect(row.approval_status).toBe('APPROVED')
    expect(row.is_voided).toBe(0)
  })

  it('creates journal entry lines correctly', () => {
    const result = svc.createJournalEntrySync(makeEntry())
    const lines = db.prepare('SELECT * FROM journal_entry_line WHERE journal_entry_id = ? ORDER BY line_number').all(result.entry_id!) as Array<Record<string, unknown>>
    expect(lines).toHaveLength(2)
    expect(lines[0].debit_amount).toBe(5000)
    expect(lines[0].credit_amount).toBe(0)
    expect(lines[1].debit_amount).toBe(0)
    expect(lines[1].credit_amount).toBe(5000)
  })

  it('generates unique entry_ref', () => {
    const r1 = svc.createJournalEntrySync(makeEntry())
    const r2 = svc.createJournalEntrySync(makeEntry())
    const ref1 = (db.prepare('SELECT entry_ref FROM journal_entry WHERE id = ?').get(r1.entry_id!) as { entry_ref: string }).entry_ref
    const ref2 = (db.prepare('SELECT entry_ref FROM journal_entry WHERE id = ?').get(r2.entry_id!) as { entry_ref: string }).entry_ref
    expect(ref1).not.toBe(ref2)
    expect(ref1).toMatch(/^FEE-/)
  })

  it('calls logAudit on create', () => {
    svc.createJournalEntrySync(makeEntry())
    expect(mockLogAudit).toHaveBeenCalledWith(
      1, 'CREATE', 'journal_entry', expect.any(Number), null,
      expect.objectContaining({ entry_type: 'FEE_PAYMENT' }),
    )
  })

  /* ---- Validation failures ---- */

  it('rejects entry with fewer than 2 lines', () => {
    const result = svc.createJournalEntrySync(makeEntry({
      lines: [{ gl_account_code: '1020', debit_amount: 5000, credit_amount: 0 }],
    }))
    expect(result.success).toBe(false)
    expect(result.error).toContain('at least 2 lines')
  })

  it('rejects unbalanced entry', () => {
    const result = svc.createJournalEntrySync(makeEntry({
      lines: [
        { gl_account_code: '1020', debit_amount: 5000, credit_amount: 0 },
        { gl_account_code: '1100', debit_amount: 0, credit_amount: 3000 },
      ],
    }))
    expect(result.success).toBe(false)
    expect(result.error).toContain('Debits')
    expect(result.error).toContain('Credits')
  })

  it('rejects invalid GL account code', () => {
    const result = svc.createJournalEntrySync(makeEntry({
      lines: [
        { gl_account_code: '9999', debit_amount: 5000, credit_amount: 0 },
        { gl_account_code: '1100', debit_amount: 0, credit_amount: 5000 },
      ],
    }))
    expect(result.success).toBe(false)
    expect(result.error).toContain('9999')
  })

  it('rejects entry in closed accounting period', () => {
    db.prepare(
      `INSERT INTO accounting_period (period_name, start_date, end_date, status)
       VALUES ('June 2025', '2025-06-01', '2025-06-30', 'CLOSED')`,
    ).run()

    const result = svc.createJournalEntrySync(makeEntry({ entry_date: '2025-06-15' }))
    expect(result.success).toBe(false)
    expect(result.error).toContain('closed')
  })

  it('allows entry outside closed period', () => {
    db.prepare(
      `INSERT INTO accounting_period (period_name, start_date, end_date, status)
       VALUES ('June 2025', '2025-06-01', '2025-06-30', 'CLOSED')`,
    ).run()

    const result = svc.createJournalEntrySync(makeEntry({ entry_date: '2025-07-15' }))
    expect(result.success).toBe(true)
  })

  /* ---- Approval workflow ---- */

  it('sets PENDING approval when rule matches', () => {
    db.prepare(
      `INSERT INTO approval_rule (rule_name, transaction_type, min_amount, required_approver_role, is_active)
       VALUES ('Large payment', 'FEE_PAYMENT', 1000, 'ADMIN', 1)`,
    ).run()

    const result = svc.createJournalEntrySync(makeEntry())
    expect(result.success).toBe(true)

    const row = db.prepare('SELECT * FROM journal_entry WHERE id = ?').get(result.entry_id!) as Record<string, unknown>
    expect(row.requires_approval).toBe(1)
    expect(row.approval_status).toBe('PENDING')
    expect(row.is_posted).toBe(0)
    expect(result.message).toContain('approval')
  })

  it('posts directly when no approval rule matches', () => {
    db.prepare(
      `INSERT INTO approval_rule (rule_name, transaction_type, min_amount, required_approver_role, is_active)
       VALUES ('Huge only', 'FEE_PAYMENT', 999999, 'ADMIN', 1)`,
    ).run()

    const result = svc.createJournalEntrySync(makeEntry())
    const row = db.prepare('SELECT * FROM journal_entry WHERE id = ?').get(result.entry_id!) as Record<string, unknown>
    expect(row.is_posted).toBe(1)
  })

  it('handles multi-line entries (3+ lines)', () => {
    const result = svc.createJournalEntrySync(makeEntry({
      lines: [
        { gl_account_code: '1020', debit_amount: 3000, credit_amount: 0 },
        { gl_account_code: '1010', debit_amount: 2000, credit_amount: 0 },
        { gl_account_code: '1100', debit_amount: 0, credit_amount: 5000 },
      ],
    }))
    expect(result.success).toBe(true)
    const lines = db.prepare('SELECT COUNT(*) AS c FROM journal_entry_line WHERE journal_entry_id = ?').get(result.entry_id!) as { c: number }
    expect(lines.c).toBe(3)
  })
})

/* ==================================================================
 *  recordPaymentSync
 * ================================================================== */
describe('recordPaymentSync', () => {
  it('records CASH payment: debit Cash (1010), credit AR (1100)', () => {
    const result = svc.recordPaymentSync(10, 5000, 'CASH', 'RCT-001', '2025-06-01', 1)
    expect(result.success).toBe(true)

    const lines = db.prepare(`
      SELECT ga.account_code, jel.debit_amount, jel.credit_amount
      FROM journal_entry_line jel
      JOIN gl_account ga ON jel.gl_account_id = ga.id
      WHERE jel.journal_entry_id = ?
      ORDER BY jel.line_number
    `).all(result.entry_id!) as Array<{ account_code: string; debit_amount: number; credit_amount: number }>

    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ account_code: '1010', debit_amount: 5000, credit_amount: 0 })
    expect(lines[1]).toMatchObject({ account_code: '1100', debit_amount: 0, credit_amount: 5000 })
  })

  it('records BANK_TRANSFER: debit Bank (1020)', () => {
    const result = svc.recordPaymentSync(10, 3000, 'BANK_TRANSFER', 'TXN-01', '2025-06-01', 1)
    expect(result.success).toBe(true)
    const line = db.prepare(`
      SELECT ga.account_code FROM journal_entry_line jel
      JOIN gl_account ga ON jel.gl_account_id = ga.id
      WHERE jel.journal_entry_id = ? AND jel.debit_amount > 0
    `).get(result.entry_id!) as { account_code: string }
    expect(line.account_code).toBe('1020')
  })

  it('records MPESA: debit Bank (1020)', () => {
    const result = svc.recordPaymentSync(10, 1000, 'MPESA', 'MPESA-01', '2025-06-01', 1)
    const line = db.prepare(`
      SELECT ga.account_code FROM journal_entry_line jel
      JOIN gl_account ga ON jel.gl_account_id = ga.id
      WHERE jel.journal_entry_id = ? AND jel.debit_amount > 0
    `).get(result.entry_id!) as { account_code: string }
    expect(line.account_code).toBe('1020')
  })

  it('records CHEQUE: debit Bank (1020)', () => {
    const result = svc.recordPaymentSync(10, 2000, 'CHEQUE', 'CHQ-01', '2025-06-01', 1)
    const line = db.prepare(`
      SELECT ga.account_code FROM journal_entry_line jel
      JOIN gl_account ga ON jel.gl_account_id = ga.id
      WHERE jel.journal_entry_id = ? AND jel.debit_amount > 0
    `).get(result.entry_id!) as { account_code: string }
    expect(line.account_code).toBe('1020')
  })

  it('records CREDIT payment: debit Student Credit Balance (2020)', () => {
    const result = svc.recordPaymentSync(10, 1500, 'CREDIT', 'CR-01', '2025-06-01', 1)
    const line = db.prepare(`
      SELECT ga.account_code FROM journal_entry_line jel
      JOIN gl_account ga ON jel.gl_account_id = ga.id
      WHERE jel.journal_entry_id = ? AND jel.debit_amount > 0
    `).get(result.entry_id!) as { account_code: string }
    expect(line.account_code).toBe('2020')
  })

  it('uses debitAccountOverride when provided', () => {
    const result = svc.recordPaymentSync(10, 5000, 'CASH', 'RCT-002', '2025-06-01', 1, {
      debitAccountOverride: '1020',
    })
    const line = db.prepare(`
      SELECT ga.account_code FROM journal_entry_line jel
      JOIN gl_account ga ON jel.gl_account_id = ga.id
      WHERE jel.journal_entry_id = ? AND jel.debit_amount > 0
    `).get(result.entry_id!) as { account_code: string }
    expect(line.account_code).toBe('1020')
  })

  it('includes sourceLedgerTxnId in audit', () => {
    svc.recordPaymentSync(10, 5000, 'CASH', 'RCT-003', '2025-06-01', 1, {
      sourceLedgerTxnId: 42,
    })
    expect(mockLogAudit).toHaveBeenCalledWith(
      1, 'CREATE', 'journal_entry', expect.any(Number), null,
      expect.objectContaining({ source_ledger_txn_id: 42 }),
    )
  })

  it('async recordPayment delegates to recordPaymentSync', async () => {
    const result = await svc.recordPayment(10, 5000, 'CASH', 'RCT-ASYNC', '2025-06-01', 1)
    expect(result.success).toBe(true)
  })
})

/* ==================================================================
 *  recordInvoiceSync
 * ================================================================== */
describe('recordInvoiceSync', () => {
  it('creates invoice entry: debit AR, credit revenue accounts', () => {
    const items = [
      { gl_account_code: '4010', amount: 8000, description: 'Tuition' },
      { gl_account_code: '4200', amount: 2000, description: 'Donation levy' },
    ]
    const result = svc.recordInvoiceSync(10, items, '2025-06-01', 1)
    expect(result.success).toBe(true)

    const lines = db.prepare(`
      SELECT ga.account_code, jel.debit_amount, jel.credit_amount
      FROM journal_entry_line jel
      JOIN gl_account ga ON jel.gl_account_id = ga.id
      WHERE jel.journal_entry_id = ?
      ORDER BY jel.line_number
    `).all(result.entry_id!) as Array<{ account_code: string; debit_amount: number; credit_amount: number }>

    expect(lines).toHaveLength(3) // 1 debit + 2 credits
    expect(lines[0]).toMatchObject({ account_code: '1100', debit_amount: 10000, credit_amount: 0 })
    expect(lines[1]).toMatchObject({ account_code: '4010', debit_amount: 0, credit_amount: 8000 })
    expect(lines[2]).toMatchObject({ account_code: '4200', debit_amount: 0, credit_amount: 2000 })
  })

  it('async recordInvoice delegates to sync', async () => {
    const items = [{ gl_account_code: '4010', amount: 5000, description: 'Tuition' }]
    const result = await svc.recordInvoice(10, items, '2025-06-01', 1)
    expect(result.success).toBe(true)
  })
})

/* ==================================================================
 *  voidJournalEntrySync
 * ================================================================== */
describe('voidJournalEntrySync', () => {
  it('voids an entry and creates a VOID_REVERSAL entry', () => {
    const created = svc.createJournalEntrySync(makeEntry())
    const entryId = created.entry_id!

    const result = svc.voidJournalEntrySync(entryId, 'Duplicate', 1)
    expect(result.success).toBe(true)
    expect(result.message).toContain('voided')

    // Original marked as voided
    const orig = db.prepare('SELECT is_voided, voided_reason FROM journal_entry WHERE id = ?').get(entryId) as Record<string, unknown>
    expect(orig.is_voided).toBe(1)
    expect(orig.voided_reason).toBe('Duplicate')

    // Reversal entry created
    const reversal = db.prepare("SELECT * FROM journal_entry WHERE entry_type = 'VOID_REVERSAL'").get() as Record<string, unknown>
    expect(reversal).toBeTruthy()
    expect(reversal.is_posted).toBe(1)
  })

  it('reversal entry swaps debit/credit amounts', () => {
    const created = svc.createJournalEntrySync(makeEntry())
    svc.voidJournalEntrySync(created.entry_id!, 'Error', 1)

    const reversalLines = db.prepare(`
      SELECT jel.debit_amount, jel.credit_amount
      FROM journal_entry_line jel
      JOIN journal_entry je ON jel.journal_entry_id = je.id
      WHERE je.entry_type = 'VOID_REVERSAL'
      ORDER BY jel.line_number
    `).all() as Array<{ debit_amount: number; credit_amount: number }>

    // Original: [5000, 0], [0, 5000] → reversal: [0, 5000], [5000, 0]
    expect(reversalLines[0]).toMatchObject({ debit_amount: 0, credit_amount: 5000 })
    expect(reversalLines[1]).toMatchObject({ debit_amount: 5000, credit_amount: 0 })
  })

  it('returns failure for non-existent entry', () => {
    const result = svc.voidJournalEntrySync(999, 'Oops', 1)
    expect(result.success).toBe(false)
    expect(result.message).toContain('not found')
  })

  it('returns failure for already-voided entry', () => {
    const created = svc.createJournalEntrySync(makeEntry())
    svc.voidJournalEntrySync(created.entry_id!, 'First', 1)

    const result = svc.voidJournalEntrySync(created.entry_id!, 'Second', 1)
    expect(result.success).toBe(false)
    expect(result.message).toContain('already voided')
  })

  it('requires approval when rule matches (by amount)', () => {
    db.prepare(
      `INSERT INTO approval_rule (rule_name, transaction_type, min_amount, required_approver_role, is_active)
       VALUES ('Void approval', 'VOID', 1000, 'ADMIN', 1)`,
    ).run()

    const created = svc.createJournalEntrySync(makeEntry())
    const result = svc.voidJournalEntrySync(created.entry_id!, 'Need approval', 1)

    expect(result.success).toBe(true)
    expect(result.requires_approval).toBe(true)
    expect(result.message).toContain('approval')

    // Original NOT voided yet
    const orig = db.prepare('SELECT is_voided FROM journal_entry WHERE id = ?').get(created.entry_id!) as Record<string, unknown>
    expect(orig.is_voided).toBe(0)
  })

  it('logs audit on void', () => {
    const created = svc.createJournalEntrySync(makeEntry())
    mockLogAudit.mockReset()
    svc.voidJournalEntrySync(created.entry_id!, 'Audit test', 1)

    expect(mockLogAudit).toHaveBeenCalledWith(
      1, 'VOID', 'journal_entry', created.entry_id!, null,
      expect.objectContaining({ void_reason: 'Audit test' }),
    )
  })

  it('async voidJournalEntry delegates to sync', async () => {
    const created = svc.createJournalEntrySync(makeEntry())
    const result = await svc.voidJournalEntry(created.entry_id!, 'Async void', 1)
    expect(result.success).toBe(true)
  })
})

/* ==================================================================
 *  getTrialBalance
 * ================================================================== */
describe('getTrialBalance', () => {
  it('returns balanced trial balance', async () => {
    svc.createJournalEntrySync(makeEntry())

    const tb = await svc.getTrialBalance('2025-01-01', '2025-12-31')
    expect(tb.is_balanced).toBe(true)
    expect(tb.total_debits).toBe(tb.total_credits)
    expect(tb.accounts.length).toBeGreaterThan(0)
  })

  it('returns empty trial balance for no transactions', async () => {
    const tb = await svc.getTrialBalance('2025-01-01', '2025-12-31')
    expect(tb.is_balanced).toBe(true)
    expect(tb.total_debits).toBe(0)
    expect(tb.total_credits).toBe(0)
    expect(tb.accounts).toHaveLength(0)
  })

  it('excludes voided entries', async () => {
    const created = svc.createJournalEntrySync(makeEntry())
    svc.voidJournalEntrySync(created.entry_id!, 'void', 1)

    const tb = await svc.getTrialBalance('2025-01-01', '2025-12-31')
    // Both original (voided) entries excluded; only reversal remains
    // Reversal has same debit/credit totals so still balanced
    expect(tb.is_balanced).toBe(true)
  })

  it('filters by date range', async () => {
    svc.createJournalEntrySync(makeEntry({ entry_date: '2025-06-01' }))
    svc.createJournalEntrySync(makeEntry({ entry_date: '2025-08-01' }))

    const tb = await svc.getTrialBalance('2025-06-01', '2025-06-30')
    // Should only include the June entry
    expect(tb.total_debits).toBe(5000)
  })
})

/* ==================================================================
 *  getBalanceSheet
 * ================================================================== */
describe('getBalanceSheet', () => {
  it('returns balance sheet with correct structure', async () => {
    svc.createJournalEntrySync(makeEntry())
    const bs = await svc.getBalanceSheet('2025-12-31')

    expect(bs).toHaveProperty('assets')
    expect(bs).toHaveProperty('liabilities')
    expect(bs).toHaveProperty('equity')
    expect(bs).toHaveProperty('total_assets')
    expect(bs).toHaveProperty('total_liabilities')
    expect(bs).toHaveProperty('total_equity')
    expect(bs).toHaveProperty('net_income')
    expect(bs).toHaveProperty('is_balanced')
  })

  it('correctly categorizes asset accounts', async () => {
    svc.createJournalEntrySync(makeEntry())
    const bs = await svc.getBalanceSheet('2025-12-31')

    // Bank (1020) has debit of 5000, AR (1100) has credit of 5000
    expect(bs.assets.length).toBeGreaterThan(0)
    const bank = bs.assets.find((a) => a.account_code === '1020')
    expect(bank?.balance).toBe(5000)
  })

  it('computes net income from revenue and expenses', async () => {
    // Record revenue: debit Bank, credit Tuition Revenue
    svc.createJournalEntrySync(makeEntry({
      lines: [
        { gl_account_code: '1020', debit_amount: 10000, credit_amount: 0 },
        { gl_account_code: '4010', debit_amount: 0, credit_amount: 10000 },
      ],
    }))
    // Record expense: debit Salary Expense, credit Bank
    svc.createJournalEntrySync(makeEntry({
      entry_type: 'EXPENSE',
      lines: [
        { gl_account_code: '5010', debit_amount: 4000, credit_amount: 0 },
        { gl_account_code: '1020', debit_amount: 0, credit_amount: 4000 },
      ],
    }))

    const bs = await svc.getBalanceSheet('2025-12-31')
    expect(bs.net_income).toBe(6000) // 10000 revenue - 4000 expense
  })

  it('reports balanced when Assets = Liabilities + Equity + NetIncome', async () => {
    svc.createJournalEntrySync(makeEntry({
      lines: [
        { gl_account_code: '1020', debit_amount: 10000, credit_amount: 0 },
        { gl_account_code: '4010', debit_amount: 0, credit_amount: 10000 },
      ],
    }))
    const bs = await svc.getBalanceSheet('2025-12-31')
    expect(bs.is_balanced).toBe(true)
  })

  it('returns zeros for empty ledger', async () => {
    const bs = await svc.getBalanceSheet('2025-12-31')
    expect(bs.total_assets).toBe(0)
    expect(bs.total_liabilities).toBe(0)
    expect(bs.total_equity).toBe(0)
    expect(bs.net_income).toBe(0)
    expect(bs.is_balanced).toBe(true)
  })
})

/* ==================================================================
 *  async wrappers
 * ================================================================== */
describe('async wrappers', () => {
  it('createJournalEntry delegates to sync', async () => {
    const result = await svc.createJournalEntry(makeEntry())
    expect(result.success).toBe(true)
    expect(result.entry_id).toBeGreaterThan(0)
  })
})

/* ==================================================================
 *  Float tolerance (BALANCE_EPSILON = 0.005)
 * ================================================================== */
describe('float tolerance edge cases', () => {
  it('accepts entry whose float-rounding difference is within epsilon (33.33+33.33+33.34 vs 100)', () => {
    const result = svc.createJournalEntrySync(makeEntry({
      lines: [
        { gl_account_code: '1020', debit_amount: 33.33, credit_amount: 0, description: 'Debit 1' },
        { gl_account_code: '1010', debit_amount: 33.33, credit_amount: 0, description: 'Debit 2' },
        { gl_account_code: '1100', debit_amount: 33.34, credit_amount: 0, description: 'Debit 3' },
        { gl_account_code: '4010', debit_amount: 0, credit_amount: 100, description: 'Credit' },
      ],
    }))
    expect(result.success).toBe(true)
  })

  it('accepts entry affected by IEEE-754: 0.1 + 0.2 debit vs 0.3 credit', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in JS — difference ≈ 4e-17, well within epsilon
    const result = svc.createJournalEntrySync(makeEntry({
      lines: [
        { gl_account_code: '1020', debit_amount: 0.1, credit_amount: 0, description: 'Debit 1' },
        { gl_account_code: '1010', debit_amount: 0.2, credit_amount: 0, description: 'Debit 2' },
        { gl_account_code: '1100', debit_amount: 0, credit_amount: 0.3, description: 'Credit' },
      ],
    }))
    expect(result.success).toBe(true)
  })

  it('accepts exactly balanced integer amounts', () => {
    const result = svc.createJournalEntrySync(makeEntry({
      lines: [
        { gl_account_code: '1020', debit_amount: 5000, credit_amount: 0 },
        { gl_account_code: '1100', debit_amount: 0, credit_amount: 5000 },
      ],
    }))
    expect(result.success).toBe(true)
  })

  it('rejects entry with difference clearly exceeding epsilon (5000 vs 4990)', () => {
    const result = svc.createJournalEntrySync(makeEntry({
      lines: [
        { gl_account_code: '1020', debit_amount: 5000, credit_amount: 0 },
        { gl_account_code: '1100', debit_amount: 0, credit_amount: 4990 },
      ],
    }))
    expect(result.success).toBe(false)
    expect(result.error).toContain('Debits')
  })

  it('accepts difference within epsilon (0.004 < 0.005)', () => {
    // Use 0.004 difference which is clearly within epsilon of 0.005
    const result = svc.createJournalEntrySync(makeEntry({
      lines: [
        { gl_account_code: '1020', debit_amount: 5000.004, credit_amount: 0, description: 'Debit' },
        { gl_account_code: '1100', debit_amount: 0, credit_amount: 5000, description: 'Credit' },
      ],
    }))
    expect(result.success).toBe(true)
  })

  it('rejects difference just above epsilon (0.006)', () => {
    // 5000.006 - 5000 = 0.006, which IS > 0.005 → should fail
    const result = svc.createJournalEntrySync(makeEntry({
      lines: [
        { gl_account_code: '1020', debit_amount: 5000.006, credit_amount: 0, description: 'Debit' },
        { gl_account_code: '1100', debit_amount: 0, credit_amount: 5000, description: 'Credit' },
      ],
    }))
    expect(result.success).toBe(false)
    expect(result.error).toContain('Debits')
  })
})

/* ==================================================================
 *  Coverage: schema-variant & missing-table branches
 * ================================================================== */
describe('schema-variant branches', () => {
  it('skips period lock check when accounting_period table is absent', async () => {
    const db2 = new Database(':memory:')
    db2.pragma('journal_mode = WAL')
    db2.pragma('foreign_keys = ON')
    applySchema(db2, [
      'user', 'audit_log', 'gl_account', 'journal_entry', 'journal_entry_line',
      'approval_rule', 'transaction_approval',
      'approval_workflow', 'approval_request', 'approval_history',
    ])
    seedTestUser(db2)
    seedSystemAccounts(db2)
    const svc2 = new DoubleEntryJournalService(db2)
    const result = svc2.createJournalEntrySync(makeEntry())
    expect(result.success).toBe(true)
    db2.close()
  })

  it('void falls back to transaction_approval when approval_request is absent', () => {
    db.pragma('foreign_keys = OFF')
    db.exec('DROP TABLE IF EXISTS approval_history')
    db.exec('DROP TABLE IF EXISTS approval_request')
    db.pragma('foreign_keys = ON')

    db.prepare(
      `INSERT INTO approval_rule (rule_name, transaction_type, min_amount, required_approver_role, is_active)
       VALUES ('Void fallback', 'VOID', 100, 'ADMIN', 1)`,
    ).run()

    const created = svc.createJournalEntrySync(makeEntry())
    const result = svc.voidJournalEntrySync(created.entry_id!, 'Fallback test', 1)
    expect(result.success).toBe(true)
    expect(result.requires_approval).toBe(true)

    const row = db.prepare('SELECT * FROM transaction_approval').get() as Record<string, unknown>
    expect(row).toBeTruthy()
    expect(row.status).toBe('PENDING')
  })

  it('void returns failure when no approval subsystem tables exist', () => {
    db.pragma('foreign_keys = OFF')
    db.exec('DROP TABLE IF EXISTS approval_history')
    db.exec('DROP TABLE IF EXISTS approval_request')
    db.exec('DROP TABLE IF EXISTS transaction_approval')
    db.pragma('foreign_keys = ON')

    db.prepare(
      `INSERT INTO approval_rule (rule_name, transaction_type, min_amount, required_approver_role, is_active)
       VALUES ('Void orphan', 'VOID', 100, 'ADMIN', 1)`,
    ).run()

    const created = svc.createJournalEntrySync(makeEntry())
    const result = svc.voidJournalEntrySync(created.entry_id!, 'No subsystem', 1)
    expect(result.success).toBe(false)
    expect(result.message).toContain('not available')
  })

  it('void fails when approval_workflow table is absent', () => {
    db.pragma('foreign_keys = OFF')
    db.exec('DROP TABLE IF EXISTS approval_history')
    db.exec('DROP TABLE IF EXISTS approval_request')
    db.exec('DROP TABLE IF EXISTS approval_workflow')
    // Re-create approval_request without workflow FK
    db.exec(`
      CREATE TABLE approval_request (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id INTEGER,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        requested_by_user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
    db.pragma('foreign_keys = ON')

    db.prepare(
      `INSERT INTO approval_rule (rule_name, transaction_type, min_amount, required_approver_role, is_active)
       VALUES ('Void wf', 'VOID', 100, 'ADMIN', 1)`,
    ).run()

    const created = svc.createJournalEntrySync(makeEntry())
    const result = svc.voidJournalEntrySync(created.entry_id!, 'No workflow', 1)
    expect(result.success).toBe(false)
    expect(result.message).toContain('Approval workflow unavailable')
  })

  it('canonical approval inserts approval_rule_id when column exists, skips history when absent', () => {
    // approval_rule_id now exists in shared helper DDL
    db.pragma('foreign_keys = OFF')
    db.exec('DROP TABLE IF EXISTS approval_history')
    db.pragma('foreign_keys = ON')

    db.prepare(
      `INSERT INTO approval_rule (rule_name, transaction_type, min_amount, required_approver_role, is_active)
       VALUES ('Void rule col', 'VOID', 100, 'ADMIN', 1)`,
    ).run()

    const created = svc.createJournalEntrySync(makeEntry())
    const result = svc.voidJournalEntrySync(created.entry_id!, 'Rule col test', 1)
    expect(result.success).toBe(true)
    expect(result.requires_approval).toBe(true)

    const req = db.prepare('SELECT approval_rule_id FROM approval_request').get() as Record<string, unknown>
    expect(req.approval_rule_id).toBeGreaterThan(0)
  })

  it('includes supplier_id and source_ledger_txn_id columns when present', () => {
    // supplier_id and source_ledger_txn_id now exist in shared helper DDL
    // New service instance to reset the cached sourceLedgerColumnAvailable
    const svc2 = new DoubleEntryJournalService(db)
    const result = svc2.createJournalEntrySync(makeEntry({ supplier_id: 1, source_ledger_txn_id: 42 }))
    expect(result.success).toBe(true)

    const row = db.prepare('SELECT supplier_id, source_ledger_txn_id FROM journal_entry WHERE id = ?')
      .get(result.entry_id!) as Record<string, unknown>
    expect(row.supplier_id).toBe(1)
    expect(row.source_ledger_txn_id).toBe(42)
  })
})

/* ==================================================================
 *  Coverage: balance sheet – LIABILITY & EQUITY categorization
 * ================================================================== */
describe('getBalanceSheet – liability and equity categorization', () => {
  it('categorizes LIABILITY accounts on the balance sheet', async () => {
    svc.createJournalEntrySync(makeEntry({
      lines: [
        { gl_account_code: '2020', debit_amount: 3000, credit_amount: 0 },
        { gl_account_code: '1100', debit_amount: 0, credit_amount: 3000 },
      ],
    }))

    const bs = await svc.getBalanceSheet('2025-12-31')
    expect(bs.liabilities.length).toBeGreaterThan(0)
    const scb = bs.liabilities.find((l) => l.account_code === '2020')
    expect(scb).toBeTruthy()
  })

  it('categorizes EQUITY accounts on the balance sheet', async () => {
    db.prepare(
      `INSERT INTO gl_account (account_code, account_name, account_type, normal_balance, is_active, is_system_account)
       VALUES ('3010', 'Retained Earnings', 'EQUITY', 'CREDIT', 1, 1)`,
    ).run()

    svc.createJournalEntrySync(makeEntry({
      lines: [
        { gl_account_code: '1010', debit_amount: 7000, credit_amount: 0 },
        { gl_account_code: '3010', debit_amount: 0, credit_amount: 7000 },
      ],
    }))

    const bs = await svc.getBalanceSheet('2025-12-31')
    expect(bs.equity.length).toBeGreaterThan(0)
    expect(bs.total_equity).toBe(7000)
    const re = bs.equity.find((e) => e.account_code === '3010')
    expect(re?.balance).toBe(7000)
  })

  // ── branch coverage: REVENUE and EXPENSE accounts in calculateNetIncome ──
  it('includes REVENUE and EXPENSE in net income calculation on balance sheet', async () => {
    // Create REVENUE entry: debit Cash, credit Tuition Revenue
    svc.createJournalEntrySync(makeEntry({
      lines: [
        { gl_account_code: '1010', debit_amount: 10000, credit_amount: 0 },
        { gl_account_code: '4010', debit_amount: 0, credit_amount: 10000 },
      ],
    }))

    // Create EXPENSE entry: debit Salary Expense, credit Cash
    svc.createJournalEntrySync(makeEntry({
      lines: [
        { gl_account_code: '5010', debit_amount: 3000, credit_amount: 0 },
        { gl_account_code: '1010', debit_amount: 0, credit_amount: 3000 },
      ],
    }))

    const bs = await svc.getBalanceSheet('2025-12-31')
    // Net income = revenue (10000) - expense (3000) = 7000
    expect(bs.net_income).toBe(7000)
  })

  // ── branch coverage: tableHasColumn returns false when table does not exist (L117) ──
  it('tableHasColumn returns false when table does not exist', () => {
    const fn = (svc as any).tableHasColumn.bind(svc)
    expect(fn('nonexistent_table_xyz', 'any_column')).toBe(false)
  })

  // ── branch coverage: getOrCreateWorkflowId returns null when approval_workflow table missing (L136) ──
  it('getOrCreateWorkflowId returns null when approval_workflow table is absent', () => {
    const fn = (svc as any).getOrCreateWorkflowId.bind(svc)
    // Drop approval_workflow if it exists
    db.exec('DROP TABLE IF EXISTS approval_workflow')
    expect(fn('JOURNAL', 'Journal Approval')).toBeNull()
  })

  // ── branch coverage: createJournalEntrySync with optional fields null (L274,324,329,334,339) ──
  it('createJournalEntrySync handles null optional fields (student_id, staff_id, term_id)', () => {
    const result = svc.createJournalEntrySync(makeEntry({
      student_id: undefined,
      staff_id: undefined,
      term_id: undefined,
    }))
    expect(result.success).toBe(true)
  })

  // ── branch coverage: createJournalEntrySync with all default optional fields ──
  it('createJournalEntrySync succeeds with standard makeEntry defaults', () => {
    const result = svc.createJournalEntrySync(makeEntry())
    expect(result.success).toBe(true)
    expect(result.entry_id).toBeGreaterThan(0)
  })

  // ── branch coverage: executeVoidReversal with null entry_ref/line_desc (L625) ──
  it('voidJournalEntrySync handles entries with no entry_ref on lines', () => {
    const entryResult = svc.createJournalEntrySync(makeEntry({
      lines: [
        { gl_account_code: '1010', debit_amount: 500, credit_amount: 0 },
        { gl_account_code: '1020', debit_amount: 0, credit_amount: 500 },
      ],
    }))
    expect(entryResult.success).toBe(true)
    const entryId = entryResult.entry_id!
    const voidResult = svc.voidJournalEntrySync(entryId, 'Testing void reversal', 1)
    expect(voidResult.success).toBe(true)
    expect(voidResult.message).toContain('voided')
  })

  // ── branch coverage: checkApprovalRequiredSync with no matching rule (L804-806) ──
  it('checkApprovalRequiredSync returns false when no rule matches', () => {
    const fn = (svc as any).checkApprovalRequiredSync.bind(svc)
    const result = fn({
      entry_type: 'NONEXISTENT_TYPE',
      lines: [{ debit_amount: 1 }]
    })
    expect(result).toBe(false)
  })

  // ── branch coverage: checkApprovalRequiredSync returns true when rule matches (L804-806) ──
  it('checkApprovalRequiredSync returns true when a rule matches', () => {
    db.exec(`INSERT INTO approval_rule (rule_name, transaction_type, min_amount, required_approver_role, is_active) VALUES ('Large General', 'GENERAL', 100, 'ADMIN', 1)`)
    const fn = (svc as any).checkApprovalRequiredSync.bind(svc)
    const result = fn({
      entry_type: 'GENERAL',
      lines: [{ debit_amount: 200 }, { debit_amount: 300 }]
    })
    expect(result).toBe(true)
  })

  // ── branch coverage: submitVoidApprovalIfNeeded returns null when no rule (L543) ──
  it('submitVoidApprovalIfNeeded returns null when no approval rule matched', () => {
    const fn = (svc as any).submitVoidApprovalIfNeeded.bind(svc)
    const result = fn(999, 1, [{ entry_date: '2025-01-01', debit_amount: 100 }])
    expect(result).toBeNull()
  })

  /* ==================================================================
   *  Branch coverage: getOrCreateWorkflowId finds existing workflow (L136)
   * ================================================================== */
  it('getOrCreateWorkflowId returns existing workflow id when workflow pre-exists', () => {
    db.prepare(`INSERT INTO approval_workflow (workflow_name, entity_type, is_active) VALUES ('Pre-existing', 'JOURNAL_ENTRY', 1)`).run()
    const fn = (svc as any).getOrCreateWorkflowId.bind(svc)
    const result = fn('JOURNAL_ENTRY', 'Journal Entry Approvals')
    expect(result).toBeGreaterThan(0)
  })

  /* ==================================================================
   *  Branch coverage: calculateNetIncome with zero-credit REVENUE (L804) and zero-debit EXPENSE (L806)
   * ================================================================== */
  it('balance sheet handles revenue with only debit entries (total_credit=0)', async () => {
    svc.createJournalEntrySync(makeEntry({
      entry_type: 'ADJUSTMENT',
      lines: [
        { gl_account_code: '4010', debit_amount: 2000, credit_amount: 0 },
        { gl_account_code: '1010', debit_amount: 0, credit_amount: 2000 },
      ],
    }))
    const bs = await svc.getBalanceSheet('2025-12-31')
    expect(bs.net_income).toBe(-2000)
  })

  it('balance sheet handles expense with only credit entries (total_debit=0)', async () => {
    svc.createJournalEntrySync(makeEntry({
      entry_type: 'ADJUSTMENT',
      lines: [
        { gl_account_code: '1010', debit_amount: 1500, credit_amount: 0 },
        { gl_account_code: '5010', debit_amount: 0, credit_amount: 1500 },
      ],
    }))
    const bs = await svc.getBalanceSheet('2025-12-31')
    expect(bs.net_income).toBe(1500)
  })

  /* ==================================================================
   *  Branch coverage: supplier_id / source_ledger_txn_id columns (L274, L280)
   * ================================================================== */
  it('createJournalEntrySync persists supplier_id and source_ledger_txn_id when columns exist', () => {
    // supplier_id and source_ledger_txn_id now exist in shared helper DDL
    const result = svc.createJournalEntrySync(makeEntry({ supplier_id: 1, source_ledger_txn_id: 99 } as any))
    expect(result.success).toBe(true)
    const row = db.prepare('SELECT supplier_id, source_ledger_txn_id FROM journal_entry WHERE id = ?').get(result.entry_id!) as any
    expect(row.supplier_id).toBe(1)
    expect(row.source_ledger_txn_id).toBe(99)
  })

  it('createJournalEntrySync uses null for undefined supplier_id / source_ledger_txn_id when columns exist', () => {
    // supplier_id and source_ledger_txn_id now exist in shared helper DDL
    const result = svc.createJournalEntrySync(makeEntry())
    expect(result.success).toBe(true)
    const row = db.prepare('SELECT supplier_id, source_ledger_txn_id FROM journal_entry WHERE id = ?').get(result.entry_id!) as any
    expect(row.supplier_id).toBeNull()
    expect(row.source_ledger_txn_id).toBeNull()
  })

  /* ==================================================================
   *  Branch coverage: voidJournalEntrySync reversal failure (L639)
   * ================================================================== */
  it('voidJournalEntrySync returns failure when reversal entry cannot be created', () => {
    const created = svc.createJournalEntrySync(makeEntry())
    expect(created.success).toBe(true)

    // Close the accounting period covering today so the reversal fails period-lock validation
    const today = new Date().toISOString().slice(0, 10)
    db.prepare(`INSERT INTO accounting_period (period_name, start_date, end_date, status) VALUES ('Locked', ?, ?, 'CLOSED')`).run(today, today)

    const result = svc.voidJournalEntrySync(created.entry_id!, 'Force reversal failure', 1)
    expect(result.success).toBe(false)
    expect(result.message).toContain('Failed to void journal entry')
  })
})
