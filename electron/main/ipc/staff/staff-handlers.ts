import { getDatabase } from '../../database'
import { ipcMain } from '../../electron-env'

import type { IpcMainInvokeEvent } from 'electron'

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
  staff_number?: string
  first_name?: string
  middle_name?: string | null
  last_name?: string
  id_number?: string | null
  kra_pin?: string | null
  nhif_number?: string | null
  nssf_number?: string | null
  phone?: string | null
  email?: string | null
  bank_name?: string | null
  bank_account?: string | null
  department?: string | null
  job_title?: string | null
  employment_date?: string | null
  basic_salary?: number | null
  is_active?: boolean
}

function mapOptionalActive(value: boolean | undefined): number | null {
  if (value === undefined) {
    return null
  }
  return value ? 1 : 0
}

function toNullableString(value: string | null | undefined): string | null {
  return value ?? null
}

function toNullableNumber(value: number | null | undefined): number | null {
  return value ?? null
}

interface ValidatedStaffCreateData {
  basic_salary: number
  bank_account: string | null
  bank_name: string | null
  department: string | null
  email: string | null
  employment_date: string | null
  first_name: string
  id_number: string | null
  is_active: number
  job_title: string | null
  kra_pin: string | null
  last_name: string
  middle_name: string | null
  nhif_number: string | null
  nssf_number: string | null
  phone: string | null
  staff_number: string
}

function validateCreateData(data: StaffCreateData): ValidatedStaffCreateData {
  if (!data.staff_number || !data.first_name || !data.last_name) {
    throw new Error('Staff number, first name, and last name are required')
  }

  return {
    staff_number: data.staff_number,
    first_name: data.first_name,
    middle_name: toNullableString(data.middle_name),
    last_name: data.last_name,
    id_number: toNullableString(data.id_number),
    kra_pin: toNullableString(data.kra_pin),
    nhif_number: toNullableString(data.nhif_number),
    nssf_number: toNullableString(data.nssf_number),
    phone: toNullableString(data.phone),
    email: toNullableString(data.email),
    bank_name: toNullableString(data.bank_name),
    bank_account: toNullableString(data.bank_account),
    department: toNullableString(data.department),
    job_title: toNullableString(data.job_title),
    employment_date: toNullableString(data.employment_date),
    basic_salary: data.basic_salary || 0,
    is_active: data.is_active === false ? 0 : 1
  }
}

function buildUpdateParams(data: Partial<StaffCreateData>, id: number): Array<number | string | null> {
  return [
    toNullableString(data.staff_number),
    toNullableString(data.first_name),
    toNullableString(data.middle_name),
    toNullableString(data.last_name),
    toNullableString(data.id_number),
    toNullableString(data.kra_pin),
    toNullableString(data.nhif_number),
    toNullableString(data.nssf_number),
    toNullableString(data.phone),
    toNullableString(data.email),
    toNullableString(data.bank_name),
    toNullableString(data.bank_account),
    toNullableString(data.department),
    toNullableString(data.job_title),
    toNullableString(data.employment_date),
    toNullableNumber(data.basic_salary),
    mapOptionalActive(data.is_active),
    id
  ]
}

function registerStaffQueryHandlers(db: ReturnType<typeof getDatabase>): void {
  ipcMain.handle('staff:getAll', async (_event: IpcMainInvokeEvent, activeOnly = true) => {
    const query = activeOnly
      ? 'SELECT * FROM staff WHERE is_active = 1 ORDER BY staff_number'
      : 'SELECT * FROM staff ORDER BY staff_number'
    return db.prepare(query).all() as StaffMember[]
  })

  ipcMain.handle('staff:getById', async (_event: IpcMainInvokeEvent, id: number) => {
    return db.prepare('SELECT * FROM staff WHERE id = ?').get(id) as StaffMember | undefined
  })
}

function registerStaffMutationHandlers(db: ReturnType<typeof getDatabase>): void {
  ipcMain.handle('staff:create', async (_event: IpcMainInvokeEvent, data: StaffCreateData) => {
    const validated = validateCreateData(data)
    const stmt = db.prepare(`INSERT INTO staff (
      staff_number, first_name, middle_name, last_name, id_number, kra_pin,
      nhif_number, nssf_number, phone, email, bank_name, bank_account,
      department, job_title, employment_date, basic_salary, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    const result = stmt.run(
      validated.staff_number,
      validated.first_name,
      validated.middle_name,
      validated.last_name,
      validated.id_number,
      validated.kra_pin,
      validated.nhif_number,
      validated.nssf_number,
      validated.phone,
      validated.email,
      validated.bank_name,
      validated.bank_account,
      validated.department,
      validated.job_title,
      validated.employment_date,
      validated.basic_salary,
      validated.is_active
    )
    return { success: true, id: result.lastInsertRowid }
  })

  ipcMain.handle('staff:update', async (_event: IpcMainInvokeEvent, id: number, data: Partial<StaffCreateData>) => {
    db.prepare(`
      UPDATE staff SET
        staff_number = COALESCE(?, staff_number),
        first_name = COALESCE(?, first_name),
        middle_name = COALESCE(?, middle_name),
        last_name = COALESCE(?, last_name),
        id_number = COALESCE(?, id_number),
        kra_pin = COALESCE(?, kra_pin),
        nhif_number = COALESCE(?, nhif_number),
        nssf_number = COALESCE(?, nssf_number),
        phone = COALESCE(?, phone),
        email = COALESCE(?, email),
        bank_name = COALESCE(?, bank_name),
        bank_account = COALESCE(?, bank_account),
        department = COALESCE(?, department),
        job_title = COALESCE(?, job_title),
        employment_date = COALESCE(?, employment_date),
        basic_salary = COALESCE(?, basic_salary),
        is_active = COALESCE(?, is_active)
      WHERE id = ?
    `).run(...buildUpdateParams(data, id))
    return { success: true }
  })

  ipcMain.handle('staff:setActive', async (_event: IpcMainInvokeEvent, id: number, isActive: boolean) => {
    db.prepare('UPDATE staff SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, id)
    return { success: true }
  })
  // Payroll handlers moved to payroll-handlers.ts
}

export function registerStaffHandlers(): void {
  const db = getDatabase()
  registerStaffQueryHandlers(db)
  registerStaffMutationHandlers(db)
}














