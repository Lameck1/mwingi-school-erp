import { ipcMain } from '../../electron-env'
import { IpcMainInvokeEvent } from 'electron'
import { getDatabase } from '../../database/index'

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
  is_active: number // Changed to number to match DB 1/0
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
}

export function registerStudentHandlers(): void {
  const db = getDatabase()

  // ======== STUDENTS ========
  ipcMain.handle('student:getAll', async (_event: IpcMainInvokeEvent, filters?: StudentFilters) => {
    let query = `SELECT s.*, st.stream_name, e.student_type as current_type,
        (SELECT COALESCE(SUM(total_amount - amount_paid), 0) / 100.0
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
      query += ` AND (s.admission_number LIKE ? OR s.first_name LIKE ? OR s.last_name LIKE ?)`
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`)
    }
    if (filters?.streamId) {
      query += ` AND e.stream_id = ?`
      params.push(filters.streamId)
    }
    if (filters?.isActive !== undefined) {
      query += ` AND s.is_active = ?`
      params.push(filters.isActive ? 1 : 0)
    }
    query += ` ORDER BY s.admission_number`
    return db.prepare(query).all(...params) as Student[]
  })

  ipcMain.handle('student:getById', async (_event: IpcMainInvokeEvent, id: number) => {
    const student = db.prepare('SELECT * FROM student WHERE id = ?').get(id) as Student | undefined
    if (student) {
      // Convert stored cents to shillings for display
      return {
        ...student,
        credit_balance: (student.credit_balance || 0) / 100
      }
    }
    return undefined
  })

  ipcMain.handle('student:create', async (_event: IpcMainInvokeEvent, data: StudentCreateData) => {
    const stmt = db.prepare(`INSERT INTO student (
      admission_number, first_name, middle_name, last_name, date_of_birth, gender,
      student_type, admission_date, guardian_name, guardian_phone, guardian_email,
      guardian_relationship, address, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    const result = stmt.run(
      data.admission_number, data.first_name, data.middle_name, data.last_name,
      data.date_of_birth, data.gender, data.student_type, data.admission_date,
      data.guardian_name, data.guardian_phone, data.guardian_email,
      data.guardian_relationship, data.address, data.notes
    )
    return { success: true, id: result.lastInsertRowid }
  })

  ipcMain.handle('student:update', async (_event: IpcMainInvokeEvent, id: number, data: Partial<StudentCreateData>) => {
    const student = db.prepare('SELECT * FROM student WHERE id = ?').get(id) as Student | undefined
    if (!student) return { success: false, error: 'Student not found' }

    const stmt = db.prepare(`UPDATE student SET 
            admission_number = ?, first_name = ?, middle_name = ?, last_name = ?,
            date_of_birth = ?, gender = ?, student_type = ?, admission_date = ?,
            guardian_name = ?, guardian_phone = ?, guardian_email = ?,
            guardian_relationship = ?, address = ?, notes = ?,
            is_active = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`)

    stmt.run(
      data.admission_number !== undefined ? data.admission_number : student.admission_number,
      data.first_name !== undefined ? data.first_name : student.first_name,
      data.middle_name !== undefined ? data.middle_name : student.middle_name,
      data.last_name !== undefined ? data.last_name : student.last_name,
      data.date_of_birth !== undefined ? data.date_of_birth : student.date_of_birth,
      data.gender !== undefined ? data.gender : student.gender,
      data.student_type !== undefined ? data.student_type : student.student_type,
      data.admission_date !== undefined ? data.admission_date : student.admission_date,
      data.guardian_name !== undefined ? data.guardian_name : student.guardian_name,
      data.guardian_phone !== undefined ? data.guardian_phone : student.guardian_phone,
      data.guardian_email !== undefined ? data.guardian_email : student.guardian_email,
      data.guardian_relationship !== undefined ? data.guardian_relationship : student.guardian_relationship,
      data.address !== undefined ? data.address : student.address,
      data.notes !== undefined ? data.notes : student.notes,
      data.is_active !== undefined ? (data.is_active ? 1 : 0) : student.is_active,
      id
    )
    return { success: true }
  })

  ipcMain.handle('student:getBalance', async (_event: IpcMainInvokeEvent, studentId: number) => {
    const invoices = db.prepare(`SELECT COALESCE(SUM(total_amount - amount_paid), 0) as balance 
      FROM fee_invoice WHERE student_id = ? AND status != 'CANCELLED'`).get(studentId) as { balance: number } | undefined
    return (invoices?.balance || 0) / 100
  })
}

















