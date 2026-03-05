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

vi.mock('../../../security/session', () => ({
  getSession: vi.fn(async () => ({
    user: {
      id: 2,
      role: 'ADMIN'
    }
  }))
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
    expect(result.error).toContain('future')
    expect(bankServiceMock.createStatement).not.toHaveBeenCalled()
  })

  it('bank:createStatement rejects invalid account id', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const handler = handlerMap.get('bank:createStatement')!
    const result = await handler({}, 0, today, 1000, 1200, 'REF-1') as { success: boolean; errors?: string[] }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Validation failed')
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
    expect(result.error).toContain('Exactly one')
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
      description: '  Fee transfer  ',
      reference: null,
      debit_amount: 0,
      credit_amount: 1500,
      running_balance: null
    })
  })

  it('bank:markReconciled rejects invalid IDs before service call', async () => {
    const handler = handlerMap.get('bank:markReconciled')!
    const result = await handler({}, 0, 2) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Validation failed')
    expect(bankServiceMock.markStatementReconciled).not.toHaveBeenCalled()
  })

  // ======= bank:getAccounts =======
  describe('bank:getAccounts', () => {
    it('registers handler', () => {
      expect(handlerMap.has('bank:getAccounts')).toBe(true)
    })

    it('returns bank accounts', async () => {
      bankServiceMock.getBankAccounts.mockReturnValue([{ id: 1, account_name: 'Main Account' }])
      const handler = handlerMap.get('bank:getAccounts')!
      const result = await handler({})
      expect(bankServiceMock.getBankAccounts).toHaveBeenCalled()
      expect(result).toEqual([{ id: 1, account_name: 'Main Account' }])
    })
  })

  // ======= bank:getAccountById =======
  describe('bank:getAccountById', () => {
    it('registers handler', () => {
      expect(handlerMap.has('bank:getAccountById')).toBe(true)
    })

    it('returns account by id', async () => {
      bankServiceMock.getBankAccountById.mockReturnValue({ id: 3, account_name: 'Savings' })
      const handler = handlerMap.get('bank:getAccountById')!
      const result = await handler({}, 3)
      expect(bankServiceMock.getBankAccountById).toHaveBeenCalledWith(3)
      expect(result).toEqual({ id: 3, account_name: 'Savings' })
    })
  })

  // ======= bank:createAccount =======
  describe('bank:createAccount', () => {
    it('registers handler', () => {
      expect(handlerMap.has('bank:createAccount')).toBe(true)
    })

    it('creates bank account with valid data', async () => {
      const handler = handlerMap.get('bank:createAccount')!
      const data = {
        account_name: 'School Main',
        account_number: '1234567890',
        bank_name: 'KCB',
        opening_balance: 50000,
      }
      const result = await handler({}, data) as any
      expect(result.success).toBe(true)
      expect(bankServiceMock.createBankAccount).toHaveBeenCalledWith(
        expect.objectContaining({ account_name: 'School Main', bank_name: 'KCB', opening_balance: 50000 })
      )
    })

    it('passes optional fields (branch, swift_code, currency)', async () => {
      const handler = handlerMap.get('bank:createAccount')!
      const data = {
        account_name: 'USD Account',
        account_number: '9876543210',
        bank_name: 'Equity',
        opening_balance: 10000,
        branch: 'Nairobi',
        swift_code: 'EQBLKENA',
        currency: 'USD'
      }
      await handler({}, data)
      expect(bankServiceMock.createBankAccount).toHaveBeenCalledWith(
        expect.objectContaining({ branch: 'Nairobi', swift_code: 'EQBLKENA', currency: 'USD' })
      )
    })
  })

  // ======= bank:getStatements =======
  describe('bank:getStatements', () => {
    it('registers handler', () => {
      expect(handlerMap.has('bank:getStatements')).toBe(true)
    })

    it('returns statements optionally filtered by account', async () => {
      bankServiceMock.getStatements.mockReturnValue([{ id: 1, date: '2026-01-01' }])
      const handler = handlerMap.get('bank:getStatements')!
      const result = await handler({}, 1)
      expect(bankServiceMock.getStatements).toHaveBeenCalledWith(1)
      expect(result).toEqual([{ id: 1, date: '2026-01-01' }])
    })

    it('returns all statements without filter', async () => {
      const handler = handlerMap.get('bank:getStatements')!
      await handler({})
      expect(bankServiceMock.getStatements).toHaveBeenCalledWith(undefined)
    })
  })

  // ======= bank:getStatementWithLines =======
  describe('bank:getStatementWithLines', () => {
    it('registers handler', () => {
      expect(handlerMap.has('bank:getStatementWithLines')).toBe(true)
    })

    it('returns statement with lines', async () => {
      bankServiceMock.getStatementWithLines.mockReturnValue({ id: 1, lines: [{ id: 1 }] })
      const handler = handlerMap.get('bank:getStatementWithLines')!
      const result = await handler({}, 1)
      expect(bankServiceMock.getStatementWithLines).toHaveBeenCalledWith(1)
      expect(result).toEqual({ id: 1, lines: [{ id: 1 }] })
    })
  })

  // ======= bank:matchTransaction =======
  describe('bank:matchTransaction', () => {
    it('registers handler', () => {
      expect(handlerMap.has('bank:matchTransaction')).toBe(true)
    })

    it('matches a statement line to a ledger transaction', async () => {
      const handler = handlerMap.get('bank:matchTransaction')!
      const result = await handler({}, 10, 20) as any
      expect(result.success).toBe(true)
      expect(bankServiceMock.matchTransaction).toHaveBeenCalledWith(10, 20)
    })
  })

  // ======= bank:unmatchTransaction =======
  describe('bank:unmatchTransaction', () => {
    it('registers handler', () => {
      expect(handlerMap.has('bank:unmatchTransaction')).toBe(true)
    })

    it('unmatches a statement line', async () => {
      const handler = handlerMap.get('bank:unmatchTransaction')!
      const result = await handler({}, 10) as any
      expect(result.success).toBe(true)
      expect(bankServiceMock.unmatchTransaction).toHaveBeenCalledWith(10)
    })
  })

  // ======= bank:getUnmatchedTransactions =======
  describe('bank:getUnmatchedTransactions', () => {
    it('registers handler', () => {
      expect(handlerMap.has('bank:getUnmatchedTransactions')).toBe(true)
    })

    it('returns unmatched ledger transactions', async () => {
      bankServiceMock.getUnmatchedLedgerTransactions.mockReturnValue([{ id: 1, amount: 500 }])
      const handler = handlerMap.get('bank:getUnmatchedTransactions')!
      const result = await handler({}, '2026-01-01', '2026-01-31', 1)
      expect(bankServiceMock.getUnmatchedLedgerTransactions).toHaveBeenCalledWith('2026-01-01', '2026-01-31', 1)
      expect(result).toEqual([{ id: 1, amount: 500 }])
    })
  })

  // ======= bank:markReconciled - renderer mismatch =======
  it('bank:markReconciled rejects renderer user mismatch', async () => {
    const handler = handlerMap.get('bank:markReconciled')!
    const event: any = { __ipcActor: { id: 2, role: 'ADMIN', username: 'u', full_name: 'U', email: null, is_active: 1, created_at: new Date().toISOString() } }
    const result = await handler(event, 1, 999) as any
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
  })

  it('bank:markReconciled passes valid request', async () => {
    const handler = handlerMap.get('bank:markReconciled')!
    const result = await handler({}, 1, 2) as any
    expect(result.success).toBe(true)
    expect(bankServiceMock.markStatementReconciled).toHaveBeenCalledWith(1, 2)
  })
})
