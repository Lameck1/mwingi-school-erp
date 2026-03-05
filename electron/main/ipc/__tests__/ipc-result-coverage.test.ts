/**
 * Additional coverage tests for ipc-result.ts
 * Targets uncovered lines: 137, 151, 158, 164
 * These are in safeHandleWithRole: invalid session actor id path
 * and safeHandleRawWithRole exception path
 */
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
  safeHandleRawWithRole,
  safeHandleWithRole,
  resolveActorId
} from '../ipc-result'

function makeEvent(): IpcMainInvokeEvent {
  return {} as IpcMainInvokeEvent
}

async function invoke(channel: string, event: IpcMainInvokeEvent, ...args: unknown[]): Promise<unknown> {
  const handler = handlerMap.get(channel)
  if (!handler) { throw new Error(`Handler not registered: ${channel}`) }
  return handler(event, ...args)
}

describe('ipc-result additional coverage', () => {
  beforeEach(() => {
    handlerMap.clear()
    getSessionMock.mockReset()
  })

  // ─── safeHandleWithRole: no active session ─────────────────────
  it('safeHandleWithRole returns unauthorized when no session', async () => {
    safeHandleWithRole<string, []>('role:no-session', ['ADMIN'], async () => 'never')
    getSessionMock.mockResolvedValueOnce(null)
    const result = await invoke('role:no-session', makeEvent())
    expect(result).toEqual({ success: false, error: 'Unauthorized: no active session' })
  })

  // ─── safeHandleWithRole: invalid actor id (line 158/164) ───────
  it('safeHandleWithRole rejects invalid session actor id (0)', async () => {
    safeHandleWithRole<string, []>('role:invalid-actor', ['ADMIN'], async () => 'never')
    getSessionMock.mockResolvedValueOnce({ user: { id: 0, role: 'ADMIN' } })
    const result = await invoke('role:invalid-actor', makeEvent())
    expect(result).toEqual({ success: false, error: 'Unauthorized: invalid session actor' })
  })

  it('safeHandleWithRole rejects negative session actor id', async () => {
    safeHandleWithRole<string, []>('role:neg-actor', ['ADMIN'], async () => 'never')
    getSessionMock.mockResolvedValueOnce({ user: { id: -1, role: 'ADMIN' } })
    const result = await invoke('role:neg-actor', makeEvent())
    expect(result).toEqual({ success: false, error: 'Unauthorized: invalid session actor' })
  })

  it('safeHandleWithRole rejects non-integer actor id', async () => {
    safeHandleWithRole<string, []>('role:float-actor', ['ADMIN'], async () => 'never')
    getSessionMock.mockResolvedValueOnce({ user: { id: 1.5, role: 'ADMIN' } })
    const result = await invoke('role:float-actor', makeEvent())
    expect(result).toEqual({ success: false, error: 'Unauthorized: invalid session actor' })
  })

  // ─── safeHandleWithRole: handler throws (line 137) ─────────────
  it('safeHandleWithRole catches exceptions and returns IPCResult failure', async () => {
    safeHandleWithRole<void, []>('role:throw', ['ADMIN'], async () => {
      throw new Error('Kaboom')
    })
    getSessionMock.mockResolvedValueOnce({ user: { id: 5, role: 'ADMIN' } })
    const result = await invoke('role:throw', makeEvent())
    expect(result).toEqual({ success: false, error: 'Kaboom' })
  })

  // ─── safeHandleRawWithRole: handler throws non-Error ───────────
  it('safeHandleRawWithRole handles thrown non-Error values', async () => {
    safeHandleRawWithRole<[]>('raw:throw-string', ['ADMIN'], async () => {
      throw 'string error' // NOSONAR
    })
    getSessionMock.mockResolvedValueOnce({ user: { id: 5, role: 'ADMIN' } })
    const result = await invoke('raw:throw-string', makeEvent())
    expect(result).toEqual({ success: false, error: 'string error' })
  })

  it('safeHandleRawWithRole handles thrown object values', async () => {
    safeHandleRawWithRole<[]>('raw:throw-obj', ['ADMIN'], async () => {
      throw { code: 42 } // NOSONAR
    })
    getSessionMock.mockResolvedValueOnce({ user: { id: 5, role: 'ADMIN' } })
    const result = await invoke('raw:throw-obj', makeEvent())
    expect(result).toEqual({ success: false, error: "raw:throw-obj failed" })
  })

  // ─── resolveActorId with null legacyUserId ─────────────────────
  it('resolveActorId succeeds when legacyUserId is null', () => {
    const event = makeEvent()
    Object.assign(event as object, { __ipcActor: { id: 10, role: 'ADMIN' } })
    expect(resolveActorId(event, null)).toEqual({ success: true, actorId: 10 })
  })

  it('resolveActorId fails when legacyUserId is negative', () => {
    const event = makeEvent()
    Object.assign(event as object, { __ipcActor: { id: 10, role: 'ADMIN' } })
    expect(resolveActorId(event, -3)).toEqual({ success: false, error: 'Invalid user session' })
  })

  it('resolveActorId fails when legacyUserId is zero', () => {
    const event = makeEvent()
    Object.assign(event as object, { __ipcActor: { id: 10, role: 'ADMIN' } })
    expect(resolveActorId(event, 0)).toEqual({ success: false, error: 'Invalid user session' })
  })
})
