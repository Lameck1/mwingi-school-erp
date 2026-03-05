import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSessionCache } from '../../../security/session'

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
    clearSessionCache()
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

  // ======= backup:createTo =======
  describe('backup:createTo', () => {
    it('registers handler', () => {
      expect(handlerMap.has('backup:createTo')).toBe(true)
    })

    it('creates backup to specified path', async () => {
      const handler = handlerMap.get('backup:createTo')!
      const result = await handler({}, 'C:/tmp/backup.db') as any
      expect(result.success).toBe(true)
      expect(result.cancelled).toBe(false)
      expect(backupServiceMock.createBackupToPath).toHaveBeenCalledWith('C:/tmp/backup.db')
    })

    it('enforces admin-only on createTo', async () => {
      sessionRole = 'TEACHER'
      const handler = handlerMap.get('backup:createTo')!
      const result = await handler({}, 'C:/tmp/backup.db') as any
      expect(result.success).toBe(false)
      expect(result.error).toContain('Unauthorized')
    })
  })

  // ======= backup:getList =======
  describe('backup:getList', () => {
    it('registers handler', () => {
      expect(handlerMap.has('backup:getList')).toBe(true)
    })

    it('returns backup list for admin', async () => {
      backupServiceMock.listBackups.mockReturnValue([
        { name: 'backup_2026-01-01.db', size: 1024 }
      ])
      const handler = handlerMap.get('backup:getList')!
      const result = await handler({})
      expect(backupServiceMock.listBackups).toHaveBeenCalled()
      expect(result).toEqual([{ name: 'backup_2026-01-01.db', size: 1024 }])
    })

    it('enforces admin-only on getList', async () => {
      sessionRole = 'TEACHER'
      const handler = handlerMap.get('backup:getList')!
      const result = await handler({}) as any
      expect(result.success).toBe(false)
      expect(result.error).toContain('Unauthorized')
    })
  })

  // ======= backup:restore =======
  describe('backup:restore', () => {
    it('registers handler', () => {
      expect(handlerMap.has('backup:restore')).toBe(true)
    })

    it('restores backup for admin', async () => {
      const handler = handlerMap.get('backup:restore')!
      const result = await handler({}, 'backup_2026-01-01.db') as any
      expect(result.success).toBe(true)
      expect(result.cancelled).toBe(false)
      expect(result.message).toContain('Restore initiated')
      expect(backupServiceMock.restoreBackup).toHaveBeenCalledWith('backup_2026-01-01.db')
    })

    it('returns failure message when restore fails', async () => {
      backupServiceMock.restoreBackup.mockResolvedValue(false)
      const handler = handlerMap.get('backup:restore')!
      const result = await handler({}, 'bad_backup.db') as any
      expect(result.success).toBe(false)
      expect(result.message).toContain('Restore failed')
    })

    it('enforces admin-only on restore', async () => {
      sessionRole = 'TEACHER'
      const handler = handlerMap.get('backup:restore')!
      const result = await handler({}, 'test.db') as any
      expect(result.success).toBe(false)
      expect(result.error).toContain('Unauthorized')
    })
  })

  // ======= backup:openFolder =======
  describe('backup:openFolder', () => {
    it('registers handler', () => {
      expect(handlerMap.has('backup:openFolder')).toBe(true)
    })

    it('opens backup folder for admin', async () => {
      const handler = handlerMap.get('backup:openFolder')!
      const result = await handler({}) as any
      expect(result.success).toBe(true)
    })

    it('enforces admin-only on openFolder', async () => {
      sessionRole = 'TEACHER'
      const handler = handlerMap.get('backup:openFolder')!
      const result = await handler({}) as any
      expect(result.success).toBe(false)
      expect(result.error).toContain('Unauthorized')
    })
  })
})
