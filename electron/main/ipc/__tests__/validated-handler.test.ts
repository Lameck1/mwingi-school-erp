import { describe, expect, it, vi, beforeEach } from 'vitest'
import { z } from 'zod'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn(async () => JSON.stringify({
      user: {
        id: 1,
        username: 'admin',
        role: 'ADMIN',
        full_name: 'Admin User',
        email: 'admin@test.com',
        is_active: 1,
        created_at: '2026-01-01'
      },
      lastActivity: Date.now()
    })),
    setPassword: vi.fn().mockResolvedValue(null),
    deletePassword: vi.fn().mockResolvedValue(true),
  }
}))

vi.mock('../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      handlerMap.set(channel, handler)
    }),
    removeHandler: vi.fn(),
  },
}))

import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

describe('validatedHandler', () => {
  beforeEach(() => {
    handlerMap.clear()
  })

  it('validates input and passes typed data to handler', async () => {
    const schema = z.object({
      name: z.string().min(1),
      age: z.number().int().positive(),
    })

    const handlerFn = vi.fn(async (_event, data, actor) => ({
      success: true,
      name: data.name,
      actorId: actor.id,
    }))

    validatedHandler('test:create', ['ADMIN'], schema, handlerFn)

    const handler = handlerMap.get('test:create')!
    const result = await handler({}, { name: 'Alice', age: 30 }) as { success: boolean; name: string; actorId: number }

    expect(result.success).toBe(true)
    expect(result.name).toBe('Alice')
    expect(result.actorId).toBe(1)
    expect(handlerFn).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid input with validation error', async () => {
    const schema = z.object({
      name: z.string().min(1),
      age: z.number(),
    })

    validatedHandler('test:invalid', ['ADMIN'], schema, async () => ({ success: true }))

    const handler = handlerMap.get('test:invalid')!
    const result = await handler({}, { name: '', age: 'not-a-number' }) as { success: boolean; error: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Validation failed')
  })

  it('rejects unauthorized roles', async () => {
    const schema = z.object({ id: z.number() })

    validatedHandler('test:admin-only', ['PRINCIPAL'], schema, async () => ({ success: true }))

    const handler = handlerMap.get('test:admin-only')!
    const result = await handler({}, { id: 1 }) as { success: boolean; error: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
  })
})

describe('validatedHandlerMulti', () => {
  beforeEach(() => {
    handlerMap.clear()
  })

  it('validates tuple arguments', async () => {
    const schema = z.tuple([
      z.number().int().positive(),
      z.object({ name: z.string() }),
    ])

    const handlerFn = vi.fn(async (_event, [id, data], actor) => ({
      success: true,
      id,
      name: data.name,
      actorId: actor.id,
    }))

    validatedHandlerMulti('test:update', ['ADMIN'], schema, handlerFn)

    const handler = handlerMap.get('test:update')!
    const result = await handler({}, 42, { name: 'Bob' }) as { success: boolean; id: number; name: string }

    expect(result.success).toBe(true)
    expect(result.id).toBe(42)
    expect(result.name).toBe('Bob')
  })
})
