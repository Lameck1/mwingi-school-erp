import { describe, it, expect } from 'vitest'
import {
  REPORT_INCOME_TRANSACTION_TYPES,
  REPORT_EXPENSE_TRANSACTION_TYPES,
  OUTSTANDING_INVOICE_STATUSES,
  STUDENT_COLLECTION_TRANSACTION_TYPES,
  asSqlInList,
} from '../financeTransactionTypes'

/* ------------------------------------------------------------------ */
/*  Exported constants                                                 */
/* ------------------------------------------------------------------ */
describe('REPORT_INCOME_TRANSACTION_TYPES', () => {
  it('contains the expected values', () => {
    expect(REPORT_INCOME_TRANSACTION_TYPES).toEqual(['INCOME', 'FEE_PAYMENT', 'DONATION', 'GRANT'])
  })

  it('is readonly (tuple)', () => {
    // TypeScript enforces `as const`, but at runtime we can verify length is stable
    expect(REPORT_INCOME_TRANSACTION_TYPES).toHaveLength(4)
  })
})

describe('REPORT_EXPENSE_TRANSACTION_TYPES', () => {
  it('contains the expected values', () => {
    expect(REPORT_EXPENSE_TRANSACTION_TYPES).toEqual(['EXPENSE', 'SALARY_PAYMENT', 'REFUND'])
  })

  it('has length 3', () => {
    expect(REPORT_EXPENSE_TRANSACTION_TYPES).toHaveLength(3)
  })
})

describe('OUTSTANDING_INVOICE_STATUSES', () => {
  it('contains the expected values', () => {
    expect(OUTSTANDING_INVOICE_STATUSES).toEqual(['PENDING', 'PARTIAL', 'OUTSTANDING'])
  })

  it('has length 3', () => {
    expect(OUTSTANDING_INVOICE_STATUSES).toHaveLength(3)
  })
})

describe('STUDENT_COLLECTION_TRANSACTION_TYPES', () => {
  it('contains the expected values', () => {
    expect(STUDENT_COLLECTION_TRANSACTION_TYPES).toEqual(['FEE_PAYMENT', 'PAYMENT', 'CREDIT'])
  })

  it('has length 3', () => {
    expect(STUDENT_COLLECTION_TRANSACTION_TYPES).toHaveLength(3)
  })
})

/* ------------------------------------------------------------------ */
/*  asSqlInList                                                        */
/* ------------------------------------------------------------------ */
describe('asSqlInList', () => {
  it('wraps each value in single quotes and joins with commas', () => {
    expect(asSqlInList(['A', 'B', 'C'])).toBe("'A', 'B', 'C'")
  })

  it('works with a single-element array', () => {
    expect(asSqlInList(['ONLY'])).toBe("'ONLY'")
  })

  it('returns empty string for an empty array', () => {
    expect(asSqlInList([])).toBe('')
  })

  it('works with the exported income constants', () => {
    const result = asSqlInList(REPORT_INCOME_TRANSACTION_TYPES)
    expect(result).toBe("'INCOME', 'FEE_PAYMENT', 'DONATION', 'GRANT'")
  })

  it('works with the exported expense constants', () => {
    const result = asSqlInList(REPORT_EXPENSE_TRANSACTION_TYPES)
    expect(result).toBe("'EXPENSE', 'SALARY_PAYMENT', 'REFUND'")
  })

  it('works with the outstanding invoice statuses', () => {
    const result = asSqlInList(OUTSTANDING_INVOICE_STATUSES)
    expect(result).toBe("'PENDING', 'PARTIAL', 'OUTSTANDING'")
  })

  it('works with the student collection types', () => {
    const result = asSqlInList(STUDENT_COLLECTION_TRANSACTION_TYPES)
    expect(result).toBe("'FEE_PAYMENT', 'PAYMENT', 'CREDIT'")
  })

  it('preserves values with special characters', () => {
    expect(asSqlInList(["it's", 'a "test"'])).toBe("'it's', 'a \"test\"'")
  })
})
