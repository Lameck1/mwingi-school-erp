import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../database', () => ({
  getDatabase: () => db
}))

vi.mock('../../electron-env', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => false),
    encryptString: vi.fn((value: string) => Buffer.from(value)),
    decryptString: vi.fn((value: Buffer) => value.toString('utf8'))
  }
}))

import { ConfigService } from '../ConfigService'

describe('ConfigService key normalization', () => {
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
})
