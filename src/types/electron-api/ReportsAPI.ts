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
  getDefaulters: (_termId?: number) => Promise<any[]>
  getStudentLedgerReport: (studentId: number) => Promise<any>
  getDashboardData: () => Promise<{
    totalStudents: number
    totalStaff: number
    feeCollected: number
    outstandingBalance: number
  }>
  getFeeCategoryBreakdown: () => Promise<{ name: string; value: number }[]>
}