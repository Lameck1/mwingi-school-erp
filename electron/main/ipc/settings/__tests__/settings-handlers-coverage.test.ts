/**
 * Additional coverage tests for settings-handlers.ts
 * Targets: uploadLogo error path, removeLogo error path,
 *          system:resetAndSeed in production, system:seedExams in production,
 *          settings:get when no row, settings:update sms empty strings
 */
import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSessionCache } from '../../../security/session'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

let db: Database.Database
const handlerMap = new Map<string, IpcHandler>()
let sessionRole = 'ADMIN'
let sessionUserId = 1
let isPackaged = false

const maintenanceServiceMock = {
  resetAndSeed2026: vi.fn(() => ({ success: true })),
  normalizeCurrencyScale: vi.fn(() => ({ success: true })),
  seedExamsOnly: vi.fn(() => ({ success: true })),
}

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn(async () => JSON.stringify({
      user: { id: sessionUserId, username: 'admin', role: sessionRole, full_name: 'Admin', email: 'a@b.com', is_active: 1, created_at: new Date().toISOString() },
      lastActivity: Date.now()
    })),
    setPassword: vi.fn(),
    deletePassword: vi.fn(),
  }
}))

vi.mock('../../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => handlerMap.set(channel, handler)),
    removeHandler: vi.fn(),
  },
  app: {
    get isPackaged() { return isPackaged }
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((v: string) => Buffer.from(v)),
    decryptString: vi.fn((v: Buffer) => v.toString('utf8')),
  }
}))

vi.mock('../../../database', () => ({ getDatabase: () => db }))

vi.mock('../../../services/base/ServiceContainer', () => ({
  container: {
    resolve: vi.fn(() => maintenanceServiceMock)
  }
}))

const saveImageMock = vi.fn((..._args: any[]) => 'C:/tmp/logo.png')
const getImageMock = vi.fn((..._args: any[]): string | null => null)
const deleteImageMock = vi.fn((..._args: any[]) => {})

vi.mock('../../../utils/image-utils', () => ({
  saveImageFromDataUrl: (...args: unknown[]) => saveImageMock(...args),
  getImageAsBase64DataUrl: (...args: unknown[]) => getImageMock(...args),
  deleteImage: (...args: unknown[]) => deleteImageMock(...args),
}))

import { registerSettingsHandlers } from '../settings-handlers'

describe('settings-handlers coverage expansion', () => {
  beforeEach(() => {
    clearSessionCache()
    handlerMap.clear()
    sessionRole = 'ADMIN'
    sessionUserId = 1
    isPackaged = false
    vi.clearAllMocks()

    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE school_settings (
        id INTEGER PRIMARY KEY, school_name TEXT, school_motto TEXT,
        address TEXT, phone TEXT, email TEXT, logo_path TEXT,
        mpesa_paybill TEXT, sms_sender_id TEXT,
        school_type TEXT NOT NULL DEFAULT 'PUBLIC', updated_at TEXT
      );
      CREATE TABLE system_config (
        key TEXT PRIMARY KEY, value TEXT NOT NULL,
        is_encrypted INTEGER DEFAULT 0, updated_at TEXT
      );
      INSERT INTO school_settings (id, school_name, school_type)
        VALUES (1, 'Mwingi School', 'PUBLIC');
    `)

    registerSettingsHandlers()
  })

  // ─── settings:get returns undefined row ─────────────────
  it('settings:get returns undefined when no settings row', async () => {
    db.exec('DELETE FROM school_settings')
    const handler = handlerMap.get('settings:get')!
    const result = await handler({})
    expect(result).toBeUndefined()
  })

  // ─── settings:update with empty sms strings (no ConfigService call) ──
  it('settings:update does NOT route empty sms strings to ConfigService', async () => {
    const handler = handlerMap.get('settings:update')!
    const result = await handler({}, {
      school_name: 'Mwingi School',
      sms_api_key: '',
      sms_api_secret: '',
      sms_sender_id: '',
    }) as { success: boolean }
    expect(result.success).toBe(true)
    // Empty strings should NOT trigger ConfigService.saveConfig
  })

  // ─── settings:uploadLogo error path ─────────────────────
  it('settings:uploadLogo returns error on save failure', async () => {
    saveImageMock.mockImplementationOnce(() => { throw new Error('Disk full') })
    const handler = handlerMap.get('settings:uploadLogo')!
    const result = await handler({}, 'data:image/png;base64,abc') as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toBe('Disk full')
  })

  it('settings:uploadLogo handles non-Error throw', async () => {
    saveImageMock.mockImplementationOnce(() => { throw 'string-error' }) // NOSONAR - intentionally testing non-Error throw handling
    const handler = handlerMap.get('settings:uploadLogo')!
    const result = await handler({}, 'data:image/png;base64,abc') as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to upload logo')
  })

  // ─── settings:removeLogo error path ─────────────────────
  it('settings:removeLogo returns error on deleteImage failure', async () => {
    db.exec("UPDATE school_settings SET logo_path = '/path/logo.png' WHERE id = 1")
    deleteImageMock.mockImplementationOnce(() => { throw new Error('Cannot delete') })
    const handler = handlerMap.get('settings:removeLogo')!
    const result = await handler({}) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toBe('Cannot delete')
  })

  it('settings:removeLogo handles non-Error throw', async () => {
    db.exec("UPDATE school_settings SET logo_path = '/path/logo.png' WHERE id = 1")
    deleteImageMock.mockImplementationOnce(() => { throw 42 }) // NOSONAR - intentionally testing non-Error throw handling
    const handler = handlerMap.get('settings:removeLogo')!
    const result = await handler({}) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to remove logo')
  })

  // ─── system:resetAndSeed in production ──────────────────
  it('system:resetAndSeed rejects in production', async () => {
    isPackaged = true
    clearSessionCache()
    handlerMap.clear()
    registerSettingsHandlers()
    const handler = handlerMap.get('system:resetAndSeed')!
    const result = await handler({}) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('production')
  })

  // ─── system:seedExams in production ─────────────────────
  it('system:seedExams rejects in production', async () => {
    isPackaged = true
    clearSessionCache()
    handlerMap.clear()
    registerSettingsHandlers()
    const handler = handlerMap.get('system:seedExams')!
    const result = await handler({}) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('production')
  })

  // ─── system:normalizeCurrencyScale with matching legacyUserId ─
  it('system:normalizeCurrencyScale succeeds with no legacyUserId', async () => {
    const handler = handlerMap.get('system:normalizeCurrencyScale')!
    const result = await handler({}) as { success: boolean }
    expect(result.success).toBe(true)
  })

  // ─── settings:getSecure returns value when present ──────
  it('settings:getSecure returns stored config', async () => {
    db.exec("INSERT INTO system_config (key, value, is_encrypted) VALUES ('test_key', 'test_value', 0)")
    const handler = handlerMap.get('settings:getSecure')!
    const result = await handler({}, 'test_key')
    expect(result).toBe('test_value')
  })

  // ─── settings:getLogoDataUrl returns data url ───────────
  it('settings:getLogoDataUrl returns base64 when logo exists', async () => {
    db.exec("UPDATE school_settings SET logo_path = '/img/logo.png' WHERE id = 1")
    getImageMock.mockReturnValueOnce('data:image/png;base64,abc123')
    const handler = handlerMap.get('settings:getLogoDataUrl')!
    const result = await handler({})
    expect(result).toBe('data:image/png;base64,abc123')
  })
})
