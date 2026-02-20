import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()
let sessionUserId = 30
let sessionRole = 'TEACHER'

const notificationServiceMock = {
  reloadConfig: vi.fn(),
  send: vi.fn(() => ({ success: true })),
  sendBulkFeeReminders: vi.fn(() => ({ success: true })),
  getTemplates: vi.fn(() => []),
  getTemplate: vi.fn(() => null),
  createTemplate: vi.fn(() => ({ success: true })),
  getDefaultTemplates: vi.fn(() => []),
  getCommunicationHistory: vi.fn(() => []),
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
        created_at: '2026-01-01T00:00:00'
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
    resolve: vi.fn(() => notificationServiceMock)
  }
}))

import { registerNotificationHandlers } from '../notification-handlers'

describe('notification IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    sessionUserId = 30
    sessionRole = 'TEACHER'
    notificationServiceMock.send.mockClear()
    registerNotificationHandlers()
  })

  function attachActor(event: any) {
    event.__ipcActor = {
      id: sessionUserId,
      role: sessionRole,
      username: 'session-user',
      full_name: 'Session User',
      email: null,
      is_active: 1,
      created_at: '2026-01-01T00:00:00'
    };
  }

  it('notifications:send rejects renderer actor mismatch', async () => {
    const handler = handlerMap.get('notifications:send')
    expect(handler).toBeDefined()
    const event = {};
    attachActor(event);
    const result = await handler!(event, { channel: 'EMAIL' }, 3) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
    expect(notificationServiceMock.send).not.toHaveBeenCalled()
  })

  it('notifications:reloadConfig enforces admin-only role', async () => {
    const handler = handlerMap.get('notifications:reloadConfig')!
    const result = await handler({}) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
  })
})
