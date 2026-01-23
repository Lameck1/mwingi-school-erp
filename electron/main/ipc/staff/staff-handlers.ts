import { ipcMain } from '../../electron-env'
import { getDatabase } from '../../database/index'
import { logAudit } from '../../database/utils/audit'
import { TaxCalculator } from '../../tax/TaxStrategy'

interface StaffMember {
  id: number
  staff_number: string
  first_name: string
  middle_name: string
  last_name: string
  id_number: string
  kra_pin: string
  nhif_number: string
  nssf_number: string
  phone: string
  email: string
  bank_name: string
  bank_account: string
  department: string
  job_title: string
  employment_date: string
  basic_salary: number
  is_active: boolean
  created_at: string
  updated_at: string
}

interface StaffCreateData {
  staff_number: string
  first_name: string
  middle_name: string
  last_name: string
  id_number: string
  kra_pin: string
  nhif_number: string
  nssf_number: string
  phone: string
  email: string
  bank_name: string
  bank_account: string
  department: string
  job_title: string
  employment_date: string
  basic_salary: number
}

interface PayrollPeriod {
  id: number
  period_name: string
  month: number
  year: number
  start_date: string
  end_date: string
  status: string
  created_at: string
}

interface PayrollRecord {
  staff_id: number
  basic_salary: number
  gross_salary: number
  total_deductions: number
  net_salary: number
  paye: number
  nhif: number
  nssf: number
  sacco: number
  other_deductions: number
}

export function registerStaffHandlers(): void {
  const db = getDatabase()

  // ======== STAFF ========
  ipcMain.handle('staff:getAll', async (_, activeOnly = true) => {
    const query = activeOnly
      ? 'SELECT * FROM staff WHERE is_active = 1 ORDER BY staff_number'
      : 'SELECT * FROM staff ORDER BY staff_number'
    return db.prepare(query).all() as StaffMember[]
  })

  ipcMain.handle('staff:create', async (_, data: StaffCreateData) => {
    const stmt = db.prepare(`INSERT INTO staff (
      staff_number, first_name, middle_name, last_name, id_number, kra_pin,
      nhif_number, nssf_number, phone, email, bank_name, bank_account,
      department, job_title, employment_date, basic_salary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    const result = stmt.run(
      data.staff_number, data.first_name, data.middle_name, data.last_name,
      data.id_number, data.kra_pin, data.nhif_number, data.nssf_number,
      data.phone, data.email, data.bank_name, data.bank_account,
      data.department, data.job_title, data.employment_date, data.basic_salary
    )
    return { success: true, id: result.lastInsertRowid }
  })
  // Payroll handlers moved to payroll-handlers.ts
}

















