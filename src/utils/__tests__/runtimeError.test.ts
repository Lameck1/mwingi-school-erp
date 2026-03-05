import { describe, it, expect, vi, beforeEach } from 'vitest'

import { toErrorMessage, reportRuntimeError } from '../runtimeError'

/* ================================================================== */
/*  toErrorMessage                                                    */
/* ================================================================== */
describe('toErrorMessage', () => {
  it('extracts message from Error instance', () => {
    expect(toErrorMessage(new Error('boom'))).toBe('boom')
  })

  it('returns the string itself when given a non-empty string', () => {
    expect(toErrorMessage('explicit msg')).toBe('explicit msg')
  })

  it('returns fallback for empty Error message', () => {
    const emptyErr = new Error('test'); emptyErr.message = ''
    expect(toErrorMessage(emptyErr, 'fb')).toBe('fb')
  })

  it('returns fallback for whitespace-only Error message', () => {
    expect(toErrorMessage(new Error('   '), 'fb')).toBe('fb')
  })

  it('returns fallback for empty string', () => {
    expect(toErrorMessage('', 'fb')).toBe('fb')
  })

  it('returns fallback for whitespace-only string', () => {
    expect(toErrorMessage('   ', 'fb')).toBe('fb')
  })

  it('returns default fallback for null', () => {
    expect(toErrorMessage(null)).toBe('Unexpected error')
  })

  it('returns default fallback for undefined', () => {
    expect(toErrorMessage(void 0)).toBe('Unexpected error')
  })

  it('returns custom fallback for non-Error objects', () => {
    expect(toErrorMessage({ code: 42 }, 'custom')).toBe('custom')
  })

  it('returns default fallback for a number', () => {
    expect(toErrorMessage(123)).toBe('Unexpected error')
  })
})

/* ================================================================== */
/*  reportRuntimeError                                                */
/* ================================================================== */
describe('reportRuntimeError', () => {
  const ctx = { area: 'Inventory', action: 'loadItems' }

  beforeEach(() => {
    vi.restoreAllMocks()
    // Remove electronAPI between tests
    delete (globalThis as Record<string, unknown>).electronAPI
  })

  it('returns the extracted error message', () => {
    const msg = reportRuntimeError(new Error('db timeout'), ctx, 'fallback')
    expect(msg).toBe('db timeout')
  })

  it('logs composed message to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    reportRuntimeError(new Error('db timeout'), ctx, 'fallback')
    expect(spy).toHaveBeenCalledWith(
      '[Inventory] loadItems: db timeout',
      expect.any(Error),
    )
  })

  it('returns fallback when error is unrecognisable', () => {
    const msg = reportRuntimeError(42, ctx, 'fallback')
    expect(msg).toBe('fallback')
  })

  it('calls electronAPI.system.logError when available', () => {
    const logError = vi.fn().mockResolvedValue(null)
    ;(globalThis as Record<string, unknown>).electronAPI = { system: { logError } }

    vi.spyOn(console, 'error').mockImplementation(() => {})
    reportRuntimeError(new Error('err'), ctx, 'fb')

    expect(logError).toHaveBeenCalledTimes(1)
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: '[Inventory] loadItems: err',
        timestamp: expect.any(String),
      }),
    )
  })

  it('does not throw when electronAPI is missing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => reportRuntimeError('oops', ctx, 'fb')).not.toThrow()
  })

  it('includes Error stack in logError payload', () => {
    const logError = vi.fn().mockResolvedValue(null)
    ;(globalThis as Record<string, unknown>).electronAPI = { system: { logError } }

    vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = new Error('with stack')
    reportRuntimeError(err, ctx, 'fb')

    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ stack: err.stack }),
    )
  })

  it('serialises non-Error values as stack fallback', () => {
    const logError = vi.fn().mockResolvedValue(null)
    ;(globalThis as Record<string, unknown>).electronAPI = { system: { logError } }

    vi.spyOn(console, 'error').mockImplementation(() => {})
    reportRuntimeError({ code: 42 }, ctx, 'fb')

    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ stack: JSON.stringify({ code: 42 }) }),
    )
  })

  it('falls back to String() when JSON.stringify throws (circular ref)', () => {
    const logError = vi.fn().mockResolvedValue(null)
    ;(globalThis as Record<string, unknown>).electronAPI = { system: { logError } }

    vi.spyOn(console, 'error').mockImplementation(() => {})
    const circular: Record<string, unknown> = { a: 1 }
    circular.self = circular

    reportRuntimeError(circular, ctx, 'fb')

    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ stack: expect.stringContaining('[object Object]') }),
    )
  })
})
