/**
 * Additional coverage tests for message-handlers.ts
 * Targets: saveTemplate optional fields (id, subject, placeholders),
 *          sendSms optional recipientId, sendEmail default recipientType,
 *          sendEmail with missing recipientId
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()

const messageServiceMock = {
  getTemplates: vi.fn(() => []),
  saveTemplate: vi.fn(() => ({ id: 2 })),
  sendSms: vi.fn(() => ({ success: true })),
  getLogs: vi.fn(() => []),
}

const notificationServiceMock = {
  send: vi.fn(async () => ({ success: true, messageId: 'EMAIL-002' })),
}

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue(JSON.stringify({
      user: { id: 5, username: 'staff', role: 'ADMIN', full_name: 'Staff', email: 's@s.com', is_active: 1, created_at: new Date().toISOString() },
      lastActivity: Date.now()
    })),
    setPassword: vi.fn().mockResolvedValue(null),
    deletePassword: vi.fn().mockResolvedValue(true),
  }
}))

vi.mock('../../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => handlerMap.set(channel, handler)),
    removeHandler: vi.fn(),
  }
}))

vi.mock('../../../services/base/ServiceContainer', () => ({
  container: {
    resolve: vi.fn(() => notificationServiceMock)
  }
}))

vi.mock('../../../services/MessageService', () => ({
  // eslint-disable-next-line object-shorthand
  MessageService: function () { return messageServiceMock }
}))

import { registerMessageHandlers } from '../message-handlers'

describe('message-handlers coverage expansion', () => {
  beforeEach(() => {
    handlerMap.clear()
    vi.clearAllMocks()
    registerMessageHandlers()
  })

  // ─── saveTemplate with all optional fields ──────────────
  it('saveTemplate includes optional id, subject, placeholders', async () => {
    const handler = handlerMap.get('message:saveTemplate')!
    await handler({}, {
      template_name: 'Updated',
      body: 'Hello {{name}}',
      template_type: 'EMAIL',
      id: 5,
      subject: 'Welcome Email',
      placeholders: '["name"]'
    })
    expect(messageServiceMock.saveTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 5,
        subject: 'Welcome Email',
        placeholders: '["name"]'
      })
    )
  })

  it('saveTemplate omits undefined optional fields', async () => {
    const handler = handlerMap.get('message:saveTemplate')!
    await handler({}, {
      template_name: 'Minimal',
      body: 'Hi',
      template_type: 'SMS'
    })
    const callArg = (messageServiceMock.saveTemplate.mock.calls as unknown[][])[0][0]
    expect(callArg).not.toHaveProperty('id')
    expect(callArg).not.toHaveProperty('subject')
    expect(callArg).not.toHaveProperty('placeholders')
  })

  // ─── sendSms with optional recipientId ──────────────────
  it('sendSms includes recipientId when provided', async () => {
    const handler = handlerMap.get('message:sendSms')!
    await handler({}, {
      to: '+254700000000',
      message: 'Hello',
      recipientId: 42
    })
    expect(messageServiceMock.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 42, userId: 5 })
    )
  })

  it('sendSms omits recipientId when undefined', async () => {
    const handler = handlerMap.get('message:sendSms')!
    await handler({}, {
      to: '+254700000000',
      message: 'Hello'
    })
    const callArg = (messageServiceMock.sendSms.mock.calls as unknown[][])[0][0]
    expect(callArg).not.toHaveProperty('recipientId')
  })

  // ─── sendEmail defaults recipientType to GUARDIAN ───────
  it('sendEmail defaults recipientType to GUARDIAN', async () => {
    const handler = handlerMap.get('message:sendEmail')!
    await handler({}, {
      to: 'parent@school.com',
      subject: 'Test',
      body: 'Body'
    })
    expect(notificationServiceMock.send).toHaveBeenCalledWith(
      expect.objectContaining({ recipientType: 'GUARDIAN', recipientId: 0 }),
      5
    )
  })

  it('sendEmail uses provided recipientType', async () => {
    const handler = handlerMap.get('message:sendEmail')!
    await handler({}, {
      to: 'staff@school.com',
      subject: 'Test',
      body: 'Body',
      recipientType: 'STAFF',
      recipientId: 10
    })
    expect(notificationServiceMock.send).toHaveBeenCalledWith(
      expect.objectContaining({ recipientType: 'STAFF', recipientId: 10 }),
      5
    )
  })
})
