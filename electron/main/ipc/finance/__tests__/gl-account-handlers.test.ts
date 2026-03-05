/**
 * Tests for GL account IPC handlers.
 *
 * Pattern: mock ServiceContainer + keytar + ipcMain, capture registered
 * handlers, invoke them with controlled payloads, verify service calls.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()
let sessionUserId = 1
let sessionRole = 'ADMIN'
const validIsoDate = new Date().toISOString()

const glServiceMock = {
  getAll: vi.fn(async () => ({ success: true, data: [] })),
  getById: vi.fn(async () => ({ success: true, data: { id: 1, account_code: '1000' } })),
  create: vi.fn(async () => ({ success: true, data: { id: 5 }, message: 'Created' })),
  update: vi.fn(async () => ({ success: true, data: { id: 1 }, message: 'Updated' })),
  delete: vi.fn(async () => ({ success: true, message: 'Deleted' })),
}

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn(async () => JSON.stringify({
      user: {
        id: sessionUserId, username: 'admin', role: sessionRole,
        full_name: 'Admin', email: null, is_active: 1,
        last_login: null, created_at: validIsoDate,
      },
      lastActivity: Date.now(),
    })),
    setPassword: vi.fn().mockResolvedValue(null),
    deletePassword: vi.fn().mockResolvedValue(true),
  },
}))

vi.mock('../../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      handlerMap.set(channel, handler)
    }),
    removeHandler: vi.fn(),
  },
}))

vi.mock('../../../services/base/ServiceContainer', () => ({
  container: { resolve: vi.fn(() => glServiceMock) },
}))

import { registerGLAccountHandlers } from '../gl-account-handlers'

function attachActor(event: Record<string, unknown>) {
  event.__ipcActor = {
    id: sessionUserId, role: sessionRole, username: 'admin',
    full_name: 'Admin', email: null, is_active: 1, created_at: validIsoDate,
  }
}

/* ================================================================== */
describe('GL account IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    sessionUserId = 1
    sessionRole = 'ADMIN'
    vi.clearAllMocks()
    registerGLAccountHandlers()
  })

  /* ---- gl:get-accounts ---- */
  describe('gl:get-accounts', () => {
    it('calls getAll without filters', async () => {
      const handler = handlerMap.get('gl:get-accounts')!
      const event: Record<string, unknown> = {}
      attachActor(event)
      await handler(event)
      expect(glServiceMock.getAll).toHaveBeenCalled()
    })

    it('calls getAll with type filter', async () => {
      const handler = handlerMap.get('gl:get-accounts')!
      const event: Record<string, unknown> = {}
      attachActor(event)
      await handler(event, { type: 'ASSET' })
      expect(glServiceMock.getAll).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ASSET' }),
      )
    })
  })

  /* ---- gl:get-account ---- */
  describe('gl:get-account', () => {
    it('calls getById with the id', async () => {
      const handler = handlerMap.get('gl:get-account')!
      const event: Record<string, unknown> = {}
      attachActor(event)
      await handler(event, 42)
      expect(glServiceMock.getById).toHaveBeenCalledWith(42)
    })
  })

  /* ---- gl:create-account ---- */
  describe('gl:create-account', () => {
    const validPayload = {
      account_code: '2000', account_name: 'AP',
      account_type: 'LIABILITY' as const,
    }

    it('creates account and derives normal_balance', async () => {
      const handler = handlerMap.get('gl:create-account')!
      const event: Record<string, unknown> = {}
      attachActor(event)
      await handler(event, validPayload)
      expect(glServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          account_code: '2000',
          account_name: 'AP',
          account_type: 'LIABILITY',
          normal_balance: 'CREDIT', // auto-derived
        }),
        1,
      )
    })

    it('normalizes INCOME → REVENUE', async () => {
      const handler = handlerMap.get('gl:create-account')!
      const event: Record<string, unknown> = {}
      attachActor(event)
      await handler(event, { ...validPayload, account_type: 'INCOME' as 'REVENUE' })
      expect(glServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ account_type: 'REVENUE' }),
        1,
      )
    })

    it('derives DEBIT normal_balance for ASSET type', async () => {
      const handler = handlerMap.get('gl:create-account')!
      const event: Record<string, unknown> = {}
      attachActor(event)
      await handler(event, { ...validPayload, account_type: 'ASSET' as const })
      expect(glServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ normal_balance: 'DEBIT' }),
        1,
      )
    })

    it('derives DEBIT normal_balance for EXPENSE type', async () => {
      const handler = handlerMap.get('gl:create-account')!
      const event: Record<string, unknown> = {}
      attachActor(event)
      await handler(event, { ...validPayload, account_type: 'EXPENSE' as const })
      expect(glServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ normal_balance: 'DEBIT' }),
        1,
      )
    })
  })

  /* ---- gl:update-account ---- */
  describe('gl:update-account', () => {
    it('updates with partial data', async () => {
      const handler = handlerMap.get('gl:update-account')!
      const event: Record<string, unknown> = {}
      attachActor(event)
      await handler(event, 1, { account_name: 'Cash in Bank' })
      expect(glServiceMock.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ account_name: 'Cash in Bank' }),
        1,
      )
    })
  })

  /* ---- gl:delete-account ---- */
  describe('gl:delete-account', () => {
    it('deletes account', async () => {
      const handler = handlerMap.get('gl:delete-account')!
      const event: Record<string, unknown> = {}
      attachActor(event)
      await handler(event, 3)
      expect(glServiceMock.delete).toHaveBeenCalledWith(3, 1)
    })
  })

  /* ---- normalization: EQUITY, description, is_active ---- */
  describe('normalization edge cases', () => {
    it('creates account with EQUITY type and CREDIT normal_balance', async () => {
      const handler = handlerMap.get('gl:create-account')!
      const event: Record<string, unknown> = {}
      attachActor(event)
      await handler(event, {
        account_code: '3000', account_name: 'Retained Earnings',
        account_type: 'EQUITY' as const, description: 'Equity account', is_active: true
      })
      expect(glServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          account_type: 'EQUITY', normal_balance: 'CREDIT',
          description: 'Equity account', is_active: true
        }),
        1,
      )
    })

    it('creates account with is_active as 1 (number)', async () => {
      const handler = handlerMap.get('gl:create-account')!
      const event: Record<string, unknown> = {}
      attachActor(event)
      await handler(event, {
        account_code: '1100', account_name: 'Bank', account_type: 'ASSET' as const, is_active: 1
      })
      expect(glServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ is_active: true }),
        1,
      )
    })

    it('updates account_type and recalculates normal_balance', async () => {
      const handler = handlerMap.get('gl:update-account')!
      const event: Record<string, unknown> = {}
      attachActor(event)
      await handler(event, 1, { account_type: 'INCOME' as 'REVENUE' })
      expect(glServiceMock.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ account_type: 'REVENUE', normal_balance: 'CREDIT' }),
        1,
      )
    })

    it('updates description and is_active fields', async () => {
      const handler = handlerMap.get('gl:update-account')!
      const event: Record<string, unknown> = {}
      attachActor(event)
      await handler(event, 1, { description: 'Updated desc', is_active: false })
      expect(glServiceMock.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ description: 'Updated desc', is_active: false }),
        1,
      )
    })
  })

  /* ---- filter normalization ---- */
  describe('filter normalization', () => {
    it('normalizes is_active filter', async () => {
      const handler = handlerMap.get('gl:get-accounts')!
      const event: Record<string, unknown> = {}
      attachActor(event)
      await handler(event, { is_active: true })
      expect(glServiceMock.getAll).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      )
    })

    it('normalizes isActive (camelCase) filter', async () => {
      const handler = handlerMap.get('gl:get-accounts')!
      const event: Record<string, unknown> = {}
      attachActor(event)
      await handler(event, { isActive: false })
      expect(glServiceMock.getAll).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      )
    })

    it('returns undefined filters when input is undefined', async () => {
      const handler = handlerMap.get('gl:get-accounts')!
      const event: Record<string, unknown> = {}
      attachActor(event)
      await handler(event)
      expect(glServiceMock.getAll).toHaveBeenCalledWith(undefined)
    })
  })

  /* ---- legacyUserId mismatch ---- */
  describe('legacyUserId mismatch', () => {
    it('rejects create when legacyUserId mismatches actor', async () => {
      const handler = handlerMap.get('gl:create-account')!
      const event: Record<string, unknown> = {}
      attachActor(event)
      const result = await handler(event, {
        account_code: '2000', account_name: 'AP', account_type: 'LIABILITY' as const
      }, 999) as any
      expect(result.success).toBe(false)
      expect(result.error).toContain('Unauthorized')
    })

    it('rejects update when legacyUserId mismatches actor', async () => {
      const handler = handlerMap.get('gl:update-account')!
      const event: Record<string, unknown> = {}
      attachActor(event)
      const result = await handler(event, 1, { account_name: 'X' }, 999) as any
      expect(result.success).toBe(false)
      expect(result.error).toContain('Unauthorized')
    })

    it('rejects delete when legacyUserId mismatches actor', async () => {
      const handler = handlerMap.get('gl:delete-account')!
      const event: Record<string, unknown> = {}
      attachActor(event)
      const result = await handler(event, 1, 999) as any
      expect(result.success).toBe(false)
      expect(result.error).toContain('Unauthorized')
    })
  })
})
