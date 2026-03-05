/**
 * Additional coverage tests for validated-handler.ts
 * Targets uncovered lines: 57 (PUBLIC role path), 116 (validatedHandlerMulti PUBLIC role)
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { z } from 'zod'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()

const { getSessionMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn()
}))

vi.mock('../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      handlerMap.set(channel, handler)
    }),
    removeHandler: vi.fn(),
  },
}))

vi.mock('../../security/session', () => ({
  getSession: (...args: unknown[]) => getSessionMock(...args)
}))

import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

describe('validatedHandler additional coverage', () => {
  beforeEach(() => {
    handlerMap.clear()
    getSessionMock.mockReset()
  })

  // ─── PUBLIC role skips session check (line 57) ─────────────────
  it('allows PUBLIC role without session', async () => {
    const handlerFn = vi.fn(async (_event, data, actor) => ({
      received: data,
      actorId: actor.id,
    }))

    validatedHandler('test:public', ['PUBLIC'], z.string(), handlerFn)

    // No session at all
    getSessionMock.mockResolvedValueOnce(null)

    const handler = handlerMap.get('test:public')!
    const result = await handler({}, 'hello') as { received: string; actorId: number }

    expect(result.received).toBe('hello')
    expect(result.actorId).toBe(0) // No session -> actorId defaults to 0
    expect(handlerFn).toHaveBeenCalledTimes(1)
  })

  it('PUBLIC handler uses session when available', async () => {
    validatedHandler('test:public2', ['PUBLIC'], z.void(), async (_event, _data, actor) => ({
      actorId: actor.id,
      role: actor.role,
    }))

    getSessionMock.mockResolvedValueOnce({
      user: { id: 5, role: 'TEACHER' }
    })

    const handler = handlerMap.get('test:public2')!
    const result = await handler({}) as { actorId: number; role: string }
    expect(result.actorId).toBe(5)
    expect(result.role).toBe('TEACHER')
  })

  // ─── ALL_AUTHENTICATED (empty roles array) ─────────────────────
  it('allows any authenticated session when roles array is empty', async () => {
    validatedHandler('test:all-auth', [], z.void(), async (_event, _data, actor) => ({
      actorId: actor.id,
    }))

    getSessionMock.mockResolvedValueOnce({
      user: { id: 7, role: 'JANITOR' }
    })

    const handler = handlerMap.get('test:all-auth')!
    const result = await handler({}) as { actorId: number }
    expect(result.actorId).toBe(7)
  })

  // ─── Handler exception path ────────────────────────────────────
  it('catches handler exceptions and returns error', async () => {
    validatedHandler('test:throw', ['PUBLIC'], z.void(), async () => {
      throw new Error('Handler boom')
    })

    getSessionMock.mockResolvedValueOnce(null)
    const handler = handlerMap.get('test:throw')!
    const result = await handler({}) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toBe('Handler boom')
  })

  it('catches non-Error thrown values', async () => {
    validatedHandler('test:throw-str', ['PUBLIC'], z.void(), async () => {
      throw 'plain string' // NOSONAR
    })

    getSessionMock.mockResolvedValueOnce(null)
    const handler = handlerMap.get('test:throw-str')!
    const result = await handler({}) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toBe('plain string')
  })
})

describe('validatedHandlerMulti additional coverage', () => {
  beforeEach(() => {
    handlerMap.clear()
    getSessionMock.mockReset()
  })

  // ─── PUBLIC multi handler (line 116) ───────────────────────────
  it('allows PUBLIC role on multi handler', async () => {
    const tupleSchema = z.tuple([z.string(), z.number()])
    validatedHandlerMulti('test:public-multi', ['PUBLIC'], tupleSchema, async (_event, [name, age], actor) => ({
      name, age, actorId: actor.id,
    }))

    getSessionMock.mockResolvedValueOnce(null)
    const handler = handlerMap.get('test:public-multi')!
    const result = await handler({}, 'Alice', 30) as { name: string; age: number; actorId: number }
    expect(result.name).toBe('Alice')
    expect(result.age).toBe(30)
    expect(result.actorId).toBe(0)
  })

  // ─── Multi handler validation failure ──────────────────────────
  it('returns validation error for invalid tuple args', async () => {
    const tupleSchema = z.tuple([z.number(), z.string()])
    validatedHandlerMulti('test:multi-invalid', ['PUBLIC'], tupleSchema, async () => ({
      success: true
    }))

    getSessionMock.mockResolvedValueOnce(null)
    const handler = handlerMap.get('test:multi-invalid')!
    const result = await handler({}, 'not-a-number', 123) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Validation failed')
  })

  // ─── Multi handler no session (non-public) ─────────────────────
  it('rejects non-public multi handler without session', async () => {
    validatedHandlerMulti('test:multi-auth', ['ADMIN'], z.tuple([z.number()]), async () => ({
      success: true
    }))

    getSessionMock.mockResolvedValueOnce(null)
    const handler = handlerMap.get('test:multi-auth')!
    const result = await handler({}, 1) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
  })

  // ─── Multi handler invalid actor id ────────────────────────────
  it('rejects multi handler with invalid actor id', async () => {
    validatedHandlerMulti('test:multi-bad-actor', ['ADMIN'], z.tuple([z.number()]), async () => ({
      success: true
    }))

    getSessionMock.mockResolvedValueOnce({ user: { id: 0, role: 'ADMIN' } })
    const handler = handlerMap.get('test:multi-bad-actor')!
    const result = await handler({}, 1) as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('invalid session actor')
  })

  // ─── Multi handler exception ───────────────────────────────────
  it('catches exceptions in multi handler', async () => {
    validatedHandlerMulti('test:multi-throw', ['PUBLIC'], z.tuple([z.string()]), async () => {
      throw new Error('multi boom')
    })

    getSessionMock.mockResolvedValueOnce(null)
    const handler = handlerMap.get('test:multi-throw')!
    const result = await handler({}, 'test') as { success: boolean; error: string }
    expect(result.success).toBe(false)
    expect(result.error).toBe('multi boom')
  })
})
