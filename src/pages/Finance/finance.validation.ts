import { shillingsToCents } from '../../utils/format'

import type { Invoice } from '../../types/electron-api/FinanceAPI'

export interface PaymentSubmitValidationInput {
    selectedStudentId: number | undefined
    amountInput: string
    userId: number | undefined
    isFormBlocked: boolean
}

export interface PaymentSubmitValidationResult {
    valid: boolean
    error?: string
    amountCents?: number
}

export function validatePaymentSubmit(input: PaymentSubmitValidationInput): PaymentSubmitValidationResult {
    if (!input.selectedStudentId) {
        return { valid: false, error: 'Select a student before recording payment' }
    }
    if (input.isFormBlocked) {
        return { valid: false, error: 'Generate an invoice or override to credit before recording payment' }
    }
    if (!input.userId) {
        return { valid: false, error: 'You must be signed in to record payments' }
    }
    if (!input.amountInput.trim()) {
        return { valid: false, error: 'Payment amount is required' }
    }

    const amountCents = shillingsToCents(input.amountInput)
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
        return { valid: false, error: 'Payment amount must be greater than zero' }
    }

    return { valid: true, amountCents }
}

export function findPendingInvoice(invoices: Invoice[]): Invoice | undefined {
    return invoices.find(inv => inv.balance > 0)
}

export function validateCreditPayment(amountCents: number, creditBalance: number, hasPendingInvoice: boolean): { valid: boolean; error?: string } {
    if (!hasPendingInvoice) {
        return { valid: false, error: 'No pending invoices to pay' }
    }
    if (amountCents > creditBalance) {
        return { valid: false, error: 'Insufficient credit balance' }
    }
    return { valid: true }
}

export function canGenerateStudentInvoice(
    studentId: number | null,
    academicYearId: number | null,
    termId: number | null,
    userId: number | undefined
): { valid: boolean; error?: string } {
    if (!studentId) {
        return { valid: false, error: 'Please select a student.' }
    }
    if (!academicYearId || !termId) {
        return { valid: false, error: 'Current academic year and term must be set.' }
    }
    if (!userId) {
        return { valid: false, error: 'You must be signed in to generate invoices.' }
    }
    return { valid: true }
}
