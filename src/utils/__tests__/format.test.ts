import { formatCurrency, formatCurrencyFromCents, formatDate, formatDateTime } from '../format'

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
      const result = formatCurrency(1500.50)
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
      expect(formatCurrency(NaN)).toBe('Ksh 0.00')
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
})
