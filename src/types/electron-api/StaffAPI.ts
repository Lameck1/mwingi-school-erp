export interface StaffMember {
  id: number
  staff_number: string
  first_name: string
  middle_name?: string | undefined
  last_name: string
  id_number?: string | undefined
  kra_pin?: string | undefined
  nhif_number?: string | undefined
  nssf_number?: string | undefined
  phone?: string | undefined
  email?: string | undefined
  bank_name?: string | undefined
  bank_account?: string | undefined
  department?: string | undefined
  job_title?: string | undefined
  employment_date?: string | undefined
  basic_salary?: number | undefined
  is_active: boolean
  created_at?: string | undefined
  updated_at?: string | undefined
}

export interface StaffAPI {
  getStaff(activeOnly?: boolean): Promise<StaffMember[]>
  getStaffById?: (id: number) => Promise<StaffMember | undefined>
  createStaff(data: Partial<StaffMember>): Promise<{ success: boolean; id: number }>
  updateStaff: (id: number, data: Partial<StaffMember>) => Promise<{ success: boolean }>
  setStaffActive: (id: number, isActive: boolean) => Promise<{ success: boolean }>
}
