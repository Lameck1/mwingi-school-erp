export interface PayrollPeriod {
  id: number
  period_name: string
  month: number
  year: number
  start_date: string
  end_date: string
  status: 'DRAFT' | 'CONFIRMED' | 'PAID'
  approved_by_user_id?: number
  approved_at?: string
  created_at: string
}

export interface PayrollEntry {
  id?: number
  payroll_period_id?: number
  staff_id: number
  staff_name: string
  staff_number?: string
  department?: string
  job_title?: string
  phone?: string
  basic_salary: number
  allowances: number
  gross_salary: number
  paye: number
  nssf: number
  shif: number
  housing_levy: number
  total_deductions: number
  net_salary: number
  payment_status?: string
  payment_date?: string
  created_at?: string
}

export interface StaffAllowance {
  id: number
  staff_id: number
  allowance_name: string
  amount: number
  is_active: boolean
  created_at: string
}

type PayrollStatusResult = Promise<{ success: boolean; error?: string }>
type PayrollRunResult = Promise<{ success: boolean; periodId?: number; results?: PayrollEntry[]; error?: string }>

export interface PayrollAPI {
  runPayroll: (_month: number, _year: number, _userId: number) => PayrollRunResult
  getPayrollHistory: () => Promise<PayrollPeriod[]>
  getPayrollDetails: (_periodId: number) => Promise<{ success: boolean; period?: PayrollPeriod; results?: PayrollEntry[]; error?: string }>
  confirmPayroll: (_periodId: number, _userId: number) => PayrollStatusResult
  markPayrollPaid: (_periodId: number, _userId: number) => PayrollStatusResult
  revertPayrollToDraft: (_periodId: number, _userId: number) => PayrollStatusResult
  deletePayroll: (_periodId: number, _userId: number) => PayrollStatusResult
  recalculatePayroll: (_periodId: number, _userId: number) => PayrollRunResult
  getStaffAllowances: (_staffId: number) => Promise<StaffAllowance[]>
  addStaffAllowance: (_staffId: number, _allowanceName: string, _amount: number) => Promise<{ success: boolean; id?: number }>
  deleteStaffAllowance: (_allowanceId: number) => Promise<{ success: boolean }>
}
