/**
 * Tests for openingBalanceImport helpers.
 *
 * Verifies CSV parsing, validation, column detection, and getResultMessage.
 */
import { describe, it, expect } from 'vitest'
import { parseCsvBalances, getResultMessage } from '../openingBalanceImport.helpers'

describe('parseCsvBalances', () => {
  it('parses valid CSV with required columns', () => {
    const csv = [
      'type,identifier,name,amount,debit_credit',
      'STUDENT,ADM001,Alice,5000,DEBIT',
      'STUDENT,ADM002,Bob,3000,CREDIT',
    ].join('\n')

    const { balances, error } = parseCsvBalances(csv)
    expect(error).toBeUndefined()
    expect(balances).toHaveLength(2)
    expect(balances[0]).toEqual({
      type: 'STUDENT',
      identifier: 'ADM001',
      name: 'Alice',
      amount: 5000,
      debitCredit: 'DEBIT',
    })
    expect(balances[1]!.debitCredit).toBe('CREDIT')
  })

  it('returns error for single-line file (no data rows)', () => {
    const csv = 'type,identifier,amount'
    const { balances, error } = parseCsvBalances(csv)
    expect(error).toContain('header row and at least one data row')
    expect(balances).toHaveLength(0)
  })

  it('returns error for empty input', () => {
    const { balances, error } = parseCsvBalances('')
    expect(error).toBeDefined()
    expect(balances).toHaveLength(0)
  })

  it('returns error when required columns are missing', () => {
    const csv = 'name,description\nAlice,Test'
    const { balances, error } = parseCsvBalances(csv)
    expect(error).toContain('type, identifier, amount')
    expect(balances).toHaveLength(0)
  })

  it('detects alternative column names (id, code, dc)', () => {
    const csv = [
      'type,id,amount,dc',
      'STUDENT,ADM003,2500,DEBIT',
    ].join('\n')

    const { balances } = parseCsvBalances(csv)
    expect(balances).toHaveLength(1)
    expect(balances[0]!.identifier).toBe('ADM003')
  })

  it('skips rows with non-positive amount', () => {
    const csv = [
      'type,identifier,amount',
      'STUDENT,ADM001,0',
      'STUDENT,ADM002,-100',
      'STUDENT,ADM003,500',
    ].join('\n')

    const { balances } = parseCsvBalances(csv)
    expect(balances).toHaveLength(1)
    expect(balances[0]!.identifier).toBe('ADM003')
  })

  it('skips rows with non-numeric amount', () => {
    const csv = [
      'type,identifier,amount',
      'STUDENT,ADM001,abc',
      'STUDENT,ADM002,200',
    ].join('\n')

    const { balances } = parseCsvBalances(csv)
    expect(balances).toHaveLength(1)
  })

  it('defaults type to STUDENT for unknown types', () => {
    const csv = [
      'type,identifier,amount',
      'UNKNOWN,X001,100',
    ].join('\n')

    const { balances } = parseCsvBalances(csv)
    expect(balances[0]!.type).toBe('STUDENT')
  })

  it('preserves GL_ACCOUNT type', () => {
    const csv = [
      'type,identifier,amount',
      'GL_ACCOUNT,4100,50000',
    ].join('\n')

    const { balances } = parseCsvBalances(csv)
    expect(balances[0]!.type).toBe('GL_ACCOUNT')
  })

  it('defaults debitCredit to DEBIT when dc column missing', () => {
    const csv = [
      'type,identifier,amount',
      'STUDENT,ADM001,100',
    ].join('\n')

    const { balances } = parseCsvBalances(csv)
    expect(balances[0]!.debitCredit).toBe('DEBIT')
  })

  it('handles Windows-style CRLF line endings', () => {
    const csv = 'type,identifier,amount\r\nSTUDENT,ADM001,100\r\n'
    const { balances } = parseCsvBalances(csv)
    expect(balances).toHaveLength(1)
  })

  it('skips rows with too few columns for required indexes', () => {
    const csv = [
      'type,identifier,name,amount',
      'STUDENT,ADM001,Alice,500',
      'STUDENT,ADM002',  // too few columns – should be skipped
    ].join('\n')

    const { balances } = parseCsvBalances(csv)
    expect(balances).toHaveLength(1)
    expect(balances[0]!.identifier).toBe('ADM001')
  })

  it('uses identifier as name fallback when name column is absent', () => {
    const csv = [
      'type,identifier,amount',
      'STUDENT,ADM010,750',
    ].join('\n')

    const { balances } = parseCsvBalances(csv)
    expect(balances[0]!.name).toBe('ADM010')
  })

  it('recognises debit_credit column with value starting with C as CREDIT', () => {
    const csv = [
      'type,identifier,amount,debitcredit',
      'STUDENT,ADM001,100,Credit',
    ].join('\n')

    const { balances } = parseCsvBalances(csv)
    expect(balances[0]!.debitCredit).toBe('CREDIT')
  })

  it('treats debit_credit column with value starting with D as DEBIT', () => {
    const csv = [
      'type,identifier,amount,debitcredit',
      'STUDENT,ADM001,100,Debit',
    ].join('\n')

    const { balances } = parseCsvBalances(csv)
    expect(balances[0]!.debitCredit).toBe('DEBIT')
  })

  it('detects code as alternative identifier column', () => {
    const csv = [
      'type,code,amount',
      'STUDENT,ADM099,200',
    ].join('\n')

    const { balances } = parseCsvBalances(csv)
    expect(balances[0]!.identifier).toBe('ADM099')
  })

  it('detects dc as alternative debit_credit column name', () => {
    const csv = [
      'type,identifier,amount,dc',
      'STUDENT,ADM001,100,Credit',
    ].join('\n')

    const { balances } = parseCsvBalances(csv)
    expect(balances[0]!.debitCredit).toBe('CREDIT')
  })

  it('returns error when identifier column is missing but type and amount exist', () => {
    const csv = 'type,name,amount\nSTUDENT,Alice,100'
    const { balances, error } = parseCsvBalances(csv)
    expect(error).toContain('type, identifier, amount')
    expect(balances).toHaveLength(0)
  })

  it('returns error when amount column is missing but type and identifier exist', () => {
    const csv = 'type,identifier,name\nSTUDENT,ADM001,Alice'
    const { balances, error } = parseCsvBalances(csv)
    expect(error).toContain('type, identifier, amount')
    expect(balances).toHaveLength(0)
  })

  it('skips blank lines interspersed in the CSV', () => {
    const csv = 'type,identifier,amount\n\nSTUDENT,ADM001,100\n\n'
    const { balances } = parseCsvBalances(csv)
    expect(balances).toHaveLength(1)
  })

  it('parses GL_ACCOUNT with name column and debitcredit non-C value', () => {
    const csv = [
      'type,identifier,name,amount,debitcredit',
      'GL_ACCOUNT,4100,Revenue,50000,Debit',
    ].join('\n')

    const { balances } = parseCsvBalances(csv)
    expect(balances).toHaveLength(1)
    expect(balances[0]!.type).toBe('GL_ACCOUNT')
    expect(balances[0]!.name).toBe('Revenue')
    expect(balances[0]!.debitCredit).toBe('DEBIT')
  })

  it('returns error when type column is missing but identifier and amount exist', () => {
    const csv = 'identifier,name,amount\nADM001,Alice,100'
    const { balances, error } = parseCsvBalances(csv)
    expect(error).toContain('type, identifier, amount')
    expect(balances).toHaveLength(0)
  })

  it('uses empty string fallback when name column index exceeds data columns', () => {
    // Header declares name at index 3, but data row only has 3 columns (0-2)
    const csv = [
      'type,identifier,amount,name',
      'STUDENT,ADM001,500',
    ].join('\n')

    const { balances } = parseCsvBalances(csv)
    expect(balances).toHaveLength(1)
    // cols[3] is undefined → name falls back via ?? '' to empty string
    expect(balances[0]!.name).toBe('')
  })

  it('uses empty string fallback when dc column index exceeds data columns', () => {
    // Header declares dc at index 4, but data has only 4 columns (0-3)
    const csv = [
      'type,identifier,name,amount,dc',
      'STUDENT,ADM001,Alice,500',
    ].join('\n')

    const { balances } = parseCsvBalances(csv)
    expect(balances).toHaveLength(1)
    // cols[4] is undefined → ?? '' → does not start with 'C' → defaults to DEBIT
    expect(balances[0]!.debitCredit).toBe('DEBIT')
  })

  it('uses empty string fallback when both name and dc indices exceed data columns', () => {
    const csv = [
      'type,identifier,amount,name,dc',
      'GL_ACCOUNT,4100,50000',
    ].join('\n')

    const { balances } = parseCsvBalances(csv)
    expect(balances).toHaveLength(1)
    expect(balances[0]!.type).toBe('GL_ACCOUNT')
    expect(balances[0]!.name).toBe('')
    expect(balances[0]!.debitCredit).toBe('DEBIT')
  })
})

describe('getResultMessage', () => {
  it('returns fallback for non-error values', () => {
    expect(getResultMessage('ok', 'Fallback')).toBe('Fallback')
  })

  it('extracts message from IPC failure', () => {
    expect(getResultMessage({ success: false, error: 'Bad request' }, 'Default')).toBe(
      'Bad request',
    )
  })

  it('extracts .error from plain object', () => {
    expect(getResultMessage({ error: 'Custom error' }, 'Default')).toBe('Custom error')
  })

  it('extracts .message from plain object when .error is missing', () => {
    expect(getResultMessage({ message: 'Info message' }, 'Default')).toBe('Info message')
  })

  it('returns fallback for empty object', () => {
    expect(getResultMessage({}, 'Default')).toBe('Default')
  })

  it('returns fallback when error is empty string', () => {
    expect(getResultMessage({ error: '' }, 'Default')).toBe('Default')
  })

  it('returns fallback when error is whitespace-only', () => {
    expect(getResultMessage({ error: '   ' }, 'Default')).toBe('Default')
  })

  it('returns fallback when error and message are non-string', () => {
    expect(getResultMessage({ error: 123, message: true }, 'Default')).toBe('Default')
  })

  it('returns fallback for null value', () => {
    expect(getResultMessage(null, 'Default')).toBe('Default')
  })
})
