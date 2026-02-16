import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()
let sessionUserId = 14
let sessionRole = 'ACCOUNTS_CLERK'

const boardingServiceMock = {
  getAllFacilities: vi.fn(() => []),
  getActiveFacilities: vi.fn(() => []),
  recordBoardingExpense: vi.fn(() => 1),
  getFacilityExpenses: vi.fn(() => []),
  getExpenseSummaryByType: vi.fn(() => []),
}

const transportServiceMock = {
  getAllRoutes: vi.fn(() => []),
  getActiveRoutes: vi.fn(() => []),
  createRoute: vi.fn(() => 1),
  recordTransportExpense: vi.fn(() => 1),
  getRouteExpenses: vi.fn(() => []),
  getExpenseSummaryByType: vi.fn(() => []),
}

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn(async () => JSON.stringify({
      user: {
        id: sessionUserId,
        username: 'session-user',
        role: sessionRole,
        full_name: 'Session User',
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

vi.mock('../../../services/base/ServiceContainer', () => ({
  container: {
    resolve: vi.fn((name: string) => {
      if (name === 'BoardingCostService') {
        return boardingServiceMock
      }
      if (name === 'TransportCostService') {
        return transportServiceMock
      }
      return {}
    })
  }
}))

import { registerOperationsHandlers } from '../operations-handlers'

describe('operations IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    sessionUserId = 14
    sessionRole = 'ACCOUNTS_CLERK'
    boardingServiceMock.recordBoardingExpense.mockClear()
    registerOperationsHandlers()
  })

  it('operations:boarding:recordExpense rejects renderer actor mismatch', async () => {
    const handler = handlerMap.get('operations:boarding:recordExpense')
    expect(handler).toBeDefined()

    const result = await handler!({}, {
      facility_id: 2,
      gl_account_code: '5100',
      fiscal_year: 2026,
      term: 1,
      amount_cents: 10000,
      expense_type: 'FOOD',
      description: 'Food purchase',
      recorded_by: 3
    }) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
    expect(boardingServiceMock.recordBoardingExpense).not.toHaveBeenCalled()
  })

  it('operations:boarding:recordExpense uses authenticated actor id', async () => {
    const handler = handlerMap.get('operations:boarding:recordExpense')!
    const payload = {
      facility_id: 2,
      gl_account_code: '5100',
      fiscal_year: 2026,
      term: 1,
      amount_cents: 10000,
      expense_type: 'FOOD',
      description: 'Food purchase',
      recorded_by: 14
    }
    const result = await handler({}, payload) as number

    expect(result).toBe(1)
    expect(boardingServiceMock.recordBoardingExpense).toHaveBeenCalledWith(
      expect.objectContaining({ recorded_by: 14 })
    )
  })
})
