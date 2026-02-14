import { ipcMain } from '../electron-env'

import type { IpcMainInvokeEvent } from 'electron'

/**
 * Standardized IPC result type.
 * All IPC handlers should return this shape for consistency.
 */
export type IPCResult<T = void> =
    | { success: true; data: T }
    | { success: false; error: string }

/**
 * Wraps an IPC handler so that:
 * 1. Thrown errors are caught and returned as { success: false, error: message }
 * 2. Successful returns are wrapped in { success: true, data: result }
 *
 * Use `safeHandle` for new handlers that should return IPCResult<T>.
 * Use `safeHandleRaw` for handlers that already return their own shape (migration helper).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = (event: IpcMainInvokeEvent, ...args: any[]) => any

export function safeHandle<T>(
    channel: string,
    handler: AnyHandler,
): void {
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]): Promise<IPCResult<T>> => {
        try {
            const result = await handler(event, ...args)
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
export function safeHandleRaw(
    channel: string,
    handler: AnyHandler,
): void {
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
        try {
            return await handler(event, ...args)
        } catch (error) {
            return { success: false, error: getErrorMessage(error, `${channel} failed`) }
        }
    })
}

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
