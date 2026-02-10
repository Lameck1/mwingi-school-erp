
import { DoubleEntryJournalService, type JournalEntryData } from './DoubleEntryJournalService';
import { getDatabase } from '../../database';
import { logAudit } from '../../database/utils/audit';

import type Database from 'better-sqlite3';

/**
 * Data Migration Service
 * 
 * Migrates historical transactions from old single-entry system
 * to new double-entry journal system.
 */

export interface MigrationResult {
  success: boolean;
  message: string;
  migrated_count?: number;
  failed_count?: number;
  errors?: string[];
}

export interface MigrationStats {
  total_transactions: number;
  migrated: number;
  failed: number;
  skipped: number;
  total_amount_migrated: number;
}

interface LegacyTransaction {
  id: number;
  student_id: number | null;
  transaction_date: string;
  transaction_type: string;
  amount: number;
  debit_credit: 'DEBIT' | 'CREDIT';
  description: string | null;
  is_migrated: number | null;
  student_name: string | null;
  admission_number: string | null;
}

export class DataMigrationService {
  private readonly db: Database.Database;
  private readonly journalService: DoubleEntryJournalService;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
    this.journalService = new DoubleEntryJournalService(this.db);
  }

  private getUnmigratedTransactions(): LegacyTransaction[] {
    return this.db.prepare(`
      SELECT
        lt.*,
        s.first_name || ' ' || s.last_name as student_name,
        s.admission_number
      FROM ledger_transaction lt
      LEFT JOIN student s ON lt.student_id = s.id
      WHERE lt.is_migrated IS NULL OR lt.is_migrated = 0
      ORDER BY lt.transaction_date, lt.id
    `).all() as LegacyTransaction[];
  }

  private ensureMigrationColumns(): void {
    try {
      this.db.exec(`ALTER TABLE ledger_transaction ADD COLUMN is_migrated INTEGER DEFAULT 0`);
    } catch {
      // Column already exists in migrated databases.
    }
  }

  private buildJournalData(
    transaction: LegacyTransaction,
    userId: number,
    debitAccount: string,
    creditAccount: string
  ): JournalEntryData {
    const isDebitTransaction = transaction.debit_credit === 'DEBIT';

    return {
      entry_date: transaction.transaction_date,
      entry_type: this.mapTransactionType(transaction.transaction_type),
      description: transaction.description || `Migrated: ${transaction.transaction_type}`,
      student_id: transaction.student_id || undefined,
      created_by_user_id: userId,
      lines: [
        {
          gl_account_code: debitAccount,
          debit_amount: isDebitTransaction ? transaction.amount : 0,
          credit_amount: isDebitTransaction ? 0 : transaction.amount,
          description: 'Migrated from legacy system'
        },
        {
          gl_account_code: creditAccount,
          debit_amount: isDebitTransaction ? 0 : transaction.amount,
          credit_amount: isDebitTransaction ? transaction.amount : 0,
          description: 'Migrated from legacy system'
        }
      ]
    };
  }

  private markTransactionMigrated(transactionId: number, entryId: number): void {
    this.db.prepare(`
      UPDATE ledger_transaction
      SET is_migrated = 1, migrated_journal_entry_id = ?
      WHERE id = ?
    `).run(entryId, transactionId);
  }

  private async migrateSingleTransaction(
    transaction: LegacyTransaction,
    userId: number,
    dryRun: boolean
  ): Promise<{ success: boolean; error?: string }> {
    if (dryRun) {
      console.error(`[DRY RUN] Would migrate transaction ${transaction.id}`);
      return { success: true };
    }

    const { debitAccount, creditAccount } = this.determineGLAccounts(transaction);
    const journalData = this.buildJournalData(transaction, userId, debitAccount, creditAccount);
    const result = await this.journalService.createJournalEntry(journalData);

    if (!result.success || !result.entry_id) {
      return { success: false, error: result.message || 'Journal entry creation failed' };
    }

    this.markTransactionMigrated(transaction.id, result.entry_id);
    return { success: true };
  }

  /**
   * Migrate all historical ledger transactions
   * Dry run mode available for testing
   */
  async migrateHistoricalTransactions(
    userId: number,
    dryRun = false
  ): Promise<MigrationResult> {
    try {
      const transactions = this.getUnmigratedTransactions();

      if (transactions.length === 0) {
        return {
          success: true,
          message: 'No transactions to migrate',
          migrated_count: 0
        };
      }

      let migratedCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      if (!dryRun) {
        this.ensureMigrationColumns();
      }

      for (const transaction of transactions) {
        try {
          const migrationResult = await this.migrateSingleTransaction(transaction, userId, dryRun);
          if (migrationResult.success) {
            migratedCount++;
          } else {
            failedCount++;
            errors.push(`Transaction ${transaction.id}: ${migrationResult.error || 'Unknown migration error'}`);
          }
        } catch (error) {
          failedCount++;
          errors.push(`Transaction ${transaction.id}: ${(error as Error).message}`);
        }
      }

      // Audit log
      if (!dryRun) {
        logAudit(
          userId,
          'MIGRATE',
          'ledger_transaction',
          null,
          null,
          {
            migrated_count: migratedCount,
            failed_count: failedCount,
            dry_run: dryRun
          }
        );
      }

      return {
        success: failedCount === 0,
        message: dryRun
          ? `Dry run complete: ${migratedCount} transactions would be migrated`
          : `Migration complete: ${migratedCount} migrated, ${failedCount} failed`,
        migrated_count: migratedCount,
        failed_count: failedCount,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error) {
      return {
        success: false,
        message: `Migration failed: ${(error as Error).message}`
      };
    }
  }

  /**
   * Validate migration accuracy
   * Compares old totals with new journal entry totals
   */
  async validateMigration(): Promise<{
    success: boolean;
    message: string;
    old_total_debits: number;
    old_total_credits: number;
    new_total_debits: number;
    new_total_credits: number;
    variance: number;
  }> {
    try {
      // Get totals from old system
      const oldTotals = this.db.prepare(`
        SELECT
          SUM(CASE WHEN debit_credit = 'DEBIT' THEN amount ELSE 0 END) as total_debits,
          SUM(CASE WHEN debit_credit = 'CREDIT' THEN amount ELSE 0 END) as total_credits
        FROM ledger_transaction
        WHERE is_migrated = 1
      `).get() as { total_debits: number; total_credits: number };

      // Get totals from new system (migrated entries only)
      const newTotals = this.db.prepare(`
        SELECT
          SUM(jel.debit_amount) as total_debits,
          SUM(jel.credit_amount) as total_credits
        FROM journal_entry je
        JOIN journal_entry_line jel ON je.id = jel.journal_entry_id
        WHERE je.entry_type LIKE '%MIGRATED%' OR je.description LIKE '%Migrated%'
      `).get() as { total_debits: number; total_credits: number };

      const variance = Math.abs(
        (oldTotals.total_debits + oldTotals.total_credits) -
        (newTotals.total_debits + newTotals.total_credits)
      );

      const isValid = variance < 100; // Allow 1 Kes variance due to rounding

      return {
        success: isValid,
        message: isValid
          ? 'Migration validation passed: Totals match'
          : `Migration validation failed: Variance of ${variance} cents detected`,
        old_total_debits: oldTotals.total_debits || 0,
        old_total_credits: oldTotals.total_credits || 0,
        new_total_debits: newTotals.total_debits || 0,
        new_total_credits: newTotals.total_credits || 0,
        variance
      };
    } catch (error) {
      return {
        success: false,
        message: `Validation failed: ${(error as Error).message}`,
        old_total_debits: 0,
        old_total_credits: 0,
        new_total_debits: 0,
        new_total_credits: 0,
        variance: 0
      };
    }
  }

  /**
   * Get migration statistics
   */
  async getMigrationStats(): Promise<MigrationStats> {
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total_transactions,
        SUM(CASE WHEN is_migrated = 1 THEN 1 ELSE 0 END) as migrated,
        SUM(CASE WHEN is_migrated = 0 OR is_migrated IS NULL THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN is_migrated = 1 THEN amount ELSE 0 END) as total_amount_migrated
      FROM ledger_transaction
    `).get() as {
      total_transactions: number;
      migrated: number;
      pending: number;
      total_amount_migrated: number;
    };

    return {
      total_transactions: stats.total_transactions || 0,
      migrated: stats.migrated || 0,
      failed: 0, // Would need separate tracking
      skipped: stats.pending || 0,
      total_amount_migrated: stats.total_amount_migrated || 0
    };
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private determineGLAccounts(transaction: LegacyTransaction): { debitAccount: string; creditAccount: string } {
    const type = (transaction.transaction_type || '').toUpperCase();
    const desc = (transaction.description || '').toLowerCase();
    const paymentTypes = new Set(['PAYMENT', 'CREDIT']);
    const invoiceTypes = new Set(['INVOICE', 'CHARGE', 'DEBIT']);

    if (paymentTypes.has(type)) {
      return {
        debitAccount: desc.includes('cash') ? '1010' : '1020',
        creditAccount: '1100'
      };
    }

    if (invoiceTypes.has(type)) {
      const revenueRules: ReadonlyArray<{ account: string; matches: (description: string) => boolean }> = [
        { account: '4010', matches: (description) => description.includes('tuition') || description.includes('school fee') },
        { account: '4020', matches: (description) => description.includes('board') || description.includes('boarding') },
        { account: '4030', matches: (description) => description.includes('transport') || description.includes('bus') },
        { account: '4040', matches: (description) => description.includes('activity') || description.includes('sport') },
        { account: '4050', matches: (description) => description.includes('exam') }
      ];
      const matchedRevenue = revenueRules.find((rule) => rule.matches(desc));
      return { debitAccount: '1100', creditAccount: matchedRevenue?.account || '4300' };
    }

    return { debitAccount: '1010', creditAccount: '1100' };
  }

  private mapTransactionType(oldType: string): string {
    const type = (oldType || '').toUpperCase();

    if (type.includes('PAYMENT') || type.includes('CREDIT')) {
      return 'FEE_PAYMENT';
    } else if (type.includes('INVOICE') || type.includes('CHARGE')) {
      return 'FEE_INVOICE';
    } else if (type.includes('REFUND')) {
      return 'REFUND';
    } else {
      return 'OPENING_BALANCE';
    }
  }
}


