export interface AcademicYear {
  id: number
  year_name: string
  start_date: string
  end_date: string
  is_current: boolean
  created_at: string
  updated_at: string
}

export interface Term {
  id: number
  term_name: string
  start_date: string
  end_date: string
  academic_year_id: number
  is_current: boolean
  created_at: string
  updated_at: string
}

// Export alias for compatibility if needed, though usually better to use consistent naming
export type AcademicTerm = Term;

export interface Stream {
  id: number
  stream_name: string
  level_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AcademicAPI {
  // Academic Year & Terms
  getAcademicYears: () => Promise<AcademicYear[]>
  getCurrentAcademicYear: () => Promise<AcademicYear>
  createAcademicYear: (_data: Partial<AcademicYear>) => Promise<{ success: boolean; id: number }>
  activateAcademicYear: (id: number) => Promise<{ success: boolean }>
  getTermsByYear: (_yearId: number) => Promise<Term[]>
  getCurrentTerm: () => Promise<Term>

  // Streams
  getStreams: () => Promise<Stream[]>

  // Academic System (New)
  getAcademicSubjects: () => Promise<any[]>
  getAcademicExams: (academicYearId: number, termId: number) => Promise<any[]>
  createAcademicExam: (data: any, userId: number) => Promise<void>
  deleteAcademicExam: (id: number, userId: number) => Promise<void>
  allocateTeacher: (data: any, userId: number) => Promise<void>
  getTeacherAllocations: (academicYearId: number, termId: number, streamId?: number) => Promise<any[]>
  saveAcademicResults: (examId: number, results: any[], userId: number) => Promise<void>
  getAcademicResults: (examId: number, subjectId: number, streamId: number, userId: number) => Promise<any[]>
  processAcademicResults: (examId: number, userId: number) => Promise<void>
}
