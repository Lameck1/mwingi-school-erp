export interface FeeCollectionItem {
  amount: number
  payment_date: string
  payment_method: string
  count?: number
}

export interface DefaulterItem {
  id: number
  admission_number: string
  first_name: string
  last_name: string
  stream_name?: string
  total_amount: number
  amount_paid: number
  balance: number
  guardian_phone?: string
  due_date?: string
}

export interface BalanceSheetAccount {
  account_code: string
  account_name: string
  balance: number
}

export interface BalanceSheetReport {
  assets: BalanceSheetAccount[]
  liabilities: BalanceSheetAccount[]
  equity: BalanceSheetAccount[]
  total_assets: number
  total_liabilities: number
  total_equity: number
  net_income: number
  is_balanced: boolean
}

export interface ProfitAndLossCategory {
  category: string
  amount: number
  percentage: number
}

export interface ProfitAndLossReport {
  period_start: string
  period_end: string
  revenue_by_category: ProfitAndLossCategory[]
  expenses_by_category: ProfitAndLossCategory[]
  total_revenue: number
  total_expenses: number
  net_profit: number
}

export interface TrialBalanceAccount {
  account_code: string
  account_name: string
  debit_total: number
  credit_total: number
}

export interface TrialBalanceReport {
  accounts: TrialBalanceAccount[]
  total_debits: number
  total_credits: number
  is_balanced: boolean
}

export interface ReportCardStudentEntry {
  student_id: number
  student_name: string
  admission_number: string
  stream_name?: string
}

export interface ReportCardData {
  student: {
    id: number
    admission_number: string
    first_name: string
    last_name: string
    stream_name: string
  }
  academic_year: string
  term: string
  grades: Array<{
    subject_name: string
    subject_code: string
    cat1: number | null
    cat2: number | null
    midterm: number | null
    final_exam: number | null
    average: number
    grade_letter: string
    remarks: string
  }>
  attendance: {
    total_days: number
    present: number
    absent: number
    attendance_rate: number
  }
  summary: {
    total_marks: number
    average: number
    grade: string
    position: number | null
    class_size: number
    teacher_remarks: string
    principal_remarks: string
  }
}

export interface ReportsAPI {
  getFeeCollectionReport: (_startDate: string, _endDate: string) => Promise<FeeCollectionItem[]>
  getDefaulters: (_termId?: number) => Promise<DefaulterItem[]>
  getStudentLedgerReport: (studentId: number) => Promise<{ student?: Record<string, unknown>; ledger: Record<string, unknown>[]; openingBalance: number; closingBalance: number; error?: string }>
  getDashboardData: () => Promise<{
    totalStudents: number
    totalStaff: number
    feeCollected: number
    outstandingBalance: number
  }>
  getFeeCategoryBreakdown: () => Promise<{ name: string; value: number }[]>
  getRevenueByCategory: (startDate: string, endDate: string) => Promise<{ name: string; value: number }[]>
  getExpenseByCategory: (startDate: string, endDate: string) => Promise<{ name: string; value: number }[]>
  getDailyCollection: (date: string) => Promise<Array<{
    admission_number: string
    student_name: string
    stream_name?: string
    amount: number
    payment_method: string
    payment_reference?: string
    date?: string
    description?: string
  }>>
  getStudentsForReportCards: (streamId: number, academicYearId: number, termId: number) => Promise<ReportCardStudentEntry[]>
  generateReportCard: (studentId: number, yearId: number, termId: number) => Promise<ReportCardData | null>

  // Financial Reports
  getProfitAndLoss: (startDate: string, endDate: string) => Promise<{ success: boolean; data: ProfitAndLossReport; error?: string }>
  getBalanceSheet: (asOfDate: string) => Promise<{ success: boolean; data: BalanceSheetReport; error?: string }>
  getTrialBalance: (startDate: string, endDate: string) => Promise<{ success: boolean; data: TrialBalanceReport; error?: string }>
  getComparativeProfitAndLoss: (currentStart: string, currentEnd: string, priorStart: string, priorEnd: string) => Promise<{ success: boolean; data: ProfitAndLossReport; error?: string }>

  // Scheduled Reports
  getScheduledReports: () => Promise<ScheduledReport[]>
  createScheduledReport: (data: Partial<ScheduledReport>, userId: number) => Promise<{ success: boolean; id?: number; errors?: string[] }>
  updateScheduledReport: (id: number, data: Partial<ScheduledReport>, userId: number) => Promise<{ success: boolean; errors?: string[] }>
  deleteScheduledReport: (id: number, userId: number) => Promise<{ success: boolean; errors?: string[] }>
}

export interface ScheduledReport {
  id: number
  report_name: string
  report_type: string
  parameters: string
  schedule_type: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'TERM_END' | 'YEAR_END'
  day_of_week: number | null
  day_of_month: number | null
  time_of_day: string
  recipients: string
  export_format: 'PDF' | 'EXCEL' | 'CSV'
  is_active: boolean
  last_run_at: string | null
}
