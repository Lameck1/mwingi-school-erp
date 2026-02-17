import type { ReportCardStudentEntry } from './ReportsAPI'

export interface Student {
  id: number
  admission_number: string
  first_name: string
  middle_name: string
  last_name: string
  full_name?: string
  email: string
  phone: string
  date_of_birth: string
  gender: 'MALE' | 'FEMALE'
  address: string
  guardian_name: string
  guardian_phone: string
  guardian_email: string
  guardian_relationship?: string | null
  notes?: string | null
  stream_id: number
  student_type: 'BOARDER' | 'DAY_SCHOLAR'
  admission_date: string
  is_active: boolean
  created_at: string
  updated_at: string
  // Calculated fields
  stream_name?: string
  balance?: number
  credit_balance?: number
}

export interface StudentFilters {
  stream_id?: number
  is_active?: boolean
  search?: string
}

export interface AttendanceStudent {
  student_id: number
  student_name: string
  admission_number: string
}

export interface AttendanceRecord {
  id: number
  student_id: number
  stream_id: number
  academic_year_id: number
  term_id: number
  attendance_date: string
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'
  notes: string | null
  marked_by_user_id: number
  created_at: string
  student_name?: string
  admission_number?: string
}

export interface AttendanceEntry {
  student_id: number
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'
  notes?: string
}

export interface StudentAPI {
  getStudents(filters?: StudentFilters): Promise<Student[]>
  getStudentById(id: number): Promise<Student>
  createStudent(data: Partial<Student>, userId?: number): Promise<{ success: boolean; id: number; invoiceGenerated?: boolean; invoiceNumber?: string; invoiceError?: string }>
  updateStudent(id: number, data: Partial<Student>): Promise<{ success: boolean }>
  getStudentBalance(studentId: number): Promise<number>
  purgeStudent(id: number, reason?: string): Promise<{ success: boolean; message?: string; error?: string }>
  // Attendance
  getStudentsForAttendance(streamId: number, yearId: number, termId: number): Promise<AttendanceStudent[]>
  getAttendanceByDate(streamId: number, date: string, yearId: number, termId: number): Promise<AttendanceRecord[]>
  markAttendance(entries: AttendanceEntry[], streamId: number, date: string, yearId: number, termId: number, userId: number): Promise<{ success: boolean; marked: number; errors?: string[] }>
  // Reports
  getStudentsForReportCards(streamId: number, yearId: number, termId: number): Promise<ReportCardStudentEntry[]>
}
