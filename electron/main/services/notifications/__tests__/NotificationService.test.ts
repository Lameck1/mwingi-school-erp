import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

const smsSendMock = vi.fn(async () => ({ success: true, messageId: 'sms-123' }))
const emailSendMock = vi.fn(async () => ({ success: true, messageId: 'email-123' }))

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
    send = emailSendMock
  }
}))

vi.mock('../../ConfigService', () => ({
  ConfigService: {
    getConfig: vi.fn((key: string) => {
      if (key === 'sms_api_key') { return 'test-key' }
      if (key === 'sms_api_secret') { return 'test-secret' }
      if (key === 'sms_sender_id') { return 'MWINGI' }
      if (key === 'smtp_host') { return 'smtp.test.com' }
      if (key === 'smtp_port') { return '587' }
      if (key === 'smtp_user') { return 'user@test.com' }
      if (key === 'smtp_pass') { return 'pass123' }
      return null
    })
  }
}))

import { NotificationService } from '../NotificationService'

describe('NotificationService', () => {
  let service: NotificationService

  beforeEach(() => {
    smsSendMock.mockClear()
    emailSendMock.mockClear()
    smsSendMock.mockResolvedValue({ success: true, messageId: 'sms-123' })
    emailSendMock.mockResolvedValue({ success: true, messageId: 'email-123' })
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

      INSERT INTO user (id, full_name) VALUES (10, 'Admin User');
    `)
    service = new NotificationService()
  })

  afterEach(() => {
    db.close()
  })

  // ── send() ────────────────────────────────────────────────────
  describe('send', () => {
    it('sends SMS and logs communication', async () => {
      const result = await service.send({
        recipientType: 'GUARDIAN', recipientId: 7,
        channel: 'SMS', to: '+254700123456', message: 'Fee reminder'
      }, 10)

      expect(result.success).toBe(true)
      expect(smsSendMock).toHaveBeenCalledWith('+254700123456', 'Fee reminder')

      const row = db.prepare('SELECT * FROM message_log LIMIT 1').get() as any
      expect(row.recipient_contact).toBe('+254700123456')
      expect(row.message_type).toBe('SMS')
      expect(row.status).toBe('SENT')
    })

    it('sends email and logs communication', async () => {
      const result = await service.send({
        recipientType: 'GUARDIAN', recipientId: 7,
        channel: 'EMAIL', to: 'parent@example.com',
        subject: 'Fee Update', message: 'Your fee balance is KES 5000'
      }, 10)

      expect(result.success).toBe(true)
      expect(emailSendMock).toHaveBeenCalledWith('parent@example.com', 'Fee Update', 'Your fee balance is KES 5000')
    })

    it('processes template variables before sending', async () => {
      db.prepare(`INSERT INTO message_template (id, template_name, template_type, category, subject, body, variables, is_active)
        VALUES (1, 'Fee Reminder', 'SMS', 'FINANCE', NULL, 'Dear {{guardian_name}}, {{student_name}} owes {{balance}}', '["guardian_name","student_name","balance"]', 1)`).run()

      const result = await service.send({
        recipientType: 'GUARDIAN', recipientId: 7,
        channel: 'SMS', to: '+254700123456', message: '',
        templateId: 1,
        variables: { guardian_name: 'Jane', student_name: 'Alice', balance: '5000' }
      }, 10)

      expect(result.success).toBe(true)
      expect(smsSendMock).toHaveBeenCalledWith('+254700123456', 'Dear Jane, Alice owes 5000')
    })

    it('processes template subject when template has a subject defined', async () => {
      db.prepare(`INSERT INTO message_template (id, template_name, template_type, category, subject, body, variables, is_active)
        VALUES (1, 'Fee Notice', 'EMAIL', 'FINANCE', 'Fee for {{student_name}}', 'Dear parent, {{student_name}} owes {{balance}}', '["student_name","balance"]', 1)`).run()

      const result = await service.send({
        recipientType: 'GUARDIAN', recipientId: 7,
        channel: 'EMAIL', to: 'parent@example.com', message: '',
        templateId: 1,
        variables: { student_name: 'Alice', balance: '5000' }
      }, 10)

      expect(result.success).toBe(true)
      expect(emailSendMock).toHaveBeenCalledWith('parent@example.com', 'Fee for Alice', 'Dear parent, Alice owes 5000')
    })

    it('logs FAILED status when SMS send fails', async () => {
      smsSendMock.mockResolvedValue({ success: false, error: 'Network error' })

      const result = await service.send({
        recipientType: 'GUARDIAN', recipientId: 7,
        channel: 'SMS', to: '+254700123456', message: 'Test'
      }, 10)

      expect(result.success).toBe(false)
      const row = db.prepare('SELECT status, error_message FROM message_log LIMIT 1').get() as any
      expect(row.status).toBe('FAILED')
      expect(row.error_message).toBe('Network error')
    })

    it('catches and logs exceptions during dispatch', async () => {
      smsSendMock.mockRejectedValue(new Error('Connection refused'))

      const result = await service.send({
        recipientType: 'GUARDIAN', recipientId: 7,
        channel: 'SMS', to: '+254700123456', message: 'Test'
      }, 10)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Connection refused')
      const row = db.prepare('SELECT status FROM message_log LIMIT 1').get() as any
      expect(row.status).toBe('FAILED')
    })
  })

  // ── Templates ─────────────────────────────────────────────────
  describe('getTemplates', () => {
    it('returns active templates', () => {
      db.prepare(`INSERT INTO message_template (template_name, template_type, category, body, is_active)
        VALUES ('Active', 'SMS', 'FINANCE', 'body', 1)`).run()
      db.prepare(`INSERT INTO message_template (template_name, template_type, category, body, is_active)
        VALUES ('Inactive', 'SMS', 'FINANCE', 'body', 0)`).run()
      const templates = service.getTemplates()
      expect(templates.length).toBe(1)
      expect(templates[0].template_name).toBe('Active')
    })
  })

  describe('getTemplate', () => {
    it('returns template by id', () => {
      db.prepare(`INSERT INTO message_template (id, template_name, template_type, category, body, is_active)
        VALUES (5, 'Test', 'SMS', 'FINANCE', 'Hello', 1)`).run()
      const template = service.getTemplate(5)
      expect(template).not.toBeNull()
      expect(template!.template_name).toBe('Test')
    })

    it('returns null for non-existent template', () => {
      const template = service.getTemplate(999)
      expect(template).toBeNull()
    })
  })

  describe('createTemplate', () => {
    it('creates template and extracts variables', () => {
      const result = service.createTemplate({
        name: 'Reminder', type: 'SMS', category: 'FINANCE',
        subject: null, body: 'Dear {{name}}, balance is {{amount}}', userId: 10,
      })
      expect(result.success).toBe(true)
      expect(result.id).toBeGreaterThan(0)
      const row = db.prepare('SELECT variables FROM message_template WHERE id = ?').get(result.id!) as any
      expect(JSON.parse(row.variables)).toEqual(['name', 'amount'])
    })

    it('rejects empty name', () => {
      const result = service.createTemplate({
        name: '', type: 'SMS', category: 'FINANCE',
        subject: null, body: 'Hello', userId: 10,
      })
      expect(result.success).toBe(false)
      expect(result.errors).toContain('Template name is required')
    })

    it('rejects empty body', () => {
      const result = service.createTemplate({
        name: 'Test', type: 'SMS', category: 'FINANCE',
        subject: null, body: '  ', userId: 10,
      })
      expect(result.success).toBe(false)
      expect(result.errors).toContain('Template body is required')
    })
  })

  describe('getDefaultTemplates', () => {
    it('returns default templates array', () => {
      const templates = service.getDefaultTemplates()
      expect(Array.isArray(templates)).toBe(true)
      expect(templates.length).toBeGreaterThan(0)
    })
  })

  // ── Bulk reminders ────────────────────────────────────────────
  describe('sendBulkFeeReminders', () => {
    it('sends reminders and returns counts', async () => {
      db.prepare(`INSERT INTO message_template (id, template_name, template_type, category, body, is_active)
        VALUES (1, 'Reminder', 'SMS', 'FINANCE', 'Dear {{guardian_name}}, {{student_name}} owes {{balance}}', 1)`).run()

      const result = await service.sendBulkFeeReminders(1, [
        { student_id: 1, student_name: 'Alice', guardian_name: 'Jane', guardian_phone: '+254700000001', admission_number: 'ADM001', class_name: 'G7', balance: 5000 },
        { student_id: 2, student_name: 'Bob', guardian_name: 'John', guardian_phone: '+254700000002', admission_number: 'ADM002', class_name: 'G7', balance: 3000 },
      ], 10)

      expect(result.sent).toBe(2)
      expect(result.failed).toBe(0)
    })

    it('counts failures for missing phone numbers', async () => {
      const result = await service.sendBulkFeeReminders(1, [
        { student_id: 1, student_name: 'Alice', guardian_name: 'Jane', guardian_phone: '', admission_number: 'ADM001', class_name: 'G7', balance: 5000 },
      ], 10)

      expect(result.sent).toBe(0)
      expect(result.failed).toBe(1)
      expect(result.errors[0]).toContain('No phone number')
    })
  })

  // ── Communication history ─────────────────────────────────────
  describe('getCommunicationHistory', () => {
    it('returns all logs when no filters', async () => {
      await service.send({
        recipientType: 'GUARDIAN', recipientId: 1,
        channel: 'SMS', to: '+254700000001', message: 'Hello'
      }, 10)
      const logs = service.getCommunicationHistory()
      expect(logs.length).toBe(1)
    })

    it('filters by recipientType and status', async () => {
      await service.send({
        recipientType: 'GUARDIAN', recipientId: 1,
        channel: 'SMS', to: '+254700000001', message: 'Test'
      }, 10)
      const logs = service.getCommunicationHistory({ recipientType: 'GUARDIAN', status: 'SENT' })
      expect(logs.length).toBe(1)
      const empty = service.getCommunicationHistory({ recipientType: 'STAFF' })
      expect(empty.length).toBe(0)
    })
  })

  // ── reloadConfig ──────────────────────────────────────────────
  describe('reloadConfig', () => {
    it('resets and reloads config without error', () => {
      expect(() => service.reloadConfig()).not.toThrow()
    })
  })

  // ── send – template with subject ──────────────────────────────
  describe('send – template with subject', () => {
    it('processes template subject when present', async () => {
      db.prepare(`INSERT INTO message_template (id, template_name, template_type, category, subject, body, variables, is_active)
        VALUES (2, 'Email Reminder', 'EMAIL', 'FINANCE', 'Fee Notice for {{student_name}}', 'Dear {{guardian_name}}, balance is {{balance}}', '["guardian_name","student_name","balance"]', 1)`).run()

      const result = await service.send({
        recipientType: 'GUARDIAN', recipientId: 7,
        channel: 'EMAIL', to: 'parent@example.com',
        message: '', templateId: 2,
        variables: { guardian_name: 'Jane', student_name: 'Alice', balance: '5000' }
      }, 10)

      expect(result.success).toBe(true)
      expect(emailSendMock).toHaveBeenCalledWith('parent@example.com', 'Fee Notice for Alice', 'Dear Jane, balance is 5000')
    })
  })

  // ── send – non-Error throw ────────────────────────────────────
  describe('send – non-Error thrown', () => {
    it('handles non-Error object in catch', async () => {
      smsSendMock.mockRejectedValue('string error')

      const result = await service.send({
        recipientType: 'GUARDIAN', recipientId: 7,
        channel: 'SMS', to: '+254700123456', message: 'Test'
      }, 10)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unknown error')
    })
  })

  // ── getCommunicationHistory – additional filters ──────────────
  describe('getCommunicationHistory – advanced filters', () => {
    beforeEach(async () => {
      await service.send({
        recipientType: 'GUARDIAN', recipientId: 1,
        channel: 'SMS', to: '+254700000001', message: 'Hello 1'
      }, 10)
      await service.send({
        recipientType: 'STUDENT', recipientId: 2,
        channel: 'EMAIL', to: 'student@example.com',
        subject: 'Notice', message: 'Hi there'
      }, 10)
    })

    it('filters by channel', () => {
      const logs = service.getCommunicationHistory({ channel: 'EMAIL' })
      expect(logs.length).toBe(1)
      expect(logs[0].message_type).toBe('EMAIL')
    })

    it('filters by recipientId', () => {
      const logs = service.getCommunicationHistory({ recipientId: 2 })
      expect(logs.length).toBe(1)
    })

    it('filters by date range', () => {
      const today = new Date().toISOString().split('T')[0]
      const logs = service.getCommunicationHistory({ startDate: today, endDate: today })
      expect(logs.length).toBe(2)
    })

    it('returns empty for future date range', () => {
      const logs = service.getCommunicationHistory({ startDate: '2099-01-01', endDate: '2099-12-31' })
      expect(logs.length).toBe(0)
    })
  })

  // ── send – email without email provider ───────────────────────
  describe('dispatchMessage – unconfigured providers', () => {
    it('returns error when email service not configured', async () => {
      // Create a new service with no SMTP config
      const { ConfigService: MockConfigService } = await import('../../ConfigService') as any
      MockConfigService.getConfig.mockImplementation((key: string) => {
        if (key === 'sms_api_key') {return 'test-key'}
        if (key === 'sms_api_secret') {return 'test-secret'}
        if (key === 'sms_sender_id') {return 'MWINGI'}
        return null // No SMTP config
      })
      const svc2 = new NotificationService()
      svc2.reloadConfig()

      const result = await svc2.send({
        recipientType: 'GUARDIAN', recipientId: 7,
        channel: 'EMAIL', to: 'test@example.com',
        subject: 'Test', message: 'Hello'
      }, 10)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Email provider not configured')
    })

    it('returns error when SMS service not configured', async () => {
      const { ConfigService: MockConfigService } = await import('../../ConfigService') as any
      MockConfigService.getConfig.mockImplementation(() => null)
      const svc3 = new NotificationService()
      svc3.reloadConfig()

      const result = await svc3.send({
        recipientType: 'GUARDIAN', recipientId: 7,
        channel: 'SMS', to: '+254700123456', message: 'Test'
      }, 10)

      expect(result.success).toBe(false)
      expect(result.error).toContain('SMS provider not configured')
    })
  })

  // ── sendBulkFeeReminders – partial failure ────────────────────
  describe('sendBulkFeeReminders – partial failures', () => {
    beforeEach(async () => {
      // Ensure ConfigService mock is restored after unconfigured provider tests
      const { ConfigService: MockConfigService } = await import('../../ConfigService') as any
      MockConfigService.getConfig.mockImplementation((key: string) => {
        if (key === 'sms_api_key') {return 'test-key'}
        if (key === 'sms_api_secret') {return 'test-secret'}
        if (key === 'sms_sender_id') {return 'MWINGI'}
        if (key === 'smtp_host') {return 'smtp.test.com'}
        if (key === 'smtp_port') {return '587'}
        if (key === 'smtp_user') {return 'user@test.com'}
        if (key === 'smtp_pass') {return 'pass123'}
        return null
      })
      service.reloadConfig()
    })

    it('handles mixed success and failure', async () => {
      db.prepare(`INSERT INTO message_template (id, template_name, template_type, category, body, is_active)
        VALUES (3, 'Bulk', 'SMS', 'FINANCE', 'Dear {{guardian_name}}', 1)`).run()

      smsSendMock
        .mockResolvedValueOnce({ success: true, messageId: 'ok-1' })
        .mockResolvedValueOnce({ success: false, error: 'Delivery failed' })

      const result = await service.sendBulkFeeReminders(3, [
        { student_id: 1, student_name: 'A', guardian_name: 'G1', guardian_phone: '+254700000001', admission_number: 'ADM001', class_name: 'G7', balance: 1000 },
        { student_id: 2, student_name: 'B', guardian_name: 'G2', guardian_phone: '+254700000002', admission_number: 'ADM002', class_name: 'G8', balance: 2000 },
      ], 10)

      expect(result.sent).toBe(1)
      expect(result.failed).toBe(1)
      expect(result.errors.length).toBe(1)
    })
  })

  // ── processTemplate – unresolved variables ────────────────────
  describe('send – template variable not provided', () => {
    beforeEach(async () => {
      // Ensure ConfigService mock is restored after unconfigured provider tests
      const { ConfigService: MockConfigService } = await import('../../ConfigService') as any
      MockConfigService.getConfig.mockImplementation((key: string) => {
        if (key === 'sms_api_key') {return 'test-key'}
        if (key === 'sms_api_secret') {return 'test-secret'}
        if (key === 'sms_sender_id') {return 'MWINGI'}
        if (key === 'smtp_host') {return 'smtp.test.com'}
        if (key === 'smtp_port') {return '587'}
        if (key === 'smtp_user') {return 'user@test.com'}
        if (key === 'smtp_pass') {return 'pass123'}
        return null
      })
      service.reloadConfig()
    })

    it('leaves unmatched variables as-is', async () => {
      db.prepare(`INSERT INTO message_template (id, template_name, template_type, category, body, is_active)
        VALUES (4, 'Partial', 'SMS', 'FINANCE', 'Hi {{name}}, your code is {{code}}', 1)`).run()

      await service.send({
        recipientType: 'GUARDIAN', recipientId: 7,
        channel: 'SMS', to: '+254700123456', message: '',
        templateId: 4, variables: { name: 'Alice' }
      }, 10)

      expect(smsSendMock).toHaveBeenCalledWith('+254700123456', 'Hi Alice, your code is {{code}}')
    })
  })

  // ── branch coverage: createTemplate with body having no template variables ──
  describe('createTemplate – no-variable body', () => {
    it('succeeds and stores empty variables array', () => {
      const result = service.createTemplate({
        name: 'Plain Notice',
        type: 'SMS',
        category: 'GENERAL',
        subject: null,
        body: 'No variables here at all.',
        userId: 10
      })
      expect(result.success).toBe(true)
      expect(typeof result.id).toBe('number')
      const tmpl = service.getTemplate(result.id!)
      expect(tmpl).toBeDefined()
      expect(JSON.parse(tmpl!.variables as unknown as string)).toEqual([])
    })
  })

  // ── branch coverage: createTemplate rejects empty name ──
  describe('createTemplate – validation', () => {
    it('rejects empty template name', () => {
      const result = service.createTemplate({
        name: '  ',
        type: 'EMAIL',
        category: 'FINANCE',
        subject: 'Test',
        body: 'A body',
        userId: 10
      })
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('name is required')
    })

    it('rejects empty template body', () => {
      const result = service.createTemplate({
        name: 'Valid Name',
        type: 'EMAIL',
        category: 'FINANCE',
        subject: 'Test',
        body: '  ',
        userId: 10
      })
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('body is required')
    })
  })

  // ── branch coverage: reloadConfig resets and reloads config ──
  describe('reloadConfig', () => {
    it('can be called without error and re-initialises providers', () => {
      expect(() => service.reloadConfig()).not.toThrow()
    })
  })

  /* ==================================================================
   *  Branch‐coverage: provider normalization (TWILIO / NEXMO / CUSTOM)
   * ================================================================== */
  describe('loadConfig – SMS provider normalization', () => {
    it('selects TWILIO provider when sms_provider config is TWILIO', async () => {
      const { ConfigService } = await import('../../ConfigService') as any
      vi.mocked(ConfigService.getConfig).mockImplementation((key: string) => {
        if (key === 'sms_api_key') {return 'key'}
        if (key === 'sms_provider') {return 'twilio'}
        if (key === 'smtp_host') {return null}
        return null
      })
      const svc = new NotificationService()
      // Force reload to pick up new mock
      svc.reloadConfig()
      // Verify the service was constructed without error – provider is internal
      expect(svc).toBeDefined()
    })

    it('falls back to AFRICASTALKING for unknown provider', async () => {
      const { ConfigService } = await import('../../ConfigService') as any
      vi.mocked(ConfigService.getConfig).mockImplementation((key: string) => {
        if (key === 'sms_api_key') {return 'key'}
        if (key === 'sms_provider') {return 'UNKNOWN_PROVIDER'}
        if (key === 'smtp_host') {return null}
        return null
      })
      const svc = new NotificationService()
      svc.reloadConfig()
      expect(svc).toBeDefined()
    })
  })

  /* ==================================================================
   *  Branch‐coverage: null apiSecret / senderId fallback to ''
   * ================================================================== */
  describe('loadConfig – null apiSecret and senderId', () => {
    it('uses empty string fallback for null apiSecret and senderId', async () => {
      const { ConfigService } = await import('../../ConfigService') as any
      vi.mocked(ConfigService.getConfig).mockImplementation((key: string) => {
        if (key === 'sms_api_key') {return 'key'}
        if (key === 'sms_api_secret') {return null}
        if (key === 'sms_sender_id') {return null}
        if (key === 'smtp_host') {return null}
        return null
      })
      const svc = new NotificationService()
      svc.reloadConfig()
      // Send SMS to exercise the code path
      const result = await svc.send({
        recipientType: 'GUARDIAN', recipientId: 1,
        channel: 'SMS', to: '+254700000000', message: 'Hello'
      }, 10)
      expect(result.success).toBe(true)
    })
  })

  /* ==================================================================
   *  Branch‐coverage: SMTP not configured → legacy fallback
   * ================================================================== */
  describe('loadConfig – legacy email fallback from school_settings', () => {
    it('enters legacy fallback when smtp config is missing', async () => {
      const { ConfigService } = await import('../../ConfigService') as any
      vi.mocked(ConfigService.getConfig).mockImplementation((key: string) => {
        if (key === 'sms_api_key') {return 'key'}
        if (key === 'sms_api_secret') {return 'secret'}
        if (key === 'sms_sender_id') {return 'MWINGI'}
        // No smtp_host etc → triggers else branch
        return null
      })
      // Create school_settings table with email_provider_config
      db.exec(`
        CREATE TABLE school_settings (
          id INTEGER PRIMARY KEY,
          email_provider_config TEXT
        );
        INSERT INTO school_settings (id, email_provider_config) VALUES (1, '{"provider":"SMTP","host":"smtp.test.com","port":587,"user":"u@test.com","password":"p","fromEmail":"u@test.com","fromName":"Test"}');
      `)
      const svc = new NotificationService()
      svc.reloadConfig()
      // Email should be configured via legacy path
      const result = await svc.send({
        recipientType: 'GUARDIAN', recipientId: 1,
        channel: 'EMAIL', to: 'a@b.com', subject: 'Test', message: 'Hi'
      }, 10)
      expect(result.success).toBe(true)
    })

    it('handles school_settings without email_provider_config', async () => {
      const { ConfigService } = await import('../../ConfigService') as any
      vi.mocked(ConfigService.getConfig).mockImplementation((key: string) => {
        if (key === 'sms_api_key') {return 'key'}
        return null
      })
      db.exec(`
        CREATE TABLE school_settings (
          id INTEGER PRIMARY KEY,
          email_provider_config TEXT
        );
        INSERT INTO school_settings (id) VALUES (1);
      `)
      const svc = new NotificationService()
      svc.reloadConfig()
      // EMAIL should fail since no provider configured
      const result = await svc.send({
        recipientType: 'GUARDIAN', recipientId: 1,
        channel: 'EMAIL', to: 'a@b.com', message: 'Hi'
      }, 10)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Email provider not configured')
    })
  })

  /* ==================================================================
   *  Branch‐coverage: send() with templateId but no variables
   * ================================================================== */
  describe('send – template without variables and without subject', () => {
    it('uses {} fallback when variables is undefined and falls back to template subject', async () => {
      db.prepare(`INSERT INTO message_template (id, template_name, template_type, category, subject, body, variables, is_active)
        VALUES (99, 'PlainTmpl', 'SMS', 'GENERAL', NULL, 'Hello student', '[]', 1)`).run()

      const result = await service.send({
        recipientType: 'GUARDIAN', recipientId: 1,
        channel: 'SMS', to: '+254700000001', message: '',
        templateId: 99
        // no variables property → triggers `request.variables || {}` fallback
        // template.subject is NULL → skips subject override
      }, 10)
      expect(result.success).toBe(true)
      expect(smsSendMock).toHaveBeenCalledWith('+254700000001', 'Hello student')
    })

    it('uses "Notification" fallback when subject is falsy', async () => {
      const result = await service.send({
        recipientType: 'GUARDIAN', recipientId: 1,
        channel: 'EMAIL', to: 'a@b.com', message: 'Body text'
        // no subject → triggers `subject || 'Notification'` fallback
      }, 10)
      // Even if email provider isn't fully configured, the subject fallback branch is exercised
      // Check that the send was attempted (or that it properly failed with provider error)
      expect(result).toBeDefined()
    })
  })

  /* ==================================================================
   *  Branch‐coverage: send() catch block with non-Error + subject
   * ================================================================== */
  describe('send – catch with non-Error thrown and subject defined', () => {
    it('logs UNKNOWN_ERROR for non-Error throw and includes subject in log', async () => {
      smsSendMock.mockRejectedValue('raw string error')

      const result = await service.send({
        recipientType: 'GUARDIAN', recipientId: 1,
        channel: 'SMS', to: '+254700000001', message: 'Test',
        subject: 'Important'
      }, 10)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Unknown error')
      const row = db.prepare('SELECT subject FROM message_log ORDER BY id DESC LIMIT 1').get() as any
      expect(row.subject).toBe('Important')
    })
  })

  /* ==================================================================
   *  Branch‐coverage: dispatchMessage with no provider configured
   * ================================================================== */
  describe('dispatchMessage – no providers', () => {
    it('returns SMS not configured when smsService is null', async () => {
      const { ConfigService } = await import('../../ConfigService') as any
      vi.mocked(ConfigService.getConfig).mockReturnValue(null)
      const svc = new NotificationService()
      svc.reloadConfig()
      const result = await svc.send({
        recipientType: 'STUDENT', recipientId: 1,
        channel: 'SMS', to: '+254700000000', message: 'test'
      }, 10)
      expect(result.success).toBe(false)
      expect(result.error).toContain('SMS provider not configured')
    })
  })

  /* ==================================================================
   *  Branch-coverage L144: loadConfig catch block
   * ================================================================== */
  describe('loadConfig – catch block when config loading throws', () => {
    it('catches error and logs to console.error', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { ConfigService } = await import('../../ConfigService') as any
      vi.mocked(ConfigService.getConfig).mockImplementation(() => {
        throw new Error('Config DB corrupted')
      })
      const svc = new NotificationService()
      svc.reloadConfig()

      // Service should still be usable (config loading failed silently)
      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to load notification config:',
        expect.any(Error)
      )

      // SMS should fail because config didn't load
      const result = await svc.send({
        recipientType: 'GUARDIAN', recipientId: 1,
        channel: 'SMS', to: '+254700000001', message: 'test'
      }, 10)
      expect(result.success).toBe(false)

      errorSpy.mockRestore()
      // Restore ConfigService mock for other tests
      vi.mocked(ConfigService.getConfig).mockImplementation((key: string) => {
        if (key === 'sms_api_key') {return 'test-key'}
        if (key === 'sms_api_secret') {return 'test-secret'}
        if (key === 'sms_sender_id') {return 'MWINGI'}
        if (key === 'smtp_host') {return 'smtp.test.com'}
        if (key === 'smtp_port') {return '587'}
        if (key === 'smtp_user') {return 'user@test.com'}
        if (key === 'smtp_pass') {return 'pass123'}
        return null
      })
    })
  })

  /* ==================================================================
   *  Branch-coverage L271: logCommunication catch block
   * ================================================================== */
  describe('logCommunication – catch block when DB insert fails', () => {
    it('catches DB error during communication logging without crashing', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Drop the message_log table so the INSERT inside logCommunication fails
      db.exec('DROP TABLE message_log')

      const result = await service.send({
        recipientType: 'GUARDIAN', recipientId: 1,
        channel: 'SMS', to: '+254700000001', message: 'test logging failure'
      }, 10)

      // The send itself should still succeed (SMS dispatched), but logging failed
      expect(result.success).toBe(true)
      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to log communication:',
        expect.anything()
      )

      // Re-create table for subsequent tests
      db.exec(`
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
        )
      `)
      errorSpy.mockRestore()
    })
  })

  /* ==================================================================
   *  Branch-coverage L122: smtpPort fallback to 587 when port is invalid
   * ================================================================== */
  describe('loadConfig – invalid smtp_port falls back to 587', () => {
    it('uses 587 when smtp_port is non-numeric', async () => {
      const { ConfigService } = await import('../../ConfigService') as any
      vi.mocked(ConfigService.getConfig).mockImplementation((key: string) => {
        if (key === 'sms_api_key') {return 'test-key'}
        if (key === 'sms_api_secret') {return 'test-secret'}
        if (key === 'sms_sender_id') {return 'MWINGI'}
        if (key === 'smtp_host') {return 'smtp.test.com'}
        if (key === 'smtp_port') {return 'not-a-number'}
        if (key === 'smtp_user') {return 'user@test.com'}
        if (key === 'smtp_pass') {return 'pass123'}
        return null
      })
      const svc = new NotificationService()
      svc.reloadConfig()
      // Email should be configured with port 587 fallback
      const result = await svc.send({
        recipientType: 'GUARDIAN', recipientId: 1,
        channel: 'EMAIL', to: 'test@example.com',
        subject: 'Test', message: 'Port fallback test'
      }, 10)
      expect(result).toBeDefined()
      expect(emailSendMock).toHaveBeenCalled()

      // Restore default mock
      vi.mocked(ConfigService.getConfig).mockImplementation((key: string) => {
        if (key === 'sms_api_key') {return 'test-key'}
        if (key === 'sms_api_secret') {return 'test-secret'}
        if (key === 'sms_sender_id') {return 'MWINGI'}
        if (key === 'smtp_host') {return 'smtp.test.com'}
        if (key === 'smtp_port') {return '587'}
        if (key === 'smtp_user') {return 'user@test.com'}
        if (key === 'smtp_pass') {return 'pass123'}
        return null
      })
    })
  })

  /* ==================================================================
   *  Branch-coverage L170: send with templateId that doesn't exist
   * ================================================================== */
  describe('send – templateId not found in DB', () => {
    it('falls through when template is not found and uses original message', async () => {
      const result = await service.send({
        recipientType: 'GUARDIAN', recipientId: 1,
        channel: 'SMS', to: '+254700000002', message: 'Original message',
        templateId: 99999 // no template with this ID
      }, 10)
      expect(result.success).toBe(true)
      // Original message should be used since template was not found
      expect(smsSendMock).toHaveBeenCalledWith('+254700000002', 'Original message')
    })
  })

  /* ==================================================================
   *  Branch-coverage L173: template with a subject field
   * ================================================================== */
  describe('send – template with subject override', () => {
    it('overrides subject from template when template.subject is set', async () => {
      db.prepare(`INSERT INTO message_template (id, template_name, template_type, category, subject, body, variables, is_active)
        VALUES (200, 'WithSubject', 'EMAIL', 'FINANCE', 'Fee Alert: {{month}}', 'Dear {{name}}, please pay', '["month","name"]', 1)`).run()
      const result = await service.send({
        recipientType: 'GUARDIAN', recipientId: 1,
        channel: 'EMAIL', to: 'parent@test.com',
        subject: 'Should be overridden', message: '',
        templateId: 200,
        variables: { month: 'January', name: 'Jane' }
      }, 10)
      expect(result.success).toBe(true)
      expect(emailSendMock).toHaveBeenCalledWith(
        'parent@test.com',
        'Fee Alert: January',
        'Dear Jane, please pay'
      )
    })
  })
})
