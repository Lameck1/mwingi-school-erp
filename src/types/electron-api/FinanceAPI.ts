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
  category_id: number
  amount: number
  description: string
  transaction_date: string
  reference: string
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
  generateBatchInvoices: (_academicYearId: number, _termId: number, _userId: number) => Promise<{ success: boolean; count: number }>
  getInvoices: (_filters?: Partial<Invoice>) => Promise<Invoice[]>

  // Payments
  recordPayment: (_data: PaymentRecordData, _userId: number) => Promise<{ success: boolean; transactionRef?: string; receipt_number?: string; errors?: string[]; message?: string }>
  getPaymentsByStudent: (_studentId: number) => Promise<Payment[]>
  payWithCredit: (_data: { studentId: number; invoiceId: number; amount: number }, _userId: number) => Promise<{ success: boolean; message?: string }>

  // Transactions (General)
  getTransactionCategories: () => Promise<TransactionCategory[]>
  createTransactionCategory: (_name: string, _type: string) => Promise<TransactionCategory>
  createTransaction: (_data: Partial<Transaction>, _userId: number) => Promise<Transaction>
  getTransactions: (_filters?: Partial<Transaction>) => Promise<Transaction[]>
  getTransactionSummary: (_startDate: string, _endDate: string) => Promise<{ totalIncome: number; totalExpense: number; netBalance: number }>

  // Invoices
  createInvoice: (_data: Partial<Invoice>, _items: InvoiceItem[], _userId: number) => Promise<{ success: boolean; invoiceNumber: string; id: number }>
  getInvoicesByStudent: (_studentId: number) => Promise<Invoice[]>
  getInvoiceItems: (_invoiceId: number) => Promise<InvoiceItem[]>

  // Cash Flow & Forecasting
  getCashFlowStatement: (startDate: string, endDate: string) => Promise<CashFlowStatement>
  getForecast: (months: number) => Promise<FinancialForecast>

  // Approvals
  getApprovalQueue: (filter: 'PENDING' | 'ALL') => Promise<{ success: boolean; data: FinanceApprovalRequest[]; message?: string }>
  approveTransaction: (approvalId: number, reviewNotes: string, reviewerUserId: number) => Promise<{ success: boolean; message?: string }>
  rejectTransaction: (approvalId: number, reviewNotes: string, reviewerUserId: number) => Promise<{ success: boolean; message?: string }>

  // Manual Fixes
}
