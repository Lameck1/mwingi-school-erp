/**
 * Tests for BudgetService.
 *
 * Uses in-memory SQLite with inline DDL including computed variance column
 * and committed_amount from procurement migration.
 */
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockLogAudit } = vi.hoisted(() => ({ mockLogAudit: vi.fn() }))
vi.mock('../../../database/utils/audit', () => ({ logAudit: mockLogAudit }))

let testDb: Database.Database
vi.mock('../../../database', () => ({ getDatabase: () => testDb }))

import { BudgetService } from '../BudgetService'

/* ── Schema ───────────────────────────────────────────────────────── */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS academic_year (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year_name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS term (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    term_name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transaction_category (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_name TEXT NOT NULL,
    category_type TEXT DEFAULT 'EXPENSE'
  );

  CREATE TABLE IF NOT EXISTS budget (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    budget_name TEXT NOT NULL,
    academic_year_id INTEGER NOT NULL,
    term_id INTEGER,
    status TEXT DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ACTIVE', 'CLOSED')),
    total_amount INTEGER DEFAULT 0,
    notes TEXT,
    created_by_user_id INTEGER NOT NULL,
    approved_by_user_id INTEGER,
    approved_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME DEFAULT NULL,
    FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
    FOREIGN KEY (term_id) REFERENCES term(id),
    FOREIGN KEY (created_by_user_id) REFERENCES user(id),
    FOREIGN KEY (approved_by_user_id) REFERENCES user(id)
  );

  CREATE TABLE IF NOT EXISTS budget_line_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    budget_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    budgeted_amount INTEGER NOT NULL DEFAULT 0,
    actual_amount INTEGER DEFAULT 0,
    committed_amount INTEGER NOT NULL DEFAULT 0,
    variance INTEGER GENERATED ALWAYS AS (budgeted_amount - actual_amount) STORED,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (budget_id) REFERENCES budget(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES transaction_category(id)
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    action_type TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id INTEGER,
    old_values TEXT,
    new_values TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`

/* ── Setup ────────────────────────────────────────────────────────── */
let svc: BudgetService

function seedRefs() {
  testDb.prepare("INSERT INTO academic_year (id, year_name) VALUES (1, '2025')").run()
  testDb.prepare("INSERT INTO term (id, term_name) VALUES (1, 'Term 1')").run()
  testDb.prepare("INSERT INTO user (id, full_name) VALUES (1, 'Admin')").run()
  testDb.prepare("INSERT INTO user (id, full_name) VALUES (2, 'Finance Officer')").run()
  testDb.prepare("INSERT INTO transaction_category (id, category_name, category_type) VALUES (1, 'Books', 'EXPENSE')").run()
  testDb.prepare("INSERT INTO transaction_category (id, category_name, category_type) VALUES (2, 'Transport', 'EXPENSE')").run()
}

const validBudget = {
  budget_name: 'Q1 Budget',
  academic_year_id: 1,
  line_items: [
    { category_id: 1, description: 'Textbooks', budgeted_amount: 50000 },
    { category_id: 2, description: 'Fuel', budgeted_amount: 30000 },
  ],
}

beforeEach(() => {
  testDb = new Database(':memory:')
  testDb.pragma('journal_mode = WAL')
  testDb.exec(SCHEMA)
  seedRefs()
  svc = new BudgetService()
  vi.clearAllMocks()
})

afterEach(() => {
  testDb.close()
})

/* ================================================================== */
describe('BudgetService', () => {
  /* ---- Create ---- */
  describe('create', () => {
    it('creates budget with line items and total', async () => {
      const result = await svc.create(validBudget, 1)

      expect(result.success).toBe(true)
      expect(result.id).toBeGreaterThan(0)

      const budget = testDb.prepare('SELECT * FROM budget WHERE id = ?').get(result.id) as Record<string, unknown>
      expect(budget.budget_name).toBe('Q1 Budget')
      expect(budget.status).toBe('DRAFT')
      expect(budget.total_amount).toBe(80000) // 50000 + 30000
      expect(budget.created_by_user_id).toBe(1)

      const items = testDb.prepare('SELECT * FROM budget_line_item WHERE budget_id = ?').all(result.id)
      expect(items.length).toBe(2)

      expect(mockLogAudit).toHaveBeenCalledWith(1, 'CREATE', 'budget', result.id, null, expect.anything())
    })

    it('rejects empty budget name', async () => {
      const result = await svc.create({ ...validBudget, budget_name: '  ' }, 1)
      expect(result.success).toBe(false)
      expect(result.errors).toContain('Budget name is required')
    })

    it('rejects missing academic year', async () => {
      const result = await svc.create({ ...validBudget, academic_year_id: 0 }, 1)
      expect(result.success).toBe(false)
      expect(result.errors).toContain('Academic year is required')
    })

    it('rejects empty line items', async () => {
      const result = await svc.create({ ...validBudget, line_items: [] }, 1)
      expect(result.success).toBe(false)
      expect(result.errors).toContain('At least one budget line item is required')
    })

    it('validates each line item', async () => {
      const result = await svc.create({
        ...validBudget,
        line_items: [
          { category_id: 0, description: '', budgeted_amount: -100 },
        ],
      }, 1)

      expect(result.success).toBe(false)
      expect(result.errors).toContain('Line item 1: Category is required')
      expect(result.errors).toContain('Line item 1: Description is required')
      expect(result.errors).toContain('Line item 1: Amount must be positive')
    })

    it('accepts zero budgeted amount (non-negative is valid)', async () => {
      const result = await svc.create({
        ...validBudget,
        line_items: [{ category_id: 1, description: 'Zero', budgeted_amount: 0 }],
      }, 1)

      expect(result.success).toBe(true)
    })
  })

  /* ---- findAll with filters ---- */
  describe('findAll', () => {
    it('returns budgets with computed fields', async () => {
      await svc.create(validBudget, 1)

      const all = await svc.findAll({})
      expect(all.length).toBe(1)
      expect(all[0].budget_name).toBe('Q1 Budget')
      expect(all[0].total_budgeted).toBe(80000)
    })

    it('filters by status', async () => {
      await svc.create(validBudget, 1)
      await svc.create({ ...validBudget, budget_name: 'B2' }, 1)

      // Submit one
      const all = await svc.findAll({})
      await svc.submitForApproval(all[0].id, 1)

      const submitted = await svc.findAll({ status: 'SUBMITTED' })
      expect(submitted.length).toBe(1)
    })

    it('excludes soft-deleted budgets', async () => {
      const res = await svc.create(validBudget, 1)
      testDb.prepare('UPDATE budget SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(res.id)

      const all = await svc.findAll({})
      expect(all.length).toBe(0)
    })
  })

  /* ---- Approval workflow ---- */
  describe('submitForApproval', () => {
    it('transitions DRAFT → SUBMITTED', async () => {
      const res = await svc.create(validBudget, 1)
      const result = await svc.submitForApproval(res.id, 1)

      expect(result.success).toBe(true)
      const budget = testDb.prepare('SELECT status FROM budget WHERE id = ?').get(res.id) as { status: string }
      expect(budget.status).toBe('SUBMITTED')
      expect(mockLogAudit).toHaveBeenCalledWith(1, 'SUBMIT', 'budget', res.id, expect.anything(), expect.anything())
    })

    it('rejects non-draft budget', async () => {
      const res = await svc.create(validBudget, 1)
      await svc.submitForApproval(res.id, 1)

      const result = await svc.submitForApproval(res.id, 1)
      expect(result.success).toBe(false)
      expect(result.errors).toContain('Only draft budgets can be submitted')
    })

    it('rejects non-existent budget', async () => {
      const result = await svc.submitForApproval(999, 1)
      expect(result.success).toBe(false)
      expect(result.errors).toContain('Budget not found')
    })
  })

  describe('approve', () => {
    it('transitions SUBMITTED → APPROVED', async () => {
      const res = await svc.create(validBudget, 1)
      await svc.submitForApproval(res.id, 1)
      const result = await svc.approve(res.id, 2) // Different user approves

      expect(result.success).toBe(true)
      const budget = testDb.prepare('SELECT status, approved_by_user_id FROM budget WHERE id = ?').get(res.id) as Record<string, unknown>
      expect(budget.status).toBe('APPROVED')
      expect(budget.approved_by_user_id).toBe(2)
    })

    it('rejects non-submitted budget', async () => {
      const res = await svc.create(validBudget, 1)
      const result = await svc.approve(res.id, 2)

      expect(result.success).toBe(false)
      expect(result.errors).toContain('Only submitted budgets can be approved')
    })
  })

  /* ---- Update ---- */
  describe('update', () => {
    it('updates budget name', async () => {
      const res = await svc.create(validBudget, 1)
      const result = await svc.update(res.id, { budget_name: 'Revised Q1' }, 1)

      expect(result.success).toBe(true)
      const budget = testDb.prepare('SELECT budget_name FROM budget WHERE id = ?').get(res.id) as { budget_name: string }
      expect(budget.budget_name).toBe('Revised Q1')
    })

    it('replaces line items when provided', async () => {
      const res = await svc.create(validBudget, 1)
      await svc.update(res.id, {
        line_items: [{ category_id: 1, description: 'New Items', budgeted_amount: 99000 }],
      }, 1)

      const items = testDb.prepare('SELECT * FROM budget_line_item WHERE budget_id = ?').all(res.id) as Record<string, unknown>[]
      expect(items.length).toBe(1)
      expect(items[0].budgeted_amount).toBe(99000)

      const budget = testDb.prepare('SELECT total_amount FROM budget WHERE id = ?').get(res.id) as { total_amount: number }
      expect(budget.total_amount).toBe(99000)
    })

    it('blocks update to approved budget', async () => {
      const res = await svc.create(validBudget, 1)
      await svc.submitForApproval(res.id, 1)
      await svc.approve(res.id, 2)

      const result = await svc.update(res.id, { budget_name: 'Changed' }, 1)
      expect(result.success).toBe(false)
      expect(result.errors).toContain('Cannot modify an approved or closed budget. Create a revision instead.')
    })
  })

  /* ---- getBudgetWithLineItems ---- */
  describe('getBudgetWithLineItems', () => {
    it('returns budget with joined line items', async () => {
      const res = await svc.create(validBudget, 1)
      const budget = await svc.getBudgetWithLineItems(res.id)

      expect(budget).not.toBeNull()
      expect(budget!.line_items).toBeDefined()
      expect(budget!.line_items!.length).toBe(2)
      expect(budget!.line_items![0].category_name).toBeDefined()
    })

    it('returns null for non-existent budget', async () => {
      const budget = await svc.getBudgetWithLineItems(999)
      expect(budget).toBeNull()
    })
  })

  /* ---- Funds management ---- */
  describe('commitFunds', () => {
    it('commits funds to a line item', async () => {
      const res = await svc.create(validBudget, 1)
      const items = testDb.prepare('SELECT id FROM budget_line_item WHERE budget_id = ?').all(res.id) as { id: number }[]

      const result = svc.commitFunds(items[0].id, 10000)
      expect(result.success).toBe(true)

      const item = testDb.prepare('SELECT committed_amount FROM budget_line_item WHERE id = ?').get(items[0].id) as { committed_amount: number }
      expect(item.committed_amount).toBe(10000)
    })

    it('rejects when exceeding available balance', async () => {
      const res = await svc.create(validBudget, 1)
      const items = testDb.prepare('SELECT id FROM budget_line_item WHERE budget_id = ?').all(res.id) as { id: number }[]

      const result = svc.commitFunds(items[0].id, 60000) // Textbooks line has 50000 budgeted
      expect(result.success).toBe(false)
      expect(result.error).toContain('Insufficient budget')
    })

    it('rejects zero or negative amount', () => {
      expect(svc.commitFunds(1, 0).success).toBe(false)
      expect(svc.commitFunds(1, -100).success).toBe(false)
    })

    it('rejects non-existent line item', () => {
      const result = svc.commitFunds(999, 1000)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Budget line item not found')
    })
  })

  describe('utilizeFunds', () => {
    it('moves funds from committed to actual', async () => {
      const res = await svc.create(validBudget, 1)
      const items = testDb.prepare('SELECT id FROM budget_line_item WHERE budget_id = ?').all(res.id) as { id: number }[]

      svc.commitFunds(items[0].id, 20000)
      const result = svc.utilizeFunds(items[0].id, 15000)
      expect(result.success).toBe(true)

      const item = testDb.prepare('SELECT committed_amount, actual_amount FROM budget_line_item WHERE id = ?').get(items[0].id) as Record<string, number>
      expect(item.committed_amount).toBe(5000) // 20000 - 15000
      expect(item.actual_amount).toBe(15000)
    })

    it('handles utilization exceeding committed amount', async () => {
      const res = await svc.create(validBudget, 1)
      const items = testDb.prepare('SELECT id FROM budget_line_item WHERE budget_id = ?').all(res.id) as { id: number }[]

      svc.commitFunds(items[0].id, 5000)
      const result = svc.utilizeFunds(items[0].id, 8000) // 8000 > 5000 committed

      expect(result.success).toBe(true)
      const item = testDb.prepare('SELECT committed_amount, actual_amount FROM budget_line_item WHERE id = ?').get(items[0].id) as Record<string, number>
      expect(item.committed_amount).toBe(0) // Drained to 0
      expect(item.actual_amount).toBe(8000) // Full amount utilized
    })

    it('rejects zero amount', () => {
      expect(svc.utilizeFunds(1, 0).success).toBe(false)
    })
  })

  describe('releaseCommitment', () => {
    it('releases committed funds', async () => {
      const res = await svc.create(validBudget, 1)
      const items = testDb.prepare('SELECT id FROM budget_line_item WHERE budget_id = ?').all(res.id) as { id: number }[]

      svc.commitFunds(items[0].id, 20000)
      const result = svc.releaseCommitment(items[0].id, 5000)
      expect(result.success).toBe(true)

      const item = testDb.prepare('SELECT committed_amount FROM budget_line_item WHERE id = ?').get(items[0].id) as { committed_amount: number }
      expect(item.committed_amount).toBe(15000)
    })

    it('caps release at committed amount', async () => {
      const res = await svc.create(validBudget, 1)
      const items = testDb.prepare('SELECT id FROM budget_line_item WHERE budget_id = ?').all(res.id) as { id: number }[]

      svc.commitFunds(items[0].id, 10000)
      svc.releaseCommitment(items[0].id, 50000) // More than committed

      const item = testDb.prepare('SELECT committed_amount FROM budget_line_item WHERE id = ?').get(items[0].id) as { committed_amount: number }
      expect(item.committed_amount).toBe(0) // Capped at 0, not negative
    })

    it('rejects zero amount', () => {
      expect(svc.releaseCommitment(1, 0).success).toBe(false)
    })

    it('rejects non-existent line item', () => {
      const result = svc.releaseCommitment(999, 1000)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Budget line item not found')
    })
  })

  /* ---- Create error handling ---- */
  describe('create – error catch branch', () => {
    it('returns error when database constraint fails', async () => {
      // Cause a foreign key error by using non-existent academic_year_id
      testDb.pragma('foreign_keys = ON')
      const result = await svc.create({
        budget_name: 'Bad Budget',
        academic_year_id: 9999, // does not exist
        line_items: [{ category_id: 1, description: 'X', budgeted_amount: 100 }],
      }, 1)
      // This should trigger the catch branch
      expect(result.success).toBe(false)
      expect(result.id).toBe(0)
      expect(result.errors).toBeDefined()
      expect(result.errors!.length).toBeGreaterThan(0)
    })
  })

  /* ---- validateUpdate - closed budget ---- */
  describe('update – closed budget', () => {
    it('blocks update to CLOSED budget', async () => {
      const res = await svc.create(validBudget, 1)
      testDb.prepare("UPDATE budget SET status = 'CLOSED' WHERE id = ?").run(res.id)

      const result = await svc.update(res.id, { budget_name: 'Changed' }, 1)
      expect(result.success).toBe(false)
      expect(result.errors).toContain('Cannot modify an approved or closed budget. Create a revision instead.')
    })
  })

  /* ---- utilizeFunds and releaseCommitment non-existent item ---- */
  describe('utilizeFunds – non-existent line item', () => {
    it('rejects non-existent line item', () => {
      const result = svc.utilizeFunds(999, 1000)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Budget line item not found')
    })
  })

  /* ---- findAll with academic_year_id and term_id filters ---- */
  describe('findAll – additional filters', () => {
    it('filters by academic_year_id', async () => {
      await svc.create(validBudget, 1)
      const results = await svc.findAll({ academic_year_id: 1 })
      expect(results.length).toBe(1)
      const noResults = await svc.findAll({ academic_year_id: 999 })
      expect(noResults.length).toBe(0)
    })

    it('filters by term_id', async () => {
      await svc.create({ ...validBudget, term_id: 1 }, 1)
      const results = await svc.findAll({ term_id: 1 })
      expect(results.length).toBe(1)
      const noResults = await svc.findAll({ term_id: 999 })
      expect(noResults.length).toBe(0)
    })
  })

  /* ---- approve – budget not found ---- */
  describe('approve – not found', () => {
    it('returns error when approving non-existent budget', async () => {
      const result = await svc.approve(999, 2)
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors![0]).toContain('not found')
    })
  })

  /* ---- create – non-Error catch branch ---- */
  describe('create – non-Error throw', () => {
    it('returns Unknown error when create throws a non-Error', async () => {
      // Monkey-patch executeCreateWithUser to throw a non-Error
      const orig = (svc as any).executeCreateWithUser.bind(svc)
      ;(svc as any).executeCreateWithUser = () => { throw 42 } // NOSONAR
      const result = await svc.create(validBudget, 1)
      expect(result.success).toBe(false)
      expect(result.id).toBe(0)
      expect(result.errors).toEqual(['Unknown error'])
      ;(svc as any).executeCreateWithUser = orig
    })
  })

  /* ---- branch coverage: protected method branches ---- */
  describe('protected method branches', () => {
    it('getTableAlias returns the expected alias (line 69)', () => {
      expect((svc as any).getTableAlias()).toBe('b')
    })

    it('validateUpdate returns error for non-existent budget (line 132)', async () => {
      const errors = await (svc as any).validateUpdate(999, {})
      expect(errors).toContain('Budget not found')
    })

    it('executeCreate delegates to executeCreateWithUser with userId 0 (line 143)', () => {
      // Insert a system user with id 0 so FK constraint is satisfied
      testDb.prepare("INSERT OR IGNORE INTO user (id, full_name) VALUES (0, 'System')").run()
      const result = (svc as any).executeCreate(validBudget)
      expect(result.lastInsertRowid).toBeGreaterThan(0)

      const budget = testDb.prepare('SELECT created_by_user_id FROM budget WHERE id = ?').get(result.lastInsertRowid) as { created_by_user_id: number }
      expect(budget.created_by_user_id).toBe(0)
    })
  })
})
