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
    generateBatchInvoices: (yearId: number, termId: number) => ipcRenderer.invoke('invoice:generateBatch', yearId, termId),
    generateStudentInvoice: (studentId: number, yearId: number, termId: number) => ipcRenderer.invoke('invoice:generateForStudent', studentId, yearId, termId),
    getInvoices: () => ipcRenderer.invoke('invoice:getAll'),
    getInvoicesByStudent: (studentId: number) => ipcRenderer.invoke('invoice:getByStudent', studentId),
    getInvoiceItems: (invoiceId: number) => ipcRenderer.invoke('invoice:getItems', invoiceId),
  }
}

function createPaymentAPI() {
  return {
    recordPayment: (data: PaymentRecordData) => ipcRenderer.invoke('payment:record', data),
    getPaymentsByStudent: (studentId: number) => ipcRenderer.invoke('payment:getByStudent', studentId),
    payWithCredit: (data: PayWithCreditData) => ipcRenderer.invoke('payment:payWithCredit', data),
    voidPayment: (transactionId: number, voidReason: string, recoveryMethod?: string) =>
      ipcRenderer.invoke('payment:void', transactionId, voidReason, recoveryMethod),
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
    allocateStudentCredits: (studentId: number) => ipcRenderer.invoke('finance:allocateCredits', studentId),
    getStudentCreditBalance: (studentId: number) => ipcRenderer.invoke('finance:getCreditBalance', studentId),
    getStudentCreditTransactions: (studentId: number, limit?: number) => ipcRenderer.invoke('finance:getCreditTransactions', studentId, limit),
    addStudentCredit: (studentId: number, amount: number, notes: string) => ipcRenderer.invoke('finance:addCredit', studentId, amount, notes),
  }
}

function createProrationAPI() {
  return {
    calculateProRatedFee: (fullAmount: number, termStartDate: string, termEndDate: string, enrollmentDate: string) => ipcRenderer.invoke('finance:calculateProRatedFee', fullAmount, termStartDate, termEndDate, enrollmentDate),
    validateEnrollmentDate: (termStartDate: string, termEndDate: string, enrollmentDate: string) => ipcRenderer.invoke('finance:validateEnrollmentDate', termStartDate, termEndDate, enrollmentDate),
    generateProRatedInvoice: (studentId: number, templateInvoiceId: number, enrollmentDate: string) => ipcRenderer.invoke('finance:generateProRatedInvoice', studentId, templateInvoiceId, enrollmentDate),
    getProRationHistory: (studentId: number) => ipcRenderer.invoke('finance:getProRationHistory', studentId),
  }
}

function createScholarshipAPI() {
  return {
    createScholarship: (data: ScholarshipCreateData) => ipcRenderer.invoke('finance:createScholarship', data),
    allocateScholarship: (allocationData: ScholarshipAllocationData) => ipcRenderer.invoke('finance:allocateScholarship', allocationData),
    validateScholarshipEligibility: (studentId: number, scholarshipId: number) => ipcRenderer.invoke('finance:validateScholarshipEligibility', studentId, scholarshipId),
    getActiveScholarships: () => ipcRenderer.invoke('finance:getActiveScholarships'),
    getStudentScholarships: (studentId: number) => ipcRenderer.invoke('finance:getStudentScholarships', studentId),
    getScholarshipAllocations: (scholarshipId: number) => ipcRenderer.invoke('finance:getScholarshipAllocations', scholarshipId),
    applyScholarshipToInvoice: (studentScholarshipId: number, invoiceId: number, amountToApply: number) => ipcRenderer.invoke('finance:applyScholarshipToInvoice', studentScholarshipId, invoiceId, amountToApply),
  }
}

function createTransactionAPI() {
  return {
    getTransactionCategories: () => ipcRenderer.invoke('transaction:getCategories'),
    createTransactionCategory: (name: string, type: string) => ipcRenderer.invoke('transaction:createCategory', name, type),
    createTransaction: (data: TransactionData) => ipcRenderer.invoke('transaction:create', data),
    getTransactions: (filters?: TransactionFilters) => ipcRenderer.invoke('transaction:getAll', filters),
    getTransactionSummary: (startDate: string, endDate: string) => ipcRenderer.invoke('transaction:getSummary', startDate, endDate),
  }
}

function createBudgetAPI() {
  return {
    getBudgets: (filters?: BudgetFilters) => ipcRenderer.invoke('budget:getAll', filters),
    getBudgetById: (id: number) => ipcRenderer.invoke('budget:getById', id),
    createBudget: (data: BudgetCreateData) => ipcRenderer.invoke('budget:create', data),
    updateBudget: (id: number, data: Partial<BudgetCreateData>) => ipcRenderer.invoke('budget:update', id, data),
    submitBudgetForApproval: (budgetId: number) => ipcRenderer.invoke('budget:submit', budgetId),
    approveBudget: (budgetId: number) => ipcRenderer.invoke('budget:approve', budgetId),
    setBudgetAllocation: (glAccountCode: string, fiscalYear: number, allocatedAmount: number, department: string | null) =>
      ipcRenderer.invoke('budget:setAllocation', glAccountCode, fiscalYear, allocatedAmount, department),
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
  const markStatementReconciled = (statementId: number) => ipcRenderer.invoke('bank:markReconciled', statementId)

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
    approveTransaction: (approvalId: number, reviewNotes: string) =>
      ipcRenderer.invoke('approvals:approve', approvalId, reviewNotes),
    rejectTransaction: (approvalId: number, reviewNotes: string) =>
      ipcRenderer.invoke('approvals:reject', approvalId, reviewNotes),
  }
}

function createAssetAPI() {
  return {
    getAssetCategories: () => ipcRenderer.invoke('assets:get-categories'),
    getFinancialPeriods: () => ipcRenderer.invoke('assets:get-financial-periods'),
    getAssets: (filters?: { category?: string; status?: string }) => ipcRenderer.invoke('assets:get-all', filters),
    getAsset: (id: number) => ipcRenderer.invoke('assets:get-one', id),
    createAsset: (data: AssetCreateData) => ipcRenderer.invoke('assets:create', data),
    updateAsset: (id: number, data: Partial<AssetCreateData>) => ipcRenderer.invoke('assets:update', id, data),
    runDepreciation: (assetId: number, periodId: number) => ipcRenderer.invoke('assets:run-depreciation', assetId, periodId),
  }
}

function createGLAPI() {
  return {
    getGLAccounts: (filters?: { account_type?: string; is_active?: boolean }) => ipcRenderer.invoke('gl:get-accounts', filters),
    getGLAccount: (id: number) => ipcRenderer.invoke('gl:get-account', id),
    createGLAccount: (data: GLAccountData) => ipcRenderer.invoke('gl:create-account', data),
    updateGLAccount: (id: number, data: Partial<GLAccountData>) => ipcRenderer.invoke('gl:update-account', id, data),
    deleteGLAccount: (id: number) => ipcRenderer.invoke('gl:delete-account', id),
  }
}

function createOpeningBalanceAPI() {
  return {
    importStudentOpeningBalances: (balances: Array<{ student_id: number; amount: number }>, academicYearId: number, importSource: string) =>
      ipcRenderer.invoke('opening-balance:import-student', balances, academicYearId, importSource),
    importGLOpeningBalances: (balances: Array<{ gl_account_code: string; debit_amount: number; credit_amount: number }>) =>
      ipcRenderer.invoke('opening-balance:import-gl', balances),
  }
}

function createReconciliationAPI() {
  return {
    runReconciliation: () => ipcRenderer.invoke('reconciliation:runAll'),
    getReconciliationHistory: (limit?: number) => ipcRenderer.invoke('reconciliation:getHistory', limit),
  }
}

function createExemptionAPI() {
  return {
    getExemptions: (filters?: { studentId?: number; academicYearId?: number; termId?: number; status?: string }) => ipcRenderer.invoke('exemption:getAll', filters),
    getExemptionById: (id: number) => ipcRenderer.invoke('exemption:getById', id),
    getStudentExemptions: (studentId: number, academicYearId: number, termId: number) => ipcRenderer.invoke('exemption:getStudentExemptions', studentId, academicYearId, termId),
    calculateExemption: (studentId: number, academicYearId: number, termId: number, categoryId: number, originalAmount: number) => ipcRenderer.invoke('exemption:calculate', studentId, academicYearId, termId, categoryId, originalAmount),
    createExemption: (data: ExemptionCreateData) => ipcRenderer.invoke('exemption:create', data),
    revokeExemption: (id: number, reason: string) => ipcRenderer.invoke('exemption:revoke', id, reason),
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
