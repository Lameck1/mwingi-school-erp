import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPassword: vi.fn<(service: string, account: string) => Promise<string | null>>(),
  setPassword: vi.fn<(service: string, account: string, password: string) => Promise<void>>(),
  deletePassword: vi.fn<(service: string, account: string) => Promise<boolean>>(),
}))

vi.mock('keytar', () => ({
  default: {
    getPassword: mocks.getPassword,
    setPassword: mocks.setPassword,
    deletePassword: mocks.deletePassword,
  },
  getPassword: mocks.getPassword,
  setPassword: mocks.setPassword,
  deletePassword: mocks.deletePassword,
}))

import {
  AuthSessionSchema,
  clearSession,
  clearSessionCache,
  getSession,
  setSession,
  type AuthSession,
} from '../session'

function validSession(overrides?: Partial<AuthSession>): AuthSession {
  const now = Date.now()
  return {
    user: {
      id: 1,
      username: 'admin',
      full_name: 'Admin User',
      email: 'admin@example.com',
      role: 'ADMIN',
      is_active: 1,
      last_login: null,
      created_at: '2024-01-01T00:00:00',
      updated_at: null,
    },
    lastActivity: now,
    ...overrides,
  }
}

describe('security/session', () => {
  beforeEach(() => {
    clearSessionCache()
    mocks.getPassword.mockReset()
    mocks.setPassword.mockReset()
    mocks.deletePassword.mockReset()
    mocks.setPassword.mockResolvedValue(void 0)
    mocks.deletePassword.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getSession', () => {
    it('returns null when keytar has no stored session', async () => {
      mocks.getPassword.mockResolvedValueOnce(null)
      const session = await getSession()
      expect(session).toBeNull()
    })

    it('returns parsed session when keytar has valid stored data', async () => {
      const sess = validSession()
      mocks.getPassword.mockResolvedValueOnce(JSON.stringify(sess))

      const result = await getSession()

      expect(result).toEqual(sess)
    })

    it('returns null when stored data is invalid JSON', async () => {
      mocks.getPassword.mockResolvedValueOnce('not-json{{{')
      const result = await getSession()
      expect(result).toBeNull()
    })

    it('returns null when session fails schema validation', async () => {
      mocks.getPassword.mockResolvedValueOnce(JSON.stringify({ user: { id: 'not-a-number' } }))
      const result = await getSession()
      expect(result).toBeNull()
    })

    it('returns cached session within TTL without calling keytar again', async () => {
      const sess = validSession()
      mocks.getPassword.mockResolvedValueOnce(JSON.stringify(sess))

      await getSession() // populates cache
      const result = await getSession() // uses cache

      expect(result).toEqual(sess)
      expect(mocks.getPassword).toHaveBeenCalledTimes(1)
    })

    it('returns null for expired session (lastActivity > 24h ago)', async () => {
      const expired = validSession({ lastActivity: Date.now() - 25 * 60 * 60 * 1000 })
      mocks.getPassword.mockResolvedValueOnce(JSON.stringify(expired))

      const result = await getSession()

      expect(result).toBeNull()
    })

    it('returns null when keytar throws an error', async () => {
      mocks.getPassword.mockRejectedValueOnce(new Error('keytar error'))
      const result = await getSession()
      expect(result).toBeNull()
    })
  })

  describe('setSession', () => {
    it('stores session in keytar and updates cache', async () => {
      const sess = validSession()
      await setSession(sess)

      expect(mocks.setPassword).toHaveBeenCalledWith(
        'mwingi-school-erp',
        'session',
        JSON.stringify(sess)
      )

      // Should return from cache without calling keytar.getPassword
      const result = await getSession()
      expect(result).toEqual(sess)
      expect(mocks.getPassword).not.toHaveBeenCalled()
    })

    it('does not throw when keytar write fails', async () => {
      mocks.setPassword.mockRejectedValueOnce(new Error('write failed'))
      const sess = validSession()

      await expect(setSession(sess)).resolves.toBeUndefined()
    })
  })

  describe('clearSession', () => {
    it('clears session from keytar and resets cache', async () => {
      const sess = validSession()
      await setSession(sess)

      await clearSession()

      expect(mocks.deletePassword).toHaveBeenCalledWith('mwingi-school-erp', 'session')

      // Next getSession should query keytar again (cache cleared)
      mocks.getPassword.mockResolvedValueOnce(null)
      const result = await getSession()
      expect(result).toBeNull()
    })

    it('does not throw when keytar delete fails', async () => {
      mocks.deletePassword.mockRejectedValueOnce(new Error('delete failed'))
      await expect(clearSession()).resolves.toBeUndefined()
    })
  })

  describe('AuthSessionSchema validation', () => {
    it('accepts all valid user roles', () => {
      const roles = ['ADMIN', 'ACCOUNTS_CLERK', 'AUDITOR', 'PRINCIPAL', 'DEPUTY_PRINCIPAL', 'TEACHER'] as const
      for (const role of roles) {
        const sess = validSession()
        sess.user.role = role
        const result = AuthSessionSchema.safeParse(sess)
        expect(result.success, `Expected role '${role}' to be valid`).toBe(true)
      }
    })

    it('rejects unknown role value', () => {
      const sess = validSession()
      const raw = { ...sess, user: { ...sess.user, role: 'JANITOR' } }
      const result = AuthSessionSchema.safeParse(raw)
      expect(result.success).toBe(false)
    })
  })
})
