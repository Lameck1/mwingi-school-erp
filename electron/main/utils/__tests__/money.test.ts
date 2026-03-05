import { describe, it, expect } from 'vitest'

import { shillingsToCents, centsToShillings } from '../money'

describe('shillingsToCents', () => {
    it('converts 100 shillings to 10000 cents', () => {
        expect(shillingsToCents(100)).toBe(10000)
    })

    it('converts 19.99 shillings to 1999 cents', () => {
        expect(shillingsToCents(19.99)).toBe(1999)
    })

    it('converts 0.01 shillings to 1 cent', () => {
        expect(shillingsToCents(0.01)).toBe(1)
    })

    it('converts string input "100" to 10000 cents', () => {
        expect(shillingsToCents('100')).toBe(10000)
    })

    it('returns 0 for null', () => {
        expect(shillingsToCents(null)).toBe(0)
    })

    it('returns 0 for undefined', () => {
        expect(shillingsToCents(void 0)).toBe(0)
    })

    it('returns 0 for empty string', () => {
        expect(shillingsToCents('')).toBe(0)
    })

    it('returns 0 for NaN input', () => {
        expect(shillingsToCents('abc')).toBe(0)
    })

    it('handles negative values', () => {
        expect(shillingsToCents(-50)).toBe(-5000)
    })

    it('handles large values', () => {
        expect(shillingsToCents(1_000_000)).toBe(100_000_000)
    })

    it('handles floating-point precision (0.1 + 0.2)', () => {
        expect(shillingsToCents(0.1 + 0.2)).toBe(30)
    })
})

describe('centsToShillings', () => {
    it('converts 10000 cents to 100 shillings', () => {
        expect(centsToShillings(10000)).toBe(100)
    })

    it('converts 1999 cents to 19.99 shillings', () => {
        expect(centsToShillings(1999)).toBe(19.99)
    })

    it('converts 1 cent to 0.01 shillings', () => {
        expect(centsToShillings(1)).toBe(0.01)
    })

    it('returns 0 for null', () => {
        expect(centsToShillings(null)).toBe(0)
    })

    it('returns 0 for undefined', () => {
        expect(centsToShillings(void 0)).toBe(0)
    })

    it('returns 0 for empty string', () => {
        expect(centsToShillings('')).toBe(0)
    })

    it('returns 0 for NaN input', () => {
        expect(centsToShillings('xyz')).toBe(0)
    })

    it('handles negative cents', () => {
        expect(centsToShillings(-5000)).toBe(-50)
    })

    it('handles large cent values', () => {
        expect(centsToShillings(100_000_000)).toBe(1_000_000)
    })

    it('handles string cent values', () => {
        expect(centsToShillings('2500')).toBe(25)
    })
})
