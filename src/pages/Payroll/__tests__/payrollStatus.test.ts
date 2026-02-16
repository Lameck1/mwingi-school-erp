import { describe, expect, it } from 'vitest'

import { normalizePayrollStatus } from '../payrollStatus'

describe('normalizePayrollStatus', () => {
    it('returns canonical statuses unchanged', () => {
        expect(normalizePayrollStatus('DRAFT')).toBe('DRAFT')
        expect(normalizePayrollStatus('CONFIRMED')).toBe('CONFIRMED')
        expect(normalizePayrollStatus('PAID')).toBe('PAID')
    })

    it('normalizes lowercase and spaced values', () => {
        expect(normalizePayrollStatus(' confirmed ')).toBe('CONFIRMED')
        expect(normalizePayrollStatus('paid')).toBe('PAID')
    })

    it('maps legacy payroll statuses to supported UI statuses', () => {
        expect(normalizePayrollStatus('OPEN')).toBe('DRAFT')
        expect(normalizePayrollStatus('SUBMITTED')).toBe('DRAFT')
        expect(normalizePayrollStatus('APPROVED')).toBe('CONFIRMED')
        expect(normalizePayrollStatus('POSTED')).toBe('CONFIRMED')
        expect(normalizePayrollStatus('PENDING_APPROVAL')).toBe('CONFIRMED')
    })

    it('fails closed to DRAFT for unknown or invalid values', () => {
        const missingValue = ({ status: undefined } as { status?: unknown }).status
        expect(normalizePayrollStatus('UNEXPECTED')).toBe('DRAFT')
        expect(normalizePayrollStatus(missingValue)).toBe('DRAFT')
        expect(normalizePayrollStatus(null)).toBe('DRAFT')
        expect(normalizePayrollStatus(42)).toBe('DRAFT')
    })
})
