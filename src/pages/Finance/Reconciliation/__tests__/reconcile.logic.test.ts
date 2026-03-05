import { describe, expect, it } from 'vitest'

import { parseStatementCSV, validateMatchSelection } from '../reconcile.logic'

describe('reconcile logic', () => {
    /* ── validateMatchSelection ─────────────────────────── */

    it('blocks matching when no account is selected', () => {
        const result = validateMatchSelection(
            { id: 1, transaction_date: '2026-02-14', credit_amount: 5000, debit_amount: 0 },
            { id: 2, transaction_date: '2026-02-14', amount: 5000 },
            null
        )
        expect(result.canMatch).toBe(false)
        expect(result.reason).toBe('Select a bank account first')
    })

    it('blocks matching when no statement line is selected', () => {
        const result = validateMatchSelection(null, { id: 2, transaction_date: '2026-02-14', amount: 1000 }, 1)
        expect(result.canMatch).toBe(false)
        expect(result.reason).toBe('Select a bank statement line first')
    })

    it('blocks matching when no ledger transaction is selected', () => {
        const result = validateMatchSelection(
            { id: 1, transaction_date: '2026-02-14', credit_amount: 5000, debit_amount: 0 },
            null,
            1
        )
        expect(result.canMatch).toBe(false)
        expect(result.reason).toBe('Select a ledger transaction to match')
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

    it('blocks matching when date exceeds tolerance', () => {
        const result = validateMatchSelection(
            { id: 1, transaction_date: '2026-02-01', credit_amount: 5000, debit_amount: 0 },
            { id: 2, transaction_date: '2026-02-20', amount: 5000 },
            1,
            100,
            7
        )
        expect(result.canMatch).toBe(false)
        expect(result.reason).toContain('Date mismatch')
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

    /* ── parseStatementCSV ──────────────────────────────── */

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

    it('returns error when CSV has fewer than 2 rows', () => {
        const result = parseStatementCSV('Date,Description,Debit,Credit')
        expect(result.lines).toHaveLength(0)
        expect(result.errors[0]).toContain('header row and at least one data row')
    })

    it('returns error when required columns are missing', () => {
        const csv = 'Foo,Bar\nval1,val2'
        const result = parseStatementCSV(csv)
        expect(result.lines).toHaveLength(0)
        expect(result.errors[0]).toContain('date, description')
    })

    it('handles CSV with quoted fields containing commas and escaped quotes', () => {
        const csv = [
            'Date,Description,Debit,Credit',
            '2026-02-01,"Withdrawal, ATM ""Main Branch""",100,0'
        ].join('\n')
        const result = parseStatementCSV(csv)
        expect(result.errors).toEqual([])
        expect(result.lines).toHaveLength(1)
        expect(result.lines[0].description).toBe('Withdrawal, ATM "Main Branch"')
    })

    it('reports error for invalid debit/credit amounts', () => {
        const csv = [
            'Date,Description,Debit,Credit',
            '2026-02-01,Test,abc,0'
        ].join('\n')
        const result = parseStatementCSV(csv)
        expect(result.errors.length).toBeGreaterThan(0)
    })

    it('reports error when both debit and credit are positive', () => {
        const csv = [
            'Date,Description,Debit,Credit',
            '2026-02-01,Mixed,100,200'
        ].join('\n')
        const result = parseStatementCSV(csv)
        expect(result.errors[0]).toContain('exactly one of debit or credit')
    })

    it('reports error when both debit and credit are zero', () => {
        const csv = [
            'Date,Description,Debit,Credit',
            '2026-02-01,Zero,0,0'
        ].join('\n')
        const result = parseStatementCSV(csv)
        expect(result.errors[0]).toContain('exactly one of debit or credit')
    })

    it('reports error for invalid running balance', () => {
        const csv = [
            'Date,Description,Debit,Credit,Running Balance',
            '2026-02-01,Test,100,0,not-a-number'
        ].join('\n')
        const result = parseStatementCSV(csv)
        expect(result.errors[0]).toContain('invalid running balance')
    })

    it('handles CSV with only debit column (no credit)', () => {
        const csv = [
            'Date,Description,Debit',
            '2026-02-01,Payment,500'
        ].join('\n')
        const result = parseStatementCSV(csv)
        expect(result.lines).toHaveLength(1)
        expect(result.lines[0].debit_amount).toBe(50000)
        expect(result.lines[0].credit_amount).toBe(0)
    })

    it('handles amounts with currency symbols and commas', () => {
        const csv = [
            'Date,Description,Debit,Credit',
            '2026-02-01,Deposit,0,"$1,234.56"'
        ].join('\n')
        const result = parseStatementCSV(csv)
        expect(result.errors).toEqual([])
        expect(result.lines[0].credit_amount).toBe(123456)
    })

    it('handles invalid date', () => {
        const csv = [
            'Date,Description,Debit,Credit',
            'not-a-date,Test,100,0'
        ].join('\n')
        const result = parseStatementCSV(csv)
        expect(result.errors[0]).toContain('invalid transaction date')
    })

    it('handles empty CSV', () => {
        const result = parseStatementCSV('')
        expect(result.lines).toHaveLength(0)
        expect(result.errors[0]).toContain('header row')
    })

    it('handles alternative column names (narration, withdrawal, deposit)', () => {
        const csv = [
            'TransactionDate,Narration,Withdrawal,Deposit,Ref',
            '2026-02-01,Salary,0,80000,SAL-001'
        ].join('\n')
        const result = parseStatementCSV(csv)
        expect(result.errors).toEqual([])
        expect(result.lines).toHaveLength(1)
        expect(result.lines[0].reference).toBe('SAL-001')
    })

    it('returns null reference when reference column exists but cell is empty', () => {
        const csv = 'Date,Description,Debit,Credit,Reference\n2026-02-01,Test Payment,100,0,'
        const result = parseStatementCSV(csv)
        expect(result.errors).toEqual([])
        expect(result.lines).toHaveLength(1)
        expect(result.lines[0].reference).toBeNull()
    })

    it('validateMatchSelection with credit_amount: 0 uses fallback', () => {
        const result = validateMatchSelection(
            { id: 1, transaction_date: '2026-02-14', credit_amount: 0, debit_amount: 500 },
            { id: 2, transaction_date: '2026-02-14', amount: 500 },
            1
        )
        expect(result.canMatch).toBe(true)
    })

    it('handles CSV with only credit column (no debit)', () => {
        const csv = 'Date,Description,Credit\n2026-02-01,Deposit,500'
        const result = parseStatementCSV(csv)
        expect(result.errors).toEqual([])
        expect(result.lines).toHaveLength(1)
        expect(result.lines[0].credit_amount).toBe(50000)
        expect(result.lines[0].debit_amount).toBe(0)
    })

    it('reports error for row with date but empty description', () => {
        const csv = 'Date,Description,Debit\n2026-02-01,,100'
        const result = parseStatementCSV(csv)
        expect(result.errors.length).toBe(1)
        expect(result.errors[0]).toContain('description is required')
    })

    /* ── Branch coverage: empty date cell → || '' fallback and !rawDate branch ── */
    it('reports error when date cell is empty (triggers || "" fallback on date)', () => {
        const csv = 'Date,Description,Debit,Credit\n,Test transaction,100,0'
        const result = parseStatementCSV(csv)
        expect(result.errors[0]).toContain('transaction date is required')
    })

    /* ── Branch coverage: unparseable debit amount triggers null from parseAmountToCents ── */
    it('reports error when debit amount parses to NaN (e.g. "..")', () => {
        const csv = 'Date,Description,Debit,Credit\n2026-02-01,Test,..,0'
        const result = parseStatementCSV(csv)
        expect(result.errors[0]).toContain('invalid debit or credit amount')
    })

    /* ── Branch coverage: empty debit cell when debit column exists → || '' fallback ── */
    it('handles empty debit cell when debit column exists', () => {
        const csv = 'Date,Description,Debit,Credit\n2026-02-01,Test payment,,100'
        const result = parseStatementCSV(csv)
        expect(result.errors).toEqual([])
        expect(result.lines).toHaveLength(1)
        expect(result.lines[0].debit_amount).toBe(0)
        expect(result.lines[0].credit_amount).toBe(10000)
    })

    /* ── Branch coverage: empty running balance cell → || '' fallback on running balance ── */
    it('handles empty running balance cell when column is present', () => {
        const csv = 'Date,Description,Debit,Credit,Running Balance\n2026-02-01,Test,100,0,'
        const result = parseStatementCSV(csv)
        expect(result.errors).toEqual([])
        expect(result.lines).toHaveLength(1)
        expect(result.lines[0].running_balance).toBe(0)
    })

    /* ── Branch coverage: validateMatchSelection with amount=0 on transaction → || 0 ── */
    it('validateMatchSelection handles zero amount on transaction (|| 0 fallback)', () => {
        const result = validateMatchSelection(
            { id: 1, transaction_date: '2026-02-14', credit_amount: 0, debit_amount: 0 },
            { id: 2, transaction_date: '2026-02-14', amount: 0 },
            1
        )
        expect(result.canMatch).toBe(true)
    })

    /* ── Branch coverage: validateMatchSelection with undefined properties ── */
    it('validateMatchSelection handles undefined credit_amount/debit_amount/amount', () => {
        const result = validateMatchSelection(
            { id: 1, transaction_date: '2026-02-14' } as any,
            { id: 2, transaction_date: '2026-02-14' } as any,
            1
        )
        // All amounts default to 0 via || 0, difference is 0 → within tolerance
        expect(result.canMatch).toBe(true)
    })

    /* ── Branch coverage: empty credit cell when credit column exists → || '' fallback ── */
    it('handles empty credit cell when credit column exists', () => {
        const csv = 'Date,Description,Debit,Credit\n2026-02-01,Test,100,'
        const result = parseStatementCSV(csv)
        expect(result.errors).toEqual([])
        expect(result.lines).toHaveLength(1)
        expect(result.lines[0].debit_amount).toBe(10000)
        expect(result.lines[0].credit_amount).toBe(0)
    })

    /* ── Branch coverage: credit amount NaN triggers null (L115) ── */
    it('reports error when credit amount parses to NaN', () => {
        const csv = 'Date,Description,Debit,Credit\n2026-02-01,Test,0,..'
        const result = parseStatementCSV(csv)
        expect(result.errors[0]).toContain('invalid debit or credit amount')
    })
})
