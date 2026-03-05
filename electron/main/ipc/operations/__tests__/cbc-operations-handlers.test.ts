import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()

const grantServiceMock = {
  createGrant: vi.fn(() => ({ id: 1, grant_name: 'Capitation Grant' })),
  recordUtilization: vi.fn(() => ({ id: 1, success: true })),
  getGrantSummary: vi.fn(() => ({ id: 1, total_allocated: 500000, total_utilized: 200000 })),
  getGrantsByStatus: vi.fn(() => [{ id: 1, status: 'ACTIVE' }]),
  getExpiringGrants: vi.fn(() => [{ id: 2, days_remaining: 15 }]),
  generateNEMISExport: vi.fn(() => ({ exported: 10, file: 'export.csv' })),
}

const studentCostServiceMock = {
  calculateStudentCost: vi.fn(() => ({ totalCost: 35000 })),
  getCostBreakdown: vi.fn(() => [{ category: 'Tuition', amount: 25000 }]),
  getCostVsRevenue: vi.fn(() => ({ cost: 35000, revenue: 40000, margin: 5000 })),
  getAverageCostPerStudent: vi.fn(() => ({ average: 33000 })),
  getCostTrendAnalysis: vi.fn(() => [{ period: 1, cost: 30000 }, { period: 2, cost: 35000 }]),
}

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue(JSON.stringify({
      user: { id: 1, username: 'admin', role: 'ADMIN', full_name: 'Admin', email: 'a@a.com', is_active: 1, created_at: new Date().toISOString() },
      lastActivity: Date.now()
    })),
    setPassword: vi.fn().mockResolvedValue(null),
    deletePassword: vi.fn().mockResolvedValue(true)
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
  getDatabase: () => ({})
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

vi.mock('../../../services/base/ServiceContainer', () => ({
  container: {
    resolve: vi.fn((name: string) => {
      if (name === 'GrantTrackingService') { return grantServiceMock }
      if (name === 'StudentCostService') { return studentCostServiceMock }
      return {}
    })
  }
}))

import { registerCbcOperationsHandlers } from '../cbc-operations-handlers'

type Result = { success?: boolean; data?: unknown; error?: string; [key: string]: unknown }

async function invoke(channel: string, ...args: unknown[]): Promise<Result> {
  const handler = handlerMap.get(channel)
  if (!handler) { throw new Error(`No handler for ${channel}`) }
  return handler({}, ...args) as Promise<Result>
}

describe('cbc-operations IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    vi.clearAllMocks()
    registerCbcOperationsHandlers()
  })

  it('registers all operations channels', () => {
    expect(handlerMap.has('operations:grants:create')).toBe(true)
    expect(handlerMap.has('operations:grants:recordUtilization')).toBe(true)
    expect(handlerMap.has('operations:grants:getSummary')).toBe(true)
    expect(handlerMap.has('operations:grants:getByStatus')).toBe(true)
    expect(handlerMap.has('operations:grants:getExpiring')).toBe(true)
    expect(handlerMap.has('operations:grants:generateNEMISExport')).toBe(true)
    expect(handlerMap.has('operations:studentCost:calculate')).toBe(true)
    expect(handlerMap.has('operations:studentCost:getBreakdown')).toBe(true)
    expect(handlerMap.has('operations:studentCost:getVsRevenue')).toBe(true)
    expect(handlerMap.has('operations:studentCost:getAverage')).toBe(true)
    expect(handlerMap.has('operations:studentCost:getTrend')).toBe(true)
  })

  it('grants:create creates a new grant', async () => {
    const grantData = {
      grant_name: 'Capitation Grant',
      grant_type: 'CAPITATION' as const,
      amount_allocated: 500000,
      amount_received: 500000,
      fiscal_year: 2025,
      source: 'Government',
      start_date: '2025-01-01',
      end_date: '2025-12-31'
    }
    const result = await invoke('operations:grants:create', grantData)
    expect(result).toEqual({ id: 1, grant_name: 'Capitation Grant' })
    expect(grantServiceMock.createGrant).toHaveBeenCalledWith(grantData, 1)
  })

  it('grants:getSummary returns grant summary', async () => {
    const result = await invoke('operations:grants:getSummary', 1)
    expect(result).toEqual({ id: 1, total_allocated: 500000, total_utilized: 200000 })
  })

  it('grants:getByStatus returns grants filtered by status', async () => {
    const result = await invoke('operations:grants:getByStatus', 'ACTIVE')
    expect(result).toEqual([{ id: 1, status: 'ACTIVE' }])
  })

  it('grants:getByStatus rejects invalid status', async () => {
    const result = await invoke('operations:grants:getByStatus', 'INVALID_STATUS')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid grant status')
  })

  it('studentCost:calculate returns student cost', async () => {
    const result = await invoke('operations:studentCost:calculate', 1, 1, 1)
    expect(result).toEqual({ totalCost: 35000 })
    expect(studentCostServiceMock.calculateStudentCost).toHaveBeenCalledWith(1, 1, 1)
  })

  it('studentCost:getTrend returns cost trend with default periods', async () => {
    const result = await invoke('operations:studentCost:getTrend', 1)
    expect(result).toEqual([{ period: 1, cost: 30000 }, { period: 2, cost: 35000 }])
    expect(studentCostServiceMock.getCostTrendAnalysis).toHaveBeenCalledWith(1, 6)
  })

  it('grants:recordUtilization records grant utilization', async () => {
    const payload = {
      grantId: 1, amount: 50000, utilizationDate: '2025-01-15',
      description: 'Books', glAccountCode: '5000'
    }
    const result = await invoke('operations:grants:recordUtilization', payload)
    expect(result).toEqual({ id: 1, success: true })
    expect(grantServiceMock.recordUtilization).toHaveBeenCalledWith(
      expect.objectContaining({ grantId: 1, amount: 50000, userId: 1 })
    )
  })

  it('grants:getExpiring returns expiring grants', async () => {
    const result = await invoke('operations:grants:getExpiring', 30)
    expect(result).toEqual([{ id: 2, days_remaining: 15 }])
    expect(grantServiceMock.getExpiringGrants).toHaveBeenCalledWith(30)
  })

  it('grants:generateNEMISExport generates export', async () => {
    const result = await invoke('operations:grants:generateNEMISExport', 2025)
    expect(result).toEqual({ exported: 10, file: 'export.csv' })
    expect(grantServiceMock.generateNEMISExport).toHaveBeenCalledWith(2025)
  })

  it('studentCost:getBreakdown returns cost breakdown', async () => {
    const result = await invoke('operations:studentCost:getBreakdown', 1, 1)
    expect(result).toEqual([{ category: 'Tuition', amount: 25000 }])
    expect(studentCostServiceMock.getCostBreakdown).toHaveBeenCalledWith(1, 1)
  })

  it('studentCost:getVsRevenue returns cost vs revenue', async () => {
    const result = await invoke('operations:studentCost:getVsRevenue', 1, 1)
    expect(result).toEqual({ cost: 35000, revenue: 40000, margin: 5000 })
    expect(studentCostServiceMock.getCostVsRevenue).toHaveBeenCalledWith(1, 1)
  })

  it('studentCost:getAverage returns average cost per student', async () => {
    const result = await invoke('operations:studentCost:getAverage', 4, 1)
    expect(result).toEqual({ average: 33000 })
    expect(studentCostServiceMock.getAverageCostPerStudent).toHaveBeenCalledWith(4, 1)
  })

  it('studentCost:getTrend uses explicit periods when provided', async () => {
    await invoke('operations:studentCost:getTrend', 1, 3)
    expect(studentCostServiceMock.getCostTrendAnalysis).toHaveBeenCalledWith(1, 3)
  })

  it('grants:create rejects when legacyUserId mismatches actor', async () => {
    const grantData = {
      grant_name: 'Test', grant_type: 'CAPITATION' as const,
      amount_allocated: 100, amount_received: 100,
      fiscal_year: 2025, source: 'Gov',
      start_date: '2025-01-01', end_date: '2025-12-31'
    }
    const result = await invoke('operations:grants:create', grantData, 999)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
  })

  it('grants:recordUtilization rejects when payload userId mismatches actor', async () => {
    const payload = {
      grantId: 1, amount: 50000, utilizationDate: '2025-01-15',
      description: 'Books', glAccountCode: '5000', userId: 999
    }
    const result = await invoke('operations:grants:recordUtilization', payload)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
  })
})
