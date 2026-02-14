import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>
const handlerMap = new Map<string, IpcHandler>()

const bankServiceMock = {
  getBankAccounts: vi.fn(() => []),
  getBankAccountById: vi.fn(() => null),
  createBankAccount: vi.fn(() => ({ success: true, id: 1 })),
  getStatements: vi.fn(() => []),
  getStatementWithLines: vi.fn(() => null),
  createStatement: vi.fn(() => ({ success: true, id: 1 })),
  addStatementLine: vi.fn(() => ({ success: true, id: 1 })),
  matchTransaction: vi.fn(() => ({ success: true })),
  unmatchTransaction: vi.fn(() => ({ success: true })),
  getUnmatchedLedgerTransactions: vi.fn(() => []),
  markStatementReconciled: vi.fn(() => ({ success: true })),
}

vi.mock('../../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => handlerMap.set(channel, handler)),
    removeHandler: vi.fn(),
  }
}))

vi.mock('../../../services/base/ServiceContainer', () => ({
  container: {
    resolve: vi.fn(() => bankServiceMock)
  }
}))

import { registerBankReconciliationHandlers } from '../bank-handlers'

describe('bank handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    bankServiceMock.createStatement.mockClear()
    bankServiceMock.addStatementLine.mockClear()
    bankServiceMock.markStatementReconciled.mockClear()
    registerBankReconciliationHandlers()
  })

  it('bank:createStatement rejects future statement date', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const handler = handlerMap.get('bank:createStatement')!
    const result = await handler({}, 1, tomorrow, 1000, 1200, 'REF-1') as { success: boolean; errors?: string[] }
    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('future')
    expect(bankServiceMock.createStatement).not.toHaveBeenCalled()
  })

  it('bank:createStatement rejects invalid account id', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const handler = handlerMap.get('bank:createStatement')!
    const result = await handler({}, 0, today, 1000, 1200, 'REF-1') as { success: boolean; errors?: string[] }
    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('Invalid Bank account ID')
    expect(bankServiceMock.createStatement).not.toHaveBeenCalled()
  })

  it('bank:createStatement passes validated payload to service', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const handler = handlerMap.get('bank:createStatement')!
    const result = await handler({}, 1, today, 1000, 1200, 'REF-1') as { success: boolean; id?: number }
    expect(result.success).toBe(true)
    expect(bankServiceMock.createStatement).toHaveBeenCalledWith(1, today, 1000, 1200, 'REF-1')
  })

  it('bank:addStatementLine rejects invalid debit/credit exclusivity', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const handler = handlerMap.get('bank:addStatementLine')!
    const result = await handler({}, 1, {
      transaction_date: today,
      description: 'Invalid line',
      debit_amount: 100,
      credit_amount: 200,
      running_balance: 1000
    }) as { success: boolean; errors?: string[] }

    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('Exactly one')
    expect(bankServiceMock.addStatementLine).not.toHaveBeenCalled()
  })

  it('bank:addStatementLine passes normalized payload when valid', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const handler = handlerMap.get('bank:addStatementLine')!
    const result = await handler({}, 2, {
      transaction_date: today,
      description: '  Fee transfer  ',
      reference: undefined,
      debit_amount: 0,
      credit_amount: 1500,
      running_balance: null
    }) as { success: boolean; id?: number }

    expect(result.success).toBe(true)
    expect(bankServiceMock.addStatementLine).toHaveBeenCalledWith(2, {
      transaction_date: today,
      description: 'Fee transfer',
      reference: null,
      debit_amount: 0,
      credit_amount: 1500,
      running_balance: null
    })
  })

  it('bank:markReconciled rejects invalid IDs before service call', async () => {
    const handler = handlerMap.get('bank:markReconciled')!
    const result = await handler({}, 0, 0) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid Statement ID')
    expect(bankServiceMock.markStatementReconciled).not.toHaveBeenCalled()
  })
})
