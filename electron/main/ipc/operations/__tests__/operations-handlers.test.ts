import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSessionCache } from '../../../security/session'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()
let sessionUserId = 14
let sessionRole = 'ACCOUNTS_CLERK'
const validIsoDate = new Date().toISOString();

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
        created_at: validIsoDate
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
    clearSessionCache()
    vi.clearAllMocks()
    registerOperationsHandlers()
  })

  // ========== BOARDING ==========

  it('operations:boarding:getAllFacilities calls service', async () => {
    const handler = handlerMap.get('operations:boarding:getAllFacilities')!
    await handler({})
    expect(boardingServiceMock.getAllFacilities).toHaveBeenCalled()
  })

  it('operations:boarding:getActiveFacilities calls service', async () => {
    const handler = handlerMap.get('operations:boarding:getActiveFacilities')!
    await handler({})
    expect(boardingServiceMock.getActiveFacilities).toHaveBeenCalled()
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

  it('operations:boarding:getExpenses calls service with args', async () => {
    const handler = handlerMap.get('operations:boarding:getExpenses')!
    await handler({}, 1, 2026, 2)
    expect(boardingServiceMock.getFacilityExpenses).toHaveBeenCalledWith(1, 2026, 2)
  })

  it('operations:boarding:getExpenses works without optional term', async () => {
    const handler = handlerMap.get('operations:boarding:getExpenses')!
    await handler({}, 1, 2026)
    expect(boardingServiceMock.getFacilityExpenses).toHaveBeenCalledWith(1, 2026, undefined)
  })

  it('operations:boarding:getExpenseSummary calls service with args', async () => {
    const handler = handlerMap.get('operations:boarding:getExpenseSummary')!
    await handler({}, 3, 2026, 1)
    expect(boardingServiceMock.getExpenseSummaryByType).toHaveBeenCalledWith(3, 2026, 1)
  })

  // ========== TRANSPORT ==========

  it('operations:transport:getAllRoutes calls service', async () => {
    const handler = handlerMap.get('operations:transport:getAllRoutes')!
    await handler({})
    expect(transportServiceMock.getAllRoutes).toHaveBeenCalled()
  })

  it('operations:transport:getActiveRoutes calls service', async () => {
    const handler = handlerMap.get('operations:transport:getActiveRoutes')!
    await handler({})
    expect(transportServiceMock.getActiveRoutes).toHaveBeenCalled()
  })

  it('operations:transport:createRoute calls service with canonical schema', async () => {
    const handler = handlerMap.get('operations:transport:createRoute')!
    await handler({}, {
      route_name: 'Route A',
      distance_km: 25,
      estimated_students: 40,
      budget_per_term_cents: 50000,
      vehicle_registration: 'KAA 123B'
    })
    expect(transportServiceMock.createRoute).toHaveBeenCalledWith(
      expect.objectContaining({ route_name: 'Route A', distance_km: 25 })
    )
  })

  it('operations:transport:createRoute transforms legacy schema', async () => {
    const handler = handlerMap.get('operations:transport:createRoute')!
    await handler({}, {
      route_name: 'Route B',
      cost_per_term: 30000
    })
    expect(transportServiceMock.createRoute).toHaveBeenCalledWith(
      expect.objectContaining({ route_name: 'Route B', distance_km: 0, budget_per_term_cents: 30000 })
    )
  })

  it('operations:transport:recordExpense calls service with valid data', async () => {
    const handler = handlerMap.get('operations:transport:recordExpense')!
    await handler({}, {
      route_id: 1,
      gl_account_code: '5200',
      fiscal_year: 2026,
      term: 2,
      amount_cents: 5000,
      expense_type: 'FUEL',
      description: 'Diesel',
      recorded_by: 14
    })
    expect(transportServiceMock.recordTransportExpense).toHaveBeenCalledWith(
      expect.objectContaining({ route_id: 1, recorded_by: 14 })
    )
  })

  it('operations:transport:recordExpense rejects actor mismatch', async () => {
    const handler = handlerMap.get('operations:transport:recordExpense')!
    const result = await handler({}, {
      route_id: 1,
      gl_account_code: '5200',
      fiscal_year: 2026,
      term: 2,
      amount_cents: 5000,
      expense_type: 'FUEL',
      description: 'Diesel',
      recorded_by: 999
    }) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
  })

  it('operations:transport:getExpenses calls service', async () => {
    const handler = handlerMap.get('operations:transport:getExpenses')!
    await handler({}, 2, 2026, 3)
    expect(transportServiceMock.getRouteExpenses).toHaveBeenCalledWith(2, 2026, 3)
  })

  it('operations:transport:getExpenseSummary calls service', async () => {
    const handler = handlerMap.get('operations:transport:getExpenseSummary')!
    await handler({}, 2, 2026, 1)
    expect(transportServiceMock.getExpenseSummaryByType).toHaveBeenCalledWith(2, 2026, 1)
  })

  // ── Coverage: boarding:recordExpense with optional payment_method ──
  it('operations:boarding:recordExpense includes payment_method when set', async () => {
    const handler = handlerMap.get('operations:boarding:recordExpense')!
    const payload = {
      facility_id: 2,
      gl_account_code: '5100',
      fiscal_year: 2026,
      term: 1,
      amount_cents: 10000,
      expense_type: 'FOOD',
      description: 'Food purchase',
      recorded_by: 14,
      payment_method: 'CASH'
    }
    await handler({}, payload)
    expect(boardingServiceMock.recordBoardingExpense).toHaveBeenCalledWith(
      expect.objectContaining({ payment_method: 'CASH' })
    )
  })

  // ── Coverage: transport:createRoute with optional driver_id ──
  it('operations:transport:createRoute with driver_id', async () => {
    const handler = handlerMap.get('operations:transport:createRoute')!
    await handler({}, {
      route_name: 'Route C',
      distance_km: 15,
      estimated_students: 30,
      budget_per_term_cents: 40000,
      driver_id: 7
    })
    expect(transportServiceMock.createRoute).toHaveBeenCalledWith(
      expect.objectContaining({ route_name: 'Route C', driver_id: 7 })
    )
  })
})
