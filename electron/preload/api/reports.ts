import { ipcRenderer } from 'electron'

import type { ScheduledReportData } from '../types'

export function createReportsAPI() {
  return {
    getFeeCollectionReport: (startDate: string, endDate: string) => ipcRenderer.invoke('report:feeCollection', startDate, endDate),
    getStudentLedgerReport: async (studentId: number) => {
      const academicYear = await ipcRenderer.invoke('academicYear:getCurrent') as { id?: number } | undefined
      if (!academicYear?.id) {
        return { student: undefined, ledger: [], openingBalance: 0, closingBalance: 0, error: 'No academic year configured' }
      }

      const result = await ipcRenderer.invoke(
        'reports:getStudentLedger',
        studentId,
        academicYear.id,
        '1900-01-01',
        '2999-12-31'
      ) as {
        data?: {
          closing_balance: number
          opening_balance: number
          student: { admission_number: string; full_name: string }
          transactions: Array<{
            balance: number
            credit: number
            date: string
            debit: number
            description: string
            ref?: string
          }>
        }
        error?: string
        success?: boolean
      }

      if (!result.success || !result.data) {
        return {
          student: undefined,
          ledger: [],
          openingBalance: 0,
          closingBalance: 0,
          error: result.error || 'Failed to generate student ledger'
        }
      }

      const ledger = result.data.transactions.map((transaction) => ({
        transaction_date: transaction.date,
        debit_credit: transaction.debit > 0 ? 'DEBIT' : 'CREDIT',
        amount: transaction.debit > 0 ? transaction.debit : transaction.credit,
        description: transaction.description,
        ref: transaction.ref ?? '',
        runningBalance: transaction.balance
      }))

      return {
        student: result.data.student,
        openingBalance: result.data.opening_balance,
        ledger,
        closingBalance: result.data.closing_balance
      }
    },
    getDefaulters: (termId?: number) => ipcRenderer.invoke('report:defaulters', termId),
    getDashboardData: () => ipcRenderer.invoke('report:dashboard'),
    getFeeCategoryBreakdown: () => ipcRenderer.invoke('report:feeCategoryBreakdown'),
    getRevenueByCategory: (startDate: string, endDate: string) => ipcRenderer.invoke('report:revenueByCategory', startDate, endDate),
    getExpenseByCategory: (startDate: string, endDate: string) => ipcRenderer.invoke('report:expenseByCategory', startDate, endDate),
    getDailyCollection: (date: string) => ipcRenderer.invoke('report:dailyCollection', date),
    getAuditLog: (limit?: number) => ipcRenderer.invoke('audit:getLog', limit),

    // Scheduled Reports
    getScheduledReports: () => ipcRenderer.invoke('scheduler:getAll'),
    createScheduledReport: (data: ScheduledReportData, userId: number) => ipcRenderer.invoke('scheduler:create', data, userId),
    updateScheduledReport: (id: number, data: Partial<ScheduledReportData>, userId: number) => ipcRenderer.invoke('scheduler:update', id, data, userId),
    deleteScheduledReport: (id: number, userId: number) => ipcRenderer.invoke('scheduler:delete', id, userId),
    downloadReportCardPDF: (html: string, filename?: string) => ipcRenderer.invoke('reportcard:download-pdf', html, filename),
  }
}
