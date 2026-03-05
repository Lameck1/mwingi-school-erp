import Database from 'better-sqlite3'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

let db: Database.Database
const handlerMap = new Map<string, IpcHandler>()

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue(JSON.stringify({
      user: { id: 5, username: 'admin', role: 'PRINCIPAL', full_name: 'Admin', email: 'admin@test.com', is_active: 1, last_login: null, created_at: new Date().toISOString() },
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

import { registerAuditHandlers } from '../audit-handlers'

describe('audit IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()

    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE user (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        full_name TEXT,
        role TEXT
      );

      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action_type TEXT NOT NULL,
        table_name TEXT NOT NULL,
        record_id INTEGER,
        old_values TEXT,
        new_values TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO user (id, username, full_name, role) VALUES
        (1, 'admin', 'Admin User', 'ADMIN'),
        (2, 'bursar', 'Bursar User', 'ACCOUNTS_CLERK');

      INSERT INTO audit_log (user_id, action_type, table_name, record_id, new_values, created_at)
      VALUES
        (1, 'CREATE', 'student', 1, '{"name":"John"}', '2026-01-01 10:00:00'),
        (1, 'UPDATE', 'student', 1, '{"name":"Johnny"}', '2026-01-02 10:00:00'),
        (2, 'CREATE', 'fee_invoice', 1, '{"amount":50000}', '2026-01-03 10:00:00'),
        (1, 'DELETE', 'student', 2, null, '2026-01-04 10:00:00'),
        (2, 'UPDATE', 'fee_invoice', 1, '{"amount":60000}', '2026-01-05 10:00:00'),
        (1, 'CREATE', 'payment', 1, '{"amount":10000}', '2026-01-06 10:00:00'),
        (2, 'CREATE', 'payment', 2, '{"amount":20000}', '2026-01-07 10:00:00'),
        (1, 'UPDATE', 'student', 3, '{"status":"active"}', '2026-01-08 10:00:00'),
        (2, 'CREATE', 'fee_invoice', 2, '{"amount":30000}', '2026-01-09 10:00:00'),
        (1, 'CREATE', 'student', 4, '{"name":"Jane"}', '2026-01-10 10:00:00');
    `)

    registerAuditHandlers()
  })

  afterEach(() => {
    if (db) { db.close() }
  })

  it('should register audit:getLog handler', () => {
    expect(handlerMap.has('audit:getLog')).toBe(true)
  })

  it('should return audit logs with default limit', async () => {
    const handler = handlerMap.get('audit:getLog')!
    const result = await handler({}) as Array<{ action_type: string; user_name: string }>

    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(10)
  })

  it('should respect numeric limit parameter', async () => {
    const handler = handlerMap.get('audit:getLog')!
    const result = await handler({}, 3) as Array<{ action_type: string }>

    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(3)
  })

  it('should filter by action type', async () => {
    const handler = handlerMap.get('audit:getLog')!
    const result = await handler({}, { action: 'CREATE' }) as Array<{ action_type: string }>

    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
    expect(result.every(r => r.action_type === 'CREATE')).toBe(true)
  })

  it('should filter by table name', async () => {
    const handler = handlerMap.get('audit:getLog')!
    const result = await handler({}, { table: 'fee_invoice' }) as Array<{ table_name: string }>

    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
    expect(result.every(r => r.table_name === 'fee_invoice')).toBe(true)
  })

  it('should support search filter', async () => {
    const handler = handlerMap.get('audit:getLog')!
    const result = await handler({}, { search: 'Admin' }) as Array<{ user_name: string }>

    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
  })

  it('should support paginated queries', async () => {
    const handler = handlerMap.get('audit:getLog')!
    const result = await handler({}, { page: 1, pageSize: 3 }) as {
      rows: unknown[]; totalCount: number; page: number; pageSize: number
    }

    expect(result.rows).toBeDefined()
    expect(result.rows.length).toBe(3)
    expect(result.totalCount).toBe(10)
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(3)
  })

  it('should return correct page 2 results', async () => {
    const handler = handlerMap.get('audit:getLog')!
    const result = await handler({}, { page: 2, pageSize: 4 }) as {
      rows: unknown[]; totalCount: number; page: number
    }

    expect(result.rows.length).toBe(4)
    expect(result.page).toBe(2)
  })

  it('should combine action and table filters', async () => {
    const handler = handlerMap.get('audit:getLog')!
    const result = await handler({}, { action: 'CREATE', table: 'student' }) as Array<{ action_type: string; table_name: string }>

    expect(Array.isArray(result)).toBe(true)
    expect(result.every(r => r.action_type === 'CREATE' && r.table_name === 'student')).toBe(true)
  })

  it('should join user full_name as user_name', async () => {
    const handler = handlerMap.get('audit:getLog')!
    const result = await handler({}, 1) as Array<{ user_name: string }>

    expect(result.length).toBe(1)
    expect(result[0].user_name).toBeDefined()
  })

  it('should use default limit when input is null', async () => {
    const handler = handlerMap.get('audit:getLog')!
    const result = await handler({}) as Array<{ action_type: string }>
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(10) // all 10 rows within default limit 200
  })

  it('should respect limit inside object filter', async () => {
    const handler = handlerMap.get('audit:getLog')!
    const result = await handler({}, { limit: 2 }) as Array<{ action_type: string }>
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(2)
  })

  // Branch coverage: else-if scalar input where Number() is NaN → falls back to || 200 (L27)
  it('should fall back to default limit for non-numeric string input', async () => {
    const handler = handlerMap.get('audit:getLog')!
    const result = await handler({}, 'not_a_number') as Array<{ action_type: string }>
    expect(Array.isArray(result)).toBe(true)
    // Number('not_a_number') is NaN → || 200 fallback → returns up to 200 rows
    expect(result.length).toBe(10) // all 10 rows within default 200 limit
  })
})
