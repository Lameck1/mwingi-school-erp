
import { randomUUID } from 'node:crypto';

import { SystemAccounts } from './SystemAccounts';
import { getDatabase } from '../../database';
import { logAudit } from '../../database/utils/audit';

import type Database from 'better-sqlite3';

/**
 * Double-Entry Journal Service
 * 
 * Implements true double-entry bookkeeping where:
 * - Every transaction has at least 2 entries (debit + credit)
 * - Total debits must equal total credits
 * - Follows accounting equation: Assets = Liabilities + Equity
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface JournalEntryData {
  entry_date: string;
  entry_type: string;
  description: string;
  student_id?: number;
  staff_id?: number;
  supplier_id?: number;
  term_id?: number;
  created_by_user_id: number;
  lines: JournalEntryLineData[];
  requires_approval?: boolean;
  source_ledger_txn_id?: number;
}

export interface JournalEntryLineData {
  gl_account_code: string;
  debit_amount: number;
  credit_amount: number;
  description?: string;
}

export interface JournalEntry {
  id: number;
  entry_ref: string;
  entry_date: string;
  entry_type: string;
  description: string;
  is_posted: boolean;
  is_voided: boolean;
  approval_status: string;
  lines: JournalEntryLine[];
}


type JournalWriteResult = { success: boolean; error?: string; message?: string; entry_id?: number };

export interface JournalEntryLine {
  id: number;
  line_number: number;
  gl_account_code: string;
  gl_account_name: string;
  debit_amount: number;
  credit_amount: number;
  description: string;
}

export interface BalanceSheetData {
  assets: AccountBalance[];
  liabilities: AccountBalance[];
  equity: AccountBalance[];
  total_assets: number;
  total_liabilities: number;
  total_equity: number;
  net_income: number;
  is_balanced: boolean;
}

export interface AccountBalance {
  account_code: string;
  account_name: string;
  balance: number;
}

// ============================================================================
// DOUBLE-ENTRY JOURNAL SERVICE
// ============================================================================

export class DoubleEntryJournalService {
  private readonly db: Database.Database;
  private sourceLedgerColumnAvailable: boolean | null = null;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  private hasSourceLedgerTxnColumn(): boolean {
    if (this.sourceLedgerColumnAvailable !== null) {
      return this.sourceLedgerColumnAvailable;
    }
    const columns = this.db.prepare('PRAGMA table_info(journal_entry)').all() as Array<{ name: string }>;
    this.sourceLedgerColumnAvailable = columns.some((column) => column.name === 'source_ledger_txn_id');
    return this.sourceLedgerColumnAvailable;
  }

  private tableExists(tableName: string): boolean {
    const row = this.db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = ?
    `).get(tableName) as { name: string } | undefined;
    return Boolean(row?.name);
  }

  private tableHasColumn(tableName: string, columnName: string): boolean {
    if (!this.tableExists(tableName)) {
      return false;
    }

    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    return columns.some((column) => column.name === columnName);
  }

  private getOrCreateWorkflowId(entityType: string, workflowName: string): number | null {
    if (!this.tableExists('approval_workflow')) {
      return null;
    }

    const existing = this.db.prepare(`
      SELECT id
      FROM approval_workflow
      WHERE entity_type = ?
      LIMIT 1
    `).get(entityType) as { id: number } | undefined;
    if (existing?.id) {
      return existing.id;
    }

    const insert = this.db.prepare(`
      INSERT INTO approval_workflow (workflow_name, entity_type, is_active)
      VALUES (?, ?, 1)
    `).run(workflowName, entityType);
    return insert.lastInsertRowid as number;
  }

  /**
   * Creates a journal entry with validation
   * Ensures debits = credits before posting
   */
  private validateLineCount(lines: JournalEntryLineData[]): { message?: string; valid: boolean } {
    if (lines.length >= 2) {
      return { valid: true };
    }

    return {
      valid: false,
      message: 'Journal entry must have at least 2 lines (debit + credit)'
    };
  }

  private validatePeriodLock(entryDate: string): { message?: string; valid: boolean } {
    if (!this.tableExists('accounting_period')) {
      return { valid: true };
    }

    const closedPeriod = this.db.prepare(`
      SELECT period_name FROM accounting_period
      WHERE start_date <= ? AND end_date >= ?
        AND status IN ('CLOSED', 'LOCKED')
      LIMIT 1
    `).get(entryDate, entryDate) as { period_name: string } | undefined;

    if (closedPeriod) {
      return {
        valid: false,
        message: `Cannot record transaction for ${entryDate}. Accounting period '${closedPeriod.period_name}' is closed/locked.`
      };
    }

    return { valid: true };
  }

  private validateBalancing(lines: JournalEntryLineData[]): { message?: string; totalCredits: number; totalDebits: number; valid: boolean } {
    const totalDebits = lines.reduce((sum, line) => sum + line.debit_amount, 0);
    const totalCredits = lines.reduce((sum, line) => sum + line.credit_amount, 0);

    if (totalDebits !== totalCredits) {
      return {
        valid: false,
        totalDebits,
        totalCredits,
        message: `Debits (${totalDebits}) must equal Credits (${totalCredits}). Difference: ${Math.abs(totalDebits - totalCredits)}`
      };
    }

    return { valid: true, totalDebits, totalCredits };
  }

  private validateGlAccounts(lines: JournalEntryLineData[]): { message?: string; valid: boolean } {
    for (const line of lines) {
      const account = this.db.prepare(`
          SELECT id, account_code, account_name, is_active
          FROM gl_account
          WHERE account_code = ? AND is_active = 1
        `).get(line.gl_account_code);

      if (!account) {
        return {
          valid: false,
          message: `Invalid GL account code: ${line.gl_account_code}. Check Chart of Accounts or verify account is active.`
        };
      }
    }

    return { valid: true };
  }

  private insertJournalLines(entryId: number, lines: JournalEntryLineData[]): void {
    const lineStatement = this.db.prepare(`
          INSERT INTO journal_entry_line (
            journal_entry_id, line_number, gl_account_id,
            debit_amount, credit_amount, description
          ) VALUES (?, ?, ?, ?, ?, ?)
        `);

    lines.forEach((line, index) => {
      const account = this.db.prepare(`
            SELECT id FROM gl_account WHERE account_code = ?
          `).get(line.gl_account_code) as { id: number };

      lineStatement.run(
        entryId,
        index + 1,
        account.id,
        line.debit_amount,
        line.credit_amount,
        line.description || null
      );
    });
  }

  private insertJournalEntryTransaction(
    data: JournalEntryData,
    entryRef: string,
    requiresApproval: boolean,
    totalCredits: number,
    totalDebits: number
  ): number {
    const insert = this.db.transaction(() => {
      const supportsSourceLedgerLink = this.hasSourceLedgerTxnColumn();
      const headerResult = supportsSourceLedgerLink ? this.db.prepare(`
          INSERT INTO journal_entry (
            entry_ref, entry_date, entry_type, description,
            student_id, staff_id, supplier_id, term_id,
            requires_approval, approval_status,
            created_by_user_id, source_ledger_txn_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
        entryRef,
        data.entry_date,
        data.entry_type,
        data.description,
        data.student_id || null,
        data.staff_id || null,
        data.supplier_id || null,
        data.term_id || null,
        requiresApproval ? 1 : 0,
        requiresApproval ? 'PENDING' : 'APPROVED',
        data.created_by_user_id,
        data.source_ledger_txn_id || null
      ) : this.db.prepare(`
          INSERT INTO journal_entry (
            entry_ref, entry_date, entry_type, description,
            student_id, staff_id, term_id,
            requires_approval, approval_status,
            created_by_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
        entryRef,
        data.entry_date,
        data.entry_type,
        data.description,
        data.student_id || null,
        data.staff_id || null,
        data.term_id || null,
        requiresApproval ? 1 : 0,
        requiresApproval ? 'PENDING' : 'APPROVED',
        data.created_by_user_id
      );

      const entryId = headerResult.lastInsertRowid as number;
      this.insertJournalLines(entryId, data.lines);

      if (!requiresApproval) {
        this.db.prepare(`
            UPDATE journal_entry
            SET is_posted = 1, posted_by_user_id = ?, posted_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(data.created_by_user_id, entryId);
      }

      logAudit(
        data.created_by_user_id,
        'CREATE',
        'journal_entry',
        entryId,
        null,
        {
          entry_ref: entryRef,
          entry_type: data.entry_type,
          total_debits: totalDebits,
          total_credits: totalCredits,
          requires_approval: requiresApproval,
          source_ledger_txn_id: data.source_ledger_txn_id || null
        }
      );

      return entryId;
    });

    return insert();
  }

  createJournalEntrySync(data: JournalEntryData): JournalWriteResult {
    try {
      const lineCountValidation = this.validateLineCount(data.lines);
      if (!lineCountValidation.valid) {
        return { success: false, error: lineCountValidation.message || 'Invalid journal entry line count' };
      }

      const balancingValidation = this.validateBalancing(data.lines);
      if (!balancingValidation.valid) {
        return { success: false, error: balancingValidation.message || 'Journal entry is not balanced' };
      }

      const accountValidation = this.validateGlAccounts(data.lines);
      if (!accountValidation.valid) {
        return { success: false, error: accountValidation.message || 'Invalid GL account' };
      }

      const periodValidation = this.validatePeriodLock(data.entry_date);
      if (!periodValidation.valid) {
        return { success: false, error: periodValidation.message || 'Accounting period is locked' };
      }

      // Check if approval required
      const requiresApproval = data.requires_approval || this.checkApprovalRequiredSync(data);

      // Generate entry reference
      const entryRef = this.generateEntryRef(data.entry_type);
      const entryId = this.insertJournalEntryTransaction(
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

  /**
   * Creates a payment journal entry (Student pays fee)
   * Debit: Bank/Cash/Credit Balance
   * Credit: Student Receivable
   */
  recordPaymentSync(
    studentId: number,
    amount: number,
    paymentMethod: string,
    paymentReference: string,
    paymentDate: string,
    userId: number,
    sourceLedgerTxnId?: number,
    debitAccountOverride?: string
  ): JournalWriteResult {
    // Determine debit account (Asset/Liability to reduce)
    let debitAccountCode: string;
    if (debitAccountOverride) {
      debitAccountCode = debitAccountOverride;
    } else if (paymentMethod === 'CREDIT') {
      debitAccountCode = SystemAccounts.STUDENT_CREDIT_BALANCE;
    } else if (paymentMethod === 'BANK_TRANSFER' || paymentMethod === 'MPESA' || paymentMethod === 'CHEQUE') {
      debitAccountCode = SystemAccounts.BANK;
    } else {
      debitAccountCode = SystemAccounts.CASH;
    }

    const journalData: JournalEntryData = {
      entry_date: paymentDate,
      entry_type: 'FEE_PAYMENT',
      description: `Fee payment received - ${paymentMethod} - Ref: ${paymentReference}`,
      student_id: studentId,
      created_by_user_id: userId,
      source_ledger_txn_id: sourceLedgerTxnId,
      lines: [
        {
          gl_account_code: debitAccountCode,
          debit_amount: amount,
          credit_amount: 0,
          description: 'Payment received/applied'
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
    studentId: number,
    amount: number,
    paymentMethod: string,
    paymentReference: string,
    paymentDate: string,
    userId: number,
    sourceLedgerTxnId?: number,
    debitAccountOverride?: string
  ): Promise<JournalWriteResult> {
    return this.recordPaymentSync(studentId, amount, paymentMethod, paymentReference, paymentDate, userId, sourceLedgerTxnId, debitAccountOverride);
  }

  /**
   * Creates an invoice journal entry (Charge student fees)
   * Debit: Student Receivable
   * Credit: Revenue (Tuition/Boarding/Transport)
   */
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

  /**
   * Voids a journal entry (creates reversing entry)
   */
  /**
   * Voids a journal entry (creates reversing entry)
   */
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
      const firstEntry = originalEntry[0]
      const daysOld = firstEntry ? Math.floor(
        (Date.now() - new Date(firstEntry.entry_date).getTime()) / (1000 * 60 * 60 * 24)
      ) : 0;

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
        if (this.tableExists('approval_request')) {
          const workflowId = this.getOrCreateWorkflowId('JOURNAL_ENTRY', 'Journal Entry Approvals');
          if (!workflowId) {
            throw new Error('Approval workflow unavailable for journal approvals');
          }

          const supportsRuleColumn = this.tableHasColumn('approval_request', 'approval_rule_id');
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

          if (this.tableExists('approval_history')) {
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
        if (this.tableExists('transaction_approval')) {
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
        description: `Void Reversal for Ref: ${originalEntry[0]?.entry_ref ?? 'N/A'}. Reason: ${voidReason}`,
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

  /**
   * Generates trial balance (verifies debits = credits)
   */
  async getTrialBalance(startDate: string, endDate: string): Promise<{
    accounts: Array<{ account_code: string; account_name: string; debit_total: number; credit_total: number }>;
    total_debits: number;
    total_credits: number;
    is_balanced: boolean;
  }> {
    const accounts = this.db.prepare(`
      SELECT
        ga.account_code,
        ga.account_name,
        SUM(jel.debit_amount) as debit_total,
        SUM(jel.credit_amount) as credit_total
      FROM gl_account ga
      LEFT JOIN journal_entry_line jel ON ga.id = jel.gl_account_id
      LEFT JOIN journal_entry je ON jel.journal_entry_id = je.id
      WHERE je.entry_date BETWEEN ? AND ?
        AND je.is_posted = 1
        AND je.is_voided = 0
      GROUP BY ga.id, ga.account_code, ga.account_name
      ORDER BY ga.account_code
    `).all(startDate, endDate) as Array<{
      account_code: string;
      account_name: string;
      debit_total: number;
      credit_total: number;
    }>;

    const totalDebits = accounts.reduce((sum, acc) => sum + (acc.debit_total || 0), 0);
    const totalCredits = accounts.reduce((sum, acc) => sum + (acc.credit_total || 0), 0);

    return {
      accounts,
      total_debits: totalDebits,
      total_credits: totalCredits,
      is_balanced: totalDebits === totalCredits
    };
  }

  /**
   * Generates balance sheet
   * Includes net income (Revenue - Expenses) to satisfy the accounting equation:
   * Assets = Liabilities + Equity + Net Income
   */
  async getBalanceSheet(asOfDate: string): Promise<BalanceSheetData> {
    const accountBalances = this.db.prepare(`
      SELECT
        ga.account_code,
        ga.account_name,
        ga.account_type,
        ga.normal_balance,
        SUM(jel.debit_amount) as total_debit,
        SUM(jel.credit_amount) as total_credit
      FROM gl_account ga
      LEFT JOIN journal_entry_line jel ON ga.id = jel.gl_account_id
      LEFT JOIN journal_entry je ON jel.journal_entry_id = je.id
      WHERE je.entry_date <= ?
        AND je.is_posted = 1
        AND je.is_voided = 0
        AND ga.account_type IN ('ASSET', 'LIABILITY', 'EQUITY')
      GROUP BY ga.id
      ORDER BY ga.account_code
    `).all(asOfDate) as Array<{
      account_code: string;
      account_name: string;
      account_type: string;
      normal_balance: string;
      total_debit: number;
      total_credit: number;
    }>;

    const assets: AccountBalance[] = [];
    const liabilities: AccountBalance[] = [];
    const equity: AccountBalance[] = [];

    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;

    accountBalances.forEach((acc) => {
      const balance =
        acc.normal_balance === 'DEBIT'
          ? (acc.total_debit || 0) - (acc.total_credit || 0)
          : (acc.total_credit || 0) - (acc.total_debit || 0);

      const accountBalance: AccountBalance = {
        account_code: acc.account_code,
        account_name: acc.account_name,
        balance
      };

      if (acc.account_type === 'ASSET') {
        assets.push(accountBalance);
        totalAssets += balance;
      } else if (acc.account_type === 'LIABILITY') {
        liabilities.push(accountBalance);
        totalLiabilities += balance;
      } else if (acc.account_type === 'EQUITY') {
        equity.push(accountBalance);
        totalEquity += balance;
      }
    });

    const netIncome = this.calculateNetIncome(asOfDate);

    return {
      assets,
      liabilities,
      equity,
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      total_equity: totalEquity,
      net_income: netIncome,
      is_balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity + netIncome)) < 1 // Allow 1 cent rounding
    };
  }

  /**
   * Helper: Calculate net income (Revenue - Expenses) as of a given date
   */
  private calculateNetIncome(asOfDate: string): number {
    const incomeData = this.db.prepare(`
      SELECT
        ga.account_type,
        COALESCE(SUM(jel.debit_amount), 0) as total_debit,
        COALESCE(SUM(jel.credit_amount), 0) as total_credit
      FROM gl_account ga
      JOIN journal_entry_line jel ON ga.id = jel.gl_account_id
      JOIN journal_entry je ON jel.journal_entry_id = je.id
      WHERE je.entry_date <= ?
        AND je.is_posted = 1
        AND je.is_voided = 0
        AND ga.account_type IN ('REVENUE', 'EXPENSE')
      GROUP BY ga.account_type
    `).all(asOfDate) as Array<{
      account_type: string;
      total_debit: number;
      total_credit: number;
    }>;

    let totalRevenue = 0;
    let totalExpenses = 0;

    for (const row of incomeData) {
      if (row.account_type === 'REVENUE') {
        totalRevenue = (row.total_credit || 0) - (row.total_debit || 0);
      } else if (row.account_type === 'EXPENSE') {
        totalExpenses = (row.total_debit || 0) - (row.total_credit || 0);
      }
    }

    return totalRevenue - totalExpenses;
  }

  /**
   * Helper: Generate unique entry reference
   */
  private generateEntryRef(entryType: string): string {
    const prefix = entryType.substring(0, 3).toUpperCase();
    const timestamp = Date.now();
    const nonce = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
    return `${prefix}-${timestamp}-${nonce}`;
  }

  /**
   * Helper: Check if approval required
   */
  private checkApprovalRequiredSync(data: JournalEntryData): boolean {
    const totalAmount = data.lines.reduce((sum, line) => sum + line.debit_amount, 0);

    const rule = this.db.prepare(`
      SELECT id FROM approval_rule
      WHERE transaction_type = ?
        AND is_active = 1
        AND (min_amount IS NULL OR ? >= min_amount)
    `).get(data.entry_type, totalAmount);

    return !!rule;
  }

}
