/**
 * Tests for scholarship-normalization.
 *
 * Pure functions — no DB or mocks needed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  extractLegacyUserId,
  normalizeAllocationData,
  normalizeScholarshipData,
} from '../scholarship-normalization'

/* ── Freeze Date for todayIsoDate determinism ────────────────────── */
const FIXED_DATE = '2025-06-15'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${FIXED_DATE}T00:00:00Z`))
})

/* ==================================================================
 *  normalizeScholarshipData
 * ================================================================== */
describe('normalizeScholarshipData', () => {
  it('passes modern payload through correctly', () => {
    const input = {
      name: 'Merit Award',
      description: 'Top students',
      scholarship_type: 'MERIT' as const,
      amount: 50000,
      max_beneficiaries: 10,
      eligibility_criteria: 'GPA >= 3.5',
      valid_from: '2025-01-01',
      valid_to: '2025-12-31',
    }

    const result = normalizeScholarshipData(input)
    expect(result.name).toBe('Merit Award')
    expect(result.amount).toBe(50000)
    expect(result.valid_from).toBe('2025-01-01')
    expect(result.valid_to).toBe('2025-12-31')
  })

  it('normalizes legacy field names', () => {
    const legacy = {
      name: 'Legacy Scholarship',
      description: 'Old format',
      type: 'NEED_BASED',
      totalAmount: 30000,
      maxBeneficiaries: 5,
      eligibilityCriteria: 'Income < 50k',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    }

    const result = normalizeScholarshipData(legacy)
    expect(result.scholarship_type).toBe('NEED_BASED')
    expect(result.amount).toBe(30000)
    expect(result.max_beneficiaries).toBe(5)
    expect(result.eligibility_criteria).toBe('Income < 50k')
    expect(result.valid_from).toBe('2024-01-01')
    expect(result.valid_to).toBe('2024-12-31')
  })

  it('falls back to camelCase date fields', () => {
    const legacy = {
      name: 'Test',
      description: 'desc',
      validFrom: '2024-06-01',
      validTo: '2024-06-30',
    }

    const result = normalizeScholarshipData(legacy)
    expect(result.valid_from).toBe('2024-06-01')
    expect(result.valid_to).toBe('2024-06-30')
  })

  it('uses total_amount as amount fallback', () => {
    const result = normalizeScholarshipData({ name: 'X', total_amount: 7500 } as never)
    expect(result.amount).toBe(7500)
  })

  it('defaults missing fields to sensible values', () => {
    const result = normalizeScholarshipData({} as never)
    expect(result.name).toBe('')
    expect(result.description).toBe('')
    expect(result.scholarship_type).toBe('MERIT')
    expect(result.amount).toBe(0)
    expect(result.max_beneficiaries).toBe(9999)
    expect(result.eligibility_criteria).toBe('')
    expect(result.valid_from).toBe(FIXED_DATE)
    expect(result.valid_to).toBe(FIXED_DATE)
  })

  it('includes optional percentage when present', () => {
    const result = normalizeScholarshipData({ name: 'X', percentage: 50 } as never)
    expect(result.percentage).toBe(50)
  })

  it('includes optional sponsor fields when present', () => {
    const result = normalizeScholarshipData({
      name: 'Sponsored',
      sponsor_name: 'UNICEF',
      sponsor_contact: '+254712345678',
    } as never)
    expect(result.sponsor_name).toBe('UNICEF')
    expect(result.sponsor_contact).toBe('+254712345678')
  })

  it('ignores non-string/non-number values', () => {
    const result = normalizeScholarshipData({
      name: 123, // not a string
      amount: 'not a number',
    } as never)
    expect(result.name).toBe('')
    expect(result.amount).toBe(0)
  })
})

/* ==================================================================
 *  normalizeAllocationData
 * ================================================================== */
describe('normalizeAllocationData', () => {
  it('passes modern payload through', () => {
    const input = {
      scholarship_id: 1,
      student_id: 42,
      amount_allocated: 25000,
      allocation_notes: 'Term 1',
      effective_date: '2025-01-15',
    }
    const result = normalizeAllocationData(input)
    expect(result).toEqual(input)
  })

  it('normalizes legacy camelCase fields', () => {
    const legacy = {
      scholarshipId: 2,
      studentId: 33,
      amount: 15000,
      notes: 'Legacy note',
      allocationDate: '2024-09-01',
    }
    const result = normalizeAllocationData(legacy)
    expect(result.scholarship_id).toBe(2)
    expect(result.student_id).toBe(33)
    expect(result.amount_allocated).toBe(15000)
    expect(result.allocation_notes).toBe('Legacy note')
    expect(result.effective_date).toBe('2024-09-01')
  })

  it('defaults missing fields', () => {
    const result = normalizeAllocationData({} as never)
    expect(result.scholarship_id).toBe(0)
    expect(result.student_id).toBe(0)
    expect(result.amount_allocated).toBe(0)
    expect(result.allocation_notes).toBe('')
    expect(result.effective_date).toBe(FIXED_DATE)
  })
})

/* ==================================================================
 *  extractLegacyUserId
 * ================================================================== */
describe('extractLegacyUserId', () => {
  it('extracts userId', () => {
    expect(extractLegacyUserId({ userId: 5 })).toBe(5)
  })

  it('extracts user_id', () => {
    expect(extractLegacyUserId({ user_id: 7 })).toBe(7)
  })

  it('prefers userId over user_id', () => {
    expect(extractLegacyUserId({ userId: 3, user_id: 9 })).toBe(3)
  })

  it('returns undefined when no userId', () => {
    expect(extractLegacyUserId({})).toBeUndefined()
  })

  it('ignores non-number values', () => {
    expect(extractLegacyUserId({ userId: 'abc' })).toBeUndefined()
  })

  it('ignores NaN and Infinity', () => {
    expect(extractLegacyUserId({ userId: Number.NaN })).toBeUndefined()
    expect(extractLegacyUserId({ userId: Infinity })).toBeUndefined()
  })
})

describe('edge cases for toNumber / toStringValue', () => {
  it('treats whitespace-only strings as empty', () => {
    const result = normalizeScholarshipData({ name: '   ', description: '  ' } as never)
    expect(result.name).toBe('')
    expect(result.description).toBe('')
  })

  it('treats NaN and Infinity amounts as missing', () => {
    const result = normalizeScholarshipData({ name: 'X', amount: Number.NaN } as never)
    expect(result.amount).toBe(0)
    const result2 = normalizeScholarshipData({ name: 'X', amount: Infinity } as never)
    expect(result2.amount).toBe(0)
  })

  it('firstNumber selects second value when first is invalid', () => {
    // totalAmount is NaN, total_amount is valid → picks total_amount
    const result = normalizeScholarshipData({
      name: 'X',
      totalAmount: Number.NaN,
      total_amount: 42000,
    } as never)
    expect(result.amount).toBe(42000)
  })

  it('percentage is excluded when undefined', () => {
    const result = normalizeScholarshipData({ name: 'X' } as never)
    expect(result.percentage).toBeUndefined()
  })

  it('sponsor fields are excluded when empty strings', () => {
    const result = normalizeScholarshipData({
      name: 'X',
      sponsor_name: '',
      sponsor_contact: '',
    } as never)
    expect(result.sponsor_name).toBeUndefined()
    expect(result.sponsor_contact).toBeUndefined()
  })
})
