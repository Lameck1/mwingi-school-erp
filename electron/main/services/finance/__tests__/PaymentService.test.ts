import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PaymentService } from '../PaymentService'
import { getDatabase } from '../../../database'

// Mock the database
vi.mock('../../../database', () => ({
    getDatabase: vi.fn()
}))

// Mock audit log
vi.mock('../../../database/utils/audit', () => ({
    logAudit: vi.fn()
}))

describe('PaymentService', () => {
    let service: PaymentService
    let mockDb: any

    beforeEach(() => {
        mockDb = {
            prepare: vi.fn().mockReturnThis(),
            run: vi.fn().mockReturnValue({ lastInsertRowid: 1, changes: 1 }),
            get: vi.fn(),
            all: vi.fn().mockReturnValue([]),
            transaction: vi.fn((fn) => fn)
        }
        vi.mocked(getDatabase).mockReturnValue(mockDb)

        // Re-import to ensure mocks are applied
        service = new PaymentService()
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    describe('recordPayment', () => {
        it('should record a valid payment', async () => {
            mockDb.get
                .mockReturnValueOnce({ id: 1, total_amount: 50000, amount_paid: 20000, status: 'PENDING' }) // Invoice
                .mockReturnValueOnce({ is_locked: false }) // Period check
                .mockReturnValueOnce(undefined) // Receipt check

            const result = await service.recordPayment({
                student_id: 1,
                invoice_id: 1,
                amount: 15000,
                payment_method: 'CASH',
                transaction_date: '2024-01-15'
            }, 1)

            expect(result.success).toBe(true)
            expect(result.receipt_number).toBeDefined()
            expect(mockDb.run).toHaveBeenCalled()
        })

        it('should reject payment exceeding balance', async () => {
            mockDb.get.mockReturnValueOnce({ id: 1, total_amount: 50000, amount_paid: 45000, status: 'PARTIAL' }) // Invoice

            const result = await service.recordPayment({
                student_id: 1,
                invoice_id: 1,
                amount: 10000, // More than 5000 balance
                payment_method: 'CASH',
                transaction_date: '2024-01-15'
            }, 1)

            expect(result.success).toBe(false)
            expect(result.errors).toContain('Payment amount exceeds outstanding balance')
        })

        it('should reject payment in locked period', async () => {
            mockDb.get
                .mockReturnValueOnce({ id: 1, total_amount: 50000, amount_paid: 20000, status: 'PENDING' }) // Invoice
                .mockReturnValueOnce({ is_locked: true }) // Period is locked

            const result = await service.recordPayment({
                student_id: 1,
                invoice_id: 1,
                amount: 15000,
                payment_method: 'CASH',
                transaction_date: '2024-01-15'
            }, 1)

            expect(result.success).toBe(false)
            expect(result.errors?.[0]).toMatch(/locked period/i)
        })

        it('should validate required fields', async () => {
            const result = await service.recordPayment({
                student_id: 0,
                invoice_id: 0,
                amount: 0,
                payment_method: '',
                transaction_date: ''
            }, 1)

            expect(result.success).toBe(false)
            expect(result.errors?.length).toBeGreaterThan(0)
        })
    })

    describe('voidPayment', () => {
        it('should void a payment with valid reason', async () => {
            mockDb.get
                .mockReturnValueOnce({
                    id: 1,
                    is_voided: 0,
                    amount: 15000,
                    invoice_id: 1
                })
                .mockReturnValueOnce({ is_locked: false }) // Period check

            const result = await service.voidPayment(1, 'Duplicate entry', 1)

            expect(result.success).toBe(true)
            expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE ledger_transaction'))
        })

        it('should reject voiding without reason', async () => {
            const result = await service.voidPayment(1, '', 1)

            expect(result.success).toBe(false)
            expect(result.errors).toContain('Void reason is required')
        })

        it('should reject voiding already voided payment', async () => {
            mockDb.get.mockReturnValueOnce({ id: 1, is_voided: 1 })

            const result = await service.voidPayment(1, 'Test reason', 1)

            expect(result.success).toBe(false)
            expect(result.errors?.[0]).toMatch(/already voided/i)
        })
    })
})
