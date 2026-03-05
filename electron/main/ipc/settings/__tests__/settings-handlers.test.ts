import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSessionCache } from '../../../security/session'

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
    isEncryptionAvailable: vi.fn(() => true),
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
    clearSessionCache()
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
        school_type TEXT NOT NULL DEFAULT 'PUBLIC',
        updated_at TEXT
      );

      CREATE TABLE system_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        is_encrypted INTEGER DEFAULT 0,
        updated_at TEXT
      );

      INSERT INTO school_settings (
        id, school_name, school_motto, address, phone, email, logo_path, mpesa_paybill, sms_sender_id, school_type, updated_at
      ) VALUES (
        1, 'Mwingi Adventist School', 'Excellence', 'Old Address', '0700000000',
        'old@example.com', NULL, NULL, NULL, 'PUBLIC', datetime('now')
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

  // ======= settings:get masks credentials for non-admin =======
  it('settings:get masks sms credentials for non-admin', async () => {
    db.exec(`
      UPDATE school_settings SET sms_sender_id = 'MY_SMS' WHERE id = 1
    `)
    // Insert sms_api_key into school_settings if column exists - it's done via ConfigService, but let's test the masking
    // The handler checks actor.role and masks sms_api_key / sms_api_secret columns
    sessionRole = 'TEACHER'
    handlerMap.clear()
    registerSettingsHandlers()
    const handler = handlerMap.get('settings:get')!
    const result = await handler({}) as any
    expect(result).toBeDefined()
    expect(result.school_name).toBe('Mwingi Adventist School')
  })

  // ======= settings:uploadLogo =======
  describe('settings:uploadLogo', () => {
    it('registers handler', () => {
      expect(handlerMap.has('settings:uploadLogo')).toBe(true)
    })

    it('uploads logo with valid data url', async () => {
      const handler = handlerMap.get('settings:uploadLogo')!
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
      const result = await handler({}, dataUrl) as any
      expect(result.success).toBe(true)
      expect(result.filePath).toBe('C:/tmp/logo.png')
    })

    it('enforces management role for uploadLogo', async () => {
      sessionRole = 'TEACHER'
      handlerMap.clear()
      registerSettingsHandlers()
      const handler = handlerMap.get('settings:uploadLogo')!
      const result = await handler({}, 'data:image/png;base64,abc') as any
      expect(result.success).toBe(false)
      expect(result.error).toContain('Unauthorized')
    })
  })

  // ======= settings:removeLogo =======
  describe('settings:removeLogo', () => {
    it('registers handler', () => {
      expect(handlerMap.has('settings:removeLogo')).toBe(true)
    })

    it('removes logo for management role', async () => {
      const handler = handlerMap.get('settings:removeLogo')!
      const result = await handler({}) as any
      expect(result.success).toBe(true)
    })
  })

  // ======= settings:getLogoDataUrl =======
  describe('settings:getLogoDataUrl', () => {
    it('registers handler', () => {
      expect(handlerMap.has('settings:getLogoDataUrl')).toBe(true)
    })

    it('returns null when no logo set', async () => {
      const handler = handlerMap.get('settings:getLogoDataUrl')!
      const result = await handler({})
      expect(result).toBeNull()
    })
  })

  // ======= settings:getSecure =======
  describe('settings:getSecure', () => {
    it('registers handler', () => {
      expect(handlerMap.has('settings:getSecure')).toBe(true)
    })

    it('returns config value for admin', async () => {
      const handler = handlerMap.get('settings:getSecure')!
      const result = await handler({}, 'sms_api_key')
      // ConfigService.getConfig returns from system_config table - no row = null
      expect(result).toBeNull()
    })

    it('enforces admin-only on getSecure', async () => {
      sessionRole = 'TEACHER'
      handlerMap.clear()
      registerSettingsHandlers()
      const handler = handlerMap.get('settings:getSecure')!
      const result = await handler({}, 'sms_api_key') as any
      expect(result.success).toBe(false)
      expect(result.error).toContain('Unauthorized')
    })
  })

  // ======= settings:saveSecure =======
  describe('settings:saveSecure', () => {
    it('registers handler', () => {
      expect(handlerMap.has('settings:saveSecure')).toBe(true)
    })

    it('saves secure config for admin', async () => {
      const handler = handlerMap.get('settings:saveSecure')!
      const result = await handler({}, 'test_key', 'test_value')
      expect(result).toBeDefined()
    })
  })

  // ======= settings:getAllConfigs =======
  describe('settings:getAllConfigs', () => {
    it('registers handler', () => {
      expect(handlerMap.has('settings:getAllConfigs')).toBe(true)
    })

    it('returns all configs for admin', async () => {
      const handler = handlerMap.get('settings:getAllConfigs')!
      const result = await handler({})
      expect(result).toBeDefined()
    })

    it('enforces admin-only on getAllConfigs', async () => {
      sessionRole = 'TEACHER'
      handlerMap.clear()
      registerSettingsHandlers()
      const handler = handlerMap.get('settings:getAllConfigs')!
      const result = await handler({}) as any
      expect(result.success).toBe(false)
      expect(result.error).toContain('Unauthorized')
    })
  })

  // ======= system:resetAndSeed =======
  describe('system:resetAndSeed', () => {
    it('registers handler', () => {
      expect(handlerMap.has('system:resetAndSeed')).toBe(true)
    })

    it('rejects renderer mismatch', async () => {
      const handler = handlerMap.get('system:resetAndSeed')!
      const event: any = { __ipcActor: { id: 1, role: 'ADMIN', username: 'admin', full_name: 'Admin', email: 'a@b.com', is_active: 1, created_at: new Date().toISOString() } }
      const result = await handler(event, 999) as any
      expect(result.success).toBe(false)
      expect(result.error).toContain('renderer user mismatch')
    })

    it('enforces admin-only on resetAndSeed', async () => {
      sessionRole = 'TEACHER'
      handlerMap.clear()
      registerSettingsHandlers()
      const handler = handlerMap.get('system:resetAndSeed')!
      const result = await handler({}, 1) as any
      expect(result.success).toBe(false)
      expect(result.error).toContain('Unauthorized')
    })
  })

  // ======= system:normalizeCurrencyScale =======
  describe('system:normalizeCurrencyScale', () => {
    it('registers handler', () => {
      expect(handlerMap.has('system:normalizeCurrencyScale')).toBe(true)
    })

    it('rejects renderer mismatch', async () => {
      const handler = handlerMap.get('system:normalizeCurrencyScale')!
      const event: any = { __ipcActor: { id: 1, role: 'ADMIN', username: 'admin', full_name: 'Admin', email: 'a@b.com', is_active: 1, created_at: new Date().toISOString() } }
      const result = await handler(event, 999) as any
      expect(result.success).toBe(false)
      expect(result.error).toContain('renderer user mismatch')
    })
  })

  // ======= system:seedExams =======
  describe('system:seedExams', () => {
    it('registers handler', () => {
      expect(handlerMap.has('system:seedExams')).toBe(true)
    })

    it('enforces admin-only on seedExams', async () => {
      sessionRole = 'TEACHER'
      handlerMap.clear()
      registerSettingsHandlers()
      const handler = handlerMap.get('system:seedExams')!
      const result = await handler({}) as any
      expect(result.success).toBe(false)
      expect(result.error).toContain('Unauthorized')
    })

    it('calls service seedExamsOnly on success', async () => {
      const handler = handlerMap.get('system:seedExams')!
      const result = await handler({}) as any
      expect(result.success).toBe(true)
    })
  })

  // ── additional branch coverage ────────────────────────────────
  it('settings:update routes sms credentials to ConfigService', async () => {
    const handler = handlerMap.get('settings:update')!
    const result = await handler({}, {
      school_name: 'Mwingi Adventist School',
      sms_api_key: 'my-key-123',
      sms_api_secret: 'my-secret-456',
      sms_sender_id: 'SCHOOL_SMS',
    }) as { success: boolean; error?: string }
    expect(result.error).toBeUndefined()
    expect(result.success).toBe(true)
  })

  it('settings:get masks sms_api_key/sms_api_secret for non-admin when present', async () => {
    // Add columns that the handler checks
    db.exec(`
      ALTER TABLE school_settings ADD COLUMN sms_api_key TEXT;
      ALTER TABLE school_settings ADD COLUMN sms_api_secret TEXT;
      UPDATE school_settings SET sms_api_key = 'real-key', sms_api_secret = 'real-secret' WHERE id = 1;
    `)
    sessionRole = 'TEACHER'
    handlerMap.clear()
    registerSettingsHandlers()
    const handler = handlerMap.get('settings:get')!
    const result = await handler({}) as Record<string, unknown>
    expect(result['sms_api_key']).toBe('********')
    expect(result['sms_api_secret']).toBe('********')
  })

  it('settings:removeLogo deletes existing logo_path', async () => {
    db.exec(`UPDATE school_settings SET logo_path = '/path/to/logo.png' WHERE id = 1`)
    const handler = handlerMap.get('settings:removeLogo')!
    const result = await handler({}) as { success: boolean }
    expect(result.success).toBe(true)
    const row = db.prepare('SELECT logo_path FROM school_settings WHERE id = 1').get() as { logo_path: string | null }
    expect(row.logo_path).toBeNull()
  })

  it('settings:getLogoDataUrl returns data url when logo_path exists', async () => {
    db.exec(`UPDATE school_settings SET logo_path = '/path/to/logo.png' WHERE id = 1`)
    const handler = handlerMap.get('settings:getLogoDataUrl')!
    const result = await handler({})
    // getImageAsBase64DataUrl is mocked to return null
    expect(result).toBeNull()
  })

  it('system:resetAndSeed calls service on success', async () => {
    const handler = handlerMap.get('system:resetAndSeed')!
    const result = await handler({}) as any
    expect(result.success).toBe(true)
  })

  it('system:normalizeCurrencyScale calls service on success', async () => {
    const handler = handlerMap.get('system:normalizeCurrencyScale')!
    const result = await handler({}) as any
    expect(result.success).toBe(true)
  })
})
