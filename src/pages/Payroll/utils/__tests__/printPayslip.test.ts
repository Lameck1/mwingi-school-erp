// @vitest-environment jsdom
/**
 * Tests for printPayslipForStaff utility.
 *
 * Covers: successful payslip print, missing ID, null payslip data, and data mapping.
 */
import { describe, expect, it, vi } from 'vitest'

import { printPayslipForStaff } from '../printPayslip'

function makePayslipData() {
  return {
    period_name: 'Jan 2026',
    earnings: {
      basic_salary: 50000,
      gross_pay: 60000,
      allowances: [{ name: 'Housing', amount: 5000 }, { name: 'Transport', amount: 5000 }],
    },
    deductions: {
      total_deductions: 8000,
      items: [{ name: 'PAYE', amount: 5000 }, { name: 'NSSF', amount: 3000 }],
    },
    net_pay: 52000,
    school_name: 'Test School',
  }
}

describe('printPayslipForStaff', () => {
  it('throws when staffEntry has no id', async () => {
    const generatePayslip = vi.fn()
    const printDoc = vi.fn()

    await expect(
      printPayslipForStaff(
        { staff_name: 'Alice' },
        'Jan 2026',
        generatePayslip,
        printDoc,
        {}
      )
    ).rejects.toThrow('Cannot print draft payslip without an ID')

    expect(generatePayslip).not.toHaveBeenCalled()
    expect(printDoc).not.toHaveBeenCalled()
  })

  it('returns early when generatePayslip returns null', async () => {
    const generatePayslip = vi.fn().mockResolvedValue(null)
    const printDoc = vi.fn()

    await printPayslipForStaff(
      { id: 1, staff_name: 'Alice' },
      'Jan 2026',
      generatePayslip,
      printDoc,
      {}
    )

    expect(generatePayslip).toHaveBeenCalledWith(1)
    expect(printDoc).not.toHaveBeenCalled()
  })

  it('calls printDocument with correct payslip data', async () => {
    const payslipData = makePayslipData()
    const generatePayslip = vi.fn().mockResolvedValue(payslipData)
    const printDoc = vi.fn()

    await printPayslipForStaff(
      { id: 42, staff_name: 'Bob' },
      'Jan 2026',
      generatePayslip,
      printDoc,
      { school_motto: 'Learn' }
    )

    expect(generatePayslip).toHaveBeenCalledWith(42)
    expect(printDoc).toHaveBeenCalledTimes(1)

    const callArg = printDoc.mock.calls[0][0]
    expect(callArg.title).toBe('Payslip - Bob - Jan 2026')
    expect(callArg.template).toBe('payslip')
    expect(callArg.data.periodName).toBe('Jan 2026')
    expect(callArg.data.basicSalary).toBe(50000)
    expect(callArg.data.grossSalary).toBe(60000)
    expect(callArg.data.netSalary).toBe(52000)
    expect(callArg.data.totalDeductions).toBe(8000)
    expect(callArg.data.allowancesList).toHaveLength(2)
    expect(callArg.data.deductionsList).toHaveLength(2)
    expect(callArg.schoolSettings.schoolName).toBe('Test School')
    expect(callArg.schoolSettings.school_motto).toBe('Learn')
  })

  it('handles null selectedPeriodName gracefully', async () => {
    const payslipData = makePayslipData()
    const generatePayslip = vi.fn().mockResolvedValue(payslipData)
    const printDoc = vi.fn()

    await printPayslipForStaff(
      { id: 1, staff_name: 'Alice' },
      null,
      generatePayslip,
      printDoc,
      {}
    )

    const callArg = printDoc.mock.calls[0][0]
    expect(callArg.title).toBe('Payslip - Alice - ')
  })

  it('handles undefined selectedPeriodName gracefully', async () => {
    const payslipData = makePayslipData()
    const generatePayslip = vi.fn().mockResolvedValue(payslipData)
    const printDoc = vi.fn()

    await printPayslipForStaff(
      { id: 1, staff_name: 'Alice' },
      undefined,
      generatePayslip,
      printDoc,
      {}
    )

    const callArg = printDoc.mock.calls[0][0]
    expect(callArg.title).toBe('Payslip - Alice - ')
  })

  it('passes schoolSettings spread with school_name override', async () => {
    const payslipData = makePayslipData()
    const generatePayslip = vi.fn().mockResolvedValue(payslipData)
    const printDoc = vi.fn()

    await printPayslipForStaff(
      { id: 1, staff_name: 'X' },
      'Feb',
      generatePayslip,
      printDoc,
      { school_name: 'Old School', phone: '0700' }
    )

    const settingsArg = printDoc.mock.calls[0][0].schoolSettings
    // schoolName from payslip data overrides
    expect(settingsArg.schoolName).toBe('Test School')
    // original settings are spread
    expect(settingsArg.school_name).toBe('Old School')
    expect(settingsArg.phone).toBe('0700')
  })

  it('propagates generatePayslip rejection', async () => {
    const generatePayslip = vi.fn().mockRejectedValue(new Error('DB down'))
    const printDoc = vi.fn()

    await expect(
      printPayslipForStaff({ id: 1, staff_name: 'A' }, 'Jan', generatePayslip, printDoc, {})
    ).rejects.toThrow('DB down')

    expect(printDoc).not.toHaveBeenCalled()
  })
})
