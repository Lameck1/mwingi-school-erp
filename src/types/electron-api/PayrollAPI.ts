export interface PayrollPeriod {
  id: number
  period_name: string
  month: number
  year: number
  start_date: string
  end_date: string
  status: 'DRAFT' | 'PROCESSED' | 'PAID'
  total_amount: number
  processed_by: number
  created_at: string
  updated_at: string
}

export interface PayrollEntry {
  id?: number
  payroll_period_id?: number
  staff_id?: number
  staff_name: string
  staff_number?: string
  department?: string
  job_title?: string
  phone?: string
  basic_salary: number
  allowances: number
  gross_salary: number
  paye?: number
  nhif?: number
  nssf?: number
  deductions?: number
  total_deductions?: number
  net_salary: number
  created_at?: string
  updated_at?: string
}

export interface StaffAllowance {
  id: number
  staff_id: number
  allowance_name: string
  amount: number
  is_active: boolean
  created_at: string
}

export interface PayrollAPI {
  runPayroll: (_month: number, _year: number, _userId: number) => Promise<{ success: boolean; results?: PayrollEntry[]; error?: string }>
  getPayrollHistory: () => Promise<PayrollPeriod[]>
  getPayrollDetails: (_periodId: number) => Promise<{ success: boolean; period?: PayrollPeriod; results?: PayrollEntry[]; error?: string }>
  getStaffAllowances: (_staffId: number) => Promise<StaffAllowance[]>
  addStaffAllowance: (_staffId: number, _allowanceName: string, _amount: number) => Promise<{ success: boolean; id?: number }>
  deleteStaffAllowance: (_allowanceId: number) => Promise<{ success: boolean }>
}
