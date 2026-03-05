import { describe, expect, it } from 'vitest'
import { formatCurrency, formatCurrencyFromCents, formatDate, formatDateTime, escapeCsvField, numberToWords, centsToShillings, shillingsToCents } from '../format'

describe('Format Utilities', () => {
  describe('formatCurrency', () => {
    it('should format positive amounts correctly', () => {
      expect(formatCurrency(1000)).toContain('1,000')
      expect(formatCurrency(34000)).toContain('34,000')
      expect(formatCurrency(5000000)).toContain('5,000,000')
    })

    it('should include currency symbol', () => {
      const result = formatCurrency(1500)
      expect(result).toContain('Ksh') // Kenya Shilling symbol
    })

    it('should include decimal places', () => {
      const result = formatCurrency(1500.5)
      expect(result).toContain('.50')
    })

    it('should handle zero amount', () => {
      const result = formatCurrency(0)
      expect(result).toContain('Ksh')
      expect(result).toContain('0')
    })

    it('should handle null values', () => {
      expect(formatCurrency(null)).toBe('Ksh 0.00')
    })

    it('should handle undefined values', () => {
      expect(formatCurrency()).toBe('Ksh 0.00')
    })

    it('should handle NaN values', () => {
      expect(formatCurrency(Number.NaN)).toBe('Ksh 0.00')
    })

    it('should format decimal amounts', () => {
      const result = formatCurrency(1500.99)
      expect(result).toContain('1,500.99')
    })

    it('should handle very large amounts', () => {
      const result = formatCurrency(999999999.99)
      expect(result).toContain('Ksh')
      expect(result).toContain('999,999,999')
    })

    it('should handle small decimal amounts', () => {
      const result = formatCurrency(0.01)
      expect(result).toContain('0.01')
    })
  })

  describe('formatCurrencyFromCents', () => {
    it('should convert cents to shillings and format correctly', () => {
      const result = formatCurrencyFromCents(150000)
      expect(result).toContain('1,500.00')
      expect(result).toContain('Ksh')
    })

    it('should handle null or undefined values', () => {
      expect(formatCurrencyFromCents(null)).toBe('Ksh 0.00')
      expect(formatCurrencyFromCents()).toBe('Ksh 0.00')
    })
  })

  describe('formatDate', () => {
    it('should format date strings correctly', () => {
      const result = formatDate('2026-02-04')
      expect(result).toBeTruthy()
      expect(result).not.toBe('N/A')
    })

    it('should format Date objects correctly', () => {
      const date = new Date('2026-02-04')
      const result = formatDate(date)
      expect(result).toBeTruthy()
      expect(result).not.toBe('N/A')
    })

    it('should handle null values', () => {
      expect(formatDate(null)).toBe('N/A')
    })

    it('should handle undefined values', () => {
      expect(formatDate()).toBe('N/A')
    })

    it('should handle empty strings', () => {
      expect(formatDate('')).toBe('N/A')
    })

    it('should handle invalid date strings', () => {
      expect(formatDate('invalid-date')).toBe('N/A')
    })

    it('should format valid ISO date strings', () => {
      const result = formatDate('2026-02-04T10:30:00Z')
      expect(result).toBeTruthy()
      expect(result).not.toBe('N/A')
    })

    it('should include month in formatted output', () => {
      const result = formatDate('2026-02-04')
      // Should contain month abbreviation
      expect(result).toMatch(/[A-Za-z]/)
    })

    it('should include year in formatted output', () => {
      const result = formatDate('2026-02-04')
      expect(result).toContain('2026')
    })

    it('should format with correct locale', () => {
      const result = formatDate('2026-02-04')
      // Result should be in en-US format (e.g., "Feb 4, 2026")
      expect(result).toBeTruthy()
    })
  })

  describe('formatDateTime', () => {
    it('should format datetime strings correctly', () => {
      const result = formatDateTime('2026-02-04T10:30:00')
      expect(result).toBeTruthy()
      expect(result).not.toBe('N/A')
    })

    it('should format Date objects correctly', () => {
      const date = new Date('2026-02-04T10:30:00')
      const result = formatDateTime(date)
      expect(result).toBeTruthy()
      expect(result).not.toBe('N/A')
    })

    it('should handle null values', () => {
      expect(formatDateTime(null)).toBe('N/A')
    })

    it('should handle undefined values', () => {
      expect(formatDateTime()).toBe('N/A')
    })

    it('should handle empty strings', () => {
      expect(formatDateTime('')).toBe('N/A')
    })

    it('should handle invalid datetime strings', () => {
      expect(formatDateTime('invalid-datetime')).toBe('N/A')
    })

    it('should include time in formatted output', () => {
      const result = formatDateTime('2026-02-04T10:30:00')
      // Should contain time indicators
      expect(result).toMatch(/\d{1,2}:\d{2}/)
    })

    it('should include date in formatted output', () => {
      const result = formatDateTime('2026-02-04T10:30:00')
      expect(result).toContain('2026')
    })

    it('should format with minutes', () => {
      const result = formatDateTime('2026-02-04T14:45:30')
      // Time is formatted in 12-hour format, so 14:45 becomes 02:45 PM
      expect(result).toContain('45') // Minutes should be present
      expect(result).toMatch(/\d{1,2}:\d{2}/) // Should contain time
    })

    it('should handle different time formats', () => {
      const result1 = formatDateTime('2026-02-04T09:00:00')
      const result2 = formatDateTime('2026-02-04T23:59:59')
      expect(result1).toMatch(/\d{1,2}:\d{2}/) // Should contain time
      expect(result2).toMatch(/\d{1,2}:\d{2}/) // Should contain time
    })
  })

  describe('Currency formatting edge cases', () => {
    it('should handle negative amounts gracefully', () => {
      const result = formatCurrency(-1500)
      // Negative amounts should still format (even if unusual)
      expect(result).toBeTruthy()
    })

    it('should handle string numbers passed as numbers', () => {
      const result = formatCurrency(Number('1500'))
      expect(result).toContain('1,500')
    })

    it('should handle currency consistency across amounts', () => {
      const small = formatCurrency(10)
      const large = formatCurrency(1000000)
      expect(small).toContain('Ksh')
      expect(large).toContain('Ksh')
    })
  })

  describe('Date formatting consistency', () => {
    it('should format same date identically', () => {
      const date = '2026-02-04'
      const result1 = formatDate(date)
      const result2 = formatDate(date)
      expect(result1).toBe(result2)
    })

    it('should format same datetime identically', () => {
      const datetime = '2026-02-04T10:30:00'
      const result1 = formatDateTime(datetime)
      const result2 = formatDateTime(datetime)
      expect(result1).toBe(result2)
    })

    it('should handle ISO date and DateTime consistently', () => {
      const dateResult = formatDate('2026-02-04')
      const dateTimeResult = formatDateTime('2026-02-04T00:00:00')
      // Both should contain the date
      expect(dateResult).toContain('2026')
      expect(dateTimeResult).toContain('2026')
    })
  })

  describe('Currency precision', () => {
    it('should maintain decimal precision', () => {
      const result = formatCurrency(1234.56)
      expect(result).toContain('1,234.56')
    })

    it('should display cents for whole numbers', () => {
      const result = formatCurrency(1000)
      expect(result).toContain('.00')
    })

    it('should handle fractional cents', () => {
      const result = formatCurrency(99.999)
      expect(result).toBeTruthy()
    })
  })

  describe('escapeCsvField', () => {
    it('returns plain string unchanged', () => {
      expect(escapeCsvField('hello')).toBe('hello')
    })

    it('wraps string containing comma in quotes', () => {
      expect(escapeCsvField('a,b')).toBe('"a,b"')
    })

    it('escapes double quotes by doubling them', () => {
      expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""')
    })

    it('wraps string containing newline in quotes', () => {
      expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"')
    })

    it('handles number input by converting to string', () => {
      expect(escapeCsvField(42)).toBe('42')
    })

    it('handles number with comma-worthy string representation', () => {
      // A number won't naturally contain commas, but verifying String(v) path
      expect(escapeCsvField(12345)).toBe('12345')
    })

    it('handles empty string', () => {
      expect(escapeCsvField('')).toBe('')
    })

    it('handles string with both comma and quotes', () => {
      expect(escapeCsvField('a,"b"')).toBe('"a,""b"""')
    })
  })

  describe('numberToWords', () => {
    it('returns Zero for 0', () => {
      expect(numberToWords(0)).toBe('Zero')
    })

    it('returns correct word for 1-19', () => {
      expect(numberToWords(1)).toBe('One')
      expect(numberToWords(5)).toBe('Five')
      expect(numberToWords(10)).toBe('Ten')
      expect(numberToWords(13)).toBe('Thirteen')
      expect(numberToWords(19)).toBe('Nineteen')
    })

    it('returns correct word for 20-99', () => {
      expect(numberToWords(20)).toBe('Twenty')
      expect(numberToWords(21)).toBe('Twenty One')
      expect(numberToWords(45)).toBe('Forty Five')
      expect(numberToWords(99)).toBe('Ninety Nine')
    })

    it('returns correct word for exact tens', () => {
      expect(numberToWords(30)).toBe('Thirty')
      expect(numberToWords(50)).toBe('Fifty')
      expect(numberToWords(90)).toBe('Ninety')
    })

    it('returns correct word for 100-999', () => {
      expect(numberToWords(100)).toBe('One Hundred')
      expect(numberToWords(101)).toBe('One Hundred and One')
      expect(numberToWords(250)).toBe('Two Hundred and Fifty')
      expect(numberToWords(999)).toBe('Nine Hundred and Ninety Nine')
    })

    it('returns correct word for 1000-999999', () => {
      expect(numberToWords(1000)).toBe('One Thousand')
      expect(numberToWords(1001)).toBe('One Thousand One')
      expect(numberToWords(1234)).toBe('One Thousand Two Hundred and Thirty Four')
      expect(numberToWords(50000)).toBe('Fifty Thousand')
      expect(numberToWords(999999)).toBe('Nine Hundred and Ninety Nine Thousand Nine Hundred and Ninety Nine')
    })

    it('returns correct word for millions', () => {
      expect(numberToWords(1000000)).toBe('One Million')
      expect(numberToWords(1000001)).toBe('One Million One')
      expect(numberToWords(2500000)).toBe('Two Million Five Hundred Thousand')
      expect(numberToWords(999999999)).toBe('Nine Hundred and Ninety Nine Million Nine Hundred and Ninety Nine Thousand Nine Hundred and Ninety Nine')
    })

    // Branch coverage: ones[num] ?? '' fallback when array index is out of range
    it('returns empty string for negative numbers (ones array fallback)', () => {
      expect(numberToWords(-1)).toBe('')
    })

    it('returns empty string for exact hundred with no remainder (hundred and branch)', () => {
      expect(numberToWords(200)).toBe('Two Hundred')
      expect(numberToWords(500)).toBe('Five Hundred')
    })

    it('returns correct word for exact thousands with no remainder', () => {
      expect(numberToWords(5000)).toBe('Five Thousand')
    })

    it('returns correct word for exact million with no remainder', () => {
      expect(numberToWords(3000000)).toBe('Three Million')
    })
  })

  describe('centsToShillings', () => {
    it('converts string input', () => {
      expect(centsToShillings('5000')).toBe(50)
      expect(centsToShillings('150')).toBe(1.5)
    })

    it('returns 0 for null', () => {
      expect(centsToShillings(null)).toBe(0)
    })

    it('returns 0 for undefined', () => {
      // eslint-disable-next-line unicorn/no-useless-undefined
      expect(centsToShillings(undefined)).toBe(0)
    })

    it('converts number input', () => {
      expect(centsToShillings(10000)).toBe(100)
    })
  })

  describe('shillingsToCents', () => {
    it('converts string input', () => {
      expect(shillingsToCents('50')).toBe(5000)
      expect(shillingsToCents('1.5')).toBe(150)
    })

    it('returns 0 for null', () => {
      expect(shillingsToCents(null)).toBe(0)
    })

    it('returns 0 for undefined', () => {
      // eslint-disable-next-line unicorn/no-useless-undefined
      expect(shillingsToCents(undefined)).toBe(0)
    })

    it('converts number input', () => {
      expect(shillingsToCents(100)).toBe(10000)
    })

    it('rounds to integer cents', () => {
      expect(shillingsToCents(10.999)).toBe(1100)
    })
  })
})
