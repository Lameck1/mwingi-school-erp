import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()

const exemptionServiceMock = {
  getExemptions: vi.fn().mockReturnValue([]),
  getExemptionById: vi.fn(),
  getStudentExemptions: vi.fn().mockReturnValue([]),
  calculateExemption: vi.fn().mockReturnValue({
    exemption_percentage: 50,
    exemption_amount: 5000,
    net_amount: 5000,
  }),
  createExemption: vi.fn().mockReturnValue({ success: true, id: 1 }),
  revokeExemption: vi.fn().mockReturnValue({ success: true }),
  getExemptionStats: vi.fn().mockReturnValue({ total: 0, active: 0, revoked: 0 }),
}

vi.mock('../../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => handlerMap.set(channel, handler)),
    removeHandler: vi.fn(),
  }
}))

vi.mock('../../../security/session', () => ({
  getSession: vi.fn(async () => ({
    user: { id: 9, username: 'admin', role: 'ADMIN', full_name: 'Admin', email: null, is_active: 1, last_login: null, created_at: new Date().toISOString() },
    lastActivity: Date.now()
  }))
}))

vi.mock('../../../database', () => ({
  getDatabase: vi.fn()
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

vi.mock('../../../services/base/ServiceContainer', () => ({
  container: {
    resolve: vi.fn((name: string) => {
      if (name === 'ExemptionService') {
        return exemptionServiceMock
      }
      return {}
    })
  }
}))

import { registerExemptionHandlers } from '../../exemption/exemption-handlers'

describe('exemption IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    vi.clearAllMocks()
    registerExemptionHandlers()
  })

  afterEach(() => {
    handlerMap.clear()
  })

  it('registers all expected exemption channels', () => {
    const expectedChannels = [
      'exemption:getAll',
      'exemption:getById',
      'exemption:getStudentExemptions',
      'exemption:calculate',
      'exemption:create',
      'exemption:revoke',
      'exemption:getStats',
    ]
    for (const channel of expectedChannels) {
      expect(handlerMap.has(channel), `missing handler for ${channel}`).toBe(true)
    }
  })

  it('exemption:create calls service with normalized data and actor id', async () => {
    exemptionServiceMock.createExemption.mockReturnValueOnce({ success: true, id: 42 })

    const handler = handlerMap.get('exemption:create')!
    const result = await handler({}, {
      student_id: 1,
      academic_year_id: 2,
      term_id: 3,
      exemption_percentage: 50,
      exemption_reason: 'Financial hardship',
      notes: 'Approved by board',
    }) as { success: boolean; id?: number }

    expect(result.success).toBe(true)
    expect(result.id).toBe(42)
    expect(exemptionServiceMock.createExemption).toHaveBeenCalledTimes(1)
    const callArgs = exemptionServiceMock.createExemption.mock.calls[0]
    expect(callArgs[0]).toMatchObject({
      student_id: 1,
      academic_year_id: 2,
      exemption_percentage: 50,
      exemption_reason: 'Financial hardship',
    })
    expect(callArgs[1]).toBe(9) // actor.id from session mock
  })

  it('exemption:create rejects missing required fields', async () => {
    const handler = handlerMap.get('exemption:create')!
    const result = await handler({}, {
      student_id: 1,
      // missing academic_year_id, exemption_percentage, exemption_reason
    }) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(exemptionServiceMock.createExemption).not.toHaveBeenCalled()
  })

  it('exemption:getAll returns exemptions without filters', async () => {
    const mockExemptions = [
      { id: 1, student_id: 1, status: 'ACTIVE' },
      { id: 2, student_id: 2, status: 'REVOKED' },
    ]
    exemptionServiceMock.getExemptions.mockReturnValueOnce(mockExemptions)

    const handler = handlerMap.get('exemption:getAll')!
    const result = await handler({})

    expect(result).toEqual(mockExemptions)
    expect(exemptionServiceMock.getExemptions).toHaveBeenCalledTimes(1)
  })

  it('exemption:getAll passes filters to service', async () => {
    exemptionServiceMock.getExemptions.mockReturnValueOnce([])

    const handler = handlerMap.get('exemption:getAll')!
    await handler({}, { studentId: 5, status: 'ACTIVE' })

    expect(exemptionServiceMock.getExemptions).toHaveBeenCalledTimes(1)
    const filters = exemptionServiceMock.getExemptions.mock.calls[0][0]
    expect(filters).toMatchObject({ studentId: 5, status: 'ACTIVE' })
  })

  it('exemption:getById returns exemption by id', async () => {
    const mockExemption = { id: 7, student_id: 1, status: 'ACTIVE' }
    exemptionServiceMock.getExemptionById.mockReturnValueOnce(mockExemption)

    const handler = handlerMap.get('exemption:getById')!
    const result = await handler({}, 7)

    expect(result).toEqual(mockExemption)
    expect(exemptionServiceMock.getExemptionById).toHaveBeenCalledWith(7)
  })

  it('exemption:revoke calls service with id, reason and actor', async () => {
    exemptionServiceMock.revokeExemption.mockReturnValueOnce({ success: true })

    const handler = handlerMap.get('exemption:revoke')!
    const result = await handler({}, 3, 'No longer eligible') as { success: boolean }

    expect(result.success).toBe(true)
    expect(exemptionServiceMock.revokeExemption).toHaveBeenCalledWith(3, 'No longer eligible', 9)
  })

  it('exemption:revoke rejects empty reason string', async () => {
    const handler = handlerMap.get('exemption:revoke')!
    const result = await handler({}, 3, '') as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(exemptionServiceMock.revokeExemption).not.toHaveBeenCalled()
  })

  it('exemption:calculate returns exemption calculation', async () => {
    exemptionServiceMock.calculateExemption.mockReturnValueOnce({
      exemption_percentage: 25,
      exemption_amount: 2500,
      net_amount: 7500,
    })

    const handler = handlerMap.get('exemption:calculate')!
    const result = await handler({}, 1, 2, 3, 4, 10000) as {
      exemption_percentage: number
      exemption_amount: number
      net_amount: number
    }

    expect(result.exemption_percentage).toBe(25)
    expect(result.exemption_amount).toBe(2500)
    expect(result.net_amount).toBe(7500)
    expect(exemptionServiceMock.calculateExemption).toHaveBeenCalledWith(1, 2, 3, 4, 10000)
  })
})
