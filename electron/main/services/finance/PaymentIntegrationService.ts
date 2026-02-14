/**
 * Payment Integration Service
 * 
 * Bridges the legacy payment system with the new double-entry accounting system.
 * Maintains backward compatibility while leveraging new accounting features.
 * 
 * Migration Strategy:
 * 1. Records payment in legacy ledger_transaction table (for compatibility)
 * 2. Creates corresponding journal entry in double-entry system
 * 3. Synchronizes both systems
 * 
 * Future: Once all reports and features migrate to double-entry, 
 * the legacy system calls can be removed.
 */


import { getDatabase } from '../../database';
import { logAudit } from '../../database/utils/audit';
import { DoubleEntryJournalService, type JournalEntryData } from '../accounting/DoubleEntryJournalService';

import type Database from 'better-sqlite3';

export interface PaymentIntegrationData {
  student_id: number;
  amount: number; // In cents
  payment_method: 'CASH' | 'MPESA' | 'BANK_TRANSFER' | 'CHEQUE' | 'CREDIT_BALANCE';
  transaction_date: string; // ISO date string
  description?: string;
  payment_reference?: string;
  term_id?: number;
  invoice_id?: number;
  amount_in_words?: string;
}

export interface PaymentIntegrationResult {
  success: boolean;
  message?: string;
  transactionRef?: string;
  receiptNumber?: string;
  journalEntryId?: number;
  legacyTransactionId?: number;
}

export interface DoubleEntryPaymentData {
  student_id: number;
  amount: number;
  payment_date: string;
  payment_method: 'CASH' | 'MPESA' | 'BANK_TRANSFER' | 'CHEQUE';
  reference: string;
  description?: string;
  recorded_by: number;
  invoice_id?: number;
  term_id?: number;
}

export interface PaymentResult {
  success: boolean;
  error?: string;
  message?: string;
  transaction_id?: number;
  journal_entry_id?: number;
  receipt_number?: string;
  requires_approval?: boolean;
}

export interface VoidPaymentData {
  transaction_id: number;
  void_reason: string;
  voided_by: number;
  recovery_method?: string;
}

export interface PaymentHistoryEntry {
  id: number;
  entry_ref: string;
  transaction_date: string;
  description: string;
  amount: number;
  receipt_number: string | null;
  payment_method: string | null;
  reference: string | null;
  is_voided: number;
  voided_reason: string | null;
}

interface LegacyPaymentContext {
  data: PaymentIntegrationData;
  userId: number;
  amountCents: number;
  description: string;
  paymentRef: string;
  transactionRef: string;
  receiptNumber: string;
}

interface JournalEntryContext {
  data: PaymentIntegrationData;
  userId: number;
  amountCents: number;
  description: string;
  paymentRef: string;
  legacyTransactionId: number;
}

export class PaymentIntegrationService {
  private readonly db: Database.Database;
  private readonly journalService: DoubleEntryJournalService;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
    this.journalService = new DoubleEntryJournalService(this.db);
  }

  /**
   * Records a payment in both legacy and new accounting systems
   */
  private createReferenceNumbers(): { transactionRef: string; receiptNumber: string } {
    const dateStr = new Date().toISOString().slice(0, 10).replaceAll('-', '')
    const timestamp = String(Date.now()).slice(-6)

    return {
      transactionRef: `TXN-${dateStr}-${timestamp}`,
      receiptNumber: `RCP-${dateStr}-${timestamp}`
    }
  }

  private recordLegacyPayment(context: LegacyPaymentContext): number {
    const {
      data,
      userId,
      amountCents,
      description,
      paymentRef,
      transactionRef,
      receiptNumber
    } = context

    const legacyTxnStmt = this.db.prepare(`
      INSERT INTO ledger_transaction (
        transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
        student_id, payment_method, payment_reference, description, term_id, recorded_by_user_id, invoice_id
      ) VALUES (?, ?, 'FEE_PAYMENT', (SELECT id FROM transaction_category WHERE category_name = 'School Fees'), ?, 'CREDIT', ?, ?, ?, ?, ?, ?, ?)
    `)

    const legacyResult = legacyTxnStmt.run(
      transactionRef,
      data.transaction_date,
      amountCents,
      data.student_id,
      data.payment_method,
      paymentRef,
      description,
      data.term_id || null,
      userId,
      data.invoice_id || null
    )

    const legacyTransactionId = legacyResult.lastInsertRowid as number

    logAudit(userId, 'CREATE', 'ledger_transaction', legacyTransactionId, null, {
      ...data,
      amount: amountCents
    })

    const receiptStatement = this.db.prepare(`
      INSERT INTO receipt (
        receipt_number, transaction_id, receipt_date, student_id, amount,
        amount_in_words, payment_method, payment_reference, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    receiptStatement.run(
      receiptNumber,
      legacyTransactionId,
      data.transaction_date,
      data.student_id,
      amountCents,
      data.amount_in_words || '',
      data.payment_method,
      paymentRef,
      userId
    )

    return legacyTransactionId
  }

  private async recordJournalEntry(context: JournalEntryContext): Promise<number | undefined> {
    const {
      data,
      userId,
      amountCents,
      description,
      paymentRef,
      legacyTransactionId
    } = context

    if (!['CASH', 'MPESA', 'BANK_TRANSFER', 'CHEQUE'].includes(data.payment_method)) {
      return undefined
    }

    try {
      const paymentResult = await this.createDoubleEntryRecord({
        student_id: data.student_id,
        amount: amountCents,
        payment_method: data.payment_method as 'CASH' | 'MPESA' | 'BANK_TRANSFER' | 'CHEQUE',
        payment_date: data.transaction_date,
        description,
        reference: paymentRef,
        term_id: data.term_id,
        invoice_id: data.invoice_id,
        recorded_by: userId
      })

      if (!(paymentResult.success && paymentResult.journal_entry_id)) {
        return undefined
      }

      const journalEntryId = paymentResult.journal_entry_id
      this.db
        .prepare('UPDATE ledger_transaction SET journal_entry_id = ? WHERE id = ?')
        .run(journalEntryId, legacyTransactionId)

      return journalEntryId
    } catch (journalError) {
      console.error('Failed to create journal entry:', journalError)
      return undefined
    }
  }

  private applyInvoicePayments(data: PaymentIntegrationData, amountCents: number): void {
    if (data.invoice_id) {
      const invoice = this.db
        .prepare('SELECT total_amount, amount_paid FROM fee_invoice WHERE id = ?')
        .get(data.invoice_id) as { total_amount: number; amount_paid: number } | undefined

      if (invoice) {
        this.db
          .prepare(
            `UPDATE fee_invoice 
              SET amount_paid = amount_paid + ?,
                  status = CASE WHEN amount_paid + ? >= total_amount THEN 'PAID' ELSE 'PARTIAL' END
              WHERE id = ?`
          )
          .run(amountCents, amountCents, data.invoice_id)
      }

      return
    }

    let remainingAmount = amountCents
    const pendingInvoices = this.db
      .prepare(
        `SELECT id, total_amount, amount_paid 
         FROM fee_invoice 
         WHERE student_id = ? AND status != 'PAID'
         ORDER BY invoice_date ASC`
      )
      .all(data.student_id) as Array<{ id: number; total_amount: number; amount_paid: number }>

    const updateInvoiceStmt = this.db.prepare(`
      UPDATE fee_invoice 
      SET amount_paid = amount_paid + ?,
          status = CASE WHEN amount_paid + ? >= total_amount THEN 'PAID' ELSE 'PARTIAL' END
      WHERE id = ?
    `)

    for (const invoice of pendingInvoices) {
      if (remainingAmount <= 0) {
        break
      }

      const outstanding = invoice.total_amount - (invoice.amount_paid || 0)
      const payAmount = Math.min(remainingAmount, outstanding)
      updateInvoiceStmt.run(payAmount, payAmount, invoice.id)
      remainingAmount -= payAmount
    }
  }

  private updateStudentCreditBalance(studentId: number, amountCents: number): void {
    this.db.prepare(`
      UPDATE student
      SET credit_balance = COALESCE(credit_balance, 0) + ?
      WHERE id = ?
    `).run(amountCents, studentId)
  }

  async recordPaymentDualSystem(
    data: PaymentIntegrationData,
    userId: number
  ): Promise<PaymentIntegrationResult> {
    const amountCents = Math.round(data.amount)
    const description = data.description || 'Tuition Fee Payment'
    const paymentRef = data.payment_reference || ''
    const { transactionRef, receiptNumber } = this.createReferenceNumbers()

    this.db.prepare('BEGIN').run()

    try {
      const legacyTransactionId = this.recordLegacyPayment({
        data,
        userId,
        amountCents,
        description,
        paymentRef,
        transactionRef,
        receiptNumber
      })

      const journalEntryId = await this.recordJournalEntry({
        data,
        userId,
        amountCents,
        description,
        paymentRef,
        legacyTransactionId
      })

      this.applyInvoicePayments(data, amountCents)
      this.updateStudentCreditBalance(data.student_id, amountCents)

      this.db.prepare('COMMIT').run()

      return {
        success: true,
        message: 'Payment recorded successfully',
        transactionRef,
        receiptNumber,
        journalEntryId,
        legacyTransactionId
      }
    } catch (error) {
      this.db.prepare('ROLLBACK').run()
      console.error('Payment recording failed:', error)
      return {
        success: false,
        message: `Failed to record payment: ${(error as Error).message}`
      }
    }
  }
// ============================================================================
  // DOUBLE ENTRY INTEGRATION METHODS (Merged from EnhancedPaymentService)
  // ============================================================================

  /**
   * Creates a journal entry for the payment
   */
  private async createDoubleEntryRecord(data: DoubleEntryPaymentData): Promise<PaymentResult> {
    try {
      // Validate student exists
      const student = this.db.prepare(`
        SELECT id, admission_number, first_name || ' ' || last_name as full_name
        FROM student WHERE id = ?
      `).get(data.student_id) as { id: number; admission_number: string; full_name: string } | undefined;

      if (!student) {
        return {
          success: false,
          message: `Student with ID ${data.student_id} not found`
        };
      }

      // Determine GL account based on payment method
      const cashAccountCode = this.getCashAccountCode(data.payment_method);

      // Create journal entry
      const journalData: JournalEntryData = {
        entry_date: data.payment_date,
        entry_type: 'FEE_PAYMENT',
        description: data.description || `Fee payment from ${student.full_name} via ${data.payment_method} - Ref: ${data.reference}`,
        student_id: data.student_id,
        term_id: data.term_id,
        created_by_user_id: data.recorded_by,
        lines: [
          {
            gl_account_code: cashAccountCode,
            debit_amount: data.amount,
            credit_amount: 0,
            description: `Payment received - ${data.payment_method}`
          },
          {
            gl_account_code: '1100', // Accounts Receivable - Students
            debit_amount: 0,
            credit_amount: data.amount,
            description: 'Payment applied to student account'
          }
        ]
      };

      const journalResult = await this.journalService.createJournalEntry(journalData);

      if (!journalResult.success) {
        return {
          success: false,
          message: `Failed to create journal entry: ${journalResult.message}`
        };
      }

      return {
        success: true,
        message: `Payment recorded successfully`,
        transaction_id: journalResult.entry_id,
        journal_entry_id: journalResult.entry_id,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to record payment: ${(error as Error).message}`
      };
    }
  }

  /**
   * Voids a payment by creating a reversing journal entry
   */
  async voidPaymentDoubleEntry(data: VoidPaymentData): Promise<PaymentResult> {
    try {
      // Get original payment details
      interface PaymentWithStudent {
        id: number;
        student_id: number;
        entry_ref: string;
        entry_date: string;
        entry_type: string;
        description: string;
        is_voided: number;
        student_name: string;
      }

      const payment = this.db.prepare(`
        SELECT je.*, s.first_name || ' ' || s.last_name as student_name
        FROM journal_entry je
        LEFT JOIN student s ON je.student_id = s.id
        WHERE je.id = ? AND je.entry_type = 'FEE_PAYMENT' AND je.is_voided = 0
      `).get(data.transaction_id) as PaymentWithStudent | undefined;

      if (!payment) {
        return {
          success: false,
          message: 'Payment transaction not found or already voided'
        };
      }

      // Void the journal entry (this will handle approval workflow)
      const voidResult = await this.journalService.voidJournalEntry(
        data.transaction_id,
        data.void_reason,
        data.voided_by
      );

      if (!voidResult.success) {
        return {
            success: false,
            message: voidResult.message,
            requires_approval: voidResult.requires_approval
        };
      }

      // If voided successfully (not pending approval), reverse the credit balance
      if (!voidResult.requires_approval) {
        // Get payment amount
        const lines = this.db.prepare(`
          SELECT SUM(debit_amount) as total_amount
          FROM journal_entry_line
          WHERE journal_entry_id = ?
        `).get(data.transaction_id) as { total_amount: number };

        // Reverse credit balance
        this.db.prepare(`
            UPDATE student
            SET credit_balance = COALESCE(credit_balance, 0) - ?
            WHERE id = ?
        `).run(lines.total_amount, payment.student_id);
      }

      return {
        success: true,
        message: voidResult.message,
        requires_approval: voidResult.requires_approval || false
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to void payment: ${(error as Error).message}`
      };
    }
  }

  /**
   * Get student payment history
   */
  async getStudentPaymentHistory(studentId: number, limit = 50): Promise<PaymentHistoryEntry[]> {
    return this.db.prepare(`
      SELECT
        je.id,
        je.entry_ref,
        je.entry_date as transaction_date,
        je.description,
        jel.debit_amount as amount,
        r.receipt_number,
        r.payment_method,
        r.payment_reference as reference,
        je.is_voided,
        je.voided_reason
      FROM journal_entry je
      JOIN journal_entry_line jel ON je.id = jel.journal_entry_id
      JOIN gl_account ga ON jel.gl_account_id = ga.id
      LEFT JOIN receipt r ON je.id = r.transaction_id
      WHERE je.student_id = ?
        AND je.entry_type = 'FEE_PAYMENT'
        AND ga.account_code IN ('1010', '1020', '1030')  -- Cash/Bank accounts
      ORDER BY je.entry_date DESC, je.id DESC
      LIMIT ?
    `).all(studentId, limit) as PaymentHistoryEntry[];
  }

  private getCashAccountCode(paymentMethod: string): string {
    switch (paymentMethod) {
      case 'CASH':
        return '1010'; // Cash on Hand
      case 'MPESA':
      case 'BANK_TRANSFER':
        return '1020'; // Bank Account - KCB (or primary bank)
      case 'CHEQUE':
        return '1020'; // Bank Account
      default:
        return '1010'; // Default to Cash
    }
  }
}


