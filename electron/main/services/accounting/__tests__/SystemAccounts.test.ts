/**
 * Tests for SystemAccounts – verifies GL code uniqueness and key mappings.
 */
import { describe, expect, it, vi } from 'vitest'

const mockGet = vi.fn()
const mockDb = {
  prepare: vi.fn(() => ({
    get: mockGet,
  })),
}

vi.mock('../../../../main/database', () => ({
  getDatabase: () => mockDb,
}))

import { SystemAccounts, verifySystemAccounts } from '../SystemAccounts'

describe('SystemAccounts', () => {
  it('has no duplicate GL account codes', () => {
    const codes = Object.values(SystemAccounts)
    const unique = new Set(codes)
    expect(unique.size).toBe(codes.length)
  })

  it('OTHER_REVENUE is 4900', () => {
    expect(SystemAccounts.OTHER_REVENUE).toBe('4900')
  })

  it('HIRE_REVENUE is 4300', () => {
    expect(SystemAccounts.HIRE_REVENUE).toBe('4300')
  })

  it('OTHER_REVENUE and HIRE_REVENUE are distinct', () => {
    expect(SystemAccounts.OTHER_REVENUE).not.toBe(SystemAccounts.HIRE_REVENUE)
  })

  it('all account codes are 4-digit strings', () => {
    for (const [_key, code] of Object.entries(SystemAccounts)) {
      expect(code).toMatch(/^\d{4}$/)
    }
  })

  it('contains all expected account categories', () => {
    // Assets
    expect(SystemAccounts.CASH).toBe('1010')
    expect(SystemAccounts.BANK).toBe('1020')
    expect(SystemAccounts.ACCOUNTS_RECEIVABLE).toBe('1100')
    expect(SystemAccounts.INVENTORY_ASSET).toBe('1200')
    expect(SystemAccounts.FIXED_ASSET).toBe('1510')
    expect(SystemAccounts.ACCUMULATED_DEPRECIATION).toBe('1520')

    // Liabilities
    expect(SystemAccounts.ACCOUNTS_PAYABLE).toBe('2010')
    expect(SystemAccounts.STUDENT_CREDIT_BALANCE).toBe('2020')
    expect(SystemAccounts.SCHOLARSHIP_LIABILITY).toBe('2030')
    expect(SystemAccounts.SALARY_PAYABLE).toBe('2100')
    expect(SystemAccounts.PAYE_PAYABLE).toBe('2110')
    expect(SystemAccounts.NSSF_PAYABLE).toBe('2120')
    expect(SystemAccounts.NHIF_PAYABLE).toBe('2130')
    expect(SystemAccounts.HOUSING_LEVY_PAYABLE).toBe('2140')

    // Equity
    expect(SystemAccounts.RETAINED_EARNINGS).toBe('3020')

    // Revenue
    expect(SystemAccounts.TUITION_REVENUE).toBe('4010')
    expect(SystemAccounts.DONATIONS_REVENUE).toBe('4200')

    // Expenses
    expect(SystemAccounts.SALARY_EXPENSE_ACADEMIC).toBe('5010')
    expect(SystemAccounts.SALARY_EXPENSE_ADMIN).toBe('5020')
    expect(SystemAccounts.EMPLOYER_NSSF_EXPENSE).toBe('5030')
    expect(SystemAccounts.EMPLOYER_NHIF_EXPENSE).toBe('5040')
    expect(SystemAccounts.EMPLOYER_HOUSING_LEVY_EXPENSE).toBe('5050')
    expect(SystemAccounts.SCHOLARSHIP_EXPENSE).toBe('5250')
    expect(SystemAccounts.BOARDING_EXPENSE).toBe('6000')
    expect(SystemAccounts.INVENTORY_EXPENSE).toBe('6100')
    expect(SystemAccounts.DEPRECIATION_EXPENSE).toBe('5600')
  })
})

describe('verifySystemAccounts', () => {
  it('does not warn when all system accounts exist in GL', () => {
    mockGet.mockReturnValue({ id: 1 })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    verifySystemAccounts()

    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('warns when system accounts are missing from GL', () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    mockGet.mockReturnValue(undefined)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    verifySystemAccounts()

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('WARNING'),
      expect.stringContaining('CASH (1010)')
    )
    warnSpy.mockRestore()
  })

  it('warns only about specific missing accounts', () => {
    // First few accounts exist, rest missing
    let callIndex = 0
    mockGet.mockImplementation(() => {
      callIndex++
      return callIndex <= 3 ? { id: callIndex } : undefined
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    verifySystemAccounts()

    expect(warnSpy).toHaveBeenCalled()
    const warnMsg = warnSpy.mock.calls[0][1] as string
    // First 3 should not be mentioned
    expect(warnMsg).not.toContain('CASH (1010)')
    expect(warnMsg).not.toContain('BANK (1020)')
    expect(warnMsg).not.toContain('ACCOUNTS_RECEIVABLE (1100)')
    // Others should be present
    expect(warnMsg).toContain('INVENTORY_ASSET (1200)')
    warnSpy.mockRestore()
  })
})
