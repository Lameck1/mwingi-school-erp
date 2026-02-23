import type { ReportCardStudentEntry } from './ReportsAPI'

export interface Student {
  id: number
  admission_number: string
  first_name: string
  middle_name: string | null | undefined
  last_name: string
  full_name?: string | undefined
  email: string | null | undefined
  phone: string | null | undefined
  date_of_birth: string | null | undefined
  gender: 'MALE' | 'FEMALE'
  address: string | null | undefined
  guardian_name: string | null | undefined
  guardian_phone: string | null | undefined
  guardian_email: string | null | undefined
  guardian_relationship?: string | null | undefined
  notes?: string | null | undefined
  stream_id: number | null | undefined
  student_type: 'BOARDER' | 'DAY_SCHOLAR'
  admission_date: string | null | undefined
  is_active: boolean
  photo_path?: string | null | undefined
  created_at: string
  updated_at: string
  // Calculated fields
  stream_name?: string | undefined
  balance?: number | undefined
  credit_balance?: number | undefined
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

type IPCResult<T> = T | { success: false; error: string; errors?: string[] };

export interface StudentAPI {
  getStudents(filters?: StudentFilters): Promise<IPCResult<Student[]>>
  getStudentById(id: number): Promise<IPCResult<Student>>
  createStudent(data: Partial<Student>, userId?: number): Promise<{ success: boolean; id: number; invoiceGenerated?: boolean; invoiceNumber?: string; invoiceError?: string }>
  updateStudent(id: number, data: Partial<Student>): Promise<{ success: boolean }>
  uploadStudentPhoto(studentId: number, dataUrl: string): Promise<{ success: boolean; filePath?: string; error?: string }>
  removeStudentPhoto(studentId: number): Promise<{ success: boolean; error?: string }>
  getStudentPhotoDataUrl(studentId: number): Promise<string | null>
  getStudentBalance(studentId: number): Promise<number>
  purgeStudent(id: number, reason?: string): Promise<{ success: boolean; message?: string; error?: string }>
  // Attendance
  getStudentsForAttendance(streamId: number, yearId: number, termId: number): Promise<IPCResult<AttendanceStudent[]>>
  getAttendanceByDate(streamId: number, date: string, yearId: number, termId: number): Promise<IPCResult<AttendanceRecord[]>>
  markAttendance(entries: AttendanceEntry[], streamId: number, date: string, yearId: number, termId: number, userId: number): Promise<{ success: boolean; marked: number; errors?: string[] }>
  // Reports
  getStudentsForReportCards(streamId: number, yearId: number, termId: number): Promise<IPCResult<ReportCardStudentEntry[]>>
}
