import { getDatabase } from '../../database'
import { ipcMain } from '../../electron-env'

import type { IpcMainInvokeEvent } from 'electron'

interface Student {
  id: number
  admission_number: string
  first_name: string
  middle_name: string
  last_name: string
  date_of_birth: string
  gender: 'MALE' | 'FEMALE'
  student_type: 'BOARDER' | 'DAY_SCHOLAR'
  admission_date: string
  guardian_name: string
  guardian_phone: string
  guardian_email: string
  guardian_relationship: string
  address: string
  notes: string
  is_active: number
  created_at: string
  updated_at: string
  stream_name?: string
  current_type?: string
  balance?: number
  credit_balance?: number
}

interface StudentFilters {
  search?: string
  streamId?: number
  isActive?: boolean
}

interface StudentCreateData {
  admission_number: string
  first_name: string
  middle_name: string
  last_name: string
  date_of_birth: string
  gender: 'MALE' | 'FEMALE'
  student_type: 'BOARDER' | 'DAY_SCHOLAR'
  admission_date: string
  guardian_name: string
  guardian_phone: string
  guardian_email: string
  guardian_relationship: string
  address: string
  notes: string
  is_active?: boolean
  stream_id?: number
}

interface EnrollmentContext {
  yearId: number
  termId: number
}

const toDbGender = (gender: string) => {
  const normalized = gender.toUpperCase()
  if (normalized === 'MALE') {return 'M'}
  if (normalized === 'FEMALE') {return 'F'}
  return gender
}

const fromDbGender = (gender: string) => {
  if (gender === 'M') {return 'MALE'}
  if (gender === 'F') {return 'FEMALE'}
  return gender
}

function toDbActiveFlag(value: boolean): number {
  return value ? 1 : 0
}

function coalesceValue<T>(incoming: T | undefined, current: T): T {
  return incoming === undefined ? current : incoming
}

function resolveEnrollmentContext(db: ReturnType<typeof getDatabase>): EnrollmentContext | null {
  const currentYear = db.prepare('SELECT id FROM academic_year WHERE is_current = 1 LIMIT 1').get() as { id: number } | undefined
  const fallbackYear = db.prepare('SELECT id FROM academic_year ORDER BY id DESC LIMIT 1').get() as { id: number } | undefined
  const yearId = currentYear?.id ?? fallbackYear?.id
  if (!yearId) {
    return null
  }

  const currentTerm = db.prepare('SELECT id FROM term WHERE is_current = 1 LIMIT 1').get() as { id: number } | undefined
  const fallbackTerm = db.prepare('SELECT id FROM term WHERE academic_year_id = ? ORDER BY term_number DESC LIMIT 1').get(yearId) as { id: number } | undefined
  const termId = currentTerm?.id ?? fallbackTerm?.id
  if (!termId) {
    return null
  }

  return { yearId, termId }
}

function createEnrollment(
  db: ReturnType<typeof getDatabase>,
  params: {
    studentId: number
    streamId: number
    studentType: StudentCreateData['student_type']
    enrollmentDate: string
    useCurrentDate: boolean
  },
): void {
  const context = resolveEnrollmentContext(db)
  if (!context) {
    return
  }

  const dateExpression = params.useCurrentDate ? "DATE('now')" : '?'
  const sql = `
    INSERT INTO enrollment (
      student_id,
      academic_year_id,
      term_id,
      academic_term_id,
      stream_id,
      student_type,
      enrollment_date,
      status
    ) VALUES (?, ?, ?, ?, ?, ?, ${dateExpression}, 'ACTIVE')
  `

  const stmt = db.prepare(sql)
  if (params.useCurrentDate) {
    stmt.run(params.studentId, context.yearId, context.termId, context.termId, params.streamId, params.studentType)
    return
  }

  stmt.run(params.studentId, context.yearId, context.termId, context.termId, params.streamId, params.studentType, params.enrollmentDate)
}

function mergeStudentUpdate(student: Student, data: Partial<StudentCreateData>) {
  const gender = data.gender === undefined ? student.gender : toDbGender(data.gender)
  const isActive = data.is_active === undefined ? student.is_active : toDbActiveFlag(data.is_active)

  return {
    admission_number: coalesceValue(data.admission_number, student.admission_number),
    first_name: coalesceValue(data.first_name, student.first_name),
    middle_name: coalesceValue(data.middle_name, student.middle_name),
    last_name: coalesceValue(data.last_name, student.last_name),
    date_of_birth: coalesceValue(data.date_of_birth, student.date_of_birth),
    gender,
    student_type: coalesceValue(data.student_type, student.student_type),
    admission_date: coalesceValue(data.admission_date, student.admission_date),
    guardian_name: coalesceValue(data.guardian_name, student.guardian_name),
    guardian_phone: coalesceValue(data.guardian_phone, student.guardian_phone),
    guardian_email: coalesceValue(data.guardian_email, student.guardian_email),
    guardian_relationship: coalesceValue(data.guardian_relationship, student.guardian_relationship),
    address: coalesceValue(data.address, student.address),
    notes: coalesceValue(data.notes, student.notes),
    is_active: isActive,
  }
}

export function registerStudentHandlers(): void {
  const db = getDatabase()
  registerStudentReadHandlers(db)
  registerStudentWriteHandlers(db)
}

function registerStudentReadHandlers(db: ReturnType<typeof getDatabase>): void {
  ipcMain.handle('student:getAll', async (_event: IpcMainInvokeEvent, filters?: StudentFilters) => {
    let query = `SELECT s.*, st.stream_name, e.student_type as current_type,
        (SELECT COALESCE(SUM(total_amount - amount_paid), 0)
         FROM fee_invoice
         WHERE student_id = s.id AND status != 'CANCELLED'
        ) as balance
      FROM student s
      LEFT JOIN enrollment e ON s.id = e.student_id AND e.id = (
        SELECT MAX(id) FROM enrollment WHERE student_id = s.id
      )
      LEFT JOIN stream st ON e.stream_id = st.id
      WHERE 1=1`
    const params: unknown[] = []

    if (filters?.search) {
      query += ' AND (s.admission_number LIKE ? OR s.first_name LIKE ? OR s.last_name LIKE ?)'
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`)
    }
    if (filters?.streamId) {
      query += ' AND e.stream_id = ?'
      params.push(filters.streamId)
    }
    if (filters?.isActive !== undefined) {
      query += ' AND s.is_active = ?'
      params.push(toDbActiveFlag(filters.isActive))
    }

    query += ' ORDER BY s.admission_number'
    const students = db.prepare(query).all(...params) as Student[]
    return students.map((student) => ({ ...student, gender: fromDbGender(student.gender) })) as Student[]
  })

  ipcMain.handle('student:getById', async (_event: IpcMainInvokeEvent, id: number) => {
    const student = db.prepare('SELECT * FROM student WHERE id = ?').get(id) as Student | undefined
    if (!student) {
      return
    }

    const enrollment = db.prepare(`
      SELECT e.stream_id, st.stream_name
      FROM enrollment e
      LEFT JOIN stream st ON e.stream_id = st.id
      WHERE e.student_id = ?
      ORDER BY e.id DESC
      LIMIT 1
    `).get(id) as { stream_id: number; stream_name: string } | undefined

    return {
      ...student,
      gender: fromDbGender(student.gender),
      credit_balance: student.credit_balance || 0,
      stream_id: enrollment?.stream_id,
      stream_name: enrollment?.stream_name,
    }
  })

  ipcMain.handle('student:getBalance', async (_event: IpcMainInvokeEvent, studentId: number) => {
    const invoices = db.prepare(`
      SELECT COALESCE(SUM(total_amount - amount_paid), 0) as balance
      FROM fee_invoice
      WHERE student_id = ? AND status != 'CANCELLED'
    `).get(studentId) as { balance: number } | undefined
    return invoices?.balance || 0
  })
}

function registerStudentWriteHandlers(db: ReturnType<typeof getDatabase>): void {
  registerCreateStudentHandler(db)
  registerUpdateStudentHandler(db)
}

function registerCreateStudentHandler(db: ReturnType<typeof getDatabase>): void {
  ipcMain.handle('student:create', async (_event: IpcMainInvokeEvent, data: StudentCreateData) => {
    const stmt = db.prepare(`
      INSERT INTO student (
        admission_number, first_name, middle_name, last_name, date_of_birth, gender,
        student_type, admission_date, guardian_name, guardian_phone, guardian_email,
        guardian_relationship, address, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const result = stmt.run(
      data.admission_number,
      data.first_name,
      data.middle_name,
      data.last_name,
      data.date_of_birth,
      toDbGender(data.gender),
      data.student_type,
      data.admission_date,
      data.guardian_name,
      data.guardian_phone,
      data.guardian_email,
      data.guardian_relationship,
      data.address,
      data.notes,
    )
    const newStudentId = Number(result.lastInsertRowid)

    try {
      if (data.stream_id) {
        createEnrollment(db, {
          studentId: newStudentId,
          streamId: data.stream_id,
          studentType: data.student_type,
          enrollmentDate: data.admission_date,
          useCurrentDate: false,
        })
      }
    } catch {
      // Ignore enrollment side effect failures and keep student creation successful.
    }

    return { success: true, id: newStudentId }
  })
}

function registerUpdateStudentHandler(db: ReturnType<typeof getDatabase>): void {
  ipcMain.handle('student:update', async (_event: IpcMainInvokeEvent, id: number, data: Partial<StudentCreateData>) => {
    const student = db.prepare('SELECT * FROM student WHERE id = ?').get(id) as Student | undefined
    if (!student) {
      return { success: false, error: 'Student not found' }
    }

    const merged = mergeStudentUpdate(student, data)
    const stmt = db.prepare(`
      UPDATE student SET
        admission_number = ?, first_name = ?, middle_name = ?, last_name = ?,
        date_of_birth = ?, gender = ?, student_type = ?, admission_date = ?,
        guardian_name = ?, guardian_phone = ?, guardian_email = ?,
        guardian_relationship = ?, address = ?, notes = ?,
        is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    stmt.run(
      merged.admission_number,
      merged.first_name,
      merged.middle_name,
      merged.last_name,
      merged.date_of_birth,
      merged.gender,
      merged.student_type,
      merged.admission_date,
      merged.guardian_name,
      merged.guardian_phone,
      merged.guardian_email,
      merged.guardian_relationship,
      merged.address,
      merged.notes,
      merged.is_active,
      id,
    )

    try {
      if (data.stream_id) {
        createEnrollment(db, {
          studentId: id,
          streamId: data.stream_id,
          studentType: data.student_type ?? student.student_type,
          enrollmentDate: student.admission_date,
          useCurrentDate: true,
        })
      }
    } catch {
      // Ignore enrollment side effect failures and keep student update successful.
    }

    return { success: true }
  })
}
