import { describe, it, expect } from 'vitest'

import { normalizeFilters } from '../filters'

describe('normalizeFilters', () => {
  /* ----- empty string → undefined ----- */
  it('converts empty string to undefined', () => {
    const result = normalizeFilters({ search: '' })
    expect(result.search).toBeUndefined()
  })

  /* ----- numeric ID coercion ----- */
  it('converts numeric string to number when key ends in Id', () => {
    const result = normalizeFilters({ categoryId: '5' })
    expect(result.categoryId).toBe(5)
  })

  it('converts numeric string to number when key ends in id (case-insensitive)', () => {
    const result = normalizeFilters({ studentid: '12' })
    expect(result.studentid).toBe(12)
  })

  it('converts numeric string to number when key ends in Year', () => {
    const result = normalizeFilters({ academicYear: '2025' })
    expect(result.academicYear).toBe(2025)
  })

  it('preserves non-numeric string even if key ends in Id', () => {
    const result = normalizeFilters({ categoryId: 'abc' })
    expect(result.categoryId).toBe('abc')
  })

  /* ----- preserves valid types ----- */
  it('preserves boolean values', () => {
    const result = normalizeFilters({ isActive: true })
    expect(result.isActive).toBe(true)
  })

  it('preserves numeric values directly', () => {
    const result = normalizeFilters({ amount: 100 })
    expect(result.amount).toBe(100)
  })

  it('preserves non-empty strings that are not Id/Year keys', () => {
    const result = normalizeFilters({ search: 'chalk' })
    expect(result.search).toBe('chalk')
  })

  /* ----- multiple keys combined ----- */
  it('handles mixed keys correctly', () => {
    const result = normalizeFilters({
      search: '',
      categoryId: '3',
      isActive: true,
      name: 'test',
    })
    expect(result).toEqual({
      search: undefined,
      categoryId: 3,
      isActive: true,
      name: 'test',
    })
  })

  /* ----- edge: zero string key ending in Id ----- */
  it('converts "0" to 0 for Id key', () => {
    const result = normalizeFilters({ termId: '0' })
    expect(result.termId).toBe(0)
  })

  /* ----- edge: empty object ----- */
  it('returns empty object for empty input', () => {
    expect(normalizeFilters({})).toEqual({})
  })
})
