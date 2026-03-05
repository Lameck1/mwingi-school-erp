/**
 * Tests for electron/preload/api/finance.ts
 *
 * Verifies every method in createFinanceAPI() calls ipcRenderer.invoke
 * with the correct channel and arguments.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: vi.fn().mockResolvedValue({ success: true }),
  },
}))

import { ipcRenderer } from 'electron'
import { createFinanceAPI } from '../finance'

describe('createFinanceAPI', () => {
  let api: ReturnType<typeof createFinanceAPI>

  beforeEach(() => {
    vi.clearAllMocks()
    api = createFinanceAPI()
  })

  it('returns an object with all expected method groups', () => {
    // Spot-check representative methods from each sub-API
    expect(typeof api.getFeeCategories).toBe('function')
    expect(typeof api.createFeeCategory).toBe('function')
    expect(typeof api.getFeeStructure).toBe('function')
    expect(typeof api.saveFeeStructure).toBe('function')
    expect(typeof api.generateBatchInvoices).toBe('function')
    expect(typeof api.recordPayment).toBe('function')
    expect(typeof api.getCashFlowStatement).toBe('function')
    expect(typeof api.createTransaction).toBe('function')
    expect(typeof api.getBudgets).toBe('function')
    expect(typeof api.getBankAccounts).toBe('function')
    expect(typeof api.getApprovalQueue).toBe('function')
    expect(typeof api.getAssets).toBe('function')
    expect(typeof api.getGLAccounts).toBe('function')
    expect(typeof api.importStudentOpeningBalances).toBe('function')
    expect(typeof api.runReconciliation).toBe('function')
    expect(typeof api.getExemptions).toBe('function')
    expect(typeof api.getBalanceSheet).toBe('function')
    expect(typeof api.exportToPDF).toBe('function')
    expect(typeof api.importMpesaTransactions).toBe('function')
    expect(typeof api.createRequisition).toBe('function')
    expect(typeof api.createScholarship).toBe('function')
    expect(typeof api.allocateStudentCredits).toBe('function')
    expect(typeof api.calculateProRatedFee).toBe('function')
    expect(typeof api.createInstallmentPolicy).toBe('function')
    expect(typeof api.validateExpenditure).toBe('function')
  })

  // ---- Fee API ----
  describe('Fee methods', () => {
    it('getFeeCategories → fee:getCategories', async () => {
      await api.getFeeCategories()
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('fee:getCategories')
    })

    it('createFeeCategory → fee:createCategory with args', async () => {
      await api.createFeeCategory('Tuition', 'Main tuition fee')
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('fee:createCategory', 'Tuition', 'Main tuition fee')
    })

    it('getFeeStructure → fee:getStructure', async () => {
      await api.getFeeStructure(1, 2)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('fee:getStructure', 1, 2)
    })

    it('saveFeeStructure → fee:saveStructure', async () => {
      const data = [{ academic_year_id: 1, term_id: 2, stream_id: 1, fee_category_id: 1, amount: 1000, student_type: 'DAY_SCHOLAR' as const }]
      await api.saveFeeStructure(data, 1, 2)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('fee:saveStructure', data, 1, 2)
    })
  })

  // ---- Invoice API ----
  describe('Invoice methods', () => {
    it('generateBatchInvoices → invoice:generateBatch', async () => {
      await api.generateBatchInvoices(1, 2, 3)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('invoice:generateBatch', 1, 2, 3)
    })

    it('generateStudentInvoice → invoice:generateForStudent', async () => {
      await api.generateStudentInvoice(10, 1, 2, 3)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('invoice:generateForStudent', 10, 1, 2, 3)
    })

    it('getInvoices → invoice:getAll', async () => {
      await api.getInvoices()
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('invoice:getAll')
    })

    it('getInvoicesByStudent → invoice:getByStudent', async () => {
      await api.getInvoicesByStudent(5)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('invoice:getByStudent', 5)
    })

    it('getInvoiceItems → invoice:getItems', async () => {
      await api.getInvoiceItems(10)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('invoice:getItems', 10)
    })
  })

  // ---- Payment API ----
  describe('Payment methods', () => {
    it('recordPayment → payment:record', async () => {
      const data = { student_id: 1, amount: 5000, transaction_date: '2024-01-15', payment_method: 'CASH', payment_reference: 'R001', term_id: 1 }
      await api.recordPayment(data, 1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('payment:record', data, 1)
    })

    it('getPaymentsByStudent → payment:getByStudent', async () => {
      await api.getPaymentsByStudent(5)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('payment:getByStudent', 5)
    })

    it('payWithCredit → payment:payWithCredit', async () => {
      const data = { studentId: 1, invoiceId: 2, amount: 1000 }
      await api.payWithCredit(data, 1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('payment:payWithCredit', data, 1)
    })

    it('voidPayment → payment:void (with optional recoveryMethod)', async () => {
      await api.voidPayment(10, 'Duplicate', 1, 'REFUND')
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('payment:void', 10, 'Duplicate', 1, 'REFUND')
    })

    it('voidPayment → payment:void (without recoveryMethod)', async () => {
      await api.voidPayment(10, 'Duplicate', 1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('payment:void', 10, 'Duplicate', 1, undefined)
    })
  })

  // ---- CashFlow API ----
  describe('CashFlow methods', () => {
    it('getCashFlowStatement → finance:getCashFlow', async () => {
      await api.getCashFlowStatement('2024-01-01', '2024-12-31')
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('finance:getCashFlow', '2024-01-01', '2024-12-31')
    })

    it('getForecast → finance:getForecast', async () => {
      await api.getForecast(6)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('finance:getForecast', 6)
    })
  })

  // ---- Fee Policy API ----
  describe('FeePolicy methods', () => {
    it('createInstallmentPolicy → feePolicy:createInstallmentPolicy', async () => {
      const data = { term_id: 1, installments: 3 }
      await api.createInstallmentPolicy(data)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('feePolicy:createInstallmentPolicy', data)
    })

    it('getPoliciesForTerm → feePolicy:getPoliciesForTerm (wraps params)', async () => {
      await api.getPoliciesForTerm(1, 2, 'DAY')
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('feePolicy:getPoliciesForTerm', { academicYearId: 1, streamId: 2, studentType: 'DAY' })
    })

    it('getInstallmentSchedule → feePolicy:getSchedule', async () => {
      await api.getInstallmentSchedule(5)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('feePolicy:getSchedule', 5)
    })

    it('deactivatePolicy → feePolicy:deactivatePolicy', async () => {
      await api.deactivatePolicy(3)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('feePolicy:deactivatePolicy', 3)
    })

    it('getVoteHeadBalances → feePolicy:getVoteHeadBalances', async () => {
      await api.getVoteHeadBalances(7)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('feePolicy:getVoteHeadBalances', 7)
    })
  })

  // ---- Virement API ----
  describe('Virement methods', () => {
    it('validateExpenditure → virement:validateExpenditure', async () => {
      await api.validateExpenditure('EXPENSE', 5)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('virement:validateExpenditure', { expenseAccountType: 'EXPENSE', fundingCategoryId: 5 })
    })

    it('requestVirement → virement:request', async () => {
      await api.requestVirement('from', 'to', 1000, 'reason')
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('virement:request', { fromAccount: 'from', toAccount: 'to', amount: 1000, reason: 'reason' })
    })

    it('reviewVirement → virement:review', async () => {
      await api.reviewVirement(1, 'APPROVED', 'Looks good')
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('virement:review', { requestId: 1, decision: 'APPROVED', reviewNotes: 'Looks good' })
    })

    it('getPendingRequests → virement:getPendingRequests', async () => {
      await api.getPendingRequests()
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('virement:getPendingRequests')
    })

    it('getAccountSummaries → virement:getAccountSummaries', async () => {
      await api.getAccountSummaries()
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('virement:getAccountSummaries')
    })
  })

  // ---- Credit API ----
  describe('Credit methods', () => {
    it('allocateStudentCredits → finance:allocateCredits', async () => {
      await api.allocateStudentCredits(10, 1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('finance:allocateCredits', 10, 1)
    })

    it('getStudentCreditBalance → finance:getCreditBalance', async () => {
      await api.getStudentCreditBalance(10)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('finance:getCreditBalance', 10)
    })

    it('getStudentCreditTransactions → finance:getCreditTransactions', async () => {
      await api.getStudentCreditTransactions(10, 5)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('finance:getCreditTransactions', 10, 5)
    })

    it('addStudentCredit → finance:addCredit', async () => {
      await api.addStudentCredit(10, 500, 'Overpayment', 1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('finance:addCredit', 10, 500, 'Overpayment', 1)
    })
  })

  // ---- Proration API ----
  describe('Proration methods', () => {
    it('calculateProRatedFee → finance:calculateProRatedFee', async () => {
      await api.calculateProRatedFee(10000, '2024-01-01', '2024-04-30', '2024-02-15')
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('finance:calculateProRatedFee', 10000, '2024-01-01', '2024-04-30', '2024-02-15')
    })

    it('validateEnrollmentDate → finance:validateEnrollmentDate', async () => {
      await api.validateEnrollmentDate('2024-01-01', '2024-04-30', '2024-02-15')
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('finance:validateEnrollmentDate', '2024-01-01', '2024-04-30', '2024-02-15')
    })

    it('generateProRatedInvoice → finance:generateProRatedInvoice', async () => {
      await api.generateProRatedInvoice(10, 5, '2024-02-15', 1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('finance:generateProRatedInvoice', 10, 5, '2024-02-15', 1)
    })

    it('getProRationHistory → finance:getProRationHistory', async () => {
      await api.getProRationHistory(10)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('finance:getProRationHistory', 10)
    })
  })

  // ---- Scholarship API ----
  describe('Scholarship methods', () => {
    it('createScholarship → finance:createScholarship', async () => {
      const data = { name: 'Merit', description: 'Merit scholarship', scholarship_type: 'MERIT' as const, amount: 5000, max_beneficiaries: 10, eligibility_criteria: 'Top students', valid_from: '2024-01-01', valid_to: '2024-12-31' }
      await api.createScholarship(data, 1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('finance:createScholarship', data, 1)
    })

    it('allocateScholarship → finance:allocateScholarship', async () => {
      const alloc = { scholarship_id: 1, student_id: 10, amount_allocated: 2000, allocation_notes: 'Merit award', effective_date: '2024-01-15' }
      await api.allocateScholarship(alloc, 1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('finance:allocateScholarship', alloc, 1)
    })

    it('getActiveScholarships → finance:getActiveScholarships', async () => {
      await api.getActiveScholarships()
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('finance:getActiveScholarships')
    })

    it('applyScholarshipToInvoice → finance:applyScholarshipToInvoice', async () => {
      await api.applyScholarshipToInvoice(1, 2, 3000, 1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('finance:applyScholarshipToInvoice', 1, 2, 3000, 1)
    })
  })

  // ---- Transaction API ----
  describe('Transaction methods', () => {
    it('getTransactionCategories → transaction:getCategories', async () => {
      await api.getTransactionCategories()
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('transaction:getCategories')
    })

    it('createTransactionCategory → transaction:createCategory', async () => {
      await api.createTransactionCategory('Salary', 'EXPENSE')
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('transaction:createCategory', 'Salary', 'EXPENSE')
    })

    it('createTransaction → transaction:create', async () => {
      const data = { amount: 1000, description: 'Test' }
      await api.createTransaction(data as never, 1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('transaction:create', data, 1)
    })

    it('getTransactions → transaction:getAll', async () => {
      const filters = { startDate: '2024-01-01', endDate: '2024-12-31' }
      await api.getTransactions(filters)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('transaction:getAll', filters)
    })

    it('getTransactionSummary → transaction:getSummary', async () => {
      await api.getTransactionSummary('2024-01-01', '2024-12-31')
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('transaction:getSummary', '2024-01-01', '2024-12-31')
    })
  })

  // ---- Budget API ----
  describe('Budget methods', () => {
    it('getBudgets → budget:getAll', async () => {
      await api.getBudgets({ fiscal_year: 2024 })
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('budget:getAll', { fiscal_year: 2024 })
    })

    it('createBudget → budget:create', async () => {
      const data = { budget_name: 'Q1', academic_year_id: 1, line_items: [] }
      await api.createBudget(data as never, 1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('budget:create', data, 1)
    })

    it('submitBudgetForApproval → budget:submit', async () => {
      await api.submitBudgetForApproval(5, 1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('budget:submit', 5, 1)
    })

    it('approveBudget → budget:approve', async () => {
      await api.approveBudget(5, 1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('budget:approve', 5, 1)
    })

    it('setBudgetAllocation → budget:setAllocation', async () => {
      await api.setBudgetAllocation('4020', 2024, 50000, null, 1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('budget:setAllocation', '4020', 2024, 50000, null, 1)
    })

    it('validateBudgetTransaction → budget:validateTransaction', async () => {
      await api.validateBudgetTransaction('4020', 5000, 2024, 'Science')
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('budget:validateTransaction', '4020', 5000, 2024, 'Science')
    })
  })

  // ---- Bank API ----
  describe('Bank methods', () => {
    it('getBankAccounts → bank:getAccounts', async () => {
      await api.getBankAccounts()
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('bank:getAccounts')
    })

    it('createBankAccount → bank:createAccount', async () => {
      const data = { account_name: 'Main', account_number: '001', bank_name: 'KCB' }
      await api.createBankAccount(data)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('bank:createAccount', data)
    })

    it('matchBankTransaction → bank:matchTransaction', async () => {
      await api.matchBankTransaction(1, 2)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('bank:matchTransaction', 1, 2)
    })

    it('markStatementReconciled → bank:markReconciled', async () => {
      await api.markStatementReconciled(1, 2)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('bank:markReconciled', 1, 2)
    })

    it('compatibility alias getAccounts === getBankAccounts', () => {
      expect(api.getAccounts).toBe(api.getBankAccounts)
    })

    it('compatibility alias matchTransaction === matchBankTransaction', () => {
      expect(api.matchTransaction).toBe(api.matchBankTransaction)
    })
  })

  // ---- Approval API ----
  describe('Approval methods', () => {
    it('getApprovalQueue → approvals:getQueue', async () => {
      await api.getApprovalQueue('PENDING')
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('approvals:getQueue', 'PENDING')
    })

    it('approveTransaction → approvals:approve', async () => {
      await api.approveTransaction(1, 'OK', 2)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('approvals:approve', 1, 'OK', 2)
    })

    it('rejectTransaction → approvals:reject', async () => {
      await api.rejectTransaction(1, 'Bad', 2)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('approvals:reject', 1, 'Bad', 2)
    })
  })

  // ---- Asset API ----
  describe('Asset methods', () => {
    it('getAssets → assets:get-all', async () => {
      await api.getAssets({ status: 'ACTIVE' } as never)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('assets:get-all', { status: 'ACTIVE' })
    })

    it('createAsset → assets:create', async () => {
      const data = { asset_name: 'Bus', category_id: 1 }
      await api.createAsset(data as never, 1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('assets:create', data, 1)
    })

    it('runDepreciation → assets:run-depreciation', async () => {
      await api.runDepreciation(1, 2, 3)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('assets:run-depreciation', 1, 2, 3)
    })
  })

  // ---- GL API ----
  describe('GL methods', () => {
    it('getGLAccounts → gl:get-accounts', async () => {
      await api.getGLAccounts({ account_type: 'ASSET' })
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('gl:get-accounts', { account_type: 'ASSET' })
    })

    it('createGLAccount → gl:create-account', async () => {
      const data = { account_code: '1001', account_name: 'Cash', account_type: 'ASSET' }
      await api.createGLAccount(data as never, 1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('gl:create-account', data, 1)
    })

    it('deleteGLAccount → gl:delete-account', async () => {
      await api.deleteGLAccount(5, 1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('gl:delete-account', 5, 1)
    })
  })

  // ---- Opening Balance API ----
  describe('Opening Balance methods', () => {
    it('importStudentOpeningBalances → opening-balance:import-student', async () => {
      const balances = [{ student_id: 1, admission_number: 'A001', student_name: 'Test', opening_balance: 500, balance_type: 'DEBIT' as const }]
      await api.importStudentOpeningBalances(balances, 1, 'CSV', 1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('opening-balance:import-student', balances, 1, 'CSV', 1)
    })
  })

  // ---- Reconciliation API ----
  describe('Reconciliation methods', () => {
    it('runReconciliation → reconciliation:runAll', async () => {
      await api.runReconciliation(1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('reconciliation:runAll', 1)
    })

    it('getReconciliationHistory → reconciliation:getHistory', async () => {
      await api.getReconciliationHistory(10)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('reconciliation:getHistory', 10)
    })
  })

  // ---- Exemption API ----
  describe('Exemption methods', () => {
    it('getExemptions → exemption:getAll', async () => {
      await api.getExemptions({ studentId: 1 })
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('exemption:getAll', { studentId: 1 })
    })

    it('createExemption → exemption:create', async () => {
      const data = { student_id: 1, percentage: 50 }
      await api.createExemption(data as never, 1)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('exemption:create', data, 1)
    })

    it('revokeExemption → exemption:revoke', async () => {
      await api.revokeExemption(1, 'No longer eligible', 2)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('exemption:revoke', 1, 'No longer eligible', 2)
    })
  })

  // ---- Report API ----
  describe('Financial Report methods', () => {
    it('getBalanceSheet → reports:getBalanceSheet', async () => {
      await api.getBalanceSheet('2024-12-31')
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('reports:getBalanceSheet', '2024-12-31')
    })

    it('getTrialBalance → reports:getTrialBalance', async () => {
      await api.getTrialBalance('2024-01-01', '2024-12-31')
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('reports:getTrialBalance', '2024-01-01', '2024-12-31')
    })

    it('getComparativeProfitAndLoss → reports:getComparativeProfitAndLoss', async () => {
      await api.getComparativeProfitAndLoss('2024-01-01', '2024-06-30', '2023-01-01', '2023-06-30')
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('reports:getComparativeProfitAndLoss', '2024-01-01', '2024-06-30', '2023-01-01', '2023-06-30')
    })
  })

  // ---- Export API ----
  describe('Export methods', () => {
    it('exportToPDF → export:pdf', async () => {
      const data = { html: '<h1>Report</h1>', filename: 'report.pdf' }
      await api.exportToPDF(data as never)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('export:pdf', data)
    })
  })

  // ---- Mpesa API ----
  describe('Mpesa methods', () => {
    it('importMpesaTransactions → mpesa:import', async () => {
      const rows = [{ amount: 1000 }]
      await api.importMpesaTransactions(rows, 'CSV', 'file.csv')
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('mpesa:import', rows, 'CSV', 'file.csv')
    })

    it('getUnmatchedMpesaTransactions → mpesa:getUnmatched', async () => {
      await api.getUnmatchedMpesaTransactions()
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('mpesa:getUnmatched')
    })

    it('manualMatchMpesaTransaction → mpesa:manualMatch', async () => {
      await api.manualMatchMpesaTransaction(1, 2)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('mpesa:manualMatch', 1, 2)
    })
  })

  // ---- Procurement API ----
  describe('Procurement methods', () => {
    it('createRequisition → procurement:createRequisition', async () => {
      const data = { items: [], total: 0 }
      await api.createRequisition(data)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('procurement:createRequisition', data)
    })

    it('submitRequisition → procurement:submitRequisition', async () => {
      await api.submitRequisition(5)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('procurement:submitRequisition', 5)
    })

    it('approveRequisition → procurement:approveRequisition', async () => {
      await api.approveRequisition(5)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('procurement:approveRequisition', 5)
    })

    it('rejectRequisition → procurement:rejectRequisition', async () => {
      await api.rejectRequisition(5, 'Over budget')
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('procurement:rejectRequisition', 5, 'Over budget')
    })

    it('getRequisitionsByStatus → procurement:getRequisitionsByStatus', async () => {
      await api.getRequisitionsByStatus('APPROVED')
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('procurement:getRequisitionsByStatus', 'APPROVED')
    })

    it('commitBudget → procurement:commitBudget', async () => {
      await api.commitBudget(5)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('procurement:commitBudget', 5)
    })

    it('approvePaymentVoucher → procurement:approvePaymentVoucher', async () => {
      await api.approvePaymentVoucher(5)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('procurement:approvePaymentVoucher', 5)
    })
  })
})
