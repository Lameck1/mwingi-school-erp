import Database from 'better-sqlite3-multiple-ciphers';
import { getDatabase } from '../../database';
import { logAudit } from '../../database/utils/audit';
import { DoubleEntryJournalService, JournalEntryData } from '../accounting/DoubleEntryJournalService';

/**
 * Enhanced Payment Service with Double-Entry Accounting Integration
 * 
 * This service maintains backward compatibility with the old payment system
 * while creating journal entries for all new payments.
 */

export interface PaymentData {
  student_id: number;
  amount: number;
  payment_date: string;
  payment_method: 'CASH' | 'MPESA' | 'BANK_TRANSFER' | 'CHEQUE';
  reference: string;
  description?: string;
  recorded_by: number;
  invoice_id?: number;
  cheque_number?: string;
  bank_name?: string;
  amount_in_words?: string;
  term_id?: number;
}

export interface PaymentResult {
  success: boolean;
  message: string;
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

export class EnhancedPaymentService {
  private db: Database.Database;
  private journalService: DoubleEntryJournalService;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
    this.journalService = new DoubleEntryJournalService(this.db);
  }

  /**
   * Records a payment using double-entry accounting
   * Creates journal entry: Debit Bank/Cash, Credit Accounts Receivable
   */
  async recordPayment(data: PaymentData): Promise<PaymentResult> {
    try {
      // Validate student exists
      const student = this.db.prepare(`
        SELECT id, admission_number, first_name || ' ' || last_name as full_name
        FROM student WHERE id = ?
      `).get(data.student_id);

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

      // Create receipt record
      const receiptNumber = this.generateReceiptNumber(data.student_id);
      const receiptResult = this.db.prepare(`
        INSERT INTO receipt (
          receipt_number, transaction_id, receipt_date, student_id,
          amount, amount_in_words, payment_method, payment_reference,
          created_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        receiptNumber,
        journalResult.entry_id,
        data.payment_date,
        data.student_id,
        data.amount,
        data.amount_in_words || this.convertAmountToWords(data.amount),
        data.payment_method,
        data.reference,
        data.recorded_by
      );

      // Update student credit balance (for backward compatibility)
      await this.updateStudentCreditBalance(data.student_id, data.amount);

      // Apply payment to invoices if specified
      if (data.invoice_id) {
        await this.applyPaymentToInvoice(data.invoice_id, data.amount);
      } else {
        // Auto-apply to oldest pending invoices (FIFO)
        await this.autoApplyPaymentToInvoices(data.student_id, data.amount);
      }

      // Audit log
      logAudit(
        data.recorded_by,
        'CREATE',
        'payment',
        journalResult.entry_id!,
        null,
        {
          student_id: data.student_id,
          amount: data.amount,
          payment_method: data.payment_method,
          receipt_number: receiptNumber
        }
      );

      return {
        success: true,
        message: `Payment recorded successfully`,
        transaction_id: journalResult.entry_id,
        journal_entry_id: journalResult.entry_id,
        receipt_number: receiptNumber
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
  async voidPayment(data: VoidPaymentData): Promise<PaymentResult> {
    try {
      // Get original payment details
      const payment = this.db.prepare(`
        SELECT je.*, s.first_name || ' ' || s.last_name as student_name
        FROM journal_entry je
        LEFT JOIN student s ON je.student_id = s.id
        WHERE je.id = ? AND je.entry_type = 'FEE_PAYMENT' AND je.is_voided = 0
      `).get(data.transaction_id);

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
        return voidResult;
      }

      // If voided successfully (not pending approval), reverse the credit balance
      if (!voidResult.requires_approval) {
        // Get payment amount
        const lines = this.db.prepare(`
          SELECT SUM(debit_amount) as total_amount
          FROM journal_entry_line
          WHERE journal_entry_id = ?
        `).get(data.transaction_id) as { total_amount: number };

        await this.updateStudentCreditBalance(payment.student_id, -lines.total_amount);
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
  async getStudentPaymentHistory(studentId: number, limit = 50): Promise<any[]> {
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
    `).all(studentId, limit);
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

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

  private generateReceiptNumber(studentId: number): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const timestamp = Date.now().toString().slice(-6);
    return `RCP-${year}${month}-${studentId}-${timestamp}`;
  }

  private convertAmountToWords(amount: number): string {
    // Simple implementation - convert amount to words in Kenyan Shillings
    const shillings = Math.floor(amount / 100);
    const cents = amount % 100;
    
    // This is a simplified version - you may want a more comprehensive implementation
    return `Kenya Shillings ${shillings.toLocaleString()} ${cents > 0 ? `and ${cents} cents` : ''} only`;
  }

  private async updateStudentCreditBalance(studentId: number, amount: number): Promise<void> {
    // Update denormalized credit_balance for backward compatibility
    this.db.prepare(`
      UPDATE student
      SET credit_balance = COALESCE(credit_balance, 0) + ?
      WHERE id = ?
    `).run(amount, studentId);
  }

  private async applyPaymentToInvoice(invoiceId: number, amount: number): Promise<void> {
    // Update invoice
    this.db.prepare(`
      UPDATE fee_invoice
      SET
        amount_paid = COALESCE(amount_paid, 0) + ?,
        status = CASE
          WHEN (COALESCE(amount_paid, 0) + ?) >= total_amount THEN 'PAID'
          WHEN (COALESCE(amount_paid, 0) + ?) > 0 THEN 'PARTIAL'
          ELSE 'PENDING'
        END
      WHERE id = ?
    `).run(amount, amount, amount, invoiceId);
  }

  private async autoApplyPaymentToInvoices(studentId: number, amount: number): Promise<void> {
    // Get outstanding invoices (FIFO - oldest first)
    const invoices = this.db.prepare(`
      SELECT id, total_amount, COALESCE(amount_paid, 0) as amount_paid
      FROM fee_invoice
      WHERE student_id = ? AND status IN ('PENDING', 'PARTIAL')
      ORDER BY due_date ASC, id ASC
    `).all(studentId) as Array<{ id: number; total_amount: number; amount_paid: number }>;

    let remainingAmount = amount;

    for (const invoice of invoices) {
      if (remainingAmount <= 0) break;

      const outstanding = invoice.total_amount - invoice.amount_paid;
      const paymentToApply = Math.min(remainingAmount, outstanding);

      await this.applyPaymentToInvoice(invoice.id, paymentToApply);
      remainingAmount -= paymentToApply;
    }

    // If there's remaining amount, it becomes overpayment (credit balance)
    // This is already handled by updateStudentCreditBalance
  }
}
