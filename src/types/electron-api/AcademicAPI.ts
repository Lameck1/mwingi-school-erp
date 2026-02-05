
// Merit List Types
export interface StudentRanking {
  position: number;
  student_id: number;
  student_name: string;
  admission_number: string;
  total_marks: number;
  average_marks: number;
  grade: string;
  percentage: number;
  tied_with: number[];
}

export interface MeritListResult {
  id: number;
  academic_year_id: number;
  term_id: number;
  stream_id: number;
  exam_id: number;
  list_type: 'overall' | 'subject';
  total_students: number;
  generated_date: string;
  rankings: StudentRanking[];
}

export interface SubjectMeritListRow {
  student_id: number;
  student_name: string;
  admission_number: string;
  marks: number;
  percentage: number;
  position: number;
}

export interface PerformanceImprovement {
  student_id: number;
  student_name: string;
  previous_average: number;
  current_average: number;
  improvement_percentage: number;
  improvement_points: number;
  grade_improvement: string;
}

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

export interface AcademicSubject {
  id: number
  code: string
  name: string
  curriculum: string
  [key: string]: unknown
}

export interface AcademicExam {
  id: number
  name: string
  academic_year_id?: number
  term_id?: number
  weight?: number
  created_at?: string
  [key: string]: unknown
}

export interface TeacherAllocation {
  id: number
  subject_id: number
  stream_id: number
  teacher_id: number
  subject_name?: string
  stream_name?: string
  teacher_name?: string
  curriculum?: string
  [key: string]: unknown
}

export interface AcademicResult {
  student_id: number
  student_name?: string
  admission_number?: string
  score: number | null
  competency_level: number | null
  teacher_remarks?: string
  [key: string]: unknown
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
  getAcademicSubjects: () => Promise<AcademicSubject[]>
  getAcademicExams: (academicYearId: number, termId: number) => Promise<AcademicExam[]>
  createAcademicExam: (data: unknown, userId: number) => Promise<void>
  deleteAcademicExam: (id: number, userId: number) => Promise<void>
  allocateTeacher: (data: unknown, userId: number) => Promise<void>
  getTeacherAllocations: (academicYearId: number, termId: number, streamId?: number) => Promise<TeacherAllocation[]>
  saveAcademicResults: (examId: number, results: AcademicResult[], userId: number) => Promise<void>
  getAcademicResults: (examId: number, subjectId: number, streamId: number, userId: number) => Promise<AcademicResult[]>

  processAcademicResults: (examId: number, userId: number) => Promise<void>

  // Promotions
  getPromotionStreams: () => Promise<Stream[]>
  getNextStream: (currentStreamId: number) => Promise<Stream | null>


  getStudentsForPromotion: (streamId: number, academicYearId: number) => Promise<PromotionStudent[]>
  batchPromoteStudents: (studentIds: number[], fromStreamId: number, toStreamId: number, currentYearId: number, nextYearId: number, nextTermId: number, userId: number) => Promise<{ success: boolean; promoted: number; failed: number }>

  // Merit Lists & Analysis
  generateMeritList: (options: { academicYearId: number; termId: number; streamId: number }) => Promise<MeritListResult['rankings']>;
  generateClassMeritList: (examId: number, streamId: number) => Promise<MeritListResult>;
  getSubjectMeritList: (subjectId: number, examId: number) => Promise<SubjectMeritListRow[]>;
  getPerformanceImprovement: (studentId: number) => Promise<PerformanceImprovement[]>;

  // Awards
  getAwards: (filters?: { academicYearId?: number; termId?: number; status?: string }) => Promise<StudentAward[]>
  getAwardCategories: () => Promise<AwardCategory[]>
  awardStudent: (data: { studentId: number; categoryId: number; academicYearId: number; termId?: number; userId?: number; userRole?: string; remarks?: string }) => Promise<{ id: number | bigint; status: string; approval_status: string; auto_approved: boolean }>
  approveAward: (data: { awardId: number; userId?: number }) => Promise<void>
  rejectAward: (data: { awardId: number; userId?: number; reason: string }) => Promise<void>
  deleteAward: (data: { awardId: number }) => Promise<void>
  getPendingAwardsCount: () => Promise<number>

  // Analytics
  getExams: (filters: { academicYearId?: number; termId?: number }) => Promise<{ id: number; name: string }[]>
  getPerformanceSummary: (filters: { examId: number; streamId: number }) => Promise<PerformanceSummary>
  getGradeDistribution: (filters: { examId: number; streamId: number }) => Promise<GradeDistribution[]>
  getSubjectPerformance: (filters: { examId: number; streamId: number }) => Promise<SubjectPerformance[]>
  getStrugglingStudents: (filters: { examId: number; streamId: number; threshold: number }) => Promise<StrugglingStudent[]>
  exportAnalyticsToPDF: (data: { examId: number; summary: PerformanceSummary; grades: GradeDistribution[]; subjects: SubjectPerformance[] }) => Promise<void>
  getTermComparison: (filters: { examId: number; streamId: number }) => Promise<TermComparison[]>
  exportReportCardAnalyticsToPDF: (data: unknown) => Promise<void>
  getSubjectDifficulty: (filters: { examId: number; subjectId: number; streamId: number }) => Promise<SubjectDifficulty>

  // Timetable
  getVenues: () => Promise<unknown[]>
  generateExamTimetable: (config: unknown) => Promise<unknown>
  detectExamClashes: (filters: { examId: number }) => Promise<unknown[]>
  exportExamTimetableToPDF: (data: unknown) => Promise<void>
  getMostImprovedStudents: (filters: { academicYearId: number; currentTermId: number; comparisonTermId: number; streamId?: number; minimumImprovement: number }) => Promise<ImprovedStudent[]>
  generateCertificate: (data: { studentId: number; studentName: string; awardCategory: string; academicYearId: number; improvementPercentage: number }) => Promise<void>
  emailParents: (data: { students: ImprovedStudent[]; awardCategory: string; templateType: string }) => Promise<void>

  // Report Cards (Refactored)
  generateBatchReportCards: (data: { exam_id: number; stream_id: number; on_progress?: (progress: any) => void }) => Promise<{ success: boolean; generated: number; failed: number }>;
  emailReportCards: (data: { exam_id: number; stream_id: number; template_id: string; include_sms: boolean }) => Promise<{ success: boolean; sent: number; failed: number }>;
  mergeReportCards: (data: { exam_id: number; stream_id: number; output_path: string }) => Promise<{ success: boolean; message?: string }>;
  downloadReportCards: (data: { exam_id: number; stream_id: number; merge: boolean }) => Promise<{ success: boolean }>;

  // General Export
  exportToPDF: (data: { data: any; filename: string; title: string; subtitle: string }) => Promise<void>;
}

export interface ImprovedStudent {
  student_id: number
  admission_number: string
  student_name: string
  previous_term_average: number
  current_term_average: number
  improvement_percentage: number
  improvement_points: number
  grade_improvement: string
  subjects_improved: number
  subjects_declined: number
}

export interface TermComparison {
  term_name: string
  mean_score: number
  pass_rate: number
}

export interface SubjectDifficulty {
  difficulty_index: number
  discrimination_index: number
  verdict: string
  mean_score: number
  median_score: number
  pass_rate: number
  subject_id?: number
  subject_name?: string
}

export interface PerformanceSummary {
  mean_score: number
  median_score: number
  mode_score: number
  top_performer: string
  top_performer_score: number
  total_students: number
  pass_count: number
  pass_rate: number
  fail_count: number
  fail_rate: number
}

export interface GradeDistribution {
  grade: string
  count: number
  percentage: number
}

export interface SubjectPerformance {
  subject_name: string
  mean_score: number
  pass_rate: number
  difficulty_index: number
  discrimination_index: number
}

export interface StrugglingStudent {
  student_id: number
  student_name: string
  admission_number: string
  average_score: number
  needs_intervention: boolean
  recommended_action: string
}

export interface StudentAward {
  id: number
  student_id: number
  student_name?: string
  first_name?: string
  last_name?: string
  admission_number: string
  award_category_id: number
  category_name: string
  awarded_date: string
  approval_status: 'pending' | 'approved' | 'rejected'
  assigned_by_name?: string
  approved_by_name?: string
  approved_at?: string
  rejection_reason?: string
  certificate_number?: string
  remarks?: string
}

export interface AwardCategory {
  id: number
  name: string
  category_type: string
  description: string
}

export interface PromotionStudent {
  student_id: number
  student_name: string
  admission_number: string
  current_stream_name: string
  next_stream_name?: string
  average_score: number
  recommendation: string
}
