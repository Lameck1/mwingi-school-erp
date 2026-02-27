export interface FeeCategory {
  id: number
  category_name: string
  description: string
  created_at: string
  updated_at: string
}

export interface CashFlowStatement {
  op_inflow: number;
  op_outflow: number;
  op_net: number;
  inv_inflow: number;
  inv_outflow: number;
  inv_net: number;
  fin_inflow: number;
  fin_outflow: number;
  fin_net: number;
  net_change: number;
  opening_balance: number;
  closing_balance: number;
}

export interface FinancialForecast {
  labels: string[];
  actual: number[];
  projected: number[];
  trend_slope: number;
}

export interface FeeStructure {
  id: number
  academic_year_id: number
  term_id: number
  stream_id: number
  student_type: string
  fee_category_id: number
  amount: number
  created_at: string
  updated_at: string
}

export type FeeStructureCreateData = Omit<FeeStructure, 'id' | 'created_at' | 'updated_at'>

export interface Invoice {
  id: number
  student_id: number
  academic_year_id: number
  term_id: number
  invoice_number: string
  total_amount: number
  amount_paid: number
  balance: number
  status: 'PENDING' | 'PAID' | 'PARTIAL'
  invoice_date: string
  due_date: string
  created_at: string
  updated_at: string
  student_name?: string
  term_name?: string
}

export interface Payment {
  id: number
  invoice_id: number
  amount: number
  payment_method: string
  transaction_ref: string
  receipt_number: string
  created_at: string
  updated_at: string
}

export interface InvoiceItem {
  id: number
  invoice_id: number
  fee_category_id: number
  description: string
  amount: number
  created_at: string
  updated_at: string
  category_name?: string
}

export interface TransactionCategory {
  id: number
  category_name: string
  category_type: 'INCOME' | 'EXPENSE'
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: number
  transaction_ref?: string
  category_id: number
  category_name?: string
  recorded_by?: string
  amount: number
  description: string
  transaction_date: string
  transaction_type?: string
  payment_method?: string | undefined
  payment_reference?: string | undefined
  debit_credit?: string | undefined
  reference: string
  is_voided?: boolean | undefined
  created_at: string
  updated_at: string
}

export interface PaymentRecordData {
  student_id: number
  amount: number
  payment_method: string
  payment_reference?: string | undefined
  description?: string | undefined
  transaction_date: string
  term_id: number
  idempotency_key?: string | undefined
}

export interface FinanceApprovalRequest {
  id: number;
  journal_entry_id: number;
  entry_ref: string;
  entry_type: string;
  description: string;
  amount: number;
  student_name?: string;
  requested_by_name: string;
  requested_at: string;
  rule_name: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

type IPCResult<T> = T | { success: false; error: string; errors?: string[] };

// M-Pesa reconciliation types
export interface MpesaTransaction {
  id: number
  transaction_receipt: string
  transaction_date: string
  amount: number
  receiver_party_public_name: string
  sender_party_public_name: string
  sender_msisdn: string
  account_reference: string
  match_status: 'PENDING' | 'MATCHED' | 'FAILED' | 'IGNORED'
  match_confidence_score: number | null
  matched_student_id: number | null
  student_name?: string
  student_admission_number?: string
  is_duplicate: boolean
  created_at: string
}

export interface MpesaSummary {
  totalSummary: {
    total_processed: number
    total_matched: number
    total_pending: number
    total_failed: number
    total_ignored: number
    total_duplicates: number
    total_amount_processed: number
  }
}

export type JssAccountType = 'TUITION' | 'OPERATIONS' | 'INFRASTRUCTURE'

export interface FinanceAPI {
  // Fee Categories
  getFeeCategories: () => Promise<IPCResult<FeeCategory[]>>
  createFeeCategory: (_name: string, _description: string) => Promise<FeeCategory>

  // Fee Policies & Vote Heads
  createInstallmentPolicy: (data: {
    policy_name: string
    academic_year_id: number
    stream_id?: number
    student_type: 'DAY_SCHOLAR' | 'BOARDER' | 'ALL'
    schedules: Array<{ installment_number: number; percentage: number; due_date: string; description?: string }>
  }) => Promise<{ success: boolean; id?: number; error?: string }>
  getPoliciesForTerm: (academicYearId: number, streamId?: number, studentType?: string) => Promise<{
    success: boolean; data?: Array<{
      id: number
      policy_name: string
      academic_year_id: number
      stream_id: number | null
      student_type: 'DAY_SCHOLAR' | 'BOARDER' | 'ALL'
      number_of_installments: number
      is_active: number
      created_at: string
    }>; error?: string
  }>
  getInstallmentSchedule: (policyId: number) => Promise<{
    success: boolean; data?: Array<{
      id?: number
      installment_number: number
      percentage: number
      due_date: string
      description?: string
    }>; error?: string
  }>
  deactivatePolicy: (policyId: number) => Promise<{ success: boolean; error?: string }>
  getVoteHeadBalances: (invoiceId: number) => Promise<{
    success: boolean; data?: Array<{
      fee_category_id: number
      category_name: string
      total_charged: number
      total_paid: number
      outstanding: number
    }>; error?: string
  }>

  // Virement Services (JSS)
  // JSS Virement types
  validateExpenditure: (expenseAccountType: JssAccountType, fundingCategoryId: number) => Promise<{ success: boolean; data?: { allowed: boolean; reason?: string; from_account: JssAccountType; to_account: JssAccountType }; error?: string }>
  requestVirement: (fromAccount: string, toAccount: string, amount: number, reason: string) => Promise<{ success: boolean; id?: number; error?: string }>
  reviewVirement: (requestId: number, decision: string, reviewNotes: string) => Promise<{ success: boolean; error?: string }>
  getPendingVirementRequests: () => Promise<{ success: boolean; data?: Array<{ id: number; from_account_type: JssAccountType; to_account_type: JssAccountType; amount: number; reason: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; requested_by_user_id: number; reviewed_by_user_id: number | null; created_at: string }>; error?: string }>
  getVirementAccountSummaries: () => Promise<{ success: boolean; data?: Array<{ account_type: JssAccountType; total_invoiced: number; total_collected: number; total_expenditure: number; balance: number }>; error?: string }>

  // Fee Structure
  getFeeStructure: (_academicYearId: number, _termId: number) => Promise<IPCResult<FeeStructure[]>>
  saveFeeStructure: (_data: FeeStructureCreateData[], _academicYearId: number, _termId: number) => Promise<IPCResult<FeeStructure[]>>
  generateBatchInvoices: (_academicYearId: number, _termId: number, _userId: number) => Promise<{ success: boolean; count: number }>
  generateStudentInvoice: (_studentId: number, _yearId: number, _termId: number, _userId: number) => Promise<{ success: boolean; invoiceNumber?: string; error?: string }>
  getInvoices: (_filters?: { student_id?: number | undefined; academic_year_id?: number | undefined; term_id?: number | undefined; status?: string | undefined }) => Promise<IPCResult<Invoice[]>>

  // Payments
  recordPayment: (_data: PaymentRecordData, _userId: number) => Promise<{ success: boolean; transactionRef?: string; receipt_number?: string; errors?: string[]; error?: string }>
  getPaymentsByStudent: (_studentId: number) => Promise<IPCResult<Payment[]>>
  payWithCredit: (_data: { studentId: number; invoiceId: number; amount: number }, _userId: number) => Promise<{ success: boolean; error?: string; message?: string }>
  voidPayment: (_transactionId: number, _voidReason: string, _userId: number, _recoveryMethod?: string) => Promise<{ success: boolean; error?: string; message?: string; transaction_id?: number }>

  // Transactions (General)
  getTransactionCategories: () => Promise<IPCResult<TransactionCategory[]>>
  createTransactionCategory: (_name: string, _type: string) => Promise<TransactionCategory>
  createTransaction: (_data: { amount: number; description: string; transaction_date: string; category_id: number; transaction_type?: string | undefined; payment_method?: string | undefined; payment_reference?: string | undefined; reference?: string | undefined }, _userId: number) => Promise<Transaction>
  getTransactions: (_filters?: { category_id?: number | undefined; start_date?: string | undefined; end_date?: string | undefined; transaction_type?: string | undefined; page?: number; pageSize?: number }) => Promise<IPCResult<{ rows: Transaction[]; totalCount: number; page: number; pageSize: number }>>
  getTransactionSummary: (_startDate: string, _endDate: string) => Promise<IPCResult<{ totalIncome: number; totalExpense: number; netBalance: number }>>

  // Invoices
  createInvoice: (_data: Partial<Invoice>, _items: InvoiceItem[], _userId: number) => Promise<{ success: boolean; invoiceNumber: string; id: number }>
  getInvoicesByStudent: (_studentId: number) => Promise<IPCResult<Invoice[]>>
  getInvoiceItems: (_invoiceId: number) => Promise<IPCResult<InvoiceItem[]>>

  // Cash Flow & Forecasting
  getCashFlowStatement: (startDate: string, endDate: string) => Promise<IPCResult<CashFlowStatement>>
  getForecast: (months: number) => Promise<IPCResult<FinancialForecast>>

  // Approvals
  getApprovalQueue: (filter: 'PENDING' | 'ALL') => Promise<{ success: boolean; data: FinanceApprovalRequest[]; error?: string; message?: string }>
  approveTransaction: (approvalId: number, reviewNotes: string, reviewerUserId: number) => Promise<{ success: boolean; error?: string; message?: string }>
  rejectTransaction: (approvalId: number, reviewNotes: string, reviewerUserId: number) => Promise<{ success: boolean; error?: string; message?: string }>
  // Manual Fixes

  // M-Pesa Reconciliation
  importMpesaTransactions: (rows: ReadonlyArray<Record<string, unknown>>, source: 'CSV' | 'API' | 'MANUAL', fileName?: string) => Promise<{ success: boolean; batchId?: number; summary?: MpesaSummary; error?: string }>
  getUnmatchedMpesaTransactions: () => Promise<MpesaTransaction[]>
  getMpesaTransactionsByStatus: (status: 'PENDING' | 'MATCHED' | 'FAILED' | 'IGNORED') => Promise<MpesaTransaction[]>
  manualMatchMpesaTransaction: (transactionId: number, studentId: number) => Promise<{ success: boolean; error?: string }>
  getMpesaSummary: () => Promise<MpesaSummary>

  // Procurement P2P
  createRequisition: (data: unknown) => Promise<{ success: boolean; id?: number; error?: string }>
  submitRequisition: (id: number) => Promise<{ success: boolean; error?: string }>
  approveRequisition: (id: number) => Promise<{ success: boolean; error?: string }>
  rejectRequisition: (id: number, reason: string) => Promise<{ success: boolean; error?: string }>
  getRequisitionsByStatus: (status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'COMMITTED' | 'CANCELLED') => Promise<unknown[]>
  commitBudget: (requisitionId: number) => Promise<{ success: boolean; id?: number; error?: string }>
  createPurchaseOrder: (data: unknown) => Promise<{ success: boolean; id?: number; error?: string }>
  createGrn: (data: unknown) => Promise<{ success: boolean; id?: number; error?: string }>
  createPaymentVoucher: (data: unknown) => Promise<{ success: boolean; id?: number; error?: string }>
  approvePaymentVoucher: (id: number) => Promise<{ success: boolean; error?: string }>
  getPoByRequisition: (requisitionId: number) => Promise<{ id: number; po_number: string; requisition_id: number; supplier_id: number; total_amount: number; status: 'ISSUED' | 'PARTIALLY_RECEIVED' | 'FULLY_RECEIVED' | 'CANCELLED' } | undefined>
  getPoSummary: (poId: number) => Promise<{
    po: { id: number; po_number: string; requisition_id: number; supplier_id: number; total_amount: number; status: 'ISSUED' | 'PARTIALLY_RECEIVED' | 'FULLY_RECEIVED' | 'CANCELLED' }
    items: Array<{ id: number; description: string; quantity: number; unit_of_measure: string; unit_cost: number; total_cost: number; received_quantity: number; outstanding: number }>
    latest_grn?: { id: number; status: 'PENDING_INSPECTION' | 'ACCEPTED' | 'PARTIALLY_ACCEPTED' | 'REJECTED' } | null
  } | undefined>
}

// Scholarship Types
export interface ScholarshipCreateData {
  name: string
  description: string
  scholarship_type: 'MERIT' | 'NEED_BASED' | 'SPORTS' | 'PARTIAL' | 'FULL'
  amount: number
  percentage?: number
  max_beneficiaries: number
  eligibility_criteria: string
  valid_from: string
  valid_to: string
  sponsor_name?: string
  sponsor_contact?: string
}

export interface ScholarshipAllocationData {
  scholarship_id: number
  student_id: number
  amount_allocated: number
  allocation_notes: string
  effective_date: string
}

export interface Scholarship {
  id: number
  name: string
  description: string
  scholarship_type: 'MERIT' | 'NEED_BASED' | 'SPORTS' | 'PARTIAL' | 'FULL'
  amount: number
  percentage: number | null
  max_beneficiaries: number
  eligibility_criteria: string
  valid_from: string
  valid_to: string
  sponsor_name: string | null
  sponsor_contact: string | null
  is_active: boolean
  created_at: string
}

export interface StudentScholarship {
  id: number
  scholarship_id: number
  student_id: number
  amount_allocated: number
  allocation_notes: string
  effective_date: string
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED'
  created_at: string
  scholarship_name?: string | undefined
  student_name?: string | undefined
}

// CBC Strand Types
export interface CBCExpenseData {
  strand_id: number
  expense_date: string
  description: string
  gl_account_code: string
  amount_cents: number
  term: number
  fiscal_year: number
  receipt_number?: string
  created_by: number
}

export interface StudentParticipationData {
  student_id: number
  strand_id: number
  activity_name: string
  start_date: string
  academic_year: number
  term: number
  participation_level: 'PRIMARY' | 'SECONDARY' | 'INTEREST'
}
