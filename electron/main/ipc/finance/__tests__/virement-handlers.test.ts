import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

let db: Database.Database
const handlerMap = new Map<string, IpcHandler>()

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue(JSON.stringify({
      user: { id: 9, username: 'admin', role: 'ADMIN', full_name: 'Admin', email: 'admin@test.com', is_active: 1, last_login: null, created_at: new Date().toISOString() },
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

import { registerVirementHandlers } from '../virement-handlers'

function createSchema(targetDb: Database.Database): void {
  targetDb.exec(`
    CREATE TABLE IF NOT EXISTS fee_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_name TEXT,
      jss_account_type TEXT,
      gl_account_id INTEGER,
      is_active BOOLEAN DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS jss_virement_request (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_account_type TEXT NOT NULL,
      to_account_type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      requested_by_user_id INTEGER NOT NULL,
      reviewed_by_user_id INTEGER,
      reviewed_at TEXT,
      review_notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoice_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER,
      fee_category_id INTEGER,
      description TEXT,
      amount INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_item_allocation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_item_id INTEGER NOT NULL,
      applied_amount INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action_type TEXT,
      table_name TEXT,
      record_id INTEGER,
      old_values TEXT,
      new_values TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `)
}

type SuccessResult = { success: boolean; error?: string; data?: unknown; [key: string]: unknown }

describe('virement-handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    db = new Database(':memory:')
    createSchema(db)
    registerVirementHandlers()
  })

  afterEach(() => {
    db.close()
  })

  // ─── Handler registration ───────────────────────────────────────────

  it('registers all expected virement channels', () => {
    expect(handlerMap.has('virement:validateExpenditure')).toBe(true)
    expect(handlerMap.has('virement:request')).toBe(true)
    expect(handlerMap.has('virement:review')).toBe(true)
    expect(handlerMap.has('virement:getPendingRequests')).toBe(true)
    expect(handlerMap.has('virement:getAccountSummaries')).toBe(true)
  })

  // ─── virement:validateExpenditure ───────────────────────────────────

  it('virement:validateExpenditure allows same-account expenditure', async () => {
    db.prepare(`INSERT INTO fee_category (id, category_name, jss_account_type) VALUES (1, 'Tuition Fee', 'TUITION')`).run()

    const handler = handlerMap.get('virement:validateExpenditure')!
    const result = await handler({}, { expenseAccountType: 'TUITION', fundingCategoryId: 1 }) as SuccessResult

    expect(result.success).toBe(true)
    const data = result.data as { allowed: boolean }
    expect(data.allowed).toBe(true)
  })

  it('virement:validateExpenditure blocks cross-account expenditure', async () => {
    db.prepare(`INSERT INTO fee_category (id, category_name, jss_account_type) VALUES (1, 'Tuition Fee', 'TUITION')`).run()

    const handler = handlerMap.get('virement:validateExpenditure')!
    const result = await handler({}, { expenseAccountType: 'OPERATIONS', fundingCategoryId: 1 }) as SuccessResult

    expect(result.success).toBe(true)
    const data = result.data as { allowed: boolean; reason?: string }
    expect(data.allowed).toBe(false)
    expect(data.reason).toContain('Virement blocked')
  })

  // ─── virement:request ───────────────────────────────────────────────

  it('virement:request creates a virement request', async () => {
    const handler = handlerMap.get('virement:request')!
    const result = await handler({}, {
      fromAccount: 'TUITION',
      toAccount: 'OPERATIONS',
      amount: 50000,
      reason: 'Budget reallocation for equipment'
    }) as SuccessResult

    expect(result.success).toBe(true)
    expect(result.id).toBeDefined()

    const request = db.prepare('SELECT * FROM jss_virement_request WHERE id = ?').get(result.id) as { from_account_type: string; to_account_type: string; amount: number; status: string }
    expect(request.from_account_type).toBe('TUITION')
    expect(request.to_account_type).toBe('OPERATIONS')
    expect(request.amount).toBe(50000)
    expect(request.status).toBe('PENDING')
  })

  it('virement:request rejects same source and destination account', async () => {
    const handler = handlerMap.get('virement:request')!
    const result = await handler({}, {
      fromAccount: 'TUITION',
      toAccount: 'TUITION',
      amount: 50000,
      reason: 'Should fail'
    }) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toContain('Source and destination accounts must differ')
  })

  it('virement:request rejects invalid amount via schema', async () => {
    const handler = handlerMap.get('virement:request')!
    const result = await handler({}, {
      fromAccount: 'TUITION',
      toAccount: 'OPERATIONS',
      amount: -100,
      reason: 'Should fail'
    }) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  // ─── virement:review ───────────────────────────────────────────────

  it('virement:review approves a pending request', async () => {
    db.prepare(`
      INSERT INTO jss_virement_request (from_account_type, to_account_type, amount, reason, status, requested_by_user_id)
      VALUES ('TUITION', 'OPERATIONS', 50000, 'Equipment', 'PENDING', 5)
    `).run()

    const handler = handlerMap.get('virement:review')!
    const result = await handler({}, {
      requestId: 1,
      decision: 'APPROVED',
      reviewNotes: 'Approved by principal'
    }) as SuccessResult

    expect(result.success).toBe(true)

    const request = db.prepare('SELECT status, reviewed_by_user_id FROM jss_virement_request WHERE id = 1').get() as { status: string; reviewed_by_user_id: number }
    expect(request.status).toBe('APPROVED')
    expect(request.reviewed_by_user_id).toBe(9)
  })

  it('virement:review rejects non-existent request', async () => {
    const handler = handlerMap.get('virement:review')!
    const result = await handler({}, {
      requestId: 999,
      decision: 'APPROVED',
      reviewNotes: 'Should fail'
    }) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toContain('Virement request not found')
  })

  // ─── virement:getPendingRequests ────────────────────────────────────

  it('virement:getPendingRequests returns pending requests', async () => {
    db.exec(`
      INSERT INTO jss_virement_request (from_account_type, to_account_type, amount, reason, status, requested_by_user_id) VALUES
        ('TUITION', 'OPERATIONS', 10000, 'Reason 1', 'PENDING', 5),
        ('OPERATIONS', 'INFRASTRUCTURE', 20000, 'Reason 2', 'PENDING', 5),
        ('TUITION', 'INFRASTRUCTURE', 30000, 'Reason 3', 'APPROVED', 5);
    `)

    const handler = handlerMap.get('virement:getPendingRequests')!
    const result = await handler({}) as SuccessResult

    expect(result.success).toBe(true)
    const data = result.data as Array<{ status: string }>
    expect(data).toHaveLength(2)
    expect(data.every(r => r.status === 'PENDING')).toBe(true)
  })

  // ─── virement:getAccountSummaries ───────────────────────────────────

  it('virement:getAccountSummaries returns account summaries', async () => {
    db.prepare(`INSERT INTO fee_category (id, category_name, jss_account_type) VALUES (1, 'Tuition', 'TUITION')`).run()
    db.prepare(`INSERT INTO invoice_item (id, fee_category_id, amount) VALUES (1, 1, 10000)`).run()

    const handler = handlerMap.get('virement:getAccountSummaries')!
    const result = await handler({}) as SuccessResult

    expect(result.success).toBe(true)
    const data = result.data as Array<{ account_type: string; total_invoiced: number }>
    expect(Array.isArray(data)).toBe(true)
    expect(data).toHaveLength(1)
    expect(data[0].account_type).toBe('TUITION')
    expect(data[0].total_invoiced).toBe(10000)
  })

  // ─── Error catch branches ──────────────────────────────────────────

  it('virement:validateExpenditure catches service errors', async () => {
    db.exec('DROP TABLE fee_category')
    const handler = handlerMap.get('virement:validateExpenditure')!
    const result = await handler({}, { expenseAccountType: 'TUITION', fundingCategoryId: 1 }) as SuccessResult
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('virement:request catches service errors', async () => {
    db.exec('DROP TABLE jss_virement_request')
    const handler = handlerMap.get('virement:request')!
    const result = await handler({}, {
      fromAccount: 'TUITION', toAccount: 'OPERATIONS', amount: 50000, reason: 'Test'
    }) as SuccessResult
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('virement:review catches service errors', async () => {
    db.exec('DROP TABLE jss_virement_request')
    const handler = handlerMap.get('virement:review')!
    const result = await handler({}, {
      requestId: 1, decision: 'APPROVED', reviewNotes: 'Test'
    }) as SuccessResult
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('virement:getPendingRequests catches service errors', async () => {
    db.exec('DROP TABLE jss_virement_request')
    const handler = handlerMap.get('virement:getPendingRequests')!
    const result = await handler({}) as SuccessResult
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('virement:getAccountSummaries catches service errors', async () => {
    db.exec('DROP TABLE fee_category')
    const handler = handlerMap.get('virement:getAccountSummaries')!
    const result = await handler({}) as SuccessResult
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })
})
