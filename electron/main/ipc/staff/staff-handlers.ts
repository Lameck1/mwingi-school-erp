import { getDatabase } from '../../database'
import { sanitizeString, validateAmount, validateId } from '../../utils/validation'
import { safeHandleRaw } from '../ipc-result'

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
  const staffNumber = sanitizeString(data.staff_number, 50)
  const firstName = sanitizeString(data.first_name, 100)
  const lastName = sanitizeString(data.last_name, 100)

  if (!staffNumber || !firstName || !lastName) {
    throw new Error('Staff number, first name, and last name are required')
  }

  // Validate salary if provided - throw error if provided but invalid
  const salaryInput = data.basic_salary ?? 0
  const salaryValidation = validateAmount(salaryInput)
  if (!salaryValidation.success && data.basic_salary !== undefined && data.basic_salary !== null) {
    throw new Error(salaryValidation.error ?? 'Invalid salary amount')
  }
  const basicSalary = salaryValidation.success ? (salaryValidation.data ?? 0) : 0

  return {
    staff_number: staffNumber,
    first_name: firstName,
    middle_name: toNullableString(sanitizeString(data.middle_name, 100)),
    last_name: lastName,
    id_number: toNullableString(sanitizeString(data.id_number, 20)),
    kra_pin: toNullableString(sanitizeString(data.kra_pin, 20)),
    nhif_number: toNullableString(sanitizeString(data.nhif_number, 20)),
    nssf_number: toNullableString(sanitizeString(data.nssf_number, 20)),
    phone: toNullableString(sanitizeString(data.phone, 20)),
    email: toNullableString(sanitizeString(data.email, 100)),
    bank_name: toNullableString(sanitizeString(data.bank_name, 100)),
    bank_account: toNullableString(sanitizeString(data.bank_account, 50)),
    department: toNullableString(sanitizeString(data.department, 100)),
    job_title: toNullableString(sanitizeString(data.job_title, 100)),
    employment_date: toNullableString(data.employment_date),
    basic_salary: basicSalary,
    is_active: data.is_active === false ? 0 : 1
  }
}

function buildUpdateParams(data: Partial<StaffCreateData>, id: number): Array<number | string | null> {
  // Validate and sanitize update parameters
  // For updates, only validate salary if explicitly provided
  let basicSalary: number | null = null
  if (data.basic_salary !== undefined) {
    const salaryValidation = validateAmount(data.basic_salary)
    basicSalary = salaryValidation.success ? (salaryValidation.data ?? null) : null
  }

  return [
    toNullableString(sanitizeString(data.staff_number, 50)),
    toNullableString(sanitizeString(data.first_name, 100)),
    toNullableString(sanitizeString(data.middle_name, 100)),
    toNullableString(sanitizeString(data.last_name, 100)),
    toNullableString(sanitizeString(data.id_number, 20)),
    toNullableString(sanitizeString(data.kra_pin, 20)),
    toNullableString(sanitizeString(data.nhif_number, 20)),
    toNullableString(sanitizeString(data.nssf_number, 20)),
    toNullableString(sanitizeString(data.phone, 20)),
    toNullableString(sanitizeString(data.email, 100)),
    toNullableString(sanitizeString(data.bank_name, 100)),
    toNullableString(sanitizeString(data.bank_account, 50)),
    toNullableString(sanitizeString(data.department, 100)),
    toNullableString(sanitizeString(data.job_title, 100)),
    toNullableString(data.employment_date),
    basicSalary,
    mapOptionalActive(data.is_active),
    id
  ]
}

function registerStaffQueryHandlers(db: ReturnType<typeof getDatabase>): void {
  safeHandleRaw('staff:getAll', (_event, activeOnly = true) => {
    const query = activeOnly
      ? 'SELECT * FROM staff WHERE is_active = 1 ORDER BY staff_number'
      : 'SELECT * FROM staff ORDER BY staff_number'
    return db.prepare(query).all() as StaffMember[]
  })

  safeHandleRaw('staff:getById', (_event, id: number) => {
    return db.prepare('SELECT * FROM staff WHERE id = ?').get(id) as StaffMember | undefined
  })
}

function registerStaffMutationHandlers(db: ReturnType<typeof getDatabase>): void {
  safeHandleRaw('staff:create', (_event, data: StaffCreateData) => {
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

  safeHandleRaw('staff:update', (_event, id: number, data: Partial<StaffCreateData>) => {
    // Validate staff ID
    const idValidation = validateId(id, 'Staff')
    if (!idValidation.success) {
      return { success: false, error: idValidation.error }
    }

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
    `).run(...buildUpdateParams(data, idValidation.data!))
    return { success: true }
  })

  safeHandleRaw('staff:setActive', (_event, id: number, isActive: boolean) => {
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














