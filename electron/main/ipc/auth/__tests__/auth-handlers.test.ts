import Database from 'better-sqlite3'
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSessionCache } from '../../../security/session'
import * as sessionModule from '../../../security/session'
import * as validationModule from '../../../utils/validation'

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
    clearSessionCache()
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
    clearSessionCache()
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
    clearSessionCache()
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
    clearSessionCache()
    const inactiveSession = await invoke('auth:getSession')
    expect(inactiveSession).toBeNull()
    expect(state.keytarDeleteMock).toHaveBeenCalled()

    const invalidPayload = await invoke('auth:setSession', { user: { id: 1, username: 'admin', role: 'ADMIN' }, lastActivity: 0 })
    expect(invalidPayload.success).toBe(false)
    expect(invalidPayload.error).toContain('Invalid session payload')

    state.session.enabled = false
    clearSessionCache()
    const noExisting = await invoke('auth:setSession', { user: { id: 1, username: 'admin', role: 'ADMIN' }, lastActivity: Date.now() })
    expect(noExisting.success).toBe(false)
    expect(noExisting.error).toContain('Unauthorized: no active session')

    state.session.enabled = true
    clearSessionCache()
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
    clearSessionCache()
    const clearMissing = await invoke('auth:clearSession')
    expect(clearMissing.success).toBe(false)
    expect(clearMissing.error).toContain('no active session')

    state.session.enabled = true
    clearSessionCache()
    const clearOk = await invoke('auth:clearSession')
    expect(clearOk.success).toBe(true)
  })

  it('covers changePassword branches including success path', async () => {
    state.session.enabled = false
    clearSessionCache()
    const noSession = await invoke('auth:changePassword', 1, 'Admin123', 'NewPass123')
    expect(noSession.success).toBe(false)
    expect(noSession.error).toContain('Unauthorized: no active session')

    state.session.enabled = true
    clearSessionCache()
    const mismatchUser = await invoke('auth:changePassword', 2, 'Admin123', 'NewPass123')
    expect(mismatchUser.success).toBe(false)
    expect(mismatchUser.error).toContain('Session user mismatch')

    state.session.userId = 999
    clearSessionCache()
    const missingUser = await invoke('auth:changePassword', 999, 'Admin123', 'NewPass123')
    expect(missingUser.success).toBe(false)
    expect(missingUser.error).toContain('User not found')

    state.session.userId = 1
    clearSessionCache()
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

  it('user:create rejects duplicate username', async () => {
    const result = await invoke('user:create', {
      username: 'admin',
      password: 'SecurePass123',
      full_name: 'Dup Admin',
      email: 'dup@example.com',
      role: 'AUDITOR'
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Username already exists')
  })

  it('auth:setupAdmin rejects duplicate inactive username', async () => {
    // Deactivate all users so setupAdmin passes the first-run check
    db.exec('UPDATE user SET is_active = 0')
    // Now there are no active users, but "admin" username still exists
    const result = await invoke('auth:setupAdmin', {
      username: 'admin',
      password: 'AdminPass123',
      full_name: 'Dup Admin',
      email: 'dup@example.com'
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Username already exists')
  })

  // ─── Additional branch coverage ────────────────────────────────────

  it('auth:setupAdmin rejects weak password', async () => {
    db.exec('UPDATE user SET is_active = 0')
    const result = await invoke('auth:setupAdmin', {
      username: 'newadmin2',
      password: 'weak',
      full_name: 'Weak Admin',
      email: 'weak@example.com'
    })
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('user:resetPassword rejects non-existent user', async () => {
    state.session.role = 'ADMIN'
    clearSessionCache()
    const result = await invoke('user:resetPassword', 9999, 'StrongPass123')
    expect(result.success).toBe(false)
    expect(result.error).toContain('User not found')
  })

  it('auth:changePassword rejects when no active session', async () => {
    state.session.userId = 0
    clearSessionCache()
    const result = await invoke('auth:changePassword', undefined, 'OldPass123', 'NewPass123')
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('auth:login returns failure for inactive user', async () => {
    db.exec('UPDATE user SET is_active = 0 WHERE username = \'admin\'')
    const result = await invoke('auth:login', 'admin', 'Admin123')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid username or password')
    db.exec('UPDATE user SET is_active = 1 WHERE username = \'admin\'')
  })

  // ── extended branch coverage ──────────────────────────────────
  it('user:getAll returns list of users', async () => {
    const handler = state.handlerMap.get('user:getAll')
    expect(handler).toBeDefined()
    const result = await handler!({}) as any[]
    expect(result.length).toBeGreaterThanOrEqual(2)
    expect(result[0]).not.toHaveProperty('password_hash')
  })

  it('auth:changePassword rejects session user mismatch', async () => {
    // Session userId is 1, pass legacyUserId = 999 to trigger mismatch
    state.session.userId = 1
    clearSessionCache()
    const result = await invoke('auth:changePassword', 999, 'Admin123', 'NewPass123')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Session user mismatch')
  })

  it('recordFailedLogin escalates lockout after repeated failures', async () => {
    // Trigger 6 consecutive failed logins (MAX_ATTEMPTS = 5) to hit lockout multiplier branch
    for (let i = 0; i < 6; i++) {
      await invoke('auth:login', 'admin', 'WrongPassword')
    }
    // 7th attempt should be rate-limited
    const result = await invoke('auth:login', 'admin', 'WrongPassword')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Too many failed attempts')
  })

  it('user:toggleStatus rejects non-existent user', async () => {
    const handler = state.handlerMap.get('user:toggleStatus')!
    const result = await handler({}, 9999, false) as AuthResult
    expect(result.success).toBe(false)
    expect(result.error).toContain('User not found')
  })

  // ── branch coverage: auth:changePassword with matching legacyUserId (no mismatch) ──
  it('auth:changePassword succeeds when legacyUserId matches session user', async () => {
    state.session.userId = 1
    clearSessionCache()
    const result = await invoke('auth:changePassword', 1, 'Admin123', 'ValidPass123')
    expect(result.success).toBe(true)
  })

  // ── branch coverage: user:resetPassword with weak password ──
  it('user:resetPassword rejects weak password', async () => {
    state.session.role = 'ADMIN'
    clearSessionCache()
    const result = await invoke('user:resetPassword', 1, 'weak')
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  // ── branch coverage: auth:hasUsers returns true when active users exist ──
  it('auth:hasUsers returns true when active users exist', async () => {
    const handler = state.handlerMap.get('auth:hasUsers')!
    const result = await handler({})
    expect(result).toBe(true)
  })

  // ── branch coverage: auth:changePassword rejects when new password is weak ──
  it('auth:changePassword rejects weak new password', async () => {
    state.session.enabled = true
    state.session.userId = 1
    clearSessionCache()
    const result = await invoke('auth:changePassword', 1, 'Admin123', 'short')
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  // ── branch coverage: user:update returns error for non-existent user ──
  it('user:update returns error for non-existent user', async () => {
    const result = await invoke('user:update', 9999, { full_name: 'Ghost' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('User not found')
  })

  // ── branch coverage: checkRateLimit with expired lockout ──
  it('login succeeds after lockout expires', async () => {
    // Create a login_attempt record with lockout in the past (expired)
    db.prepare(`INSERT OR REPLACE INTO login_attempt (username, failed_count, last_failed_at, lockout_until) VALUES ('admin', 10, ${Date.now() - 60000}, ${Date.now() - 1000})`).run()
    state.session.enabled = false
    clearSessionCache()
    const result = await invoke('auth:login', 'admin', 'Admin123')
    // Lockout expired → should not be rate-limited, login should succeed
    expect(result.success).toBe(true)
    expect(result.user).toBeDefined()
  })

  // ── branch coverage: recordFailedLogin creates first failure record ──
  it('login with wrong password records failed attempt', async () => {
    state.session.enabled = false
    clearSessionCache()
    const result = await invoke('auth:login', 'admin', 'WrongPassword!')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid username or password')
    // Check that login_attempt was recorded
    const attempt = db.prepare('SELECT failed_count FROM login_attempt WHERE username = ?').get('admin') as { failed_count: number } | undefined
    expect(attempt).toBeDefined()
    expect(attempt!.failed_count).toBeGreaterThan(0)
  })

  // ── branch coverage: recordFailedLogin multiple failures trigger lockout ──
  it('multiple failed logins trigger lockout', async () => {
    state.session.enabled = false
    clearSessionCache()
    for (let i = 0; i < 5; i++) {
      await invoke('auth:login', 'admin', 'WrongPw!')
    }
    const result = await invoke('auth:login', 'admin', 'WrongPw!')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Too many failed attempts')
  })

  // ── branch coverage: auth:changePassword with legacyUserId matching session ──
  it('auth:changePassword succeeds when legacyUserId matches session', async () => {
    state.session.enabled = true
    state.session.userId = 1
    clearSessionCache()
    const result = await invoke('auth:changePassword', 1, 'Admin123', 'NewPassword1!')
    expect(result.success).toBe(true)
  })

  // ── branch coverage: auth:changePassword with mismatched legacyUserId ──
  it('auth:changePassword rejects mismatched legacyUserId', async () => {
    state.session.enabled = true
    state.session.userId = 1
    clearSessionCache()
    const result = await invoke('auth:changePassword', 999, 'Admin123!', 'NewPassword1!')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Session user mismatch')
  })

  // ── branch coverage: auth:setSession with inactive user ──
  it('auth:setSession rejects when user is inactive', async () => {
    state.session.enabled = true
    state.session.userId = 1
    clearSessionCache()
    // Deactivate the user
    db.prepare('UPDATE user SET is_active = 0 WHERE id = 1').run()
    const handler = state.handlerMap.get('auth:setSession')!
    const result = await handler({}, { user: { id: 1, role: 'ADMIN' }, lastActivity: Date.now() }) as any
    expect(result.success).toBe(false)
    // Restore
    db.prepare('UPDATE user SET is_active = 1 WHERE id = 1').run()
  })

  // ── branch coverage: auth:getSession returns null when user inactive ──
  it('auth:getSession returns null when user is inactive', async () => {
    state.session.enabled = true
    state.session.userId = 1
    clearSessionCache()
    db.prepare('UPDATE user SET is_active = 0 WHERE id = 1').run()
    const handler = state.handlerMap.get('auth:getSession')!
    const result = await handler({}) as any
    expect(result).toBeNull()
    // Restore
    db.prepare('UPDATE user SET is_active = 1 WHERE id = 1').run()
  })

  // ── branch coverage: user:create rejects weak password (L172) ──
  it('user:create rejects weak password', async () => {
    state.session.role = 'ADMIN'
    state.session.userId = 1
    clearSessionCache()
    const result = await invoke('user:create', {
      username: 'weakpwuser',
      password: 'short',
      full_name: 'Weak PW',
      email: 'weakpw@example.com',
      role: 'TEACHER'
    })
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  // ── branch coverage: auth:getSession returns null when session user id is zero (L74) ──
  it('auth:getSession returns null when session user id is zero', async () => {
    state.session.enabled = true
    state.session.userId = 0
    clearSessionCache()
    const handler = state.handlerMap.get('auth:getSession')!
    const result = await handler({}) as any
    expect(result).toBeNull()
  })

  // ── branch coverage: auth:setSession rejects when session user deleted from DB (!dbUser at L104) ──
  it('auth:setSession rejects when session user is deleted from DB', async () => {
    state.session.enabled = true
    state.session.userId = 999
    clearSessionCache()
    const handler = state.handlerMap.get('auth:setSession')!
    const result = await handler({}, {
      user: { id: 999, username: 'ghost', role: 'ADMIN', full_name: 'Ghost', email: 'g@e.com', is_active: 1, created_at: new Date().toISOString() },
      lastActivity: Date.now()
    }) as any
    expect(result.success).toBe(false)
    expect(result.error).toContain('inactive or missing')
  })

  // ── Branch coverage: checkRateLimit active lockout (L39-42) ──
  it('auth:login rejects when account is rate-limited', async () => {
    db.prepare(
      'INSERT OR REPLACE INTO login_attempt (username, failed_count, last_failed_at, lockout_until) VALUES (?, ?, ?, ?)'
    ).run('admin', 10, Date.now(), Date.now() + 60_000)

    const result = await invoke('auth:login', 'admin', 'Admin123')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Too many failed attempts')

    db.prepare('DELETE FROM login_attempt WHERE username = ?').run('admin')
  })

  // ── Branch coverage: recordFailedLogin multiplier escalation (L55-57) ──
  it('auth:login escalates lockout after repeated failures beyond MAX_ATTEMPTS', async () => {
    db.prepare(
      'INSERT OR REPLACE INTO login_attempt (username, failed_count, last_failed_at, lockout_until) VALUES (?, ?, ?, ?)'
    ).run('admin', 4, Date.now(), 0)

    const result = await invoke('auth:login', 'admin', 'WrongPassword999!')
    expect(result.success).toBe(false)

    const record = db.prepare('SELECT lockout_until FROM login_attempt WHERE username = ?').get('admin') as { lockout_until: number }
    expect(record.lockout_until).toBeGreaterThan(Date.now())

    db.prepare('DELETE FROM login_attempt WHERE username = ?').run('admin')
  })

  // ── Branch coverage: auth:changePassword legacyUserId mismatch (L293) ──
  it('auth:changePassword rejects on userId mismatch', async () => {
    state.session.enabled = true
    state.session.userId = 1
    state.session.role = 'ADMIN'
    clearSessionCache()

    const result = await invoke('auth:changePassword', 999, 'Admin123', 'NewPass123!')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Session user mismatch')
  })

  // ── Branch coverage: auth:setupAdmin duplicate username on inactive user (L247-249) ──
  it('auth:setupAdmin rejects duplicate username even when user is inactive', async () => {
    db.prepare('UPDATE user SET is_active = 0').run()

    const result = await invoke('auth:setupAdmin', {
      username: 'admin',
      password: 'StrongPassword123!',
      full_name: 'New Admin',
      email: 'newadmin@example.com'
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Username already exists')

    db.prepare('UPDATE user SET is_active = 1').run()
  })

  /* ==================================================================
   *  Branch coverage: auth:setSession – invalid lastActivity (L97)
   * ================================================================== */
  it('auth:setSession rejects session with invalid lastActivity', async () => {
    const result = await invoke('auth:setSession', { lastActivity: -1, user: { id: 1, username: 'admin', role: 'ADMIN' } })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid session payload')
  })

  /* ==================================================================
   *  Branch coverage: auth:setSession – no session guard (validator intercepts)
   * ================================================================== */
  it('auth:setSession returns unauthorized when no session', async () => {
    state.session.enabled = false
    const result = await invoke('auth:setSession', { lastActivity: Date.now(), user: { id: 1, username: 'admin', role: 'ADMIN' } })
    expect(result.success).toBe(false)
    expect(result.error).toContain('no active session')
  })

  /* ==================================================================
   *  Branch coverage: auth:setSession – inactive user (L137)
   * ================================================================== */
  it('auth:setSession rejects inactive user', async () => {
    db.prepare('UPDATE user SET is_active = 0 WHERE id = 1').run()
    const result = await invoke('auth:setSession', { lastActivity: Date.now(), user: { id: 1, username: 'admin', role: 'ADMIN' } })
    expect(result.success).toBe(false)
    expect(result.error).toContain('inactive or missing')
    db.prepare('UPDATE user SET is_active = 1 WHERE id = 1').run()
  })

  /* ==================================================================
   *  Branch coverage: auth:setSession – user ID mismatch (L172-173)
   * ================================================================== */
  it('auth:setSession rejects mismatched user ID', async () => {
    const result = await invoke('auth:setSession', { lastActivity: Date.now(), user: { id: 999, username: 'admin', role: 'ADMIN' } })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Session user mismatch')
  })

  /* ==================================================================
   *  Branch coverage: auth:setSession – role mismatch (L199-200)
   * ================================================================== */
  it('auth:setSession rejects mismatched role', async () => {
    const result = await invoke('auth:setSession', { lastActivity: Date.now(), user: { id: 1, username: 'admin', role: 'TEACHER' } })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Session role mismatch')
  })

  /* ==================================================================
   *  Branch coverage: auth:setSession – success path (L207)
   * ================================================================== */
  it('auth:setSession succeeds with valid session data', async () => {
    const result = await invoke('auth:setSession', { lastActivity: Date.now(), user: { id: 1, username: 'admin', role: 'ADMIN' } })
    expect(result.success).toBe(true)
  })

  /* ==================================================================
   *  Branch coverage: auth:clearSession – no session guard (validator)
   * ================================================================== */
  it('auth:clearSession returns unauthorized when no active session', async () => {
    state.session.enabled = false
    const result = await invoke('auth:clearSession')
    expect(result.success).toBe(false)
    expect(result.error).toContain('no active session')
  })

  /* ==================================================================
   *  Branch coverage: user:create – weak password (L300)
   * ================================================================== */
  it('user:create rejects weak password', async () => {
    const result = await invoke('user:create', {
      username: 'weakuser',
      password: 'weak',
      full_name: 'Weak User',
      email: 'weak@example.com',
      role: 'TEACHER'
    })
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  /* ==================================================================
   *  Branch coverage: user:resetPassword – weak password (L314)
   * ================================================================== */
  it('user:resetPassword rejects weak password', async () => {
    const result = await invoke('user:resetPassword', 2, 'bad')
    expect(result.success).toBe(false)
  })

  /* ==================================================================
   *  Branch coverage: user:resetPassword – user not found
   * ================================================================== */
  it('user:resetPassword returns error for non-existent user', async () => {
    const result = await invoke('user:resetPassword', 9999, 'StrongPass123!')
    expect(result.success).toBe(false)
    expect(result.error).toContain('User not found')
  })

  /* ==================================================================
   *  Branch coverage: user:update – user not found
   * ================================================================== */
  it('user:update returns error for non-existent user', async () => {
    const result = await invoke('user:update', 9999, { full_name: 'Ghost' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('User not found')
  })

  /* ==================================================================
   *  Branch coverage: user:toggleStatus – user not found
   * ================================================================== */
  it('user:toggleStatus returns error for non-existent user', async () => {
    const result = await invoke('user:toggleStatus', 9999, false)
    expect(result.success).toBe(false)
    expect(result.error).toContain('User not found')
  })

  /* ==================================================================
   *  Branch coverage: checkRateLimit false branch – record exists with
   *  lockout_until = 0 (line 43)
   * ================================================================== */
  it('auth:login proceeds when login_attempt record exists but lockout_until is 0', async () => {
    db.prepare(
      'INSERT OR REPLACE INTO login_attempt (username, failed_count, last_failed_at, lockout_until) VALUES (?, ?, ?, ?)'
    ).run('admin', 3, Date.now() - 10000, 0)
    const result = await invoke('auth:login', 'admin', 'Admin123')
    expect(result.success).toBe(true)
    expect(result.user).toEqual(expect.objectContaining({ id: 1, username: 'admin' }))
  })

  /* ==================================================================
   *  Branch coverage: bcrypt.compare throws inside auth:login (lines 290-291)
   * ================================================================== */
  it('auth:login catches and rethrows bcrypt comparison error', async () => {
    const bcryptLib = require('bcryptjs') as any
    const origCompare = bcryptLib.compare
    bcryptLib.compare = () => Promise.reject(new Error('Bcrypt internal error'))
    try {
      const result = await invoke('auth:login', 'admin', 'Admin123')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Bcrypt internal error')
    } finally {
      bcryptLib.compare = origCompare
    }
  })

  // ── Branch L173: user:create falls back to 'Invalid password' when pwCheck.error is falsy ──
  it('user:create returns fallback error when validatePassword has no error message', async () => {
    const spy = vi.spyOn(validationModule, 'validatePassword')
      .mockReturnValueOnce({ success: false } as any)
    state.session.role = 'ADMIN'
    state.session.userId = 1
    clearSessionCache()
    const result = await invoke('user:create', {
      username: 'fallback-err',
      password: 'AnyPassword1',
      full_name: 'Fallback User',
      email: 'fb@example.com',
      role: 'TEACHER'
    })
    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid password')
    spy.mockRestore()
  })

  // ── Branch L243: auth:setupAdmin falls back to 'Invalid password' when pwCheck.error is falsy ──
  it('auth:setupAdmin returns fallback error when validatePassword has no error message', async () => {
    db.exec('UPDATE user SET is_active = 0')
    const spy = vi.spyOn(validationModule, 'validatePassword')
      .mockReturnValueOnce({ success: false } as any)
    const result = await invoke('auth:setupAdmin', {
      username: 'fb-admin',
      password: 'AnyPassword1',
      full_name: 'Fallback Admin',
      email: 'fb-admin@example.com'
    })
    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid password')
    spy.mockRestore()
    db.exec('UPDATE user SET is_active = 1')
  })

  // ── Branch L301: auth:changePassword defense-in-depth when session invalidated mid-request ──
  it('auth:changePassword returns error when session becomes invalid between wrapper and handler', async () => {
    const validSession = {
      user: { id: 1, username: 'admin', role: 'ADMIN', full_name: 'Admin User', email: 'admin@example.com', is_active: 1, created_at: new Date().toISOString() },
      lastActivity: Date.now()
    }
    const spy = vi.spyOn(sessionModule, 'getSession')
    spy.mockResolvedValueOnce(validSession as any)  // wrapper auth passes
    spy.mockResolvedValueOnce(null)                  // handler body sees no session
    const result = await invoke('auth:changePassword', 1, 'Admin123', 'NewPass123')
    expect(result.success).toBe(false)
    expect(result.error).toContain('No active authenticated session')
    spy.mockRestore()
  })

  // ── Branch L38: checkRateLimit false branch with non-zero expired lockout_until ──
  it('checkRateLimit falls through when lockout_until is positive but expired', async () => {
    db.prepare('INSERT OR REPLACE INTO login_attempt (username, failed_count, last_failed_at, lockout_until) VALUES (?, ?, ?, ?)')
      .run('teacher', 3, Date.now() - 60000, Date.now() - 100)
    const result = await invoke('auth:login', 'teacher', 'Teacher123')
    expect(result.success).toBe(true)
    expect(result.user).toEqual(expect.objectContaining({ username: 'teacher' }))
  })

  // ── Branch L92: auth:setSession with Infinity lastActivity (Number.isFinite false branch) ──
  it('auth:setSession rejects Infinity lastActivity', async () => {
    state.session.enabled = true
    clearSessionCache()
    const result = await invoke('auth:setSession', {
      user: { id: 1, username: 'admin', role: 'ADMIN' },
      lastActivity: Infinity
    })
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  // ── Branch L92: auth:setSession with negative lastActivity ──
  it('auth:setSession rejects negative lastActivity', async () => {
    state.session.enabled = true
    clearSessionCache()
    const result = await invoke('auth:setSession', {
      user: { id: 1, username: 'admin', role: 'ADMIN' },
      lastActivity: -1
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid session payload')
  })

  // ── Branch L128: auth:setSession – refreshed user missing role (empty role in DB) ──
  it('auth:setSession rejects when DB user has empty role', async () => {
    // Insert a user with empty-string role (falsy in JS, satisfies NOT NULL)
    db.prepare("INSERT INTO user (username, password_hash, full_name, email, role, is_active) VALUES ('norole', '$2b$10$placeholder', 'No Role User', 'nr@e.com', '', 1)").run()
    const noRoleUser = db.prepare("SELECT id FROM user WHERE username = 'norole'").get() as { id: number }

    // Keep state.session.role as 'ADMIN' so the wrapper's getSession() passes auth
    // but point userId to the DB user with empty role
    state.session.userId = noRoleUser.id
    state.session.username = 'norole'
    clearSessionCache()

    // Pass role: '' in IPC args so session?.user?.role is falsy → skips role mismatch check
    // DB user has role='' → refreshed.user.role is falsy → triggers L128
    const result = await invoke('auth:setSession', {
      user: { id: noRoleUser.id, username: 'norole', role: '' },
      lastActivity: Date.now()
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Session user does not exist')
  })
})
