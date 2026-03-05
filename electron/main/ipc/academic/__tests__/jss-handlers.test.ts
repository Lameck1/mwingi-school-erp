import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()

const jssServiceMock = {
  processStudentTransition: vi.fn(() => 1),
  batchProcessTransitions: vi.fn(() => ({ processed: 5, failed: 0 })),
  getEligibleStudentsForTransition: vi.fn(() => [{ id: 1, name: 'Student A' }]),
  getJSSFeeStructure: vi.fn(() => ({ grade: 7, tuition_fee_cents: 50000 })),
  setJSSFeeStructure: vi.fn(() => 1),
  getStudentTransitionHistory: vi.fn(() => [{ id: 1, from_grade: 6, to_grade: 7 }]),
  getTransitionSummary: vi.fn(() => ({ total: 20, completed: 18, pending: 2 })),
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
      if (name === 'JSSTransitionService') { return jssServiceMock }
      return {}
    })
  }
}))

import { registerJSSHandlers } from '../jss-handlers'

type Result = { success?: boolean; data?: unknown; error?: string; [key: string]: unknown }

async function invoke(channel: string, ...args: unknown[]): Promise<Result> {
  const handler = handlerMap.get(channel)
  if (!handler) { throw new Error(`No handler for ${channel}`) }
  return handler({}, ...args) as Promise<Result>
}

describe('JSS IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    vi.clearAllMocks()
    registerJSSHandlers()
  })

  it('registers all JSS channels', () => {
    expect(handlerMap.has('jss:initiateTransition')).toBe(true)
    expect(handlerMap.has('jss:bulkTransition')).toBe(true)
    expect(handlerMap.has('jss:getEligibleStudents')).toBe(true)
    expect(handlerMap.has('jss:getFeeStructure')).toBe(true)
    expect(handlerMap.has('jss:setFeeStructure')).toBe(true)
    expect(handlerMap.has('jss:getTransitionReport')).toBe(true)
    expect(handlerMap.has('jss:getTransitionSummary')).toBe(true)
  })

  it('initiateTransition processes a single student transition', async () => {
    const result = await invoke('jss:initiateTransition', {
      student_id: 1,
      from_grade: 6,
      to_grade: 7,
      transition_date: '2025-01-15',
      processed_by: 1
    })
    expect(result.success).toBe(true)
    expect(result.data).toBe(1)
    expect(jssServiceMock.processStudentTransition).toHaveBeenCalledWith(
      expect.objectContaining({ student_id: 1, from_grade: 6, to_grade: 7, processed_by: 1 })
    )
  })

  it('initiateTransition includes optional boarding_status_change and transition_notes', async () => {
    const result = await invoke('jss:initiateTransition', {
      student_id: 2,
      from_grade: 6,
      to_grade: 7,
      transition_date: '2025-02-01',
      processed_by: 1,
      boarding_status_change: 'TO_BOARDER',
      transition_notes: 'Student requesting boarding'
    })
    expect(result.success).toBe(true)
    expect(jssServiceMock.processStudentTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        student_id: 2,
        boarding_status_change: 'TO_BOARDER',
        transition_notes: 'Student requesting boarding'
      })
    )
  })

  it('bulkTransition processes multiple students', async () => {
    const result = await invoke('jss:bulkTransition', {
      student_ids: [1, 2, 3],
      from_grade: 6,
      to_grade: 7,
      transition_date: '2025-01-15',
      processed_by: 1
    })
    expect(result.success).toBe(true)
    expect(result.data).toEqual({ processed: 5, failed: 0 })
  })

  it('getEligibleStudents returns eligible students for transition', async () => {
    const result = await invoke('jss:getEligibleStudents', 6, 2025)
    expect(result.success).toBe(true)
    expect(result.data).toEqual([{ id: 1, name: 'Student A' }])
    expect(jssServiceMock.getEligibleStudentsForTransition).toHaveBeenCalledWith(6, 2025)
  })

  it('getFeeStructure returns fee structure for grade', async () => {
    const result = await invoke('jss:getFeeStructure', 7, 2025)
    expect(result.success).toBe(true)
    expect(result.data).toEqual({ grade: 7, tuition_fee_cents: 50000 })
  })

  it('setFeeStructure creates/updates a fee structure', async () => {
    const result = await invoke('jss:setFeeStructure', {
      grade: 7,
      fiscal_year: 2025,
      tuition_fee_cents: 60000,
      boarding_fee_cents: 20000
    })
    expect(result.success).toBe(true)
    expect(result.data).toBe(1)
    expect(jssServiceMock.setJSSFeeStructure).toHaveBeenCalledWith(
      expect.objectContaining({ grade: 7, fiscal_year: 2025, tuition_fee_cents: 60000 })
    )
  })

  it('getTransitionReport returns student transition history', async () => {
    const result = await invoke('jss:getTransitionReport', 1)
    expect(result.success).toBe(true)
    expect(result.data).toEqual([{ id: 1, from_grade: 6, to_grade: 7 }])
  })

  it('getTransitionSummary returns summary for fiscal year', async () => {
    const result = await invoke('jss:getTransitionSummary', 2025)
    expect(result.success).toBe(true)
    expect(result.data).toEqual({ total: 20, completed: 18, pending: 2 })
  })

  // ── Coverage: normalizeFeeStructurePayload all optional fee fields ──
  it('setFeeStructure normalizes all optional fee fields', async () => {
    const result = await invoke('jss:setFeeStructure', {
      grade: 8,
      fiscal_year: 2026,
      tuition_fee_cents: 70000,
      boarding_fee_cents: 25000,
      activity_fee_cents: 5000,
      exam_fee_cents: 3000,
      library_fee_cents: 2000,
      lab_fee_cents: 4000,
      ict_fee_cents: 1500
    })
    expect(result.success).toBe(true)
    expect(jssServiceMock.setJSSFeeStructure).toHaveBeenCalledWith(
      expect.objectContaining({
        grade: 8,
        fiscal_year: 2026,
        tuition_fee_cents: 70000,
        boarding_fee_cents: 25000,
        activity_fee_cents: 5000,
        exam_fee_cents: 3000,
        library_fee_cents: 2000,
        lab_fee_cents: 4000,
        ict_fee_cents: 1500
      })
    )
  })

  it('setFeeStructure omits undefined optional fee fields', async () => {
    const result = await invoke('jss:setFeeStructure', {
      grade: 7,
      fiscal_year: 2025,
      tuition_fee_cents: 60000
    })
    expect(result.success).toBe(true)
    const call = (jssServiceMock.setJSSFeeStructure.mock.calls[0] as unknown[])[0]
    expect(call).not.toHaveProperty('activity_fee_cents')
    expect(call).not.toHaveProperty('exam_fee_cents')
    expect(call).not.toHaveProperty('library_fee_cents')
    expect(call).not.toHaveProperty('lab_fee_cents')
    expect(call).not.toHaveProperty('ict_fee_cents')
  })
})
