import { describe, expect, it } from 'vitest'

import { canGenerateStudentInvoice, findPendingInvoice, validateCreditPayment, validatePaymentSubmit } from '../finance.validation'

import type { Invoice } from '../../../types/electron-api/FinanceAPI'

describe('finance validation logic', () => {
    it('rejects payment submit when form is blocked by invoice guard', () => {
        const result = validatePaymentSubmit({
            selectedStudentId: 10,
            amountInput: '2500',
            userId: 1,
            isFormBlocked: true
        })
        expect(result.valid).toBe(false)
        expect(result.error).toContain('Generate an invoice')
    })

    it('rejects payment submit when amount is zero or invalid', () => {
        const result = validatePaymentSubmit({
            selectedStudentId: 10,
            amountInput: '0',
            userId: 1,
            isFormBlocked: false
        })
        expect(result.valid).toBe(false)
        expect(result.error).toContain('greater than zero')
    })

    it('returns amount cents on valid payment submit', () => {
        const result = validatePaymentSubmit({
            selectedStudentId: 10,
            amountInput: '12.34',
            userId: 1,
            isFormBlocked: false
        })
        expect(result.valid).toBe(true)
        expect(result.amountCents).toBe(1234)
    })

    it('finds first pending invoice with positive balance', () => {
        const invoices = [
            { id: 1, balance: 0 },
            { id: 2, balance: 1200 }
        ] as Invoice[]
        const pending = findPendingInvoice(invoices)
        expect(pending?.id).toBe(2)
    })

    it('validates credit payment constraints', () => {
        expect(validateCreditPayment(500, 1000, true).valid).toBe(true)
        expect(validateCreditPayment(500, 1000, false).valid).toBe(false)
        expect(validateCreditPayment(1500, 1000, true).valid).toBe(false)
    })

    it('validates invoice generation context completeness', () => {
        expect(canGenerateStudentInvoice(null, 1, 1, 2).valid).toBe(false)
        expect(canGenerateStudentInvoice(1, null, 1, 2).valid).toBe(false)
        expect(canGenerateStudentInvoice(1, 1, 1).valid).toBe(false)
        expect(canGenerateStudentInvoice(1, 1, 1, 2).valid).toBe(true)
    })
})
