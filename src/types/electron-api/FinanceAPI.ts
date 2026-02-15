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
  payment_method?: string
  payment_reference?: string
  debit_credit?: string
  reference: string
  is_voided?: boolean
  created_at: string
  updated_at: string
}

export interface PaymentRecordData {
  student_id: number
  amount: number
  payment_method: string
  payment_reference?: string
  description?: string
  transaction_date: string
  term_id: number
  idempotency_key?: string
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

export interface FinanceAPI {
  // Fee Categories
  getFeeCategories: () => Promise<FeeCategory[]>
  createFeeCategory: (_name: string, _description: string) => Promise<FeeCategory>

  // Fee Structure
  getFeeStructure: (_academicYearId: number, _termId: number) => Promise<FeeStructure[]>
  saveFeeStructure: (_data: FeeStructureCreateData[], _academicYearId: number, _termId: number) => Promise<FeeStructure[]>
  generateBatchInvoices: (_academicYearId: number, _termId: number) => Promise<{ success: boolean; count: number }>
  generateStudentInvoice: (_studentId: number, _yearId: number, _termId: number) => Promise<{ success: boolean; invoiceNumber?: string; error?: string }>
  getInvoices: (_filters?: Partial<Invoice>) => Promise<Invoice[]>

  // Payments
  recordPayment: (_data: PaymentRecordData) => Promise<{ success: boolean; transactionRef?: string; receipt_number?: string; errors?: string[]; error?: string }>
  getPaymentsByStudent: (_studentId: number) => Promise<Payment[]>
  payWithCredit: (_data: { studentId: number; invoiceId: number; amount: number }) => Promise<{ success: boolean; error?: string; message?: string }>
  voidPayment: (_transactionId: number, _voidReason: string, _recoveryMethod?: string) => Promise<{ success: boolean; error?: string; message?: string; transaction_id?: number }>

  // Transactions (General)
  getTransactionCategories: () => Promise<TransactionCategory[]>
  createTransactionCategory: (_name: string, _type: string) => Promise<TransactionCategory>
  createTransaction: (_data: Partial<Transaction>) => Promise<Transaction>
  getTransactions: (_filters?: Partial<Transaction>) => Promise<Transaction[]>
  getTransactionSummary: (_startDate: string, _endDate: string) => Promise<{ totalIncome: number; totalExpense: number; netBalance: number }>

  // Invoices
  createInvoice: (_data: Partial<Invoice>, _items: InvoiceItem[]) => Promise<{ success: boolean; invoiceNumber: string; id: number }>
  getInvoicesByStudent: (_studentId: number) => Promise<Invoice[]>
  getInvoiceItems: (_invoiceId: number) => Promise<InvoiceItem[]>

  // Cash Flow & Forecasting
  getCashFlowStatement: (startDate: string, endDate: string) => Promise<CashFlowStatement>
  getForecast: (months: number) => Promise<FinancialForecast>

  // Approvals
  getApprovalQueue: (filter: 'PENDING' | 'ALL') => Promise<{ success: boolean; data: FinanceApprovalRequest[]; error?: string; message?: string }>
  approveTransaction: (approvalId: number, reviewNotes: string) => Promise<{ success: boolean; error?: string; message?: string }>
  rejectTransaction: (approvalId: number, reviewNotes: string) => Promise<{ success: boolean; error?: string; message?: string }>

  // Manual Fixes
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
  scholarship_name?: string
  student_name?: string
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
