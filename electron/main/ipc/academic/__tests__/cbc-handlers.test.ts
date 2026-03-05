import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()

const cbcServiceMock = {
  getAllStrands: vi.fn(() => [{ id: 1, name: 'Digital Literacy' }]),
  getActiveStrands: vi.fn(() => [{ id: 1, name: 'Digital Literacy', is_active: true }]),
  linkFeeCategoryToStrand: vi.fn(() => 1),
  recordStrandExpense: vi.fn(() => 42),
  getStrandProfitability: vi.fn(() => [{ strand_id: 1, profit: 50000 }]),
  recordStudentParticipation: vi.fn(() => 10),
  getStudentParticipations: vi.fn(() => [{ id: 10, student_id: 1, strand_id: 1 }]),
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
      if (name === 'CBCStrandService') { return cbcServiceMock }
      return {}
    })
  }
}))

import { registerCBCHandlers } from '../cbc-handlers'

type Result = { success?: boolean; data?: unknown; error?: string; [key: string]: unknown }

async function invoke(channel: string, ...args: unknown[]): Promise<Result> {
  const handler = handlerMap.get(channel)
  if (!handler) { throw new Error(`No handler for ${channel}`) }
  return handler({}, ...args) as Promise<Result>
}

describe('CBC IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    vi.clearAllMocks()
    registerCBCHandlers()
  })

  it('registers all CBC channels', () => {
    expect(handlerMap.has('cbc:getStrands')).toBe(true)
    expect(handlerMap.has('cbc:getActiveStrands')).toBe(true)
    expect(handlerMap.has('cbc:linkFeeCategory')).toBe(true)
    expect(handlerMap.has('cbc:recordExpense')).toBe(true)
    expect(handlerMap.has('cbc:getProfitabilityReport')).toBe(true)
    expect(handlerMap.has('cbc:recordParticipation')).toBe(true)
    expect(handlerMap.has('cbc:getStudentParticipations')).toBe(true)
  })

  it('getStrands returns all strands', async () => {
    const result = await invoke('cbc:getStrands')
    expect(result.success).toBe(true)
    expect(result.data).toEqual([{ id: 1, name: 'Digital Literacy' }])
  })

  it('getActiveStrands returns active strands', async () => {
    const result = await invoke('cbc:getActiveStrands')
    expect(result.success).toBe(true)
    expect(result.data).toEqual([{ id: 1, name: 'Digital Literacy', is_active: true }])
  })

  it('linkFeeCategory links a fee to a strand', async () => {
    const result = await invoke('cbc:linkFeeCategory', 1, 1, 50)
    expect(result.success).toBe(true)
    expect(result.data).toBe(1)
    expect(cbcServiceMock.linkFeeCategoryToStrand).toHaveBeenCalledWith(1, 1, 50, 1)
  })

  it('recordExpense records a strand expense', async () => {
    const result = await invoke('cbc:recordExpense', {
      strand_id: 1,
      expense_date: '2025-01-15',
      description: 'DL Equipment',
      gl_account_code: '5100',
      amount_cents: 25000,
      term: 1,
      fiscal_year: 2025,
      created_by: 1
    })
    expect(result.success).toBe(true)
    expect(result.data).toBe(42)
    expect(cbcServiceMock.recordStrandExpense).toHaveBeenCalled()
  })

  it('getProfitabilityReport returns profitability data', async () => {
    const result = await invoke('cbc:getProfitabilityReport', 2025, 1)
    expect(result.success).toBe(true)
    expect(result.data).toEqual([{ strand_id: 1, profit: 50000 }])
    expect(cbcServiceMock.getStrandProfitability).toHaveBeenCalledWith(2025, 1)
  })

  it('recordExpense includes receipt_number when provided', async () => {
    const result = await invoke('cbc:recordExpense', {
      strand_id: 1,
      expense_date: '2025-02-20',
      description: 'Lab materials',
      gl_account_code: '5200',
      amount_cents: 15000,
      term: 2,
      fiscal_year: 2025,
      created_by: 1,
      receipt_number: 'REC-001'
    })
    expect(result.success).toBe(true)
    expect(cbcServiceMock.recordStrandExpense).toHaveBeenCalledWith(
      expect.objectContaining({ receipt_number: 'REC-001' })
    )
  })

  it('recordParticipation records student participation via service', async () => {
    const result = await invoke('cbc:recordParticipation', {
      student_id: 5,
      strand_id: 1,
      term: 1,
      academic_year: 2025,
      start_date: '2025-03-10',
      activity_name: 'Science Fair',
      participation_level: 'PRIMARY'
    })
    expect(result.success).toBe(true)
    expect(result.data).toBe(10)
    expect(cbcServiceMock.recordStudentParticipation).toHaveBeenCalledWith(
      expect.objectContaining({ student_id: 5, strand_id: 1 })
    )
  })

  it('getStudentParticipations returns participations for a student', async () => {
    const result = await invoke('cbc:getStudentParticipations', 1)
    expect(result.success).toBe(true)
    expect(result.data).toEqual([{ id: 10, student_id: 1, strand_id: 1 }])
    expect(cbcServiceMock.getStudentParticipations).toHaveBeenCalledWith(1)
  })

  it('handles service error gracefully', async () => {
    cbcServiceMock.getAllStrands.mockImplementationOnce(() => {
      throw new Error('Service unavailable')
    })
    const result = await invoke('cbc:getStrands')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Service unavailable')
  })
})
