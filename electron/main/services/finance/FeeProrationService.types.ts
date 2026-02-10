export interface ProRationLogEntry {
  id: number
  invoice_id: number
  student_id: number
  full_amount: number
  pro_rated_amount: number
  discount_percentage: number
  enrollment_date: string
  term_start: string
  term_end: string
  days_in_term: number
  days_enrolled: number
  created_at: string
  invoice_number?: string
  description?: string
}

export interface ProrationDetail extends ProRationLogEntry {
  invoice_number: string
  invoice_date: string
  invoice_type: string
  original_amount: number
  prorated_amount: number
}

export interface GenerateProRatedInvoiceInput {
  studentId: number
  enrollmentDate: string
  grade: string
  userId: number
}

export interface IProRateCalculator {
  calculateProRatedFee(
    fullAmount: number,
    termStartDate: string,
    termEndDate: string,
    enrollmentDate: string
  ): ProRationResult
}

export interface ITermDateValidator {
  validateEnrollmentDate(
    termStartDate: string,
    termEndDate: string,
    enrollmentDate: string
  ): ValidationResult
}

export interface IProRatedInvoiceGenerator {
  generateProRatedInvoice(
    studentId: number,
    templateInvoiceId: number,
    enrollmentDate: string,
    userId: number
  ): Promise<InvoiceGenerationResult>
}

export interface ProRationResult {
  full_amount: number
  pro_rated_amount: number
  discount_percentage: number
  days_in_term: number
  days_enrolled: number
  enrollment_date: string
  calculation_method: 'DAILY' | 'WEEKLY' | 'MONTHLY'
}

export interface ValidationResult {
  valid: boolean
  message: string
}

export interface InvoiceGenerationResult {
  success: boolean
  message: string
  invoice_id?: number
  pro_ration_details?: ProRationResult
}

export interface InvoiceTemplate {
  id: number
  student_id: number
  amount: number
  amount_paid: number
  due_date: string
  invoice_date: string
  invoice_number: string
  description: string
  invoice_type: string
  term_id: number
  class_id: number
  status: string
  grade?: string
}
