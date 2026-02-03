/**
 * Payroll Integration Service
 * 
 * Bridges the legacy payroll system with the new double-entry accounting system.
 * Automatically posts payroll to General Ledger after approval.
 * 
 * Workflow:
 * 1. Payroll runs and creates payroll records (existing system)
 * 2. After approval, posts to GL via PayrollJournalService
 * 3. Links payroll records to journal entries
 * 4. Tracks payment status in both systems
 */

import { getDatabase } from '../../database/index';
import { PayrollJournalService } from './PayrollJournalService';
import { logAudit } from '../../database/utils/audit';

export interface PayrollIntegrationResult {
  success: boolean;
  message?: string;
  journalEntryIds?: {
    salaryExpenseEntryId?: number;
    deductionEntryId?: number;
    paymentEntryId?: number;
  };
}

export class PayrollIntegrationService {
  private db = getDatabase();
  private payrollJournalService: PayrollJournalService;

  constructor() {
    this.payrollJournalService = new PayrollJournalService();
  }

  /**
   * Posts approved payroll to General Ledger
   * Call this after payroll period is approved
   */
  async postApprovedPayrollToGL(
    periodId: number,
    userId: number
  ): Promise<PayrollIntegrationResult> {
    return this.db.transaction(() => {
      try {
        // Check if payroll period is approved
        const period = this.db
          .prepare('SELECT * FROM payroll_period WHERE id = ?')
          .get(periodId) as any;

        if (!period) {
          return { success: false, message: 'Payroll period not found' };
        }

        if (period.status !== 'APPROVED') {
          return {
            success: false,
            message: 'Payroll must be approved before posting to GL',
          };
        }

        // Check if already posted to GL
        const existingPosting = this.db
          .prepare('SELECT * FROM payroll WHERE period_id = ? AND gl_posted = 1 LIMIT 1')
          .get(periodId) as any;

        if (existingPosting) {
          return {
            success: false,
            message: 'Payroll already posted to General Ledger',
          };
        }

        // Post to GL using PayrollJournalService
        const journalResult = this.payrollJournalService.postPayrollToGL(
          periodId,
          userId
        );

        if (!journalResult.success) {
          return {
            success: false,
            message: journalResult.message || 'Failed to post to GL',
          };
        }

        // Mark payroll records as posted to GL
        this.db
          .prepare('UPDATE payroll SET gl_posted = 1, gl_posted_date = CURRENT_TIMESTAMP WHERE period_id = ?')
          .run(periodId);

        // Update period status
        this.db
          .prepare(
            'UPDATE payroll_period SET status = \'POSTED\', gl_posted = 1 WHERE id = ?'
          )
          .run(periodId);

        logAudit(userId, 'UPDATE', 'payroll_period', periodId, null, {
          action: 'POSTED_TO_GL',
          journalEntries: journalResult.journalEntryIds,
        });

        return {
          success: true,
          journalEntryIds: journalResult.journalEntryIds,
        };
      } catch (error) {
        console.error('Payroll GL posting error:', error);
        throw error;
      }
    })();
  }

  /**
   * Records salary payment in both systems
   */
  async recordSalaryPayment(
    periodId: number,
    userId: number
  ): Promise<PayrollIntegrationResult> {
    return this.db.transaction(() => {
      try {
        // Check if payroll is posted to GL
        const period = this.db
          .prepare('SELECT * FROM payroll_period WHERE id = ?')
          .get(periodId) as any;

        if (!period || !period.gl_posted) {
          return {
            success: false,
            message: 'Payroll must be posted to GL before recording payment',
          };
        }

        // Check if payment already recorded
        if (period.status === 'PAID') {
          return {
            success: false,
            message: 'Salary payment already recorded',
          };
        }

        // Record payment in GL
        const paymentResult = this.payrollJournalService.postSalaryPayment(
          periodId,
          userId
        );

        if (!paymentResult.success) {
          return {
            success: false,
            message: paymentResult.message || 'Failed to record payment',
          };
        }

        // Update payroll records
        this.db
          .prepare('UPDATE payroll SET payment_status = \'PAID\', payment_date = CURRENT_DATE WHERE period_id = ?')
          .run(periodId);

        // Update period
        this.db
          .prepare('UPDATE payroll_period SET status = \'PAID\' WHERE id = ?')
          .run(periodId);

        logAudit(userId, 'UPDATE', 'payroll_period', periodId, null, {
          action: 'SALARY_PAYMENT_RECORDED',
          journalEntryId: paymentResult.journalEntryId,
        });

        return {
          success: true,
          journalEntryIds: {
            paymentEntryId: paymentResult.journalEntryId,
          },
        };
      } catch (error) {
        console.error('Salary payment recording error:', error);
        throw error;
      }
    })();
  }

  /**
   * Records statutory payment (PAYE, NSSF, NHIF, Housing Levy) to government
   */
  async recordStatutoryPayment(
    periodId: number,
    deductionType: 'PAYE' | 'NSSF' | 'NHIF' | 'HOUSING_LEVY',
    userId: number
  ): Promise<PayrollIntegrationResult> {
    return this.db.transaction(() => {
      try {
        // Verify payroll is paid
        const period = this.db
          .prepare('SELECT * FROM payroll_period WHERE id = ?')
          .get(periodId) as any;

        if (!period || period.status !== 'PAID') {
          return {
            success: false,
            message: 'Payroll must be paid before recording statutory payments',
          };
        }

        // Record statutory payment
        const result = this.payrollJournalService.postStatutoryPayment(
          periodId,
          deductionType,
          userId
        );

        if (!result.success) {
          return result;
        }

        // Log the payment
        logAudit(userId, 'CREATE', 'journal_entry', result.journalEntryId!, null, {
          action: 'STATUTORY_PAYMENT',
          deductionType,
          periodId,
        });

        return {
          success: true,
          journalEntryIds: {
            paymentEntryId: result.journalEntryId,
          },
        };
      } catch (error) {
        console.error('Statutory payment error:', error);
        throw error;
      }
    })();
  }

  /**
   * Gets payroll summary with GL integration status
   */
  getPayrollSummaryWithGLStatus(periodId: number): any {
    const period = this.db
      .prepare('SELECT * FROM payroll_period WHERE id = ?')
      .get(periodId) as any;

    if (!period) {
      return null;
    }

    const payrollRecords = this.db
      .prepare(`
        SELECT 
          p.*,
          s.first_name,
          s.last_name,
          s.employee_number
        FROM payroll p
        JOIN staff s ON p.staff_id = s.id
        WHERE p.period_id = ?
      `)
      .all(periodId) as any[];

    // Get related journal entries
    const journalEntries = this.db
      .prepare(`
        SELECT 
          je.id,
          je.entry_number,
          je.entry_type,
          je.status,
          je.transaction_date,
          SUM(CASE WHEN jel.debit > 0 THEN jel.debit ELSE 0 END) as total_debit,
          SUM(CASE WHEN jel.credit > 0 THEN jel.credit ELSE 0 END) as total_credit
        FROM journal_entry je
        JOIN journal_entry_line jel ON je.id = jel.journal_entry_id
        WHERE je.reference_type = 'PAYROLL' 
          AND je.reference_id = ?
        GROUP BY je.id
        ORDER BY je.created_at
      `)
      .all(periodId) as any[];

    return {
      period: {
        ...period,
        isPostedToGL: period.gl_posted === 1,
        isPaid: period.status === 'PAID',
      },
      payrollRecords: payrollRecords.map((p) => ({
        ...p,
        basic_salary: p.basic_salary / 100,
        gross_salary: p.gross_salary / 100,
        total_deductions: p.total_deductions / 100,
        net_salary: p.net_salary / 100,
        glPosted: p.gl_posted === 1,
      })),
      journalEntries: journalEntries.map((je) => ({
        ...je,
        total_debit: je.total_debit / 100,
        total_credit: je.total_credit / 100,
      })),
      stats: {
        totalStaff: payrollRecords.length,
        totalGrossSalary: payrollRecords.reduce((sum, p) => sum + p.gross_salary, 0) / 100,
        totalNetSalary: payrollRecords.reduce((sum, p) => sum + p.net_salary, 0) / 100,
        totalDeductions:
          payrollRecords.reduce((sum, p) => sum + p.total_deductions, 0) / 100,
        journalEntriesCount: journalEntries.length,
      },
    };
  }

  /**
   * Ensures payroll tables have GL integration columns
   * (Migration helper - can be removed once schema is updated)
   */
  ensureGLColumns(): void {
    try {
      // Add gl_posted column to payroll if not exists
      this.db.exec(`
        ALTER TABLE payroll ADD COLUMN gl_posted INTEGER DEFAULT 0;
      `);
    } catch (e) {
      // Column already exists
    }

    try {
      this.db.exec(`
        ALTER TABLE payroll ADD COLUMN gl_posted_date TEXT;
      `);
    } catch (e) {
      // Column already exists
    }

    try {
      this.db.exec(`
        ALTER TABLE payroll ADD COLUMN payment_status TEXT DEFAULT 'PENDING';
      `);
    } catch (e) {
      // Column already exists
    }

    try {
      this.db.exec(`
        ALTER TABLE payroll ADD COLUMN payment_date TEXT;
      `);
    } catch (e) {
      // Column already exists
    }

    try {
      this.db.exec(`
        ALTER TABLE payroll_period ADD COLUMN gl_posted INTEGER DEFAULT 0;
      `);
    } catch (e) {
      // Column already exists
    }
  }
}
