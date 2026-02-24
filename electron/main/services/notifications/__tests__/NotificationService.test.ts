import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

const smsSendMock = vi.fn(async () => ({ success: true, messageId: 'sms-123' }))

vi.mock('../../../database', () => ({
  getDatabase: () => db
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

vi.mock('../SMSService', () => ({
  SMSService: class SMSServiceMock {
    send = smsSendMock
  }
}))

vi.mock('../EmailService', () => ({
  EmailService: class EmailServiceMock {
    send = vi.fn(async () => ({ success: true, messageId: 'email-123' }))
  }
}))

vi.mock('../../ConfigService', () => ({
  ConfigService: {
    getConfig: vi.fn((key: string) => {
      if (key === 'sms_api_key') { return 'test-key' }
      if (key === 'sms_api_secret') { return 'test-secret' }
      if (key === 'sms_sender_id') { return 'MWINGI' }
      return null
    })
  }
}))

import { NotificationService } from '../NotificationService'

describe('NotificationService communication logging', () => {
  beforeEach(() => {
    smsSendMock.mockClear()
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE user (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT
      );

      CREATE TABLE message_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipient_type TEXT NOT NULL,
        recipient_id INTEGER,
        recipient_contact TEXT NOT NULL,
        message_type TEXT NOT NULL,
        subject TEXT,
        message_body TEXT NOT NULL,
        status TEXT,
        external_id TEXT,
        error_message TEXT,
        sent_by_user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE message_template (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        template_name TEXT,
        template_type TEXT,
        category TEXT,
        subject TEXT,
        body TEXT,
        variables TEXT,
        is_active INTEGER DEFAULT 1
      );
    `)
  })

  it('writes recipient_contact when sending notifications', async () => {
    const service = new NotificationService()
    const result = await service.send({
      recipientType: 'GUARDIAN',
      recipientId: 7,
      channel: 'SMS',
      to: '+254700123456',
      message: 'Fee reminder'
    }, 10)

    expect(result.success).toBe(true)

    const row = db.prepare(`
      SELECT recipient_type, recipient_id, recipient_contact, message_type, status
      FROM message_log
      LIMIT 1
    `).get() as {
      recipient_type: string
      recipient_id: number
      recipient_contact: string
      message_type: string
      status: string
    } | undefined

    expect(row).toBeDefined()
    expect(row?.recipient_type).toBe('GUARDIAN')
    expect(row?.recipient_id).toBe(7)
    expect(row?.recipient_contact).toBe('+254700123456')
    expect(row?.message_type).toBe('SMS')
    expect(row?.status).toBe('SENT')
  })
})
