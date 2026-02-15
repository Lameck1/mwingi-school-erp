export interface PaymentData {
  transaction_date: string
  amount: number
  student_id: number
  payment_method: string
  payment_reference: string
  idempotency_key?: string
  description?: string
  term_id?: number
  invoice_id?: number
  amount_in_words?: string
}

export interface PaymentResult {
  success: boolean
  error?: string
  message?: string
  transaction_id?: number
  transactionRef?: string
  receiptNumber?: string
  approval_request_id?: number
  requires_approval?: boolean
}

export interface InvoiceItem {
  id: number
  invoice_id: number
  fee_category_id: number
  amount: number
  description?: string
  category_name?: string
}

export interface TransactionCategory {
  id: number
  category_name: string
  type: 'INCOME' | 'EXPENSE'
  description?: string
}

export interface FeeCategory {
  id: number
  category_name: string
  description?: string
}

export interface FeeStructureItem {
  id?: number
  academic_year_id: number
  term_id: number
  fee_category_id: number
  amount: number
}

export interface InvoiceData {
  student_id: number
  academic_year_id: number
  term_id: number
  due_date: string
  invoice_date: string
  items: InvoiceItem[]
}

export interface TransactionData {
  transaction_date: string
  amount: number
  transaction_type: string
  category_id: number
  debit_credit: 'DEBIT' | 'CREDIT'
  description?: string
  student_id?: number
  payment_method?: string
  payment_reference?: string
}

export interface TransactionFilters {
  startDate?: string
  endDate?: string
  transaction_type?: string
  category_id?: number
  student_id?: number
  payment_method?: string
}

export interface FeeStructureItemData {
  stream_id: number
  student_type: string
  fee_category_id: number
  amount: number
}

export interface FeeStructureDB {
  id: number
  academic_year_id: number
  term_id: number
  stream_id: number
  student_type: string
  fee_category_id: number
  amount: number
}

export interface EnrollmentWithStudent {
  id: number
  student_id: number
  academic_year_id: number
  term_id: number
  stream_id: number
  status: string
  first_name: string
  last_name: string
}

export interface FeeInvoiceDB {
  id: number
  invoice_number: string
  student_id: number
  term_id: number
  invoice_date: string
  due_date: string
  total_amount: number
  amount_paid: number
  status: 'PENDING' | 'PAID' | 'PARTIAL'
  created_by_user_id: number
  created_at: string
  updated_at: string
}

export interface FeeInvoiceWithDetails extends FeeInvoiceDB {
  student_name: string
  term_name: string
}

export interface FeeStructureWithDetails extends FeeStructureDB {
  category_name: string
  stream_name: string
}

export interface InvoiceItemCreation {
  fee_category_id: number
  description: string
  amount: number
  exemption_id: number | null
  original_amount: number
  exemption_amount: number
  gl_account_code?: string
}
