import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()

const messageServiceMock = {
  getTemplates: vi.fn(() => [{ id: 1, template_name: 'Welcome', body: 'Hello {{name}}' }]),
  saveTemplate: vi.fn(() => ({ id: 1 })),
  sendSms: vi.fn(() => ({ success: true, messageId: 'SMS-001' })),
  getLogs: vi.fn(() => [{ id: 1, type: 'SMS', to: '+254700000000' }]),
}

const notificationServiceMock = {
  send: vi.fn(async () => ({ success: true, messageId: 'EMAIL-001' })),
}

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue(JSON.stringify({
      user: { id: 1, username: 'admin', role: 'ADMIN', full_name: 'Admin', email: 'a@a.com', is_active: 1, created_at: new Date().toISOString() },
      lastActivity: Date.now()
    })),
    setPassword: vi.fn().mockResolvedValue(null),
    deletePassword: vi.fn().mockResolvedValue(true)
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

vi.mock('../../../database', () => ({
  getDatabase: () => ({})
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

vi.mock('../../../services/base/ServiceContainer', () => ({
  container: {
    resolve: vi.fn((name: string) => {
      if (name === 'NotificationService') { return notificationServiceMock }
      return {}
    })
  }
}))

vi.mock('../../../services/MessageService', () => {
  // Must use a function (not arrow) so `new` works
  return {
    // eslint-disable-next-line object-shorthand -- must use function (not shorthand) so `new` works
    MessageService: function () {
      return messageServiceMock
    }
  }
})

import { registerMessageHandlers } from '../message-handlers'

type Result = { success?: boolean; error?: string; [key: string]: unknown }

async function invoke(channel: string, ...args: unknown[]): Promise<Result> {
  const handler = handlerMap.get(channel)
  if (!handler) { throw new Error(`No handler for ${channel}`) }
  return handler({}, ...args) as Promise<Result>
}

describe('message IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    vi.clearAllMocks()
    registerMessageHandlers()
  })

  it('registers all message channels', () => {
    expect(handlerMap.has('message:getTemplates')).toBe(true)
    expect(handlerMap.has('message:saveTemplate')).toBe(true)
    expect(handlerMap.has('message:sendSms')).toBe(true)
    expect(handlerMap.has('message:sendEmail')).toBe(true)
    expect(handlerMap.has('message:getLogs')).toBe(true)
  })

  it('getTemplates returns template list', async () => {
    const result = await invoke('message:getTemplates')
    expect(result).toEqual([{ id: 1, template_name: 'Welcome', body: 'Hello {{name}}' }])
  })

  it('saveTemplate saves a new template', async () => {
    const result = await invoke('message:saveTemplate', {
      template_name: 'Fee Reminder',
      body: 'Dear {{name}}, your fee balance is {{balance}}',
      template_type: 'SMS'
    })
    expect(result).toEqual({ id: 1 })
    expect(messageServiceMock.saveTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ template_name: 'Fee Reminder', template_type: 'SMS' })
    )
  })

  it('sendSms sends an SMS message', async () => {
    const result = await invoke('message:sendSms', {
      to: '+254700000000',
      message: 'Test SMS message'
    })
    expect(result).toEqual({ success: true, messageId: 'SMS-001' })
    expect(messageServiceMock.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({ to: '+254700000000', message: 'Test SMS message', userId: 1 })
    )
  })

  it('sendEmail sends an email through notification service', async () => {
    const result = await invoke('message:sendEmail', {
      to: 'parent@example.com',
      subject: 'Fee Statement',
      body: 'Please find attached your fee statement',
      recipientId: 5,
      recipientType: 'GUARDIAN'
    })
    expect(result).toEqual({ success: true, messageId: 'EMAIL-001' })
    expect(notificationServiceMock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'EMAIL',
        to: 'parent@example.com',
        subject: 'Fee Statement'
      }),
      1
    )
  })

  it('getLogs returns message logs with default limit', async () => {
    const result = await invoke('message:getLogs')
    expect(result).toEqual([{ id: 1, type: 'SMS', to: '+254700000000' }])
    expect(messageServiceMock.getLogs).toHaveBeenCalledWith(50)
  })

  it('getLogs respects custom limit', async () => {
    await invoke('message:getLogs', 100)
    expect(messageServiceMock.getLogs).toHaveBeenCalledWith(100)
  })

  it('rejects sendSms with empty message', async () => {
    const result = await invoke('message:sendSms', {
      to: '+254700000000',
      message: ''
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Validation failed')
  })

  it('rejects sendEmail with invalid email', async () => {
    const result = await invoke('message:sendEmail', {
      to: 'not-an-email',
      subject: 'Test',
      body: 'Test body'
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Validation failed')
  })
})
