
import { getDatabase } from '../../database';
import { logAudit } from '../../database/utils/audit';
import { FinancialReportService } from './journal/FinancialReportService';
import { JournalEntryRepository } from './journal/JournalEntryRepository';
import { JournalValidationService } from './journal/JournalValidationService';
import { SystemAccounts } from './SystemAccounts';

import type { BalanceSheetData, JournalEntryData, JournalEntryLineData, JournalWriteResult, RecordPaymentArgs } from './JournalService.types';
import type Database from 'better-sqlite3';

export class DoubleEntryJournalService {
  private readonly db: Database.Database;
  private readonly repository: JournalEntryRepository;
  private readonly reportService: FinancialReportService;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
    this.repository = new JournalEntryRepository(this.db);
    this.reportService = new FinancialReportService(this.db);
  }

  createJournalEntrySync(data: JournalEntryData): JournalWriteResult {
    try {
      const lineCountValidation = JournalValidationService.validateLineCount(data.lines);
      if (!lineCountValidation.valid) {
        return { success: false, error: lineCountValidation.message || 'Invalid journal entry line count' };
      }

      const balancingValidation = JournalValidationService.validateBalancing(data.lines);
      if (!balancingValidation.valid) {
        return { success: false, error: balancingValidation.message || 'Journal entry is not balanced' };
      }

      const accountValidation = this.repository.validateGlAccounts(data.lines);
      if (!accountValidation.valid) {
        return { success: false, error: accountValidation.message || 'Invalid GL account' };
      }

      // Check if approval required
      const requiresApproval = data.requires_approval || this.repository.checkApprovalRequiredSync(data);

      // Generate entry reference
      const entryRef = this.repository.generateEntryRef(data.entry_type);
      const entryId = this.repository.insertJournalEntryTransaction(
        data,
        entryRef,
        requiresApproval,
        balancingValidation.totalCredits,
        balancingValidation.totalDebits
      );

      return {
        success: true,
        message: requiresApproval
          ? `Journal entry created successfully. Awaiting approval (Ref: ${entryRef})`
          : `Journal entry posted successfully (Ref: ${entryRef})`,
        entry_id: entryId
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create journal entry: ${(error as Error).message}`
      };
    }
  }

  async createJournalEntry(data: JournalEntryData): Promise<JournalWriteResult> {
    return this.createJournalEntrySync(data);
  }

  recordPaymentSync(
    ...[studentId, amount, paymentMethod, paymentReference, paymentDate, userId, sourceLedgerTxnId]: RecordPaymentArgs
  ): JournalWriteResult {
    // Determine cash/bank account
    const cashAccountCode = paymentMethod === 'CASH' ? SystemAccounts.CASH : SystemAccounts.BANK;

    const journalData: JournalEntryData = {
      entry_date: paymentDate,
      entry_type: 'FEE_PAYMENT',
      description: `Fee payment received - ${paymentMethod} - Ref: ${paymentReference}`,
      student_id: studentId,
      created_by_user_id: userId,
      source_ledger_txn_id: sourceLedgerTxnId,
      lines: [
        {
          gl_account_code: cashAccountCode,
          debit_amount: amount,
          credit_amount: 0,
          description: 'Payment received'
        },
        {
          gl_account_code: SystemAccounts.ACCOUNTS_RECEIVABLE, // Accounts Receivable - Students
          debit_amount: 0,
          credit_amount: amount,
          description: 'Payment applied to student account'
        }
      ]
    };

    return this.createJournalEntrySync(journalData);
  }

  async recordPayment(
    ...args: RecordPaymentArgs
  ): Promise<JournalWriteResult> {
    return this.recordPaymentSync(...args);
  }

  recordInvoiceSync(
    studentId: number,
    invoiceItems: Array<{ gl_account_code: string; amount: number; description: string }>,
    invoiceDate: string,
    userId: number
  ): JournalWriteResult {
    const totalAmount = invoiceItems.reduce((sum, item) => sum + item.amount, 0);

    const lines: JournalEntryLineData[] = [
      {
        gl_account_code: SystemAccounts.ACCOUNTS_RECEIVABLE, // Accounts Receivable - Students
        debit_amount: totalAmount,
        credit_amount: 0,
        description: 'Fee invoice charged'
      }
    ];

    // Add credit lines for each fee category
    invoiceItems.forEach((item) => {
      lines.push({
        gl_account_code: item.gl_account_code,
        debit_amount: 0,
        credit_amount: item.amount,
        description: item.description
      });
    });

    const journalData: JournalEntryData = {
      entry_date: invoiceDate,
      entry_type: 'FEE_INVOICE',
      description: `Fee invoice for student`,
      student_id: studentId,
      created_by_user_id: userId,
      lines
    };

    return this.createJournalEntrySync(journalData);
  }

  async recordInvoice(
    studentId: number,
    invoiceItems: Array<{ gl_account_code: string; amount: number; description: string }>,
    invoiceDate: string,
    userId: number
  ): Promise<JournalWriteResult> {
    return this.recordInvoiceSync(studentId, invoiceItems, invoiceDate, userId);
  }

  async voidJournalEntry(
    entryId: number,
    voidReason: string,
    userId: number
  ): Promise<{ success: boolean; message: string; requires_approval?: boolean }> {
    try {
      // Get original entry
      const originalEntry = this.db.prepare(`
        SELECT je.*, jel.gl_account_id, jel.debit_amount, jel.credit_amount, jel.description as line_desc, ga.account_code
        FROM journal_entry je
        JOIN journal_entry_line jel ON je.id = jel.journal_entry_id
        JOIN gl_account ga ON jel.gl_account_id = ga.id
        WHERE je.id = ? AND je.is_voided = 0
      `).all(entryId) as Array<{
        entry_ref: string;
        entry_date: string;
        entry_type: string;
        debit_amount: number;
        credit_amount: number;
        account_code: string;
        line_desc: string;
      }>;

      if (originalEntry.length === 0) {
        return {
          success: false,
          message: 'Journal entry not found or already voided'
        };
      }

      // Check if approval required for void
      const daysOld = Math.floor(
        (Date.now() - new Date(originalEntry[0].entry_date).getTime()) / (1000 * 60 * 60 * 24)
      );

      // Calculate total amount from line items
      const totalAmount = originalEntry.reduce((sum, line) => sum + (line.debit_amount || 0), 0);

      const needsApproval = this.db.prepare(`
        SELECT id, rule_name FROM approval_rule
        WHERE transaction_type = 'VOID'
          AND is_active = 1
          AND (
            (min_amount IS NOT NULL AND ? >= min_amount)
            OR (days_since_transaction IS NOT NULL AND ? >= days_since_transaction)
          )
      `).get(totalAmount, daysOld) as { id: number; rule_name: string } | undefined;

      if (needsApproval) {
        // Canonical approval path: approval_request table.
        if (this.repository.tableExists('approval_request')) {
          const workflowId = this.repository.getOrCreateWorkflowId('JOURNAL_ENTRY', 'Journal Entry Approvals');
          if (!workflowId) {
            throw new Error('Approval workflow unavailable for journal approvals');
          }

          const supportsRuleColumn = this.repository.tableHasColumn('approval_request', 'approval_rule_id');
          const requestResult = supportsRuleColumn ? this.db.prepare(`
            INSERT INTO approval_request (
              workflow_id, entity_type, entity_id,
              status, requested_by_user_id, approval_rule_id
            ) VALUES (?, 'JOURNAL_ENTRY', ?, 'PENDING', ?, ?)
          `).run(workflowId, entryId, userId, needsApproval.id) : this.db.prepare(`
            INSERT INTO approval_request (
              workflow_id, entity_type, entity_id,
              status, requested_by_user_id
            ) VALUES (?, 'JOURNAL_ENTRY', ?, 'PENDING', ?)
          `).run(workflowId, entryId, userId);

          if (this.repository.tableExists('approval_history')) {
            this.db.prepare(`
              INSERT INTO approval_history (
                approval_request_id, action, action_by, previous_status, new_status, notes
              ) VALUES (?, 'REQUESTED', ?, NULL, 'PENDING', ?)
            `).run(
              requestResult.lastInsertRowid as number,
              userId,
              `Void requires approval: ${needsApproval.rule_name}`
            );
          }

          return {
            success: true,
            message: 'Void request submitted for approval',
            requires_approval: true
          };
        }

        // Legacy fallback for environments that have not yet migrated.
        if (this.repository.tableExists('transaction_approval')) {
          this.db.prepare(`
            INSERT INTO transaction_approval (
              journal_entry_id, approval_rule_id,
              requested_by_user_id, status
            ) VALUES (?, ?, ?, 'PENDING')
          `).run(entryId, needsApproval.id, userId);

          return {
            success: true,
            message: 'Void request submitted for approval',
            requires_approval: true
          };
        }

        return {
          success: false,
          message: 'Approval subsystem is not available'
        };
      }

      // Prepare Reversal Lines (Swap Debit/Credit)
      const reversalLines: JournalEntryLineData[] = originalEntry.map((line) => ({
        gl_account_code: line.account_code,
        debit_amount: line.credit_amount, // Swap
        credit_amount: line.debit_amount, // Swap
        description: `Reversal: ${line.line_desc || ''}`
      }));

      const reversalData: JournalEntryData = {
        entry_date: new Date().toISOString().slice(0, 10), // Today
        entry_type: 'VOID_REVERSAL',
        description: `Void Reversal for Ref: ${originalEntry[0].entry_ref}. Reason: ${voidReason}`,
        created_by_user_id: userId,
        lines: reversalLines,
        requires_approval: false // Reversals usually don't need double approval if void itself was approved/checked
      };

      // Transaction: Mark Original Void + Create Reversal
      const executeVoid = this.db.transaction(() => {
        // 1. Mark original as voided (for UI/Audit trail)
        this.db.prepare(`
          UPDATE journal_entry
          SET is_voided = 1, voided_reason = ?, voided_by_user_id = ?, voided_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(voidReason, userId, entryId);

        // 2. Create Reversal Entry
        const reversalResult = this.createJournalEntrySync(reversalData);
        if (!reversalResult.success) {
          throw new Error(`Failed to create reversal entry: ${reversalResult.error}`);
        }

        // 3. Audit log
        logAudit(userId, 'VOID', 'journal_entry', entryId, null, { void_reason: voidReason, type: 'REVERSAL_CREATED' });
      });

      executeVoid();

      return {
        success: true,
        message: 'Journal entry voided and reversal entry created successfully',
        requires_approval: false
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to void journal entry: ${(error as Error).message}`
      };
    }
  }

  async getTrialBalance(startDate: string, endDate: string): Promise<{
    accounts: Array<{ account_code: string; account_name: string; debit_total: number; credit_total: number }>;
    total_debits: number;
    total_credits: number;
    is_balanced: boolean;
  }> {
    return this.reportService.getTrialBalance(startDate, endDate);
  }

  async getBalanceSheet(asOfDate: string): Promise<BalanceSheetData> {
    return this.reportService.getBalanceSheet(asOfDate);
  }
}
