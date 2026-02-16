import { describe, expect, it } from 'vitest'

import { parseStatementCSV, validateMatchSelection } from '../reconcile.logic'

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

    it('parses valid bank statement CSV rows into cents', () => {
        const csv = [
            'Date,Description,Debit,Credit,Reference,Running Balance',
            '2026-02-01,ATM Withdrawal,100.50,0,REF-1,1200.25',
            '2026-02-02,Deposit,0,50.00,REF-2,1250.25'
        ].join('\n')

        const result = parseStatementCSV(csv)
        expect(result.errors).toEqual([])
        expect(result.lines).toHaveLength(2)
        expect(result.lines[0].debit_amount).toBe(10050)
        expect(result.lines[1].credit_amount).toBe(5000)
        expect(result.lines[1].running_balance).toBe(125025)
    })

    it('reports row-level validation errors for invalid CSV lines', () => {
        const csv = [
            'Date,Description,Debit,Credit',
            '2026-02-01,,10,0',
            'invalid-date,Deposit,0,10',
            '2026-02-03,Bad row,10,20'
        ].join('\n')

        const result = parseStatementCSV(csv)
        expect(result.lines).toHaveLength(0)
        expect(result.errors.length).toBe(3)
        expect(result.errors[0]).toContain('description is required')
    })
})
