import Database from 'better-sqlite3';
import { getDatabase } from '../../database';
import { logAudit } from '../../database/utils/audit';

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
  term_id?: number;
  created_by_user_id: number;
  lines: JournalEntryLineData[];
  requires_approval?: boolean;
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
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  /**
   * Creates a journal entry with validation
   * Ensures debits = credits before posting
   */
  async createJournalEntry(data: JournalEntryData): Promise<{ success: boolean; message: string; entry_id?: number }> {
    try {
      // Validation 1: At least 2 lines required (double-entry)
      if (data.lines.length < 2) {
        return {
          success: false,
          message: 'Journal entry must have at least 2 lines (debit + credit)'
        };
      }

      // Validation 2: Debits must equal credits
      const totalDebits = data.lines.reduce((sum, line) => sum + line.debit_amount, 0);
      const totalCredits = data.lines.reduce((sum, line) => sum + line.credit_amount, 0);

      if (totalDebits !== totalCredits) {
        return {
          success: false,
          message: `Debits (${totalDebits}) must equal Credits (${totalCredits}). Difference: ${Math.abs(totalDebits - totalCredits)}`
        };
      }

      // Validation 3: Validate GL accounts exist
      for (const line of data.lines) {
        const account = this.db.prepare(`
          SELECT id, account_code, account_name, is_active
          FROM gl_account
          WHERE account_code = ? AND is_active = 1
        `).get(line.gl_account_code);

        if (!account) {
          return {
            success: false,
            message: `Invalid GL account code: ${line.gl_account_code}. Check Chart of Accounts or verify account is active.`
          };
        }
      }

      // Check if approval required
      const requiresApproval = data.requires_approval || await this.checkApprovalRequired(data);

      // Generate entry reference
      const entryRef = this.generateEntryRef(data.entry_type);

      // Start transaction
      const insert = this.db.transaction(() => {
        // Insert journal entry header
        const headerResult = this.db.prepare(`
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

        // Insert journal entry lines
        const lineStmt = this.db.prepare(`
          INSERT INTO journal_entry_line (
            journal_entry_id, line_number, gl_account_id,
            debit_amount, credit_amount, description
          ) VALUES (?, ?, ?, ?, ?, ?)
        `);

        data.lines.forEach((line, index) => {
          const account = this.db.prepare(`
            SELECT id FROM gl_account WHERE account_code = ?
          `).get(line.gl_account_code) as { id: number };

          lineStmt.run(
            entryId,
            index + 1,
            account.id,
            line.debit_amount,
            line.credit_amount,
            line.description || null
          );
        });

        // Auto-post if no approval required
        if (!requiresApproval) {
          this.db.prepare(`
            UPDATE journal_entry
            SET is_posted = 1, posted_by_user_id = ?, posted_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(data.created_by_user_id, entryId);
        }

        // Audit log
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
            requires_approval: requiresApproval
          }
        );

        return entryId;
      });

      const entryId = insert();

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
        message: `Failed to create journal entry: ${(error as Error).message}`
      };
    }
  }

  /**
   * Creates a payment journal entry (Student pays fee)
   * Debit: Bank/Cash
   * Credit: Student Receivable
   */
  async recordPayment(
    studentId: number,
    amount: number,
    paymentMethod: string,
    paymentReference: string,
    paymentDate: string,
    userId: number
  ): Promise<{ success: boolean; message: string; entry_id?: number }> {
    // Determine cash/bank account
    const cashAccountCode = paymentMethod === 'CASH' ? '1010' : '1020';

    const journalData: JournalEntryData = {
      entry_date: paymentDate,
      entry_type: 'FEE_PAYMENT',
      description: `Fee payment received - ${paymentMethod} - Ref: ${paymentReference}`,
      student_id: studentId,
      created_by_user_id: userId,
      lines: [
        {
          gl_account_code: cashAccountCode,
          debit_amount: amount,
          credit_amount: 0,
          description: 'Payment received'
        },
        {
          gl_account_code: '1100', // Accounts Receivable - Students
          debit_amount: 0,
          credit_amount: amount,
          description: 'Payment applied to student account'
        }
      ]
    };

    return this.createJournalEntry(journalData);
  }

  /**
   * Creates an invoice journal entry (Charge student fees)
   * Debit: Student Receivable
   * Credit: Revenue (Tuition/Boarding/Transport)
   */
  async recordInvoice(
    studentId: number,
    invoiceItems: Array<{ gl_account_code: string; amount: number; description: string }>,
    invoiceDate: string,
    userId: number
  ): Promise<{ success: boolean; message: string; entry_id?: number }> {
    const totalAmount = invoiceItems.reduce((sum, item) => sum + item.amount, 0);

    const lines: JournalEntryLineData[] = [
      {
        gl_account_code: '1100', // Accounts Receivable - Students
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

    return this.createJournalEntry(journalData);
  }

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
        SELECT je.*, jel.gl_account_id, jel.debit_amount, jel.credit_amount, jel.description as line_desc
        FROM journal_entry je
        JOIN journal_entry_line jel ON je.id = jel.journal_entry_id
        WHERE je.id = ? AND je.is_voided = 0
      `).all(entryId) as Array<{ entry_date: string; debit_amount: number }>;

      if (!originalEntry || originalEntry.length === 0) {
        return {
          success: false,
          message: 'Journal entry not found or already voided'
        };
      }

      // Check if approval required for void
      const daysOld = Math.floor(
        (new Date().getTime() - new Date(originalEntry[0].entry_date).getTime()) / (1000 * 60 * 60 * 24)
      );

      // Calculate total amount from line items
      const totalAmount = originalEntry.reduce((sum, line) => sum + (line.debit_amount || 0), 0);

      const needsApproval = this.db.prepare(`
        SELECT id FROM approval_rule
        WHERE transaction_type = 'VOID'
          AND is_active = 1
          AND (
            (min_amount IS NOT NULL AND ? >= min_amount)
            OR (days_since_transaction IS NOT NULL AND ? >= days_since_transaction)
          )
      `).get(totalAmount, daysOld) as { id: number } | undefined;

      if (needsApproval) {
        // Create approval request
        const approvalResult = this.db.prepare(`
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

      // Mark original as voided
      this.db.prepare(`
        UPDATE journal_entry
        SET is_voided = 1, voided_reason = ?, voided_by_user_id = ?, voided_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(voidReason, userId, entryId);

      // Audit log
      logAudit(userId, 'VOID', 'journal_entry', entryId, null, { void_reason: voidReason });

      return {
        success: true,
        message: 'Journal entry voided successfully',
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

    return {
      assets,
      liabilities,
      equity,
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      total_equity: totalEquity,
      is_balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1 // Allow 1 cent rounding
    };
  }

  /**
   * Helper: Generate unique entry reference
   */
  private generateEntryRef(entryType: string): string {
    const prefix = entryType.substring(0, 3).toUpperCase();
    const timestamp = Date.now();
    return `${prefix}-${timestamp}`;
  }

  /**
   * Helper: Check if approval required
   */
  private async checkApprovalRequired(data: JournalEntryData): Promise<boolean> {
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
