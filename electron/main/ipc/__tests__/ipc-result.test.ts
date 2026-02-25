import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { IpcMainInvokeEvent } from 'electron'

type InvokeHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>

const { getSessionMock, handlerMap } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  handlerMap: new Map<string, InvokeHandler>()
}))

vi.mock('../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: InvokeHandler) => {
      handlerMap.set(channel, handler)
    }),
    removeHandler: vi.fn()
  }
}))

vi.mock('../../security/session', () => ({
  getSession: (...args: unknown[]) => getSessionMock(...args)
}))

import {
  getActorFromEvent,
  getErrorMessage,
  resolveActorId,
  safeHandle,
  safeHandleRaw,
  safeHandleRawWithRole,
  safeHandleWithRole
} from '../ipc-result'

function makeEvent(): IpcMainInvokeEvent {
  return {} as IpcMainInvokeEvent
}

async function invoke(channel: string, event: IpcMainInvokeEvent, ...args: unknown[]): Promise<unknown> {
  const handler = handlerMap.get(channel)
  if (!handler) {
    throw new Error(`Handler not registered: ${channel}`)
  }
  return handler(event, ...args)
}

describe('ipc-result helpers', () => {
  beforeEach(() => {
    handlerMap.clear()
    getSessionMock.mockReset()
  })

  it('extracts actor from event only when payload is valid', () => {
    const missing = getActorFromEvent(makeEvent())
    expect(missing).toBeNull()

    const invalidIdEvent = makeEvent()
    Object.assign(invalidIdEvent as object, { __ipcActor: { id: 0, role: 'ADMIN' } })
    expect(getActorFromEvent(invalidIdEvent)).toBeNull()

    const invalidRoleEvent = makeEvent()
    Object.assign(invalidRoleEvent as object, { __ipcActor: { id: 1, role: '' } })
    expect(getActorFromEvent(invalidRoleEvent)).toBeNull()

    const validEvent = makeEvent()
    Object.assign(validEvent as object, { __ipcActor: { id: 7, role: 'ADMIN' } })
    expect(getActorFromEvent(validEvent)).toEqual({ id: 7, role: 'ADMIN' })
  })

  it('resolves actor id with optional legacy user validation', () => {
    const eventWithoutActor = makeEvent()
    expect(resolveActorId(eventWithoutActor)).toEqual({
      success: false,
      error: 'Unauthorized: missing authenticated actor context'
    })

    const actorEvent = makeEvent()
    Object.assign(actorEvent as object, { __ipcActor: { id: 10, role: 'ADMIN' } })

    expect(resolveActorId(actorEvent, 'x')).toEqual({
      success: false,
      error: 'Invalid user session'
    })
    expect(resolveActorId(actorEvent, 99)).toEqual({
      success: false,
      error: 'Unauthorized: renderer user mismatch'
    })
    expect(resolveActorId(actorEvent, 10)).toEqual({
      success: true,
      actorId: 10
    })
    expect(resolveActorId(actorEvent)).toEqual({
      success: true,
      actorId: 10
    })
  })

  it('returns human-friendly unknown error messages', () => {
    expect(getErrorMessage(new Error('boom'), 'fallback')).toBe('boom')
    expect(getErrorMessage('plain failure', 'fallback')).toBe('plain failure')
    expect(getErrorMessage({ value: 1 }, 'fallback')).toBe('fallback')
  })
})

describe('ipc-result wrappers', () => {
  beforeEach(() => {
    handlerMap.clear()
    getSessionMock.mockReset()
  })

  it('safeHandle wraps success and failures in IPCResult', async () => {
    safeHandle<number, [number, number]>('math:add', async (_event, left, right) => left + right)
    safeHandle<void, []>('math:explode', async () => {
      throw new Error('explode')
    })

    const ok = await invoke('math:add', makeEvent(), 2, 5)
    expect(ok).toEqual({ success: true, data: 7 })

    const fail = await invoke('math:explode', makeEvent())
    expect(fail).toEqual({ success: false, error: 'explode' })
  })

  it('safeHandleRaw passes through raw values and normalizes thrown errors', async () => {
    safeHandleRaw<[string]>('raw:ok', async (_event, value) => ({ echoed: value }))
    safeHandleRaw('raw:fail', async () => {
      throw 'raw boom'
    })

    const ok = await invoke('raw:ok', makeEvent(), 'abc')
    expect(ok).toEqual({ echoed: 'abc' })

    const fail = await invoke('raw:fail', makeEvent())
    expect(fail).toEqual({ success: false, error: 'raw boom' })
  })

  it('safeHandleRawWithRole enforces role checks and attaches actor context', async () => {
    safeHandleRawWithRole('role:raw', ['ADMIN'], async (event, name: string) => {
      return { actor: getActorFromEvent(event), greeting: `hello ${name}` }
    })

    getSessionMock.mockResolvedValueOnce(null)
    const noSession = await invoke('role:raw', makeEvent(), 'sam')
    expect(noSession).toEqual({ success: false, error: 'Unauthorized: no active session' })

    getSessionMock.mockResolvedValueOnce({
      user: { id: 2, role: 'TEACHER' }
    })
    const denied = await invoke('role:raw', makeEvent(), 'sam')
    expect(denied).toEqual({
      success: false,
      error: "Unauthorized: role 'TEACHER' cannot access 'role:raw'"
    })

    getSessionMock.mockResolvedValueOnce({
      user: { id: 0, role: 'ADMIN' }
    })
    const invalidActor = await invoke('role:raw', makeEvent(), 'sam')
    expect(invalidActor).toEqual({ success: false, error: 'Unauthorized: invalid session actor' })

    getSessionMock.mockResolvedValueOnce({
      user: { id: 9, role: 'ADMIN' }
    })
    const ok = await invoke('role:raw', makeEvent(), 'sam')
    expect(ok).toEqual({
      actor: { id: 9, role: 'ADMIN' },
      greeting: 'hello sam'
    })
  })

  it('safeHandleWithRole enforces role checks and wraps output', async () => {
    safeHandleWithRole<string, []>('role:wrapped', ['ADMIN'], async (event) => {
      const actor = getActorFromEvent(event)
      return `${actor?.role}:${actor?.id}`
    })

    getSessionMock.mockResolvedValueOnce({
      user: { id: 5, role: 'TEACHER' }
    })
    const denied = await invoke('role:wrapped', makeEvent())
    expect(denied).toEqual({
      success: false,
      error: "Unauthorized: role 'TEACHER' cannot access 'role:wrapped'"
    })

    getSessionMock.mockResolvedValueOnce({
      user: { id: 11, role: 'ADMIN' }
    })
    const ok = await invoke('role:wrapped', makeEvent())
    expect(ok).toEqual({ success: true, data: 'ADMIN:11' })
  })
})
