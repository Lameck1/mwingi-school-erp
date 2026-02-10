export interface IPaymentRecorder {
  recordPayment(data: PaymentData): PaymentResult
}

export interface IPaymentVoidProcessor {
  voidPayment(data: VoidPaymentData): Promise<PaymentResult>
}

export interface IPaymentValidator {
  validatePaymentAgainstInvoices(studentId: number, amount: number): ValidationResult
}

export interface IPaymentQueryService {
  getStudentPaymentHistory(studentId: number, limit?: number): Promise<PaymentTransaction[]>
  getVoidedTransactionsReport(startDate: string, endDate: string): Promise<VoidedTransaction[]>
  getPaymentApprovalQueue(role: string): Promise<ApprovalQueueItem[]>
}

export interface PaymentData {
  student_id: number
  amount: number
  transaction_date: string
  payment_method: string
  payment_reference: string
  description?: string
  recorded_by_user_id: number
  invoice_id?: number
  cheque_number?: string
  bank_name?: string
  amount_in_words?: string
  term_id: number
}

export interface PaymentResult {
  success: boolean
  message: string
  transaction_id?: number
  transactionRef?: string
  receiptNumber?: string
  approval_request_id?: number
  requires_approval?: boolean
}

export interface VoidPaymentData {
  transaction_id: number
  void_reason: string
  voided_by: number
  recovery_method?: string
}

export interface ValidationResult {
  valid: boolean
  message: string
  invoices?: Invoice[]
}

export interface PaymentTransaction {
  id: number
  student_id: number
  amount: number
  transaction_date: string
  payment_method: string
  reference: string
  description: string
}

export interface VoidedTransaction {
  id: number
  transaction_id: number
  student_id: number
  amount: number
  void_reason: string
  voided_by: number
  voided_at: string
}

export interface ApprovalQueueItem {
  id: number
  student_id: number
  amount: number
  status: string
}

export interface Invoice {
  id: number
  student_id: number
  amount?: number
  total_amount?: number
  amount_paid?: number
  status: string
}
