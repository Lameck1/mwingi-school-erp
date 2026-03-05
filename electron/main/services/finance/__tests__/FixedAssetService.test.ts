/**
 * Tests for FixedAssetService.
 *
 * Uses in-memory SQLite with inline DDL.
 * DoubleEntryJournalService is mocked (class constructor pattern).
 */
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/* ── Mocks ────────────────────────────────────────────────────────── */
const { mockLogAudit, mockCreateJournalEntrySync } = vi.hoisted(() => ({
  mockLogAudit: vi.fn(),
  mockCreateJournalEntrySync: vi.fn((..._args: unknown[]) => ({ success: true, id: 1 } as { success: boolean; id?: number; error?: string })),
}))

vi.mock('../../../database/utils/audit', () => ({ logAudit: mockLogAudit }))

vi.mock('../../accounting/DoubleEntryJournalService', () => ({
  DoubleEntryJournalService: class {
    createJournalEntrySync(...args: unknown[]) { return mockCreateJournalEntrySync(...args) }
  },
}))

vi.mock('../../accounting/SystemAccounts', () => ({
  SystemAccounts: {
    FIXED_ASSET: '1500',
    BANK: '1000',
    RETAINED_EARNINGS: '3000',
    ACCUMULATED_DEPRECIATION: '1510',
    DEPRECIATION_EXPENSE: '5500',
  },
}))

let testDb: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => testDb,
}))

import { FixedAssetService } from '../FixedAssetService'

/* ── Schema ───────────────────────────────────────────────────────── */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS asset_category (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_name TEXT NOT NULL UNIQUE,
    depreciation_method TEXT DEFAULT 'STRAIGHT_LINE' CHECK(depreciation_method IN ('STRAIGHT_LINE', 'DECLINING_BALANCE', 'NONE')),
    useful_life_years INTEGER DEFAULT 5,
    depreciation_rate REAL,
    is_active BOOLEAN DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS fixed_asset (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_code TEXT NOT NULL UNIQUE,
    asset_name TEXT NOT NULL,
    category_id INTEGER NOT NULL,
    description TEXT,
    serial_number TEXT,
    location TEXT,
    acquisition_date DATE NOT NULL,
    acquisition_cost INTEGER NOT NULL,
    current_value INTEGER NOT NULL,
    accumulated_depreciation INTEGER DEFAULT 0,
    status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'DISPOSED', 'WRITTEN_OFF', 'TRANSFERRED')),
    disposed_date DATE,
    disposed_value INTEGER,
    disposal_reason TEXT,
    supplier_id INTEGER,
    warranty_expiry DATE,
    last_depreciation_date DATE,
    created_by_user_id INTEGER,
    deleted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES asset_category(id)
  );

  CREATE TABLE IF NOT EXISTS asset_depreciation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL,
    depreciation_date DATE NOT NULL,
    amount INTEGER NOT NULL,
    book_value_before INTEGER NOT NULL,
    book_value_after INTEGER NOT NULL,
    financial_period_id INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (asset_id) REFERENCES fixed_asset(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS financial_period (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_name TEXT NOT NULL,
    period_type TEXT NOT NULL CHECK(period_type IN ('MONTHLY', 'QUARTERLY', 'YEARLY')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    academic_year_id INTEGER,
    term_id INTEGER,
    is_locked BOOLEAN DEFAULT 0,
    locked_at DATETIME,
    locked_by_user_id INTEGER,
    unlock_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
let svc: FixedAssetService

function seedCategory(method = 'STRAIGHT_LINE', years = 5, rate: number | null = null) {
  return testDb.prepare(`
    INSERT INTO asset_category (category_name, depreciation_method, useful_life_years, depreciation_rate)
    VALUES (?, ?, ?, ?)
  `).run('Furniture', method, years, rate).lastInsertRowid as number
}

function seedPeriod(opts: { locked?: boolean; start?: string; end?: string } = {}) {
  return testDb.prepare(`
    INSERT INTO financial_period (period_name, period_type, start_date, end_date, is_locked)
    VALUES ('Q1', 'QUARTERLY', ?, ?, ?)
  `).run(opts.start ?? '2025-01-01', opts.end ?? '2025-03-31', opts.locked ? 1 : 0).lastInsertRowid as number
}

beforeEach(() => {
  testDb = new Database(':memory:')
  testDb.pragma('journal_mode = WAL')
  testDb.exec(SCHEMA)
  svc = new FixedAssetService()
  vi.clearAllMocks()
  mockCreateJournalEntrySync.mockImplementation((..._args: unknown[]) => ({ success: true, id: 1 }))
})

afterEach(() => {
  testDb.close()
})

/* ================================================================== */
describe('FixedAssetService', () => {
  /* ---- Create ---- */
  describe('create', () => {
    it('creates asset and logs audit', async () => {
      const catId = seedCategory()
      const result = await svc.create({
        asset_name: 'Office Desk',
        category_id: catId,
        acquisition_date: '2025-01-15',
        acquisition_cost: 15000,
      }, 1)

      expect(result.success).toBe(true)
      expect(result.id).toBeGreaterThan(0)

      const row = testDb.prepare('SELECT * FROM fixed_asset WHERE id = ?').get(result.id) as Record<string, unknown>
      expect(row.asset_name).toBe('Office Desk')
      expect(row.current_value).toBe(15000)
      expect(row.accumulated_depreciation).toBe(0)
      expect(row.status).toBe('ACTIVE')

      expect(mockCreateJournalEntrySync).toHaveBeenCalledTimes(1) // acquisition entry only
      expect(mockLogAudit).toHaveBeenCalledWith(1, 'CREATE', 'fixed_asset', result.id, null, expect.anything())
    })

    it('auto-generates asset code when not provided', async () => {
      const catId = seedCategory()
      const result = await svc.create({
        asset_name: 'Chair',
        category_id: catId,
        acquisition_date: '2025-01-15',
        acquisition_cost: 5000,
      }, 1)

      const row = testDb.prepare('SELECT asset_code FROM fixed_asset WHERE id = ?').get(result.id) as { asset_code: string }
      expect(row.asset_code).toMatch(/^AST-/)
    })

    it('uses provided asset code', async () => {
      const catId = seedCategory()
      const result = await svc.create({
        asset_name: 'Laptop',
        category_id: catId,
        acquisition_date: '2025-01-15',
        acquisition_cost: 80000,
        asset_code: 'IT-001',
      }, 1)

      const row = testDb.prepare('SELECT asset_code FROM fixed_asset WHERE id = ?').get(result.id) as { asset_code: string }
      expect(row.asset_code).toBe('IT-001')
    })

    it('creates legacy depreciation entry when accumulated_depreciation > 0', async () => {
      const catId = seedCategory()
      const result = await svc.create({
        asset_name: 'Old Projector',
        category_id: catId,
        acquisition_date: '2020-01-01',
        acquisition_cost: 50000,
        accumulated_depreciation: 20000,
      }, 1)

      expect(result.success).toBe(true)
      const row = testDb.prepare('SELECT current_value, accumulated_depreciation FROM fixed_asset WHERE id = ?').get(result.id) as Record<string, number>
      expect(row.current_value).toBe(30000) // 50000 - 20000
      expect(row.accumulated_depreciation).toBe(20000)
      expect(mockCreateJournalEntrySync).toHaveBeenCalledTimes(2) // acquisition + legacy
    })

    it('rejects missing asset_name', async () => {
      const result = await svc.create({
        asset_name: '',
        category_id: 1,
        acquisition_date: '2025-01-15',
        acquisition_cost: 5000,
      }, 1)

      expect(result.success).toBe(false)
      expect(result.errors).toContain('Asset name is required')
    })

    it('rejects zero acquisition cost', async () => {
      const result = await svc.create({
        asset_name: 'Table',
        category_id: 1,
        acquisition_date: '2025-01-15',
        acquisition_cost: 0,
      }, 1)

      expect(result.success).toBe(false)
      expect(result.errors).toContain('Acquisition cost must be greater than zero')
    })

    it('rejects missing category', async () => {
      const result = await svc.create({
        asset_name: 'Table',
        category_id: 0,
        acquisition_date: '2025-01-15',
        acquisition_cost: 5000,
      }, 1)

      expect(result.success).toBe(false)
      expect(result.errors).toContain('Category is required')
    })

    it('returns error when journal entry fails', async () => {
      const catId = seedCategory()
      mockCreateJournalEntrySync.mockReturnValueOnce({ success: false, id: 0, error: 'GL account not found' })

      const result = await svc.create({
        asset_name: 'Desk',
        category_id: catId,
        acquisition_date: '2025-01-15',
        acquisition_cost: 15000,
      }, 1)

      expect(result.success).toBe(false)
      expect(result.errors?.[0]).toContain('GL account not found')
    })
  })

  /* ---- findAll with filters ---- */
  describe('findAll', () => {
    it('returns all active assets', async () => {
      const catId = seedCategory()
      await svc.create({ asset_name: 'A', category_id: catId, acquisition_date: '2025-01-01', acquisition_cost: 1000, asset_code: 'A-001' }, 1)
      await svc.create({ asset_name: 'B', category_id: catId, acquisition_date: '2025-01-01', acquisition_cost: 2000, asset_code: 'B-002' }, 1)

      const all = await svc.findAll({})
      expect(all.length).toBe(2)
    })

    it('filters by status', async () => {
      const catId = seedCategory()
      const res = await svc.create({ asset_name: 'Active', category_id: catId, acquisition_date: '2025-01-01', acquisition_cost: 1000 }, 1)
      testDb.prepare("UPDATE fixed_asset SET status = 'DISPOSED' WHERE id = ?").run(res.id)

      await svc.create({ asset_name: 'Active2', category_id: catId, acquisition_date: '2025-01-01', acquisition_cost: 2000, asset_code: 'A2' }, 1)

      const disposed = await svc.findAll({ status: 'DISPOSED' })
      expect(disposed.length).toBe(1)
      expect(disposed[0].asset_name).toBe('Active')
    })

    it('filters by search term', async () => {
      const catId = seedCategory()
      await svc.create({ asset_name: 'Office Desk', category_id: catId, acquisition_date: '2025-01-01', acquisition_cost: 1000 }, 1)
      await svc.create({ asset_name: 'Chair', category_id: catId, acquisition_date: '2025-01-01', acquisition_cost: 500, asset_code: 'CH-01' }, 1)

      const results = await svc.findAll({ search: 'Desk' })
      expect(results.length).toBe(1)
      expect(results[0].asset_name).toBe('Office Desk')
    })

    it('excludes soft-deleted assets', async () => {
      const catId = seedCategory()
      const res = await svc.create({ asset_name: 'Deleted', category_id: catId, acquisition_date: '2025-01-01', acquisition_cost: 1000 }, 1)
      testDb.prepare("UPDATE fixed_asset SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(res.id)

      // applyFilters adds 'deleted_at IS NULL' — requires filters to be an object
      const all = await svc.findAll({})
      expect(all.length).toBe(0)
    })
  })

  /* ---- getCategories ---- */
  describe('getCategories', () => {
    it('returns active categories ordered by name', async () => {
      testDb.prepare("INSERT INTO asset_category (category_name) VALUES ('Vehicles')").run()
      testDb.prepare("INSERT INTO asset_category (category_name) VALUES ('Electronics')").run()
      testDb.prepare("INSERT INTO asset_category (category_name, is_active) VALUES ('Archived', 0)").run()

      const cats = await svc.getCategories()
      expect(cats.length).toBe(2)
      expect(cats[0].category_name).toBe('Electronics')
      expect(cats[1].category_name).toBe('Vehicles')
    })
  })

  /* ---- getFinancialPeriods ---- */
  describe('getFinancialPeriods', () => {
    it('returns periods ordered by end_date DESC', async () => {
      testDb.prepare("INSERT INTO financial_period (period_name, period_type, start_date, end_date) VALUES ('Q1', 'QUARTERLY', '2025-01-01', '2025-03-31')").run()
      testDb.prepare("INSERT INTO financial_period (period_name, period_type, start_date, end_date) VALUES ('Q2', 'QUARTERLY', '2025-04-01', '2025-06-30')").run()

      const periods = await svc.getFinancialPeriods()
      expect(periods.length).toBe(2)
      expect(periods[0].period_name).toBe('Q2')
    })
  })

  /* ---- runDepreciation ---- */
  describe('runDepreciation', () => {
    it('calculates straight-line depreciation', async () => {
      const catId = seedCategory('STRAIGHT_LINE', 5) // 20%/yr
      const periodId = seedPeriod({ start: '2025-01-01', end: '2025-12-31' })
      const res = await svc.create({
        asset_name: 'Desk',
        category_id: catId,
        acquisition_date: '2025-01-01',
        acquisition_cost: 100000,
      }, 1)

      const result = await svc.runDepreciation(res.id, periodId, 1)
      expect(result.success).toBe(true)

      const row = testDb.prepare('SELECT current_value, accumulated_depreciation FROM fixed_asset WHERE id = ?').get(res.id) as Record<string, number>
      // 100000 * (1/5) * (365/365) = 20000
      expect(row.accumulated_depreciation).toBe(20000)
      expect(row.current_value).toBe(80000)

      // Depreciation record created
      const depRow = testDb.prepare('SELECT * FROM asset_depreciation WHERE asset_id = ?').get(res.id) as Record<string, number>
      expect(depRow.amount).toBe(20000)
      expect(depRow.book_value_before).toBe(100000)
      expect(depRow.book_value_after).toBe(80000)
    })

    it('calculates declining-balance depreciation', async () => {
      const catId = seedCategory('DECLINING_BALANCE', 5, 25) // 25% of current_value
      const periodId = seedPeriod({ start: '2025-01-01', end: '2025-12-31' })
      const res = await svc.create({
        asset_name: 'Vehicle',
        category_id: catId,
        acquisition_date: '2025-01-01',
        acquisition_cost: 200000,
      }, 1)

      const result = await svc.runDepreciation(res.id, periodId, 1)
      expect(result.success).toBe(true)

      const row = testDb.prepare('SELECT current_value FROM fixed_asset WHERE id = ?').get(res.id) as Record<string, number>
      // 200000 * 0.25 * (365/365) = 50000
      expect(row.current_value).toBe(150000)
    })

    it('prorates for partial period', async () => {
      const catId = seedCategory('STRAIGHT_LINE', 5) // 20%/yr
      // 90-day period ~ 90/365 proration
      const periodId = seedPeriod({ start: '2025-01-01', end: '2025-03-31' })
      const res = await svc.create({
        asset_name: 'Printer',
        category_id: catId,
        acquisition_date: '2025-01-01',
        acquisition_cost: 100000,
      }, 1)

      const result = await svc.runDepreciation(res.id, periodId, 1)
      expect(result.success).toBe(true)

      const dep = testDb.prepare('SELECT amount FROM asset_depreciation WHERE asset_id = ?').get(res.id) as { amount: number }
      // 100000 * 0.2 * (90/365) = 4931.5 → Math.round → 4932
      expect(dep.amount).toBe(4932)
    })

    it('caps depreciation at current_value', async () => {
      const catId = seedCategory('STRAIGHT_LINE', 1) // 100%/yr
      const periodId = seedPeriod({ start: '2025-01-01', end: '2025-12-31' })
      const res = await svc.create({
        asset_name: 'Low Value',
        category_id: catId,
        acquisition_date: '2025-01-01',
        acquisition_cost: 1000,
        accumulated_depreciation: 900,
      }, 1)

      const result = await svc.runDepreciation(res.id, periodId, 1)
      expect(result.success).toBe(true)

      const row = testDb.prepare('SELECT current_value FROM fixed_asset WHERE id = ?').get(res.id) as Record<string, number>
      expect(row.current_value).toBe(0) // Capped at remaining 100
    })

    it('rejects depreciation for fully depreciated asset', async () => {
      const catId = seedCategory()
      const res = await svc.create({
        asset_name: 'Zero',
        category_id: catId,
        acquisition_date: '2020-01-01',
        acquisition_cost: 10000,
        accumulated_depreciation: 10000,
      }, 1)

      const periodId = seedPeriod()
      const result = await svc.runDepreciation(res.id, periodId, 1)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Asset already fully depreciated')
    })

    it('rejects asset not found', async () => {
      const periodId = seedPeriod()
      const result = await svc.runDepreciation(9999, periodId, 1)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Asset not found')
    })

    it('rejects locked period', async () => {
      const catId = seedCategory()
      const res = await svc.create({
        asset_name: 'X',
        category_id: catId,
        acquisition_date: '2025-01-01',
        acquisition_cost: 10000,
      }, 1)
      const periodId = seedPeriod({ locked: true })

      const result = await svc.runDepreciation(res.id, periodId, 1)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Financial period is locked')
    })

    it('rejects duplicate depreciation for same period', async () => {
      const catId = seedCategory('STRAIGHT_LINE', 5)
      const periodId = seedPeriod({ start: '2025-01-01', end: '2025-12-31' })
      const res = await svc.create({
        asset_name: 'Dup',
        category_id: catId,
        acquisition_date: '2025-01-01',
        acquisition_cost: 50000,
      }, 1)

      await svc.runDepreciation(res.id, periodId, 1)
      const result = await svc.runDepreciation(res.id, periodId, 1)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Depreciation already posted for this period')
    })

    it('rejects non-depreciable category', async () => {
      const catId = seedCategory('NONE', 0)
      const periodId = seedPeriod({ start: '2025-01-01', end: '2025-12-31' })
      const res = await svc.create({
        asset_name: 'Land',
        category_id: catId,
        acquisition_date: '2025-01-01',
        acquisition_cost: 500000,
      }, 1)

      const result = await svc.runDepreciation(res.id, periodId, 1)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Selected asset category is non-depreciable')
    })

    it('creates GL journal entry on successful depreciation', async () => {
      const catId = seedCategory('STRAIGHT_LINE', 5)
      const periodId = seedPeriod({ start: '2025-01-01', end: '2025-12-31' })
      const res = await svc.create({
        asset_name: 'Table',
        category_id: catId,
        acquisition_date: '2025-01-01',
        acquisition_cost: 100000,
      }, 1)

      mockCreateJournalEntrySync.mockClear()
      await svc.runDepreciation(res.id, periodId, 1)

      // Should create depreciation journal entry
      expect(mockCreateJournalEntrySync).toHaveBeenCalledWith(
        expect.objectContaining({
          entry_type: 'DEPRECIATION',
          lines: expect.arrayContaining([
            expect.objectContaining({ gl_account_code: '5500', debit_amount: 20000 }),
            expect.objectContaining({ gl_account_code: '1510', credit_amount: 20000 }),
          ]),
        }),
      )
    })

    it('rejects when period is not found', async () => {
      const catId = seedCategory()
      const res = await svc.create({
        asset_name: 'X',
        category_id: catId,
        acquisition_date: '2025-01-01',
        acquisition_cost: 10000,
      }, 1)
      const result = await svc.runDepreciation(res.id, 9999, 1)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Financial period not found')
    })

    it('rejects zero depreciation rate', async () => {
      const catId = seedCategory('STRAIGHT_LINE', 0, 0)
      const periodId = seedPeriod({ start: '2025-01-01', end: '2025-12-31' })
      const res = await svc.create({
        asset_name: 'ZeroRate',
        category_id: catId,
        acquisition_date: '2025-01-01',
        acquisition_cost: 10000,
      }, 1)
      const result = await svc.runDepreciation(res.id, periodId, 1)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid depreciation setup')
    })
  })

  /* ---- update ---- */
  describe('update', () => {
    it('updates asset_name', async () => {
      const catId = seedCategory()
      const res = await svc.create({
        asset_name: 'Old Name',
        category_id: catId,
        acquisition_date: '2025-01-01',
        acquisition_cost: 5000,
      }, 1)
      await svc.update(res.id, { asset_name: 'New Name' }, 1)
      const row = testDb.prepare('SELECT asset_name FROM fixed_asset WHERE id = ?').get(res.id) as { asset_name: string }
      expect(row.asset_name).toBe('New Name')
    })

    it('updates location', async () => {
      const catId = seedCategory()
      const res = await svc.create({
        asset_name: 'Desk',
        category_id: catId,
        acquisition_date: '2025-01-01',
        acquisition_cost: 5000,
      }, 1)
      await svc.update(res.id, { location: 'Room 101' }, 1)
      const row = testDb.prepare('SELECT location FROM fixed_asset WHERE id = ?').get(res.id) as { location: string }
      expect(row.location).toBe('Room 101')
    })

    it('updates status', async () => {
      const catId = seedCategory()
      const res = await svc.create({
        asset_name: 'ToDispose',
        category_id: catId,
        acquisition_date: '2025-01-01',
        acquisition_cost: 5000,
      }, 1)
      await svc.update(res.id, { status: 'DISPOSED' }, 1)
      const row = testDb.prepare('SELECT status FROM fixed_asset WHERE id = ?').get(res.id) as { status: string }
      expect(row.status).toBe('DISPOSED')
    })

    it('updates category_id', async () => {
      const catId = seedCategory()
      testDb.prepare("INSERT INTO asset_category (category_name) VALUES ('Electronics')").run()
      const newCatId = testDb.prepare("SELECT id FROM asset_category WHERE category_name = 'Electronics'").get() as { id: number }
      const res = await svc.create({
        asset_name: 'Item',
        category_id: catId,
        acquisition_date: '2025-01-01',
        acquisition_cost: 5000,
      }, 1)
      await svc.update(res.id, { category_id: newCatId.id }, 1)
      const row = testDb.prepare('SELECT category_id FROM fixed_asset WHERE id = ?').get(res.id) as { category_id: number }
      expect(row.category_id).toBe(newCatId.id)
    })

    it('handles empty update data gracefully', async () => {
      const catId = seedCategory()
      const res = await svc.create({
        asset_name: 'NoChange',
        category_id: catId,
        acquisition_date: '2025-01-01',
        acquisition_cost: 5000,
      }, 1)
      await svc.update(res.id, {}, 1)
      const row = testDb.prepare('SELECT asset_name FROM fixed_asset WHERE id = ?').get(res.id) as { asset_name: string }
      expect(row.asset_name).toBe('NoChange')
    })
  })

  /* ---- create with legacy journal failure ---- */
  describe('create - legacy journal entry failure', () => {
    it('returns error when legacy depreciation journal entry fails', async () => {
      const catId = seedCategory()
      let callCount = 0
      mockCreateJournalEntrySync.mockImplementation(() => {
        callCount++
        if (callCount === 1) {return { success: true, id: 1 }}
        return { success: false, id: 0, error: 'GL error on legacy entry' }
      })

      const result = await svc.create({
        asset_name: 'Legacy Fail',
        category_id: catId,
        acquisition_date: '2020-01-01',
        acquisition_cost: 50000,
        accumulated_depreciation: 20000,
      }, 1)

      expect(result.success).toBe(false)
      expect(result.errors?.[0]).toContain('GL error on legacy entry')
    })
  })

  /* ---- runDepreciation – category not found ---- */
  describe('runDepreciation - category edge cases', () => {
    it('rejects when asset category not found', async () => {
      // Create asset with a category then delete the category
      const catId = seedCategory()
      const res = await svc.create({
        asset_name: 'Orphan Asset',
        category_id: catId,
        acquisition_date: '2025-01-01',
        acquisition_cost: 50000,
      }, 1)
      // Temporarily disable FK so we can orphan the category reference
      testDb.pragma('foreign_keys = OFF')
      testDb.prepare('DELETE FROM asset_category WHERE id = ?').run(catId)
      testDb.pragma('foreign_keys = ON')

      const periodId = seedPeriod({ start: '2025-01-01', end: '2025-12-31' })
      const result = await svc.runDepreciation(res.id, periodId, 1)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Asset category not found')
    })

    it('declining balance on partially depreciated asset uses current_value', async () => {
      const catId = seedCategory('DECLINING_BALANCE', 5, 20) // 20% rate
      const res = await svc.create({
        asset_name: 'Used Vehicle',
        category_id: catId,
        acquisition_date: '2023-01-01',
        acquisition_cost: 500000,
        accumulated_depreciation: 200000,
      }, 1)

      const periodId = seedPeriod({ start: '2025-01-01', end: '2025-12-31' })
      const result = await svc.runDepreciation(res.id, periodId, 1)
      expect(result.success).toBe(true)

      const row = testDb.prepare('SELECT current_value, accumulated_depreciation FROM fixed_asset WHERE id = ?').get(res.id) as { current_value: number; accumulated_depreciation: number }
      // Declining balance: 300000 * 0.20 * (365/365) = 60000
      expect(row.accumulated_depreciation).toBe(260000)
      expect(row.current_value).toBe(240000)
    })

    it('getDepreciationHistory returns depreciation records', async () => {
      const catId = seedCategory('STRAIGHT_LINE', 5)
      const periodId = seedPeriod({ start: '2025-01-01', end: '2025-12-31' })
      mockCreateJournalEntrySync.mockReturnValue({ success: true, id: 1 })
      const res = await svc.create({
        asset_name: 'History Asset',
        category_id: catId,
        acquisition_date: '2025-01-01',
        acquisition_cost: 100000,
      }, 1)
      await svc.runDepreciation(res.id, periodId, 1)

      const history = testDb.prepare(
        'SELECT * FROM asset_depreciation WHERE asset_id = ?'
      ).all(res.id) as any[]
      expect(history.length).toBe(1)
      expect(history[0].amount).toBe(20000)
    })
  })

  /* ---- branch coverage: validateCreate missing acquisition_date ---- */
  describe('validateCreate – missing acquisition_date', () => {
    it('rejects asset creation with empty acquisition_date', async () => {
      mockCreateJournalEntrySync.mockReturnValue({ success: true, id: 1 })
      const catId = seedCategory()
      const result = await svc.create({
        asset_name: 'No Date Asset',
        category_id: catId,
        acquisition_date: '',
        acquisition_cost: 5000,
      }, 1)
      expect(result.success).toBe(false)
      expect(result.errors).toContain('Acquisition date is required')
    })
  })

  /* ---- branch coverage: runDepreciation when period is locked ---- */
  describe('runDepreciation – locked period', () => {
    it('rejects depreciation when financial period is locked', async () => {
      mockCreateJournalEntrySync.mockReturnValue({ success: true, id: 1 })
      const catId = seedCategory('STRAIGHT_LINE', 5)
      const periodId = seedPeriod({ start: '2025-01-01', end: '2025-12-31' })
      testDb.prepare('UPDATE financial_period SET is_locked = 1 WHERE id = ?').run(periodId)
      const res = await svc.create({
        asset_name: 'Locked Period Asset',
        category_id: catId,
        acquisition_date: '2025-01-01',
        acquisition_cost: 100000,
      }, 1)
      expect(res.success).toBe(true)
      const result = await svc.runDepreciation(res.id, periodId, 1)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Financial period is locked')
    })
  })

  /* ---- branch coverage: createSync acquisition journal failure ---- */
  describe('createSync – acquisition journal failure', () => {
    it('returns error when acquisition journal entry fails', async () => {
      mockCreateJournalEntrySync.mockReturnValue({ success: true, id: 1 })
      mockCreateJournalEntrySync.mockReturnValueOnce({ success: false, error: 'GL acquisition error' })
      const catId = seedCategory()
      const result = await svc.create({
        asset_name: 'Fail Acquisition',
        category_id: catId,
        acquisition_date: '2025-01-01',
        acquisition_cost: 50000,
      }, 1)
      expect(result.success).toBe(false)
      expect(result.errors?.[0]).toContain('GL acquisition error')
    })
  })

  /* ---- branch coverage: acquisition journal failure without error message (L149) ---- */
  describe('createSync – acquisition journal failure without error message', () => {
    it('uses fallback error when journal returns success:false with no error field', async () => {
      mockCreateJournalEntrySync.mockReturnValueOnce({ success: false })
      const catId = seedCategory()
      const result = await svc.create({
        asset_name: 'No Error Field',
        category_id: catId,
        acquisition_date: '2025-01-01',
        acquisition_cost: 30000,
      }, 1)
      expect(result.success).toBe(false)
      expect(result.errors?.[0]).toBe('Failed to create acquisition journal entry')
    })
  })

  /* ---- branch coverage: legacy depreciation journal failure without error (L176) ---- */
  describe('createSync – legacy depreciation journal failure without error', () => {
    it('uses fallback error when legacy journal entry fails with no error field', async () => {
      // First call (acquisition) succeeds, second call (legacy) fails without error
      mockCreateJournalEntrySync
        .mockReturnValueOnce({ success: true, id: 1 })
        .mockReturnValueOnce({ success: false })
      const catId = seedCategory()
      const result = await svc.create({
        asset_name: 'Legacy Fail',
        category_id: catId,
        acquisition_date: '2025-01-01',
        acquisition_cost: 100000,
        accumulated_depreciation: 20000,
      }, 1)
      expect(result.success).toBe(false)
      expect(result.errors?.[0]).toBe('Failed to create legacy depreciation adjustment')
    })
  })

  /* ---- branch coverage: catch block with non-Error throw (L187) ---- */
  describe('createSync – non-Error throw', () => {
    it('returns Unknown error when a non-Error is thrown', async () => {
      mockCreateJournalEntrySync.mockImplementationOnce(() => {
        throw 'string-error' // NOSONAR
      })
      const catId = seedCategory()
      const result = await svc.create({
        asset_name: 'Throw String',
        category_id: catId,
        acquisition_date: '2025-01-01',
        acquisition_cost: 10000,
      }, 1)
      expect(result.success).toBe(false)
      expect(result.errors?.[0]).toBe('Unknown error')
    })
  })

  /* ---- branch coverage: applyFilters with category_id (L234) ---- */
  describe('findAll – category_id filter', () => {
    it('filters assets by category_id', async () => {
      const cat1 = seedCategory()
      // Create a second category with different name
      const cat2 = testDb.prepare(`INSERT INTO asset_category (category_name, depreciation_method, useful_life_years) VALUES ('Vehicles', 'STRAIGHT_LINE', 10)`).run().lastInsertRowid as number

      await svc.create({ asset_name: 'Desk A', category_id: cat1, acquisition_date: '2025-01-01', acquisition_cost: 5000 }, 1)
      await svc.create({ asset_name: 'Car B', category_id: cat2, acquisition_date: '2025-01-01', acquisition_cost: 50000 }, 1)

      const filtered = await svc.findAll({ category_id: cat1 })
      expect(filtered.length).toBe(1)
      expect(filtered[0].asset_name).toBe('Desk A')
    })
  })

  /* ---- branch coverage: runDepreciation with null depreciation_rate → useful_life_years path (L301) ---- */
  describe('runDepreciation – null depreciation_rate', () => {
    it('uses useful_life_years when depreciation_rate is null', async () => {
      // seedCategory defaults to null rate, 5-year useful life → 20% = 1/5
      const catId = seedCategory('STRAIGHT_LINE', 10, null) // 10 years, null rate → 10%
      const periodId = seedPeriod({ start: '2025-01-01', end: '2025-12-31' })
      const res = await svc.create({
        asset_name: 'Null Rate Asset',
        category_id: catId,
        acquisition_date: '2025-01-01',
        acquisition_cost: 200000,
      }, 1)

      const result = await svc.runDepreciation(res.id, periodId, 1)
      expect(result.success).toBe(true)

      const row = testDb.prepare('SELECT accumulated_depreciation FROM fixed_asset WHERE id = ?').get(res.id) as { accumulated_depreciation: number }
      // 200000 * (1/10) * (365/365) = 20000
      expect(row.accumulated_depreciation).toBe(20000)
    })
  })

  /* ---- branch coverage: runDepreciation depreciationAmount <= 0 (L322) ---- */
  describe('runDepreciation – zero depreciation from tiny rate and short period', () => {
    it('returns error when calculated depreciation rounds to zero', async () => {
      // Very long useful life (1000 years) + 1-day period → amount rounds to 0
      const catId = testDb.prepare(`INSERT INTO asset_category (category_name, depreciation_method, useful_life_years) VALUES ('MicroDep', 'STRAIGHT_LINE', 1000)`).run().lastInsertRowid as number
      const res = await svc.create({
        asset_name: 'Tiny Depreciation',
        category_id: catId,
        acquisition_date: '2025-01-01',
        acquisition_cost: 1000,
      }, 1)

      const periodId = seedPeriod({ start: '2025-01-01', end: '2025-01-01' }) // 1-day period
      const result = await svc.runDepreciation(res.id, periodId, 1)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Calculated depreciation amount is zero')
    })
  })
})
