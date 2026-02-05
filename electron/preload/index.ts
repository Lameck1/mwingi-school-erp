import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Auth
  login: (username: string, password: string) => ipcRenderer.invoke('auth:login', username, password),
  changePassword: (userId: number, oldPassword: string, newPassword: string) =>
    ipcRenderer.invoke('auth:changePassword', userId, oldPassword, newPassword),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  getSchoolSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (data: unknown) => ipcRenderer.invoke('settings:update', data),
  getAllConfigs: () => ipcRenderer.invoke('settings:getAllConfigs'),
  saveSecureConfig: (key: string, value: string) => ipcRenderer.invoke('settings:saveSecure', key, value),
  resetAndSeedDatabase: (userId: number) => ipcRenderer.invoke('system:resetAndSeed', userId),

  // Academic
  getAcademicYears: () => ipcRenderer.invoke('academicYear:getAll'),
  getCurrentAcademicYear: () => ipcRenderer.invoke('academicYear:getCurrent'),
  createAcademicYear: (data: unknown) => ipcRenderer.invoke('academicYear:create', data),
  activateAcademicYear: (id: number) => ipcRenderer.invoke('academicYear:activate', id),
  getTermsByYear: (yearId: number) => ipcRenderer.invoke('term:getByYear', yearId),
  getCurrentTerm: () => ipcRenderer.invoke('term:getCurrent'),
  getStreams: () => ipcRenderer.invoke('stream:getAll'),

  // Finance
  getFeeCategories: () => ipcRenderer.invoke('fee:getCategories'),
  createFeeCategory: (name: string, description: string) => ipcRenderer.invoke('fee:createCategory', name, description),
  getFeeStructure: (yearId: number, termId: number) => ipcRenderer.invoke('fee:getStructure', yearId, termId),
  saveFeeStructure: (data: unknown, yearId: number, termId: number) => ipcRenderer.invoke('fee:saveStructure', data, yearId, termId),
  generateBatchInvoices: (yearId: number, termId: number, userId: number) => ipcRenderer.invoke('invoice:generateBatch', yearId, termId, userId),
  getInvoices: () => ipcRenderer.invoke('invoice:getAll'),
  getInvoicesByStudent: (studentId: number) => ipcRenderer.invoke('invoice:getByStudent', studentId),
  getInvoiceItems: (invoiceId: number) => ipcRenderer.invoke('invoice:getItems', invoiceId),
  recordPayment: (data: unknown, userId: number) => ipcRenderer.invoke('payment:record', data, userId),
  getPaymentsByStudent: (studentId: number) => ipcRenderer.invoke('payment:getByStudent', studentId),
  payWithCredit: (data: unknown, userId: number) => ipcRenderer.invoke('payment:payWithCredit', data, userId),
  getCashFlowStatement: (startDate: string, endDate: string) => ipcRenderer.invoke('finance:getCashFlow', startDate, endDate),
  getForecast: (months: number) => ipcRenderer.invoke('finance:getForecast', months),

  // Transactions

  // Budgeting
  getBudgets: (filters?: unknown) => ipcRenderer.invoke('budget:getAll', filters),
  getBudgetById: (id: number) => ipcRenderer.invoke('budget:getById', id),
  createBudget: (data: unknown, userId: number) => ipcRenderer.invoke('budget:create', data, userId),
  updateBudget: (id: number, data: unknown, userId: number) => ipcRenderer.invoke('budget:update', id, data, userId),
  submitBudgetForApproval: (budgetId: number, userId: number) => ipcRenderer.invoke('budget:submit', budgetId, userId),
  approveBudget: (budgetId: number, userId: number) => ipcRenderer.invoke('budget:approve', budgetId, userId),

  // Transactions
  getTransactionCategories: () => ipcRenderer.invoke('transaction:getCategories'),
  createTransactionCategory: (name: string, type: string) => ipcRenderer.invoke('transaction:createCategory', name, type),
  createTransaction: (data: unknown, userId: number) => ipcRenderer.invoke('transaction:create', data, userId),
  getTransactions: (filters?: unknown) => ipcRenderer.invoke('transaction:getAll', filters),
  getTransactionSummary: (startDate: string, endDate: string) => ipcRenderer.invoke('transaction:getSummary', startDate, endDate),

  // Students
  getStudents: (filters?: unknown) => ipcRenderer.invoke('student:getAll', filters),
  getStudentById: (id: number) => ipcRenderer.invoke('student:getById', id),
  createStudent: (data: unknown) => ipcRenderer.invoke('student:create', data),
  updateStudent: (id: number, data: unknown) => ipcRenderer.invoke('student:update', id, data),
  getStudentBalance: (studentId: number) => ipcRenderer.invoke('student:getBalance', studentId),

  // Staff
  getStaff: () => ipcRenderer.invoke('staff:getAll'),
  getStaffById: (id: number) => ipcRenderer.invoke('staff:getById', id),
  createStaff: (data: unknown) => ipcRenderer.invoke('staff:create', data),
  updateStaff: (id: number, data: unknown) => ipcRenderer.invoke('staff:update', id, data),

  // Payroll
  getPayrollHistory: () => ipcRenderer.invoke('payroll:getHistory'),
  getPayrollDetails: (periodId: number) => ipcRenderer.invoke('payroll:getDetails', periodId),
  runPayroll: (month: number, year: number, userId: number) => ipcRenderer.invoke('payroll:run', month, year, userId),

  // Staff Allowances
  getStaffAllowances: (staffId: number) => ipcRenderer.invoke('staff:getAllowances', staffId),
  addStaffAllowance: (staffId: number, allowanceName: string, amount: number) => ipcRenderer.invoke('staff:addAllowance', staffId, allowanceName, amount),
  deleteStaffAllowance: (allowanceId: number) => ipcRenderer.invoke('staff:deleteAllowance', allowanceId),

  // Inventory
  getInventory: () => ipcRenderer.invoke('inventory:getAll'),
  getLowStockItems: () => ipcRenderer.invoke('inventory:getLowStock'),
  getInventoryCategories: () => ipcRenderer.invoke('inventory:getCategories'),
  createInventoryItem: (data: unknown) => ipcRenderer.invoke('inventory:createItem', data),
  recordStockMovement: (data: unknown, userId: number) => ipcRenderer.invoke('inventory:recordMovement', data, userId),
  getSuppliers: () => ipcRenderer.invoke('inventory:getSuppliers'),

  // Reports
  getFeeCollectionReport: (startDate: string, endDate: string) => ipcRenderer.invoke('report:feeCollection', startDate, endDate),
  getStudentLedgerReport: (studentId: number) => ipcRenderer.invoke('report:studentLedger', studentId),
  getDefaulters: (termId?: number) => ipcRenderer.invoke('report:defaulters', termId),
  getDashboardData: () => ipcRenderer.invoke('report:dashboard'),
  getFeeCategoryBreakdown: () => ipcRenderer.invoke('report:feeCategoryBreakdown'),
  getRevenueByCategory: (startDate: string, endDate: string) => ipcRenderer.invoke('report:revenueByCategory', startDate, endDate),
  getExpenseByCategory: (startDate: string, endDate: string) => ipcRenderer.invoke('report:expenseByCategory', startDate, endDate),
  getDailyCollection: (date: string) => ipcRenderer.invoke('report:dailyCollection', date),
  getAuditLog: (limit?: number) => ipcRenderer.invoke('audit:getLog', limit),

  // Messaging
  sendSMS: (options: unknown) => ipcRenderer.invoke('message:sendSms', options),
  sendEmail: (options: unknown) => ipcRenderer.invoke('message:sendEmail', options),
  getMessageTemplates: () => ipcRenderer.invoke('message:getTemplates'),
  saveMessageTemplate: (template: unknown) => ipcRenderer.invoke('message:saveTemplate', template),
  getMessageLogs: (limit?: number) => ipcRenderer.invoke('message:getLogs', limit),

  // Backup
  createBackup: () => ipcRenderer.invoke('backup:create'),
  restoreBackup: (filePath: string) => ipcRenderer.invoke('backup:restore', filePath),
  getBackupList: () => ipcRenderer.invoke('backup:getList'),

  // Users
  getUsers: () => ipcRenderer.invoke('user:getAll'),
  createUser: (data: unknown) => ipcRenderer.invoke('user:create', data),
  updateUser: (id: number, data: unknown) => ipcRenderer.invoke('user:update', id, data),
  toggleUserStatus: (id: number, isActive: boolean) => ipcRenderer.invoke('user:toggleStatus', id, isActive),
  resetUserPassword: (id: number, newPassword: string) => ipcRenderer.invoke('user:resetPassword', id, newPassword),

  // Bank Reconciliation
  getBankAccounts: () => ipcRenderer.invoke('bank:getAccounts'),
  getBankAccountById: (id: number) => ipcRenderer.invoke('bank:getAccountById', id),
  createBankAccount: (data: unknown) => ipcRenderer.invoke('bank:createAccount', data),
  getBankStatements: (bankAccountId?: number) => ipcRenderer.invoke('bank:getStatements', bankAccountId),
  getBankStatementWithLines: (statementId: number) => ipcRenderer.invoke('bank:getStatementWithLines', statementId),
  createBankStatement: (bankAccountId: number, statementDate: string, openingBalance: number, closingBalance: number, reference?: string) =>
    ipcRenderer.invoke('bank:createStatement', bankAccountId, statementDate, openingBalance, closingBalance, reference),
  matchBankTransaction: (lineId: number, transactionId: number) => ipcRenderer.invoke('bank:matchTransaction', lineId, transactionId),
  unmatchBankTransaction: (lineId: number) => ipcRenderer.invoke('bank:unmatchTransaction', lineId),
  getUnmatchedTransactions: (startDate: string, endDate: string) => ipcRenderer.invoke('bank:getUnmatchedTransactions', startDate, endDate),
  markStatementReconciled: (statementId: number, userId: number) => ipcRenderer.invoke('bank:markReconciled', statementId, userId),

  // Approval Workflows
  getPendingApprovals: (userId?: number) => ipcRenderer.invoke('approval:getPending', userId),
  getAllApprovals: (filters?: { status?: string; entity_type?: string }) => ipcRenderer.invoke('approval:getAll', filters),
  getApprovalCounts: () => ipcRenderer.invoke('approval:getCounts'),
  createApprovalRequest: (entityType: string, entityId: number, userId: number) => ipcRenderer.invoke('approval:create', entityType, entityId, userId),
  approveRequest: (requestId: number, approverId: number) => ipcRenderer.invoke('approval:approve', requestId, approverId),
  rejectRequest: (requestId: number, approverId: number, reason: string) => ipcRenderer.invoke('approval:reject', requestId, approverId, reason),
  cancelApprovalRequest: (requestId: number, userId: number) => ipcRenderer.invoke('approval:cancel', requestId, userId),

  // Promotions
  getPromotionStreams: () => ipcRenderer.invoke('promotion:getStreams'),
  getStudentsForPromotion: (streamId: number, academicYearId: number) => ipcRenderer.invoke('promotion:getStudentsForPromotion', streamId, academicYearId),
  promoteStudent: (data: unknown, userId: number) => ipcRenderer.invoke('promotion:promoteStudent', data, userId),
  batchPromoteStudents: (studentIds: number[], fromStreamId: number, toStreamId: number, fromAcademicYearId: number, toAcademicYearId: number, toTermId: number, userId: number) =>
    ipcRenderer.invoke('promotion:batchPromote', studentIds, fromStreamId, toStreamId, fromAcademicYearId, toAcademicYearId, toTermId, userId),
  getStudentPromotionHistory: (studentId: number) => ipcRenderer.invoke('promotion:getStudentHistory', studentId),
  getNextStream: (currentStreamId: number) => ipcRenderer.invoke('promotion:getNextStream', currentStreamId),

  // Attendance
  getAttendanceByDate: (streamId: number, date: string, academicYearId: number, termId: number) =>
    ipcRenderer.invoke('attendance:getByDate', streamId, date, academicYearId, termId),
  markAttendance: (entries: unknown[], streamId: number, date: string, academicYearId: number, termId: number, userId: number) =>
    ipcRenderer.invoke('attendance:markAttendance', entries, streamId, date, academicYearId, termId, userId),
  getStudentAttendanceSummary: (studentId: number, academicYearId: number, termId?: number) =>
    ipcRenderer.invoke('attendance:getStudentSummary', studentId, academicYearId, termId),
  getClassAttendanceSummary: (streamId: number, date: string, academicYearId: number, termId: number) =>
    ipcRenderer.invoke('attendance:getClassSummary', streamId, date, academicYearId, termId),
  getStudentsForAttendance: (streamId: number, academicYearId: number, termId: number) =>
    ipcRenderer.invoke('attendance:getStudentsForMarking', streamId, academicYearId, termId),

  // Report Cards
  getSubjects: () => ipcRenderer.invoke('reportcard:getSubjects'),
  getStudentGrades: (studentId: number, academicYearId: number, termId: number) =>
    ipcRenderer.invoke('reportcard:getStudentGrades', studentId, academicYearId, termId),
  generateReportCard: (studentId: number, academicYearId: number, termId: number) =>
    ipcRenderer.invoke('reportcard:generate', studentId, academicYearId, termId),
  getStudentsForReportCards: (streamId: number, academicYearId: number, termId: number) =>
    ipcRenderer.invoke('reportcard:getStudentsForGeneration', streamId, academicYearId, termId),

  // New Report Card Methods
  generateBatchReportCards: (data: unknown) => ipcRenderer.invoke('report-card:generateBatch', data),
  emailReportCards: (data: unknown) => ipcRenderer.invoke('report-card:emailReports', data),
  mergeReportCards: (data: unknown) => ipcRenderer.invoke('report-card:mergePDFs', data),
  downloadReportCards: (data: unknown) => ipcRenderer.invoke('report-card:downloadReports', data),

  // General
  exportToPDF: (data: unknown) => ipcRenderer.invoke('export:pdf', data),

  // Academic System
  getAcademicSubjects: () => ipcRenderer.invoke('academic:getSubjects'),
  getAcademicExams: (academicYearId: number, termId: number) => ipcRenderer.invoke('academic:getExams', academicYearId, termId),
  createAcademicExam: (data: unknown, userId: number) => ipcRenderer.invoke('academic:createExam', data, userId),
  deleteAcademicExam: (id: number, userId: number) => ipcRenderer.invoke('academic:deleteExam', id, userId),
  allocateTeacher: (data: unknown, userId: number) => ipcRenderer.invoke('academic:allocateTeacher', data, userId),
  getTeacherAllocations: (academicYearId: number, termId: number, streamId?: number) =>
    ipcRenderer.invoke('academic:getAllocations', academicYearId, termId, streamId),
  saveAcademicResults: (examId: number, results: unknown[], userId: number) =>
    ipcRenderer.invoke('academic:saveResults', examId, results, userId),
  getAcademicResults: (examId: number, subjectId: number, streamId: number, userId: number) =>
    ipcRenderer.invoke('academic:getResults', examId, subjectId, streamId, userId),
  processAcademicResults: (examId: number, userId: number) => ipcRenderer.invoke('academic:processResults', examId, userId),

  // Merit Lists & Analysis
  generateMeritList: (options: unknown) => ipcRenderer.invoke('merit-list:generate', options),
  generateClassMeritList: (examId: number, streamId: number) => ipcRenderer.invoke('merit-list:getClass', examId, streamId),
  getSubjectMeritList: (subjectId: number, examId: number) => ipcRenderer.invoke('merit-list:getSubject', subjectId, examId),
  getPerformanceImprovement: (studentId: number) => ipcRenderer.invoke('merit-list:getImprovement', studentId),

  // Notifications
  reloadNotificationConfig: () => ipcRenderer.invoke('notifications:reloadConfig'),
  sendNotification: (request: unknown, userId: number) => ipcRenderer.invoke('notifications:send', request, userId),
  sendBulkFeeReminders: (templateId: number, defaulters: unknown[], userId: number) =>
    ipcRenderer.invoke('notifications:sendBulkFeeReminders', templateId, defaulters, userId),
  getNotificationTemplates: () => ipcRenderer.invoke('notifications:getTemplates'),
  createNotificationTemplate: (template: unknown, userId: number) => ipcRenderer.invoke('notifications:createTemplate', template, userId),
  getDefaultTemplates: () => ipcRenderer.invoke('notifications:getDefaultTemplates'),
  getNotificationHistory: (filters?: unknown) => ipcRenderer.invoke('notifications:getHistory', filters),

  // Scheduled Reports
  getScheduledReports: () => ipcRenderer.invoke('scheduler:getAll'),
  createScheduledReport: (data: unknown, userId: number) => ipcRenderer.invoke('scheduler:create', data, userId),
  updateScheduledReport: (id: number, data: unknown, userId: number) => ipcRenderer.invoke('scheduler:update', id, data, userId),
  deleteScheduledReport: (id: number, userId: number) => ipcRenderer.invoke('scheduler:delete', id, userId),

  // Data Import
  importData: (filePath: string, config: unknown, userId: number) => ipcRenderer.invoke('data:import', filePath, config, userId),
  getImportTemplate: (entityType: string) => ipcRenderer.invoke('data:getTemplate', entityType),
  downloadImportTemplate: (entityType: string) => ipcRenderer.invoke('data:downloadTemplate', entityType),

  // Asset Hire
  getHireClients: (filters?: unknown) => ipcRenderer.invoke('hire:getClients', filters),
  getHireClientById: (id: number) => ipcRenderer.invoke('hire:getClientById', id),
  createHireClient: (data: unknown) => ipcRenderer.invoke('hire:createClient', data),
  updateHireClient: (id: number, data: unknown) => ipcRenderer.invoke('hire:updateClient', id, data),
  getHireAssets: (filters?: unknown) => ipcRenderer.invoke('hire:getAssets', filters),
  getHireAssetById: (id: number) => ipcRenderer.invoke('hire:getAssetById', id),
  createHireAsset: (data: unknown) => ipcRenderer.invoke('hire:createAsset', data),
  updateHireAsset: (id: number, data: unknown) => ipcRenderer.invoke('hire:updateAsset', id, data),
  checkHireAvailability: (assetId: number, hireDate: string, returnDate?: string) => ipcRenderer.invoke('hire:checkAvailability', assetId, hireDate, returnDate),
  getHireBookings: (filters?: unknown) => ipcRenderer.invoke('hire:getBookings', filters),
  getHireBookingById: (id: number) => ipcRenderer.invoke('hire:getBookingById', id),
  createHireBooking: (data: unknown, userId: number) => ipcRenderer.invoke('hire:createBooking', data, userId),
  updateHireBookingStatus: (id: number, status: string) => ipcRenderer.invoke('hire:updateBookingStatus', id, status),
  recordHirePayment: (bookingId: number, data: unknown, userId: number) => ipcRenderer.invoke('hire:recordPayment', bookingId, data, userId),
  getHirePaymentsByBooking: (bookingId: number) => ipcRenderer.invoke('hire:getPaymentsByBooking', bookingId),
  getHireStats: () => ipcRenderer.invoke('hire:getStats'),

  // Fee Exemptions
  getExemptions: (filters?: unknown) => ipcRenderer.invoke('exemption:getAll', filters),
  getExemptionById: (id: number) => ipcRenderer.invoke('exemption:getById', id),
  getStudentExemptions: (studentId: number, academicYearId: number, termId: number) => ipcRenderer.invoke('exemption:getStudentExemptions', studentId, academicYearId, termId),
  calculateExemption: (studentId: number, academicYearId: number, termId: number, categoryId: number, originalAmount: number) => ipcRenderer.invoke('exemption:calculate', studentId, academicYearId, termId, categoryId, originalAmount),
  createExemption: (data: unknown, userId: number) => ipcRenderer.invoke('exemption:create', data, userId),
  revokeExemption: (id: number, reason: string, userId: number) => ipcRenderer.invoke('exemption:revoke', id, reason, userId),
  getExemptionStats: (academicYearId?: number) => ipcRenderer.invoke('exemption:getStats', academicYearId),
  // Analytics & Advanced Academic Features
  getExamAnalytics: (examId: number, streamId?: number) => ipcRenderer.invoke('analytics:getExamAnalytics', examId, streamId),
  getReportCardAnalytics: (academicYearId: number, termId: number) => ipcRenderer.invoke('analytics:getReportCardAnalytics', academicYearId, termId),
  getSubjectMeritAnalysis: (examId: number, subjectId: number) => ipcRenderer.invoke('analytics:getSubjectMeritAnalysis', examId, subjectId),
  getMostImprovedStudents: (examId: number, limit?: number) => ipcRenderer.invoke('analytics:getMostImproved', examId, limit),

  // Awards
  getAwards: (filters?: unknown) => ipcRenderer.invoke('awards:getAll', filters), // Updated to accept filters
  getAwardById: (id: number) => ipcRenderer.invoke('awards:getById', id),
  getAwardCategories: () => ipcRenderer.invoke('awards:getCategories'), // Added missing getAwardCategories
  awardStudent: (data: unknown) => ipcRenderer.invoke('awards:assign', data),
  approveAward: (data: unknown) => ipcRenderer.invoke('awards:approve', data),
  rejectAward: (data: unknown) => ipcRenderer.invoke('awards:reject', data),
  deleteAward: (data: unknown) => ipcRenderer.invoke('awards:delete', data),
  getStudentAwards: (studentId: number) => ipcRenderer.invoke('awards:getStudentAwards', studentId),
  getPendingAwardsCount: () => ipcRenderer.invoke('awards:getPendingCount'),

  // Exam Scheduling
  generateExamTimetable: (config: unknown) => ipcRenderer.invoke('schedule:generate', config),
  detectExamClashes: (filters: unknown) => ipcRenderer.invoke('schedule:detectClashes', filters),
  exportExamTimetableToPDF: (data: unknown) => ipcRenderer.invoke('schedule:exportPDF', data),
  getExams: (filters?: unknown) => ipcRenderer.invoke('academic:getExamsList', filters),

})
