import { type ZodType, type ZodError } from 'zod'

import { ipcMain } from '../electron-env'
import { getErrorMessage } from './ipc-result'
import { getSession } from '../security/session'


import type { IpcMainInvokeEvent } from 'electron'

interface IpcActor {
    id: number
    role: string
}

/**
 * Registers a Zod-validated IPC handler with role-based access control.
 *
 * Usage:
 * ```ts
 * validatedHandler('staff:create', ROLES.MANAGEMENT, z.object({
 *   first_name: z.string().min(1),
 *   last_name: z.string().min(1),
 * }), async (event, data, actor) => {
 *   // data is fully typed and validated
 *   return { success: true }
 * })
 * ```
 */
export function validatedHandler<TSchema extends ZodType>(
    channel: string,
    allowedRoles: readonly string[],
    schema: TSchema,
    handler: (
        event: IpcMainInvokeEvent,
        data: TSchema['_output'],
        actor: IpcActor,
    ) => unknown | Promise<unknown>,
): void {
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
        try {
            // 1. Authenticate
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

            // 2. Validate input
            const parseResult = schema.safeParse(args[0])
            if (!parseResult.success) {
                const messages = (parseResult.error as ZodError).issues.map(i => `${i.path.join('.')}: ${i.message}`)
                return { success: false, error: `Validation failed: ${messages.join('; ')}` }
            }

            // 3. Execute handler with validated data
            const actor: IpcActor = { id: actorId, role: session.user.role }
            return await handler(event, parseResult.data, actor)
        } catch (error) {
            return { success: false, error: getErrorMessage(error, `${channel} failed`) }
        }
    })
}

/**
 * Registers a Zod-validated IPC handler with role-based access control
 * that accepts multiple positional arguments via a tuple schema.
 *
 * Usage:
 * ```ts
 * validatedHandlerMulti('staff:update', ROLES.MANAGEMENT, z.tuple([
 *   z.number().int().positive(),         // id
 *   z.object({ first_name: z.string() }) // data
 * ]), async (event, [id, data], actor) => {
 *   return { success: true }
 * })
 * ```
 */
export function validatedHandlerMulti<TSchema extends ZodType>(
    channel: string,
    allowedRoles: readonly string[],
    schema: TSchema,
    handler: (
        event: IpcMainInvokeEvent,
        data: TSchema['_output'],
        actor: IpcActor,
    ) => unknown | Promise<unknown>,
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

            const parseResult = schema.safeParse(args)
            if (!parseResult.success) {
                const messages = (parseResult.error as ZodError).issues.map(i => `${i.path.join('.')}: ${i.message}`)
                return { success: false, error: `Validation failed: ${messages.join('; ')}` }
            }

            const actor: IpcActor = { id: actorId, role: session.user.role }
            return await handler(event, parseResult.data, actor)
        } catch (error) {
            return { success: false, error: getErrorMessage(error, `${channel} failed`) }
        }
    })
}
