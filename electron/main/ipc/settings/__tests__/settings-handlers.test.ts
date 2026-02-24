import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

let db: Database.Database
const handlerMap = new Map<string, IpcHandler>()
let sessionRole = 'ADMIN'
let sessionUserId = 1

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn(async () => JSON.stringify({
      user: {
        id: sessionUserId,
        username: 'admin',
        role: sessionRole,
        full_name: 'Admin User',
        email: 'admin@example.com',
        is_active: 1,
        created_at: new Date().toISOString()
      },
      lastActivity: Date.now()
    })),
    setPassword: vi.fn(),
    deletePassword: vi.fn(),
  }
}))

vi.mock('../../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      handlerMap.set(channel, handler)
    }),
    removeHandler: vi.fn(),
  },
  app: {
    isPackaged: false
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => false),
    encryptString: vi.fn((value: string) => Buffer.from(value)),
    decryptString: vi.fn((value: Buffer) => value.toString('utf8')),
  }
}))

vi.mock('../../../database', () => ({
  getDatabase: () => db
}))

vi.mock('../../../services/base/ServiceContainer', () => ({
  container: {
    resolve: vi.fn(() => ({
      resetAndSeed2026: vi.fn(() => ({ success: true })),
      normalizeCurrencyScale: vi.fn(() => ({ success: true })),
      seedExamsOnly: vi.fn(() => ({ success: true }))
    }))
  }
}))

vi.mock('../../../utils/image-utils', () => ({
  saveImageFromDataUrl: vi.fn(() => 'C:/tmp/logo.png'),
  getImageAsBase64DataUrl: vi.fn(() => null),
  deleteImage: vi.fn()
}))

import { registerSettingsHandlers } from '../settings-handlers'

describe('settings handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    sessionRole = 'ADMIN'
    sessionUserId = 1

    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE school_settings (
        id INTEGER PRIMARY KEY,
        school_name TEXT,
        school_motto TEXT,
        address TEXT,
        phone TEXT,
        email TEXT,
        logo_path TEXT,
        mpesa_paybill TEXT,
        sms_sender_id TEXT,
        updated_at TEXT
      );

      CREATE TABLE system_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        is_encrypted INTEGER DEFAULT 0,
        updated_at TEXT
      );

      INSERT INTO school_settings (
        id, school_name, school_motto, address, phone, email, logo_path, mpesa_paybill, sms_sender_id, updated_at
      ) VALUES (
        1, 'Mwingi Adventist School', 'Excellence', 'Old Address', '0700000000',
        'old@example.com', NULL, NULL, NULL, datetime('now')
      );
    `)

    registerSettingsHandlers()
  })

  it('persists canonical address/phone/email keys via settings:update', async () => {
    const updateHandler = handlerMap.get('settings:update')
    const getHandler = handlerMap.get('settings:get')
    expect(updateHandler).toBeDefined()
    expect(getHandler).toBeDefined()

    const updateResult = await updateHandler!({}, {
      address: 'New Address',
      phone: '+254700123456',
      email: 'new@example.com',
      school_name: 'Mwingi Adventist School'
    }) as { success: boolean; error?: string }

    expect(updateResult.success).toBe(true)

    const updatedRow = await getHandler!({}) as { address: string; phone: string; email: string }
    expect(updatedRow.address).toBe('New Address')
    expect(updatedRow.phone).toBe('+254700123456')
    expect(updatedRow.email).toBe('new@example.com')
  })

  it('rejects unknown keys for settings:update', async () => {
    const updateHandler = handlerMap.get('settings:update')
    expect(updateHandler).toBeDefined()

    const result = await updateHandler!({}, {
      address: 'New Address',
      unknown_key: 'forbidden'
    }) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Validation failed')
  })
})
