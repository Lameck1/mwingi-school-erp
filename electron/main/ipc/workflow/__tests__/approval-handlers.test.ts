import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()
const { approvalServiceMock, sessionData } = vi.hoisted(() => ({
  approvalServiceMock: {
    getPendingApprovals: vi.fn(() => []),
    getAllApprovals: vi.fn(() => []),
    getApprovalCounts: vi.fn(() => ({ pending: 0, approved: 0, rejected: 0 })),
    createApprovalRequest: vi.fn(() => ({ success: true, id: 1 })),
    approve: vi.fn(() => ({ success: true })),
    reject: vi.fn(() => ({ success: true })),
    cancel: vi.fn(() => ({ success: true })),
  },
  sessionData: {
    userId: 11,
    role: 'PRINCIPAL'
  }
}))
const validIsoDate = new Date().toISOString();


vi.mock('../../../security/session', () => ({
  getSession: vi.fn(async () => ({
    user: {
      id: sessionData.userId,
      username: 'session-user',
      role: sessionData.role,
      full_name: 'Session User',
      email: null,
      is_active: 1,
      last_login: null,
      created_at: validIsoDate
    },
    lastActivity: Date.now()
  }))
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
    resolve: vi.fn(() => approvalServiceMock)
  }
}))

import { registerApprovalHandlers } from '../approval-handlers'

function attachActor(event: any) {
  event.__ipcActor = {
    id: sessionData.userId,
    role: sessionData.role,
    username: 'session-user',
    full_name: 'Session User',
    email: null,
    created_at: validIsoDate,
    is_active: 1
  }
}

describe('approval IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    sessionData.userId = 11
    sessionData.role = 'PRINCIPAL'
    approvalServiceMock.createApprovalRequest.mockClear()
    approvalServiceMock.approve.mockClear()
    registerApprovalHandlers()
  })

  it('approval:create rejects renderer actor mismatch', async () => {
    const handler = handlerMap.get('approval:create')
    expect(handler).toBeDefined()

    const event = {}
    attachActor(event)
    const result = await handler!(event, 'EXPENSE', 44, 3) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
    expect(approvalServiceMock.createApprovalRequest).not.toHaveBeenCalled()
  })

  it('approval:create uses authenticated actor id', async () => {
    const handler = handlerMap.get('approval:create')!
    const event = {}
    attachActor(event)
    const result = await handler!(event, 'EXPENSE', 44, 11) as { success: boolean }

    expect(result.success).toBe(true)
    expect(approvalServiceMock.createApprovalRequest).toHaveBeenCalledWith('EXPENSE', 44, 11)
  })

  it('approval:approve enforces management role', async () => {
    sessionData.role = 'TEACHER'
    const handler = handlerMap.get('approval:approve')!
    const event = {}
    attachActor(event)
    const result = await handler!(event, 1, 11) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
    expect(approvalServiceMock.approve).not.toHaveBeenCalled()
  })

  it('approval:approve succeeds for management role', async () => {
    const handler = handlerMap.get('approval:approve')!
    const event = {}
    attachActor(event)
    const result = await handler(event, 5, 11) as any
    expect(result.success).toBe(true)
    expect(approvalServiceMock.approve).toHaveBeenCalledWith(5, 11)
  })

  it('approval:approve rejects renderer mismatch', async () => {
    const handler = handlerMap.get('approval:approve')!
    const event = {}
    attachActor(event)
    const result = await handler(event, 5, 999) as any
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
  })

  // ======= approval:getPending =======
  describe('approval:getPending', () => {
    it('registers handler', () => {
      expect(handlerMap.has('approval:getPending')).toBe(true)
    })

    it('returns pending approvals for actor', async () => {
      const handler = handlerMap.get('approval:getPending')!
      const event = {}; attachActor(event)
      approvalServiceMock.getPendingApprovals.mockReturnValue([{ id: 1, status: 'PENDING' }])
      const result = await handler(event, 11)
      expect(approvalServiceMock.getPendingApprovals).toHaveBeenCalledWith(11)
      expect(result).toEqual([{ id: 1, status: 'PENDING' }])
    })

    it('works without legacy userId', async () => {
      const handler = handlerMap.get('approval:getPending')!
      const event = {}; attachActor(event)
      await handler(event)
      expect(approvalServiceMock.getPendingApprovals).toHaveBeenCalledWith(11)
    })

    it('rejects renderer mismatch on getPending', async () => {
      const handler = handlerMap.get('approval:getPending')!
      const event = {}; attachActor(event)
      const result = await handler(event, 999) as any
      expect(result.success).toBe(false)
      expect(result.error).toContain('renderer user mismatch')
    })
  })

  // ======= approval:getAll =======
  describe('approval:getAll', () => {
    it('registers handler', () => {
      expect(handlerMap.has('approval:getAll')).toBe(true)
    })

    it('returns all approvals without filters', async () => {
      const handler = handlerMap.get('approval:getAll')!
      const event = {}; attachActor(event)
      approvalServiceMock.getAllApprovals.mockReturnValue([{ id: 1 }, { id: 2 }])
      const result = await handler(event)
      expect(approvalServiceMock.getAllApprovals).toHaveBeenCalledWith()
      expect(result).toEqual([{ id: 1 }, { id: 2 }])
    })

    it('passes normalized filters', async () => {
      const handler = handlerMap.get('approval:getAll')!
      const event = {}; attachActor(event)
      await handler(event, { status: 'PENDING', entity_type: 'EXPENSE' })
      expect(approvalServiceMock.getAllApprovals).toHaveBeenCalledWith({
        status: 'PENDING', entity_type: 'EXPENSE'
      })
    })
  })

  // ======= approval:getCounts =======
  describe('approval:getCounts', () => {
    it('registers handler', () => {
      expect(handlerMap.has('approval:getCounts')).toBe(true)
    })

    it('returns approval counts', async () => {
      const handler = handlerMap.get('approval:getCounts')!
      const event = {}; attachActor(event)
      approvalServiceMock.getApprovalCounts.mockReturnValue({ pending: 5, approved: 10, rejected: 2 })
      const result = await handler(event)
      expect(approvalServiceMock.getApprovalCounts).toHaveBeenCalled()
      expect(result).toEqual({ pending: 5, approved: 10, rejected: 2 })
    })
  })

  // ======= approval:reject =======
  describe('approval:reject', () => {
    it('registers handler', () => {
      expect(handlerMap.has('approval:reject')).toBe(true)
    })

    it('rejects approval with reason', async () => {
      const handler = handlerMap.get('approval:reject')!
      const event = {}; attachActor(event)
      const result = await handler(event, 5, 11, 'Budget exceeded') as any
      expect(result.success).toBe(true)
      expect(approvalServiceMock.reject).toHaveBeenCalledWith(5, 11, 'Budget exceeded')
    })

    it('rejects renderer mismatch on reject', async () => {
      const handler = handlerMap.get('approval:reject')!
      const event = {}; attachActor(event)
      const result = await handler(event, 5, 999, 'reason') as any
      expect(result.success).toBe(false)
      expect(result.error).toContain('renderer user mismatch')
    })

    it('enforces management role for reject', async () => {
      sessionData.role = 'TEACHER'
      handlerMap.clear()
      registerApprovalHandlers()
      const handler = handlerMap.get('approval:reject')!
      const event = {}; attachActor(event)
      const result = await handler(event, 5, 11, 'reason') as any
      expect(result.success).toBe(false)
      expect(result.error).toContain('Unauthorized')
    })
  })

  // ======= approval:cancel =======
  describe('approval:cancel', () => {
    it('registers handler', () => {
      expect(handlerMap.has('approval:cancel')).toBe(true)
    })

    it('cancels approval request', async () => {
      const handler = handlerMap.get('approval:cancel')!
      const event = {}; attachActor(event)
      const result = await handler(event, 5, 11) as any
      expect(result.success).toBe(true)
      expect(approvalServiceMock.cancel).toHaveBeenCalledWith(5, 11)
    })

    it('rejects renderer mismatch on cancel', async () => {
      const handler = handlerMap.get('approval:cancel')!
      const event = {}; attachActor(event)
      const result = await handler(event, 5, 999) as any
      expect(result.success).toBe(false)
      expect(result.error).toContain('renderer user mismatch')
    })

    it('works without legacy id on cancel', async () => {
      const handler = handlerMap.get('approval:cancel')!
      const event = {}; attachActor(event)
      const result = await handler(event, 5) as any
      expect(result.success).toBe(true)
      expect(approvalServiceMock.cancel).toHaveBeenCalledWith(5, 11)
    })
  })

  it('approval:getAll normalizes partial filter with only status', async () => {
    const handler = handlerMap.get('approval:getAll')!
    const event = {}; attachActor(event)
    await handler(event, { status: 'APPROVED' })
    expect(approvalServiceMock.getAllApprovals).toHaveBeenCalledWith({ status: 'APPROVED' })
  })

  it('approval:getAll normalizes partial filter with only entity_type (no status)', async () => {
    const handler = handlerMap.get('approval:getAll')!
    const event = {}; attachActor(event)
    await handler(event, { entity_type: 'EXPENSE' })
    expect(approvalServiceMock.getAllApprovals).toHaveBeenCalledWith({ entity_type: 'EXPENSE' })
  })
})
