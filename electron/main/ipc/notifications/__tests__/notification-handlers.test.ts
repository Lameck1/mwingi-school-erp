import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSessionCache } from '../../../security/session'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()
let sessionUserId = 30
let sessionRole = 'TEACHER'

const notificationServiceMock = {
  reloadConfig: vi.fn(),
  send: vi.fn((..._args: unknown[]): unknown => ({ success: true })),
  sendBulkFeeReminders: vi.fn((..._args: unknown[]): unknown => ({ success: true })),
  getTemplates: vi.fn((..._args: unknown[]): unknown[] => []),
  getTemplate: vi.fn((..._args: unknown[]): unknown => null),
  createTemplate: vi.fn((..._args: unknown[]): unknown => ({ success: true })),
  getDefaultTemplates: vi.fn((..._args: unknown[]): unknown[] => []),
  getCommunicationHistory: vi.fn((..._args: unknown[]): unknown[] => []),
}

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
        created_at: '2026-01-01T00:00:00'
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
  }
}))

vi.mock('../../../services/base/ServiceContainer', () => ({
  container: {
    resolve: vi.fn(() => notificationServiceMock)
  }
}))

import { registerNotificationHandlers, normalizeTemplateCategory } from '../notification-handlers'

function attachActor(event: any) {
  event.__ipcActor = {
    id: sessionUserId,
    role: sessionRole,
    username: 'session-user',
    full_name: 'Session User',
    email: null,
    is_active: 1,
    created_at: '2026-01-01T00:00:00'
  };
}

describe('notification IPC handlers', () => {
  beforeEach(() => {
    clearSessionCache()
    handlerMap.clear()
    sessionUserId = 30
    sessionRole = 'TEACHER'
    vi.clearAllMocks()
    registerNotificationHandlers()
  })

  it('notifications:send rejects renderer actor mismatch', async () => {
    const handler = handlerMap.get('notifications:send')
    expect(handler).toBeDefined()
    const event = {};
    attachActor(event);
    const result = await handler!(event, {
      channel: 'EMAIL',
      recipientType: 'STUDENT',
      recipientId: 1,
      to: 'test@test.com',
      message: 'Hello'
    }, 3) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
    expect(notificationServiceMock.send).not.toHaveBeenCalled()
  })

  it('notifications:send passes valid request to service', async () => {
    const handler = handlerMap.get('notifications:send')!
    const event = {}; attachActor(event)
    const request = {
      channel: 'EMAIL',
      recipientType: 'STUDENT',
      recipientId: 1,
      to: 'test@test.com',
      message: 'Hello',
      subject: 'Test Subject',
    }
    const result = await handler(event, request, 30) as any
    expect(result.success).toBe(true)
    expect(notificationServiceMock.send).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'EMAIL', recipientType: 'STUDENT', recipientId: 1, to: 'test@test.com', message: 'Hello', subject: 'Test Subject' }),
      30
    )
  })

  it('notifications:send works without legacy ID', async () => {
    const handler = handlerMap.get('notifications:send')!
    const event = {}; attachActor(event)
    const request = {
      channel: 'SMS',
      recipientType: 'GUARDIAN',
      recipientId: 5,
      to: '+254700000000',
      message: 'Fee reminder',
    }
    const result = await handler(event, request) as any
    expect(result.success).toBe(true)
    expect(notificationServiceMock.send).toHaveBeenCalled()
  })

  it('notifications:reloadConfig enforces admin-only role', async () => {
    const handler = handlerMap.get('notifications:reloadConfig')!
    const result = await handler({}) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
  })

  it('notifications:reloadConfig succeeds for admin', async () => {
    sessionRole = 'ADMIN'
    handlerMap.clear()
    registerNotificationHandlers()
    const handler = handlerMap.get('notifications:reloadConfig')!
    const event = {}; attachActor(event)
    const result = await handler(event)
    expect(result).toBe(true)
    expect(notificationServiceMock.reloadConfig).toHaveBeenCalled()
  })

  // ======= notifications:sendBulkFeeReminders =======
  describe('notifications:sendBulkFeeReminders', () => {
    it('registers handler', () => {
      expect(handlerMap.has('notifications:sendBulkFeeReminders')).toBe(true)
    })

    it('sends bulk reminders with valid data', async () => {
      const handler = handlerMap.get('notifications:sendBulkFeeReminders')!
      const event = {}; attachActor(event)
      const defaulters = [{
        student_id: 1, student_name: 'John', guardian_name: 'Jane',
        guardian_phone: '+254700000000', admission_number: 'ADM001',
        class_name: 'Grade 5', balance: 5000
      }]
      const result = await handler(event, 1, defaulters, 30) as any
      expect(result.success).toBe(true)
      expect(notificationServiceMock.sendBulkFeeReminders).toHaveBeenCalledWith(1, defaulters, 30)
    })

    it('rejects renderer mismatch', async () => {
      const handler = handlerMap.get('notifications:sendBulkFeeReminders')!
      const event = {}; attachActor(event)
      const result = await handler(event, 1, [], 999) as any
      expect(result.success).toBe(false)
      expect(result.error).toContain('renderer user mismatch')
    })
  })

  // ======= notifications:getTemplates =======
  describe('notifications:getTemplates', () => {
    it('registers handler', () => {
      expect(handlerMap.has('notifications:getTemplates')).toBe(true)
    })

    it('returns templates list', async () => {
      const handler = handlerMap.get('notifications:getTemplates')!
      const event = {}; attachActor(event)
      notificationServiceMock.getTemplates.mockReturnValue([{ id: 1, name: 'Fee Reminder' }])
      const result = await handler(event)
      expect(notificationServiceMock.getTemplates).toHaveBeenCalled()
      expect(result).toEqual([{ id: 1, name: 'Fee Reminder' }])
    })
  })

  // ======= notifications:getTemplate =======
  describe('notifications:getTemplate', () => {
    it('registers handler', () => {
      expect(handlerMap.has('notifications:getTemplate')).toBe(true)
    })

    it('returns template by id', async () => {
      const handler = handlerMap.get('notifications:getTemplate')!
      const event = {}; attachActor(event)
      notificationServiceMock.getTemplate.mockReturnValue({ id: 3, name: 'Welcome' })
      const result = await handler(event, 3)
      expect(notificationServiceMock.getTemplate).toHaveBeenCalledWith(3)
      expect(result).toEqual({ id: 3, name: 'Welcome' })
    })
  })

  // ======= notifications:createTemplate =======
  describe('notifications:createTemplate', () => {
    it('registers handler', () => {
      expect(handlerMap.has('notifications:createTemplate')).toBe(true)
    })

    it('creates template with valid data', async () => {
      const handler = handlerMap.get('notifications:createTemplate')!
      const event = {}; attachActor(event)
      const template = {
        template_name: 'Fee Reminder',
        template_type: 'SMS',
        category: 'FEE_REMINDER',
        subject: null,
        body: 'Dear {{guardian_name}}, balance is {{balance}}'
      }
      const result = await handler(event, template, 30) as any
      expect(result.success).toBe(true)
      expect(notificationServiceMock.createTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Fee Reminder', type: 'SMS', category: 'FEE_REMINDER', body: template.body, userId: 30 })
      )
    })

    it('normalizes ACADEMIC category to ATTENDANCE', async () => {
      const handler = handlerMap.get('notifications:createTemplate')!
      const event = {}; attachActor(event)
      const template = {
        template_name: 'Academic Notice',
        template_type: 'EMAIL',
        category: 'ACADEMIC',
        subject: 'Academic Update',
        body: 'Test body'
      }
      await handler(event, template, 30)
      expect(notificationServiceMock.createTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'ATTENDANCE' })
      )
    })

    it('normalizes FINANCE category to FEE_REMINDER', async () => {
      const handler = handlerMap.get('notifications:createTemplate')!
      const event = {}; attachActor(event)
      const template = {
        template_name: 'Finance Notice',
        template_type: 'SMS',
        category: 'FINANCE',
        subject: null,
        body: 'Test'
      }
      await handler(event, template, 30)
      expect(notificationServiceMock.createTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'FEE_REMINDER' })
      )
    })

    it('normalizes ADMIN category to GENERAL', async () => {
      const handler = handlerMap.get('notifications:createTemplate')!
      const event = {}; attachActor(event)
      const template = {
        template_name: 'Admin Notice',
        template_type: 'EMAIL',
        category: 'ADMIN',
        subject: 'Admin Update',
        body: 'Admin body'
      }
      await handler(event, template, 30)
      expect(notificationServiceMock.createTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'GENERAL' })
      )
    })

    it('rejects renderer mismatch on createTemplate', async () => {
      const handler = handlerMap.get('notifications:createTemplate')!
      const event = {}; attachActor(event)
      const template = {
        template_name: 'Test',
        template_type: 'SMS',
        category: 'GENERAL',
        subject: null,
        body: 'Body'
      }
      const result = await handler(event, template, 999) as any
      expect(result.success).toBe(false)
      expect(result.error).toContain('renderer user mismatch')
    })
  })

  // ======= notifications:getDefaultTemplates =======
  describe('notifications:getDefaultTemplates', () => {
    it('registers handler', () => {
      expect(handlerMap.has('notifications:getDefaultTemplates')).toBe(true)
    })

    it('returns default templates', async () => {
      const handler = handlerMap.get('notifications:getDefaultTemplates')!
      const event = {}; attachActor(event)
      notificationServiceMock.getDefaultTemplates.mockReturnValue([{ name: 'Default Fee' }])
      const result = await handler(event)
      expect(notificationServiceMock.getDefaultTemplates).toHaveBeenCalled()
      expect(result).toEqual([{ name: 'Default Fee' }])
    })
  })

  // ======= notifications:getHistory =======
  describe('notifications:getHistory', () => {
    it('registers handler', () => {
      expect(handlerMap.has('notifications:getHistory')).toBe(true)
    })

    it('returns history without filters', async () => {
      const handler = handlerMap.get('notifications:getHistory')!
      const event = {}; attachActor(event)
      notificationServiceMock.getCommunicationHistory.mockReturnValue([{ id: 1, status: 'SENT' }])
      const result = await handler(event)
      expect(notificationServiceMock.getCommunicationHistory).toHaveBeenCalledWith()
      expect(result).toEqual([{ id: 1, status: 'SENT' }])
    })

    it('returns history with filters', async () => {
      const handler = handlerMap.get('notifications:getHistory')!
      const event = {}; attachActor(event)
      await handler(event, { channel: 'SMS', status: 'FAILED' })
      expect(notificationServiceMock.getCommunicationHistory).toHaveBeenCalledWith(
        expect.objectContaining({})
      )
    })

    it('returns history with only category filter', async () => {
      const handler = handlerMap.get('notifications:getHistory')!
      const event = {}; attachActor(event)
      await handler(event, { status: 'PENDING' })
      expect(notificationServiceMock.getCommunicationHistory).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'PENDING' })
      )
    })

    it('returns history with only channel filter', async () => {
      const handler = handlerMap.get('notifications:getHistory')!
      const event = {}; attachActor(event)
      await handler(event, { channel: 'EMAIL' })
      expect(notificationServiceMock.getCommunicationHistory).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'EMAIL' })
      )
    })

    it('returns history with only status filter', async () => {
      const handler = handlerMap.get('notifications:getHistory')!
      const event = {}; attachActor(event)
      await handler(event, { status: 'SENT' })
      expect(notificationServiceMock.getCommunicationHistory).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'SENT' })
      )
    })

    it('passes recipientType and recipientId filters', async () => {
      const handler = handlerMap.get('notifications:getHistory')!
      const event = {}; attachActor(event)
      await handler(event, { recipientType: 'STUDENT', recipientId: 42 })
      expect(notificationServiceMock.getCommunicationHistory).toHaveBeenCalledWith(
        expect.objectContaining({ recipientType: 'STUDENT', recipientId: 42 })
      )
    })

    it('passes startDate and endDate filters', async () => {
      const handler = handlerMap.get('notifications:getHistory')!
      const event = {}; attachActor(event)
      await handler(event, { startDate: '2026-01-01', endDate: '2026-12-31' })
      expect(notificationServiceMock.getCommunicationHistory).toHaveBeenCalledWith(
        expect.objectContaining({ startDate: '2026-01-01', endDate: '2026-12-31' })
      )
    })

    it('passes all filter fields simultaneously', async () => {
      const handler = handlerMap.get('notifications:getHistory')!
      const event = {}; attachActor(event)
      await handler(event, {
        recipientType: 'GUARDIAN',
        recipientId: 7,
        channel: 'SMS',
        status: 'FAILED',
        startDate: '2026-01-01',
        endDate: '2026-06-30'
      })
      expect(notificationServiceMock.getCommunicationHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientType: 'GUARDIAN',
          recipientId: 7,
          channel: 'SMS',
          status: 'FAILED',
          startDate: '2026-01-01',
          endDate: '2026-06-30'
        })
      )
    })
  })

  // ======= normalizeTemplateCategory pass-through =======
  describe('normalizeTemplateCategory pass-through', () => {
    it('passes non-special category through unchanged', async () => {
      const handler = handlerMap.get('notifications:createTemplate')!
      const event = {}; attachActor(event)
      const template = {
        template_name: 'Custom',
        template_type: 'SMS',
        category: 'GENERAL',
        subject: null,
        body: 'Body'
      }
      await handler(event, template, 30)
      expect(notificationServiceMock.createTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'GENERAL' })
      )
    })
  })

  // ======= notifications:send with templateId and variables =======
  describe('notifications:send with optional fields', () => {
    it('includes templateId and variables when provided', async () => {
      const handler = handlerMap.get('notifications:send')!
      const event = {}; attachActor(event)
      const request = {
        channel: 'EMAIL',
        recipientType: 'STUDENT',
        recipientId: 1,
        to: 'test@test.com',
        message: 'Hello',
        templateId: 5,
        variables: { student_name: 'John', balance: '5000' }
      }
      await handler(event, request, 30)
      expect(notificationServiceMock.send).toHaveBeenCalledWith(
        expect.objectContaining({ templateId: 5, variables: { student_name: 'John', balance: '5000' } }),
        30
      )
    })
  })

  // ======= normalizeTemplateCategory direct unit tests =======
  describe('normalizeTemplateCategory', () => {
    it('maps ACADEMIC to ATTENDANCE', () => {
      expect(normalizeTemplateCategory('ACADEMIC')).toBe('ATTENDANCE')
    })

    it('maps FINANCE to FEE_REMINDER', () => {
      expect(normalizeTemplateCategory('FINANCE')).toBe('FEE_REMINDER')
    })

    it('maps ADMIN to GENERAL', () => {
      expect(normalizeTemplateCategory('ADMIN')).toBe('GENERAL')
    })

    it('passes through non-legacy categories unchanged', () => {
      expect(normalizeTemplateCategory('GENERAL')).toBe('GENERAL')
      expect(normalizeTemplateCategory('ATTENDANCE')).toBe('ATTENDANCE')
    })
  })
})
