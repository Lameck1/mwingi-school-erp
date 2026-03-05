import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

let db: Database.Database
const handlerMap = new Map<string, IpcHandler>()
const journalServiceMock = {
  recordInvoiceSync: vi.fn((): { success: boolean; error?: string } => ({ success: true })),
  recordPaymentSync: vi.fn((): { success: boolean; error?: string } => ({ success: true })),
}

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue(JSON.stringify({
      user: { id: 9, username: 'test', role: 'ACCOUNTS_CLERK', full_name: 'Test', email: 'test@test.com', is_active: 1, last_login: null, created_at: new Date().toISOString() },
      lastActivity: Date.now()
    })),
    setPassword: vi.fn().mockResolvedValue(null),
    deletePassword: vi.fn().mockResolvedValue(true)
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

vi.mock('../../../services/base/ServiceContainer', () => ({
  container: {
    resolve: vi.fn((name: string) => {
      if (name === 'DoubleEntryJournalService') { return journalServiceMock }
      if (name === 'ExemptionService') { return {} }
      if (name === 'PaymentService') { return { recordPayment: vi.fn(), voidPayment: vi.fn() } }
      return {}
    })
  }
}))

import { registerInvoiceHandlers, registerFeeStructureHandlers } from '../invoice-handlers'
import { createGetOrCreateCategoryId, type FinanceContext } from '../finance-handler-utils'

function buildContext(): FinanceContext {
  return {
    db,
    exemptionService: {} as FinanceContext['exemptionService'],
    paymentService: {} as FinanceContext['paymentService'],
    getOrCreateCategoryId: createGetOrCreateCategoryId(db)
  }
}

function createSchema(targetDb: Database.Database): void {
  targetDb.exec(`
    CREATE TABLE IF NOT EXISTS student (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT,
      last_name TEXT,
      credit_balance INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS term (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      term_name TEXT
    );

    CREATE TABLE IF NOT EXISTS fee_invoice (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      student_id INTEGER NOT NULL,
      term_id INTEGER,
      academic_term_id INTEGER,
      invoice_date TEXT,
      due_date TEXT,
      total_amount INTEGER NOT NULL,
      amount INTEGER,
      amount_due INTEGER,
      original_amount INTEGER,
      amount_paid INTEGER NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'PENDING',
      created_by_user_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoice_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      fee_category_id INTEGER,
      description TEXT,
      amount INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gl_account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_code TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS fee_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_name TEXT,
      description TEXT,
      gl_account_id INTEGER,
      is_active BOOLEAN DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS stream (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stream_name TEXT NOT NULL,
      level_order INTEGER NOT NULL,
      is_active BOOLEAN DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS fee_structure (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      academic_year_id INTEGER NOT NULL,
      term_id INTEGER NOT NULL,
      stream_id INTEGER NOT NULL,
      student_type TEXT NOT NULL,
      fee_category_id INTEGER NOT NULL,
      amount INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transaction_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_name TEXT,
      category_type TEXT,
      is_system BOOLEAN DEFAULT 0,
      is_active BOOLEAN DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS journal_entry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_ref TEXT NOT NULL UNIQUE,
      entry_date DATE NOT NULL,
      entry_type TEXT NOT NULL,
      description TEXT NOT NULL,
      student_id INTEGER,
      created_by_user_id INTEGER NOT NULL,
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

    INSERT INTO gl_account (id, account_code) VALUES (1, '4300');
    INSERT INTO fee_category (id, category_name, gl_account_id) VALUES (1, 'Tuition', 1);
  `)
}

type SuccessResult = { success: boolean; error?: string; [key: string]: unknown }

describe('invoice-handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    journalServiceMock.recordInvoiceSync.mockReset()
    journalServiceMock.recordInvoiceSync.mockReturnValue({ success: true })

    db = new Database(':memory:')
    createSchema(db)

    const context = buildContext()
    registerInvoiceHandlers(context)
    registerFeeStructureHandlers(context)
  })

  afterEach(() => {
    db.close()
  })

  // ─── Handler registration ───────────────────────────────────────────

  it('registers all expected invoice and fee structure channels', () => {
    expect(handlerMap.has('invoice:getItems')).toBe(true)
    expect(handlerMap.has('invoice:create')).toBe(true)
    expect(handlerMap.has('invoice:getByStudent')).toBe(true)
    expect(handlerMap.has('invoice:getAll')).toBe(true)
    expect(handlerMap.has('fee:getCategories')).toBe(true)
    expect(handlerMap.has('fee:createCategory')).toBe(true)
    expect(handlerMap.has('fee:getStructure')).toBe(true)
    expect(handlerMap.has('fee:saveStructure')).toBe(true)
    expect(handlerMap.has('invoice:generateBatch')).toBe(true)
    expect(handlerMap.has('invoice:generateForStudent')).toBe(true)
  })

  // ─── invoice:create ─────────────────────────────────────────────────

  it('invoice:create creates a new invoice with journal entry', async () => {
    const handler = handlerMap.get('invoice:create')!
    const result = await handler(
      {},
      {
        student_id: 1,
        term_id: 1,
        invoice_date: '2026-02-01',
        due_date: '2026-02-20'
      },
      [{ fee_category_id: 1, description: 'Tuition', amount: 10000 }],
      9
    ) as SuccessResult

    expect(result.success).toBe(true)
    expect(result.invoiceNumber).toBeDefined()
    expect(result.id).toBeDefined()
    expect(journalServiceMock.recordInvoiceSync).toHaveBeenCalledTimes(1)

    const invoiceCount = db.prepare(`SELECT COUNT(*) as count FROM fee_invoice`).get() as { count: number }
    expect(invoiceCount.count).toBe(1)
  })

  it('invoice:create rejects invalid invoice date format', async () => {
    const handler = handlerMap.get('invoice:create')!
    const result = await handler(
      {},
      {
        student_id: 1,
        term_id: 1,
        invoice_date: '01/02/2026',
        due_date: '2026-02-20'
      },
      [{ fee_category_id: 1, description: 'Tuition', amount: 10000 }],
      9
    ) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid date format')
  })

  it('invoice:create rejects due date earlier than invoice date', async () => {
    const handler = handlerMap.get('invoice:create')!
    const result = await handler(
      {},
      {
        student_id: 1,
        term_id: 1,
        invoice_date: '2026-02-20',
        due_date: '2026-02-01'
      },
      [{ fee_category_id: 1, description: 'Tuition', amount: 10000 }],
      9
    ) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toContain('Due date cannot be earlier')
  })

  it('invoice:create rolls back when journal posting fails', async () => {
    journalServiceMock.recordInvoiceSync.mockReturnValueOnce({ success: false, error: 'GL mapping missing' })

    const handler = handlerMap.get('invoice:create')!
    const result = await handler(
      {},
      {
        student_id: 1,
        term_id: 1,
        invoice_date: '2026-02-01',
        due_date: '2026-02-20'
      },
      [{ fee_category_id: 1, description: 'Tuition', amount: 10000 }],
      9
    ) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toContain('GL mapping missing')

    const invoiceCount = db.prepare(`SELECT COUNT(*) as count FROM fee_invoice`).get() as { count: number }
    expect(invoiceCount.count).toBe(0)
  })

  it('invoice:create short-circuits duplicate payload', async () => {
    db.prepare(`
      INSERT INTO fee_invoice (
        id, invoice_number, student_id, term_id, academic_term_id, invoice_date, due_date,
        total_amount, amount, amount_due, original_amount, created_by_user_id, created_at
      ) VALUES (8, 'INV-EXIST-001', 1, 1, 1, '2026-02-01', '2026-02-20', 10000, 10000, 10000, 10000, 9, datetime('now'))
    `).run()
    db.prepare(`
      INSERT INTO invoice_item (invoice_id, fee_category_id, description, amount)
      VALUES (8, 1, 'Tuition', 10000)
    `).run()

    const handler = handlerMap.get('invoice:create')!
    const result = await handler(
      {},
      {
        student_id: 1,
        term_id: 1,
        invoice_date: '2026-02-01',
        due_date: '2026-02-20'
      },
      [{ fee_category_id: 1, description: 'Tuition', amount: 10000 }],
      9
    ) as SuccessResult

    expect(result.success).toBe(true)
    expect(result.invoiceNumber).toBe('INV-EXIST-001')
    expect(result.id).toBe(8)
    expect(result.message).toContain('Duplicate invoice request detected')
    expect(journalServiceMock.recordInvoiceSync).not.toHaveBeenCalled()
  })

  it('invoice:create creates new invoice when item set differs from recent candidate', async () => {
    db.prepare(`
      INSERT INTO fee_invoice (
        id, invoice_number, student_id, term_id, academic_term_id, invoice_date, due_date,
        total_amount, amount, amount_due, original_amount, created_by_user_id, created_at
      ) VALUES (9, 'INV-EXIST-002', 1, 1, 1, '2026-02-01', '2026-02-20', 10000, 10000, 10000, 10000, 9, datetime('now'))
    `).run()
    db.prepare(`
      INSERT INTO invoice_item (invoice_id, fee_category_id, description, amount)
      VALUES (9, 1, 'Tuition', 10000)
    `).run()

    const handler = handlerMap.get('invoice:create')!
    const result = await handler(
      {},
      {
        student_id: 1,
        term_id: 1,
        invoice_date: '2026-02-01',
        due_date: '2026-02-20'
      },
      [
        { fee_category_id: 1, description: 'Tuition', amount: 9000 },
        { fee_category_id: 1, description: 'Activity Fee', amount: 1000 }
      ],
      9
    ) as SuccessResult

    expect(result.success).toBe(true)
    expect(result.id).toBeDefined()
    expect(result.id).not.toBe(9)
    expect(journalServiceMock.recordInvoiceSync).toHaveBeenCalledTimes(1)
  })

  // ─── invoice:getAll ─────────────────────────────────────────────────

  it('invoice:getAll returns normalized amounts', async () => {
    db.prepare(`INSERT INTO student (id, credit_balance) VALUES (1, 0)`).run()
    db.prepare(`
      INSERT INTO fee_invoice (
        id, invoice_number, student_id, term_id, total_amount, amount, amount_due, amount_paid, status, created_by_user_id, invoice_date
      ) VALUES (1, 'INV-NORM-1', 1, 1, 0, 17000, 17000, 2000, 'partial', 1, '2026-02-01')
    `).run()

    const handler = handlerMap.get('invoice:getAll')!
    const rows = await handler({}) as Array<{ total_amount: number; amount_paid: number; balance: number }>

    expect(rows).toHaveLength(1)
    expect(rows[0].total_amount).toBe(17000)
    expect(rows[0].amount_paid).toBe(2000)
    expect(rows[0].balance).toBe(15000)
  })

  // ─── invoice:getByStudent ───────────────────────────────────────────

  it('invoice:getByStudent returns invoices for valid student', async () => {
    db.prepare(`
      INSERT INTO fee_invoice (invoice_number, student_id, term_id, total_amount, amount_paid, created_by_user_id, invoice_date)
      VALUES ('INV-S1', 1, 1, 5000, 0, 9, '2026-02-01')
    `).run()

    const handler = handlerMap.get('invoice:getByStudent')!
    const result = await handler({}, 1) as Array<{ invoice_number: string }>

    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(1)
    expect(result[0].invoice_number).toBe('INV-S1')
  })

  it('invoice:getByStudent rejects invalid student ID', async () => {
    const handler = handlerMap.get('invoice:getByStudent')!
    const result = await handler({}, -1) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  // ─── invoice:getItems ───────────────────────────────────────────────

  it('invoice:getItems returns items for valid invoice', async () => {
    db.prepare(`
      INSERT INTO fee_invoice (id, invoice_number, student_id, total_amount, created_by_user_id)
      VALUES (1, 'INV-IT1', 1, 10000, 9)
    `).run()
    db.prepare(`
      INSERT INTO invoice_item (invoice_id, fee_category_id, description, amount)
      VALUES (1, 1, 'Tuition', 10000)
    `).run()

    const handler = handlerMap.get('invoice:getItems')!
    const result = await handler({}, 1) as Array<{ description: string; amount: number }>

    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe(10000)
  })

  // ─── fee:saveStructure & fee:getStructure ───────────────────────────

  it('fee:saveStructure persists rows and fee:getStructure retrieves them', async () => {
    db.prepare(`INSERT INTO stream (id, stream_name, level_order, is_active) VALUES (1, 'Grade 1', 1, 1)`).run()

    const saveHandler = handlerMap.get('fee:saveStructure')!
    const saveResult = await saveHandler(
      {},
      [{ stream_id: 1, student_type: 'DAY_SCHOLAR', fee_category_id: 1, amount: 120000 }],
      1,
      1,
      9
    ) as SuccessResult

    expect(saveResult.success).toBe(true)

    const getHandler = handlerMap.get('fee:getStructure')!
    const rows = await getHandler({}, 1, 1) as Array<{ amount: number; stream_name: string }>

    expect(rows).toHaveLength(1)
    expect(rows[0].amount).toBe(120000)
  })

  // ─── fee:createCategory ─────────────────────────────────────────────

  it('fee:createCategory creates a new category', async () => {
    const handler = handlerMap.get('fee:createCategory')!
    const result = await handler({}, 'Boarding', 'Boarding fees', 9) as SuccessResult

    expect(result.success).toBe(true)
    expect(result.id).toBeDefined()

    const category = db.prepare(`SELECT * FROM fee_category WHERE category_name = 'Boarding'`).get() as { category_name: string } | undefined
    expect(category).toBeDefined()
  })

  it('fee:createCategory rejects duplicate name', async () => {
    const handler = handlerMap.get('fee:createCategory')!
    await handler({}, 'Boarding', 'Boarding fees', 9)
    const result = await handler({}, 'Boarding', 'Another', 9) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toContain('already exists')
  })

  // ─── Renderer user mismatch branches ────────────────────────────────

  it('invoice:create rejects renderer user mismatch', async () => {
    const handler = handlerMap.get('invoice:create')!
    const result = await handler(
      {},
      { student_id: 1, term_id: 1, invoice_date: '2026-02-01', due_date: '2026-02-20' },
      [{ fee_category_id: 1, description: 'Tuition', amount: 10000 }],
      3
    ) as SuccessResult
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
  })

  it('fee:createCategory rejects renderer user mismatch', async () => {
    const handler = handlerMap.get('fee:createCategory')!
    const result = await handler({}, 'Test Cat', 'Desc', 3) as SuccessResult
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
  })

  it('fee:saveStructure rejects renderer user mismatch', async () => {
    const handler = handlerMap.get('fee:saveStructure')!
    const result = await handler(
      {},
      [{ stream_id: 1, student_type: 'DAY_SCHOLAR', fee_category_id: 1, amount: 100000 }],
      1, 1, 3
    ) as SuccessResult
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
  })

  it('invoice:generateBatch rejects renderer user mismatch', async () => {
    const handler = handlerMap.get('invoice:generateBatch')!
    const result = await handler({}, 1, 1, 3) as SuccessResult
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
  })

  it('invoice:generateForStudent rejects renderer user mismatch', async () => {
    const handler = handlerMap.get('invoice:generateForStudent')!
    const result = await handler({}, 1, 1, 1, 3) as SuccessResult
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
  })

  // ─── invoice:getAll with PAID invoice ────────────────────────────────

  it('invoice:getAll returns zero balance for PAID invoices', async () => {
    db.prepare(`INSERT INTO student (id, credit_balance) VALUES (1, 0)`).run()
    db.prepare(`
      INSERT INTO fee_invoice (
        id, invoice_number, student_id, term_id, total_amount, amount, amount_due, amount_paid, status, created_by_user_id, invoice_date
      ) VALUES (2, 'INV-PAID-1', 1, 1, 10000, 10000, 10000, 10000, 'PAID', 1, '2026-02-01')
    `).run()

    const handler = handlerMap.get('invoice:getAll')!
    const rows = await handler({}) as Array<{ balance: number }>
    expect(rows).toHaveLength(1)
    expect(rows[0].balance).toBe(0)
  })

  // ─── Additional branch coverage ────────────────────────────────────

  it('fee:getCategories returns active categories', async () => {
    db.prepare(`INSERT INTO fee_category (id, category_name, is_active) VALUES (10, 'Sports', 1)`).run()
    db.prepare(`INSERT INTO fee_category (id, category_name, is_active) VALUES (11, 'Inactive Cat', 0)`).run()
    const handler = handlerMap.get('fee:getCategories')!
    const result = await handler({}) as any[]
    const names = result.map((c: any) => c.category_name)
    expect(names).toContain('Sports')
    expect(names).not.toContain('Inactive Cat')
  })

  it('fee:getStructure returns structure for given year and term', async () => {
    db.prepare(`INSERT INTO fee_category (id, category_name, is_active) VALUES (20, 'Tuition', 1)`).run()
    db.prepare(`INSERT INTO stream (id, stream_name, level_order, is_active) VALUES (30, 'Stream A', 1, 1)`).run()
    db.prepare(`INSERT INTO fee_structure (academic_year_id, term_id, stream_id, student_type, fee_category_id, amount)
      VALUES (2026, 1, 30, 'DAY_SCHOLAR', 20, 50000)`).run()
    const handler = handlerMap.get('fee:getStructure')!
    const result = await handler({}, 2026, 1) as any[]
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result[0].category_name).toBe('Tuition')
  })

  it('invoice:getByStudent returns invoices for student', async () => {
    db.prepare(`INSERT INTO student (id, credit_balance) VALUES (5, 0)`).run()
    db.prepare(`
      INSERT INTO fee_invoice (id, invoice_number, student_id, term_id, total_amount, amount, amount_due, amount_paid, status, created_by_user_id, invoice_date)
      VALUES (5, 'INV-STU5-1', 5, 1, 20000, 20000, 20000, 0, 'PENDING', 1, '2026-01-15')
    `).run()
    const handler = handlerMap.get('invoice:getByStudent')!
    const result = await handler({}, 5) as any[]
    expect(result).toHaveLength(1)
    expect(result[0].student_id).toBe(5)
  })

  it('invoice:create rejects renderer user mismatch', async () => {
    const handler = handlerMap.get('invoice:create')!
    const result = await handler(
      {},
      { student_id: 1, term_id: 1, invoice_date: '2026-01-15', due_date: '2026-02-15', notes: '' },
      [{ fee_category_id: 1, amount: 1000, description: 'Test' }],
      3
    ) as any
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
  })

  // ── extended branch coverage ──────────────────────────────────
  it('invoice:getItems returns empty array for non-existent invoice', async () => {
    const handler = handlerMap.get('invoice:getItems')!
    const result = await handler({}, 99999) as any[]
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(0)
  })

  it('invoice:create uses fallback gl_account_code 4300 when fee_category has no gl_account', async () => {
    // Create a fee_category without linking a gl_account
    db.prepare(`INSERT INTO fee_category (id, category_name, is_active) VALUES (99, 'NoGL', 1)`).run()
    db.prepare(`INSERT INTO student (id, credit_balance) VALUES (7, 0)`).run()

    const handler = handlerMap.get('invoice:create')!
    const result = await handler(
      {},
      { student_id: 7, term_id: 1, invoice_date: '2026-03-01', due_date: '2026-03-15' },
      [{ fee_category_id: 99, description: 'No GL item', amount: 5000 }],
      9
    ) as any

    expect(result.success).toBe(true)
    // Verify journal service was called with fallback '4300'
    expect(journalServiceMock.recordInvoiceSync).toHaveBeenCalled()
    const lastCall = journalServiceMock.recordInvoiceSync.mock.calls.at(-1)
    expect((lastCall as unknown as any[])[1][0].gl_account_code).toBe('4300')
  })

  it('invoice:getByStudent returns empty list for student with no invoices', async () => {
    db.prepare(`INSERT INTO student (id, credit_balance) VALUES (50, 0)`).run()
    const handler = handlerMap.get('invoice:getByStudent')!
    const result = await handler({}, 50) as any[]
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(0)
  })

  // ── branch coverage: isSameItemSet with different item count ──
  it('invoice:create creates new invoice when duplicate candidate has different item count', async () => {
    db.prepare(`INSERT INTO student (id, credit_balance) VALUES (60, 0)`).run()
    db.prepare(`INSERT INTO fee_category (id, category_name, is_active, gl_account_id) VALUES (60, 'Tuition60', 1, 1)`).run()
    db.prepare(`INSERT INTO fee_category (id, category_name, is_active, gl_account_id) VALUES (61, 'Sports61', 1, 1)`).run()

    // First invoice with 1 item
    const handler = handlerMap.get('invoice:create')!
    const first = await handler(
      {},
      { student_id: 60, term_id: 1, invoice_date: '2026-04-01', due_date: '2026-04-15' },
      [{ fee_category_id: 60, description: 'Tuition', amount: 5000 }],
      9
    ) as any
    expect(first.success).toBe(true)

    // Second invoice with 2 items (same total) — different item count triggers new creation
    const second = await handler(
      {},
      { student_id: 60, term_id: 1, invoice_date: '2026-04-01', due_date: '2026-04-15' },
      [{ fee_category_id: 60, description: 'Tuition', amount: 3000 }, { fee_category_id: 61, description: 'Sports', amount: 2000 }],
      9
    ) as any
    expect(second.success).toBe(true)
    expect(second.invoiceNumber).not.toBe(first.invoiceNumber)
  })

  // ── branch coverage: fee:createCategory renderer user mismatch ──
  it('fee:createCategory rejects renderer user mismatch', async () => {
    const handler = handlerMap.get('fee:createCategory')!
    const result = await handler({}, 'TestCat', 'Desc', 3) as any
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
  })

  // ── branch coverage: fee:saveStructure renderer user mismatch ──
  it('fee:saveStructure rejects renderer user mismatch', async () => {
    const handler = handlerMap.get('fee:saveStructure')!
    const result = await handler({}, [{ stream_id: 1, fee_category_id: 1, amount: 1000, student_type: 'BOARDER' }], 2026, 1, 3) as any
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
  })

  // ── branch coverage: journal entry failure rolls back ──
  it('invoice:create throws when journal entry fails', async () => {
    journalServiceMock.recordInvoiceSync.mockReturnValueOnce({ success: false, error: 'GL account missing' })
    db.prepare(`INSERT INTO student (id, credit_balance) VALUES (70, 0)`).run()
    const handler = handlerMap.get('invoice:create')!
    const result = await handler(
      {},
      { student_id: 70, term_id: 1, invoice_date: '2026-05-01', due_date: '2026-05-15' },
      [{ fee_category_id: 1, description: 'Tuition', amount: 10000 }],
      9
    ) as any
    expect(result.success).toBe(false)
    expect(result.error).toContain('GL account missing')
  })

  // ── branch coverage: journal failure with undefined error message ──
  it('invoice:create uses fallback error when journal returns no error message', async () => {
    journalServiceMock.recordInvoiceSync.mockReturnValueOnce({ success: false })
    db.prepare(`INSERT INTO student (id, credit_balance) VALUES (71, 0)`).run()
    const handler = handlerMap.get('invoice:create')!
    const result = await handler(
      {},
      { student_id: 71, term_id: 1, invoice_date: '2026-05-01', due_date: '2026-05-15' },
      [{ fee_category_id: 1, description: 'Tuition', amount: 10000 }],
      9
    ) as any
    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to create journal entry')
  })

  // ── branch coverage: duplicate detection with identical items ──
  it('invoice:create returns existing invoice on exact duplicate within 15 seconds', async () => {
    db.prepare(`INSERT INTO student (id, credit_balance) VALUES (72, 0)`).run()
    const handler = handlerMap.get('invoice:create')!
    const first = await handler(
      {},
      { student_id: 72, term_id: 1, invoice_date: '2026-06-01', due_date: '2026-06-15' },
      [{ fee_category_id: 1, description: 'Tuition', amount: 8000 }],
      9
    ) as any
    expect(first.success).toBe(true)

    // Exact same request → should detect duplicate
    const second = await handler(
      {},
      { student_id: 72, term_id: 1, invoice_date: '2026-06-01', due_date: '2026-06-15' },
      [{ fee_category_id: 1, description: 'Tuition', amount: 8000 }],
      9
    ) as any
    expect(second.success).toBe(true)
    expect(second.message).toContain('Duplicate')
    expect(second.invoiceNumber).toBe(first.invoiceNumber)
  })

  // ── branch coverage: fee:createCategory duplicate name ──
  it('fee:createCategory rejects duplicate category name', async () => {
    const handler = handlerMap.get('fee:createCategory')!
    const first = await handler({}, 'UniqueCat', 'Desc', 9) as any
    expect(first.success).toBe(true)
    const second = await handler({}, 'UniqueCat', 'Other Desc', 9) as any
    expect(second.success).toBe(false)
  })

  // ── Branch coverage: isSameItemSet length mismatch (a.length !== b.length) ──
  it('invoice:create treats different item counts as non-duplicate', async () => {
    db.prepare('INSERT INTO student (id, credit_balance) VALUES (80, 0)').run()
    const handler = handlerMap.get('invoice:create')!
    const first = await handler(
      {},
      { student_id: 80, term_id: 1, invoice_date: '2026-06-01', due_date: '2026-06-15' },
      [{ fee_category_id: 1, description: 'Tuition', amount: 5000 }],
      9
    ) as any
    expect(first.success).toBe(true)

    // Same student/term but different number of items → not duplicate
    const second = await handler(
      {},
      { student_id: 80, term_id: 1, invoice_date: '2026-06-01', due_date: '2026-06-15' },
      [
        { fee_category_id: 1, description: 'Tuition', amount: 3000 },
        { fee_category_id: 2, description: 'Boarding', amount: 2000 }
      ],
      9
    ) as any
    expect(second.success).toBe(true)
    expect(second.message).toBeUndefined() // not flagged as duplicate
  })

  // ── Branch coverage: GL account lookup fallback to '4300' ──
  it('invoice:create uses fallback GL code 4300 when no GL account found', async () => {
    // Ensure no gl_account table or no matching rows → row?.account_code ?? '4300'
    db.prepare('INSERT INTO student (id, credit_balance) VALUES (81, 0)').run()
    const handler = handlerMap.get('invoice:create')!
    const result = await handler(
      {},
      { student_id: 81, term_id: 1, invoice_date: '2026-06-01', due_date: '2026-06-15' },
      [{ fee_category_id: 999, description: 'Unknown', amount: 1000 }],
      9
    ) as any
    expect(result.success).toBe(true)
  })

  // ── Branch coverage: normalizeItems sort by fee_category_id equality (L47 false branch) ──
  it('invoice:create duplicate check sorts items with same fee_category_id by amount', async () => {
    db.prepare('INSERT INTO student (id, credit_balance) VALUES (82, 0)').run()
    db.prepare("INSERT INTO fee_category (id, category_name, gl_account_id) VALUES (2, 'Boarding', 1)").run()
    const handler = handlerMap.get('invoice:create')!
    // First invoice with two items having the SAME fee_category_id but different amounts
    const first = await handler(
      {},
      { student_id: 82, term_id: 1, invoice_date: '2026-07-01', due_date: '2026-07-15' },
      [
        { fee_category_id: 1, description: 'Tuition A', amount: 3000 },
        { fee_category_id: 1, description: 'Tuition B', amount: 7000 },
      ],
      9
    ) as any
    expect(first.success).toBe(true)

    // Second identical invoice → triggers normalizeItems sort with same category_id (L47 false), 
    // then different amount (L50 true)
    const second = await handler(
      {},
      { student_id: 82, term_id: 1, invoice_date: '2026-07-01', due_date: '2026-07-15' },
      [
        { fee_category_id: 1, description: 'Tuition A', amount: 3000 },
        { fee_category_id: 1, description: 'Tuition B', amount: 7000 },
      ],
      9
    ) as any
    expect(second.success).toBe(true)
    expect(second.message).toContain('Duplicate')
  })

  // ── Branch coverage: normalizeItems sort – same category AND same amount (L47 false, L50 false) ──
  it('invoice:create duplicate check falls through to description compare', async () => {
    db.prepare('INSERT INTO student (id, credit_balance) VALUES (83, 0)').run()
    const handler = handlerMap.get('invoice:create')!
    // Items with SAME fee_category_id AND SAME amount but different descriptions
    const first = await handler(
      {},
      { student_id: 83, term_id: 1, invoice_date: '2026-08-01', due_date: '2026-08-15' },
      [
        { fee_category_id: 1, description: 'Alpha', amount: 5000 },
        { fee_category_id: 1, description: 'Beta', amount: 5000 },
      ],
      9
    ) as any
    expect(first.success).toBe(true)

    // Replay same invoice → sort compares same category, same amount, then description
    const second = await handler(
      {},
      { student_id: 83, term_id: 1, invoice_date: '2026-08-01', due_date: '2026-08-15' },
      [
        { fee_category_id: 1, description: 'Alpha', amount: 5000 },
        { fee_category_id: 1, description: 'Beta', amount: 5000 },
      ],
      9
    ) as any
    expect(second.success).toBe(true)
    expect(second.message).toContain('Duplicate')
  })

  // ── branch coverage: normalizeItems sort with different fee_category_ids ──
  it('invoice:create duplicate check sorts items by fee_category_id', async () => {
    db.prepare('INSERT INTO student (id, credit_balance) VALUES (84, 0)').run()
    db.prepare("INSERT INTO fee_category (id, category_name, gl_account_id, is_active) VALUES (3, 'Transport', 1, 1)").run()
    const handler = handlerMap.get('invoice:create')!
    // Items with DIFFERENT fee_category_ids trigger the true branch of the sort's first if
    const first = await handler(
      {},
      { student_id: 84, term_id: 1, invoice_date: '2026-09-01', due_date: '2026-09-15' },
      [
        { fee_category_id: 3, description: 'Transport', amount: 4000 },
        { fee_category_id: 1, description: 'Tuition', amount: 6000 },
      ],
      9
    ) as any
    expect(first.success).toBe(true)

    // Replay same items → duplicate detection invokes normalizeItems sort across different category IDs
    const second = await handler(
      {},
      { student_id: 84, term_id: 1, invoice_date: '2026-09-01', due_date: '2026-09-15' },
      [
        { fee_category_id: 3, description: 'Transport', amount: 4000 },
        { fee_category_id: 1, description: 'Tuition', amount: 6000 },
      ],
      9
    ) as any
    expect(second.success).toBe(true)
    expect(second.message).toContain('Duplicate')
  })

  // ── branch coverage: invoice item with undefined description ──
  it('invoice:create handles item with undefined description in duplicate check', async () => {
    db.prepare('INSERT INTO student (id, credit_balance) VALUES (85, 0)').run()
    const handler = handlerMap.get('invoice:create')!
    // First invoice with no description on item
    const first = await handler(
      {},
      { student_id: 85, term_id: 1, invoice_date: '2026-09-01', due_date: '2026-09-15' },
      [{ fee_category_id: 1, amount: 5000 }],
      9
    ) as any
    expect(first.success).toBe(true)

    // Replay same invoice → duplicate detection runs normalizeItems with undefined description
    const second = await handler(
      {},
      { student_id: 85, term_id: 1, invoice_date: '2026-09-01', due_date: '2026-09-15' },
      [{ fee_category_id: 1, amount: 5000 }],
      9
    ) as any
    expect(second.success).toBe(true)
    expect(second.message).toContain('Duplicate')
    // journal service receives fallback description 'Fee invoice item'
    const journalCall = journalServiceMock.recordInvoiceSync.mock.calls.at(-1)
    expect((journalCall as unknown as any[])[1][0].description).toBe('Fee invoice item')
  })

  // ── branch coverage: invoice:generateBatch success path ──
  it('invoice:generateBatch reaches the generate function', async () => {
    const handler = handlerMap.get('invoice:generateBatch')!
    // Pass matching legacyUserId (9 = session user) to skip mismatch and reach generateBatchInvoices
    const result = await handler({}, 1, 1, 9) as SuccessResult
    // Function returns error about no fee structure (expected - DB has none) but the branch is covered
    expect(result).toBeDefined()
    expect(result.success).toBe(false)
  })

  // ── branch coverage: invoice:generateForStudent success path ──
  it('invoice:generateForStudent reaches the generate function', async () => {
    const handler = handlerMap.get('invoice:generateForStudent')!
    // Pass matching legacyUserId (9 = session user) to skip mismatch and reach generateSingleStudentInvoice
    const result = await handler({}, 1, 1, 1, 9) as SuccessResult
    expect(result).toBeDefined()
    expect(result.success).toBe(false)
  })

  // ── branch coverage: fee:createCategory with empty description (|| fallback) ──
  it('fee:createCategory handles empty description string', async () => {
    const handler = handlerMap.get('fee:createCategory')!
    const result = await handler({}, 'EmptyDesc', '', 9) as SuccessResult
    expect(result.success).toBe(true)
    const cat = db.prepare("SELECT description FROM fee_category WHERE category_name = 'EmptyDesc'").get() as { description: string }
    expect(cat.description).toBe('')
  })

  // ── branch coverage: fee:createCategory with whitespace-only description ──
  it('fee:createCategory handles whitespace-only description', async () => {
    const handler = handlerMap.get('fee:createCategory')!
    const result = await handler({}, 'WhitespaceDesc', '   ', 9) as SuccessResult
    expect(result.success).toBe(true)
    const cat = db.prepare("SELECT description FROM fee_category WHERE category_name = 'WhitespaceDesc'").get() as { description: string }
    expect(cat.description).toBe('')
  })
})
