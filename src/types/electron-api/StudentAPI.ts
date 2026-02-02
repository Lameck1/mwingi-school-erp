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

export interface StudentAPI {
  getStudents(filters?: StudentFilters): Promise<Student[]>
  getStudentById(id: number): Promise<Student>
  createStudent(data: Partial<Student>): Promise<{ success: boolean; id: number }>
  updateStudent(id: number, data: Partial<Student>): Promise<{ success: boolean }>
  getStudentBalance(studentId: number): Promise<number>
  // Attendance
  getStudentsForAttendance(streamId: number, yearId: number, termId: number): Promise<Student[]>
  getAttendanceByDate(streamId: number, date: string, yearId: number, termId: number): Promise<any[]>
  markAttendance(entries: any[], streamId: number, date: string, yearId: number, termId: number, userId: number): Promise<{ success: boolean; marked: number; errors?: string[] }>
  // Reports
  getStudentsForReportCards(streamId: number, yearId: number, termId: number): Promise<any[]>
}