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
})
