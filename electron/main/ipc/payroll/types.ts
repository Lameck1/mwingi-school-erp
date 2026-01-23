export interface StaffMember {
  id: number
  staff_number: string
  first_name: string
  middle_name?: string
  last_name: string
  email: string
  phone: string
  job_title: string
  department: string
  basic_salary: number
  employment_date: string
  is_active: boolean
  created_at: string
}

export interface StaffCreateData {
  staff_number: string
  first_name: string
  middle_name?: string
  last_name: string
  email: string
  phone: string
  job_title: string
  department: string
  basic_salary: number
  employment_date: string
}

export interface PayrollPeriod {
  id: number
  period_name: string
  month: number
  year: number
  start_date: string
  end_date: string
  status: 'DRAFT' | 'CONFIRMED' | 'PAID'
  created_at: string
  updated_at: string
}

export interface PayrollRecord {
  id: number
  payroll_period_id: number
  staff_id: number
  basic_salary: number
  gross_salary: number
  total_deductions: number
  net_salary: number
  paye_tax: number
  nhif_deduction: number
  nssf_deduction: number
  housing_levy: number
  created_at: string
  updated_at: string
}

export interface PayrollCalculationResult {
  basic_salary: number
  gross_salary: number
  total_deductions: number
  net_salary: number
  paye_tax: number
  nhif_deduction: number
  nssf_deduction: number
  housing_levy: number
  breakdown: {
    basic: number
    allowances: number
    deductions: Array<{
      name: string
      amount: number
      type: 'STATUTORY' | 'OTHER'
    }>
  }
}


