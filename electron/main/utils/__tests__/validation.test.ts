import { describe, it, expect } from 'vitest'
import {
  validateAmount,
  formatFromCents,
  validateId,
  validateDate,
  validatePastOrTodayDate,
  sanitizeString,
  validatePassword,
} from '../validation'

/* ------------------------------------------------------------------ */
/*  validateAmount                                                     */
/* ------------------------------------------------------------------ */
describe('validateAmount', () => {
  it('accepts a positive integer', () => {
    const r = validateAmount(500)
    expect(r).toEqual({ success: true, data: 500 })
  })

  it('accepts a positive float and rounds to nearest integer', () => {
    const r = validateAmount(10.6)
    expect(r).toEqual({ success: true, data: 11 })
  })

  it('accepts a numeric string', () => {
    const r = validateAmount('42')
    expect(r).toEqual({ success: true, data: 42 })
  })

  it('rejects zero', () => {
    const r = validateAmount(0)
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/positive/i)
  })

  it('rejects negative numbers', () => {
    const r = validateAmount(-5)
    expect(r.success).toBe(false)
  })

  it('rejects NaN', () => {
    expect(validateAmount(Number.NaN).success).toBe(false)
  })

  it('rejects Infinity', () => {
    expect(validateAmount(Infinity).success).toBe(false)
  })

  it('rejects undefined', () => {
    // eslint-disable-next-line sonarjs/no-undefined-argument, unicorn/no-useless-undefined
    expect(validateAmount(undefined).success).toBe(false)
  })

  it('rejects null', () => {
    expect(validateAmount(null).success).toBe(false)
  })

  it('rejects non-numeric string', () => {
    expect(validateAmount('abc').success).toBe(false)
  })

  it('rejects empty string', () => {
    expect(validateAmount('').success).toBe(false)
  })

  it('rejects object', () => {
    expect(validateAmount({}).success).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  formatFromCents                                                    */
/* ------------------------------------------------------------------ */
describe('formatFromCents', () => {
  it('converts 1000 cents to 10', () => {
    expect(formatFromCents(1000)).toBe(10)
  })

  it('converts 0 cents to 0', () => {
    expect(formatFromCents(0)).toBe(0)
  })

  it('handles odd cent values', () => {
    expect(formatFromCents(1)).toBe(0.01)
  })

  it('handles negative cents', () => {
    expect(formatFromCents(-500)).toBe(-5)
  })
})

/* ------------------------------------------------------------------ */
/*  validateId                                                         */
/* ------------------------------------------------------------------ */
describe('validateId', () => {
  it('accepts a positive integer', () => {
    expect(validateId(1)).toEqual({ success: true, data: 1 })
  })

  it('accepts a positive integer as string', () => {
    expect(validateId('99')).toEqual({ success: true, data: 99 })
  })

  it('uses custom label in error', () => {
    const r = validateId(-1, 'Student ID')
    expect(r.success).toBe(false)
    expect(r.error).toContain('Student ID')
  })

  it('rejects zero', () => {
    expect(validateId(0).success).toBe(false)
  })

  it('rejects negative numbers', () => {
    expect(validateId(-3).success).toBe(false)
  })

  it('rejects floats', () => {
    expect(validateId(1.5).success).toBe(false)
  })

  it('rejects NaN', () => {
    expect(validateId(Number.NaN).success).toBe(false)
  })

  it('rejects undefined', () => {
    // eslint-disable-next-line sonarjs/no-undefined-argument, unicorn/no-useless-undefined
    expect(validateId(undefined).success).toBe(false)
  })

  it('rejects null', () => {
    expect(validateId(null).success).toBe(false)
  })

  it('rejects non-numeric string', () => {
    expect(validateId('abc').success).toBe(false)
  })

  it('rejects empty string', () => {
    expect(validateId('').success).toBe(false)
  })

  it('defaults label to "ID"', () => {
    // eslint-disable-next-line sonarjs/no-undefined-argument, unicorn/no-useless-undefined
    const r = validateId(undefined)
    expect(r.error).toContain('ID')
  })
})

/* ------------------------------------------------------------------ */
/*  validateDate                                                       */
/* ------------------------------------------------------------------ */
describe('validateDate', () => {
  it('accepts YYYY-MM-DD', () => {
    expect(validateDate('2024-01-15')).toEqual({ success: true, data: '2024-01-15' })
  })

  it('accepts YYYY-MM-DDTHH:MM', () => {
    expect(validateDate('2024-01-15T10:30')).toEqual({ success: true, data: '2024-01-15T10:30' })
  })

  it('accepts YYYY-MM-DDTHH:MM:SS', () => {
    expect(validateDate('2024-01-15T10:30:00')).toEqual({ success: true, data: '2024-01-15T10:30:00' })
  })

  it('rejects non-string', () => {
    expect(validateDate(123).success).toBe(false)
  })

  it('rejects undefined', () => {
    // eslint-disable-next-line sonarjs/no-undefined-argument, unicorn/no-useless-undefined
    expect(validateDate(undefined).success).toBe(false)
  })

  it('rejects null', () => {
    expect(validateDate(null).success).toBe(false)
  })

  it('rejects empty string', () => {
    expect(validateDate('').success).toBe(false)
  })

  it('rejects wrong format (DD-MM-YYYY)', () => {
    expect(validateDate('15-01-2024').success).toBe(false)
  })

  it('rejects random text', () => {
    expect(validateDate('not-a-date').success).toBe(false)
  })

  it('rejects partial date', () => {
    expect(validateDate('2024-01').success).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  validatePastOrTodayDate                                            */
/* ------------------------------------------------------------------ */
describe('validatePastOrTodayDate', () => {
  it('accepts a date in the past', () => {
    const r = validatePastOrTodayDate('2000-01-01')
    expect(r.success).toBe(true)
    expect(r.data).toBe('2000-01-01')
  })

  it('accepts today', () => {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const r = validatePastOrTodayDate(today)
    expect(r.success).toBe(true)
    expect(r.data).toBe(today)
  })

  it('rejects a future date', () => {
    const r = validatePastOrTodayDate('2099-12-31')
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/future/i)
  })

  it('normalizes datetime to date-only', () => {
    const r = validatePastOrTodayDate('2000-06-15T12:00:00')
    expect(r.success).toBe(true)
    expect(r.data).toBe('2000-06-15')
  })

  it('rejects invalid format (delegates to validateDate)', () => {
    const r = validatePastOrTodayDate('not-a-date')
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/Invalid date/i)
  })

  it('rejects undefined', () => {
    // eslint-disable-next-line sonarjs/no-undefined-argument, unicorn/no-useless-undefined
    expect(validatePastOrTodayDate(undefined).success).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  sanitizeString                                                     */
/* ------------------------------------------------------------------ */
describe('sanitizeString', () => {
  it('trims and returns a normal string', () => {
    expect(sanitizeString('  hello  ')).toBe('hello')
  })

  it('truncates to maxLength', () => {
    expect(sanitizeString('abcdef', 3)).toBe('abc')
  })

  it('defaults maxLength to 255', () => {
    const long = 'a'.repeat(300)
    expect(sanitizeString(long)).toHaveLength(255)
  })

  it('returns empty string for undefined', () => {
    // eslint-disable-next-line sonarjs/no-undefined-argument, unicorn/no-useless-undefined
    expect(sanitizeString(undefined)).toBe('')
  })

  it('returns empty string for null', () => {
    expect(sanitizeString(null)).toBe('')
  })

  it('returns empty string for number', () => {
    expect(sanitizeString(42)).toBe('')
  })

  it('returns empty string for boolean', () => {
    expect(sanitizeString(true)).toBe('')
  })

  it('handles empty string input', () => {
    expect(sanitizeString('')).toBe('')
  })

  it('handles string that is only whitespace', () => {
    expect(sanitizeString('   ')).toBe('')
  })
})

/* ------------------------------------------------------------------ */
/*  validatePassword                                                   */
/* ------------------------------------------------------------------ */
describe('validatePassword', () => {
  it('accepts a valid password', () => {
    const r = validatePassword('Secret12')
    expect(r).toEqual({ success: true, data: 'Secret12' })
  })

  it('rejects passwords shorter than 8 characters', () => {
    const r = validatePassword('Ab1')
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/8 characters/i)
  })

  it('rejects passwords without an uppercase letter', () => {
    const r = validatePassword('alllower1')
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/uppercase/i)
  })

  it('rejects passwords without a digit', () => {
    const r = validatePassword('NoDigitsHere')
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/digit/i)
  })

  it('rejects non-string input', () => {
    expect(validatePassword(12345678).success).toBe(false)
  })

  it('rejects undefined', () => {
    // eslint-disable-next-line sonarjs/no-undefined-argument, unicorn/no-useless-undefined
    expect(validatePassword(undefined).success).toBe(false)
  })

  it('rejects null', () => {
    expect(validatePassword(null).success).toBe(false)
  })

  it('rejects empty string', () => {
    expect(validatePassword('').success).toBe(false)
  })

  it('accepts exactly 8 characters with upper + digit', () => {
    const r = validatePassword('Abcdefg1')
    expect(r.success).toBe(true)
  })
})
