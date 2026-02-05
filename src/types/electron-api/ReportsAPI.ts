export interface FeeCollectionItem {
  student_id: number
  student_name: string
  class_name: string
  amount: number
  payment_date: string
  payment_method: string
  reference: string
}

export interface DefaulterItem {
  student_id: number
  student_name: string
  class_name: string
  outstanding_amount: number
  due_date: string
  days_overdue: number
}

export interface ReportsAPI {
  getFeeCollectionReport: (_startDate: string, _endDate: string) => Promise<FeeCollectionItem[]>
  getDefaulters: (_termId?: number) => Promise<DefaulterItem[]>
  getStudentLedgerReport: (studentId: number) => Promise<{ ledger: Record<string, unknown>[]; openingBalance: number; closingBalance: number }>
  getDashboardData: () => Promise<{
    totalStudents: number
    totalStaff: number
    feeCollected: number
    outstandingBalance: number
  }>
  getFeeCategoryBreakdown: () => Promise<{ name: string; value: number }[]>
  getRevenueByCategory: (startDate: string, endDate: string) => Promise<{ name: string; value: number }[]>
  getExpenseByCategory: (startDate: string, endDate: string) => Promise<{ name: string; value: number }[]>
  getDailyCollection: (date: string) => Promise<{ date: string; amount: number; method: string }[]>
  generateReportCard: (studentId: number, yearId: number, termId: number) => Promise<{ success: boolean; filePath?: string; error?: string }>

  // Financial Reports
  getProfitAndLoss: (startDate: string, endDate: string) => Promise<{ success: boolean; data: Record<string, unknown>; message?: string }>
  getBalanceSheet: (asOfDate: string) => Promise<{ success: boolean; data: Record<string, unknown>; message?: string }>
  getTrialBalance: (startDate: string, endDate: string) => Promise<{ success: boolean; data: Record<string, unknown>; message?: string }>
  getComparativeProfitAndLoss: (currentStart: string, currentEnd: string, priorStart: string, priorEnd: string) => Promise<{ success: boolean; data: Record<string, unknown>; message?: string }>
}
