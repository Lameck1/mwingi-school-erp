import {
  InvoiceValidator,
  PaymentProcessor,
  PaymentQueryService,
  VoidProcessor
} from './PaymentService.internal'
import { getDatabase } from '../../database'

import type {
  ApprovalQueueItem,
  IPaymentQueryService,
  IPaymentRecorder,
  IPaymentValidator,
  IPaymentVoidProcessor,
  PaymentData,
  PaymentResult,
  PaymentTransaction,
  ValidationResult,
  VoidPaymentData,
  VoidedTransaction
} from './PaymentService.types'
import type Database from 'better-sqlite3-multiple-ciphers'

export type {
  ApprovalQueueItem,
  Invoice,
  IPaymentQueryService,
  IPaymentRecorder,
  IPaymentValidator,
  IPaymentVoidProcessor,
  PaymentData,
  PaymentResult,
  PaymentTransaction,
  ValidationResult,
  VoidPaymentData,
  VoidedTransaction
} from './PaymentService.types'

export class PaymentService implements IPaymentRecorder, IPaymentVoidProcessor, IPaymentValidator, IPaymentQueryService {
  private readonly db: Database.Database
  private readonly processor: PaymentProcessor
  private readonly voidProcessor: VoidProcessor
  private readonly validator: InvoiceValidator
  private readonly queryService: PaymentQueryService

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.processor = new PaymentProcessor(this.db)
    this.voidProcessor = new VoidProcessor(this.db)
    this.validator = new InvoiceValidator(this.db)
    this.queryService = new PaymentQueryService(this.db)
  }

  private recordPaymentSync(data: PaymentData): PaymentResult {
    if (!data.student_id || data.student_id <= 0) {
      return { success: false, message: 'Invalid student ID.' }
    }

    if (!data.transaction_date || !data.payment_method || !data.payment_reference) {
      return { success: false, message: 'Missing required payment fields.' }
    }

    const student = this.db.prepare('SELECT id FROM student WHERE id = ?').get(data.student_id) as { id: number } | undefined
    if (!student) {
      return { success: false, message: 'Student not found.' }
    }

    const user = this.db.prepare('SELECT id FROM user WHERE id = ?').get(data.recorded_by_user_id) as { id: number } | undefined
    if (!user) {
      return { success: false, message: 'Invalid user session. Please sign in again.' }
    }

    if (data.invoice_id) {
      const invoice = this.db.prepare('SELECT id, student_id FROM fee_invoice WHERE id = ?').get(data.invoice_id) as { id: number; student_id: number } | undefined
      if (!invoice) {
        return { success: false, message: 'Invoice not found.' }
      }
      if (invoice.student_id !== data.student_id) {
        return { success: false, message: 'Invoice does not belong to the selected student.' }
      }
    }

    const validation = this.validator.validatePaymentAgainstInvoices(data.student_id, data.amount)
    if (!validation.valid) {
      return {
        success: false,
        message: validation.message
      }
    }

    const result = this.processor.processPayment(data)

    return {
      success: true,
      message: 'Payment recorded successfully',
      transaction_id: result.transactionId,
      transactionRef: result.transactionRef,
      receiptNumber: result.receiptNumber
    }
  }

  recordPayment(data: PaymentData): PaymentResult {
    try {
      const run = this.db.transaction(() => this.recordPaymentSync(data))
      return run()
    } catch (error) {
      throw new Error(`Failed to record payment: ${(error as Error).message}`)
    }
  }

  async voidPayment(data: VoidPaymentData): Promise<PaymentResult> {
    return this.voidProcessor.voidPayment(data)
  }

  validatePaymentAgainstInvoices(studentId: number, amount: number): ValidationResult {
    return this.validator.validatePaymentAgainstInvoices(studentId, amount)
  }

  async getStudentPaymentHistory(studentId: number, limit = 50): Promise<PaymentTransaction[]> {
    return this.queryService.getStudentPaymentHistory(studentId, limit)
  }

  async getVoidedTransactionsReport(startDate: string, endDate: string): Promise<VoidedTransaction[]> {
    return this.queryService.getVoidedTransactionsReport(startDate, endDate)
  }

  async getPaymentApprovalQueue(role: string): Promise<ApprovalQueueItem[]> {
    return this.queryService.getPaymentApprovalQueue(role)
  }
}
