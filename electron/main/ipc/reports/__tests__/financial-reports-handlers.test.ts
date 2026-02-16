import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>
const handlerMap = new Map<string, IpcHandler>()
let sessionUserId = 9
let sessionRole = 'ACCOUNTS_CLERK'

const journalServiceMock = {
  getBalanceSheet: vi.fn(async () => ({ assets: [], liabilities: [], equity: [] })),
  getTrialBalance: vi.fn(async () => ({ rows: [] })),
}
const plServiceMock = {
  generateProfitAndLoss: vi.fn(async () => ({ revenue: 0, expenses: 0 })),
  generateComparativeProfitAndLoss: vi.fn(async () => ({ current: {}, prior: {} })),
  getRevenueBreakdown: vi.fn(async () => []),
  getExpenseBreakdown: vi.fn(async () => []),
}
const openingBalanceServiceMock = {
  getStudentLedger: vi.fn(async () => ({ opening_balance: 0, transactions: [], closing_balance: 0 })),
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

import { registerFinancialReportsHandlers } from '../financial-reports-handlers'

describe('financial reports IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    sessionUserId = 9
    sessionRole = 'ACCOUNTS_CLERK'
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
    const result = await handler!({}, '2026-02-13') as { success: boolean; error?: string; message?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to generate balance sheet')
    expect(result).not.toHaveProperty('message')
  })

  it('reports:getTrialBalance returns success payload in data wrapper', async () => {
    const handler = handlerMap.get('reports:getTrialBalance')
    expect(handler).toBeDefined()

    const result = await handler!({}, '2026-01-01', '2026-01-31') as {
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

    const result = await handler!({}, 11, 2026, '2026-01-01', '2026-03-31') as { success: boolean }
    expect(result.success).toBe(true)
    expect(openingBalanceServiceMock.getStudentLedger).toHaveBeenCalledWith(11, 2026, '2026-01-01', '2026-03-31')
  })

  it('reports:getProfitAndLoss enforces finance-role access', async () => {
    sessionRole = 'TEACHER'
    const handler = handlerMap.get('reports:getProfitAndLoss')
    expect(handler).toBeDefined()
    const result = await handler!({}, '2026-01-01', '2026-01-31') as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
    expect(plServiceMock.generateProfitAndLoss).not.toHaveBeenCalled()
  })
})
