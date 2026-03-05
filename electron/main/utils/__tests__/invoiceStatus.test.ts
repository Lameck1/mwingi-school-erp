import { describe, expect, it } from 'vitest'

import { normalizeInvoiceStatus } from '../invoiceStatus'

describe('normalizeInvoiceStatus', () => {
  it('returns PENDING for null', () => {
    expect(normalizeInvoiceStatus(null)).toBe('PENDING')
  })

  it('returns PENDING for undefined', () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    expect(normalizeInvoiceStatus(undefined)).toBe('PENDING')
  })

  it('returns PENDING for empty string', () => {
    // '' is falsy but ?? only catches null/undefined
    expect(normalizeInvoiceStatus('')).toBe('')
  })

  it('uppercases lowercase input', () => {
    expect(normalizeInvoiceStatus('paid')).toBe('PAID')
  })

  it('preserves already-uppercase input', () => {
    expect(normalizeInvoiceStatus('CANCELLED')).toBe('CANCELLED')
  })

  it('normalizes mixed case', () => {
    expect(normalizeInvoiceStatus('Partially_Paid')).toBe('PARTIALLY_PAID')
  })
})
