import { ipcRenderer } from 'electron'

export function createReportsAPI() {
  return {
    getFeeCollectionReport: (startDate: string, endDate: string) => ipcRenderer.invoke('report:feeCollection', startDate, endDate),
    getStudentLedgerReport: (studentId: number) => ipcRenderer.invoke('report:studentLedger', studentId),
    getDefaulters: (termId?: number) => ipcRenderer.invoke('report:defaulters', termId),
    getDashboardData: () => ipcRenderer.invoke('report:dashboard'),
    getFeeCategoryBreakdown: () => ipcRenderer.invoke('report:feeCategoryBreakdown'),
    getRevenueByCategory: (startDate: string, endDate: string) => ipcRenderer.invoke('report:revenueByCategory', startDate, endDate),
    getExpenseByCategory: (startDate: string, endDate: string) => ipcRenderer.invoke('report:expenseByCategory', startDate, endDate),
    getDailyCollection: (date: string) => ipcRenderer.invoke('report:dailyCollection', date),
    getAuditLog: (limit?: number) => ipcRenderer.invoke('audit:getLog', limit),

    // Scheduled Reports
    getScheduledReports: () => ipcRenderer.invoke('scheduler:getAll'),
    createScheduledReport: (data: unknown, userId: number) => ipcRenderer.invoke('scheduler:create', data, userId),
    updateScheduledReport: (id: number, data: unknown, userId: number) => ipcRenderer.invoke('scheduler:update', id, data, userId),
    deleteScheduledReport: (id: number, userId: number) => ipcRenderer.invoke('scheduler:delete', id, userId),
  }
}
