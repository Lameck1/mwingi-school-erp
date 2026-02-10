/**
 * Additional Utilities Tests
 * Tests for email validation, date calculations, GPA calculations, and helper functions
 */

describe('Email Validation Utilities', () => {
  const validateEmail = (email: string): boolean => {
    if (email.length === 0 || email.includes(' ')) {
      return false
    }

    const atIndex = email.indexOf('@')
    if (atIndex <= 0 || atIndex !== email.lastIndexOf('@')) {
      return false
    }

    const domain = email.slice(atIndex + 1)
    if (domain.length === 0 || domain.startsWith('.') || domain.endsWith('.')) {
      return false
    }

    return domain.includes('.')
  }

  describe('Email Format Validation', () => {
    it('should validate correct email addresses', () => {
      expect(validateEmail('user@example.com')).toBe(true)
      expect(validateEmail('john.doe@school.ac.ke')).toBe(true)
      expect(validateEmail('admin+tag@organization.org')).toBe(true)
    })

    it('should reject invalid email formats', () => {
      expect(validateEmail('invalid.email')).toBe(false)
      expect(validateEmail('@example.com')).toBe(false)
      expect(validateEmail('user@.com')).toBe(false)
      expect(validateEmail('user@example')).toBe(false)
    })

    it('should reject empty email', () => {
      expect(validateEmail('')).toBe(false)
    })

    it('should reject emails with spaces', () => {
      expect(validateEmail('user @example.com')).toBe(false)
      expect(validateEmail('user@ example.com')).toBe(false)
    })

    it('should handle email addresses with subdomains', () => {
      expect(validateEmail('user@mail.example.com')).toBe(true)
      expect(validateEmail('user@sub.mail.example.com')).toBe(true)
    })

    it('should handle emails with hyphens and underscores', () => {
      expect(validateEmail('user-name@example.com')).toBe(true)
      expect(validateEmail('user_name@example.com')).toBe(true)
      expect(validateEmail('user-name_123@example.com')).toBe(true)
    })

    it('should reject multiple @ symbols', () => {
      expect(validateEmail('user@@example.com')).toBe(false)
      expect(validateEmail('user@exam@ple.com')).toBe(false)
    })
  })
})

describe('Date Calculation Utilities', () => {
  const getDaysBetween = (startDate: Date, endDate: Date): number => {
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime())
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  const getTermDays = (termStart: Date, termEnd: Date): number => {
    return Math.floor((termEnd.getTime() - termStart.getTime()) / (1000 * 60 * 60 * 24))
  }

  const getTermProgress = (termStart: Date, currentDate: Date, termEnd: Date): number => {
    const totalDays = getTermDays(termStart, termEnd)
    const elapsedDays = getTermDays(termStart, currentDate)
    return Math.round((elapsedDays / totalDays) * 100)
  }

  describe('Days Between Calculation', () => {
    it('should calculate days between two dates correctly', () => {
      const start = new Date('2026-01-01')
      const end = new Date('2026-01-11')
      expect(getDaysBetween(start, end)).toBe(10)
    })

    it('should handle same date', () => {
      const date = new Date('2026-01-01')
      expect(getDaysBetween(date, date)).toBe(0)
    })

    it('should return positive value regardless of order', () => {
      const date1 = new Date('2026-01-01')
      const date2 = new Date('2026-01-10')
      expect(getDaysBetween(date1, date2)).toBe(getDaysBetween(date2, date1))
    })

    it('should handle month boundaries', () => {
      const jan31 = new Date('2026-01-31')
      const feb01 = new Date('2026-02-01')
      expect(getDaysBetween(jan31, feb01)).toBe(1)
    })

    it('should handle year boundaries', () => {
      const dec31 = new Date('2025-12-31')
      const jan01 = new Date('2026-01-01')
      expect(getDaysBetween(dec31, jan01)).toBe(1)
    })
  })

  describe('Term Days Calculation', () => {
    it('should calculate term length correctly', () => {
      const termStart = new Date('2026-01-05')
      const termEnd = new Date('2026-04-03')
      const days = getTermDays(termStart, termEnd)
      expect(days).toBeGreaterThan(80)
      expect(days).toBeLessThan(90)
    })

    it('should handle full term duration', () => {
      const termStart = new Date('2026-01-01')
      const termEnd = new Date('2026-03-31')
      const days = getTermDays(termStart, termEnd)
      expect(days).toBe(89)
    })
  })

  describe('Term Progress Calculation', () => {
    it('should calculate term progress percentage', () => {
      const termStart = new Date('2026-01-05')
      const termEnd = new Date('2026-04-03')
      const midTerm = new Date('2026-02-20')
      const progress = getTermProgress(termStart, midTerm, termEnd)
      expect(progress).toBeGreaterThan(40)
      expect(progress).toBeLessThan(60)
    })

    it('should return 0% at term start', () => {
      const termStart = new Date('2026-01-05')
      const termEnd = new Date('2026-04-03')
      const progress = getTermProgress(termStart, termStart, termEnd)
      expect(progress).toBe(0)
    })

    it('should return 100% at term end', () => {
      const termStart = new Date('2026-01-05')
      const termEnd = new Date('2026-04-03')
      const progress = getTermProgress(termStart, termEnd, termEnd)
      expect(progress).toBe(100)
    })
  })
})

describe('GPA Calculation Utilities', () => {
  const calculateGPA = (marks: number[], maxMark: number = 100): number => {
    if (marks.length === 0) {return 0}
    const sum = marks.reduce((a, b) => a + b, 0)
    const average = sum / marks.length
    // Convert to 4.0 scale
    return (average / maxMark) * 4
  }

  const calculateWeightedGPA = (
    subjects: Array<{ mark: number; weight: number }>,
    maxMark: number = 100
  ): number => {
    if (subjects.length === 0) {return 0}
    const totalWeight = subjects.reduce((sum, s) => sum + s.weight, 0)
    const weightedSum = subjects.reduce((sum, s) => sum + (s.mark * s.weight) / maxMark, 0)
    return (weightedSum / totalWeight) * 4
  }

  const getGradeFromGPA = (gpa: number): string => {
    if (gpa >= 3.5) {return 'A'}
    if (gpa >= 3.0) {return 'B'}
    if (gpa >= 2.5) {return 'C'}
    if (gpa >= 2.0) {return 'D'}
    return 'E'
  }

  describe('GPA Calculation', () => {
    it('should calculate GPA from marks', () => {
      const marks = [85, 90, 80, 75, 92]
      const gpa = calculateGPA(marks)
      // Average = (85+90+80+75+92)/5 = 84.4, GPA = (84.4/100)*4.0 = 3.376
      expect(gpa).toBeCloseTo(3.376, 2)
    })

    it('should return 0 for empty marks array', () => {
      const gpa = calculateGPA([])
      expect(gpa).toBe(0)
    })

    it('should handle perfect marks', () => {
      const marks = [100, 100, 100]
      const gpa = calculateGPA(marks)
      expect(gpa).toBe(4)
    })

    it('should handle minimum marks', () => {
      const marks = [0, 0, 0]
      const gpa = calculateGPA(marks)
      expect(gpa).toBe(0)
    })

    it('should calculate GPA on custom scale', () => {
      const marks = [40, 50, 45] // out of 50
      const gpa = calculateGPA(marks, 50)
      expect(gpa).toBeCloseTo(3.6, 1)
    })
  })

  describe('Weighted GPA Calculation', () => {
    it('should calculate weighted GPA', () => {
      const subjects = [
        { mark: 85, weight: 3 },
        { mark: 90, weight: 2 },
        { mark: 80, weight: 1 }
      ]
      const gpa = calculateWeightedGPA(subjects)
      expect(gpa).toBeGreaterThan(3)
      expect(gpa).toBeLessThan(4)
    })

    it('should handle equal weights', () => {
      const subjects = [
        { mark: 80, weight: 1 },
        { mark: 80, weight: 1 }
      ]
      const gpa = calculateWeightedGPA(subjects)
      expect(gpa).toBeCloseTo(3.2, 1)
    })

    it('should return 0 for empty subjects', () => {
      const gpa = calculateWeightedGPA([])
      expect(gpa).toBe(0)
    })

    it('should prioritize higher weighted subjects', () => {
      const subjects1 = [
        { mark: 100, weight: 1 },
        { mark: 0, weight: 3 }
      ]
      const subjects2 = [
        { mark: 100, weight: 3 },
        { mark: 0, weight: 1 }
      ]
      const gpa1 = calculateWeightedGPA(subjects1)
      const gpa2 = calculateWeightedGPA(subjects2)
      expect(gpa2).toBeGreaterThan(gpa1)
    })
  })

  describe('Grade Assignment from GPA', () => {
    it('should assign grade A for high GPA', () => {
      expect(getGradeFromGPA(3.8)).toBe('A')
      expect(getGradeFromGPA(4)).toBe('A')
    })

    it('should assign grade B for good GPA', () => {
      expect(getGradeFromGPA(3.2)).toBe('B')
      expect(getGradeFromGPA(3)).toBe('B')
    })

    it('should assign grade C for average GPA', () => {
      expect(getGradeFromGPA(2.7)).toBe('C')
      expect(getGradeFromGPA(2.5)).toBe('C')
    })

    it('should assign grade D for low GPA', () => {
      expect(getGradeFromGPA(2.2)).toBe('D')
      expect(getGradeFromGPA(2.0)).toBe('D')
    })

    it('should assign grade E for failing GPA', () => {
      expect(getGradeFromGPA(1.5)).toBe('E')
      expect(getGradeFromGPA(0)).toBe('E')
    })

    it('should handle boundary values', () => {
      expect(getGradeFromGPA(3.5)).toBe('A')
      expect(getGradeFromGPA(3.49)).toBe('B')
    })
  })
})

describe('String and Number Utilities', () => {
  const truncateString = (str: string, maxLength: number, suffix: string = '...'): string => {
    if (str.length <= maxLength) {return str}
    return str.substring(0, maxLength - suffix.length) + suffix
  }

  const padNumber = (num: number, length: number): string => {
    return String(num).padStart(length, '0')
  }

  const formatPercentage = (value: number, decimals: number = 1): string => {
    return `${(value * 100).toFixed(decimals)}%`
  }

  describe('String Truncation', () => {
    it('should not truncate short strings', () => {
      expect(truncateString('Hello', 10)).toBe('Hello')
    })

    it('should truncate long strings', () => {
      const result = truncateString('This is a long string', 10)
      expect(result.length).toBeLessThanOrEqual(10)
      expect(result).toContain('...')
    })

    it('should use custom suffix', () => {
      const result = truncateString('Hello World', 8, '>')
      expect(result).toContain('>')
    })
  })

  describe('Number Padding', () => {
    it('should pad numbers with leading zeros', () => {
      expect(padNumber(5, 3)).toBe('005')
      expect(padNumber(42, 4)).toBe('0042')
    })

    it('should not pad if number is longer', () => {
      expect(padNumber(12345, 3)).toBe('12345')
    })

    it('should handle zero', () => {
      expect(padNumber(0, 3)).toBe('000')
    })
  })

  describe('Percentage Formatting', () => {
    it('should format decimals as percentages', () => {
      expect(formatPercentage(0.5)).toBe('50.0%')
      expect(formatPercentage(0.85)).toBe('85.0%')
    })

    it('should handle decimal places', () => {
      expect(formatPercentage(0.333, 2)).toBe('33.30%')
      expect(formatPercentage(0.6667, 3)).toBe('66.670%')
    })

    it('should handle 0 and 1', () => {
      expect(formatPercentage(0)).toBe('0.0%')
      expect(formatPercentage(1)).toBe('100.0%')
    })
  })
})

describe('Array Utilities', () => {
  const sum = (arr: number[]): number => arr.reduce((a, b) => a + b, 0)
  const average = (arr: number[]): number => (arr.length === 0 ? 0 : sum(arr) / arr.length)
  const median = (arr: number[]): number => {
    if (arr.length === 0) {return 0}
    const sorted = [...arr].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  }

  describe('Array Sum and Average', () => {
    it('should calculate sum correctly', () => {
      expect(sum([1, 2, 3, 4, 5])).toBe(15)
      expect(sum([10, 20, 30])).toBe(60)
    })

    it('should handle empty arrays', () => {
      expect(sum([])).toBe(0)
    })

    it('should calculate average correctly', () => {
      expect(average([10, 20, 30])).toBe(20)
      expect(average([85, 90, 95])).toBe(90)
    })

    it('should return 0 average for empty array', () => {
      expect(average([])).toBe(0)
    })
  })

  describe('Median Calculation', () => {
    it('should calculate median for odd length arrays', () => {
      expect(median([1, 2, 3, 4, 5])).toBe(3)
      expect(median([10, 40, 20, 50, 30])).toBe(30)
    })

    it('should calculate median for even length arrays', () => {
      expect(median([1, 2, 3, 4])).toBe(2.5)
      expect(median([10, 20, 30, 40])).toBe(25)
    })

    it('should handle single element', () => {
      expect(median([42])).toBe(42)
    })

    it('should return 0 for empty array', () => {
      expect(median([])).toBe(0)
    })
  })
})
