
import { DoubleEntryJournalService } from './DoubleEntryJournalService';
import { getDatabase } from '../../database';
import { logAudit } from '../../database/utils/audit';

import type Database from 'better-sqlite3';

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
  private readonly db: Database.Database;
  private readonly journalService: DoubleEntryJournalService;
  private readonly schemaPresence = new Map<string, boolean>();

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
    this.journalService = new DoubleEntryJournalService(this.db);
  }

  private tableExists(tableName: string): boolean {
    const cacheKey = `table:${tableName}`;
    const cached = this.schemaPresence.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const exists = Boolean(
      this.db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`).get(tableName)
    );
    this.schemaPresence.set(cacheKey, exists);
    return exists;
  }

  private columnExists(tableName: string, columnName: string): boolean {
    const cacheKey = `column:${tableName}.${columnName}`;
    const cached = this.schemaPresence.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    if (!this.tableExists(tableName)) {
      this.schemaPresence.set(cacheKey, false);
      return false;
    }

    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    const exists = columns.some((column) => column.name === columnName);
    this.schemaPresence.set(cacheKey, exists);
    return exists;
  }

  private getInvoiceAmountExpression(alias: string): string {
    const candidates: string[] = [];

    if (this.columnExists('fee_invoice', 'total_amount')) {
      candidates.push(`NULLIF(${alias}.total_amount, 0)`);
    }
    if (this.columnExists('fee_invoice', 'amount_due')) {
      candidates.push(`NULLIF(${alias}.amount_due, 0)`);
    }
    if (this.columnExists('fee_invoice', 'amount')) {
      candidates.push(`NULLIF(${alias}.amount, 0)`);
    }
    if (this.columnExists('fee_invoice', 'total_amount')) {
      candidates.push(`${alias}.total_amount`);
    }
    if (this.columnExists('fee_invoice', 'amount_due')) {
      candidates.push(`${alias}.amount_due`);
    }
    if (this.columnExists('fee_invoice', 'amount')) {
      candidates.push(`${alias}.amount`);
    }

    if (candidates.length === 0) {
      return '0';
    }

    return `COALESCE(${candidates.join(', ')}, 0)`;
  }

  private getInvoiceDateExpression(alias: string): string {
    const candidates: string[] = [];
    if (this.columnExists('fee_invoice', 'invoice_date')) {
      candidates.push(`${alias}.invoice_date`);
    }
    if (this.columnExists('fee_invoice', 'created_at')) {
      candidates.push(`substr(${alias}.created_at, 1, 10)`);
    }
    if (this.columnExists('fee_invoice', 'due_date')) {
      candidates.push(`${alias}.due_date`);
    }

    if (candidates.length === 0) {
      return `DATE('now')`;
    }

    return `COALESCE(${candidates.join(', ')}, DATE('now'))`;
  }

  private getLedgerDateExpression(alias: string): string {
    const candidates: string[] = [];
    if (this.columnExists('ledger_transaction', 'transaction_date')) {
      candidates.push(`${alias}.transaction_date`);
    }
    if (this.columnExists('ledger_transaction', 'created_at')) {
      candidates.push(`substr(${alias}.created_at, 1, 10)`);
    }

    if (candidates.length === 0) {
      return `DATE('now')`;
    }

    return `COALESCE(${candidates.join(', ')}, DATE('now'))`;
  }

  private getCreditDateExpression(alias: string): string {
    const candidates: string[] = [];
    if (this.columnExists('credit_transaction', 'created_at')) {
      candidates.push(`substr(${alias}.created_at, 1, 10)`);
    }

    if (candidates.length === 0) {
      return `DATE('now')`;
    }

    return `COALESCE(${candidates.join(', ')}, DATE('now'))`;
  }

  private getExternalCreditFilter(alias: string): string {
    return `
      (
        (
          UPPER(${alias}.transaction_type) = 'CREDIT_RECEIVED'
          AND LOWER(COALESCE(${alias}.notes, '')) NOT LIKE 'overpayment from transaction #%'
        )
        OR
        (
          UPPER(${alias}.transaction_type) = 'CREDIT_REFUNDED'
          AND LOWER(COALESCE(${alias}.notes, '')) NOT LIKE 'void reversal of transaction #%'
        )
      )
    `;
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
          `).get(balance.gl_account_code) as { id: number; account_code: string; account_name: string } | undefined;

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
      ref?: string;
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
    `).get(studentId) as { admission_number: string; full_name: string } | undefined;

    if (!student) {
      throw new Error('Student not found');
    }

    const invoiceAmountExpr = this.getInvoiceAmountExpression('fi');
    const invoiceDateExpr = this.getInvoiceDateExpression('fi');
    const ledgerDateExpr = this.getLedgerDateExpression('lt');
    const hasCreditTransactions = this.tableExists('credit_transaction');
    const creditDateExpr = hasCreditTransactions ? this.getCreditDateExpression('ct') : `DATE('now')`;
    const externalCreditFilter = hasCreditTransactions ? this.getExternalCreditFilter('ct') : '0';

    // Get opening balance
    const openingBalanceRecord = this.db.prepare(`
      SELECT
        COALESCE(SUM(debit_amount), 0) as total_debit,
        COALESCE(SUM(credit_amount), 0) as total_credit
      FROM opening_balance
      WHERE student_id = ? AND academic_year_id = ?
    `).get(studentId, academicYearId) as { total_debit: number; total_credit: number };

    const historicalInvoiceDebits = this.db.prepare(`
      SELECT COALESCE(SUM(${invoiceAmountExpr}), 0) as total_debit
      FROM fee_invoice fi
      WHERE fi.student_id = ?
        AND ${invoiceDateExpr} < ?
        AND UPPER(COALESCE(fi.status, 'PENDING')) NOT IN ('CANCELLED', 'VOIDED')
    `).get(studentId, startDate) as { total_debit: number };

    const historicalLedgerNetMovement = this.db.prepare(`
      SELECT COALESCE(
        SUM(
          CASE
            WHEN UPPER(COALESCE(debit_credit, '')) = 'DEBIT' THEN ABS(COALESCE(amount, 0))
            WHEN UPPER(COALESCE(debit_credit, '')) = 'CREDIT' THEN -ABS(COALESCE(amount, 0))
            ELSE 0
          END
        ),
        0
      ) as net_movement
      FROM ledger_transaction lt
      WHERE lt.student_id = ?
        AND ${ledgerDateExpr} < ?
        AND COALESCE(lt.is_voided, 0) = 0
        AND UPPER(COALESCE(lt.transaction_type, '')) != 'OPENING_BALANCE'
    `).get(studentId, startDate) as { net_movement: number };

    const historicalCreditAdjustments = hasCreditTransactions
      ? this.db.prepare(`
          SELECT COALESCE(
            SUM(
              CASE
                WHEN UPPER(COALESCE(ct.transaction_type, '')) = 'CREDIT_RECEIVED' THEN -ABS(COALESCE(ct.amount, 0))
                WHEN UPPER(COALESCE(ct.transaction_type, '')) = 'CREDIT_REFUNDED' THEN ABS(COALESCE(ct.amount, 0))
                ELSE 0
              END
            ),
            0
          ) as net_movement
          FROM credit_transaction ct
          WHERE ct.student_id = ?
            AND ${creditDateExpr} < ?
            AND ${externalCreditFilter}
        `).get(studentId, startDate) as { net_movement: number }
      : { net_movement: 0 };

    const openingBalance =
      (openingBalanceRecord.total_debit - openingBalanceRecord.total_credit) +
      historicalInvoiceDebits.total_debit +
      historicalLedgerNetMovement.net_movement +
      historicalCreditAdjustments.net_movement;

    const transactionSqlParts = [`
      SELECT
        statement_entry.date,
        statement_entry.ref,
        statement_entry.description,
        statement_entry.debit,
        statement_entry.credit
      FROM (
        SELECT
          ${invoiceDateExpr} as date,
          COALESCE(fi.created_at, ${invoiceDateExpr} || 'T00:00:00.000Z') as created_at,
          10 as sort_priority,
          fi.id as sort_id,
          COALESCE(NULLIF(fi.invoice_number, ''), 'INV-' || fi.id) as ref,
          COALESCE(NULLIF(fi.description, ''), 'Fee invoice for student') as description,
          ${invoiceAmountExpr} as debit,
          0 as credit
        FROM fee_invoice fi
        WHERE fi.student_id = ?
          AND ${invoiceDateExpr} BETWEEN ? AND ?
          AND UPPER(COALESCE(fi.status, 'PENDING')) NOT IN ('CANCELLED', 'VOIDED')

        UNION ALL

        SELECT
          ${ledgerDateExpr} as date,
          COALESCE(lt.created_at, ${ledgerDateExpr} || 'T00:00:00.000Z') as created_at,
          20 as sort_priority,
          lt.id as sort_id,
          COALESCE(NULLIF(lt.payment_reference, ''), lt.transaction_ref, '-') as ref,
          COALESCE(NULLIF(lt.description, ''), lt.transaction_type, 'Ledger transaction') as description,
          CASE WHEN UPPER(COALESCE(lt.debit_credit, '')) = 'DEBIT' THEN ABS(COALESCE(lt.amount, 0)) ELSE 0 END as debit,
          CASE WHEN UPPER(COALESCE(lt.debit_credit, '')) = 'CREDIT' THEN ABS(COALESCE(lt.amount, 0)) ELSE 0 END as credit
        FROM ledger_transaction lt
        WHERE lt.student_id = ?
          AND ${ledgerDateExpr} BETWEEN ? AND ?
          AND COALESCE(lt.is_voided, 0) = 0
          AND UPPER(COALESCE(lt.transaction_type, '')) != 'OPENING_BALANCE'
    `];

    const transactionParams: Array<number | string> = [studentId, startDate, endDate, studentId, startDate, endDate];

    if (hasCreditTransactions) {
      transactionSqlParts.push(`
          UNION ALL

          SELECT
            ${creditDateExpr} as date,
            COALESCE(ct.created_at, ${creditDateExpr} || 'T00:00:00.000Z') as created_at,
            30 as sort_priority,
            ct.id as sort_id,
            'CR-' || ct.id as ref,
            COALESCE(NULLIF(ct.notes, ''), CASE
              WHEN UPPER(COALESCE(ct.transaction_type, '')) = 'CREDIT_RECEIVED' THEN 'Student credit adjustment'
              ELSE 'Student credit reversal'
            END) as description,
            CASE WHEN UPPER(COALESCE(ct.transaction_type, '')) = 'CREDIT_REFUNDED' THEN ABS(COALESCE(ct.amount, 0)) ELSE 0 END as debit,
            CASE WHEN UPPER(COALESCE(ct.transaction_type, '')) = 'CREDIT_RECEIVED' THEN ABS(COALESCE(ct.amount, 0)) ELSE 0 END as credit
          FROM credit_transaction ct
          WHERE ct.student_id = ?
            AND ${creditDateExpr} BETWEEN ? AND ?
            AND ${externalCreditFilter}
      `);
      transactionParams.push(studentId, startDate, endDate);
    }

    transactionSqlParts.push(`
      ) statement_entry
      ORDER BY statement_entry.date, statement_entry.created_at, statement_entry.sort_priority, statement_entry.sort_id
    `);

    const transactions = this.db.prepare(transactionSqlParts.join('\n')).all(...transactionParams) as Array<{
      date: string;
      ref: string;
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
