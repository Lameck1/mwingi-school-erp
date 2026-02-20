import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()
let sessionUserId = 1
let sessionRole = 'ADMIN'
const validIsoDate = new Date().toISOString();

const { backupServiceMock } = vi.hoisted(() => ({
  backupServiceMock: {
    createBackup: vi.fn(async () => ({ success: true, filePath: 'backup.db' })),
    createBackupToPath: vi.fn(async () => ({ success: true, filePath: 'C:/tmp/backup.db' })),
    listBackups: vi.fn(() => []),
    restoreBackup: vi.fn(async () => true),
  }
}))

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
  },
  shell: {
    openPath: vi.fn(async () => ''),
  },
  app: {
    getPath: vi.fn(() => 'C:/app-data'),
  }
}))

vi.mock('../../../services/BackupService', () => ({
  BackupService: backupServiceMock
}))

vi.mock('../../../utils/logger', () => ({
  log: {
    error: vi.fn(),
  }
}))

import { registerBackupHandlers } from '../backup-handlers'

describe('backup IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    sessionUserId = 1
    sessionRole = 'ADMIN'
    backupServiceMock.createBackup.mockClear()
    registerBackupHandlers()
  })

  it('backup:create enforces admin-only access', async () => {
    sessionRole = 'PRINCIPAL'
    const handler = handlerMap.get('backup:create')
    expect(handler).toBeDefined()

    const result = await handler!({}) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
    expect(backupServiceMock.createBackup).not.toHaveBeenCalled()
  })

  it('backup:create runs for admin users', async () => {
    const handler = handlerMap.get('backup:create')!
    const result = await handler({}) as { success: boolean; cancelled?: boolean }

    expect(result.success).toBe(true)
    expect(result.cancelled).toBe(false)
    expect(backupServiceMock.createBackup).toHaveBeenCalledTimes(1)
  })
})
