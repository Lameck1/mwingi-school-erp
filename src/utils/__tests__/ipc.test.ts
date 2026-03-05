import { describe, it, expect } from 'vitest'

import {
  isIPCFailure,
  getIPCFailureMessage,
  unwrapIPCResult,
  unwrapArrayResult,
  type IPCFailure,
} from '../ipc'

/* ================================================================== */
/*  isIPCFailure                                                      */
/* ================================================================== */
describe('isIPCFailure', () => {
  it('returns true for { success: false }', () => {
    expect(isIPCFailure({ success: false })).toBe(true)
  })

  it('returns true when extra fields are present', () => {
    expect(isIPCFailure({ success: false, error: 'boom' })).toBe(true)
  })

  it('returns false for { success: true }', () => {
    expect(isIPCFailure({ success: true })).toBe(false)
  })

  it('returns false for null', () => {
    expect(isIPCFailure(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isIPCFailure(void 0)).toBe(false)
  })

  it('returns false for primitive string', () => {
    expect(isIPCFailure('not an object')).toBe(false)
  })

  it('returns false for a number', () => {
    expect(isIPCFailure(42)).toBe(false)
  })

  it('returns false for an array (even if element has success:false)', () => {
    expect(isIPCFailure([{ success: false }])).toBe(false)
  })

  it('returns false when success is 0 (falsy but not === false)', () => {
    expect(isIPCFailure({ success: 0 })).toBe(false)
  })

  it('returns false when success is "" (falsy but not === false)', () => {
    expect(isIPCFailure({ success: '' })).toBe(false)
  })

  it('returns false for object without success key', () => {
    expect(isIPCFailure({ error: 'oops' })).toBe(false)
  })
})

/* ================================================================== */
/*  getIPCFailureMessage                                              */
/* ================================================================== */
describe('getIPCFailureMessage', () => {
  const base: IPCFailure = { success: false }

  it('prefers .error when present', () => {
    expect(getIPCFailureMessage({ ...base, error: 'specific error' })).toBe('specific error')
  })

  it('falls through to .message when error is empty string', () => {
    expect(getIPCFailureMessage({ ...base, error: '', message: 'msg' })).toBe('msg')
  })

  it('falls through to .message when error is whitespace-only', () => {
    expect(getIPCFailureMessage({ ...base, error: '  ', message: 'msg' })).toBe('msg')
  })

  it('falls through to .errors array when both error and message are blank', () => {
    expect(getIPCFailureMessage({ ...base, errors: ['a', 'b'] })).toBe('a, b')
  })

  it('uses default fallback when nothing is set', () => {
    expect(getIPCFailureMessage(base)).toBe('Operation failed')
  })

  it('uses custom fallback', () => {
    expect(getIPCFailureMessage(base, 'custom')).toBe('custom')
  })

  it('ignores empty errors array and uses fallback', () => {
    expect(getIPCFailureMessage({ ...base, errors: [] })).toBe('Operation failed')
  })

  it('prefers error over message even when both are set', () => {
    expect(
      getIPCFailureMessage({ ...base, error: 'err', message: 'msg' }),
    ).toBe('err')
  })
})

/* ================================================================== */
/*  unwrapIPCResult                                                   */
/* ================================================================== */
describe('unwrapIPCResult', () => {
  it('returns the value when it is not a failure', () => {
    const data = { success: true, items: [1, 2, 3] }
    expect(unwrapIPCResult(data)).toBe(data)
  })

  it('returns a plain array untouched', () => {
    const arr = [1, 2, 3]
    expect(unwrapIPCResult(arr)).toBe(arr)
  })

  it('returns a string untouched', () => {
    expect(unwrapIPCResult('hello')).toBe('hello')
  })

  it('throws with .error message on IPCFailure', () => {
    const f: IPCFailure = { success: false, error: 'boom' }
    expect(() => unwrapIPCResult(f)).toThrow('boom')
  })

  it('throws with default fallback when IPCFailure has no message fields', () => {
    expect(() => unwrapIPCResult({ success: false } as IPCFailure)).toThrow('Operation failed')
  })

  it('throws with custom fallback', () => {
    expect(() => unwrapIPCResult({ success: false } as IPCFailure, 'custom fail')).toThrow('custom fail')
  })
})

/* ================================================================== */
/*  unwrapArrayResult                                                 */
/* ================================================================== */
describe('unwrapArrayResult', () => {
  it('unwraps a valid array', () => {
    expect(unwrapArrayResult([1, 2, 3])).toEqual([1, 2, 3])
  })

  it('unwraps an empty array', () => {
    expect(unwrapArrayResult([])).toEqual([])
  })

  it('throws on IPCFailure', () => {
    const f: IPCFailure = { success: false, error: 'fail' }
    expect(() => unwrapArrayResult(f)).toThrow('fail')
  })

  it('throws when resolved value is not an array', () => {
    // success: true + non-array should fail the Array.isArray check
    const obj = { success: true, data: [] } as unknown as string[]
    expect(() => unwrapArrayResult(obj)).toThrow('Expected a list response')
  })

  it('throws with custom fallback when value is not an array', () => {
    const obj = { success: true } as unknown as string[]
    expect(() => unwrapArrayResult(obj, 'custom list fail')).toThrow('custom list fail')
  })
})
