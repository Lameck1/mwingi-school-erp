import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
//  Mocks (hoisted)
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  electronLog: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    transports: {
      file: { maxSize: 0, format: '' },
      console: { level: '' as string | undefined },
    },
  },
}))

vi.mock('electron-log', () => ({
  default: mocks.electronLog,
}))

import { installConsoleOverrides, log } from '../logger'

// ---------------------------------------------------------------------------
//  Tests
// ---------------------------------------------------------------------------
describe('utils/logger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ==================== log export ====================
  it('exports the electron-log instance as `log`', () => {
    expect(log).toBe(mocks.electronLog)
  })

  // ==================== installConsoleOverrides ====================
  describe('installConsoleOverrides', () => {
    let origConsoleError: typeof console.error
    let origConsoleWarn: typeof console.warn
    let origConsoleInfo: typeof console.info

    beforeEach(() => {
      origConsoleError = console.error
      origConsoleWarn = console.warn
      // eslint-disable-next-line no-console
      origConsoleInfo = console.info
    })

    afterEach(() => {
      // Restore originals so subsequent tests aren't affected
      console.error = origConsoleError
      console.warn = origConsoleWarn
      // eslint-disable-next-line no-console
      console.info = origConsoleInfo
    })

    it('overrides console.error to also call electronLog.error', () => {
      installConsoleOverrides()

      const spy = vi.spyOn(mocks.electronLog, 'error')
      console.error('test error', 42)

      expect(spy).toHaveBeenCalledWith('test error', 42)
    })

    it('overrides console.warn to also call electronLog.warn', () => {
      installConsoleOverrides()

      const spy = vi.spyOn(mocks.electronLog, 'warn')
      console.warn('test warn', { key: 'val' })

      expect(spy).toHaveBeenCalledWith('test warn', { key: 'val' })
    })

    it('overrides console.info to also call electronLog.info', () => {
      installConsoleOverrides()

      const spy = vi.spyOn(mocks.electronLog, 'info')
      console.info('test info') // eslint-disable-line no-console

      expect(spy).toHaveBeenCalledWith('test info')
    })

    it('still calls the original console.error', () => {
      const origErr = vi.fn()
      console.error = origErr

      installConsoleOverrides()
      console.error('err')

      expect(origErr).toHaveBeenCalledWith('err')
    })

    it('still calls the original console.warn', () => {
      const origWarn = vi.fn()
      console.warn = origWarn

      installConsoleOverrides()
      console.warn('warning')

      expect(origWarn).toHaveBeenCalledWith('warning')
    })

    it('still calls the original console.info', () => {
      const origInfo = vi.fn()
      console.info = origInfo // eslint-disable-line no-console

      installConsoleOverrides()
      console.info('info msg') // eslint-disable-line no-console

      expect(origInfo).toHaveBeenCalledWith('info msg')
    })
  })

  // ==================== production branch coverage ====================
  describe('console transport level (production branch)', () => {
    it('sets console level to "warn" in production', async () => {
      const origEnv = process.env['NODE_ENV']
      try {
        process.env['NODE_ENV'] = 'production'
        vi.resetModules()

        // Re-mock electron-log so the fresh import sees updated env
        vi.doMock('electron-log', () => ({
          default: {
            ...mocks.electronLog,
            transports: {
              file: { maxSize: 0, format: '' },
              console: { level: undefined as string | undefined },
            },
          },
        }))

        const freshMod = await import('../logger')
        // The module top-level sets console.level based on NODE_ENV
        expect(freshMod.log.transports.console.level).toBe('warn')
      } finally {
        process.env['NODE_ENV'] = origEnv
      }
    })
  })
})
