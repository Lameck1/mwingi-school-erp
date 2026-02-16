import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()
let sessionUserId = 11
let sessionRole = 'PRINCIPAL'

const approvalServiceMock = {
  getPendingApprovals: vi.fn(() => []),
  getAllApprovals: vi.fn(() => []),
  getApprovalCounts: vi.fn(() => ({ pending: 0, approved: 0, rejected: 0 })),
  createApprovalRequest: vi.fn(() => ({ success: true, id: 1 })),
  approve: vi.fn(() => ({ success: true })),
  reject: vi.fn(() => ({ success: true })),
  cancel: vi.fn(() => ({ success: true })),
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
        created_at: '2026-01-01'
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
    resolve: vi.fn(() => approvalServiceMock)
  }
}))

import { registerApprovalHandlers } from '../approval-handlers'

describe('approval IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    sessionUserId = 11
    sessionRole = 'PRINCIPAL'
    approvalServiceMock.createApprovalRequest.mockClear()
    approvalServiceMock.approve.mockClear()
    registerApprovalHandlers()
  })

  it('approval:create rejects renderer actor mismatch', async () => {
    const handler = handlerMap.get('approval:create')
    expect(handler).toBeDefined()

    const result = await handler!({}, 'EXPENSE', 44, 3) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
    expect(approvalServiceMock.createApprovalRequest).not.toHaveBeenCalled()
  })

  it('approval:create uses authenticated actor id', async () => {
    const handler = handlerMap.get('approval:create')!
    const result = await handler({}, 'EXPENSE', 44, 11) as { success: boolean }

    expect(result.success).toBe(true)
    expect(approvalServiceMock.createApprovalRequest).toHaveBeenCalledWith('EXPENSE', 44, 11)
  })

  it('approval:approve enforces management role', async () => {
    sessionRole = 'TEACHER'
    const handler = handlerMap.get('approval:approve')!
    const result = await handler({}, 1, 11) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
    expect(approvalServiceMock.approve).not.toHaveBeenCalled()
  })
})
