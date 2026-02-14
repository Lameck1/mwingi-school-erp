import { describe, expect, it } from 'vitest'

import { validateMatchSelection } from '../reconcile.logic'

describe('reconcile logic', () => {
    it('blocks matching when no statement line is selected', () => {
        const result = validateMatchSelection(null, { id: 2, transaction_date: '2026-02-14', amount: 1000 }, 1)
        expect(result.canMatch).toBe(false)
        expect(result.reason).toBe('Select a bank statement line first')
    })

    it('blocks matching when amounts exceed tolerance', () => {
        const result = validateMatchSelection(
            { id: 1, transaction_date: '2026-02-14', credit_amount: 5000, debit_amount: 0 },
            { id: 2, transaction_date: '2026-02-14', amount: 5200 },
            1
        )
        expect(result.canMatch).toBe(false)
        expect(result.reason).toContain('Amount mismatch')
    })

    it('allows matching for close amount/date candidates', () => {
        const result = validateMatchSelection(
            { id: 1, transaction_date: '2026-02-14', credit_amount: 5000, debit_amount: 0 },
            { id: 2, transaction_date: '2026-02-16', amount: 5050 },
            1
        )
        expect(result.canMatch).toBe(true)
        expect(result.reason).toBeUndefined()
    })
})
