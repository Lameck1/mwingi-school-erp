import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>
const handlerMap = new Map<string, IpcHandler>()
const { sessionData } = vi.hoisted(() => ({
  sessionData: {
    userId: 9,
    role: 'ACCOUNTS_CLERK'
  }
}))

const journalServiceMock = {
  getBalanceSheet: vi.fn(async () => ({ assets: [], liabilities: [], equity: [] })),
  getTrialBalance: vi.fn(async () => ({ rows: [] })),
}
const plServiceMock = {
  generateProfitAndLoss: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ revenue: 0, expenses: 0 })),
  generateComparativeProfitAndLoss: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ current: {}, prior: {} })),
  getRevenueBreakdown: vi.fn(async (..._args: unknown[]): Promise<unknown[]> => []),
  getExpenseBreakdown: vi.fn(async (..._args: unknown[]): Promise<unknown[]> => []),
}
const openingBalanceServiceMock = {
  getStudentLedger: vi.fn(async () => ({ opening_balance: 0, transactions: [], closing_balance: 0 })),
}

vi.mock('../../../security/session', () => ({
  getSession: vi.fn(async () => ({
    user: {
      id: sessionData.userId,
      username: 'session-user',
      role: sessionData.role,
      full_name: 'Session User',
      email: null,
      is_active: 1,
      last_login: null,
      created_at: '2026-01-01T00:00:00'
    },
    lastActivity: Date.now()
  }))
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
      if (name === 'DoubleEntryJournalService') {
        return journalServiceMock
      }
      if (name === 'ProfitAndLossService') {
        return plServiceMock
      }
      if (name === 'OpeningBalanceService') {
        return openingBalanceServiceMock
      }
      return {}
    }),
  }
}))

const { changesInNetAssetsMock, kpiDashboardMock } = vi.hoisted(() => ({
  changesInNetAssetsMock: { generateReport: vi.fn(() => ({ changes: [] })) },
  kpiDashboardMock: { generateDashboard: vi.fn(() => ({ kpis: [] })) },
}))

vi.mock('../../../services/reports/ChangesInNetAssetsService', () => ({
  // object-shorthand: function keyword required — method shorthand is not constructable via `new`
  // eslint-disable-next-line object-shorthand
  ChangesInNetAssetsService: function() { return changesInNetAssetsMock }
}))

vi.mock('../../../services/reports/KpiDashboardService', () => ({
  // eslint-disable-next-line object-shorthand
  KpiDashboardService: function() { return kpiDashboardMock }
}))

import { registerFinancialReportsHandlers } from '../financial-reports-handlers'

function attachActor(event: any) {
  event.__ipcActor = {
    id: sessionData.userId,
    role: sessionData.role,
    username: 'session-user',
    full_name: 'Session User',
    email: null,
    is_active: 1,
    created_at: '2026-01-01T00:00:00'
  };
}

describe('financial reports IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    sessionData.userId = 9
    sessionData.role = 'ACCOUNTS_CLERK'
    journalServiceMock.getBalanceSheet.mockReset()
    journalServiceMock.getTrialBalance.mockReset()
    plServiceMock.generateProfitAndLoss.mockReset()
    plServiceMock.generateComparativeProfitAndLoss.mockReset()
    plServiceMock.getRevenueBreakdown.mockReset()
    plServiceMock.getExpenseBreakdown.mockReset()
    openingBalanceServiceMock.getStudentLedger.mockReset()

    journalServiceMock.getBalanceSheet.mockResolvedValue({ assets: [], liabilities: [], equity: [] })
    journalServiceMock.getTrialBalance.mockResolvedValue({ rows: [] })
    plServiceMock.generateProfitAndLoss.mockResolvedValue({ revenue: 0, expenses: 0 })
    plServiceMock.generateComparativeProfitAndLoss.mockResolvedValue({ current: {}, prior: {} })
    plServiceMock.getRevenueBreakdown.mockResolvedValue([])
    plServiceMock.getExpenseBreakdown.mockResolvedValue([])
    openingBalanceServiceMock.getStudentLedger.mockResolvedValue({ opening_balance: 0, transactions: [], closing_balance: 0 })

    registerFinancialReportsHandlers()
  })

  it('reports:getBalanceSheet returns standardized failure contract with error field', async () => {
    journalServiceMock.getBalanceSheet.mockRejectedValueOnce(new Error('db unavailable'))

    const handler = handlerMap.get('reports:getBalanceSheet')
    expect(handler).toBeDefined()
    const event = {};
    attachActor(event);
    const result = await handler!(event, '2026-02-13') as { success: boolean; error?: string; message?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to generate balance sheet')
    expect(result).not.toHaveProperty('message')
  })

  it('reports:getTrialBalance returns success payload in data wrapper', async () => {
    const handler = handlerMap.get('reports:getTrialBalance')
    expect(handler).toBeDefined()

    const event = {};
    attachActor(event);
    const result = await handler!(event, '2026-01-01', '2026-01-31') as {
      success: boolean
      data?: { rows: unknown[] }
    }
    expect(result.success).toBe(true)
    expect(result.data?.rows).toEqual([])
    expect(journalServiceMock.getTrialBalance).toHaveBeenCalledWith('2026-01-01', '2026-01-31')
  })

  it('reports:getStudentLedger passes through parameters to OpeningBalanceService', async () => {
    const handler = handlerMap.get('reports:getStudentLedger')
    expect(handler).toBeDefined()

    const event = {};
    attachActor(event);
    const result = await handler!(event, 11, 2026, '2026-01-01', '2026-03-31') as { success: boolean }
    expect(result.success).toBe(true)
    expect(openingBalanceServiceMock.getStudentLedger).toHaveBeenCalledWith(11, 2026, '2026-01-01', '2026-03-31')
  })

  it('reports:getProfitAndLoss enforces finance-role access', async () => {
    sessionData.role = 'TEACHER'
    const handler = handlerMap.get('reports:getProfitAndLoss')
    expect(handler).toBeDefined()
    const result = await handler!({}, '2026-01-01', '2026-01-31') as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
    expect(plServiceMock.generateProfitAndLoss).not.toHaveBeenCalled()
  })

  it('reports:getBalanceSheet returns success with data on success', async () => {
    const handler = handlerMap.get('reports:getBalanceSheet')!
    const event = {}
    attachActor(event)
    const result = await handler(event, '2026-03-31') as { success: boolean; data: unknown }
    expect(result.success).toBe(true)
    expect(result.data).toEqual({ assets: [], liabilities: [], equity: [] })
    expect(journalServiceMock.getBalanceSheet).toHaveBeenCalledWith('2026-03-31')
  })

  it('reports:getProfitAndLoss returns success with P&L data', async () => {
    plServiceMock.generateProfitAndLoss.mockResolvedValueOnce({ revenue: 100000, expenses: 60000 })
    const handler = handlerMap.get('reports:getProfitAndLoss')!
    const event = {}
    attachActor(event)
    const result = await handler(event, '2026-01-01', '2026-03-31') as { success: boolean; data: { revenue: number } }
    expect(result.success).toBe(true)
    expect(result.data.revenue).toBe(100000)
    expect(plServiceMock.generateProfitAndLoss).toHaveBeenCalledWith('2026-01-01', '2026-03-31')
  })

  it('reports:getComparativeProfitAndLoss compares two periods', async () => {
    plServiceMock.generateComparativeProfitAndLoss.mockResolvedValueOnce({ current: { revenue: 100 }, prior: { revenue: 80 } })
    const handler = handlerMap.get('reports:getComparativeProfitAndLoss')!
    const event = {}
    attachActor(event)
    const result = await handler(event, '2026-01-01', '2026-03-31', '2025-01-01', '2025-03-31') as { success: boolean; data: unknown }
    expect(result.success).toBe(true)
    expect(plServiceMock.generateComparativeProfitAndLoss).toHaveBeenCalledWith('2026-01-01', '2026-03-31', '2025-01-01', '2025-03-31')
  })

  it('reports:getRevenueBreakdown returns revenue categories', async () => {
    plServiceMock.getRevenueBreakdown.mockResolvedValueOnce([{ category: 'Tuition', amount: 80000 }])
    const handler = handlerMap.get('reports:getRevenueBreakdown')!
    const event = {}
    attachActor(event)
    const result = await handler(event, '2026-01-01', '2026-03-31') as { success: boolean; data: unknown[] }
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
    expect(plServiceMock.getRevenueBreakdown).toHaveBeenCalledWith('2026-01-01', '2026-03-31')
  })

  it('reports:getExpenseBreakdown returns expense categories', async () => {
    plServiceMock.getExpenseBreakdown.mockResolvedValueOnce([{ category: 'Salaries', amount: 50000 }])
    const handler = handlerMap.get('reports:getExpenseBreakdown')!
    const event = {}
    attachActor(event)
    const result = await handler(event, '2026-01-01', '2026-03-31') as { success: boolean; data: unknown[] }
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
    expect(plServiceMock.getExpenseBreakdown).toHaveBeenCalledWith('2026-01-01', '2026-03-31')
  })

  it('reports:getChangesInNetAssets generates IPSAS report', async () => {
    const handler = handlerMap.get('reports:getChangesInNetAssets')!
    const event = {}
    attachActor(event)
    const result = await handler(event, '2026-01-01', '2026-03-31') as { success: boolean; data: unknown }
    expect(result.success).toBe(true)
    expect(changesInNetAssetsMock.generateReport).toHaveBeenCalledWith('2026-01-01', '2026-03-31')
  })

  it('reports:getKpiDashboard returns KPI data for management', async () => {
    sessionData.role = 'PRINCIPAL'
    const handler = handlerMap.get('reports:getKpiDashboard')!
    const event = {}
    attachActor(event)
    const result = await handler(event) as { success: boolean; data: unknown }
    expect(result.success).toBe(true)
    expect(kpiDashboardMock.generateDashboard).toHaveBeenCalled()
  })

  it('reports:getKpiDashboard rejects non-management roles', async () => {
    sessionData.role = 'TEACHER'
    const handler = handlerMap.get('reports:getKpiDashboard')!
    const result = await handler({}) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
  })

  it('reports:getTrialBalance returns error on service failure', async () => {
    journalServiceMock.getTrialBalance.mockRejectedValueOnce(new Error('data corruption'))
    const handler = handlerMap.get('reports:getTrialBalance')!
    const event = {}
    attachActor(event)
    const result = await handler(event, '2026-01-01', '2026-01-31') as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to generate trial balance')
  })

  // ─── Error catch paths for uncovered lines ───────────────────────

  it('reports:getProfitAndLoss returns error on service failure', async () => {
    plServiceMock.generateProfitAndLoss.mockRejectedValueOnce(new Error('P&L error'))
    const handler = handlerMap.get('reports:getProfitAndLoss')!
    const event = {}
    attachActor(event)
    const result = await handler(event, '2026-01-01', '2026-03-31') as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to generate P&L')
  })

  it('reports:getComparativeProfitAndLoss returns error on service failure', async () => {
    plServiceMock.generateComparativeProfitAndLoss.mockRejectedValueOnce(new Error('data error'))
    const handler = handlerMap.get('reports:getComparativeProfitAndLoss')!
    const event = {}
    attachActor(event)
    const result = await handler(event, '2026-01-01', '2026-03-31', '2025-01-01', '2025-03-31') as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to generate comparative P&L')
  })

  it('reports:getRevenueBreakdown returns error on service failure', async () => {
    plServiceMock.getRevenueBreakdown.mockRejectedValueOnce(new Error('data error'))
    const handler = handlerMap.get('reports:getRevenueBreakdown')!
    const event = {}
    attachActor(event)
    const result = await handler(event, '2026-01-01', '2026-03-31') as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to get revenue breakdown')
  })

  it('reports:getExpenseBreakdown returns error on service failure', async () => {
    plServiceMock.getExpenseBreakdown.mockRejectedValueOnce(new Error('data error'))
    const handler = handlerMap.get('reports:getExpenseBreakdown')!
    const event = {}
    attachActor(event)
    const result = await handler(event, '2026-01-01', '2026-03-31') as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to get expense breakdown')
  })

  it('reports:getStudentLedger returns error on service failure', async () => {
    openingBalanceServiceMock.getStudentLedger.mockRejectedValueOnce(new Error('ledger error'))
    const handler = handlerMap.get('reports:getStudentLedger')!
    const event = {}
    attachActor(event)
    const result = await handler(event, 11, 2026, '2026-01-01', '2026-03-31') as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to generate student ledger')
  })

  it('reports:getChangesInNetAssets returns error on service failure', async () => {
    changesInNetAssetsMock.generateReport.mockImplementation(() => { throw new Error('IPSAS error') })
    const handler = handlerMap.get('reports:getChangesInNetAssets')!
    const event = {}
    attachActor(event)
    const result = await handler(event, '2026-01-01', '2026-03-31') as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to generate Changes in Net Assets')
  })

  it('reports:getKpiDashboard returns error on service failure', async () => {
    sessionData.role = 'PRINCIPAL'
    kpiDashboardMock.generateDashboard.mockImplementation(() => { throw new Error('KPI error') })
    const handler = handlerMap.get('reports:getKpiDashboard')!
    const event = {}
    attachActor(event)
    const result = await handler(event) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to generate KPI Dashboard')
  })
})
