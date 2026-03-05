import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SMSService } from '../SMSService'
import type { SMSProviderConfig } from '../notification-types'

/* ------------------------------------------------------------------ */
/*  normalizePhone (pure logic – no mocks needed)                      */
/* ------------------------------------------------------------------ */
describe('SMSService.normalizePhone', () => {
  const service = new SMSService({
    provider: 'AFRICASTALKING',
    apiKey: 'key',
  })

  it('normalizes a number starting with 0 (Kenya local)', () => {
    expect(service.normalizePhone('0712345678')).toBe('+254712345678')
  })

  it('normalizes a number starting with 254 (no plus)', () => {
    expect(service.normalizePhone('254712345678')).toBe('+254712345678')
  })

  it('keeps a number already starting with +', () => {
    expect(service.normalizePhone('+254712345678')).toBe('+254712345678')
  })

  it('prepends +254 when no recognized prefix', () => {
    expect(service.normalizePhone('712345678')).toBe('+254712345678')
  })

  it('strips spaces', () => {
    expect(service.normalizePhone('0712 345 678')).toBe('+254712345678')
  })

  it('strips dashes', () => {
    expect(service.normalizePhone('0712-345-678')).toBe('+254712345678')
  })

  it('strips mixed spaces and dashes', () => {
    expect(service.normalizePhone('07 12-34 56-78')).toBe('+254712345678')
  })

  it('handles empty string', () => {
    // starts with neither 0 nor 254 nor + → prepends +254
    expect(service.normalizePhone('')).toBe('+254')
  })
})

/* ------------------------------------------------------------------ */
/*  send() – provider routing                                          */
/* ------------------------------------------------------------------ */
describe('SMSService.send – provider routing', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('routes NEXMO to sendNexmo', async () => {
    fetchSpy.mockResolvedValue({
      json: async () => ({ messages: [{ status: '0', 'message-id': 'NX1' }] }),
    })
    const svc = new SMSService({ provider: 'NEXMO', apiKey: 'k', apiSecret: 's' })
    const r = await svc.send('0712345678', 'hi')
    expect(r.success).toBe(true)
    expect(r.provider).toBe('NEXMO')
  })

  it('routes CUSTOM to sendCustom', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: 'C1' }),
    })
    const svc = new SMSService({ provider: 'CUSTOM', apiKey: 'k', baseUrl: 'https://hook.example.com/sms' })
    const r = await svc.send('0712345678', 'hi')
    expect(r.success).toBe(true)
    expect(r.provider).toBe('CUSTOM')
  })

  it('returns unknown provider error for unrecognized provider', async () => {
    const svc = new SMSService({ provider: 'INVALID' as never, apiKey: 'k' })
    const r = await svc.send('0712345678', 'hi')
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/unknown/i)
  })
})

/* ------------------------------------------------------------------ */
/*  Africa's Talking path                                              */
/* ------------------------------------------------------------------ */
describe('SMSService – Africa\'s Talking', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  const config: SMSProviderConfig = {
    provider: 'AFRICASTALKING',
    apiKey: 'at-api-key',
    apiSecret: 'sandbox',
    senderId: 'SCHOOL',
  }

  beforeEach(() => {
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns success when first recipient status is "Success"', async () => {
    fetchSpy.mockResolvedValue({
      json: async () => ({
        SMSMessageData: {
          Recipients: [{ status: 'Success', messageId: 'ATmsg123' }],
        },
      }),
    })

    const svc = new SMSService(config)
    const r = await svc.send('0712345678', 'Hello')

    expect(r).toEqual({
      success: true,
      provider: 'AFRICASTALKING',
      messageId: 'ATmsg123',
    })
    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, opts] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://api.africastalking.com/version1/messaging')
    expect(opts.method).toBe('POST')
    expect(opts.headers.apiKey).toBe('at-api-key')
  })

  it('returns failure when first recipient status is not "Success"', async () => {
    fetchSpy.mockResolvedValue({
      json: async () => ({
        SMSMessageData: {
          Recipients: [{ status: 'InvalidPhoneNumber' }],
        },
      }),
    })

    const svc = new SMSService(config)
    const r = await svc.send('0712345678', 'Hello')

    expect(r.success).toBe(false)
    expect(r.error).toBe('InvalidPhoneNumber')
    expect(r.provider).toBe('AFRICASTALKING')
  })

  it('returns failure with "Unknown error" when recipients array is empty', async () => {
    fetchSpy.mockResolvedValue({
      json: async () => ({
        SMSMessageData: { Recipients: [] },
      }),
    })

    const svc = new SMSService(config)
    const r = await svc.send('0712345678', 'Hello')
    expect(r.success).toBe(false)
    expect(r.error).toBe('Unknown error')
  })

  it('handles fetch throwing an Error', async () => {
    fetchSpy.mockRejectedValue(new Error('Network down'))

    const svc = new SMSService(config)
    const r = await svc.send('0712345678', 'Hello')

    expect(r).toEqual({
      success: false,
      error: 'Network down',
      provider: 'AFRICASTALKING',
    })
  })

  it('handles fetch throwing a non-Error', async () => {
    fetchSpy.mockRejectedValue('some string')

    const svc = new SMSService(config)
    const r = await svc.send('0712345678', 'Hello')

    expect(r.success).toBe(false)
    expect(r.error).toBe('API request failed')
    expect(r.provider).toBe('AFRICASTALKING')
  })

  it('omits messageId when it is null', async () => {
    fetchSpy.mockResolvedValue({
      json: async () => ({
        SMSMessageData: {
          Recipients: [{ status: 'Success', messageId: null }],
        },
      }),
    })

    const svc = new SMSService(config)
    const r = await svc.send('0712345678', 'Hello')
    expect(r.success).toBe(true)
    expect(r).not.toHaveProperty('messageId')
  })
})

/* ------------------------------------------------------------------ */
/*  Twilio path                                                        */
/* ------------------------------------------------------------------ */
describe('SMSService – Twilio', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  const config: SMSProviderConfig = {
    provider: 'TWILIO',
    apiKey: 'ACXXXXXXXX',
    apiSecret: 'auth-token',
    senderId: '+15005550006',
  }

  beforeEach(() => {
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns success when response contains sid', async () => {
    fetchSpy.mockResolvedValue({
      json: async () => ({ sid: 'SM123456' }),
    })

    const svc = new SMSService(config)
    const r = await svc.send('0712345678', 'Hi from Twilio')

    expect(r).toEqual({
      success: true,
      messageId: 'SM123456',
      provider: 'TWILIO',
    })
    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, opts] = fetchSpy.mock.calls[0]
    expect(url).toContain('ACXXXXXXXX')
    expect(opts.headers.Authorization).toMatch(/^Basic /)
  })

  it('returns failure when response has no sid', async () => {
    fetchSpy.mockResolvedValue({
      json: async () => ({ message: 'Invalid phone' }),
    })

    const svc = new SMSService(config)
    const r = await svc.send('0712345678', 'Hi')
    expect(r.success).toBe(false)
    expect(r.error).toBe('Invalid phone')
    expect(r.provider).toBe('TWILIO')
  })

  it('returns "Unknown error" when response has no sid and no message', async () => {
    fetchSpy.mockResolvedValue({
      json: async () => ({}),
    })

    const svc = new SMSService(config)
    const r = await svc.send('0712345678', 'Hi')
    expect(r.success).toBe(false)
    expect(r.error).toBe('Unknown error')
  })

  it('handles fetch throwing an Error', async () => {
    fetchSpy.mockRejectedValue(new Error('Timeout'))

    const svc = new SMSService(config)
    const r = await svc.send('0712345678', 'Hi')
    expect(r).toEqual({
      success: false,
      error: 'Timeout',
      provider: 'TWILIO',
    })
  })

  it('handles fetch throwing a non-Error', async () => {
    fetchSpy.mockRejectedValue(42)

    const svc = new SMSService(config)
    const r = await svc.send('0712345678', 'Hi')
    expect(r.success).toBe(false)
    expect(r.error).toBe('API request failed')
  })

  it('uses empty string From when senderId is not provided', async () => {
    fetchSpy.mockResolvedValue({
      json: async () => ({ sid: 'SM999' }),
    })

    const noSenderConfig: SMSProviderConfig = {
      provider: 'TWILIO',
      apiKey: 'ACXXXXXXXX',
      apiSecret: 'auth-token',
    }
    const svc = new SMSService(noSenderConfig)
    const r = await svc.send('0712345678', 'Hi')
    expect(r.success).toBe(true)
    // Verify the fetch body includes From: ''
    const body = fetchSpy.mock.calls[0][1].body as URLSearchParams
    expect(body.get('From')).toBe('')
  })
})

/* ------------------------------------------------------------------ */
/*  AT edge cases – missing SMSMessageData / no senderId / no secret   */
/* ------------------------------------------------------------------ */
describe('SMSService – Africa\'s Talking edge cases', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('handles response with undefined SMSMessageData', async () => {
    fetchSpy.mockResolvedValue({
      json: async () => ({}), // no SMSMessageData
    })

    const svc = new SMSService({
      provider: 'AFRICASTALKING',
      apiKey: 'key',
      apiSecret: 'sandbox',
      senderId: 'SCHOOL',
    })
    const r = await svc.send('0712345678', 'Hello')
    expect(r.success).toBe(false)
    expect(r.error).toBe('Unknown error')
    expect(r.provider).toBe('AFRICASTALKING')
  })

  it('sends without senderId when not provided', async () => {
    fetchSpy.mockResolvedValue({
      json: async () => ({
        SMSMessageData: {
          Recipients: [{ status: 'Success', messageId: 'msg1' }],
        },
      }),
    })

    const svc = new SMSService({
      provider: 'AFRICASTALKING',
      apiKey: 'key',
    })
    const r = await svc.send('0712345678', 'Hello')
    expect(r.success).toBe(true)

    const body = fetchSpy.mock.calls[0][1].body as URLSearchParams
    expect(body.get('username')).toBe('sandbox') // default
    expect(body.get('from')).toBe('')
  })

  it('sends without apiSecret defaulting to sandbox', async () => {
    fetchSpy.mockResolvedValue({
      json: async () => ({
        SMSMessageData: {
          Recipients: [{ status: 'Success', messageId: 'msg2' }],
        },
      }),
    })

    const svc = new SMSService({
      provider: 'AFRICASTALKING',
      apiKey: 'key',
    })
    const r = await svc.send('0712345678', 'Hello')
    expect(r.success).toBe(true)

    const body = fetchSpy.mock.calls[0][1].body as URLSearchParams
    expect(body.get('username')).toBe('sandbox')
  })
})

/* ------------------------------------------------------------------ */
/*  Nexmo (Vonage) path                                                */
/* ------------------------------------------------------------------ */
describe('SMSService – Nexmo', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  const config: SMSProviderConfig = {
    provider: 'NEXMO',
    apiKey: 'nexmo-key',
    apiSecret: 'nexmo-secret',
    senderId: 'SCHOOL',
  }

  beforeEach(() => {
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns success when first message status is "0"', async () => {
    fetchSpy.mockResolvedValue({
      json: async () => ({
        messages: [{ status: '0', 'message-id': 'NX-MSG-001' }],
      }),
    })

    const svc = new SMSService(config)
    const r = await svc.send('0712345678', 'Hello Nexmo')

    expect(r).toEqual({ success: true, messageId: 'NX-MSG-001', provider: 'NEXMO' })
    expect(fetchSpy).toHaveBeenCalledOnce()

    const [url, opts] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://rest.nexmo.com/sms/json')
    expect(opts.method).toBe('POST')
    expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded')

    const body = opts.body as URLSearchParams
    expect(body.get('api_key')).toBe('nexmo-key')
    expect(body.get('api_secret')).toBe('nexmo-secret')
    expect(body.get('to')).toBe('+254712345678')
    expect(body.get('from')).toBe('SCHOOL')
    expect(body.get('text')).toBe('Hello Nexmo')
  })

  it('omits messageId when message-id is absent', async () => {
    fetchSpy.mockResolvedValue({
      json: async () => ({
        messages: [{ status: '0' }],
      }),
    })

    const svc = new SMSService(config)
    const r = await svc.send('0712345678', 'Hello')
    expect(r.success).toBe(true)
    expect(r).not.toHaveProperty('messageId')
    expect(r.provider).toBe('NEXMO')
  })

  it('returns failure with error-text when status is not "0"', async () => {
    fetchSpy.mockResolvedValue({
      json: async () => ({
        messages: [{ status: '4', 'error-text': 'Invalid credentials' }],
      }),
    })

    const svc = new SMSService(config)
    const r = await svc.send('0712345678', 'Hello')
    expect(r.success).toBe(false)
    expect(r.error).toBe('Invalid credentials')
    expect(r.provider).toBe('NEXMO')
  })

  it('returns "Unknown error" when messages array is empty', async () => {
    fetchSpy.mockResolvedValue({
      json: async () => ({ messages: [] }),
    })

    const svc = new SMSService(config)
    const r = await svc.send('0712345678', 'Hello')
    expect(r.success).toBe(false)
    expect(r.error).toBe('Unknown error')
  })

  it('handles fetch throwing an Error', async () => {
    fetchSpy.mockRejectedValue(new Error('Timeout'))

    const svc = new SMSService(config)
    const r = await svc.send('0712345678', 'Hello')
    expect(r).toEqual({ success: false, error: 'Timeout', provider: 'NEXMO' })
  })

  it('handles fetch throwing a non-Error', async () => {
    fetchSpy.mockRejectedValue(99)

    const svc = new SMSService(config)
    const r = await svc.send('0712345678', 'Hello')
    expect(r.success).toBe(false)
    expect(r.error).toBe('API request failed')
  })

  it('uses empty string for senderId and apiSecret when not provided', async () => {
    fetchSpy.mockResolvedValue({
      json: async () => ({
        messages: [{ status: '0', 'message-id': 'NX2' }],
      }),
    })

    const svc = new SMSService({ provider: 'NEXMO', apiKey: 'k' })
    const r = await svc.send('0712345678', 'Hello')
    expect(r.success).toBe(true)

    const body = fetchSpy.mock.calls[0][1].body as URLSearchParams
    expect(body.get('api_secret')).toBe('')
    expect(body.get('from')).toBe('')
  })
})

/* ------------------------------------------------------------------ */
/*  Custom webhook path                                                */
/* ------------------------------------------------------------------ */
describe('SMSService – Custom', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  const config: SMSProviderConfig = {
    provider: 'CUSTOM',
    apiKey: 'bearer-token-123',
    senderId: 'SCHOOL',
    baseUrl: 'https://hook.example.com/sms',
  }

  beforeEach(() => {
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns success with messageId on ok response', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: 'CUSTOM-001' }),
    })

    const svc = new SMSService(config)
    const r = await svc.send('0712345678', 'Hi Custom')

    expect(r).toEqual({ success: true, messageId: 'CUSTOM-001', provider: 'CUSTOM' })
    expect(fetchSpy).toHaveBeenCalledOnce()

    const [url, opts] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://hook.example.com/sms')
    expect(opts.method).toBe('POST')
    expect(opts.headers.Authorization).toBe('Bearer bearer-token-123')
    expect(opts.headers['Content-Type']).toBe('application/json')

    const body = JSON.parse(opts.body)
    expect(body.to).toBe('+254712345678')
    expect(body.message).toBe('Hi Custom')
    expect(body.from).toBe('SCHOOL')
  })

  it('omits messageId when response has none', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    const svc = new SMSService(config)
    const r = await svc.send('0712345678', 'Hi')
    expect(r.success).toBe(true)
    expect(r).not.toHaveProperty('messageId')
    expect(r.provider).toBe('CUSTOM')
  })

  it('returns failure with error on non-ok response', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Rate limited' }),
    })

    const svc = new SMSService(config)
    const r = await svc.send('0712345678', 'Hi')
    expect(r.success).toBe(false)
    expect(r.error).toBe('Rate limited')
    expect(r.provider).toBe('CUSTOM')
  })

  it('returns "Unknown error" when error response has no error field', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      json: async () => ({}),
    })

    const svc = new SMSService(config)
    const r = await svc.send('0712345678', 'Hi')
    expect(r.success).toBe(false)
    expect(r.error).toBe('Unknown error')
  })

  it('returns error when baseUrl is not configured', async () => {
    const svc = new SMSService({ provider: 'CUSTOM', apiKey: 'k' })
    const r = await svc.send('0712345678', 'Hi')
    expect(r.success).toBe(false)
    expect(r.error).toBe('Custom provider requires baseUrl')
    expect(r.provider).toBe('CUSTOM')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('handles fetch throwing an Error', async () => {
    fetchSpy.mockRejectedValue(new Error('Connection refused'))

    const svc = new SMSService(config)
    const r = await svc.send('0712345678', 'Hi')
    expect(r).toEqual({ success: false, error: 'Connection refused', provider: 'CUSTOM' })
  })

  it('handles fetch throwing a non-Error', async () => {
    fetchSpy.mockRejectedValue('fail')

    const svc = new SMSService(config)
    const r = await svc.send('0712345678', 'Hi')
    expect(r.success).toBe(false)
    expect(r.error).toBe('API request failed')
  })
})
