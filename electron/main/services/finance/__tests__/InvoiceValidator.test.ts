import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Database } from 'better-sqlite3'

import { InvoiceValidator } from '../InvoiceValidator'

// Mock the database module
vi.mock('../../../database', () => ({
    getDatabase: vi.fn()
}))

// Mock the feeInvoiceSql module
vi.mock('../../../utils/feeInvoiceSql', () => ({
    buildFeeInvoiceOutstandingBalanceSql: vi.fn(() => 'fi.total_amount - fi.amount_paid'),
    buildFeeInvoiceOutstandingStatusPredicate: vi.fn(() => "fi.status IN ('PENDING','PARTIAL','OUTSTANDING')")
}))

function createMockDb(invoices: Array<Record<string, unknown>> = []) {
    return {
        prepare: vi.fn(() => ({
            all: vi.fn(() => invoices),
            get: vi.fn(),
            run: vi.fn()
        }))
    } as unknown as Database
}

describe('InvoiceValidator', () => {
    let mockDb: ReturnType<typeof createMockDb>

    beforeEach(() => {
        vi.clearAllMocks()
        mockDb = createMockDb()
    })

    describe('validatePaymentAgainstInvoices – invalid amounts', () => {
        it('rejects negative amount', () => {
            const validator = new InvoiceValidator(mockDb as any)
            const result = validator.validatePaymentAgainstInvoices(1, -100)
            expect(result.valid).toBe(false)
            expect(result.message).toContain('positive number')
        })

        it('rejects zero amount', () => {
            const validator = new InvoiceValidator(mockDb as any)
            const result = validator.validatePaymentAgainstInvoices(1, 0)
            expect(result.valid).toBe(false)
            expect(result.message).toContain('positive number')
        })

        it('rejects NaN amount', () => {
            const validator = new InvoiceValidator(mockDb as any)
            const result = validator.validatePaymentAgainstInvoices(1, Number.NaN)
            expect(result.valid).toBe(false)
            expect(result.message).toContain('positive number')
        })

        it('rejects Infinity amount', () => {
            const validator = new InvoiceValidator(mockDb as any)
            const result = validator.validatePaymentAgainstInvoices(1, Infinity)
            expect(result.valid).toBe(false)
            expect(result.message).toContain('positive number')
        })

        it('rejects negative Infinity amount', () => {
            const validator = new InvoiceValidator(mockDb as any)
            const result = validator.validatePaymentAgainstInvoices(1, -Infinity)
            expect(result.valid).toBe(false)
            expect(result.message).toContain('positive number')
        })
    })

    describe('validatePaymentAgainstInvoices – no outstanding invoices', () => {
        it('returns valid with empty invoices when none outstanding', () => {
            const validator = new InvoiceValidator(mockDb as any)
            const result = validator.validatePaymentAgainstInvoices(1, 5000)
            expect(result.valid).toBe(true)
            expect(result.message).toContain('No outstanding invoices')
            expect(result.invoices).toEqual([])
        })
    })

    describe('validatePaymentAgainstInvoices – normal payment', () => {
        it('returns valid when payment is within outstanding balance', () => {
            const invoices = [
                { id: 1, student_id: 1, total_amount: 50000, amount_paid: 0, status: 'OUTSTANDING', outstanding_balance: 50000 }
            ]
            mockDb = createMockDb(invoices)
            const validator = new InvoiceValidator(mockDb as any)
            const result = validator.validatePaymentAgainstInvoices(1, 10000)
            expect(result.valid).toBe(true)
            expect(result.message).toContain('outstanding invoice')
        })

        it('returns valid when payment equals outstanding balance', () => {
            const invoices = [
                { id: 1, student_id: 1, total_amount: 50000, amount_paid: 0, status: 'OUTSTANDING', outstanding_balance: 50000 }
            ]
            mockDb = createMockDb(invoices)
            const validator = new InvoiceValidator(mockDb as any)
            const result = validator.validatePaymentAgainstInvoices(1, 50000)
            expect(result.valid).toBe(true)
            expect(result.message).toContain('outstanding invoice')
        })

        it('includes invoices in result', () => {
            const invoices = [
                { id: 1, student_id: 1, total_amount: 30000, amount_paid: 10000, status: 'PARTIAL', outstanding_balance: 20000 },
                { id: 2, student_id: 1, total_amount: 25000, amount_paid: 0, status: 'OUTSTANDING', outstanding_balance: 25000 }
            ]
            mockDb = createMockDb(invoices)
            const validator = new InvoiceValidator(mockDb as any)
            const result = validator.validatePaymentAgainstInvoices(1, 10000)
            expect(result.invoices).toHaveLength(2)
        })
    })

    describe('validatePaymentAgainstInvoices – overpayment', () => {
        it('returns valid with overpayment message when amount exceeds total outstanding', () => {
            const invoices = [
                { id: 1, student_id: 1, total_amount: 50000, amount_paid: 40000, status: 'PARTIAL', outstanding_balance: 10000 }
            ]
            mockDb = createMockDb(invoices)
            const validator = new InvoiceValidator(mockDb as any)
            const result = validator.validatePaymentAgainstInvoices(1, 20000)
            expect(result.valid).toBe(true)
            expect(result.message).toContain('Overpayment')
        })

        it('returns invoices even with overpayment', () => {
            const invoices = [
                { id: 1, student_id: 1, total_amount: 10000, amount_paid: 5000, status: 'PARTIAL', outstanding_balance: 5000 }
            ]
            mockDb = createMockDb(invoices)
            const validator = new InvoiceValidator(mockDb as any)
            const result = validator.validatePaymentAgainstInvoices(1, 99999)
            expect(result.invoices).toHaveLength(1)
        })
    })

    describe('validatePaymentAgainstInvoices – DB error', () => {
        it('throws wrapped error when DB query fails', () => {
            const dbWithError = {
                prepare: vi.fn(() => ({
                    all: vi.fn(() => { throw new Error('disk I/O error') }),
                    get: vi.fn(),
                    run: vi.fn()
                }))
            } as unknown as Database

            const validator = new InvoiceValidator(dbWithError as any)
            expect(() => validator.validatePaymentAgainstInvoices(1, 5000))
                .toThrow('Failed to validate payment: disk I/O error')
        })

        it('wraps unknown error messages', () => {
            const dbWithError = {
                prepare: vi.fn(() => ({
                    all: vi.fn(() => { throw new Error('SQLITE_BUSY') }),
                    get: vi.fn(),
                    run: vi.fn()
                }))
            } as unknown as Database

            const validator = new InvoiceValidator(dbWithError as any)
            expect(() => validator.validatePaymentAgainstInvoices(1, 1000))
                .toThrow('Failed to validate payment')
        })
    })

    describe('validatePaymentAgainstInvoices – null/undefined outstanding_balance', () => {
        it('treats null outstanding_balance as 0', () => {
            const invoices = [
                { id: 1, student_id: 1, total_amount: 50000, amount_paid: 0, status: 'OUTSTANDING', outstanding_balance: null }
            ]
            mockDb = createMockDb(invoices)
            const validator = new InvoiceValidator(mockDb as any)
            // With outstanding_balance=null → totalOutstanding = 0 → any positive payment is overpayment
            const result = validator.validatePaymentAgainstInvoices(1, 100)
            expect(result.valid).toBe(true)
            expect(result.message).toContain('Overpayment')
        })

        it('treats undefined outstanding_balance as 0', () => {
            const invoices = [
                { id: 1, student_id: 1, total_amount: 50000, amount_paid: 0, status: 'OUTSTANDING' }
            ]
            mockDb = createMockDb(invoices)
            const validator = new InvoiceValidator(mockDb as any)
            const result = validator.validatePaymentAgainstInvoices(1, 100)
            expect(result.valid).toBe(true)
            expect(result.message).toContain('Overpayment')
        })

        it('calculates correct total outstanding across multiple invoices', () => {
            const invoices = [
                { id: 1, student_id: 1, total_amount: 20000, amount_paid: 5000, status: 'PARTIAL', outstanding_balance: 15000 },
                { id: 2, student_id: 1, total_amount: 30000, amount_paid: 0, status: 'OUTSTANDING', outstanding_balance: 30000 }
            ]
            mockDb = createMockDb(invoices)
            const validator = new InvoiceValidator(mockDb as any)
            // Total outstanding = 15000 + 30000 = 45000; payment = 44000 < 45000
            const result = validator.validatePaymentAgainstInvoices(1, 44000)
            expect(result.valid).toBe(true)
            expect(result.message).toContain('2 outstanding invoice')
        })

        it('handles negative outstanding_balance as 0 via Math.max', () => {
            const invoices = [
                { id: 1, student_id: 1, total_amount: 50000, amount_paid: 60000, status: 'PARTIAL', outstanding_balance: -10000 }
            ]
            mockDb = createMockDb(invoices)
            const validator = new InvoiceValidator(mockDb as any)
            // Math.max(-10000, 0) = 0 → overpayment
            const result = validator.validatePaymentAgainstInvoices(1, 100)
            expect(result.valid).toBe(true)
            expect(result.message).toContain('Overpayment')
        })
    })

    // ── Branch coverage: constructor getDatabase() fallback (L20) ──
    describe('constructor – getDatabase fallback', () => {
        it('uses getDatabase() when no db argument is provided', () => {
            // getDatabase mock (vi.fn()) returns undefined — exercises the || getDatabase() branch
            const validator = new InvoiceValidator()
            // The early-return path doesn't touch db, so undefined db is fine
            const result = validator.validatePaymentAgainstInvoices(1, -1)
            expect(result.valid).toBe(false)
            expect(result.message).toContain('positive number')
        })
    })
})
