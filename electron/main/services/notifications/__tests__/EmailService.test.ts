import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EmailService } from '../EmailService'
import type { EmailProviderConfig } from '../notification-types'

/* ------------------------------------------------------------------ */
/*  Mock nodemailer (used by SMTP path)                                */
/* ------------------------------------------------------------------ */
const mockSendMail = vi.fn()
const mockCreateTransport = vi.fn((..._args: unknown[]) => ({ sendMail: mockSendMail }))

vi.mock('nodemailer', () => ({
  default: { createTransport: (...args: unknown[]) => mockCreateTransport(...args) },
}))

/* ------------------------------------------------------------------ */
/*  send() – provider routing                                          */
/* ------------------------------------------------------------------ */
describe('EmailService.send – provider routing', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('routes MAILGUN to sendMailgun', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: '<msg@mg.example.com>', message: 'Queued.' }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    const svc = new EmailService({ provider: 'MAILGUN', apiKey: 'key-abc', fromEmail: 'a@mg.example.com', fromName: 'N' })
    const r = await svc.send('x@y.z', 'sub', 'body')
    expect(r.success).toBe(true)
    expect(r.provider).toBe('MAILGUN')
  })

  it('returns unknown provider error for unrecognised provider', async () => {
    const svc = new EmailService({ provider: 'UNKNOWN' as never, apiKey: 'k', fromEmail: 'a@b.c', fromName: 'N' })
    const r = await svc.send('x@y.z', 'sub', 'body')
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/unknown/i)
  })
})

/* ------------------------------------------------------------------ */
/*  SendGrid path                                                      */
/* ------------------------------------------------------------------ */
describe('EmailService – SendGrid', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  const config: EmailProviderConfig = {
    provider: 'SENDGRID',
    apiKey: 'SG.test-key',
    fromEmail: 'school@example.com',
    fromName: 'School ERP',
  }

  beforeEach(() => {
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns success when status is 202', async () => {
    fetchSpy.mockResolvedValue({ status: 202 })

    const svc = new EmailService(config)
    const r = await svc.send('parent@example.com', 'Fee Reminder', '<p>Pay up</p>')

    expect(r).toEqual({ success: true, provider: 'SENDGRID' })

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, opts] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://api.sendgrid.com/v3/mail/send')
    expect(opts.method).toBe('POST')
    expect(opts.headers.Authorization).toBe('Bearer SG.test-key')
    expect(opts.headers['Content-Type']).toBe('application/json')

    const body = JSON.parse(opts.body)
    expect(body.personalizations[0].to[0].email).toBe('parent@example.com')
    expect(body.from.email).toBe('school@example.com')
    expect(body.subject).toBe('Fee Reminder')
    expect(body.content[0].value).toBe('<p>Pay up</p>')
  })

  it('returns failure with API error message when status != 202', async () => {
    fetchSpy.mockResolvedValue({
      status: 400,
      json: async () => ({ errors: [{ message: 'Bad request body' }] }),
    })

    const svc = new EmailService(config)
    const r = await svc.send('a@b.c', 's', 'b')
    expect(r.success).toBe(false)
    expect(r.error).toBe('Bad request body')
    expect(r.provider).toBe('SENDGRID')
  })

  it('returns "Unknown error" when response has no error messages', async () => {
    fetchSpy.mockResolvedValue({
      status: 500,
      json: async () => ({}),
    })

    const svc = new EmailService(config)
    const r = await svc.send('a@b.c', 's', 'b')
    expect(r.success).toBe(false)
    expect(r.error).toBe('Unknown error')
  })

  it('handles fetch throwing an Error', async () => {
    fetchSpy.mockRejectedValue(new Error('Network failure'))

    const svc = new EmailService(config)
    const r = await svc.send('a@b.c', 's', 'b')
    expect(r).toEqual({ success: false, error: 'Network failure', provider: 'SENDGRID' })
  })

  it('handles fetch throwing a non-Error', async () => {
    fetchSpy.mockRejectedValue('oops')

    const svc = new EmailService(config)
    const r = await svc.send('a@b.c', 's', 'b')
    expect(r.success).toBe(false)
    expect(r.error).toBe('API request failed')
  })
})

/* ------------------------------------------------------------------ */
/*  SMTP path                                                          */
/* ------------------------------------------------------------------ */
describe('EmailService – SMTP', () => {
  const config: EmailProviderConfig = {
    provider: 'SMTP',
    host: 'smtp.example.com',
    port: 587,
    user: 'user',
    password: 'pass',
    fromEmail: 'school@example.com',
    fromName: 'School ERP',
  }

  beforeEach(() => {
    mockCreateTransport.mockClear()
    mockSendMail.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns success with messageId on successful send', async () => {
    mockSendMail.mockResolvedValue({ messageId: '<msg-001@example.com>' })

    const svc = new EmailService(config)
    const r = await svc.send('parent@example.com', 'Hello', '<p>Body</p>')

    expect(r).toEqual({
      success: true,
      messageId: '<msg-001@example.com>',
      provider: 'SMTP',
    })

    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: { user: 'user', pass: 'pass' },
    })

    expect(mockSendMail).toHaveBeenCalledWith({
      from: '"School ERP" <school@example.com>',
      to: 'parent@example.com',
      subject: 'Hello',
      html: '<p>Body</p>',
    })
  })

  it('sets secure=true when port is 465', async () => {
    mockSendMail.mockResolvedValue({ messageId: 'x' })

    const svc = new EmailService({ ...config, port: 465 })
    await svc.send('a@b.c', 's', 'b')

    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ secure: true })
    )
  })

  it('defaults port to 587 when not specified', async () => {
    mockSendMail.mockResolvedValue({ messageId: 'x' })

    const { port: _port, ...noPortConfig } = config
    const svc = new EmailService(noPortConfig as EmailProviderConfig)
    await svc.send('a@b.c', 's', 'b')

    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 587, secure: false })
    )
  })

  it('returns failure when sendMail throws an Error', async () => {
    mockSendMail.mockRejectedValue(new Error('Connection refused'))

    const svc = new EmailService(config)
    const r = await svc.send('a@b.c', 's', 'b')

    expect(r).toEqual({
      success: false,
      error: 'Connection refused',
      provider: 'SMTP',
    })
  })

  it('returns "SMTP error" when sendMail throws a non-Error', async () => {
    mockSendMail.mockRejectedValue('weird')

    const svc = new EmailService(config)
    const r = await svc.send('a@b.c', 's', 'b')

    expect(r.success).toBe(false)
    expect(r.error).toBe('SMTP error')
    expect(r.provider).toBe('SMTP')
  })
})

/* ------------------------------------------------------------------ */
/*  Mailgun path                                                       */
/* ------------------------------------------------------------------ */
describe('EmailService – Mailgun', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  const config: EmailProviderConfig = {
    provider: 'MAILGUN',
    apiKey: 'key-abc123',
    fromEmail: 'school@mg.example.com',
    fromName: 'School ERP',
  }

  beforeEach(() => {
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns success with messageId on 200 response', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ id: '<msg@mg.example.com>', message: 'Queued. Thank you.' }),
    })

    const svc = new EmailService(config)
    const r = await svc.send('parent@example.com', 'Fee Reminder', '<p>Pay</p>')

    expect(r).toEqual({ success: true, messageId: '<msg@mg.example.com>', provider: 'MAILGUN' })

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, opts] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://api.mailgun.net/v3/mg.example.com/messages')
    expect(opts.method).toBe('POST')
    expect(opts.headers.Authorization).toMatch(/^Basic /)
    expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded')

    const body = opts.body as URLSearchParams
    expect(body.get('to')).toBe('parent@example.com')
    expect(body.get('subject')).toBe('Fee Reminder')
    expect(body.get('html')).toBe('<p>Pay</p>')
    expect(body.get('from')).toContain('school@mg.example.com')
  })

  it('omits messageId when response has no id', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Queued.' }),
    })

    const svc = new EmailService(config)
    const r = await svc.send('a@b.c', 's', 'b')
    expect(r.success).toBe(true)
    expect(r).not.toHaveProperty('messageId')
    expect(r.provider).toBe('MAILGUN')
  })

  it('returns failure with API error on non-ok response', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Forbidden' }),
    })

    const svc = new EmailService(config)
    const r = await svc.send('a@b.c', 's', 'b')
    expect(r.success).toBe(false)
    expect(r.error).toBe('Forbidden')
    expect(r.provider).toBe('MAILGUN')
  })

  it('returns "Unknown error" when error response has no message', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      json: async () => ({}),
    })

    const svc = new EmailService(config)
    const r = await svc.send('a@b.c', 's', 'b')
    expect(r.success).toBe(false)
    expect(r.error).toBe('Unknown error')
  })

  it('handles fetch throwing an Error', async () => {
    fetchSpy.mockRejectedValue(new Error('DNS resolution failed'))

    const svc = new EmailService(config)
    const r = await svc.send('a@b.c', 's', 'b')
    expect(r).toEqual({ success: false, error: 'DNS resolution failed', provider: 'MAILGUN' })
  })

  it('handles fetch throwing a non-Error', async () => {
    fetchSpy.mockRejectedValue('nope')

    const svc = new EmailService(config)
    const r = await svc.send('a@b.c', 's', 'b')
    expect(r.success).toBe(false)
    expect(r.error).toBe('API request failed')
  })

  it('extracts domain from fromEmail for API URL', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'x' }),
    })

    const svc = new EmailService({ ...config, fromEmail: 'noreply@mail.school.co.ke' })
    await svc.send('a@b.c', 's', 'b')

    const [url] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://api.mailgun.net/v3/mail.school.co.ke/messages')
  })
})
