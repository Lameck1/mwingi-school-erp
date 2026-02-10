export interface StudentReportCard {
  student_id: number
  student_name: string
  admission_number: string
  stream_name: string
  academic_year: string
  term_name: string
  subjects: {
    subject_id: number
    subject_name: string
    marks: number
    grade: string
    percentage: number
    teacher_comment: string
    competency_level: string
  }[]
  total_marks: number
  average_marks: number
  overall_grade: string
  position_in_class: number
  position_in_stream: number
  learning_areas: {
    area_name: string
    competency_level: 'meets_expectations'
    teacher_comment: string
  }[]
  days_present: number
  days_absent: number
  attendance_percentage: number
  class_teacher_comment: string
  principal_comment: string
  next_term_begin_date: string
  fees_balance: number
  qr_code_token: string
  generated_at: string
  email_sent_at?: string
}

export interface StudentResult {
  id: number
  admission_number: string
  first_name: string
  last_name: string
  student_type?: string
  stream_id?: number
  balance?: number
}

export interface ExamResult {
  id: number
  academic_year_id: number
  term_id: number
}

export interface StreamResult {
  id: number
  stream_name: string
}

export interface AcademicYearResult {
  id: number
  year_name: string
}

export interface TermResult {
  id: number
  term_name: string
}

export interface SubjectGradeResult {
  subject_id: number
  subject_name: string
  marks: number
  grade: string
  percentage: number
  teacher_comment: string
  competency_level: string
}

export interface AttendanceResult {
  days_present: number
  days_absent: number
}

export interface ClassPositionResult {
  position: number
}

export interface FeeBalanceResult {
  balance: number
}

export interface LearningAreaResult {
  area_name: string
  competency_level: string
  teacher_comment: string
}

export interface ReportCardRecord {
  id: number
  stream_id: number
  total_marks: number
  average_marks: number
  overall_grade: string
  position_in_class: number
  position_in_stream: number
  attendance_days_present: number
  attendance_days_absent: number
  attendance_percentage: number
  class_teacher_remarks: string
  principal_remarks: string
  qr_code_token: string
  generated_at: string
  email_sent_at?: string
}

export interface ReportCardSubjectRecord {
  subject_id: number
  marks: number
  grade: string
  percentage: number
  teacher_comment: string
  competency_level: string
}
