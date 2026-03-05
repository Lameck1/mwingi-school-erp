import type { AttendanceStudent, AttendanceRecord, AttendanceEntry } from './StudentAPI'
import type { ReportCardStudentEntry, ReportCardData } from './ReportsAPI'

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
  term_number?: number | undefined
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
  is_compulsory?: boolean | number | undefined
  is_active?: boolean | number | undefined
}

export interface AcademicExam {
  id: number
  name: string
  academic_year_id?: number | undefined
  term_id?: number | undefined
  weight?: number | undefined
  created_at?: string | undefined
}

export interface TeacherAllocation {
  id: number
  subject_id: number
  stream_id: number
  teacher_id: number
  subject_name?: string | undefined
  stream_name?: string | undefined
  teacher_name?: string | undefined
  curriculum?: string | undefined
}

export interface AcademicResult {
  student_id: number
  student_name?: string | undefined
  admission_number?: string | undefined
  score: number | null
  competency_level: number | null
  teacher_remarks?: string | undefined
}

export interface PromotionBatchFailure {
  student_id: number
  reason: string
}

export interface PromotionBatchResult {
  success: boolean
  promoted: number
  failed: number
  errors?: string[]
  failureDetails?: PromotionBatchFailure[]
}

type IPCResult<T> = T | { success: false; error: string; errors?: string[] };

export interface ExamTimetableSlot {
  id: number
  subject_id: number
  subject_name: string
  start_date: string
  end_date: string
  start_time: string
  end_time: string
  venue_id: number
  venue_name: string
  max_capacity: number
  enrolled_students: number
}

export interface ExamTimetableClash {
  subject1_id: number
  subject1_name: string
  subject2_id: number
  subject2_name: string
  clash_type: string
  affected_students: number
}

export interface ExamTimetableStats {
  total_slots: number
  total_students: number
  venues_used: number
  average_capacity_usage: number
}

export interface ExamTimetableResult {
  slots: ExamTimetableSlot[]
  clashes: ExamTimetableClash[]
  stats: ExamTimetableStats
}

export interface AcademicAPI {
  // Academic Year & Terms
  getAcademicYears: () => Promise<IPCResult<AcademicYear[]>>
  getCurrentAcademicYear: () => Promise<IPCResult<AcademicYear>>
  createAcademicYear: (_data: Partial<AcademicYear>) => Promise<IPCResult<{ success: boolean }>>
  activateAcademicYear: (id: number) => Promise<IPCResult<{ success: boolean }>>
  getTermsByYear: (_yearId: number) => Promise<IPCResult<Term[]>>
  getCurrentTerm: () => Promise<IPCResult<Term>>

  // Streams
  getStreams: () => Promise<IPCResult<Stream[]>>

  // Academic System (New)
  getAcademicSubjects: () => Promise<IPCResult<AcademicSubject[]>>
  getAcademicSubjectsAdmin: () => Promise<IPCResult<AcademicSubject[]>>
  createAcademicSubject: (data: Partial<AcademicSubject>, userId: number) => Promise<IPCResult<{ success: boolean; id: number }>>
  updateAcademicSubject: (id: number, data: Partial<AcademicSubject>, userId: number) => Promise<IPCResult<{ success: boolean }>>
  setAcademicSubjectActive: (id: number, isActive: boolean, userId: number) => Promise<IPCResult<{ success: boolean }>>
  getAcademicExams: (academicYearId: number, termId: number) => Promise<IPCResult<AcademicExam[]>>
  createAcademicExam: (data: unknown, userId: number) => Promise<IPCResult<void>>
  deleteAcademicExam: (id: number, userId: number) => Promise<IPCResult<void>>
  allocateTeacher: (data: unknown, userId: number) => Promise<IPCResult<void>>
  getTeacherAllocations: (academicYearId: number, termId: number, streamId?: number) => Promise<IPCResult<TeacherAllocation[]>>
  deleteTeacherAllocation: (allocationId: number, userId: number) => Promise<IPCResult<void>>
  saveAcademicResults: (examId: number, results: AcademicResult[], userId: number) => Promise<IPCResult<void>>
  getAcademicResults: (examId: number, subjectId: number, streamId: number, userId: number) => Promise<IPCResult<AcademicResult[]>>

  processAcademicResults: (examId: number, userId: number) => Promise<IPCResult<void>>

  // Promotions
  getPromotionStreams: () => Promise<IPCResult<Stream[]>>
  getNextStream: (currentStreamId: number) => Promise<IPCResult<Stream | null>>


  getStudentsForPromotion: (streamId: number, academicYearId: number) => Promise<IPCResult<PromotionStudent[]>>
  batchPromoteStudents: (studentIds: number[], fromStreamId: number, toStreamId: number, currentYearId: number, nextYearId: number, nextTermId: number, userId: number) => Promise<PromotionBatchResult>

  // Merit Lists & Analysis
  generateMeritList: (options: { academicYearId: number; termId: number; streamId: number }) => Promise<IPCResult<MeritListResult['rankings']>>;
  generateClassMeritList: (examId: number, streamId: number) => Promise<IPCResult<MeritListResult>>;
  getSubjectMeritList: (filters: { examId: number; subjectId: number; streamId: number }) => Promise<IPCResult<SubjectMeritListRow[]>>;
  getPerformanceImprovement: (studentId: number) => Promise<IPCResult<PerformanceImprovement[]>>;

  // Awards
  getAwards: (filters?: { academicYearId?: number | undefined; termId?: number | undefined; status?: string | undefined }) => Promise<IPCResult<StudentAward[]>>
  getAwardCategories: () => Promise<IPCResult<AwardCategory[]>>
  awardStudent: (data: { studentId: number; categoryId: number; academicYearId: number; termId?: number | undefined; userId?: number | undefined; userRole?: string | undefined; remarks?: string | undefined }) => Promise<IPCResult<{ id: number | bigint; status: string; approval_status: string; auto_approved: boolean }>>
  approveAward: (data: { awardId: number; userId?: number | undefined }) => Promise<IPCResult<{ status: string; message?: string }>>
  rejectAward: (data: { awardId: number; userId?: number | undefined; reason: string }) => Promise<IPCResult<{ status: string; message?: string }>>
  deleteAward: (data: { awardId: number }) => Promise<IPCResult<{ status: string; message?: string }>>
  getPendingAwardsCount: () => Promise<IPCResult<number>>

  // Analytics
  getExams: (filters: { academicYearId?: number | undefined; termId?: number | undefined }) => Promise<IPCResult<{ id: number; name: string }[]>>
  getPerformanceSummary: (filters: { examId: number; streamId: number }) => Promise<IPCResult<PerformanceSummary>>
  getGradeDistribution: (filters: { examId: number; streamId: number }) => Promise<IPCResult<GradeDistribution[]>>
  getSubjectPerformance: (filters: { examId: number; streamId: number }) => Promise<IPCResult<SubjectPerformance[]>>
  getStrugglingStudents: (filters: { examId: number; streamId: number; threshold: number }) => Promise<IPCResult<StrugglingStudent[]>>
  getTermComparison: (filters: { examId: number; streamId: number }) => Promise<IPCResult<TermComparison[]>>
  getSubjectDifficulty: (filters: { examId: number; subjectId: number; streamId: number }) => Promise<IPCResult<SubjectDifficulty>>

  // Timetable
  getVenues: () => Promise<IPCResult<unknown[]>>
  generateExamTimetable: (config: unknown) => Promise<IPCResult<ExamTimetableResult>>
  detectExamClashes: (filters: { examId: number }) => Promise<IPCResult<ExamTimetableClash[]>>
  exportExamTimetableToPDF: (data: unknown) => Promise<IPCResult<{ success: boolean; filePath?: string; error?: string }>>
  getMostImprovedStudents: (filters: { academicYearId: number; currentTermId: number; comparisonTermId: number; streamId?: number; minimumImprovement: number }) => Promise<IPCResult<ImprovedStudent[]>>
  generateCertificate: (data: { studentId: number; studentName: string; awardCategory: string; academicYearId: number; improvementPercentage: number }) => Promise<IPCResult<{ success: boolean; message?: string; filePath?: string }>>
  emailParents: (data: { students: ImprovedStudent[]; awardCategory: string; templateType: string }, userId: number) => Promise<IPCResult<{ success: boolean; message?: string; sent?: number; failed?: number; errors?: string[] }>>

  // Attendance
  getStudentsForAttendance: (streamId: number, academicYearId: number, termId: number) => Promise<IPCResult<AttendanceStudent[]>>
  getAttendanceByDate: (streamId: number, date: string, academicYearId: number, termId: number) => Promise<IPCResult<AttendanceRecord[]>>
  markAttendance: (entries: AttendanceEntry[], streamId: number, date: string, academicYearId: number, termId: number, userId: number) => Promise<{ success: boolean; marked: number; errors?: string[] }>

  // Report Cards (individual)
  getStudentsForReportCards: (streamId: number, academicYearId: number, termId: number) => Promise<IPCResult<ReportCardStudentEntry[]>>
  generateReportCard: (studentId: number, academicYearId: number, termId: number) => Promise<IPCResult<ReportCardData | null>>

  // Report Cards (Refactored)
  generateBatchReportCards: (data: { exam_id: number; stream_id: number }) => Promise<{ success: boolean; generated: number; failed: number; total?: number; failures?: Array<{ student_id: number; error: string }> }>;
  emailReportCards: (data: { exam_id: number; stream_id: number; template_id: string; include_sms: boolean }) => Promise<{ success: boolean; sent: number; failed: number }>;
  mergeReportCards: (data: { exam_id: number; stream_id: number; output_path: string }) => Promise<{ success: boolean; message?: string; filePath?: string; failed?: number }>;
  downloadReportCards: (data: { exam_id: number; stream_id: number; merge: boolean }) => Promise<{ success: boolean; filePath?: string; files?: string[]; fileRecords?: Array<{ studentId: number; filePath: string }>; failed?: number; message?: string }>;
  // General Export
  exportToPDF: (data: { html?: string; content?: string; filename?: string; title?: string }) => Promise<{ success: boolean; filePath?: string; error?: string }>;
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
  student_name?: string | undefined
  first_name?: string | undefined
  last_name?: string | undefined
  admission_number: string
  award_category_id: number
  category_name: string
  awarded_date: string
  approval_status: 'pending' | 'approved' | 'rejected'
  assigned_by_name?: string | undefined
  approved_by_name?: string | undefined
  approved_at?: string | undefined
  rejection_reason?: string | undefined
  certificate_number?: string | undefined
  remarks?: string | undefined
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
