import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

let db: Database.Database
const handlerMap = new Map<string, IpcHandler>()
const logAuditMock = vi.fn()
let sessionUserId = 1
let sessionRole = 'ADMIN'

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn(async () => JSON.stringify({
      user: {
        id: sessionUserId,
        username: 'admin',
        role: sessionRole,
        full_name: 'Admin User',
        email: 'admin@example.com',
        is_active: 1,
        created_at: new Date().toISOString()
      },
      lastActivity: Date.now()
    })),
    setPassword: vi.fn(),
    deletePassword: vi.fn(),
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
  logAudit: (...args: unknown[]) => logAuditMock(...args)
}))

vi.mock('bcryptjs', () => ({
  hash: vi.fn(async (value: string) => `hashed-${value}`),
  compare: vi.fn(async () => true)
}))

import { registerAuthHandlers } from '../auth-handlers'

describe('auth user management audit logging', () => {
  beforeEach(() => {
    handlerMap.clear()
    logAuditMock.mockClear()
    sessionUserId = 1
    sessionRole = 'ADMIN'

    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE user (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        email TEXT,
        role TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        last_login TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE login_attempt (
        username TEXT PRIMARY KEY,
        failed_count INTEGER NOT NULL DEFAULT 0,
        last_failed_at INTEGER NOT NULL DEFAULT 0,
        lockout_until INTEGER NOT NULL DEFAULT 0
      );

      INSERT INTO user (id, username, password_hash, full_name, email, role, is_active)
      VALUES (1, 'admin', 'hashed-admin123', 'Admin User', 'admin@example.com', 'ADMIN', 1);
    `)

    registerAuthHandlers()
  })

  it('logs user lifecycle audit events for create/update/status/reset-password', async () => {
    const createHandler = handlerMap.get('user:create')
    const updateHandler = handlerMap.get('user:update')
    const toggleHandler = handlerMap.get('user:toggleStatus')
    const resetHandler = handlerMap.get('user:resetPassword')

    expect(createHandler).toBeDefined()
    expect(updateHandler).toBeDefined()
    expect(toggleHandler).toBeDefined()
    expect(resetHandler).toBeDefined()

    const createResult = await createHandler!({}, {
      username: 'ops-user',
      password: 'SecurePass123',
      full_name: 'Ops User',
      email: 'ops@example.com',
      role: 'AUDITOR'
    }) as { success: boolean; id?: number }
    expect(createResult.success).toBe(true)
    const createdUserId = createResult.id as number

    const updateResult = await updateHandler!({}, createdUserId, { full_name: 'Ops User Updated' }) as { success: boolean }
    expect(updateResult.success).toBe(true)

    const toggleResult = await toggleHandler!({}, createdUserId, false) as { success: boolean }
    expect(toggleResult.success).toBe(true)

    const resetResult = await resetHandler!({}, createdUserId, 'AnotherPass123') as { success: boolean }
    expect(resetResult.success).toBe(true)

    expect(logAuditMock).toHaveBeenCalledWith(
      1,
      'CREATE',
      'user',
      createdUserId,
      null,
      expect.objectContaining({ username: 'ops-user', role: 'AUDITOR' })
    )
    expect(logAuditMock).toHaveBeenCalledWith(
      1,
      'UPDATE',
      'user',
      createdUserId,
      expect.objectContaining({ id: createdUserId }),
      expect.objectContaining({ full_name: 'Ops User Updated' })
    )
    expect(logAuditMock).toHaveBeenCalledWith(
      1,
      'UPDATE_STATUS',
      'user',
      createdUserId,
      expect.any(Object),
      expect.objectContaining({ is_active: 0 })
    )
    expect(logAuditMock).toHaveBeenCalledWith(
      1,
      'RESET_PASSWORD',
      'user',
      createdUserId,
      null,
      { password_reset: true }
    )
  })
})
