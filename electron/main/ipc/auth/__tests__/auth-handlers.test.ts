import Database from 'better-sqlite3'
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>
const require = createRequire(import.meta.url)
const bcrypt = require('bcryptjs') as { hashSync: (value: string, rounds: number) => string }

const state = vi.hoisted(() => ({
  handlerMap: new Map<string, IpcHandler>(),
  keytarDeleteMock: vi.fn(),
  keytarGetMock: vi.fn(),
  keytarSetMock: vi.fn(),
  logAuditMock: vi.fn(),
  session: {
    enabled: true,
    fullName: 'Admin User',
    role: 'ADMIN',
    userId: 1,
    username: 'admin'
  }
}))

let db: Database.Database

function buildSessionPayload(): string {
  return JSON.stringify({
    user: {
      id: state.session.userId,
      username: state.session.username,
      role: state.session.role,
      full_name: state.session.fullName,
      email: `${state.session.username}@example.com`,
      is_active: 1,
      created_at: new Date().toISOString()
    },
    lastActivity: Date.now()
  })
}

vi.mock('keytar', () => ({
  default: {
    getPassword: (...args: unknown[]) => state.keytarGetMock(...args),
    setPassword: (...args: unknown[]) => state.keytarSetMock(...args),
    deletePassword: (...args: unknown[]) => state.keytarDeleteMock(...args),
  }
}))

vi.mock('../../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      state.handlerMap.set(channel, handler)
    }),
    removeHandler: vi.fn(),
  }
}))

vi.mock('../../../database', () => ({
  getDatabase: () => db
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: (...args: unknown[]) => state.logAuditMock(...args)
}))

import { registerAuthHandlers } from '../auth-handlers'

type AuthResult = { success: boolean; error?: string; [key: string]: unknown }

async function invoke(channel: string, ...args: unknown[]): Promise<AuthResult> {
  const handler = state.handlerMap.get(channel)
  if (!handler) {
    throw new Error(`Missing handler for ${channel}`)
  }
  return handler({}, ...args) as Promise<AuthResult>
}

function createSchema(targetDb: Database.Database): void {
  const adminHash = bcrypt.hashSync('Admin123', 6)
  const teacherHash = bcrypt.hashSync('Teacher123', 6)

  targetDb.exec(`
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
    VALUES
      (1, 'admin', '${adminHash}', 'Admin User', 'admin@example.com', 'ADMIN', 1),
      (2, 'teacher', '${teacherHash}', 'Teacher User', 'teacher@example.com', 'TEACHER', 1);
  `)
}

describe('auth handlers', () => {
  beforeEach(() => {
    state.handlerMap.clear()
    state.logAuditMock.mockReset()
    state.keytarDeleteMock.mockReset()
    state.keytarSetMock.mockReset()
    state.keytarGetMock.mockReset()

    state.session.enabled = true
    state.session.userId = 1
    state.session.role = 'ADMIN'
    state.session.username = 'admin'
    state.session.fullName = 'Admin User'

    state.keytarGetMock.mockImplementation(async () => {
      return state.session.enabled ? buildSessionPayload() : null
    })

    db = new Database(':memory:')
    createSchema(db)

    registerAuthHandlers()
  })

  it('logs user lifecycle audit events for create/update/status/reset-password', async () => {
    const createResult = await invoke('user:create', {
      username: 'ops-user',
      password: 'SecurePass123',
      full_name: 'Ops User',
      email: 'ops@example.com',
      role: 'AUDITOR'
    })
    expect(createResult.success).toBe(true)
    const createdUserId = Number(createResult.id)

    const updateResult = await invoke('user:update', createdUserId, { full_name: 'Ops User Updated' })
    expect(updateResult.success).toBe(true)

    const toggleResult = await invoke('user:toggleStatus', createdUserId, false)
    expect(toggleResult.success).toBe(true)

    const resetResult = await invoke('user:resetPassword', createdUserId, 'AnotherPass123')
    expect(resetResult.success).toBe(true)

    expect(state.logAuditMock).toHaveBeenCalledWith(
      1,
      'CREATE',
      'user',
      createdUserId,
      null,
      expect.objectContaining({ username: 'ops-user', role: 'AUDITOR' })
    )
    expect(state.logAuditMock).toHaveBeenCalledWith(
      1,
      'UPDATE',
      'user',
      createdUserId,
      expect.objectContaining({ id: createdUserId }),
      expect.objectContaining({ full_name: 'Ops User Updated' })
    )
    expect(state.logAuditMock).toHaveBeenCalledWith(
      1,
      'UPDATE_STATUS',
      'user',
      createdUserId,
      expect.any(Object),
      expect.objectContaining({ is_active: 0 })
    )
    expect(state.logAuditMock).toHaveBeenCalledWith(
      1,
      'RESET_PASSWORD',
      'user',
      createdUserId,
      null,
      { password_reset: true }
    )
  })

  it('handles auth setup, hasUsers, and user-management authorization/validation branches', async () => {
    const hasUsers = await invoke('auth:hasUsers')
    expect(hasUsers).toBe(true)

    const setupBlocked = await invoke('auth:setupAdmin', {
      username: 'newadmin',
      password: 'AdminPass123',
      full_name: 'New Admin',
      email: 'newadmin@example.com'
    })
    expect(setupBlocked.success).toBe(false)
    expect(setupBlocked.error).toContain('first run')

    db.exec('DELETE FROM user')
    const setupSuccess = await invoke('auth:setupAdmin', {
      username: 'newadmin',
      password: 'AdminPass123',
      full_name: 'New Admin',
      email: 'newadmin@example.com'
    })
    expect(setupSuccess.success).toBe(true)

    const setupDuplicate = await invoke('auth:setupAdmin', {
      username: 'newadmin',
      password: 'AdminPass123',
      full_name: 'New Admin',
      email: 'newadmin@example.com'
    })
    expect(setupDuplicate.success).toBe(false)
    expect(setupDuplicate.error).toContain('first run')

    state.session.role = 'TEACHER'
    const unauthorizedCreate = await invoke('user:create', {
      username: 'locked-user',
      password: 'SecurePass123',
      full_name: 'Locked User',
      email: 'locked@example.com',
      role: 'AUDITOR'
    })
    expect(unauthorizedCreate.success).toBe(false)
    expect(unauthorizedCreate.error).toContain('Unauthorized')

    state.session.role = 'ADMIN'
    const updateMissing = await invoke('user:update', 999, { full_name: 'No User' })
    expect(updateMissing.success).toBe(false)
    expect(updateMissing.error).toContain('User not found')

    const toggleMissing = await invoke('user:toggleStatus', 999, false)
    expect(toggleMissing.success).toBe(false)
    expect(toggleMissing.error).toContain('User not found')

    const resetWeak = await invoke('user:resetPassword', 1, 'lowercase1')
    expect(resetWeak.success).toBe(false)
    expect(resetWeak.error).toContain('uppercase')
  })

  it('enforces login rate limits and credential checks', async () => {
    db.prepare(`
      INSERT OR REPLACE INTO login_attempt (username, failed_count, last_failed_at, lockout_until)
      VALUES (?, ?, ?, ?)
    `).run('admin', 5, Date.now(), Date.now() + 30_000)

    const rateLimited = await invoke('auth:login', 'admin', 'Admin123')
    expect(rateLimited.success).toBe(false)
    expect(rateLimited.error).toContain('Too many failed attempts')

    db.prepare('DELETE FROM login_attempt WHERE username = ?').run('admin')

    const unknownUser = await invoke('auth:login', 'ghost', 'GhostPass123')
    expect(unknownUser.success).toBe(false)
    expect(unknownUser.error).toContain('Invalid username or password')

    const badPassword = await invoke('auth:login', 'admin', 'wrong-password')
    expect(badPassword.success).toBe(false)
    expect(badPassword.error).toContain('Invalid username or password')
  })

  it('supports successful login and writes session/audit metadata', async () => {
    const successLogin = await invoke('auth:login', 'admin', 'Admin123')
    expect(successLogin.success).toBe(true)
    expect(successLogin.user).toEqual(expect.objectContaining({ id: 1, username: 'admin' }))
    expect(state.keytarSetMock).toHaveBeenCalled()
    expect(state.logAuditMock).toHaveBeenCalledWith(
      1,
      'LOGIN',
      'user',
      1,
      null,
      { action: 'Login' }
    )
  })

  it('covers getSession/setSession/clearSession branches', async () => {
    const activeSession = await invoke('auth:getSession')
    expect(activeSession).toEqual(expect.objectContaining({ user: expect.objectContaining({ id: 1 }) }))
    expect(state.keytarSetMock).toHaveBeenCalled()

    db.prepare('UPDATE user SET is_active = 0 WHERE id = 1').run()
    const inactiveSession = await invoke('auth:getSession')
    expect(inactiveSession).toBeNull()
    expect(state.keytarDeleteMock).toHaveBeenCalled()

    const invalidPayload = await invoke('auth:setSession', { user: { id: 1, username: 'admin', role: 'ADMIN' }, lastActivity: 0 })
    expect(invalidPayload.success).toBe(false)
    expect(invalidPayload.error).toContain('Invalid session payload')

    state.session.enabled = false
    const noExisting = await invoke('auth:setSession', { user: { id: 1, username: 'admin', role: 'ADMIN' }, lastActivity: Date.now() })
    expect(noExisting.success).toBe(false)
    expect(noExisting.error).toContain('Unauthorized: no active session')

    state.session.enabled = true
    db.prepare('UPDATE user SET is_active = 1 WHERE id = 1').run()
    const mismatchUser = await invoke('auth:setSession', { user: { id: 2, username: 'admin', role: 'ADMIN' }, lastActivity: Date.now() })
    expect(mismatchUser.success).toBe(false)
    expect(mismatchUser.error).toContain('Session user mismatch')

    const mismatchRole = await invoke('auth:setSession', { user: { id: 1, username: 'admin', role: 'TEACHER' }, lastActivity: Date.now() })
    expect(mismatchRole.success).toBe(false)
    expect(mismatchRole.error).toContain('Session role mismatch')

    const validSet = await invoke('auth:setSession', { user: { id: 1, username: 'admin', role: 'ADMIN' }, lastActivity: Date.now() })
    expect(validSet.success).toBe(true)

    state.session.enabled = false
    const clearMissing = await invoke('auth:clearSession')
    expect(clearMissing.success).toBe(false)
    expect(clearMissing.error).toContain('no active session')

    state.session.enabled = true
    const clearOk = await invoke('auth:clearSession')
    expect(clearOk.success).toBe(true)
  })

  it('covers changePassword branches including success path', async () => {
    state.session.enabled = false
    const noSession = await invoke('auth:changePassword', 1, 'Admin123', 'NewPass123')
    expect(noSession.success).toBe(false)
    expect(noSession.error).toContain('Unauthorized: no active session')

    state.session.enabled = true
    const mismatchUser = await invoke('auth:changePassword', 2, 'Admin123', 'NewPass123')
    expect(mismatchUser.success).toBe(false)
    expect(mismatchUser.error).toContain('Session user mismatch')

    state.session.userId = 999
    const missingUser = await invoke('auth:changePassword', 999, 'Admin123', 'NewPass123')
    expect(missingUser.success).toBe(false)
    expect(missingUser.error).toContain('User not found')

    state.session.userId = 1
    const invalidCurrent = await invoke('auth:changePassword', 1, 'WrongOld123', 'NewPass123')
    expect(invalidCurrent.success).toBe(false)
    expect(invalidCurrent.error).toContain('Current password is incorrect')

    const invalidNew = await invoke('auth:changePassword', 1, 'Admin123', 'lowercase1')
    expect(invalidNew.success).toBe(false)
    expect(invalidNew.error).toContain('uppercase')

    const success = await invoke('auth:changePassword', 1, 'Admin123', 'NewPass123')
    expect(success.success).toBe(true)
    expect(state.keytarDeleteMock).toHaveBeenCalled()
  })
})
