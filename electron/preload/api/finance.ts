import { ipcRenderer } from 'electron'

import type { AssetCreateData, BudgetCreateData, BudgetFilters, ExemptionCreateData, ExportPDFData, FeeStructureCreateData, GLAccountData, PaymentRecordData, PayWithCreditData, ScholarshipAllocationData, ScholarshipCreateData, TransactionData, TransactionFilters } from '../types'

const CHANNEL_EXPORT_PDF = 'export:pdf'

function createFeeAPI() {
  return {
    getFeeCategories: () => ipcRenderer.invoke('fee:getCategories'),
    createFeeCategory: (name: string, description: string) => ipcRenderer.invoke('fee:createCategory', name, description),
    getFeeStructure: (yearId: number, termId: number) => ipcRenderer.invoke('fee:getStructure', yearId, termId),
    saveFeeStructure: (data: FeeStructureCreateData[], yearId: number, termId: number) => ipcRenderer.invoke('fee:saveStructure', data, yearId, termId),
  }
}

function createInvoiceAPI() {
  return {
    generateBatchInvoices: (yearId: number, termId: number, userId: number) => ipcRenderer.invoke('invoice:generateBatch', yearId, termId, userId),
    generateStudentInvoice: (studentId: number, yearId: number, termId: number, userId: number) => ipcRenderer.invoke('invoice:generateForStudent', studentId, yearId, termId, userId),
    getInvoices: () => ipcRenderer.invoke('invoice:getAll'),
    getInvoicesByStudent: (studentId: number) => ipcRenderer.invoke('invoice:getByStudent', studentId),
    getInvoiceItems: (invoiceId: number) => ipcRenderer.invoke('invoice:getItems', invoiceId),
  }
}

function createPaymentAPI() {
  return {
    recordPayment: (data: PaymentRecordData, userId: number) => ipcRenderer.invoke('payment:record', data, userId),
    getPaymentsByStudent: (studentId: number) => ipcRenderer.invoke('payment:getByStudent', studentId),
    payWithCredit: (data: PayWithCreditData, userId: number) => ipcRenderer.invoke('payment:payWithCredit', data, userId),
    voidPayment: (transactionId: number, voidReason: string, userId: number, recoveryMethod?: string) =>
      ipcRenderer.invoke('payment:void', transactionId, voidReason, userId, recoveryMethod),
  }
}

function createCashFlowAPI() {
  return {
    getCashFlowStatement: (startDate: string, endDate: string) => ipcRenderer.invoke('finance:getCashFlow', startDate, endDate),
    getForecast: (months: number) => ipcRenderer.invoke('finance:getForecast', months),
  }
}

function createCreditAPI() {
  return {
    allocateStudentCredits: (studentId: number, userId: number) => ipcRenderer.invoke('finance:allocateCredits', studentId, userId),
    getStudentCreditBalance: (studentId: number) => ipcRenderer.invoke('finance:getCreditBalance', studentId),
    getStudentCreditTransactions: (studentId: number, limit?: number) => ipcRenderer.invoke('finance:getCreditTransactions', studentId, limit),
    addStudentCredit: (studentId: number, amount: number, notes: string, userId: number) => ipcRenderer.invoke('finance:addCredit', studentId, amount, notes, userId),
  }
}

function createProrationAPI() {
  return {
    calculateProRatedFee: (fullAmount: number, termStartDate: string, termEndDate: string, enrollmentDate: string) => ipcRenderer.invoke('finance:calculateProRatedFee', fullAmount, termStartDate, termEndDate, enrollmentDate),
    validateEnrollmentDate: (termStartDate: string, termEndDate: string, enrollmentDate: string) => ipcRenderer.invoke('finance:validateEnrollmentDate', termStartDate, termEndDate, enrollmentDate),
    generateProRatedInvoice: (studentId: number, templateInvoiceId: number, enrollmentDate: string, userId: number) => ipcRenderer.invoke('finance:generateProRatedInvoice', studentId, templateInvoiceId, enrollmentDate, userId),
    getProRationHistory: (studentId: number) => ipcRenderer.invoke('finance:getProRationHistory', studentId),
  }
}

function createScholarshipAPI() {
  return {
    createScholarship: (data: ScholarshipCreateData, userId: number) => ipcRenderer.invoke('finance:createScholarship', data, userId),
    allocateScholarship: (allocationData: ScholarshipAllocationData, userId: number) => ipcRenderer.invoke('finance:allocateScholarship', allocationData, userId),
    validateScholarshipEligibility: (studentId: number, scholarshipId: number) => ipcRenderer.invoke('finance:validateScholarshipEligibility', studentId, scholarshipId),
    getActiveScholarships: () => ipcRenderer.invoke('finance:getActiveScholarships'),
    getStudentScholarships: (studentId: number) => ipcRenderer.invoke('finance:getStudentScholarships', studentId),
    getScholarshipAllocations: (scholarshipId: number) => ipcRenderer.invoke('finance:getScholarshipAllocations', scholarshipId),
    applyScholarshipToInvoice: (studentScholarshipId: number, invoiceId: number, amountToApply: number, userId: number) => ipcRenderer.invoke('finance:applyScholarshipToInvoice', studentScholarshipId, invoiceId, amountToApply, userId),
  }
}

function createTransactionAPI() {
  return {
    getTransactionCategories: () => ipcRenderer.invoke('transaction:getCategories'),
    createTransactionCategory: (name: string, type: string) => ipcRenderer.invoke('transaction:createCategory', name, type),
    createTransaction: (data: TransactionData, userId: number) => ipcRenderer.invoke('transaction:create', data, userId),
    getTransactions: (filters?: TransactionFilters) => ipcRenderer.invoke('transaction:getAll', filters),
    getTransactionSummary: (startDate: string, endDate: string) => ipcRenderer.invoke('transaction:getSummary', startDate, endDate),
  }
}

function createBudgetAPI() {
  return {
    getBudgets: (filters?: BudgetFilters) => ipcRenderer.invoke('budget:getAll', filters),
    getBudgetById: (id: number) => ipcRenderer.invoke('budget:getById', id),
    createBudget: (data: BudgetCreateData, userId: number) => ipcRenderer.invoke('budget:create', data, userId),
    updateBudget: (id: number, data: Partial<BudgetCreateData>, userId: number) => ipcRenderer.invoke('budget:update', id, data, userId),
    submitBudgetForApproval: (budgetId: number, userId: number) => ipcRenderer.invoke('budget:submit', budgetId, userId),
    approveBudget: (budgetId: number, userId: number) => ipcRenderer.invoke('budget:approve', budgetId, userId),
    setBudgetAllocation: (glAccountCode: string, fiscalYear: number, allocatedAmount: number, department: string | null, userId: number) =>
      ipcRenderer.invoke('budget:setAllocation', glAccountCode, fiscalYear, allocatedAmount, department, userId),
    validateBudgetTransaction: (glAccountCode: string, amount: number, fiscalYear: number, department?: string | null) =>
      ipcRenderer.invoke('budget:validateTransaction', glAccountCode, amount, fiscalYear, department),
  }
}

function createBankAPI() {
  const getBankAccounts = () => ipcRenderer.invoke('bank:getAccounts')
  const getBankAccountById = (id: number) => ipcRenderer.invoke('bank:getAccountById', id)
  const createBankAccount = (data: { account_name: string; account_number: string; bank_name: string; branch?: string; currency?: string }) =>
    ipcRenderer.invoke('bank:createAccount', data)
  const getBankStatements = (bankAccountId?: number) => ipcRenderer.invoke('bank:getStatements', bankAccountId)
  const getBankStatementWithLines = (statementId: number) => ipcRenderer.invoke('bank:getStatementWithLines', statementId)
  const createBankStatement = (bankAccountId: number, statementDate: string, openingBalance: number, closingBalance: number, reference?: string) =>
    ipcRenderer.invoke('bank:createStatement', bankAccountId, statementDate, openingBalance, closingBalance, reference)
  const addStatementLine = (
    statementId: number,
    line: {
      transaction_date: string
      description: string
      reference?: string | null
      debit_amount: number
      credit_amount: number
      running_balance?: number | null
    }
  ) => ipcRenderer.invoke('bank:addStatementLine', statementId, line)
  const matchBankTransaction = (lineId: number, transactionId: number) => ipcRenderer.invoke('bank:matchTransaction', lineId, transactionId)
  const unmatchBankTransaction = (lineId: number) => ipcRenderer.invoke('bank:unmatchTransaction', lineId)
  const getUnmatchedTransactions = (startDate: string, endDate: string, bankAccountId?: number) =>
    ipcRenderer.invoke('bank:getUnmatchedTransactions', startDate, endDate, bankAccountId)
  const markStatementReconciled = (statementId: number, userId: number) => ipcRenderer.invoke('bank:markReconciled', statementId, userId)

  return {
    // Preferred bank-prefixed surface
    getBankAccounts,
    getBankAccountById,
    createBankAccount,
    getBankStatements,
    getBankStatementWithLines,
    createBankStatement,
    addStatementLine,
    matchBankTransaction,
    unmatchBankTransaction,
    getUnmatchedTransactions,
    markStatementReconciled,

    // Compatibility aliases used by existing renderer pages/types
    getAccounts: getBankAccounts,
    getAccountById: getBankAccountById,
    createAccount: createBankAccount,
    getStatements: getBankStatements,
    getStatementWithLines: getBankStatementWithLines,
    createStatement: createBankStatement,
    matchTransaction: matchBankTransaction,
    unmatchTransaction: unmatchBankTransaction,
    markReconciled: markStatementReconciled,
  }
}

function createApprovalAPI() {
  return {
    getApprovalQueue: (filter: string) => ipcRenderer.invoke('approvals:getQueue', filter),
    approveTransaction: (approvalId: number, reviewNotes: string, reviewerUserId: number) =>
      ipcRenderer.invoke('approvals:approve', approvalId, reviewNotes, reviewerUserId),
    rejectTransaction: (approvalId: number, reviewNotes: string, reviewerUserId: number) =>
      ipcRenderer.invoke('approvals:reject', approvalId, reviewNotes, reviewerUserId),
  }
}

function createAssetAPI() {
  return {
    getAssetCategories: () => ipcRenderer.invoke('assets:get-categories'),
    getFinancialPeriods: () => ipcRenderer.invoke('assets:get-financial-periods'),
    getAssets: (filters?: { category?: string; status?: string }) => ipcRenderer.invoke('assets:get-all', filters),
    getAsset: (id: number) => ipcRenderer.invoke('assets:get-one', id),
    createAsset: (data: AssetCreateData, userId: number) => ipcRenderer.invoke('assets:create', data, userId),
    updateAsset: (id: number, data: Partial<AssetCreateData>, userId: number) => ipcRenderer.invoke('assets:update', id, data, userId),
    runDepreciation: (assetId: number, periodId: number, userId: number) => ipcRenderer.invoke('assets:run-depreciation', assetId, periodId, userId),
  }
}

function createGLAPI() {
  return {
    getGLAccounts: (filters?: { account_type?: string; is_active?: boolean }) => ipcRenderer.invoke('gl:get-accounts', filters),
    getGLAccount: (id: number) => ipcRenderer.invoke('gl:get-account', id),
    createGLAccount: (data: GLAccountData, userId: number) => ipcRenderer.invoke('gl:create-account', data, userId),
    updateGLAccount: (id: number, data: Partial<GLAccountData>, userId: number) => ipcRenderer.invoke('gl:update-account', id, data, userId),
    deleteGLAccount: (id: number, userId: number) => ipcRenderer.invoke('gl:delete-account', id, userId),
  }
}

function createOpeningBalanceAPI() {
  return {
    importStudentOpeningBalances: (balances: Array<{ student_id: number; amount: number }>, academicYearId: number, importSource: string, userId: number) =>
      ipcRenderer.invoke('opening-balance:import-student', balances, academicYearId, importSource, userId),
    importGLOpeningBalances: (balances: Array<{ gl_account_code: string; debit_amount: number; credit_amount: number }>, userId: number) =>
      ipcRenderer.invoke('opening-balance:import-gl', balances, userId),
  }
}

function createReconciliationAPI() {
  return {
    runReconciliation: (userId: number) => ipcRenderer.invoke('reconciliation:runAll', userId),
    getReconciliationHistory: (limit?: number) => ipcRenderer.invoke('reconciliation:getHistory', limit),
  }
}

function createExemptionAPI() {
  return {
    getExemptions: (filters?: { studentId?: number; academicYearId?: number; termId?: number; status?: string }) => ipcRenderer.invoke('exemption:getAll', filters),
    getExemptionById: (id: number) => ipcRenderer.invoke('exemption:getById', id),
    getStudentExemptions: (studentId: number, academicYearId: number, termId: number) => ipcRenderer.invoke('exemption:getStudentExemptions', studentId, academicYearId, termId),
    calculateExemption: (studentId: number, academicYearId: number, termId: number, categoryId: number, originalAmount: number) => ipcRenderer.invoke('exemption:calculate', studentId, academicYearId, termId, categoryId, originalAmount),
    createExemption: (data: ExemptionCreateData, userId: number) => ipcRenderer.invoke('exemption:create', data, userId),
    revokeExemption: (id: number, reason: string, userId: number) => ipcRenderer.invoke('exemption:revoke', id, reason, userId),
    getExemptionStats: (academicYearId?: number) => ipcRenderer.invoke('exemption:getStats', academicYearId),
  }
}

function createReportAPI() {
  return {
    getBalanceSheet: (asOfDate: string) => ipcRenderer.invoke('reports:getBalanceSheet', asOfDate),
    getProfitAndLoss: (startDate: string, endDate: string) => ipcRenderer.invoke('reports:getProfitAndLoss', startDate, endDate),
    getTrialBalance: (startDate: string, endDate: string) => ipcRenderer.invoke('reports:getTrialBalance', startDate, endDate),
    getComparativeProfitAndLoss: (currentStart: string, currentEnd: string, priorStart: string, priorEnd: string) =>
      ipcRenderer.invoke('reports:getComparativeProfitAndLoss', currentStart, currentEnd, priorStart, priorEnd),
  }
}

function createExportAPI() {
  return {
    exportToPDF: (data: ExportPDFData) => ipcRenderer.invoke(CHANNEL_EXPORT_PDF, data),
  }
}

export function createFinanceAPI() {
  return {
    ...createFeeAPI(),
    ...createInvoiceAPI(),
    ...createPaymentAPI(),
    ...createCashFlowAPI(),
    ...createCreditAPI(),
    ...createProrationAPI(),
    ...createScholarshipAPI(),
    ...createTransactionAPI(),
    ...createBudgetAPI(),
    ...createBankAPI(),
    ...createApprovalAPI(),
    ...createAssetAPI(),
    ...createGLAPI(),
    ...createOpeningBalanceAPI(),
    ...createReconciliationAPI(),
    ...createExemptionAPI(),
    ...createReportAPI(),
    ...createExportAPI(),
  }
}
