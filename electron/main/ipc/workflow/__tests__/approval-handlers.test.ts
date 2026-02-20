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

describe('approval IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    sessionData.userId = 11
    sessionData.role = 'PRINCIPAL'
    approvalServiceMock.createApprovalRequest.mockClear()
    approvalServiceMock.approve.mockClear()
    registerApprovalHandlers()
  })

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
    // validatedHandlerMulti expects args spread
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
})
