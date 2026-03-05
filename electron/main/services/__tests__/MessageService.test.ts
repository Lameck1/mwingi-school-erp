/**
 * Tests for MessageService.
 *
 * Uses in-memory SQLite with inline DDL for message_template, message_log,
 * and system_config tables. ConfigService.getConfig is mocked.
 */
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/* ── Hoisted mocks ────────────────────────────────────────────────── */
const mockGetConfig = vi.fn<(key: string) => string | null>()

vi.mock('electron-log', () => ({ default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))

let testDb: Database.Database
vi.mock('../../database', () => ({ getDatabase: () => testDb }))

vi.mock('../ConfigService', () => ({
  ConfigService: { getConfig: (...args: unknown[]) => mockGetConfig(args[0] as string) }
}))

import { MessageService } from '../MessageService'

/* ── Schema ───────────────────────────────────────────────────────── */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS message_template (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_name TEXT NOT NULL,
    template_type TEXT NOT NULL CHECK(template_type IN ('SMS','EMAIL')),
    subject TEXT,
    body TEXT NOT NULL,
    placeholders TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS message_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_type TEXT,
    recipient_id INTEGER,
    recipient_contact TEXT,
    message_type TEXT NOT NULL,
    message_body TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING',
    external_id TEXT,
    error_message TEXT,
    sent_by_user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS system_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT,
    is_encrypted BOOLEAN DEFAULT 0
  );
`

/* ── Helpers ──────────────────────────────────────────────────────── */
let service: MessageService

beforeEach(() => {
  testDb = new Database(':memory:')
  testDb.pragma('journal_mode = WAL')
  testDb.exec(SCHEMA)
  service = new MessageService()
  mockGetConfig.mockReset()
})

afterEach(() => {
  testDb.close()
})

/* ================================================================== */
/*  getTemplates()                                                     */
/* ================================================================== */
describe('MessageService.getTemplates()', () => {
  it('returns empty array when no templates exist', () => {
    const result = service.getTemplates()
    expect(result).toEqual([])
  })

  it('returns only active templates', () => {
    testDb.exec(`
      INSERT INTO message_template (template_name, template_type, body, is_active)
      VALUES ('Active', 'SMS', 'Hello', 1);
      INSERT INTO message_template (template_name, template_type, body, is_active)
      VALUES ('Inactive', 'SMS', 'Bye', 0);
    `)

    const result = service.getTemplates() as Array<{ template_name: string }>
    expect(result).toHaveLength(1)
    expect(result[0].template_name).toBe('Active')
  })

  it('returns all fields of an active template', () => {
    testDb.exec(`
      INSERT INTO message_template (template_name, template_type, subject, body, placeholders, is_active)
      VALUES ('Welcome', 'EMAIL', 'Hello!', 'Dear {name}', '{name}', 1);
    `)

    const result = service.getTemplates() as Array<Record<string, unknown>>
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      template_name: 'Welcome',
      template_type: 'EMAIL',
      subject: 'Hello!',
      body: 'Dear {name}',
      placeholders: '{name}'
    })
  })

  it('returns multiple active templates', () => {
    testDb.exec(`
      INSERT INTO message_template (template_name, template_type, body) VALUES ('T1', 'SMS', 'a');
      INSERT INTO message_template (template_name, template_type, body) VALUES ('T2', 'EMAIL', 'b');
      INSERT INTO message_template (template_name, template_type, body) VALUES ('T3', 'SMS', 'c');
    `)

    const result = service.getTemplates()
    expect(result).toHaveLength(3)
  })
})

/* ================================================================== */
/*  saveTemplate()                                                     */
/* ================================================================== */
describe('MessageService.saveTemplate()', () => {
  it('inserts a new template and returns its id', () => {
    const result = service.saveTemplate({
      template_name: 'New',
      template_type: 'SMS',
      body: 'Hello World'
    })

    expect(result.success).toBe(true)
    expect(result.id).toBeDefined()

    const rows = testDb.prepare('SELECT * FROM message_template').all() as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    expect(rows[0].template_name).toBe('New')
  })

  it('updates an existing template when id is provided', () => {
    testDb.exec(`
      INSERT INTO message_template (template_name, template_type, body)
      VALUES ('Old', 'SMS', 'OldBody');
    `)
    const existing = testDb.prepare('SELECT id FROM message_template WHERE template_name = ?').get('Old') as { id: number }

    const result = service.saveTemplate({
      id: existing.id,
      template_name: 'Updated',
      template_type: 'EMAIL',
      subject: 'Sub',
      body: 'NewBody',
      placeholders: '{foo}'
    })

    expect(result.success).toBe(true)
    expect(result.id).toBe(existing.id)

    const row = testDb.prepare('SELECT * FROM message_template WHERE id = ?').get(existing.id) as Record<string, unknown>
    expect(row.template_name).toBe('Updated')
    expect(row.template_type).toBe('EMAIL')
    expect(row.body).toBe('NewBody')
    expect(row.subject).toBe('Sub')
    expect(row.placeholders).toBe('{foo}')
  })

  it('inserts with optional fields as undefined', () => {
    const result = service.saveTemplate({
      template_name: 'Minimal',
      template_type: 'SMS',
      body: 'Just body'
    })

    expect(result.success).toBe(true)
    const row = testDb.prepare('SELECT * FROM message_template WHERE id = ?').get(result.id) as Record<string, unknown>
    expect(row.subject).toBeNull()
    expect(row.placeholders).toBeNull()
  })

  it('saves subject and placeholders when provided', () => {
    const result = service.saveTemplate({
      template_name: 'Full',
      template_type: 'EMAIL',
      subject: 'My Subject',
      body: 'Body text',
      placeholders: '{a},{b}'
    })

    expect(result.success).toBe(true)
    const row = testDb.prepare('SELECT * FROM message_template WHERE id = ?').get(result.id) as Record<string, unknown>
    expect(row.subject).toBe('My Subject')
    expect(row.placeholders).toBe('{a},{b}')
  })
})

/* ================================================================== */
/*  sendSms()                                                          */
/* ================================================================== */
describe('MessageService.sendSms()', () => {
  it('returns failure when SMS API key is not configured', () => {
    mockGetConfig.mockReturnValue(null)

    const result = service.sendSms({
      to: '+254700000000',
      message: 'Test',
      userId: 1
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('SMS API Key not configured')

    // Log entry should exist with FAILED status
    const log = testDb.prepare('SELECT * FROM message_log').all() as Array<Record<string, unknown>>
    expect(log).toHaveLength(1)
    expect(log[0].status).toBe('FAILED')
    expect(log[0].error_message).toContain('SMS API Key not configured')
  })

  it('marks log as SENT when API key is configured', () => {
    mockGetConfig.mockReturnValue('valid-api-key')

    const result = service.sendSms({
      to: '+254700000000',
      message: 'Hello!',
      userId: 1
    })

    expect(result.success).toBe(true)
    expect(result.messageId).toBeDefined()

    const log = testDb.prepare('SELECT * FROM message_log').all() as Array<Record<string, unknown>>
    expect(log).toHaveLength(1)
    expect(log[0].status).toBe('SENT')
    expect(log[0].external_id).toBeTruthy()
  })

  it('records recipient_type and recipient_id when provided', () => {
    mockGetConfig.mockReturnValue('valid-api-key')

    service.sendSms({
      to: '+254711111111',
      message: 'Hi',
      recipientId: 42,
      recipientType: 'STUDENT',
      userId: 1
    })

    const log = testDb.prepare('SELECT * FROM message_log').get() as Record<string, unknown>
    expect(log.recipient_type).toBe('STUDENT')
    expect(log.recipient_id).toBe(42)
    expect(log.recipient_contact).toBe('+254711111111')
  })

  it('defaults recipient_type to OTHER when not provided', () => {
    mockGetConfig.mockReturnValue('key')

    service.sendSms({
      to: '+254700000000',
      message: 'Msg',
      userId: 1
    })

    const log = testDb.prepare('SELECT * FROM message_log').get() as Record<string, unknown>
    expect(log.recipient_type).toBe('OTHER')
  })

  it('stores message body in log', () => {
    mockGetConfig.mockReturnValue('key')

    service.sendSms({
      to: '+254700000000',
      message: 'Important message content',
      userId: 5
    })

    const log = testDb.prepare('SELECT * FROM message_log').get() as Record<string, unknown>
    expect(log.message_body).toBe('Important message content')
    expect(log.sent_by_user_id).toBe(5)
    expect(log.message_type).toBe('SMS')
  })
})

/* ================================================================== */
/*  getLogs()                                                           */
/* ================================================================== */
describe('MessageService.getLogs()', () => {
  it('returns empty array when no logs exist', () => {
    const result = service.getLogs()
    expect(result).toEqual([])
  })

  it('returns logs in descending order by created_at', () => {
    testDb.exec(`
      INSERT INTO message_log (recipient_contact, message_type, message_body, status, sent_by_user_id, created_at)
      VALUES ('+254700000001', 'SMS', 'first', 'SENT', 1, '2025-01-01 00:00:00');
      INSERT INTO message_log (recipient_contact, message_type, message_body, status, sent_by_user_id, created_at)
      VALUES ('+254700000002', 'SMS', 'second', 'SENT', 1, '2025-06-01 00:00:00');
      INSERT INTO message_log (recipient_contact, message_type, message_body, status, sent_by_user_id, created_at)
      VALUES ('+254700000003', 'SMS', 'third', 'FAILED', 1, '2025-12-01 00:00:00');
    `)

    const result = service.getLogs() as Array<Record<string, unknown>>
    expect(result).toHaveLength(3)
    expect(result[0].message_body).toBe('third')
    expect(result[2].message_body).toBe('first')
  })

  it('respects custom limit parameter', () => {
    for (let i = 0; i < 10; i++) {
      testDb.prepare(
        "INSERT INTO message_log (recipient_contact, message_type, message_body, status, sent_by_user_id) VALUES (?, 'SMS', ?, 'SENT', 1)"
      ).run(`+25470000000${i}`, `msg${i}`)
    }

    const result = service.getLogs(3)
    expect(result).toHaveLength(3)
  })

  it('defaults to 50 limit', () => {
    for (let i = 0; i < 55; i++) {
      testDb.prepare(
        "INSERT INTO message_log (recipient_contact, message_type, message_body, status, sent_by_user_id) VALUES (?, 'SMS', ?, 'SENT', 1)"
      ).run(`+2547${String(i).padStart(8, '0')}`, `msg${i}`)
    }

    const result = service.getLogs()
    expect(result).toHaveLength(50)
  })
})

/* ================================================================== */
/*  sendSms() – additional branch coverage                             */
/* ================================================================== */
describe('MessageService.sendSms() – branch coverage', () => {
  it('stores null recipient_id when not provided', () => {
    mockGetConfig.mockReturnValue('key')

    service.sendSms({
      to: '+254700000000',
      message: 'Test',
      userId: 1,
    })

    const log = testDb.prepare('SELECT * FROM message_log').get() as Record<string, unknown>
    expect(log.recipient_id).toBeNull()
  })

  it('stores provided description in message_body', () => {
    mockGetConfig.mockReturnValue('key')

    service.sendSms({
      to: '+254700000000',
      message: 'Custom message description',
      userId: 2,
      recipientId: 10,
      recipientType: 'GUARDIAN',
    })

    const log = testDb.prepare('SELECT * FROM message_log').get() as Record<string, unknown>
    expect(log.message_body).toBe('Custom message description')
    expect(log.recipient_type).toBe('GUARDIAN')
    expect(log.recipient_id).toBe(10)
  })

  it('handles non-Error throw in sendSms catch block', () => {
    mockGetConfig.mockReturnValue('key')
    // Make the UPDATE statement throw a non-Error value
    const origPrepare = testDb.prepare.bind(testDb)
    let callCount = 0
    const spy = vi.spyOn(testDb, 'prepare').mockImplementation((...args: unknown[]) => {
      const sql = args[0] as string
      if (sql.includes('UPDATE message_log SET status') && callCount++ === 0) {
        return { run: () => { throw 'string-error-in-update' } } as any // NOSONAR
      }
      return origPrepare(sql)
    })

    const result = service.sendSms({
      to: '+254700000000',
      message: 'Test',
      userId: 1,
    })
    expect(result.success).toBe(false)
    expect(result.error).toBe('string-error-in-update')
    spy.mockRestore()
  })
})
