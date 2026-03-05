import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()

const openingBalanceServiceMock = {
  importStudentOpeningBalances: vi.fn().mockResolvedValue({ success: true, message: 'Imported 2 student balances', imported_count: 2 }),
  importGLOpeningBalances: vi.fn().mockResolvedValue({ success: true, message: 'Imported 3 GL balances', imported_count: 3 }),
}

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue(JSON.stringify({
      user: { id: 9, username: 'admin', role: 'ADMIN', full_name: 'Admin', email: 'admin@test.com', is_active: 1, last_login: null, created_at: new Date().toISOString() },
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
      if (name === 'OpeningBalanceService') {
        return openingBalanceServiceMock
      }
      return {}
    })
  }
}))

import { registerOpeningBalanceHandlers } from '../opening-balance-handlers'

type SuccessResult = { success: boolean; error?: string; message?: string; [key: string]: unknown }

describe('opening-balance-handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    openingBalanceServiceMock.importStudentOpeningBalances.mockReset()
    openingBalanceServiceMock.importStudentOpeningBalances.mockResolvedValue({ success: true, message: 'Imported 2 student balances', imported_count: 2 })
    openingBalanceServiceMock.importGLOpeningBalances.mockReset()
    openingBalanceServiceMock.importGLOpeningBalances.mockResolvedValue({ success: true, message: 'Imported 3 GL balances', imported_count: 3 })

    registerOpeningBalanceHandlers()
  })

  afterEach(() => {
    handlerMap.clear()
  })

  // ─── Handler registration ───────────────────────────────────────────

  it('registers all expected opening balance channels', () => {
    expect(handlerMap.has('opening-balance:import-student')).toBe(true)
    expect(handlerMap.has('opening-balance:import-gl')).toBe(true)
  })

  // ─── opening-balance:import-student ─────────────────────────────────

  it('import-student calls service with valid payload', async () => {
    const handler = handlerMap.get('opening-balance:import-student')!
    const balances = [
      { student_id: 1, opening_balance: 5000, balance_type: 'DEBIT' },
      { student_id: 2, opening_balance: 3000, balance_type: 'CREDIT' },
    ]
    const result = await handler({}, balances, 1, 'MANUAL', 9) as SuccessResult

    expect(result.success).toBe(true)
    expect(result.imported_count).toBe(2)
    expect(openingBalanceServiceMock.importStudentOpeningBalances).toHaveBeenCalledTimes(1)

    const call = openingBalanceServiceMock.importStudentOpeningBalances.mock.calls[0]!
    expect(call[1]).toBe(1) // academicYearId
    expect(call[2]).toBe('MANUAL') // importSource
    expect(call[3]).toBe(9) // actor.id
  })

  it('import-student enriches missing optional fields', async () => {
    const handler = handlerMap.get('opening-balance:import-student')!
    const balances = [
      { student_id: 1, opening_balance: 5000, balance_type: 'DEBIT' },
    ]
    await handler({}, balances, 1, 'EXCEL', 9) as SuccessResult

    const call = openingBalanceServiceMock.importStudentOpeningBalances.mock.calls[0]!
    const enrichedBalances = call[0] as Array<{ admission_number: string; student_name: string; description: string }>
    expect(enrichedBalances[0].admission_number).toBe('')
    expect(enrichedBalances[0].student_name).toBe('')
    expect(enrichedBalances[0].description).toBe('')
  })

  it('import-student reports service failure', async () => {
    openingBalanceServiceMock.importStudentOpeningBalances.mockResolvedValueOnce({
      success: false, message: 'Database constraint violation', imported_count: 0
    })

    const handler = handlerMap.get('opening-balance:import-student')!
    const balances = [
      { student_id: 1, opening_balance: 5000, balance_type: 'DEBIT' },
    ]
    const result = await handler({}, balances, 1, 'MANUAL', 9) as SuccessResult

    expect(result.success).toBe(false)
  })

  it('import-student rejects empty balances array', async () => {
    const handler = handlerMap.get('opening-balance:import-student')!
    const result = await handler({}, [], 1, 'MANUAL', 9) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(openingBalanceServiceMock.importStudentOpeningBalances).not.toHaveBeenCalled()
  })

  it('import-student rejects invalid balance type', async () => {
    const handler = handlerMap.get('opening-balance:import-student')!
    const balances = [
      { student_id: 1, opening_balance: 5000, balance_type: 'INVALID' },
    ]
    const result = await handler({}, balances, 1, 'MANUAL', 9) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(openingBalanceServiceMock.importStudentOpeningBalances).not.toHaveBeenCalled()
  })

  it('import-student rejects renderer user mismatch', async () => {
    const handler = handlerMap.get('opening-balance:import-student')!
    const balances = [
      { student_id: 1, opening_balance: 5000, balance_type: 'DEBIT' },
    ]
    // legacyUserId (3) !== actor.id (9) → mismatch
    const result = await handler({}, balances, 1, 'MANUAL', 3) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
    expect(openingBalanceServiceMock.importStudentOpeningBalances).not.toHaveBeenCalled()
  })

  // ─── opening-balance:import-gl ──────────────────────────────────────

  it('import-gl calls service with valid GL payload', async () => {
    const handler = handlerMap.get('opening-balance:import-gl')!
    const balances = [
      { gl_account_code: '4300', debit_amount: 10000, credit_amount: 0, academic_year_id: 1 },
      { gl_account_code: '5100', debit_amount: 0, credit_amount: 5000, academic_year_id: 1 },
    ]
    const result = await handler({}, balances, 9) as SuccessResult

    expect(result.success).toBe(true)
    expect(result.imported_count).toBe(3)
    expect(openingBalanceServiceMock.importGLOpeningBalances).toHaveBeenCalledTimes(1)

    const call = openingBalanceServiceMock.importGLOpeningBalances.mock.calls[0]!
    const enrichedBalances = call[0] as Array<{ imported_from: string; imported_by_user_id: number }>
    expect(enrichedBalances[0].imported_from).toBe('MANUAL')
    expect(enrichedBalances[0].imported_by_user_id).toBe(9)
    expect(call[1]).toBe(9) // actor.id
  })

  it('import-gl reports service failure', async () => {
    openingBalanceServiceMock.importGLOpeningBalances.mockResolvedValueOnce({
      success: false, message: 'Invalid GL account code', imported_count: 0
    })

    const handler = handlerMap.get('opening-balance:import-gl')!
    const balances = [
      { gl_account_code: '9999', debit_amount: 10000, credit_amount: 0, academic_year_id: 1 },
    ]
    const result = await handler({}, balances, 9) as SuccessResult

    expect(result.success).toBe(false)
  })

  it('import-gl rejects renderer user mismatch', async () => {
    const handler = handlerMap.get('opening-balance:import-gl')!
    const balances = [
      { gl_account_code: '4300', debit_amount: 10000, credit_amount: 0, academic_year_id: 1 },
    ]
    // legacyUserId (3) !== actor.id (9) → mismatch
    const result = await handler({}, balances, 3) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
    expect(openingBalanceServiceMock.importGLOpeningBalances).not.toHaveBeenCalled()
  })
})
