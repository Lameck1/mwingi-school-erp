import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

// ============================================================================
// SEGREGATED INTERFACES (ISP)
// ============================================================================

export interface IPaymentRecorder {
  recordPayment(data: PaymentData): Promise<PaymentResult>
}

export interface IPaymentVoidProcessor {
  voidPayment(data: VoidPaymentData): Promise<PaymentResult>
}

export interface IPaymentValidator {
  validatePaymentAgainstInvoices(studentId: number, amount: number): Promise<ValidationResult>
}

export interface IPaymentQueryService {
  getStudentPaymentHistory(studentId: number, limit?: number): Promise<PaymentTransaction[]>
  getVoidedTransactionsReport(startDate: string, endDate: string): Promise<VoidedTransaction[]>
  getPaymentApprovalQueue(role: string): Promise<ApprovalQueueItem[]>
}

export interface PaymentData {
  student_id: number
  amount: number
  payment_date: string
  payment_method: string
  reference: string
  description?: string
  recorded_by: number
  invoice_id?: number
  cheque_number?: string
  bank_name?: string
  amount_in_words?: string
}

export interface PaymentResult {
  success: boolean
  message: string
  transaction_id?: number
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
  amount: number
  status: string
}

// ============================================================================
// REPOSITORY LAYER (SRP)
// ============================================================================

class PaymentTransactionRepository {
  async createTransaction(data: PaymentData): Promise<number> {
    const db = getDatabase()
    const result = db.prepare(`
      INSERT INTO ledger_transaction (
        student_id, transaction_type, amount, transaction_date, description,
        payment_method, reference, recorded_by, cheque_number, bank_name,
        is_approved, approval_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.student_id,
      'CREDIT',
      data.amount,
      data.payment_date,
      data.description || `Payment received: ${data.reference}`,
      data.payment_method,
      data.reference,
      data.recorded_by,
      data.cheque_number || null,
      data.bank_name || null,
      1,
      'APPROVED'
    )
    return result.lastInsertRowid as number
  }

  async createReversal(studentId: number, originalAmount: number, voidReason: string, voidedBy: number): Promise<number> {
    const db = getDatabase()
    const result = db.prepare(`
      INSERT INTO ledger_transaction (
        student_id, transaction_type, amount, transaction_date, description,
        payment_method, reference, recorded_by, is_voided, void_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      studentId,
      'REVERSAL',
      -originalAmount,
      new Date().toISOString().split('T')[0],
      `Void of transaction`,
      'VOID',
      `VOID_REF_${studentId}_${Date.now()}`,
      voidedBy,
      1,
      voidReason
    )
    return result.lastInsertRowid as number
  }

  async getTransaction(id: number): Promise<PaymentTransaction | null> {
    const db = getDatabase()
    return db.prepare(`SELECT * FROM ledger_transaction WHERE id = ?`).get(id) as PaymentTransaction | null
  }

  async getStudentHistory(studentId: number, limit: number): Promise<PaymentTransaction[]> {
    const db = getDatabase()
    return db.prepare(`
      SELECT * FROM ledger_transaction
      WHERE student_id = ? AND transaction_type IN ('CREDIT', 'PAYMENT')
      ORDER BY transaction_date DESC, created_at DESC
      LIMIT ?
    `).all(studentId, limit) as PaymentTransaction[]
  }

  async updateStudentBalance(studentId: number, newBalance: number): Promise<void> {
    const db = getDatabase()
    db.prepare(`UPDATE student SET credit_balance = ? WHERE id = ?`).run(newBalance, studentId)
  }

  async getStudentBalance(studentId: number): Promise<number> {
    const db = getDatabase()
    const result = db.prepare(`SELECT credit_balance FROM student WHERE id = ?`).get(studentId) as { credit_balance: number } | undefined
    return result?.credit_balance || 0
  }

  async getStudentById(studentId: number): Promise<{ id: number; credit_balance: number } | null> {
    const db = getDatabase()
    return db.prepare(`SELECT id, credit_balance FROM student WHERE id = ?`).get(studentId) as { id: number; credit_balance: number } | null
  }
}

// ============================================================================
// VOID AUDIT REPOSITORY (SRP)
// ============================================================================

class VoidAuditRepository {
  async recordVoid(transactionId: number, studentId: number, amount: number, description: string, voidReason: string, voidedBy: number, recoveryMethod?: string): Promise<number> {
    const db = getDatabase()
    const result = db.prepare(`
      INSERT INTO void_audit (
        transaction_id, transaction_type, original_amount, student_id, description,
        void_reason, voided_by, voided_at, recovered_method, recovered_by, recovered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      transactionId,
      'PAYMENT',
      amount,
      studentId,
      description,
      voidReason,
      voidedBy,
      new Date().toISOString(),
      recoveryMethod || null,
      null,
      null
    )
    return result.lastInsertRowid as number
  }

  async getVoidReport(startDate: string, endDate: string): Promise<VoidedTransaction[]> {
    const db = getDatabase()
    return db.prepare(`
      SELECT va.*, u.first_name, u.last_name, s.admission_number, s.first_name as student_first_name
      FROM void_audit va
      LEFT JOIN user u ON va.voided_by = u.id
      LEFT JOIN student s ON va.student_id = s.id
      WHERE va.voided_at >= ? AND va.voided_at <= ?
      ORDER BY va.voided_at DESC
    `).all(startDate, endDate) as VoidedTransaction[]
  }
}

// ============================================================================
// INVOICE VALIDATOR (SRP)
// ============================================================================

class InvoiceValidator implements IPaymentValidator {
  async validatePaymentAgainstInvoices(studentId: number, amount: number): Promise<ValidationResult> {
    const db = getDatabase()

    try {
      const invoices = db.prepare(`
        SELECT * FROM fee_invoice
        WHERE student_id = ? AND status = 'OUTSTANDING'
        ORDER BY due_date ASC
      `).all(studentId) as Invoice[]

      if (!invoices || invoices.length === 0) {
        return {
          valid: true,
          message: 'No outstanding invoices for this student',
          invoices: []
        }
      }

      const totalOutstanding = invoices.reduce((sum, inv) => sum + inv.amount, 0)

      if (amount > totalOutstanding) {
        return {
          valid: true,
          message: `Payment exceeds outstanding balance. Overpayment will be credited.`,
          invoices
        }
      }

      return {
        valid: true,
        message: `Payment applied to ${invoices.length} outstanding invoice(s)`,
        invoices
      }
    } catch (error) {
      throw new Error(`Failed to validate payment: ${(error as Error).message}`)
    }
  }
}

// ============================================================================
// PAYMENT PROCESSOR (SRP)
// ============================================================================

class PaymentProcessor {
  private transactionRepo = new PaymentTransactionRepository()

  async processPayment(data: PaymentData): Promise<number> {
    const student = await this.transactionRepo.getStudentById(data.student_id)

    if (!student) {
      throw new Error(`Student with ID ${data.student_id} not found`)
    }

    const newCreditBalance = (student.credit_balance || 0) + data.amount
    const transactionId = await this.transactionRepo.createTransaction(data)

    await this.transactionRepo.updateStudentBalance(data.student_id, newCreditBalance)

    logAudit(
      data.recorded_by,
      'CREATE',
      'ledger_transaction',
      transactionId,
      null,
      { amount: data.amount, student_id: data.student_id, payment_method: data.payment_method }
    )

    return transactionId
  }
}

// ============================================================================
// VOID PROCESSOR (SRP)
// ============================================================================

class VoidProcessor implements IPaymentVoidProcessor {
  private transactionRepo = new PaymentTransactionRepository()
  private voidAuditRepo = new VoidAuditRepository()

  async voidPayment(data: VoidPaymentData): Promise<PaymentResult> {
    try {
      const transaction = await this.transactionRepo.getTransaction(data.transaction_id)

      if (!transaction) {
        return {
          success: false,
          message: 'Transaction not found'
        }
      }

      const reversalId = await this.transactionRepo.createReversal(
        transaction.student_id,
        transaction.amount,
        data.void_reason,
        data.voided_by
      )

      await this.voidAuditRepo.recordVoid(
        data.transaction_id,
        transaction.student_id,
        transaction.amount,
        transaction.description,
        data.void_reason,
        data.voided_by,
        data.recovery_method
      )

      const currentBalance = await this.transactionRepo.getStudentBalance(transaction.student_id)
      const newBalance = currentBalance - transaction.amount
      await this.transactionRepo.updateStudentBalance(transaction.student_id, newBalance)

      logAudit(
        data.voided_by,
        'VOID',
        'void_audit',
        reversalId,
        null,
        { original_transaction_id: data.transaction_id, void_reason: data.void_reason }
      )

      return {
        success: true,
        message: `Payment voided successfully. Reversal transaction: #${reversalId}`,
        transaction_id: reversalId
      }
    } catch (error) {
      throw new Error(`Failed to void payment: ${(error as Error).message}`)
    }
  }
}

// ============================================================================
// PAYMENT QUERY SERVICE (SRP)
// ============================================================================

class PaymentQueryService implements IPaymentQueryService {
  private transactionRepo = new PaymentTransactionRepository()
  private voidAuditRepo = new VoidAuditRepository()

  async getStudentPaymentHistory(studentId: number, limit = 50): Promise<PaymentTransaction[]> {
    return this.transactionRepo.getStudentHistory(studentId, limit)
  }

  async getVoidedTransactionsReport(startDate: string, endDate: string): Promise<VoidedTransaction[]> {
    return this.voidAuditRepo.getVoidReport(startDate, endDate)
  }

  async getPaymentApprovalQueue(role: string): Promise<ApprovalQueueItem[]> {
    const db = getDatabase()
    return db.prepare(`
      SELECT ar.*, s.first_name as student_first_name, s.last_name as student_last_name
      FROM approval_request ar
      LEFT JOIN student s ON ar.reference_id LIKE CONCAT('PAYMENT_%_', s.id)
      WHERE ar.transaction_type = 'PAYMENT'
        AND ar.status IN ('PENDING', 'APPROVED_LEVEL_1')
        AND ar.current_approver_role = ?
      ORDER BY ar.requested_at ASC
    `).all(role) as ApprovalQueueItem[]
  }
}

// ============================================================================
// FACADE - SOLID-COMPLIANT INTERFACE
// ============================================================================

export class PaymentService implements IPaymentRecorder, IPaymentVoidProcessor, IPaymentValidator, IPaymentQueryService {
  private readonly processor: PaymentProcessor
  private readonly voidProcessor: VoidProcessor
  private readonly validator: InvoiceValidator
  private readonly queryService: PaymentQueryService

  constructor() {
    this.processor = new PaymentProcessor()
    this.voidProcessor = new VoidProcessor()
    this.validator = new InvoiceValidator()
    this.queryService = new PaymentQueryService()
  }

  async recordPayment(data: PaymentData): Promise<PaymentResult> {
    try {
      const validation = await this.validator.validatePaymentAgainstInvoices(data.student_id, data.amount)
      if (!validation.valid) {
        return {
          success: false,
          message: validation.message
        }
      }

      const transactionId = await this.processor.processPayment(data)

      return {
        success: true,
        message: `Payment recorded successfully`,
        transaction_id: transactionId
      }
    } catch (error) {
      throw new Error(`Failed to record payment: ${(error as Error).message}`)
    }
  }

  async voidPayment(data: VoidPaymentData): Promise<PaymentResult> {
    return this.voidProcessor.voidPayment(data)
  }

  async validatePaymentAgainstInvoices(studentId: number, amount: number): Promise<ValidationResult> {
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
