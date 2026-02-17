import { ipcMain } from '../electron-env'
import { getSession } from '../security/session'

import type { IpcMainInvokeEvent } from 'electron'

/**
 * Standardized IPC result type.
 * All IPC handlers should return this shape for consistency.
 */
export type IPCResult<T = void> =
    | { success: true; data: T }
    | { success: false; error: string }

/**
 * Generic IPC handler wrappers providing RBAC and error handling.
 * Handler parameter types are inferred via TypeScript generics (compile-time only).
 *
 * - `safeHandle` — wraps result in IPCResult<T>
 * - `safeHandleRaw` — passes handler result through as-is
 * - `safeHandleRawWithRole` — adds role check, passes result through
 * - `safeHandleWithRole` — adds role check, wraps result in IPCResult<T>
 *
 * For runtime input validation (untrusted renderer data), use `validatedHandler()`
 * from `./validated-handler.ts` which adds Zod schema parsing before the handler runs.
 */

interface IpcActor {
    id: number
    role: string
}

const IPC_ACTOR_KEY = '__ipcActor'

function attachActor(event: IpcMainInvokeEvent, actor: IpcActor): void {
    const target = event as IpcMainInvokeEvent & { __ipcActor?: IpcActor }
    target[IPC_ACTOR_KEY] = actor
}

export function getActorFromEvent(event: IpcMainInvokeEvent): IpcActor | null {
    const target = event as IpcMainInvokeEvent & { __ipcActor?: IpcActor }
    const actor = target[IPC_ACTOR_KEY]
    if (!actor) {
        return null
    }
    if (!Number.isInteger(actor.id) || actor.id <= 0) {
        return null
    }
    if (typeof actor.role !== 'string' || actor.role.trim().length === 0) {
        return null
    }
    return actor
}

/**
 * Resolves the authenticated actor ID from IPC event context and validates
 * legacy renderer-supplied user IDs for backward compatibility.
 */
export function resolveActorId(
    event: IpcMainInvokeEvent,
    legacyUserId?: unknown,
): { success: true; actorId: number } | { success: false; error: string } {
    const actor = getActorFromEvent(event)
    if (!actor) {
        return { success: false, error: 'Unauthorized: missing authenticated actor context' }
    }

    if (legacyUserId !== undefined && legacyUserId !== null) {
        if (!Number.isInteger(legacyUserId) || (legacyUserId as number) <= 0) {
            return { success: false, error: 'Invalid user session' }
        }
        if ((legacyUserId as number) !== actor.id) {
            return { success: false, error: 'Unauthorized: renderer user mismatch' }
        }
    }

    return { success: true, actorId: actor.id }
}

export function safeHandle<T, TArgs extends unknown[]>(
    channel: string,
    handler: (event: IpcMainInvokeEvent, ...args: TArgs) => unknown | Promise<unknown>,
): void {
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]): Promise<IPCResult<T>> => {
        try {
            const result = await handler(event, ...(args as TArgs))
            return { success: true, data: result as T }
        } catch (error) {
            return { success: false, error: getErrorMessage(error, `${channel} failed`) }
        }
    })
}

/**
 * Wraps an IPC handler that already returns its own result shape.
 * Only catches unhandled exceptions and converts them to { success: false, error }.
 * Use this as a migration helper for existing handlers.
 */
export function safeHandleRaw<TArgs extends unknown[]>(
    channel: string,
    handler: (event: IpcMainInvokeEvent, ...args: TArgs) => unknown | Promise<unknown>,
): void {
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
        try {
            return await handler(event, ...(args as TArgs))
        } catch (error) {
            return { success: false, error: getErrorMessage(error, `${channel} failed`) }
        }
    })
}

/**
 * Wraps an IPC handler with role-based access control.
 * Checks the current session role before executing the handler.
 * Returns { success: false, error: 'Unauthorized' } if the role is not allowed.
 */
export function safeHandleRawWithRole<TArgs extends unknown[]>(
    channel: string,
    allowedRoles: readonly string[],
    handler: (event: IpcMainInvokeEvent, ...args: TArgs) => unknown | Promise<unknown>,
): void {
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
        try {
            const session = await getSession()
            if (!session?.user?.role) {
                return { success: false, error: 'Unauthorized: no active session' }
            }
            if (!allowedRoles.includes(session.user.role)) {
                return { success: false, error: `Unauthorized: role '${session.user.role}' cannot access '${channel}'` }
            }
            const actorId = Number(session.user.id)
            if (!Number.isInteger(actorId) || actorId <= 0) {
                return { success: false, error: 'Unauthorized: invalid session actor' }
            }
            attachActor(event, { id: actorId, role: session.user.role })
            return await handler(event, ...(args as TArgs))
        } catch (error) {
            return { success: false, error: getErrorMessage(error, `${channel} failed`) }
        }
    })
}

export function safeHandleWithRole<T, TArgs extends unknown[]>(
    channel: string,
    allowedRoles: readonly string[],
    handler: (event: IpcMainInvokeEvent, ...args: TArgs) => unknown | Promise<unknown>,
): void {
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]): Promise<IPCResult<T>> => {
        try {
            const session = await getSession()
            if (!session?.user?.role) {
                return { success: false, error: 'Unauthorized: no active session' }
            }
            if (!allowedRoles.includes(session.user.role)) {
                return { success: false, error: `Unauthorized: role '${session.user.role}' cannot access '${channel}'` }
            }
            const actorId = Number(session.user.id)
            if (!Number.isInteger(actorId) || actorId <= 0) {
                return { success: false, error: 'Unauthorized: invalid session actor' }
            }
            attachActor(event, { id: actorId, role: session.user.role })
            const result = await handler(event, ...(args as TArgs))
            return { success: true, data: result as T }
        } catch (error) {
            return { success: false, error: getErrorMessage(error, `${channel} failed`) }
        }
    })
}

/** Standard role groups for convenience */
export const ROLES = {
    ADMIN_ONLY: ['ADMIN'] as const,
    FINANCE: ['ADMIN', 'ACCOUNTS_CLERK'] as const,
    MANAGEMENT: ['ADMIN', 'PRINCIPAL', 'DEPUTY_PRINCIPAL'] as const,
    STAFF: ['ADMIN', 'PRINCIPAL', 'DEPUTY_PRINCIPAL', 'ACCOUNTS_CLERK', 'AUDITOR', 'TEACHER'] as const,
    ALL_AUTHENTICATED: [] as const, // empty = skip role check (handled by safeHandleRaw)
} as const

/**
 * Extracts a human-readable error message from an unknown thrown value.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error) {
        return error.message
    }
    if (typeof error === 'string') {
        return error
    }
    return fallback
}
