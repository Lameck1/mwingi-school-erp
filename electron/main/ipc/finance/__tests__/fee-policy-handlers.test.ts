import Database from 'better-sqlite3'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

let db: Database.Database
const handlerMap = new Map<string, IpcHandler>()

const { installmentServiceMock, voteHeadServiceMock } = vi.hoisted(() => ({
  installmentServiceMock: {
    createPolicy: vi.fn().mockReturnValue({ success: true, id: 1 }),
    getPoliciesForTerm: vi.fn().mockReturnValue([]),
    getInstallmentSchedule: vi.fn().mockReturnValue([]),
    deactivatePolicy: vi.fn().mockReturnValue({ success: true })
  },
  voteHeadServiceMock: {
    getVoteHeadBalance: vi.fn().mockReturnValue([])
  }
}))

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue(JSON.stringify({
      user: { id: 7, username: 'bursar', role: 'ACCOUNTS_CLERK', full_name: 'Bursar', email: 'bursar@test.com', is_active: 1, last_login: null, created_at: new Date().toISOString() },
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
  getDatabase: () => db
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

vi.mock('../../../services/finance/InstallmentPolicyService', () => ({
  InstallmentPolicyService: class {
    createPolicy = installmentServiceMock.createPolicy
    getPoliciesForTerm = installmentServiceMock.getPoliciesForTerm
    getInstallmentSchedule = installmentServiceMock.getInstallmentSchedule
    deactivatePolicy = installmentServiceMock.deactivatePolicy
  }
}))

vi.mock('../../../services/finance/VoteHeadSpreadingService', () => ({
  VoteHeadSpreadingService: class {
    getVoteHeadBalance = voteHeadServiceMock.getVoteHeadBalance
  }
}))

import { registerFeePolicyHandlers } from '../fee-policy-handlers'

describe('fee-policy IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    installmentServiceMock.createPolicy.mockClear()
    installmentServiceMock.createPolicy.mockReturnValue({ success: true, id: 1 })
    installmentServiceMock.getPoliciesForTerm.mockClear()
    installmentServiceMock.getPoliciesForTerm.mockReturnValue([])
    installmentServiceMock.getInstallmentSchedule.mockClear()
    installmentServiceMock.getInstallmentSchedule.mockReturnValue([])
    installmentServiceMock.deactivatePolicy.mockClear()
    installmentServiceMock.deactivatePolicy.mockReturnValue({ success: true })
    voteHeadServiceMock.getVoteHeadBalance.mockClear()
    voteHeadServiceMock.getVoteHeadBalance.mockReturnValue([])

    db = new Database(':memory:')
    registerFeePolicyHandlers()
  })

  afterEach(() => {
    if (db) { db.close() }
  })

  it('should register all fee policy handlers', () => {
    expect(handlerMap.has('feePolicy:createInstallmentPolicy')).toBe(true)
    expect(handlerMap.has('feePolicy:getPoliciesForTerm')).toBe(true)
    expect(handlerMap.has('feePolicy:getSchedule')).toBe(true)
    expect(handlerMap.has('feePolicy:deactivatePolicy')).toBe(true)
    expect(handlerMap.has('feePolicy:getVoteHeadBalances')).toBe(true)
  })

  it('feePolicy:createInstallmentPolicy should call service with valid data', async () => {
    const handler = handlerMap.get('feePolicy:createInstallmentPolicy')!
    const result = await handler({}, {
      policy_name: 'Test Plan',
      academic_year_id: 1,
      student_type: 'ALL',
      schedules: [
        { installment_number: 1, percentage: 50, due_date: '2026-02-01' },
        { installment_number: 2, percentage: 50, due_date: '2026-04-01' }
      ]
    }) as { success: boolean; id?: number }

    expect(result.success).toBe(true)
    expect(installmentServiceMock.createPolicy).toHaveBeenCalledTimes(1)
  })

  it('feePolicy:createInstallmentPolicy should reject invalid policy_name', async () => {
    const handler = handlerMap.get('feePolicy:createInstallmentPolicy')!
    const result = await handler({}, {
      policy_name: 'ab',
      academic_year_id: 1,
      student_type: 'ALL',
      schedules: [
        { installment_number: 1, percentage: 50, due_date: '2026-02-01' },
        { installment_number: 2, percentage: 50, due_date: '2026-04-01' }
      ]
    }) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Validation failed')
  })

  it('feePolicy:createInstallmentPolicy should reject single installment', async () => {
    const handler = handlerMap.get('feePolicy:createInstallmentPolicy')!
    const result = await handler({}, {
      policy_name: 'Single Plan',
      academic_year_id: 1,
      student_type: 'ALL',
      schedules: [
        { installment_number: 1, percentage: 100, due_date: '2026-02-01' }
      ]
    }) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Validation failed')
  })

  it('feePolicy:getPoliciesForTerm should return policies', async () => {
    installmentServiceMock.getPoliciesForTerm.mockReturnValue([
      { id: 1, policy_name: 'Plan A', academic_year_id: 1, student_type: 'ALL', number_of_installments: 2, is_active: 1 }
    ])

    const handler = handlerMap.get('feePolicy:getPoliciesForTerm')!
    const result = await handler({}, { academicYearId: 1 }) as { success: boolean; data: unknown[] }

    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
  })

  it('feePolicy:getSchedule should return schedule for a policy', async () => {
    installmentServiceMock.getInstallmentSchedule.mockReturnValue([
      { id: 1, policy_id: 1, installment_number: 1, percentage: 50, due_date: '2026-02-01' },
      { id: 2, policy_id: 1, installment_number: 2, percentage: 50, due_date: '2026-04-01' }
    ])

    const handler = handlerMap.get('feePolicy:getSchedule')!
    const result = await handler({}, 1) as { success: boolean; data: unknown[] }

    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(2)
  })

  it('feePolicy:deactivatePolicy should call service', async () => {
    const handler = handlerMap.get('feePolicy:deactivatePolicy')!
    const result = await handler({}, 1) as { success: boolean }

    expect(result.success).toBe(true)
    expect(installmentServiceMock.deactivatePolicy).toHaveBeenCalledTimes(1)
  })

  it('feePolicy:getVoteHeadBalances should return balances for invoice', async () => {
    voteHeadServiceMock.getVoteHeadBalance.mockReturnValue([
      { fee_category_id: 1, category_name: 'Tuition', total_charged: 50000, total_paid: 20000, outstanding: 30000 }
    ])

    const handler = handlerMap.get('feePolicy:getVoteHeadBalances')!
    const result = await handler({}, 1) as { success: boolean; data: unknown[] }

    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
  })

  // ─── Error catch branches ──────────────────────────────────────────

  it('feePolicy:createInstallmentPolicy handles service error', async () => {
    installmentServiceMock.createPolicy.mockImplementation(() => { throw new Error('DB failure') })
    const handler = handlerMap.get('feePolicy:createInstallmentPolicy')!
    const result = await handler({}, {
      policy_name: 'Error Plan',
      academic_year_id: 1,
      student_type: 'ALL',
      schedules: [
        { installment_number: 1, percentage: 50, due_date: '2026-02-01' },
        { installment_number: 2, percentage: 50, due_date: '2026-04-01' }
      ]
    }) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('DB failure')
  })

  it('feePolicy:createInstallmentPolicy preserves defined stream_id', async () => {
    const handler = handlerMap.get('feePolicy:createInstallmentPolicy')!
    const result = await handler({}, {
      policy_name: 'Streamed Plan',
      academic_year_id: 1,
      student_type: 'ALL',
      stream_id: 1,
      schedules: [
        { installment_number: 1, percentage: 50, due_date: '2026-02-01' },
        { installment_number: 2, percentage: 50, due_date: '2026-04-01' }
      ]
    }) as { success: boolean }
    expect(result.success).toBe(true)
    const callArgs = installmentServiceMock.createPolicy.mock.calls[0]
    expect(callArgs[0]).toHaveProperty('stream_id', 1)
  })

  it('feePolicy:getPoliciesForTerm handles service error', async () => {
    installmentServiceMock.getPoliciesForTerm.mockImplementation(() => { throw new Error('Query failed') })
    const handler = handlerMap.get('feePolicy:getPoliciesForTerm')!
    const result = await handler({}, { academicYearId: 1 }) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Query failed')
  })

  it('feePolicy:getSchedule handles service error', async () => {
    installmentServiceMock.getInstallmentSchedule.mockImplementation(() => { throw new Error('Schedule error') })
    const handler = handlerMap.get('feePolicy:getSchedule')!
    const result = await handler({}, 1) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Schedule error')
  })

  it('feePolicy:deactivatePolicy handles service error', async () => {
    installmentServiceMock.deactivatePolicy.mockImplementation(() => { throw new Error('Deactivate error') })
    const handler = handlerMap.get('feePolicy:deactivatePolicy')!
    const result = await handler({}, 1) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Deactivate error')
  })

  it('feePolicy:getVoteHeadBalances handles service error', async () => {
    voteHeadServiceMock.getVoteHeadBalance.mockImplementation(() => { throw new Error('Balance error') })
    const handler = handlerMap.get('feePolicy:getVoteHeadBalances')!
    const result = await handler({}, 1) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Balance error')
  })

  // ── branch coverage: stream_id undefined path (line 24) ──
  it('feePolicy:createInstallmentPolicy strips undefined stream_id from data', async () => {
    const handler = handlerMap.get('feePolicy:createInstallmentPolicy')!
    const result = await handler({}, {
      policy_name: 'No Stream Plan',
      academic_year_id: 1,
      student_type: 'ALL',
      stream_id: undefined,
      schedules: [
        { installment_number: 1, percentage: 50, due_date: '2026-02-01' },
        { installment_number: 2, percentage: 50, due_date: '2026-04-01' }
      ]
    }) as { success: boolean }
    expect(result.success).toBe(true)
    const callArgs = installmentServiceMock.createPolicy.mock.calls[0]
    expect(callArgs[0]).not.toHaveProperty('stream_id')
  })

  // ── branch coverage: getPoliciesForTerm catch path (line 42) ──
  it('feePolicy:getPoliciesForTerm catches thrown TypeError', async () => {
    installmentServiceMock.getPoliciesForTerm.mockImplementation(() => {
      throw new TypeError('Cannot read property of null')
    })
    const handler = handlerMap.get('feePolicy:getPoliciesForTerm')!
    const result = await handler({}, { academicYearId: 2 }) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Cannot read property of null')
  })
})
