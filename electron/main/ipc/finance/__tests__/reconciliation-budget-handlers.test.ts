import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()

const reconciliationServiceMock = {
  runAllChecks: vi.fn().mockResolvedValue({
    run_date: new Date().toISOString(),
    overall_status: 'PASS',
    checks: [],
    summary: { total_checks: 7, passed: 7, failed: 0, warnings: 0 },
  }),
  getReconciliationHistory: vi.fn().mockResolvedValue([]),
  getLatestReconciliationSummary: vi.fn().mockResolvedValue(null),
}

vi.mock('../../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => handlerMap.set(channel, handler)),
    removeHandler: vi.fn(),
  }
}))

vi.mock('../../../security/session', () => ({
  getSession: vi.fn(async () => ({
    user: { id: 9, username: 'admin', role: 'ADMIN', full_name: 'Admin', email: null, is_active: 1, last_login: null, created_at: new Date().toISOString() },
    lastActivity: Date.now()
  }))
}))

vi.mock('../../../database', () => ({
  getDatabase: vi.fn()
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

vi.mock('../../../services/base/ServiceContainer', () => ({
  container: {
    resolve: vi.fn((name: string) => {
      if (name === 'ReconciliationService') {
        return reconciliationServiceMock
      }
      return {}
    })
  }
}))

import { registerReconciliationAndBudgetHandlers } from '../reconciliation-budget-handlers'

describe('reconciliation & budget IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    vi.clearAllMocks()
    registerReconciliationAndBudgetHandlers()
  })

  afterEach(() => {
    handlerMap.clear()
  })

  it('registers all expected reconciliation channels', () => {
    const expectedChannels = [
      'reconciliation:runAll',
      'reconciliation:getHistory',
      'reconciliation:getLatest',
    ]
    for (const channel of expectedChannels) {
      expect(handlerMap.has(channel), `missing handler for ${channel}`).toBe(true)
    }
  })

  it('reconciliation:runAll calls service with actor id', async () => {
    const mockReport = {
      run_date: '2026-03-02T00:00:00.000Z',
      overall_status: 'PASS',
      checks: [{ check_name: 'Trial Balance', status: 'PASS', message: 'Balanced' }],
      summary: { total_checks: 1, passed: 1, failed: 0, warnings: 0 },
    }
    reconciliationServiceMock.runAllChecks.mockResolvedValueOnce(mockReport)

    const handler = handlerMap.get('reconciliation:runAll')!
    const result = await handler({}) as { overall_status: string }

    expect(result.overall_status).toBe('PASS')
    expect(reconciliationServiceMock.runAllChecks).toHaveBeenCalledWith(9) // actor.id from session
  })

  it('reconciliation:runAll rejects renderer user mismatch', async () => {
    const handler = handlerMap.get('reconciliation:runAll')!
    // Pass a legacyUserId that doesn't match the session actor (id=9)
    const result = await handler({}, 999) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
    expect(reconciliationServiceMock.runAllChecks).not.toHaveBeenCalled()
  })

  it('reconciliation:runAll allows matching legacyUserId', async () => {
    reconciliationServiceMock.runAllChecks.mockResolvedValueOnce({
      run_date: new Date().toISOString(),
      overall_status: 'PASS',
      checks: [],
      summary: { total_checks: 0, passed: 0, failed: 0, warnings: 0 },
    })

    const handler = handlerMap.get('reconciliation:runAll')!
    // Pass legacyUserId matching the session actor (id=9)
    const result = await handler({}, 9) as { overall_status: string }

    expect(result.overall_status).toBe('PASS')
    expect(reconciliationServiceMock.runAllChecks).toHaveBeenCalledWith(9)
  })

  it('reconciliation:getHistory returns history with default limit', async () => {
    const mockHistory = [
      { run_date: '2026-03-01', overall_status: 'PASS', checks: [], summary: { total_checks: 7, passed: 7, failed: 0, warnings: 0 } },
    ]
    reconciliationServiceMock.getReconciliationHistory.mockResolvedValueOnce(mockHistory)

    const handler = handlerMap.get('reconciliation:getHistory')!
    const result = await handler({})

    expect(result).toEqual(mockHistory)
    // When no limit passed, handler uses limit || 30
    expect(reconciliationServiceMock.getReconciliationHistory).toHaveBeenCalledWith(30)
  })

  it('reconciliation:getHistory accepts custom limit', async () => {
    reconciliationServiceMock.getReconciliationHistory.mockResolvedValueOnce([])

    const handler = handlerMap.get('reconciliation:getHistory')!
    await handler({}, 10)

    expect(reconciliationServiceMock.getReconciliationHistory).toHaveBeenCalledWith(10)
  })

  it('reconciliation:getLatest returns latest summary', async () => {
    const mockSummary = {
      run_date: '2026-03-02T10:00:00.000Z',
      overall_status: 'WARNING',
      checks: [],
      summary: { total_checks: 7, passed: 6, failed: 0, warnings: 1 },
    }
    reconciliationServiceMock.getLatestReconciliationSummary.mockResolvedValueOnce(mockSummary)

    const handler = handlerMap.get('reconciliation:getLatest')!
    const result = await handler({}) as { overall_status: string }

    expect(result.overall_status).toBe('WARNING')
    expect(reconciliationServiceMock.getLatestReconciliationSummary).toHaveBeenCalledTimes(1)
  })

  it('reconciliation:getLatest returns null when no runs exist', async () => {
    reconciliationServiceMock.getLatestReconciliationSummary.mockResolvedValueOnce(null)

    const handler = handlerMap.get('reconciliation:getLatest')!
    const result = await handler({})

    expect(result).toBeNull()
  })

  it('reconciliation:runAll propagates service error', async () => {
    reconciliationServiceMock.runAllChecks.mockRejectedValueOnce(new Error('Database locked'))

    const handler = handlerMap.get('reconciliation:runAll')!
    const result = await handler({}) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Database locked')
  })
})
