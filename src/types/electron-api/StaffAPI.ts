export interface StaffMember {
  id: number
  staff_number: string
  first_name: string
  middle_name?: string
  last_name: string
  id_number?: string
  kra_pin?: string
  nhif_number?: string
  nssf_number?: string
  phone?: string
  email?: string
  bank_name?: string
  bank_account?: string
  department?: string
  job_title?: string
  employment_date?: string
  basic_salary?: number
  is_active: boolean
  created_at?: string
  updated_at?: string
}

export interface StaffAPI {
  getStaff(activeOnly?: boolean): Promise<StaffMember[]>
  createStaff(data: Partial<StaffMember>): Promise<{ success: boolean; id: number }>
}
