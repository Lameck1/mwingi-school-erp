/**
 * Tests for reconciliation-budget-handlers.ts
 * Targets: all 3 handlers (runAll, getHistory, getLatest), renderer mismatch, default limit
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSessionCache } from '../../../security/session'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()
let sessionUserId = 9
let sessionRole = 'ACCOUNTS_CLERK'

const reconciliationServiceMock = {
  runAllChecks: vi.fn(async () => ({ success: true, checksRun: 5 })),
  getReconciliationHistory: vi.fn(async () => []),
  getLatestReconciliationSummary: vi.fn().mockResolvedValue(null),
}

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn(async () => JSON.stringify({
      user: { id: sessionUserId, username: 'test', role: sessionRole, full_name: 'Test', email: null, is_active: 1, last_login: null, created_at: new Date().toISOString() },
      lastActivity: Date.now()
    })),
    setPassword: vi.fn().mockResolvedValue(null),
    deletePassword: vi.fn().mockResolvedValue(true),
  }
}))

vi.mock('../../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => handlerMap.set(channel, handler)),
    removeHandler: vi.fn(),
  }
}))

vi.mock('../../../services/base/ServiceContainer', () => ({
  container: {
    resolve: vi.fn((name: string) => {
      if (name === 'ReconciliationService') { return reconciliationServiceMock }
      return {}
    })
  }
}))

import { registerReconciliationAndBudgetHandlers } from '../reconciliation-budget-handlers'

describe('reconciliation-budget-handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    sessionUserId = 9
    sessionRole = 'ACCOUNTS_CLERK'
    clearSessionCache()
    vi.clearAllMocks()
    registerReconciliationAndBudgetHandlers()
  })

  it('registers all reconciliation handlers', () => {
    expect(handlerMap.has('reconciliation:runAll')).toBe(true)
    expect(handlerMap.has('reconciliation:getHistory')).toBe(true)
    expect(handlerMap.has('reconciliation:getLatest')).toBe(true)
  })

  // ─── reconciliation:runAll ──────────────────────────────
  it('runAll uses authenticated actor id', async () => {
    const handler = handlerMap.get('reconciliation:runAll')!
    const result = await handler({}, 9) as { success: boolean }
    expect(result.success).toBe(true)
    expect(reconciliationServiceMock.runAllChecks).toHaveBeenCalledWith(9)
  })

  it('runAll accepts undefined legacyUserId', async () => {
    const handler = handlerMap.get('reconciliation:runAll')!
    const result = await handler({}) as { success: boolean }
    expect(result.success).toBe(true)
    expect(reconciliationServiceMock.runAllChecks).toHaveBeenCalledWith(9)
  })

  it('runAll rejects renderer user mismatch', async () => {
    const handler = handlerMap.get('reconciliation:runAll')!
    const result = await handler({}, 999) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
  })

  it('runAll rejects unauthorized role', async () => {
    sessionRole = 'TEACHER'
    clearSessionCache()
    handlerMap.clear()
    registerReconciliationAndBudgetHandlers()
    const handler = handlerMap.get('reconciliation:runAll')!
    const result = await handler({}, 9) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
  })

  // ─── reconciliation:getHistory ──────────────────────────
  it('getHistory uses default limit 30 when undefined', async () => {
    const handler = handlerMap.get('reconciliation:getHistory')!
    await handler({})
    expect(reconciliationServiceMock.getReconciliationHistory).toHaveBeenCalledWith(30)
  })

  it('getHistory passes explicit limit', async () => {
    const handler = handlerMap.get('reconciliation:getHistory')!
    await handler({}, 10)
    expect(reconciliationServiceMock.getReconciliationHistory).toHaveBeenCalledWith(10)
  })

  // ─── reconciliation:getLatest ───────────────────────────
  it('getLatest returns latest summary', async () => {
    reconciliationServiceMock.getLatestReconciliationSummary.mockResolvedValueOnce({ status: 'OK' })
    const handler = handlerMap.get('reconciliation:getLatest')!
    const result = await handler({})
    expect(result).toEqual({ status: 'OK' })
  })

  it('getLatest returns null when no history', async () => {
    const handler = handlerMap.get('reconciliation:getLatest')!
    const result = await handler({})
    expect(result).toBeNull()
  })
})
