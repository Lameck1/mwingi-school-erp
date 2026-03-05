/**
 * Tests for shared constants.
 *
 * Verifies that all constant objects have expected shapes,
 * no undefined values, and key enums are exhaustive.
 */
import { describe, it, expect } from 'vitest'
import {
  TRANSACTION_TYPES,
  STUDENT_TYPES,
  STUDENT_TYPES_LIST,
  INVOICE_STATUS,
  PAYMENT_METHODS,
  USER_ROLES,
  PAYROLL_STATUS,
  STOCK_MOVEMENT_TYPES,
} from '../constants'

describe('TRANSACTION_TYPES', () => {
  it('contains all expected transaction types', () => {
    expect(TRANSACTION_TYPES.FEE_PAYMENT).toBe('FEE_PAYMENT')
    expect(TRANSACTION_TYPES.DONATION).toBe('DONATION')
    expect(TRANSACTION_TYPES.GRANT).toBe('GRANT')
    expect(TRANSACTION_TYPES.EXPENSE).toBe('EXPENSE')
    expect(TRANSACTION_TYPES.SALARY_PAYMENT).toBe('SALARY_PAYMENT')
    expect(TRANSACTION_TYPES.REFUND).toBe('REFUND')
    expect(TRANSACTION_TYPES.OPENING_BALANCE).toBe('OPENING_BALANCE')
    expect(TRANSACTION_TYPES.ADJUSTMENT).toBe('ADJUSTMENT')
    expect(TRANSACTION_TYPES.INCOME).toBe('INCOME')
  })

  it('has no undefined values', () => {
    for (const value of Object.values(TRANSACTION_TYPES)) {
      expect(value).toBeDefined()
      expect(typeof value).toBe('string')
    }
  })
})

describe('STUDENT_TYPES', () => {
  it('contains DAY_SCHOLAR and BOARDER', () => {
    expect(STUDENT_TYPES.DAY_SCHOLAR).toBe('DAY_SCHOLAR')
    expect(STUDENT_TYPES.BOARDER).toBe('BOARDER')
  })

  it('STUDENT_TYPES_LIST matches Object.values', () => {
    expect(STUDENT_TYPES_LIST).toEqual(Object.values(STUDENT_TYPES))
    expect(STUDENT_TYPES_LIST).toHaveLength(2)
  })
})

describe('INVOICE_STATUS', () => {
  it('has all expected statuses', () => {
    expect(Object.values(INVOICE_STATUS)).toEqual(
      expect.arrayContaining(['PENDING', 'PARTIAL', 'PAID', 'CANCELLED']),
    )
  })

  it('has exactly 4 statuses', () => {
    expect(Object.keys(INVOICE_STATUS)).toHaveLength(4)
  })
})

describe('PAYMENT_METHODS', () => {
  it('has all expected methods', () => {
    expect(PAYMENT_METHODS.CASH).toBe('CASH')
    expect(PAYMENT_METHODS.MPESA).toBe('MPESA')
    expect(PAYMENT_METHODS.BANK_TRANSFER).toBe('BANK_TRANSFER')
    expect(PAYMENT_METHODS.CHEQUE).toBe('CHEQUE')
  })
})

describe('USER_ROLES', () => {
  it('contains ADMIN, ACCOUNTS_CLERK, and AUDITOR', () => {
    expect(USER_ROLES.ADMIN).toBe('ADMIN')
    expect(USER_ROLES.ACCOUNTS_CLERK).toBe('ACCOUNTS_CLERK')
    expect(USER_ROLES.AUDITOR).toBe('AUDITOR')
  })

  it('has exactly 3 roles', () => {
    expect(Object.keys(USER_ROLES)).toHaveLength(3)
  })
})

describe('PAYROLL_STATUS', () => {
  it('has DRAFT, CONFIRMED, PAID', () => {
    expect(Object.values(PAYROLL_STATUS)).toEqual(
      expect.arrayContaining(['DRAFT', 'CONFIRMED', 'PAID']),
    )
  })
})

describe('STOCK_MOVEMENT_TYPES', () => {
  it('has IN, OUT, ADJUSTMENT', () => {
    expect(STOCK_MOVEMENT_TYPES.IN).toBe('IN')
    expect(STOCK_MOVEMENT_TYPES.OUT).toBe('OUT')
    expect(STOCK_MOVEMENT_TYPES.ADJUSTMENT).toBe('ADJUSTMENT')
  })

  it('no values are undefined or empty', () => {
    for (const value of Object.values(STOCK_MOVEMENT_TYPES)) {
      expect(value).toBeTruthy()
    }
  })
})
