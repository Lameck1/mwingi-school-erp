import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

const safeStorageMock = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn(() => false),
  encryptString: vi.fn((value: string) => Buffer.from(`enc:${value}`, 'utf8')),
  decryptString: vi.fn((value: Buffer) => value.toString('utf8').replace(/^enc:/, ''))
}))

vi.mock('../../database', () => ({
  getDatabase: () => db
}))

vi.mock('../../electron-env', () => ({
  safeStorage: safeStorageMock
}))

import { ConfigService } from '../ConfigService'

describe('ConfigService key normalization and encryption migration', () => {
  beforeEach(() => {
    ConfigService.clearCache()
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE system_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        is_encrypted INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `)
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false)
    safeStorageMock.encryptString.mockClear()
    safeStorageMock.decryptString.mockClear()
  })

  afterEach(() => {
    db.close()
  })

  it('writes canonical SMS keys and reads them back', () => {
    ConfigService.saveConfig('sms.api_key', 'legacy-key', false)
    ConfigService.saveConfig('sms_sender_id', 'MWINGI', false)

    expect(ConfigService.getConfig('sms_api_key')).toBe('legacy-key')
    expect(ConfigService.getConfig('sms.sender_id')).toBe('MWINGI')
  })

  it('normalizes SMTP keys in getAllConfigs output', () => {
    db.prepare(`
      INSERT INTO system_config (key, value, is_encrypted)
      VALUES
        ('smtp.host', 'smtp.example.com', 0),
        ('smtp.port', '587', 0),
        ('smtp.user', 'noreply@example.com', 0),
        ('smtp.pass', 'secret', 1)
    `).run()

    const all = ConfigService.getAllConfigs()
    expect(all.smtp_host).toBe('smtp.example.com')
    expect(all.smtp_port).toBe('587')
    expect(all.smtp_user).toBe('noreply@example.com')
    expect(all.smtp_pass).toBe('******')
  })

  it('opportunistically re-encrypts sensitive plaintext config on read', () => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true)
    db.prepare('INSERT INTO system_config (key, value, is_encrypted) VALUES (?, ?, 0)').run('smtp_pass', 'plain-secret')

    const value = ConfigService.getConfig('smtp_pass')
    expect(value).toBe('plain-secret')
    expect(safeStorageMock.encryptString).toHaveBeenCalled()

    const row = db.prepare('SELECT value, is_encrypted FROM system_config WHERE key = ?').get('smtp_pass') as {
      value: string
      is_encrypted: number
    } | undefined
    expect(row?.is_encrypted).toBe(1)
    expect(row?.value).not.toBe('plain-secret')
  })

  it('gracefully returns null for encrypted values when safe storage is unavailable', () => {
    const encrypted = Buffer.from('enc:stored-secret', 'utf8').toString('base64')
    db.prepare('INSERT INTO system_config (key, value, is_encrypted) VALUES (?, ?, 1)').run('smtp_pass', encrypted)
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false)

    const value = ConfigService.getConfig('smtp_pass')
    expect(value).toBeNull()
  })

  it('encrypts and stores config when isEncrypted=true and safeStorage available', () => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true)
    const result = ConfigService.saveConfig('sms_api_key', 'my-secret-key', true)
    expect(result).toBe(true)
    expect(safeStorageMock.encryptString).toHaveBeenCalledWith('my-secret-key')

    const row = db.prepare('SELECT value, is_encrypted FROM system_config WHERE key = ?').get('sms_api_key') as {
      value: string; is_encrypted: number
    }
    expect(row.is_encrypted).toBe(1)
    // The stored value should be the base64 of the mock encrypted buffer
    expect(row.value).not.toBe('my-secret-key')
  })

  it('throws when isEncrypted=true but safeStorage unavailable', () => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false)
    expect(() => ConfigService.saveConfig('sms_api_key', 'secret', true)).toThrow(
      'SafeStorage unavailable'
    )
  })

  it('returns cached value on second read', () => {
    ConfigService.saveConfig('test_key', 'hello', false)
    const first = ConfigService.getConfig('test_key')
    expect(first).toBe('hello')
    // Second call should hit cache
    const second = ConfigService.getConfig('test_key')
    expect(second).toBe('hello')
  })

  it('returns null and caches for missing key', () => {
    const value = ConfigService.getConfig('nonexistent_key')
    expect(value).toBeNull()
    // Second call should still return null from cache
    const value2 = ConfigService.getConfig('nonexistent_key')
    expect(value2).toBeNull()
  })

  it('decrypts encrypted config when safeStorage is available', () => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true)
    const encrypted = Buffer.from('enc:my-password', 'utf8').toString('base64')
    db.prepare('INSERT INTO system_config (key, value, is_encrypted) VALUES (?, ?, 1)').run('sms_api_key', encrypted)

    const value = ConfigService.getConfig('sms_api_key')
    expect(value).toBe('my-password')
    expect(safeStorageMock.decryptString).toHaveBeenCalled()
  })

  it('returns null when decryption throws', () => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true)
    safeStorageMock.decryptString.mockImplementation(() => { throw new Error('bad buffer') })
    db.prepare('INSERT INTO system_config (key, value, is_encrypted) VALUES (?, ?, 1)').run('smtp_pass', 'garbled')

    const value = ConfigService.getConfig('smtp_pass')
    expect(value).toBeNull()
  })

  it('handles warn path when opportunistic re-encryption fails', () => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true)
    safeStorageMock.encryptString.mockImplementation(() => { throw new Error('encryption broken') })
    db.prepare('INSERT INTO system_config (key, value, is_encrypted) VALUES (?, ?, 0)').run('sms_api_secret', 'plain-secret')

    // Should still return the plain value even though re-encryption failed
    const value = ConfigService.getConfig('sms_api_secret')
    expect(value).toBe('plain-secret')
  })

  it('getAllConfigs prefers non-encrypted over encrypted for same canonical key', () => {
    // Insert both legacy (encrypted) and canonical (plain) for the same logical key
    db.prepare('INSERT INTO system_config (key, value, is_encrypted) VALUES (?, ?, 1)').run('sms.api_key', 'encrypted-val')
    db.prepare('INSERT INTO system_config (key, value, is_encrypted) VALUES (?, ?, 0)').run('sms_api_key', 'plain-val')

    const all = ConfigService.getAllConfigs()
    // The plain value should win over ******
    expect(all.sms_api_key).toBe('plain-val')
  })

  it('getAllConfigs masks encrypted values', () => {
    db.prepare('INSERT INTO system_config (key, value, is_encrypted) VALUES (?, ?, 1)').run('sms_api_key', 'enc-data')
    const all = ConfigService.getAllConfigs()
    expect(all.sms_api_key).toBe('******')
  })

  it('saveConfig stores non-encrypted value directly', () => {
    ConfigService.saveConfig('school_name', 'Mwingi Academy', false)
    const row = db.prepare('SELECT value, is_encrypted FROM system_config WHERE key = ?').get('school_name') as {
      value: string; is_encrypted: number
    }
    expect(row.value).toBe('Mwingi Academy')
    expect(row.is_encrypted).toBe(0)
  })

  it('saveConfig upserts existing key', () => {
    ConfigService.saveConfig('school_name', 'Old Name', false)
    ConfigService.saveConfig('school_name', 'New Name', false)
    const row = db.prepare('SELECT value FROM system_config WHERE key = ?').get('school_name') as { value: string }
    expect(row.value).toBe('New Name')
  })

  it('reads non-sensitive non-encrypted config without re-encryption', () => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true)
    db.prepare('INSERT INTO system_config (key, value, is_encrypted) VALUES (?, ?, 0)').run('school_name', 'Test School')

    const value = ConfigService.getConfig('school_name')
    expect(value).toBe('Test School')
    // Should NOT attempt encryption for non-sensitive key
    expect(safeStorageMock.encryptString).not.toHaveBeenCalled()
  })

  it('getAllConfigs keeps first value when duplicate canonical key has same encryption state', () => {
    // Insert two rows with different raw keys that canonicalize to the same key, both non-encrypted
    db.prepare('INSERT INTO system_config (key, value, is_encrypted) VALUES (?, ?, 0)').run('sms.api_key', 'first-val')
    db.prepare('INSERT INTO system_config (key, value, is_encrypted) VALUES (?, ?, 0)').run('sms_api_key', 'second-val')

    const all = ConfigService.getAllConfigs()
    // First row wins because existing value is 'first-val' (not '******'), second row is skipped
    expect(all.sms_api_key).toBe('first-val')
  })
})
