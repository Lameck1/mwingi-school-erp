import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

let db: Database.Database
const handlerMap = new Map<string, IpcHandler>()

let sessionUserId = 9
let sessionRole = 'ACCOUNTS_CLERK'

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn(async () => JSON.stringify({
      user: {
        id: sessionUserId,
        username: 'payroll-user',
        role: sessionRole,
        full_name: 'Payroll User',
        email: null,
        is_active: 1,
        last_login: null,
        created_at: '2026-01-01'
      },
      lastActivity: Date.now()
    })),
    setPassword: vi.fn().mockResolvedValue(null),
    deletePassword: vi.fn().mockResolvedValue(true),
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

vi.mock('../../../services/accounting/DoubleEntryJournalService', () => ({
  DoubleEntryJournalService: class {
    createJournalEntrySync() {
      return { success: true }
    }
  }
}))

vi.mock('../../../services/finance/PayrollJournalService', () => ({
  PayrollJournalService: class {
    constructor(_db: unknown) {}
    postPayrollToGL() {
      return { success: true }
    }
  }
}))

import { registerPayrollHandlers } from '../payroll-handlers'

describe('payroll IPC handlers actor/role enforcement', () => {
  beforeEach(() => {
    handlerMap.clear()
    sessionUserId = 9
    sessionRole = 'ACCOUNTS_CLERK'
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE payroll_period (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        period_name TEXT,
        month INTEGER,
        year INTEGER,
        start_date TEXT,
        end_date TEXT,
        status TEXT
      );
    `)

    registerPayrollHandlers()
  })

  afterEach(() => {
    db.close()
  })

  it('rejects payroll run when renderer user id does not match authenticated session actor', async () => {
    const handler = handlerMap.get('payroll:run')
    expect(handler).toBeDefined()

    const result = await handler!({}, 2, 2026, 4) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
  })

  it('blocks payroll history access for non-authorized roles', async () => {
    sessionRole = 'TEACHER'
    const handler = handlerMap.get('payroll:getHistory')
    expect(handler).toBeDefined()

    const result = await handler!({}) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
  })

  it('allows payroll history access for management roles', async () => {
    sessionRole = 'PRINCIPAL'
    db.prepare(`
      INSERT INTO payroll_period (period_name, month, year, start_date, end_date, status)
      VALUES ('January 2026', 1, 2026, '2026-01-01', '2026-01-31', 'DRAFT')
    `).run()

    const handler = handlerMap.get('payroll:getHistory')
    expect(handler).toBeDefined()

    const result = await handler!({}) as Array<{ period_name: string }>
    expect(Array.isArray(result)).toBe(true)
    expect(result[0]?.period_name).toBe('January 2026')
  })
})
