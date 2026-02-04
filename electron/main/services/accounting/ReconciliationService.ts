import { getDatabase } from '../../database/index';
import { logAudit } from '../../database/utils/audit';

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
  status: 'PASS' | 'FAIL' | 'WARNING';
  message: string;
  variance?: number;
  details?: any;
}

export interface ReconciliationReport {
  run_date: string;
  overall_status: 'PASS' | 'FAIL' | 'WARNING';
  checks: ReconciliationResult[];
  summary: {
    total_checks: number;
    passed: number;
    failed: number;
    warnings: number;
  };
}

export class ReconciliationService {
  private db = getDatabase();

  /**
   * Run all reconciliation checks
   */
  async runAllChecks(userId: number): Promise<ReconciliationReport> {
    const checks: ReconciliationResult[] = [];

    // Run all checks
    checks.push(await this.checkStudentCreditBalances());
    checks.push(await this.checkTrialBalance());
    checks.push(await this.checkOrphanedTransactions());
    checks.push(await this.checkInvoicePayments());
    checks.push(await this.checkAbnormalBalances());
    checks.push(await this.checkLedgerLinkage());

    // Calculate summary
    const summary = {
      total_checks: checks.length,
      passed: checks.filter(c => c.status === 'PASS').length,
      failed: checks.filter(c => c.status === 'FAIL').length,
      warnings: checks.filter(c => c.status === 'WARNING').length,
    };

    const overall_status = 
      summary.failed > 0 ? 'FAIL' :
      summary.warnings > 0 ? 'WARNING' :
      'PASS';

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
        SELECT s.id, s.admission_number, s.student_credit_balance,
               COALESCE(SUM(CASE WHEN lt.debit_credit = 'CREDIT' THEN lt.amount ELSE -lt.amount END), 0) as calculated_balance
        FROM student s
        LEFT JOIN ledger_transaction lt ON lt.student_id = s.id
        WHERE s.is_active = 1
        GROUP BY s.id, s.admission_number, s.student_credit_balance
      `).all() as Array<{
        id: number;
        admission_number: string;
        student_credit_balance: number;
        calculated_balance: number;
      }>;

      const discrepancies = students.filter(s => 
        Math.abs(s.student_credit_balance - s.calculated_balance) > 1 // Tolerance of 1 cent
      );

      if (discrepancies.length === 0) {
        return {
          check_name: 'Student Credit Balance Verification',
          status: 'PASS',
          message: `All ${students.length} student balances match ledger transactions.`,
        };
      }

      const totalVariance = discrepancies.reduce((sum, d) => 
        sum + Math.abs(d.student_credit_balance - d.calculated_balance), 0
      );

      return {
        check_name: 'Student Credit Balance Verification',
        status: 'FAIL',
        message: `${discrepancies.length} students have balance discrepancies.`,
        variance: totalVariance,
        details: discrepancies.map(d => ({
          admission_number: d.admission_number,
          recorded_balance: d.student_credit_balance / 100,
          calculated_balance: d.calculated_balance / 100,
          variance: (d.student_credit_balance - d.calculated_balance) / 100,
        })),
      };
    } catch (error: unknown) {
      return {
        check_name: 'Student Credit Balance Verification',
        status: 'FAIL',
        message: `Error during check: ${error.message}`,
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
        WHERE je.status = 'POSTED'
      `).get() as { total_debits: number; total_credits: number } | undefined;

      if (!result) {
        return {
          check_name: 'Trial Balance Verification',
          status: 'WARNING',
          message: 'No posted journal entries found.',
        };
      }

      const variance = Math.abs(result.total_debits - result.total_credits);

      if (variance < 1) { // Tolerance of 1 cent
        return {
          check_name: 'Trial Balance Verification',
          status: 'PASS',
          message: `Books are balanced. Debits = Credits = Kes ${(result.total_debits / 100).toFixed(2)}`,
        };
      }

      return {
        check_name: 'Trial Balance Verification',
        status: 'FAIL',
        message: 'Trial Balance is OUT OF BALANCE!',
        variance,
        details: {
          total_debits: result.total_debits / 100,
          total_credits: result.total_credits / 100,
          variance: variance / 100,
        },
      };
    } catch (error: unknown) {
      return {
        check_name: 'Trial Balance Verification',
        status: 'FAIL',
        message: `Error during check: ${error.message}`,
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
        WHERE transaction_type IN ('FEE_PAYMENT', 'FEE_INVOICE')
          AND student_id IS NULL
      `).get() as { count: number; total_amount: number | null } | undefined;

      if (!orphaned || orphaned.count === 0) {
        return {
          check_name: 'Orphaned Transactions Check',
          status: 'PASS',
          message: 'No orphaned transactions found.',
        };
      }

      return {
        check_name: 'Orphaned Transactions Check',
        status: orphaned.count > 10 ? 'FAIL' : 'WARNING',
        message: `Found ${orphaned.count} transactions without student linkage.`,
        details: {
          count: orphaned.count,
          total_amount: (orphaned.total_amount || 0) / 100,
        },
      };
    } catch (error: unknown) {
      return {
        check_name: 'Orphaned Transactions Check',
        status: 'FAIL',
        message: `Error during check: ${error.message}`,
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
        LEFT JOIN ledger_transaction lt ON lt.invoice_id = fi.id AND lt.transaction_type = 'FEE_PAYMENT'
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
          check_name: 'Invoice Payment Verification',
          status: 'PASS',
          message: 'All invoice payment totals match transactions.',
        };
      }

      return {
        check_name: 'Invoice Payment Verification',
        status: 'FAIL',
        message: `${discrepancies.length} invoices have payment mismatches.`,
        details: discrepancies.map(d => ({
          invoice_number: d.invoice_number,
          recorded_paid: d.amount_paid / 100,
          calculated_paid: d.calculated_payments / 100,
          variance: (d.amount_paid - d.calculated_payments) / 100,
        })),
      };
    } catch (error: unknown) {
      return {
        check_name: 'Invoice Payment Verification',
        status: 'FAIL',
        message: `Error during check: ${error.message}`,
      };
    }
  }

  /**
   * Check 5: Detect abnormal GL account balances
   */
  private async checkAbnormalBalances(): Promise<ReconciliationResult> {
    try {
      const abnormal: any[] = [];

      // Check for negative asset balances (should be debits)
      const negativeAssets = this.db.prepare(`
        SELECT ga.account_code, ga.account_name, 
               COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) as balance
        FROM gl_account ga
        LEFT JOIN journal_entry_line jel ON jel.gl_account_code = ga.account_code
        WHERE ga.account_type = 'ASSET' AND ga.is_active = 1
        GROUP BY ga.account_code, ga.account_name
        HAVING SUM(jel.debit_amount - jel.credit_amount) < -100
      `).all() as Array<{ account_code: string; account_name: string; balance: number }>;

      if (negativeAssets.length > 0) {
        abnormal.push(...negativeAssets.map(a => ({
          type: 'Negative Asset',
          account: `${a.account_code} - ${a.account_name}`,
          balance: a.balance / 100,
        })));
      }

      // Check for negative liability balances (should be credits)
      const negativeLiabilities = this.db.prepare(`
        SELECT ga.account_code, ga.account_name,
               COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0) as balance
        FROM gl_account ga
        LEFT JOIN journal_entry_line jel ON jel.gl_account_code = ga.account_code
        WHERE ga.account_type = 'LIABILITY' AND ga.is_active = 1
        GROUP BY ga.account_code, ga.account_name
        HAVING SUM(jel.credit_amount - jel.debit_amount) < -100
      `).all() as Array<{ account_code: string; account_name: string; balance: number }>;

      if (negativeLiabilities.length > 0) {
        abnormal.push(...negativeLiabilities.map(a => ({
          type: 'Negative Liability',
          account: `${a.account_code} - ${a.account_name}`,
          balance: a.balance / 100,
        })));
      }

      if (abnormal.length === 0) {
        return {
          check_name: 'Abnormal Balance Detection',
          status: 'PASS',
          message: 'No abnormal GL account balances detected.',
        };
      }

      return {
        check_name: 'Abnormal Balance Detection',
        status: 'WARNING',
        message: `Found ${abnormal.length} GL accounts with unexpected negative balances.`,
        details: abnormal,
      };
    } catch (error: unknown) {
      return {
        check_name: 'Abnormal Balance Detection',
        status: 'FAIL',
        message: `Error during check: ${error.message}`,
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
          AND lt.journal_entry_id IS NULL
      `).get(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) as { count: number } | undefined;

      if (!unlinked || unlinked.count === 0) {
        return {
          check_name: 'Ledger-Journal Linkage Check',
          status: 'PASS',
          message: 'All recent legacy transactions are linked to journal entries.',
        };
      }

      return {
        check_name: 'Ledger-Journal Linkage Check',
        status: 'WARNING',
        message: `${unlinked.count} recent transactions not linked to journal entries.`,
        details: {
          count: unlinked.count,
          note: 'This may be normal if PaymentIntegrationService is not yet active.',
        },
      };
    } catch (error: unknown) {
      // If journal_entry_id column doesn't exist yet, this is expected
      return {
        check_name: 'Ledger-Journal Linkage Check',
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
      const stmt = this.db.prepare(`
        INSERT INTO ledger_reconciliation (
          reconciliation_date, overall_status, total_checks, passed_checks,
          failed_checks, warning_checks, details_json, performed_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        report.run_date,
        report.overall_status,
        report.summary.total_checks,
        report.summary.passed,
        report.summary.failed,
        report.summary.warnings,
        JSON.stringify(report.checks),
        userId
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
        SELECT reconciliation_date, overall_status, total_checks,
               passed_checks, failed_checks, warning_checks, details_json
        FROM ledger_reconciliation
        ORDER BY reconciliation_date DESC
        LIMIT ?
      `).all(limit) as Array<{
        reconciliation_date: string;
        overall_status: 'PASS' | 'FAIL' | 'WARNING';
        total_checks: number;
        passed_checks: number;
        failed_checks: number;
        warning_checks: number;
        details_json: string;
      }>;

      return rows.map(row => ({
        run_date: row.reconciliation_date,
        overall_status: row.overall_status,
        checks: JSON.parse(row.details_json),
        summary: {
          total_checks: row.total_checks,
          passed: row.passed_checks,
          failed: row.failed_checks,
          warnings: row.warning_checks,
        },
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

