import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()

const logMock = vi.hoisted(() => ({
  error: vi.fn(),
}))

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

vi.mock('../../../utils/logger', () => ({
  log: logMock
}))

import { registerSystemHandlers } from '../system-handlers'

type Result = { success?: boolean; error?: string; [key: string]: unknown }

async function invoke(channel: string, ...args: unknown[]): Promise<Result> {
  const handler = handlerMap.get(channel)
  if (!handler) { throw new Error(`No handler for ${channel}`) }
  return handler({}, ...args) as Promise<Result>
}

describe('system IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    vi.clearAllMocks()
    registerSystemHandlers()
  })

  it('registers the system:logError channel', () => {
    expect(handlerMap.has('system:logError')).toBe(true)
  })

  it('logs an error with message only', async () => {
    await invoke('system:logError', 'Something went wrong')
    expect(logMock.error).toHaveBeenCalledWith(
      '[Renderer Error] Something went wrong',
      '',
      ''
    )
  })

  it('logs an error with stack trace details', async () => {
    await invoke('system:logError', 'Component crashed', {
      stack: 'Error at line 42',
      component: 'Dashboard'
    })
    expect(logMock.error).toHaveBeenCalledWith(
      '[Renderer Error] Component crashed',
      'Error at line 42',
      'Dashboard'
    )
  })

  it('logs with partial details (stack only)', async () => {
    await invoke('system:logError', 'Network error', {
      stack: 'at fetch:123'
    })
    expect(logMock.error).toHaveBeenCalledWith(
      '[Renderer Error] Network error',
      'at fetch:123',
      ''
    )
  })

  it('logs with partial details (component only)', async () => {
    await invoke('system:logError', 'Render error', {
      component: 'Sidebar'
    })
    expect(logMock.error).toHaveBeenCalledWith(
      '[Renderer Error] Render error',
      '',
      'Sidebar'
    )
  })

  it('rejects logError with invalid error argument', async () => {
    const result = await invoke('system:logError', 123)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Validation failed')
  })
})
