import Database from 'better-sqlite3-multiple-ciphers';
import { getDatabase } from '../../database';
import { logAudit } from '../../database/utils/audit';
import { DoubleEntryJournalService, JournalEntryData } from './DoubleEntryJournalService';

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

export class DataMigrationService {
  private db: Database.Database;
  private journalService: DoubleEntryJournalService;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
    this.journalService = new DoubleEntryJournalService(this.db);
  }

  /**
   * Migrate all historical ledger transactions
   * Dry run mode available for testing
   */
  async migrateHistoricalTransactions(
    dryRun = false,
    userId: number
  ): Promise<MigrationResult> {
    try {
      // Get unmigrated transactions
      const transactions = this.db.prepare(`
        SELECT
          lt.*,
          s.first_name || ' ' || s.last_name as student_name,
          s.admission_number
        FROM ledger_transaction lt
        LEFT JOIN student s ON lt.student_id = s.id
        WHERE lt.is_migrated IS NULL OR lt.is_migrated = 0
        ORDER BY lt.transaction_date, lt.id
      `).all() as any[];

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
        // Add is_migrated column if it doesn't exist
        try {
          this.db.exec(`ALTER TABLE ledger_transaction ADD COLUMN is_migrated INTEGER DEFAULT 0`);
        } catch (e) {
          // Column may already exist
        }
      }

      for (const transaction of transactions) {
        try {
          if (dryRun) {
            // Just validate, don't actually create entries
            console.log(`[DRY RUN] Would migrate transaction ${transaction.id}`);
            migratedCount++;
          } else {
            // Determine GL accounts based on transaction type and description
            const { debitAccount, creditAccount } = this.determineGLAccounts(transaction);

            // Create journal entry
            const journalData: JournalEntryData = {
              entry_date: transaction.transaction_date,
              entry_type: this.mapTransactionType(transaction.transaction_type),
              description: transaction.description || `Migrated: ${transaction.transaction_type}`,
              student_id: transaction.student_id || undefined,
              created_by_user_id: userId,
              lines: [
                {
                  gl_account_code: debitAccount,
                  debit_amount: transaction.debit_credit === 'DEBIT' ? transaction.amount : 0,
                  credit_amount: transaction.debit_credit === 'CREDIT' ? transaction.amount : 0,
                  description: 'Migrated from legacy system'
                },
                {
                  gl_account_code: creditAccount,
                  debit_amount: transaction.debit_credit === 'CREDIT' ? transaction.amount : 0,
                  credit_amount: transaction.debit_credit === 'DEBIT' ? transaction.amount : 0,
                  description: 'Migrated from legacy system'
                }
              ]
            };

            const result = await this.journalService.createJournalEntry(journalData);

            if (result.success) {
              // Mark as migrated
              this.db.prepare(`
                UPDATE ledger_transaction
                SET is_migrated = 1, migrated_journal_entry_id = ?
                WHERE id = ?
              `).run(result.entry_id, transaction.id);

              migratedCount++;
            } else {
              failedCount++;
              errors.push(`Transaction ${transaction.id}: ${result.message}`);
            }
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
    `).get() as any;

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

  private determineGLAccounts(transaction: any): { debitAccount: string; creditAccount: string } {
    // Determine GL accounts based on transaction type and description
    const type = (transaction.transaction_type || '').toUpperCase();
    const desc = (transaction.description || '').toLowerCase();

    // Payment transactions
    if (type === 'PAYMENT' || type === 'CREDIT') {
      if (desc.includes('cash')) {
        return { debitAccount: '1010', creditAccount: '1100' }; // Cash, Receivable
      } else {
        return { debitAccount: '1020', creditAccount: '1100' }; // Bank, Receivable
      }
    }

    // Invoice/Charge transactions
    if (type === 'INVOICE' || type === 'CHARGE' || type === 'DEBIT') {
      let revenueAccount = '4300'; // Other Income (default)

      if (desc.includes('tuition') || desc.includes('school fee')) {
        revenueAccount = '4010'; // Tuition
      } else if (desc.includes('board') || desc.includes('boarding')) {
        revenueAccount = '4020'; // Boarding
      } else if (desc.includes('transport') || desc.includes('bus')) {
        revenueAccount = '4030'; // Transport
      } else if (desc.includes('activity') || desc.includes('sport')) {
        revenueAccount = '4040'; // Activity
      } else if (desc.includes('exam')) {
        revenueAccount = '4050'; // Exam
      }

      return { debitAccount: '1100', creditAccount: revenueAccount }; // Receivable, Revenue
    }

    // Default: treat as cash transaction
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
