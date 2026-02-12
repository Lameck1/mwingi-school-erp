/**
 * Centralized logger for the Electron main process.
 *
 * Uses electron-log for structured file + console logging.
 * - `log.info/warn/error/debug` work immediately at import time.
 * - `installConsoleOverrides()` must be called AFTER `app.whenReady()`
 *   to redirect `console.error` and `console.warn` to the log file.
 */

import electronLog from 'electron-log'

// ── File transport ────────────────────────────────────────────────
electronLog.transports.file.maxSize = 5 * 1024 * 1024 // 5 MB
electronLog.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'

// ── Console transport ─────────────────────────────────────────────
electronLog.transports.console.level = 'debug'

/**
 * Redirect `console.error` and `console.warn` to electron-log so they
 * end up in the log file.  Must be called AFTER `app.whenReady()`
 * because electron-log's file transport resolves its path using
 * `app.getPath('userData')`, which is only available after 'ready'.
 */
export function installConsoleOverrides(): void {
    const origError = console.error
    const origWarn  = console.warn

    console.error = (...args: unknown[]) => {
        electronLog.error(...args)
        origError.apply(console, args)
    }

    console.warn = (...args: unknown[]) => {
        electronLog.warn(...args)
        origWarn.apply(console, args)
    }
}

export const log = electronLog

export default log
