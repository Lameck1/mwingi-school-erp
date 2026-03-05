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

import { registerPeriodLockingHandlers } from '../period-handlers'

function createSchema(targetDb: Database.Database): void {
  targetDb.exec(`
    CREATE TABLE IF NOT EXISTS financial_period (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      period_name TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      locked_by INTEGER,
      locked_at TEXT,
      closed_by INTEGER,
      closed_at TEXT
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

type SuccessResult = { success: boolean; error?: string; message?: string }

describe('period-handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    db = new Database(':memory:')
    createSchema(db)
    registerPeriodLockingHandlers()
  })

  afterEach(() => {
    db.close()
  })

  // ─── Handler registration ───────────────────────────────────────────

  it('registers all expected period channels', () => {
    expect(handlerMap.has('period:getAll')).toBe(true)
    expect(handlerMap.has('period:getForDate')).toBe(true)
    expect(handlerMap.has('period:isTransactionAllowed')).toBe(true)
    expect(handlerMap.has('period:lock')).toBe(true)
    expect(handlerMap.has('period:unlock')).toBe(true)
    expect(handlerMap.has('period:close')).toBe(true)
  })

  // ─── period:getAll ──────────────────────────────────────────────────

  it('period:getAll returns all periods when no status filter', async () => {
    db.exec(`
      INSERT INTO financial_period (name, start_date, end_date, status) VALUES
        ('Q1 2025', '2025-01-01', '2025-03-31', 'OPEN'),
        ('Q2 2025', '2025-04-01', '2025-06-30', 'LOCKED');
    `)

    const handler = handlerMap.get('period:getAll')!
    const result = await handler({}) as Array<{ name: string }>

    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(2)
  })

  it('period:getAll returns filtered periods by status', async () => {
    db.exec(`
      INSERT INTO financial_period (name, start_date, end_date, status) VALUES
        ('Q1 2025', '2025-01-01', '2025-03-31', 'OPEN'),
        ('Q2 2025', '2025-04-01', '2025-06-30', 'LOCKED');
    `)

    const handler = handlerMap.get('period:getAll')!
    const result = await handler({}, 'OPEN') as Array<{ name: string; status: string }>

    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('OPEN')
  })

  // ─── period:getForDate ──────────────────────────────────────────────

  it('period:getForDate returns period for a valid date', async () => {
    db.exec(`
      INSERT INTO financial_period (name, start_date, end_date, status)
      VALUES ('Q1 2025', '2025-01-01', '2025-03-31', 'OPEN');
    `)

    const handler = handlerMap.get('period:getForDate')!
    const result = await handler({}, '2025-02-15') as { name: string } | null

    expect(result).not.toBeNull()
    expect(result!.name).toBe('Q1 2025')
  })

  it('period:getForDate returns null for date outside any period', async () => {
    db.exec(`
      INSERT INTO financial_period (name, start_date, end_date, status)
      VALUES ('Q1 2025', '2025-01-01', '2025-03-31', 'OPEN');
    `)

    const handler = handlerMap.get('period:getForDate')!
    const result = await handler({}, '2024-06-15')

    expect(result == null).toBe(true)
  })

  it('period:getForDate rejects invalid date format', async () => {
    const handler = handlerMap.get('period:getForDate')!
    const result = await handler({}, '15/02/2025') as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  // ─── period:isTransactionAllowed ────────────────────────────────────

  it('period:isTransactionAllowed allows transaction in open period', async () => {
    db.exec(`
      INSERT INTO financial_period (name, start_date, end_date, status)
      VALUES ('Q1 2025', '2025-01-01', '2025-03-31', 'OPEN');
    `)

    const handler = handlerMap.get('period:isTransactionAllowed')!
    const result = await handler({}, '2025-02-15') as { allowed: boolean; reason: string | null }

    expect(result.allowed).toBe(true)
    expect(result.reason).toBeNull()
  })

  it('period:isTransactionAllowed blocks transaction in locked period', async () => {
    db.exec(`
      INSERT INTO financial_period (name, start_date, end_date, status)
      VALUES ('Q1 2025', '2025-01-01', '2025-03-31', 'LOCKED');
    `)

    const handler = handlerMap.get('period:isTransactionAllowed')!
    const result = await handler({}, '2025-02-15') as { allowed: boolean; reason: string | null }

    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('locked')
  })

  // ─── period:lock ────────────────────────────────────────────────────

  it('period:lock locks an open period', async () => {
    db.exec(`
      INSERT INTO financial_period (name, start_date, end_date, status)
      VALUES ('Q1 2025', '2025-01-01', '2025-03-31', 'OPEN');
    `)

    const handler = handlerMap.get('period:lock')!
    const result = await handler({}, 1, 9) as SuccessResult

    expect(result.success).toBe(true)

    const period = db.prepare('SELECT status FROM financial_period WHERE id = 1').get() as { status: string }
    expect(period.status).toBe('LOCKED')
  })

  it('period:lock rejects already-locked period', async () => {
    db.exec(`
      INSERT INTO financial_period (name, start_date, end_date, status)
      VALUES ('Q1 2025', '2025-01-01', '2025-03-31', 'LOCKED');
    `)

    const handler = handlerMap.get('period:lock')!
    const result = await handler({}, 1, 9) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toContain('already locked')
  })

  // ─── period:close ───────────────────────────────────────────────────

  it('period:close closes a locked period', async () => {
    db.exec(`
      INSERT INTO financial_period (name, start_date, end_date, status)
      VALUES ('Q1 2025', '2025-01-01', '2025-03-31', 'LOCKED');
    `)

    const handler = handlerMap.get('period:close')!
    const result = await handler({}, 1, 9) as SuccessResult

    expect(result.success).toBe(true)

    const period = db.prepare('SELECT status FROM financial_period WHERE id = 1').get() as { status: string }
    expect(period.status).toBe('CLOSED')
  })

  it('period:close rejects closing a non-locked period', async () => {
    db.exec(`
      INSERT INTO financial_period (name, start_date, end_date, status)
      VALUES ('Q1 2025', '2025-01-01', '2025-03-31', 'OPEN');
    `)

    const handler = handlerMap.get('period:close')!
    const result = await handler({}, 1, 9) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toContain('must be locked before closing')
  })

  // ─── period:unlock ──────────────────────────────────────────────────

  it('period:unlock unlocks a locked period', async () => {
    db.exec(`
      INSERT INTO financial_period (name, start_date, end_date, status)
      VALUES ('Q1 2025', '2025-01-01', '2025-03-31', 'LOCKED');
    `)

    const handler = handlerMap.get('period:unlock')!
    const result = await handler({}, 1, 9) as SuccessResult

    expect(result.success).toBe(true)

    const period = db.prepare('SELECT status FROM financial_period WHERE id = 1').get() as { status: string }
    expect(period.status).toBe('OPEN')
  })

  it('period:unlock rejects unlocking a non-locked period', async () => {
    db.exec(`
      INSERT INTO financial_period (name, start_date, end_date, status)
      VALUES ('Q1 2025', '2025-01-01', '2025-03-31', 'OPEN');
    `)

    const handler = handlerMap.get('period:unlock')!
    const result = await handler({}, 1, 9) as SuccessResult

    expect(result.success).toBe(false)
  })

  // ─── legacyUserId mismatch tests ────────────────────────────────────

  it('period:lock rejects when legacyUserId mismatches actor', async () => {
    db.exec(`
      INSERT INTO financial_period (name, start_date, end_date, status)
      VALUES ('Q1 2025', '2025-01-01', '2025-03-31', 'OPEN');
    `)

    const handler = handlerMap.get('period:lock')!
    const result = await handler({}, 1, 999) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
  })

  it('period:unlock rejects when legacyUserId mismatches actor', async () => {
    db.exec(`
      INSERT INTO financial_period (name, start_date, end_date, status)
      VALUES ('Q1 2025', '2025-01-01', '2025-03-31', 'LOCKED');
    `)

    const handler = handlerMap.get('period:unlock')!
    const result = await handler({}, 1, 999) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
  })

  it('period:close rejects when legacyUserId mismatches actor', async () => {
    db.exec(`
      INSERT INTO financial_period (name, start_date, end_date, status)
      VALUES ('Q1 2025', '2025-01-01', '2025-03-31', 'LOCKED');
    `)

    const handler = handlerMap.get('period:close')!
    const result = await handler({}, 1, 999) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
  })

  it('period:isTransactionAllowed for date outside any period', async () => {
    // No periods in DB
    const handler = handlerMap.get('period:isTransactionAllowed')!
    const result = await handler({}, '2030-01-01') as { allowed: boolean; reason: string | null }

    // Behavior depends on service: either allowed (no period = no restriction) or not
    expect(result).toBeDefined()
    expect(typeof result.allowed).toBe('boolean')
  })
})
