import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'
import { container } from '../../services/base/ServiceContainer'
import { toDbGender, fromDbGender, toDbActiveFlag } from '../../utils/transforms'
import { sanitizeString, validateId } from '../../utils/validation'
import { createGetOrCreateCategoryId, generateSingleStudentInvoice, type FinanceContext } from '../finance/finance-handler-utils'
import { safeHandleRaw } from '../ipc-result'

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

interface AutoInvoiceResult {
  invoiceGenerated: boolean
  invoiceNumber?: string
}

function coalesceValue<T>(incoming: T | undefined, current: T): T {
  return incoming ?? current
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
): EnrollmentContext {
  const context = resolveEnrollmentContext(db)
  if (!context) {
    throw new Error('No active academic year/term configured for enrollment')
  }

  const dateExpression = params.useCurrentDate ? "DATE('now')" : '?'
  db.prepare(`
    UPDATE enrollment
    SET status = 'INACTIVE'
    WHERE student_id = ?
      AND academic_year_id = ?
      AND term_id = ?
      AND status = 'ACTIVE'
  `).run(params.studentId, context.yearId, context.termId)

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
    return context
  }

  stmt.run(params.studentId, context.yearId, context.termId, context.termId, params.streamId, params.studentType, params.enrollmentDate)
  return context
}

function generateAutoInvoice(
  db: ReturnType<typeof getDatabase>,
  studentId: number,
  enrollmentContext: EnrollmentContext,
  userId: number,
): AutoInvoiceResult {
  const financeContext: FinanceContext = {
    db,
    exemptionService: container.resolve('ExemptionService'),
    paymentService: container.resolve('PaymentService'),
    getOrCreateCategoryId: createGetOrCreateCategoryId(db),
  }

  const result = generateSingleStudentInvoice(
    financeContext,
    studentId,
    enrollmentContext.yearId,
    enrollmentContext.termId,
    userId,
  )

  if (!result.success) {
    throw new Error(result.error || 'Failed to generate initial invoice')
  }

  return {
    invoiceGenerated: true,
    invoiceNumber: result.invoiceNumber,
  }
}

function normalizeStreamId(streamId: unknown): number | null {
  if (typeof streamId === 'number' && Number.isFinite(streamId) && streamId > 0) {
    return streamId
  }
  return null
}

function getUnknownErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return fallback
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
  safeHandleRaw('student:getAll', (_event, filters?: StudentFilters) => {
    let query = `SELECT s.*, st.stream_name, e.student_type as current_type,
        (SELECT COALESCE(SUM(total_amount - amount_paid), 0)
         FROM fee_invoice
         WHERE student_id = s.id AND status NOT IN ('CANCELLED', 'VOIDED') AND COALESCE(is_voided, 0) = 0
        ) - COALESCE(s.credit_balance, 0) as balance
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

  safeHandleRaw('student:getById', (_event, id: number) => {
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

  safeHandleRaw('student:getBalance', (_event, studentId: number) => {
    const invoices = db.prepare(`
      SELECT COALESCE(SUM(total_amount - amount_paid), 0) as invoice_balance
      FROM fee_invoice
      WHERE student_id = ? AND status NOT IN ('CANCELLED', 'VOIDED') AND COALESCE(is_voided, 0) = 0
    `).get(studentId) as { invoice_balance: number } | undefined

    const student = db.prepare('SELECT credit_balance FROM student WHERE id = ?').get(studentId) as { credit_balance: number } | undefined

    const invoiceBalance = invoices?.invoice_balance || 0
    const creditBalance = student?.credit_balance || 0

    return invoiceBalance - creditBalance
  })
}

function registerStudentWriteHandlers(db: ReturnType<typeof getDatabase>): void {
  registerCreateStudentHandler(db)
  registerUpdateStudentHandler(db)

  safeHandleRaw('student:deactivate', (_event, id: number, userId: number) => {
    const idVal = validateId(id, 'Student')
    if (!idVal.success) { return { success: false, error: idVal.error } }
    const student = db.prepare('SELECT id, is_active FROM student WHERE id = ?').get(idVal.data!) as { id: number; is_active: number } | undefined
    if (!student) { return { success: false, error: 'Student not found' } }
    if (student.is_active === 0) { return { success: false, error: 'Student is already deactivated' } }
    db.prepare('UPDATE student SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(idVal.data!)
    logAudit(userId || 0, 'DEACTIVATE', 'student', idVal.data!, { is_active: 1 }, { is_active: 0 })
    return { success: true }
  })
}

function registerCreateStudentHandler(db: ReturnType<typeof getDatabase>): void {
  safeHandleRaw('student:create', (_event, data: StudentCreateData, userId?: number) => {
    // Validate and sanitize input
    const admissionNumber = sanitizeString(data.admission_number, 50)
    const firstName = sanitizeString(data.first_name, 100)
    const lastName = sanitizeString(data.last_name, 100)

    if (!admissionNumber || !firstName || !lastName) {
      return { success: false, error: 'Admission number, first name, and last name are required' }
    }

    try {
      const createStudentTx = db.transaction(() => {
        const stmt = db.prepare(`
          INSERT INTO student (
            admission_number, first_name, middle_name, last_name, date_of_birth, gender,
            student_type, admission_date, guardian_name, guardian_phone, guardian_email,
            guardian_relationship, address, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)

        const result = stmt.run(
          admissionNumber,
          firstName,
          sanitizeString(data.middle_name, 100),
          lastName,
          data.date_of_birth,
          toDbGender(data.gender),
          data.student_type,
          data.admission_date,
          sanitizeString(data.guardian_name, 200),
          sanitizeString(data.guardian_phone, 20),
          sanitizeString(data.guardian_email, 100),
          sanitizeString(data.guardian_relationship, 50),
          sanitizeString(data.address, 500),
          sanitizeString(data.notes, 1000),
        )

        const newStudentId = Number(result.lastInsertRowid)
        let autoInvoice: AutoInvoiceResult = { invoiceGenerated: false }

        const streamId = normalizeStreamId(data.stream_id)
        if (streamId) {
          const streamValidation = validateId(streamId, 'Stream')
          if (!streamValidation.success) {
            throw new Error(streamValidation.error || 'Invalid stream ID')
          }

          const enrollmentContext = createEnrollment(db, {
            studentId: newStudentId,
            streamId: streamValidation.data!,
            studentType: data.student_type,
            enrollmentDate: data.admission_date,
            useCurrentDate: false,
          })

          if (!userId || userId <= 0) {
            throw new Error('Valid user ID is required for invoice generation')
          }
          autoInvoice = generateAutoInvoice(db, newStudentId, enrollmentContext, userId)
        }

        return {
          id: newStudentId,
          invoiceGenerated: autoInvoice.invoiceGenerated,
          invoiceNumber: autoInvoice.invoiceNumber,
        }
      })

      const created = createStudentTx()
      logAudit(userId || 0, 'CREATE', 'student', created.id, null, { admission_number: admissionNumber, first_name: firstName, last_name: lastName })
      return { success: true, ...created }
    } catch (error) {
      return {
        success: false,
        error: getUnknownErrorMessage(error, 'Failed to create student'),
      }
    }
  })
}

function registerUpdateStudentHandler(db: ReturnType<typeof getDatabase>): void {
  safeHandleRaw('student:update', (_event, id: number, data: Partial<StudentCreateData>) => {
    // Validate student ID
    const idValidation = validateId(id, 'Student')
    if (!idValidation.success) {
      return { success: false, error: idValidation.error }
    }

    const student = db.prepare('SELECT * FROM student WHERE id = ?').get(idValidation.data!) as Student | undefined
    if (!student) {
      return { success: false, error: 'Student not found' }
    }

    try {
      const updateStudentTx = db.transaction(() => {
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
          sanitizeString(merged.admission_number, 50),
          sanitizeString(merged.first_name, 100),
          sanitizeString(merged.middle_name, 100),
          sanitizeString(merged.last_name, 100),
          merged.date_of_birth,
          merged.gender,
          merged.student_type,
          merged.admission_date,
          sanitizeString(merged.guardian_name, 200),
          sanitizeString(merged.guardian_phone, 20),
          sanitizeString(merged.guardian_email, 100),
          sanitizeString(merged.guardian_relationship, 50),
          sanitizeString(merged.address, 500),
          sanitizeString(merged.notes, 1000),
          merged.is_active,
          idValidation.data!,
        )

        const streamId = normalizeStreamId(data.stream_id)
        if (streamId) {
          const streamValidation = validateId(streamId, 'Stream')
          if (!streamValidation.success) {
            throw new Error(streamValidation.error || 'Invalid stream ID')
          }

          createEnrollment(db, {
            studentId: idValidation.data!,
            streamId: streamValidation.data!,
            studentType: data.student_type ?? student.student_type,
            enrollmentDate: student.admission_date,
            useCurrentDate: true,
          })
        }
      })

      updateStudentTx()
      logAudit(0, 'UPDATE', 'student', idValidation.data!, { id: student.id }, data)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: getUnknownErrorMessage(error, 'Failed to update student'),
      }
    }
  })
}
