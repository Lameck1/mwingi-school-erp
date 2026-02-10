
import { DoubleEntryJournalService } from './DoubleEntryJournalService';
import { getDatabase } from '../../database';
import { logAudit } from '../../database/utils/audit';

import type Database from 'better-sqlite3-multiple-ciphers';

/**
 * Opening Balance Service
 * 
 * Handles:
 * 1. Import of opening balances from previous systems
 * 2. Student account opening balances
 * 3. GL account opening balances
 * 4. Verification and reconciliation
 */

export interface OpeningBalanceImport {
  academic_year_id: number;
  gl_account_code?: string;
  student_id?: number;
  debit_amount: number;
  credit_amount: number;
  description: string;
  imported_from: string;
  imported_by_user_id: number;
}

export interface StudentOpeningBalance {
  student_id: number;
  admission_number: string;
  student_name: string;
  opening_balance: number;
  balance_type: 'DEBIT' | 'CREDIT';
}

export class OpeningBalanceService {
  private db: Database.Database;
  private journalService: DoubleEntryJournalService;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
    this.journalService = new DoubleEntryJournalService(this.db);
  }

  /**
   * Import opening balances for students
   * Creates journal entries: Debit: Student Receivable, Credit: Opening Balance Equity
   */
  private insertStudentOpeningBalance(
    balance: StudentOpeningBalance,
    academicYearId: number,
    importSource: string,
    userId: number
  ): void {
    this.db.prepare(`
            INSERT INTO opening_balance (
              academic_year_id, student_id,
              debit_amount, credit_amount,
              description, imported_from, imported_by_user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
      academicYearId,
      balance.student_id,
      balance.balance_type === 'DEBIT' ? balance.opening_balance : 0,
      balance.balance_type === 'CREDIT' ? balance.opening_balance : 0,
      `Opening balance for ${balance.student_name} (${balance.admission_number})`,
      importSource,
      userId
    );
  }

  private createOpeningBalanceJournalEntry(balance: StudentOpeningBalance, userId: number): void {
    if (balance.opening_balance <= 0) {
      return;
    }

    const entryDate = new Date().toISOString().split('T')[0];
    if (balance.balance_type === 'DEBIT') {
      void this.journalService.createJournalEntry({
        entry_date: entryDate,
        entry_type: 'OPENING_BALANCE',
        description: `Opening balance - ${balance.student_name}`,
        student_id: balance.student_id,
        created_by_user_id: userId,
        lines: [
          {
            gl_account_code: '1100',
            debit_amount: balance.opening_balance,
            credit_amount: 0,
            description: 'Student opening balance'
          },
          {
            gl_account_code: '3020',
            debit_amount: 0,
            credit_amount: balance.opening_balance,
            description: 'Opening balance equity'
          }
        ]
      }).catch((error) => {
        console.error('Failed to create opening balance journal entry:', error);
      });
      return;
    }

    void this.journalService.createJournalEntry({
      entry_date: entryDate,
      entry_type: 'OPENING_BALANCE',
      description: `Opening credit balance - ${balance.student_name}`,
      student_id: balance.student_id,
      created_by_user_id: userId,
      lines: [
        {
          gl_account_code: '2020',
          debit_amount: 0,
          credit_amount: balance.opening_balance,
          description: 'Student credit balance'
        },
        {
          gl_account_code: '3020',
          debit_amount: balance.opening_balance,
          credit_amount: 0,
          description: 'Opening balance equity'
        }
      ]
    }).catch((error) => {
      console.error('Failed to create opening credit journal entry:', error);
    });
  }

  async importStudentOpeningBalances(
    balances: StudentOpeningBalance[],
    academicYearId: number,
    importSource: string,
    userId: number
  ): Promise<{ success: boolean; message: string; imported_count: number }> {
    try {
      let importedCount = 0;

      const importTxn = this.db.transaction(() => {
        for (const balance of balances) {
          this.insertStudentOpeningBalance(balance, academicYearId, importSource, userId);
          this.createOpeningBalanceJournalEntry(balance, userId);
          importedCount++;
        }

        // Audit log
        logAudit(userId, 'IMPORT', 'opening_balance', null, null, {
          academic_year_id: academicYearId,
          imported_count: importedCount,
          import_source: importSource
        });
      });

      importTxn();

      return {
        success: true,
        message: `Successfully imported ${importedCount} student opening balances`,
        imported_count: importedCount
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to import opening balances: ${(error as Error).message}`,
        imported_count: 0
      };
    }
  }

  /**
   * Import GL account opening balances
   */
  async importGLOpeningBalances(
    balances: OpeningBalanceImport[],
    userId: number
  ): Promise<{ success: boolean; message: string; imported_count: number }> {
    try {
      let importedCount = 0;

      const importTxn = this.db.transaction(() => {
        for (const balance of balances) {
          // Validate GL account exists
          const account = this.db.prepare(`
            SELECT id, account_code, account_name
            FROM gl_account
            WHERE account_code = ? AND is_active = 1
          `).get(balance.gl_account_code);

          if (!account) {
            throw new Error(`Invalid GL account code: ${balance.gl_account_code}. Verify the account exists in Chart of Accounts and is active.`);
          }

          // Insert opening balance record
          this.db.prepare(`
            INSERT INTO opening_balance (
              academic_year_id, gl_account_id,
              debit_amount, credit_amount,
              description, imported_from, imported_by_user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            balance.academic_year_id,
            account.id,
            balance.debit_amount,
            balance.credit_amount,
            balance.description,
            balance.imported_from,
            userId
          );

          importedCount++;
        }

        logAudit(userId, 'IMPORT', 'opening_balance', null, null, {
          imported_count: importedCount,
          import_type: 'GL_ACCOUNTS'
        });
      });

      importTxn();

      return {
        success: true,
        message: `Successfully imported ${importedCount} GL opening balances`,
        imported_count: importedCount
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to import GL opening balances: ${(error as Error).message}`,
        imported_count: 0
      };
    }
  }

  /**
   * Get student ledger with opening balance
   */
  async getStudentLedger(
    studentId: number,
    academicYearId: number,
    startDate: string,
    endDate: string
  ): Promise<{
    student: { admission_number: string; full_name: string };
    opening_balance: number;
    transactions: Array<{
      date: string;
      description: string;
      debit: number;
      credit: number;
      balance: number;
    }>;
    closing_balance: number;
  }> {
    // Get student info
    const student = this.db.prepare(`
      SELECT admission_number, first_name || ' ' || last_name as full_name
      FROM student
      WHERE id = ?
    `).get(studentId) as { admission_number: string; full_name: string };

    // Get opening balance
    const openingBalanceRecord = this.db.prepare(`
      SELECT
        COALESCE(SUM(debit_amount), 0) as total_debit,
        COALESCE(SUM(credit_amount), 0) as total_credit
      FROM opening_balance
      WHERE student_id = ? AND academic_year_id = ?
    `).get(studentId, academicYearId) as { total_debit: number; total_credit: number };

    const openingBalance = openingBalanceRecord.total_debit - openingBalanceRecord.total_credit;

    // Get transactions
    const transactions = this.db.prepare(`
      SELECT
        je.entry_date as date,
        je.description,
        COALESCE(SUM(jel.debit_amount), 0) as debit,
        COALESCE(SUM(jel.credit_amount), 0) as credit
      FROM journal_entry je
      JOIN journal_entry_line jel ON je.id = jel.journal_entry_id
      JOIN gl_account ga ON jel.gl_account_id = ga.id
      WHERE je.student_id = ?
        AND je.entry_date BETWEEN ? AND ?
        AND je.is_posted = 1
        AND je.is_voided = 0
        AND ga.account_code IN ('1100', '2020')  -- Student Receivable or Credit Balance
      GROUP BY je.id, je.entry_date, je.description
      ORDER BY je.entry_date, je.id
    `).all(studentId, startDate, endDate) as Array<{
      date: string;
      description: string;
      debit: number;
      credit: number;
    }>;

    // Calculate running balance
    let runningBalance = openingBalance;
    const transactionsWithBalance = transactions.map((txn) => {
      runningBalance += txn.debit - txn.credit;
      return {
        ...txn,
        balance: runningBalance
      };
    });

    return {
      student,
      opening_balance: openingBalance,
      transactions: transactionsWithBalance,
      closing_balance: runningBalance
    };
  }

  /**
   * Verify opening balances (check if debits = credits)
   */
  async verifyOpeningBalances(
    academicYearId: number,
    userId: number
  ): Promise<{
    success: boolean;
    message: string;
    total_debits: number;
    total_credits: number;
    variance: number;
    is_balanced: boolean;
  }> {
    const totals = this.db.prepare(`
      SELECT
        COALESCE(SUM(debit_amount), 0) as total_debits,
        COALESCE(SUM(credit_amount), 0) as total_credits
      FROM opening_balance
      WHERE academic_year_id = ?
    `).get(academicYearId) as { total_debits: number; total_credits: number };

    const variance = totals.total_debits - totals.total_credits;
    const isBalanced = Math.abs(variance) < 1; // Allow 1 cent rounding difference

    if (isBalanced) {
      // Mark as verified
      this.db.prepare(`
        UPDATE opening_balance
        SET is_verified = 1, verified_by_user_id = ?, verified_at = CURRENT_TIMESTAMP
        WHERE academic_year_id = ? AND is_verified = 0
      `).run(userId, academicYearId);

      logAudit(userId, 'VERIFY', 'opening_balance', null, null, {
        academic_year_id: academicYearId,
        verification_status: 'BALANCED'
      });
    }

    return {
      success: isBalanced,
      message: isBalanced
        ? 'Opening balances are balanced (debits = credits)'
        : `Opening balances are OUT OF BALANCE by ${variance}`,
      total_debits: totals.total_debits,
      total_credits: totals.total_credits,
      variance,
      is_balanced: isBalanced
    };
  }

  /**
   * Get opening balance summary by GL account
   */
  async getOpeningBalanceSummary(academicYearId: number): Promise<
    Array<{
      account_code: string;
      account_name: string;
      account_type: string;
      total_debit: number;
      total_credit: number;
      net_balance: number;
    }>
  > {
    return this.db.prepare(`
      SELECT
        ga.account_code,
        ga.account_name,
        ga.account_type,
        COALESCE(SUM(ob.debit_amount), 0) as total_debit,
        COALESCE(SUM(ob.credit_amount), 0) as total_credit,
        COALESCE(SUM(ob.debit_amount), 0) - COALESCE(SUM(ob.credit_amount), 0) as net_balance
      FROM opening_balance ob
      JOIN gl_account ga ON ob.gl_account_id = ga.id
      WHERE ob.academic_year_id = ?
      GROUP BY ga.id, ga.account_code, ga.account_name, ga.account_type
      ORDER BY ga.account_code
    `).all(academicYearId) as Array<{
      account_code: string;
      account_name: string;
      account_type: string;
      total_debit: number;
      total_credit: number;
      net_balance: number;
    }>;
  }
}
