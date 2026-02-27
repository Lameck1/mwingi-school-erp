import type { SchoolSettings } from '../../../types/electron-api/SettingsAPI'
import type { PrintOptions } from '../../../utils/print'

export interface StaffEntryMini {
  id?: number
  staff_name: string
}

export async function printPayslipForStaff(
  staffEntry: StaffEntryMini,
  selectedPeriodName: string | null | undefined,
  generatePayslip: (id: number) => Promise<{
    period_name: string
    earnings: { basic_salary: number; gross_pay: number; allowances: Array<{ name: string; amount: number }> }
    deductions: { total_deductions: number; items: Array<{ name: string; amount: number }> }
    net_pay: number
    school_name: string
  } | null>,
  printDocument: (options: PrintOptions) => void,
  schoolSettings: Partial<SchoolSettings>
) {
  if (!staffEntry.id) {
    throw new Error('Cannot print draft payslip without an ID. Save first.')
  }
  const payslipData = await generatePayslip(staffEntry.id)
  if (!payslipData) {
    return
  }
  printDocument({
    title: `Payslip - ${staffEntry.staff_name} - ${selectedPeriodName ?? ''}`,
    template: 'payslip',
    data: {
      periodName: payslipData.period_name,
      basicSalary: payslipData.earnings.basic_salary,
      grossSalary: payslipData.earnings.gross_pay,
      netSalary: payslipData.net_pay,
      totalDeductions: payslipData.deductions.total_deductions,
      allowancesList: payslipData.earnings.allowances,
      deductionsList: payslipData.deductions.items
    },
    schoolSettings: {
      ...schoolSettings,
      schoolName: payslipData.school_name
    }
  })
}
