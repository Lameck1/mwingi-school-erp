import { getDatabase } from '../../database';
import { logAudit } from '../../database/utils/audit';

type ReconciliationStatus = 'PASS' | 'FAIL' | 'WARNING';

const CHECK_STUDENT_CREDIT = 'Student Credit Balance Verification';
const CHECK_TRIAL_BALANCE = 'Trial Balance Verification';
const CHECK_ORPHANED_TRANSACTIONS = 'Orphaned Transactions Check';
const CHECK_INVOICE_PAYMENTS = 'Invoice Payment Verification';
const CHECK_ABNORMAL_BALANCES = 'Abnormal Balance Detection';
const CHECK_LEDGER_LINKAGE = 'Ledger-Journal Linkage Check';
const CHECK_SETTLEMENT_DRIFT = 'Invoice Settlement Drift Check';

/**
 * ReconciliationService
 * 
 * Automated reconciliation checks for financial integrity.
 * Designed to run nightly to detect discrepancies early.
 * 
 * Key Functions:
 * 1. Verify student credit balances match ledger totals
 * 2. Verify Trial Balance is balanced (debits = credits)
 * 3. Detect orphaned transactions
 * 4. Verify invoice payment totals
 * 5. Alert on abnormal balances (negative assets, etc.)
 */

export interface ReconciliationResult {
  check_name: string;
  status: ReconciliationStatus;
  message: string;
  variance?: number;
  details?: unknown;
}

export interface ReconciliationReport {
  run_date: string;
  overall_status: ReconciliationStatus;
  checks: ReconciliationResult[];
  summary: {
    total_checks: number;
    passed: number;
    failed: number;
    warnings: number;
  };
}

export class ReconciliationService {
  private readonly db = getDatabase();

  private resolveOverallStatus(summary: ReconciliationReport['summary']): ReconciliationStatus {
    if (summary.failed > 0) {
      return 'FAIL';
    }

    if (summary.warnings > 0) {
      return 'WARNING';
    }

    return 'PASS';
  }

  /**
   * Run all reconciliation checks
   */
  async runAllChecks(userId: number): Promise<ReconciliationReport> {
    const checks = await Promise.all([
      this.checkStudentCreditBalances(),
      this.checkTrialBalance(),
      this.checkOrphanedTransactions(),
      this.checkInvoicePayments(),
      this.checkInvoiceSettlementDrift(),
      this.checkAbnormalBalances(),
      this.checkLedgerLinkage()
    ]);

    // Calculate summary
    const summary = {
      total_checks: checks.length,
      passed: checks.filter(c => c.status === 'PASS').length,
      failed: checks.filter(c => c.status === 'FAIL').length,
      warnings: checks.filter(c => c.status === 'WARNING').length,
    };

    const overall_status = this.resolveOverallStatus(summary);

    const report: ReconciliationReport = {
      run_date: new Date().toISOString(),
      overall_status,
      checks,
      summary,
    };

    // Log reconciliation run
    await this.logReconciliation(report, userId);

    return report;
  }

  /**
   * Check 1: Verify student credit balances match ledger transactions
   */
  private async checkStudentCreditBalances(): Promise<ReconciliationResult> {
    try {
      const students = this.db.prepare(`
        SELECT s.id, s.admission_number, COALESCE(s.credit_balance, 0) as credit_balance,
               COALESCE(SUM(
                 CASE
                   WHEN ct.transaction_type = 'CREDIT_RECEIVED' THEN ct.amount
                   WHEN ct.transaction_type = 'CREDIT_REFUNDED' THEN -ct.amount
                   WHEN ct.transaction_type = 'CREDIT_APPLIED' THEN -ct.amount
                   ELSE 0
                 END
               ), 0) as calculated_balance
        FROM student s
        LEFT JOIN credit_transaction ct ON ct.student_id = s.id
        WHERE s.is_active = 1
        GROUP BY s.id, s.admission_number, s.credit_balance
      `).all() as Array<{
        id: number;
        admission_number: string;
        credit_balance: number;
        calculated_balance: number;
      }>;

      const discrepancies = students.filter(s =>
        Math.abs(s.credit_balance - s.calculated_balance) > 1 // Tolerance of 1 cent
      );

      if (discrepancies.length === 0) {
        return {
          check_name: CHECK_STUDENT_CREDIT,
          status: 'PASS',
          message: `All ${students.length} student balances match ledger transactions.`,
        };
      }

      const totalVariance = discrepancies.reduce((sum, d) =>
        sum + Math.abs(d.credit_balance - d.calculated_balance), 0
      );

      return {
        check_name: CHECK_STUDENT_CREDIT,
        status: 'FAIL',
        message: `${discrepancies.length} students have balance discrepancies.`,
        variance: totalVariance,
        details: discrepancies.map(d => ({
          admission_number: d.admission_number,
          recorded_balance: d.credit_balance,
          calculated_balance: d.calculated_balance,
          variance: (d.credit_balance - d.calculated_balance),
        })),
      };
    } catch (error: unknown) {
      return {
        check_name: CHECK_STUDENT_CREDIT,
        status: 'FAIL',
        message: `Error during check: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Check 2: Verify Trial Balance is balanced
   */
  private async checkTrialBalance(): Promise<ReconciliationResult> {
    try {
      const result = this.db.prepare(`
        SELECT 
          COALESCE(SUM(jel.debit_amount), 0) as total_debits,
          COALESCE(SUM(jel.credit_amount), 0) as total_credits
        FROM journal_entry je
        JOIN journal_entry_line jel ON jel.journal_entry_id = je.id
        WHERE je.is_posted = 1 AND je.is_voided = 0
      `).get() as { total_debits: number; total_credits: number } | undefined;

      if (!result) {
        return {
          check_name: CHECK_TRIAL_BALANCE,
          status: 'WARNING',
          message: 'No posted journal entries found.',
        };
      }

      const variance = Math.abs(result.total_debits - result.total_credits);

      if (variance < 1) { // Tolerance of 1 cent
        return {
          check_name: CHECK_TRIAL_BALANCE,
          status: 'PASS',
          message: `Books are balanced. Debits = Credits = ${result.total_debits} cents`,
        };
      }

      return {
        check_name: CHECK_TRIAL_BALANCE,
        status: 'FAIL',
        message: 'Trial Balance is OUT OF BALANCE!',
        variance,
        details: {
          total_debits: result.total_debits,
          total_credits: result.total_credits,
          variance,
        },
      };
    } catch (error: unknown) {
      return {
        check_name: CHECK_TRIAL_BALANCE,
        status: 'FAIL',
        message: `Error during check: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Check 3: Detect orphaned transactions (no student linkage)
   */
  private async checkOrphanedTransactions(): Promise<ReconciliationResult> {
    try {
      const orphaned = this.db.prepare(`
        SELECT COUNT(*) as count, SUM(amount) as total_amount
        FROM ledger_transaction
        WHERE transaction_type = 'FEE_PAYMENT'
          AND student_id IS NULL
      `).get() as { count: number; total_amount: number | null } | undefined;

      if (!orphaned || orphaned.count === 0) {
        return {
          check_name: CHECK_ORPHANED_TRANSACTIONS,
          status: 'PASS',
          message: 'No orphaned transactions found.',
        };
      }

      return {
        check_name: CHECK_ORPHANED_TRANSACTIONS,
        status: orphaned.count > 10 ? 'FAIL' : 'WARNING',
        message: `Found ${orphaned.count} transactions without student linkage.`,
        details: {
          count: orphaned.count,
          total_amount: (orphaned.total_amount || 0),
        },
      };
    } catch (error: unknown) {
      return {
        check_name: CHECK_ORPHANED_TRANSACTIONS,
        status: 'FAIL',
        message: `Error during check: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Check 4: Verify invoice payment totals
   */
  private async checkInvoicePayments(): Promise<ReconciliationResult> {
    try {
      const discrepancies = this.db.prepare(`
        SELECT fi.id, fi.invoice_number, fi.total_amount, fi.amount_paid,
               COALESCE(SUM(lt.amount), 0) as calculated_payments
        FROM fee_invoice fi
        LEFT JOIN ledger_transaction lt
          ON lt.invoice_id = fi.id
         AND lt.transaction_type = 'FEE_PAYMENT'
         AND COALESCE(lt.is_voided, 0) = 0
        GROUP BY fi.id, fi.invoice_number, fi.total_amount, fi.amount_paid
        HAVING ABS(fi.amount_paid - COALESCE(SUM(lt.amount), 0)) > 1
      `).all() as Array<{
        id: number;
        invoice_number: string;
        total_amount: number;
        amount_paid: number;
        calculated_payments: number;
      }>;

      if (discrepancies.length === 0) {
        return {
          check_name: CHECK_INVOICE_PAYMENTS,
          status: 'PASS',
          message: 'All invoice payment totals match transactions.',
        };
      }

      return {
        check_name: CHECK_INVOICE_PAYMENTS,
        status: 'FAIL',
        message: `${discrepancies.length} invoices have payment mismatches.`,
        details: discrepancies.map(d => ({
          invoice_number: d.invoice_number,
          recorded_paid: d.amount_paid,
          calculated_paid: d.calculated_payments,
          variance: (d.amount_paid - d.calculated_payments),
        })),
      };
    } catch (error: unknown) {
      return {
        check_name: CHECK_INVOICE_PAYMENTS,
        status: 'FAIL',
        message: `Error during check: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Check 4b: Detect invoice settlement drift between amount_paid and source movements.
   * Source movements = allocated FEE_PAYMENTs + CREDIT_APPLIED rows.
   */
  private async checkInvoiceSettlementDrift(): Promise<ReconciliationResult> {
    try {
      const hasAllocationTable = Boolean(this.db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name = 'payment_invoice_allocation'
      `).get() as { name: string } | undefined);

      const paymentAppliedSql = hasAllocationTable
        ? `
          COALESCE((
            SELECT SUM(pia.applied_amount)
            FROM payment_invoice_allocation pia
            JOIN ledger_transaction lt ON lt.id = pia.transaction_id
            WHERE pia.invoice_id = fi.id
              AND lt.transaction_type = 'FEE_PAYMENT'
              AND COALESCE(lt.is_voided, 0) = 0
          ), 0)
        `
        : `
          COALESCE((
            SELECT SUM(lt.amount)
            FROM ledger_transaction lt
            WHERE lt.invoice_id = fi.id
              AND lt.transaction_type = 'FEE_PAYMENT'
              AND COALESCE(lt.is_voided, 0) = 0
          ), 0)
        `;

      const rows = this.db.prepare(`
        SELECT
          fi.id,
          fi.invoice_number,
          fi.amount_paid,
          ${paymentAppliedSql} as payments_applied,
          COALESCE((
            SELECT SUM(ct.amount)
            FROM credit_transaction ct
            WHERE ct.reference_invoice_id = fi.id
              AND ct.transaction_type = 'CREDIT_APPLIED'
          ), 0) as credits_applied
        FROM fee_invoice fi
      `).all() as Array<{
        id: number;
        invoice_number: string;
        amount_paid: number;
        payments_applied: number;
        credits_applied: number;
      }>;

      const mismatches = rows
        .map(row => {
          const calculated = row.payments_applied + row.credits_applied;
          return {
            ...row,
            calculated_amount_paid: calculated,
            variance: row.amount_paid - calculated,
          };
        })
        .filter(row => Math.abs(row.variance) > 1);

      if (mismatches.length === 0) {
        return {
          check_name: CHECK_SETTLEMENT_DRIFT,
          status: 'PASS',
          message: 'No settlement drift between invoice amount_paid and payment/credit sources.',
        };
      }

      return {
        check_name: CHECK_SETTLEMENT_DRIFT,
        status: 'FAIL',
        message: `${mismatches.length} invoices show settlement drift.`,
        variance: mismatches.reduce((sum, row) => sum + Math.abs(row.variance), 0),
        details: mismatches.map(row => ({
          invoice_number: row.invoice_number,
          recorded_amount_paid: row.amount_paid,
          calculated_amount_paid: row.calculated_amount_paid,
          payments_applied: row.payments_applied,
          credits_applied: row.credits_applied,
          variance: row.variance,
        })),
      };
    } catch (error) {
      return {
        check_name: CHECK_SETTLEMENT_DRIFT,
        status: 'FAIL',
        message: `Error during check: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Check 5: Detect abnormal GL account balances
   */
  private async checkAbnormalBalances(): Promise<ReconciliationResult> {
    try {
      const abnormal: { type: string; account: string; balance: number }[] = [];

      // Check for negative asset balances (should be debits)
      const negativeAssets = this.db.prepare(`
        SELECT ga.account_code, ga.account_name, 
               COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) as balance
        FROM gl_account ga
        LEFT JOIN journal_entry_line jel ON jel.gl_account_id = ga.id
        LEFT JOIN journal_entry je ON jel.journal_entry_id = je.id AND je.is_posted = 1 AND je.is_voided = 0
        WHERE ga.account_type = 'ASSET' AND ga.is_active = 1
        GROUP BY ga.account_code, ga.account_name
        HAVING SUM(jel.debit_amount - jel.credit_amount) < -100
      `).all() as Array<{ account_code: string; account_name: string; balance: number }>;

      if (negativeAssets.length > 0) {
        abnormal.push(...negativeAssets.map(a => ({
          type: 'Negative Asset',
          account: `${a.account_code} - ${a.account_name}`,
          balance: a.balance,
        })));
      }

      // Check for negative liability balances (should be credits)
      const negativeLiabilities = this.db.prepare(`
        SELECT ga.account_code, ga.account_name,
               COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0) as balance
        FROM gl_account ga
        LEFT JOIN journal_entry_line jel ON jel.gl_account_id = ga.id
        LEFT JOIN journal_entry je ON jel.journal_entry_id = je.id AND je.is_posted = 1 AND je.is_voided = 0
        WHERE ga.account_type = 'LIABILITY' AND ga.is_active = 1
        GROUP BY ga.account_code, ga.account_name
        HAVING SUM(jel.credit_amount - jel.debit_amount) < -100
      `).all() as Array<{ account_code: string; account_name: string; balance: number }>;

      if (negativeLiabilities.length > 0) {
        abnormal.push(...negativeLiabilities.map(a => ({
          type: 'Negative Liability',
          account: `${a.account_code} - ${a.account_name}`,
          balance: a.balance,
        })));
      }

      if (abnormal.length === 0) {
        return {
          check_name: CHECK_ABNORMAL_BALANCES,
          status: 'PASS',
          message: 'No abnormal GL account balances detected.',
        };
      }

      return {
        check_name: CHECK_ABNORMAL_BALANCES,
        status: 'WARNING',
        message: `Found ${abnormal.length} GL accounts with unexpected negative balances.`,
        details: abnormal,
      };
    } catch (error: unknown) {
      return {
        check_name: CHECK_ABNORMAL_BALANCES,
        status: 'FAIL',
        message: `Error during check: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Check 6: Verify legacy transactions are linked to journal entries
   */
  private async checkLedgerLinkage(): Promise<ReconciliationResult> {
    try {
      const unlinked = this.db.prepare(`
        SELECT COUNT(*) as count
        FROM ledger_transaction lt
        WHERE lt.created_at > ?
          AND lt.transaction_type = 'FEE_PAYMENT'
          AND COALESCE(lt.is_voided, 0) = 0
          AND NOT EXISTS (
            SELECT 1
            FROM journal_entry je
            WHERE je.source_ledger_txn_id = lt.id
          )
      `).get(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) as { count: number } | undefined;

      if (!unlinked || unlinked.count === 0) {
        return {
          check_name: CHECK_LEDGER_LINKAGE,
          status: 'PASS',
          message: 'All recent legacy transactions are linked to journal entries.',
        };
      }

      return {
        check_name: CHECK_LEDGER_LINKAGE,
        status: 'WARNING',
        message: `${unlinked.count} recent transactions not linked to journal entries.`,
        details: {
          count: unlinked.count,
          note: 'This may be normal if PaymentIntegrationService is not yet active.',
        },
      };
    } catch {
      // If journal_entry_id column doesn't exist yet, this is expected
      return {
        check_name: CHECK_LEDGER_LINKAGE,
        status: 'WARNING',
        message: 'Legacy-to-Journal linkage not yet implemented.',
      };
    }
  }

  /**
   * Log reconciliation results to database
   */
  private async logReconciliation(report: ReconciliationReport, userId: number): Promise<void> {
    try {
      const trial = this.db.prepare(`
        SELECT
          COALESCE(SUM(jel.debit_amount), 0) as total_debits,
          COALESCE(SUM(jel.credit_amount), 0) as total_credits
        FROM journal_entry je
        JOIN journal_entry_line jel ON je.id = jel.journal_entry_id
        WHERE je.is_posted = 1 AND je.is_voided = 0
      `).get() as { total_debits: number; total_credits: number } | undefined;

      const glAccountRow = this.db.prepare(`
        SELECT id FROM gl_account
        WHERE account_code = '1100' AND is_active = 1
        LIMIT 1
      `).get() as { id: number } | undefined;
      const fallbackGlAccountRow = glAccountRow ?? this.db.prepare(`SELECT id FROM gl_account ORDER BY id LIMIT 1`).get() as { id: number } | undefined;
      if (!fallbackGlAccountRow) {
        throw new Error('Cannot persist reconciliation log: no GL account found');
      }

      const totalDebits = trial?.total_debits || 0;
      const totalCredits = trial?.total_credits || 0;
      const variance = totalDebits - totalCredits;
      const isBalanced = Math.abs(variance) <= 1 ? 1 : 0;

      this.db.prepare(`
        INSERT INTO ledger_reconciliation (
          reconciliation_date, gl_account_id, opening_balance, total_debits, total_credits,
          closing_balance, calculated_balance, variance, is_balanced, reconciled_by_user_id, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        report.run_date,
        fallbackGlAccountRow.id,
        0,
        totalDebits,
        totalCredits,
        totalDebits,
        totalCredits,
        variance,
        isBalanced,
        userId,
        JSON.stringify({
          overall_status: report.overall_status,
          summary: report.summary,
          checks: report.checks
        })
      );

      logAudit(userId, 'CREATE', 'ledger_reconciliation', 0, null, {
        status: report.overall_status,
        checks: report.summary.total_checks,
      });
    } catch (error: unknown) {
      console.error('Failed to log reconciliation:', error);
    }
  }

  /**
   * Get recent reconciliation history
   */
  async getReconciliationHistory(limit: number = 30): Promise<ReconciliationReport[]> {
    try {
      const rows = this.db.prepare(`
        SELECT reconciliation_date, variance, is_balanced, notes
        FROM ledger_reconciliation
        ORDER BY reconciliation_date DESC
        LIMIT ?
      `).all(limit) as Array<{
        reconciliation_date: string;
        variance: number;
        is_balanced: number;
        notes: string | null;
      }>;

      return rows.map(row => ({
        run_date: row.reconciliation_date,
        overall_status: row.is_balanced ? 'PASS' : 'FAIL',
        checks: row.notes ? JSON.parse(row.notes).checks ?? [] : [],
        summary: row.notes ? JSON.parse(row.notes).summary ?? { total_checks: 0, passed: 0, failed: 0, warnings: 0 } : { total_checks: 0, passed: 0, failed: 0, warnings: 0 },
      }));
    } catch (error: unknown) {
      console.error('Failed to fetch reconciliation history:', error);
      return [];
    }
  }

  /**
   * Get summary of latest reconciliation
   */
  async getLatestReconciliationSummary(): Promise<ReconciliationReport | null> {
    const history = await this.getReconciliationHistory(1);
    return history.length > 0 ? history[0] : null;
  }
}

