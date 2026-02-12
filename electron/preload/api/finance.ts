import { ipcRenderer } from 'electron'

const CHANNEL_EXPORT_PDF = 'export:pdf'

export function createFinanceAPI() {
  return {
    // Fee Management
    getFeeCategories: () => ipcRenderer.invoke('fee:getCategories'),
    createFeeCategory: (name: string, description: string) => ipcRenderer.invoke('fee:createCategory', name, description),
    getFeeStructure: (yearId: number, termId: number) => ipcRenderer.invoke('fee:getStructure', yearId, termId),
    saveFeeStructure: (data: unknown, yearId: number, termId: number) => ipcRenderer.invoke('fee:saveStructure', data, yearId, termId),

    // Invoices
    generateBatchInvoices: (yearId: number, termId: number, userId: number) => ipcRenderer.invoke('invoice:generateBatch', yearId, termId, userId),
    getInvoices: () => ipcRenderer.invoke('invoice:getAll'),
    getInvoicesByStudent: (studentId: number) => ipcRenderer.invoke('invoice:getByStudent', studentId),
    getInvoiceItems: (invoiceId: number) => ipcRenderer.invoke('invoice:getItems', invoiceId),

    // Payments
    recordPayment: (data: unknown, userId: number) => ipcRenderer.invoke('payment:record', data, userId),
    getPaymentsByStudent: (studentId: number) => ipcRenderer.invoke('payment:getByStudent', studentId),
    payWithCredit: (data: unknown, userId: number) => ipcRenderer.invoke('payment:payWithCredit', data, userId),
    voidPayment: (transactionId: number, voidReason: string, userId: number, recoveryMethod?: string) =>
      ipcRenderer.invoke('payment:void', transactionId, voidReason, userId, recoveryMethod),

    // Cash Flow & Forecasts
    getCashFlowStatement: (startDate: string, endDate: string) => ipcRenderer.invoke('finance:getCashFlow', startDate, endDate),
    getForecast: (months: number) => ipcRenderer.invoke('finance:getForecast', months),

    // Student Credits
    allocateStudentCredits: (studentId: number, userId: number) => ipcRenderer.invoke('finance:allocateCredits', studentId, userId),
    getStudentCreditBalance: (studentId: number) => ipcRenderer.invoke('finance:getCreditBalance', studentId),
    getStudentCreditTransactions: (studentId: number, limit?: number) => ipcRenderer.invoke('finance:getCreditTransactions', studentId, limit),
    addStudentCredit: (studentId: number, amount: number, notes: string, userId: number) => ipcRenderer.invoke('finance:addCredit', studentId, amount, notes, userId),

    // Fee Proration
    calculateProRatedFee: (studentId: number, termId: number, enrollmentDate: string) => ipcRenderer.invoke('finance:calculateProRatedFee', studentId, termId, enrollmentDate),
    validateEnrollmentDate: (termId: number, enrollmentDate: string) => ipcRenderer.invoke('finance:validateEnrollmentDate', termId, enrollmentDate),
    generateProRatedInvoice: (studentId: number, termId: number, enrollmentDate: string, userId: number) => ipcRenderer.invoke('finance:generateProRatedInvoice', studentId, termId, enrollmentDate, userId),
    getProRationHistory: (studentId: number) => ipcRenderer.invoke('finance:getProRationHistory', studentId),

    // Scholarships
    createScholarship: (data: unknown, userId: number) => ipcRenderer.invoke('finance:createScholarship', data, userId),
    allocateScholarship: (allocationData: unknown, userId: number) => ipcRenderer.invoke('finance:allocateScholarship', allocationData, userId),
    validateScholarshipEligibility: (studentId: number, scholarshipId: number) => ipcRenderer.invoke('finance:validateScholarshipEligibility', studentId, scholarshipId),
    getActiveScholarships: () => ipcRenderer.invoke('finance:getActiveScholarships'),
    getStudentScholarships: (studentId: number) => ipcRenderer.invoke('finance:getStudentScholarships', studentId),
    getScholarshipAllocations: (scholarshipId: number) => ipcRenderer.invoke('finance:getScholarshipAllocations', scholarshipId),
    applyScholarshipToInvoice: (invoiceId: number, scholarshipAllocationId: number, userId: number) => ipcRenderer.invoke('finance:applyScholarshipToInvoice', invoiceId, scholarshipAllocationId, userId),

    // Transactions
    getTransactionCategories: () => ipcRenderer.invoke('transaction:getCategories'),
    createTransactionCategory: (name: string, type: string) => ipcRenderer.invoke('transaction:createCategory', name, type),
    createTransaction: (data: unknown, userId: number) => ipcRenderer.invoke('transaction:create', data, userId),
    getTransactions: (filters?: unknown) => ipcRenderer.invoke('transaction:getAll', filters),
    getTransactionSummary: (startDate: string, endDate: string) => ipcRenderer.invoke('transaction:getSummary', startDate, endDate),

    // Budgeting
    getBudgets: (filters?: unknown) => ipcRenderer.invoke('budget:getAll', filters),
    getBudgetById: (id: number) => ipcRenderer.invoke('budget:getById', id),
    createBudget: (data: unknown, userId: number) => ipcRenderer.invoke('budget:create', data, userId),
    updateBudget: (id: number, data: unknown, userId: number) => ipcRenderer.invoke('budget:update', id, data, userId),
    submitBudgetForApproval: (budgetId: number, userId: number) => ipcRenderer.invoke('budget:submit', budgetId, userId),
    approveBudget: (budgetId: number, userId: number) => ipcRenderer.invoke('budget:approve', budgetId, userId),
    setBudgetAllocation: (glAccountCode: string, fiscalYear: number, allocatedAmount: number, department: string | null, userId: number) =>
      ipcRenderer.invoke('budget:setAllocation', glAccountCode, fiscalYear, allocatedAmount, department, userId),
    validateBudgetTransaction: (glAccountCode: string, amount: number, fiscalYear: number, department?: string | null) =>
      ipcRenderer.invoke('budget:validateTransaction', glAccountCode, amount, fiscalYear, department),

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
    /** @deprecated Use getBankAccounts instead */
    getAccounts: () => ipcRenderer.invoke('bank:getAccounts'),
    /** @deprecated Use getBankStatements instead */
    getStatements: (bankAccountId?: number) => ipcRenderer.invoke('bank:getStatements', bankAccountId),
    /** @deprecated Use getBankStatementWithLines instead */
    getStatementWithLines: (statementId: number) => ipcRenderer.invoke('bank:getStatementWithLines', statementId),
    /** @deprecated Use matchBankTransaction instead */
    matchTransaction: (lineId: number, transactionId: number) => ipcRenderer.invoke('bank:matchTransaction', lineId, transactionId),

    // Transaction Approvals
    getApprovalQueue: (filter: string) => ipcRenderer.invoke('approvals:getQueue', filter),
    approveTransaction: (approvalId: number, reviewNotes: string, reviewerUserId: number) =>
      ipcRenderer.invoke('approvals:approve', approvalId, reviewNotes, reviewerUserId),
    rejectTransaction: (approvalId: number, reviewNotes: string, reviewerUserId: number) =>
      ipcRenderer.invoke('approvals:reject', approvalId, reviewNotes, reviewerUserId),

    // Fixed Assets
    getAssets: (filters?: unknown) => ipcRenderer.invoke('assets:get-all', filters),
    getAsset: (id: number) => ipcRenderer.invoke('assets:get-one', id),
    createAsset: (data: unknown, userId: number) => ipcRenderer.invoke('assets:create', data, userId),
    updateAsset: (id: number, data: unknown, userId: number) => ipcRenderer.invoke('assets:update', id, data, userId),
    runDepreciation: (assetId: number, periodId: number, userId: number) => ipcRenderer.invoke('assets:run-depreciation', assetId, periodId, userId),

    // GL Accounts
    getGLAccounts: (filters?: unknown) => ipcRenderer.invoke('gl:get-accounts', filters),
    getGLAccount: (id: number) => ipcRenderer.invoke('gl:get-account', id),
    createGLAccount: (data: unknown, userId: number) => ipcRenderer.invoke('gl:create-account', data, userId),
    updateGLAccount: (id: number, data: unknown, userId: number) => ipcRenderer.invoke('gl:update-account', id, data, userId),
    deleteGLAccount: (id: number, userId: number) => ipcRenderer.invoke('gl:delete-account', id, userId),

    // Opening Balances
    importStudentOpeningBalances: (balances: unknown, academicYearId: number, importSource: string, userId: number) =>
      ipcRenderer.invoke('opening-balance:import-student', balances, academicYearId, importSource, userId),
    importGLOpeningBalances: (balances: unknown, userId: number) =>
      ipcRenderer.invoke('opening-balance:import-gl', balances, userId),

    // Reconciliation
    runReconciliation: (userId: number) => ipcRenderer.invoke('reconciliation:runAll', userId),
    getReconciliationHistory: (limit?: number) => ipcRenderer.invoke('reconciliation:getHistory', limit),

    // Fee Exemptions
    getExemptions: (filters?: unknown) => ipcRenderer.invoke('exemption:getAll', filters),
    getExemptionById: (id: number) => ipcRenderer.invoke('exemption:getById', id),
    getStudentExemptions: (studentId: number, academicYearId: number, termId: number) => ipcRenderer.invoke('exemption:getStudentExemptions', studentId, academicYearId, termId),
    calculateExemption: (studentId: number, academicYearId: number, termId: number, categoryId: number, originalAmount: number) => ipcRenderer.invoke('exemption:calculate', studentId, academicYearId, termId, categoryId, originalAmount),
    createExemption: (data: unknown, userId: number) => ipcRenderer.invoke('exemption:create', data, userId),
    revokeExemption: (id: number, reason: string, userId: number) => ipcRenderer.invoke('exemption:revoke', id, reason, userId),
    getExemptionStats: (academicYearId?: number) => ipcRenderer.invoke('exemption:getStats', academicYearId),

    // Financial Reports
    getBalanceSheet: (asOfDate: string) => ipcRenderer.invoke('reports:getBalanceSheet', asOfDate),
    getProfitAndLoss: (startDate: string, endDate: string) => ipcRenderer.invoke('reports:getProfitAndLoss', startDate, endDate),
    getTrialBalance: (startDate: string, endDate: string) => ipcRenderer.invoke('reports:getTrialBalance', startDate, endDate),
    getComparativeProfitAndLoss: (currentStart: string, currentEnd: string, priorStart: string, priorEnd: string) =>
      ipcRenderer.invoke('reports:getComparativeProfitAndLoss', currentStart, currentEnd, priorStart, priorEnd),

    // General Export
    exportToPDF: (data: unknown) => ipcRenderer.invoke(CHANNEL_EXPORT_PDF, data),
    /** @deprecated Use exportToPDF instead */
    exportAnalyticsToPDF: (data: unknown) => ipcRenderer.invoke(CHANNEL_EXPORT_PDF, data),
    /** @deprecated Use exportToPDF instead */
    exportReportCardAnalyticsToPDF: (data: unknown) => ipcRenderer.invoke(CHANNEL_EXPORT_PDF, data),
  }
}
