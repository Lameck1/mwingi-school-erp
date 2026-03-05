import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSessionCache } from '../../../security/session'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()
let sessionUserId = 9
let sessionRole = 'ACCOUNTS_CLERK'
const validIsoDate = new Date().toISOString()

const exemptionServiceMock = {
  getExemptions: vi.fn((): any[] => []),
  getExemptionById: vi.fn((): any => null),
  getStudentExemptions: vi.fn((): any[] => []),
  calculateExemption: vi.fn(() => ({ originalAmount: 10000, exemptionAmount: 5000, finalAmount: 5000 })),
  createExemption: vi.fn((_data?: any, _userId?: any) => ({ success: true, id: 1 })),
  revokeExemption: vi.fn(() => ({ success: true })),
  getExemptionStats: vi.fn(() => ({ totalExemptions: 5, totalAmount: 50000 })),
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
    resolve: vi.fn(() => exemptionServiceMock)
  }
}))

import { registerExemptionHandlers } from '../exemption-handlers'

describe('exemption IPC handlers', () => {
  beforeEach(() => {
    clearSessionCache()
    handlerMap.clear()
    sessionUserId = 9
    sessionRole = 'ACCOUNTS_CLERK'
    vi.clearAllMocks()
    registerExemptionHandlers()
  })

  it('registers all expected exemption channels', () => {
    expect(handlerMap.has('exemption:getAll')).toBe(true)
    expect(handlerMap.has('exemption:getById')).toBe(true)
    expect(handlerMap.has('exemption:getStudentExemptions')).toBe(true)
    expect(handlerMap.has('exemption:calculate')).toBe(true)
    expect(handlerMap.has('exemption:create')).toBe(true)
    expect(handlerMap.has('exemption:revoke')).toBe(true)
    expect(handlerMap.has('exemption:getStats')).toBe(true)
  })

  // ─── exemption:getAll ───────────────────────────────────────────

  it('getAll returns exemptions without filters', async () => {
    exemptionServiceMock.getExemptions.mockReturnValueOnce([{ id: 1 }])
    const handler = handlerMap.get('exemption:getAll')!
    const result = await handler({})
    expect(result).toEqual([{ id: 1 }])
    expect(exemptionServiceMock.getExemptions).toHaveBeenCalledWith(undefined)
  })

  it('getAll passes normalized filters', async () => {
    const handler = handlerMap.get('exemption:getAll')!
    await handler({}, { studentId: 5, academicYearId: 1, termId: 2, status: 'ACTIVE' })
    expect(exemptionServiceMock.getExemptions).toHaveBeenCalledWith({
      studentId: 5, academicYearId: 1, termId: 2, status: 'ACTIVE'
    })
  })

  it('getAll passes partial filters (only studentId)', async () => {
    const handler = handlerMap.get('exemption:getAll')!
    await handler({}, { studentId: 3 })
    expect(exemptionServiceMock.getExemptions).toHaveBeenCalledWith({ studentId: 3 })
  })

  // ─── exemption:getById ──────────────────────────────────────────

  it('getById returns exemption', async () => {
    exemptionServiceMock.getExemptionById.mockReturnValueOnce({ id: 7, student_id: 1 })
    const handler = handlerMap.get('exemption:getById')!
    const result = await handler({}, 7)
    expect(result).toEqual({ id: 7, student_id: 1 })
    expect(exemptionServiceMock.getExemptionById).toHaveBeenCalledWith(7)
  })

  // ─── exemption:getStudentExemptions ─────────────────────────────

  it('getStudentExemptions delegates to service', async () => {
    exemptionServiceMock.getStudentExemptions.mockReturnValueOnce([{ id: 2 }])
    const handler = handlerMap.get('exemption:getStudentExemptions')!
    const result = await handler({}, 10, 1, 2)
    expect(result).toEqual([{ id: 2 }])
    expect(exemptionServiceMock.getStudentExemptions).toHaveBeenCalledWith(10, 1, 2)
  })

  // ─── exemption:calculate ────────────────────────────────────────

  it('calculate returns exemption calculation', async () => {
    const handler = handlerMap.get('exemption:calculate')!
    const result = await handler({}, 10, 1, 2, 5, 10000) as { originalAmount: number }
    expect(result.originalAmount).toBe(10000)
    expect(exemptionServiceMock.calculateExemption).toHaveBeenCalledWith(10, 1, 2, 5, 10000)
  })

  // ─── exemption:create ───────────────────────────────────────────

  it('create calls service with normalized data', async () => {
    const handler = handlerMap.get('exemption:create')!
    const data = {
      student_id: 10,
      academic_year_id: 1,
      exemption_percentage: 50,
      exemption_reason: 'Financial hardship'
    }
    const result = await handler({}, data) as { success: boolean }
    expect(result.success).toBe(true)
    expect(exemptionServiceMock.createExemption).toHaveBeenCalledWith(
      expect.objectContaining({
        student_id: 10,
        academic_year_id: 1,
        exemption_percentage: 50,
        exemption_reason: 'Financial hardship'
      }),
      9
    )
  })

  it('create normalizes optional fields (term_id, fee_category_id, notes)', async () => {
    const handler = handlerMap.get('exemption:create')!
    const data = {
      student_id: 10,
      academic_year_id: 1,
      exemption_percentage: 100,
      exemption_reason: 'Orphan',
      term_id: 2,
      fee_category_id: 3,
      notes: 'Full exemption'
    }
    await handler({}, data)
    expect(exemptionServiceMock.createExemption).toHaveBeenCalledWith(
      expect.objectContaining({ term_id: 2, fee_category_id: 3, notes: 'Full exemption' }),
      9
    )
  })

  // ─── exemption:revoke ───────────────────────────────────────────

  it('revoke delegates to service with actor id', async () => {
    const handler = handlerMap.get('exemption:revoke')!
    const result = await handler({}, 7, 'No longer eligible') as { success: boolean }
    expect(result.success).toBe(true)
    expect(exemptionServiceMock.revokeExemption).toHaveBeenCalledWith(7, 'No longer eligible', 9)
  })

  // ─── exemption:getStats ─────────────────────────────────────────

  it('getStats returns stats for academic year', async () => {
    const handler = handlerMap.get('exemption:getStats')!
    const result = await handler({}, 1)
    expect(result).toEqual({ totalExemptions: 5, totalAmount: 50000 })
    expect(exemptionServiceMock.getExemptionStats).toHaveBeenCalledWith(1)
  })

  // ─── Role enforcement ──────────────────────────────────────────

  it('rejects non-finance roles', async () => {
    sessionRole = 'TEACHER'
    clearSessionCache()
    handlerMap.clear()
    registerExemptionHandlers()

    const handler = handlerMap.get('exemption:create')!
    const result = await handler({}, {
      student_id: 10,
      academic_year_id: 1,
      exemption_percentage: 50,
      exemption_reason: 'Test'
    }) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
  })

  // ── Coverage: getAll with partial filters (only status) ──
  it('getAll normalizes only status filter', async () => {
    const handler = handlerMap.get('exemption:getAll')!
    await handler({}, { status: 'REVOKED' })
    expect(exemptionServiceMock.getExemptions).toHaveBeenCalledWith({ status: 'REVOKED' })
  })

  // ── Coverage: getAll with only termId ──
  it('getAll normalizes only termId filter', async () => {
    const handler = handlerMap.get('exemption:getAll')!
    await handler({}, { termId: 3 })
    expect(exemptionServiceMock.getExemptions).toHaveBeenCalledWith({ termId: 3 })
  })

  // ── Coverage: getAll with only academicYearId ──
  it('getAll normalizes only academicYearId filter', async () => {
    const handler = handlerMap.get('exemption:getAll')!
    await handler({}, { academicYearId: 2 })
    expect(exemptionServiceMock.getExemptions).toHaveBeenCalledWith({ academicYearId: 2 })
  })

  // ── Coverage: create without optional fields omits them from payload ──
  it('create omits undefined optional fields from normalized data', async () => {
    const handler = handlerMap.get('exemption:create')!
    const data = {
      student_id: 5,
      academic_year_id: 1,
      exemption_percentage: 25,
      exemption_reason: 'Scholarship'
    }
    await handler({}, data)
    const calledWith = exemptionServiceMock.createExemption.mock.calls[0][0]
    expect(calledWith).not.toHaveProperty('term_id')
    expect(calledWith).not.toHaveProperty('fee_category_id')
    expect(calledWith).not.toHaveProperty('notes')
  })
})
