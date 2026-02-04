export interface EligibleStudent {
  student_id: number
  admission_number: string
  full_name: string
  current_grade: number
  boarding_status: 'DAY' | 'BOARDER'
  outstanding_balance: number
}

export interface JSSFeeStructure {
  id: number
  fiscal_year: number
  jss_grade: number
  tuition_fee: number
  boarding_fee: number
  activity_fee: number
  total_fee: number
  tuition_fee_cents?: number
  boarding_fee_cents?: number
  activity_fee_cents?: number
  exam_fee_cents?: number
  library_fee_cents?: number
  lab_fee_cents?: number
  ict_fee_cents?: number
}

export interface TransitionResult {
  successful: number[]
  failed: Array<{
    student_id: number
    error: string
  }>
}

export interface BulkTransitionData {
  student_ids: number[]
  from_grade: number
  to_grade: number
  transition_date: string
  processed_by: number
}

export interface SingleTransitionData {
  student_id: number;
  from_grade: number;
  to_grade: number;
  transition_date: string;
  boarding_status_change?: 'TO_BOARDER' | 'TO_DAY_SCHOLAR' | 'NO_CHANGE';
  transition_notes?: string;
  processed_by: number;
}

export interface JSSFeeStructureInput {
    grade: number;
    fiscal_year: number;
    tuition_fee: number;
    boarding_fee?: number;
    activity_fee?: number;
    exam_fee?: number;
    library_fee?: number;
    lab_fee?: number;
    ict_fee?: number;
}

export interface TransitionSummary {
  fiscal_year: number;
  total_transitions: number;
  grade_6_to_7: number;
  grade_7_to_8: number;
  grade_8_to_9: number;
  to_boarder_count: number;
  to_day_scholar_count: number;
  avg_outstanding_balance_cents: number;
  total_outstanding_balance_cents: number;
}

export interface GradeTransition {
  id: number;
  student_id: number;
  from_grade: number;
  to_grade: number;
  transition_date: string;
  old_fee_structure_id?: number;
  new_fee_structure_id: number;
  outstanding_balance_cents: number;
  boarding_status_change?: 'TO_BOARDER' | 'TO_DAY_SCHOLAR' | 'NO_CHANGE';
  transition_notes?: string;
  processed_by: number;
  created_at: string;
}

export interface JSSAPI {
  initiateTransition: (data: SingleTransitionData) => Promise<{ success: boolean; data?: number; message?: string }>
  bulkTransition: (data: BulkTransitionData) => Promise<{ success: boolean; data?: TransitionResult; message?: string }>
  getEligibleStudents: (fromGrade: number, fiscalYear: number) => Promise<{ success: boolean; data: EligibleStudent[]; message?: string }>
  getJSSFeeStructure: (grade: number, fiscalYear: number) => Promise<{ success: boolean; data: JSSFeeStructure | null; message?: string }>
  setJSSFeeStructure: (data: JSSFeeStructureInput) => Promise<{ success: boolean; data?: number; message?: string }>
  getTransitionReport: (studentId: number) => Promise<{ success: boolean; data: GradeTransition[]; message?: string }>
  getTransitionSummary: (fiscalYear: number) => Promise<{ success: boolean; data: TransitionSummary; message?: string }>
}
