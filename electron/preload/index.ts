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
  updateSettings: (data: unknown) => ipcRenderer.invoke('settings:update', data),

  // Academic
  getAcademicYears: () => ipcRenderer.invoke('academicYear:getAll'),
  getCurrentAcademicYear: () => ipcRenderer.invoke('academicYear:getCurrent'),
  createAcademicYear: (data: unknown) => ipcRenderer.invoke('academicYear:create', data),
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
  getAuditLog: (limit?: number) => ipcRenderer.invoke('audit:getLog', limit),

  // Messaging
  sendSMS: (options: any) => ipcRenderer.invoke('message:sendSms', options),
  sendEmail: (options: any) => ipcRenderer.invoke('message:sendEmail', options),
  getMessageTemplates: () => ipcRenderer.invoke('message:getTemplates'),
  saveMessageTemplate: (template: any) => ipcRenderer.invoke('message:saveTemplate', template),
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
})
