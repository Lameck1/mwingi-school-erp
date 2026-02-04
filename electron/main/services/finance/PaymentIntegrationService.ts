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

import { getDatabase } from '../../database/index';
import { EnhancedPaymentService } from './EnhancedPaymentService';
import { logAudit } from '../../database/utils/audit';

export interface PaymentIntegrationData {
  student_id: number;
  amount: number; // In Kenyan Shillings (not cents)
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

export class PaymentIntegrationService {
  private db = getDatabase();
  private enhancedPaymentService: EnhancedPaymentService;

  constructor() {
    this.enhancedPaymentService = new EnhancedPaymentService();
  }

  /**
   * Records a payment in both legacy and new accounting systems
   */
  async recordPaymentDualSystem(
    data: PaymentIntegrationData,
    userId: number
  ): Promise<PaymentIntegrationResult> {
    return this.db.transaction(() => {
      try {
        // Convert amount to cents for legacy system
        const amountCents = Math.round(data.amount * 100);
        const description = data.description || 'Tuition Fee Payment';
        const paymentRef = data.payment_reference || '';

        // Generate reference numbers
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const timestamp = String(Date.now()).slice(-6);
        const txnRef = `TXN-${dateStr}-${timestamp}`;
        const rcpNum = `RCP-${dateStr}-${timestamp}`;

        // ===== STEP 1: Record in Legacy System =====
        const legacyTxnStmt = this.db.prepare(`
          INSERT INTO ledger_transaction (
            transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
            student_id, payment_method, payment_reference, description, term_id, recorded_by_user_id, invoice_id
          ) VALUES (?, ?, 'FEE_PAYMENT', (SELECT id FROM transaction_category WHERE category_name = 'School Fees'), ?, 'CREDIT', ?, ?, ?, ?, ?, ?, ?)
        `);

        const legacyResult = legacyTxnStmt.run(
          txnRef,
          data.transaction_date,
          amountCents,
          data.student_id,
          data.payment_method,
          paymentRef,
          description,
          data.term_id || null,
          userId,
          data.invoice_id || null
        );

        const legacyTransactionId = legacyResult.lastInsertRowid as number;

        // Audit log for legacy transaction
        logAudit(userId, 'CREATE', 'ledger_transaction', legacyTransactionId, null, {
          ...data,
          amount: amountCents,
        });

        // Create receipt in legacy system
        const rcpStmt = this.db.prepare(`
          INSERT INTO receipt (
            receipt_number, transaction_id, receipt_date, student_id, amount,
            amount_in_words, payment_method, payment_reference, created_by_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        rcpStmt.run(
          rcpNum,
          legacyTransactionId,
          data.transaction_date,
          data.student_id,
          amountCents,
          data.amount_in_words || '',
          data.payment_method,
          paymentRef,
          userId
        );

        // ===== STEP 2: Record in Double-Entry System =====
        let journalEntryId: number | undefined;

        try {
          const journalResult = this.enhancedPaymentService.recordPayment(
            {
              studentId: data.student_id,
              amount: data.amount, // In KES
              paymentMethod: data.payment_method,
              transactionDate: data.transaction_date,
              description,
              paymentReference: paymentRef,
              termId: data.term_id,
              invoiceId: data.invoice_id,
            },
            userId
          );

          if (journalResult.success && journalResult.journalEntryId) {
            journalEntryId = journalResult.journalEntryId;

            // Link legacy transaction to journal entry
            this.db
              .prepare(
                'UPDATE ledger_transaction SET journal_entry_id = ? WHERE id = ?'
              )
              .run(journalEntryId, legacyTransactionId);
          }
        } catch (journalError) {
          console.error('Failed to create journal entry:', journalError);
          // Don't fail the entire transaction - legacy system still recorded
          // This allows gradual migration
        }

        // ===== STEP 3: Apply Payment to Invoices (Legacy Logic) =====
        let remainingAmount = amountCents;

        if (data.invoice_id) {
          // Apply to specific invoice
          const inv = this.db
            .prepare('SELECT total_amount, amount_paid FROM fee_invoice WHERE id = ?')
            .get(data.invoice_id) as
            | { total_amount: number; amount_paid: number }
            | undefined;

          if (inv) {
            this.db
              .prepare(`
                UPDATE fee_invoice 
                SET amount_paid = amount_paid + ?, 
                    status = CASE WHEN amount_paid + ? >= total_amount THEN 'PAID' ELSE 'PARTIAL' END 
                WHERE id = ?
              `)
              .run(amountCents, amountCents, data.invoice_id);
          }
        } else {
          // Apply to oldest unpaid invoices (FIFO)
          const pendingInvoices = this.db
            .prepare(`
              SELECT id, total_amount, amount_paid 
              FROM fee_invoice 
              WHERE student_id = ? AND status != 'PAID'
              ORDER BY invoice_date ASC
            `)
            .all(data.student_id) as Array<{
            id: number;
            total_amount: number;
            amount_paid: number;
          }>;

          const updateInvStmt = this.db.prepare(`
            UPDATE fee_invoice 
            SET amount_paid = amount_paid + ?, 
                status = CASE WHEN amount_paid + ? >= total_amount THEN 'PAID' ELSE 'PARTIAL' END 
            WHERE id = ?
          `);

          for (const inv of pendingInvoices) {
            if (remainingAmount <= 0) break;

            const outstanding = inv.total_amount - (inv.amount_paid || 0);
            const payAmount = Math.min(remainingAmount, outstanding);

            updateInvStmt.run(payAmount, payAmount, inv.id);
            remainingAmount -= payAmount;
          }

          // If payment exceeds invoices, add to credit balance
          if (remainingAmount > 0) {
            try {
              this.db
                .prepare(
                  'UPDATE student SET credit_balance = COALESCE(credit_balance, 0) + ? WHERE id = ?'
                )
                .run(remainingAmount, data.student_id);
            } catch (e) {
              console.error('Failed to update credit balance:', e);
            }
          }
        }

        return {
          success: true,
          transactionRef: txnRef,
          receiptNumber: rcpNum,
          journalEntryId,
          legacyTransactionId,
        };
      } catch (error) {
        console.error('Payment integration error:', error);
        throw error; // Will trigger transaction rollback
      }
    })();
  }

  /**
   * Voids a payment in both systems
   */
  async voidPaymentDualSystem(
    legacyTransactionId: number,
    reason: string,
    userId: number
  ): Promise<{ success: boolean; message?: string }> {
    return this.db.transaction(() => {
      try {
        // Get the legacy transaction
        const legacyTxn = this.db
          .prepare(
            'SELECT * FROM ledger_transaction WHERE id = ? AND is_voided = 0'
          )
          .get(legacyTransactionId) as unknown;

        if (!legacyTxn) {
          return { success: false, message: 'Transaction not found or already voided' };
        }

        // Void in legacy system
        this.db
          .prepare('UPDATE ledger_transaction SET is_voided = 1 WHERE id = ?')
          .run(legacyTransactionId);

        logAudit(userId, 'DELETE', 'ledger_transaction', legacyTransactionId, null, {
          reason,
        });

        // If linked to journal entry, void it too
        if (legacyTxn.journal_entry_id) {
          try {
            this.enhancedPaymentService.voidPayment(
              legacyTxn.journal_entry_id,
              reason,
              userId
            );
          } catch (journalError) {
            console.error('Failed to void journal entry:', journalError);
            // Continue - at least legacy is voided
          }
        }

        // Reverse invoice applications
        if (legacyTxn.invoice_id) {
          this.db
            .prepare(`
              UPDATE fee_invoice 
              SET amount_paid = amount_paid - ?,
                  status = CASE WHEN amount_paid - ? <= 0 THEN 'UNPAID' 
                               WHEN amount_paid - ? < total_amount THEN 'PARTIAL'
                               ELSE status END
              WHERE id = ?
            `)
            .run(
              legacyTxn.amount,
              legacyTxn.amount,
              legacyTxn.amount,
              legacyTxn.invoice_id
            );
        }

        return { success: true };
      } catch (error) {
        console.error('Void payment integration error:', error);
        throw error;
      }
    })();
  }

  /**
   * Gets payment history including journal entry information
   */
  getStudentPaymentHistory(studentId: number): any[] {
    const payments = this.db
      .prepare(
        `
      SELECT 
        lt.*,
        r.receipt_number,
        je.entry_number as journal_entry_number,
        je.status as journal_status
      FROM ledger_transaction lt
      LEFT JOIN receipt r ON lt.id = r.transaction_id
      LEFT JOIN journal_entry je ON lt.journal_entry_id = je.id
      WHERE lt.student_id = ? 
        AND lt.transaction_type = 'FEE_PAYMENT' 
        AND lt.is_voided = 0
      ORDER BY lt.transaction_date DESC
    `
      )
      .all(studentId) as unknown[];

    return payments.map((p) => ({
      ...p,
      amount: p.amount / 100, // Convert cents to KES
      hasJournalEntry: !!p.journal_entry_number,
      journalEntryStatus: p.journal_status || 'N/A',
    }));
  }
}

