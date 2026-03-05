import { describe, it, expect } from 'vitest'

import { normalizePayrollStatus, type PayrollUiStatus } from '../payrollStatus'
import { getHistoryStatusColor, getConfirmDialogCopy } from '../payrollHelpers'

/* ================================================================== */
/*  normalizePayrollStatus                                            */
/* ================================================================== */
describe('normalizePayrollStatus', () => {
  const cases: [unknown, PayrollUiStatus][] = [
    ['DRAFT', 'DRAFT'],
    ['OPEN', 'DRAFT'],
    ['SUBMITTED', 'DRAFT'],
    ['CONFIRMED', 'CONFIRMED'],
    ['APPROVED', 'CONFIRMED'],
    ['POSTED', 'CONFIRMED'],
    ['PENDING_APPROVAL', 'CONFIRMED'],
    ['PAID', 'PAID'],
  ]

  it.each(cases)('maps %s → %s', (input, expected) => {
    expect(normalizePayrollStatus(input)).toBe(expected)
  })

  it('is case-insensitive', () => {
    expect(normalizePayrollStatus('paid')).toBe('PAID')
    expect(normalizePayrollStatus('Confirmed')).toBe('CONFIRMED')
  })

  it('trims whitespace', () => {
    expect(normalizePayrollStatus('  PAID  ')).toBe('PAID')
  })

  it('returns DRAFT for non-string input', () => {
    expect(normalizePayrollStatus(null)).toBe('DRAFT')
    expect(normalizePayrollStatus(void 0)).toBe('DRAFT')
    expect(normalizePayrollStatus(42)).toBe('DRAFT')
  })

  it('returns DRAFT for unknown status string', () => {
    expect(normalizePayrollStatus('CANCELLED')).toBe('DRAFT')
  })
})

/* ================================================================== */
/*  getHistoryStatusColor                                             */
/* ================================================================== */
describe('getHistoryStatusColor', () => {
  it('returns emerald classes for PAID', () => {
    expect(getHistoryStatusColor('PAID')).toContain('emerald')
  })

  it('returns blue classes for CONFIRMED', () => {
    expect(getHistoryStatusColor('CONFIRMED')).toContain('blue')
  })

  it('returns amber classes for DRAFT / unknown', () => {
    expect(getHistoryStatusColor('DRAFT')).toContain('amber')
    expect(getHistoryStatusColor('ANYTHING')).toContain('amber')
  })

  it('handles non-string input gracefully', () => {
    expect(getHistoryStatusColor(null)).toContain('amber')
  })
})

/* ================================================================== */
/*  getConfirmDialogCopy                                              */
/* ================================================================== */
describe('getConfirmDialogCopy', () => {
  it('returns null for null action', () => {
    expect(getConfirmDialogCopy(null, 5, 'Jan 2025')).toBeNull()
  })

  it('returns correct copy for confirm action', () => {
    const result = getConfirmDialogCopy('confirm', 10, 'Jan 2025')
    expect(result).not.toBeNull()
    expect(result!.title).toBe('Confirm Payroll')
    expect(result!.confirmLabel).toBe('Confirm Payroll')
  })

  it('interpolates staffCount in markPaid message', () => {
    const result = getConfirmDialogCopy('markPaid', 23, 'Feb 2025')
    expect(result!.message).toContain('23')
    expect(result!.message).toContain('Feb 2025')
  })

  it('uses fallback period for markPaid when periodName is undefined', () => {
    const result = getConfirmDialogCopy('markPaid', 5)
    expect(result!.message).toContain('this period')
  })

  it('returns correct copy for revert', () => {
    const result = getConfirmDialogCopy('revert', 1, 'Mar 2025')
    expect(result!.title).toBe('Revert Payroll to Draft')
  })

  it('returns correct copy for delete', () => {
    const result = getConfirmDialogCopy('delete', 1, 'Apr 2025')
    expect(result!.title).toBe('Delete Draft Payroll')
    expect(result!.message).toContain('Apr 2025')
  })

  it('uses fallback period for delete when periodName is undefined', () => {
    const result = getConfirmDialogCopy('delete', 1)
    expect(result!.message).toContain('this payroll')
  })

  it('returns correct copy for recalculate', () => {
    const result = getConfirmDialogCopy('recalculate', 1, 'May 2025')
    expect(result!.title).toBe('Recalculate Payroll')
  })

  it('returns correct copy for bulkNotify', () => {
    const result = getConfirmDialogCopy('bulkNotify', 15, 'Jun 2025')
    expect(result!.message).toContain('15')
    expect(result!.message).toContain('Jun 2025')
  })
})
