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

import { PayrollJournalService, type PayrollPeriod } from './PayrollJournalService';
import { getDatabase } from '../../database';
import { logAudit } from '../../database/utils/audit';

const SELECT_PAYROLL_PERIOD_BY_ID = 'SELECT * FROM payroll_period WHERE id = ?';

export interface PayrollRecordWithStaff {
  id: number;
  period_id: number;
  staff_id: number;
  basic_salary: number;
  gross_salary: number;
  net_salary: number;
  total_deductions: number;
  payment_status: string;
  payment_date: string;
  gl_posted: number;
  gl_posted_date: string;
  first_name: string;
  last_name: string;
  employee_number: string;
}

export interface JournalEntrySummary {
  id: number;
  entry_number: string;
  entry_type: string;
  status: string;
  transaction_date: string;
  total_debit: number;
  total_credit: number;
}

export interface PayrollIntegrationResult {
  success: boolean;
  message?: string;
  journalEntryIds?: {
    salaryExpenseEntryId?: number;
    deductionEntryId?: number;
    paymentEntryId?: number;
  };
}

export interface PayrollSummaryResult {
  period: PayrollPeriod & {
    isPostedToGL: boolean;
    isPaid: boolean;
  };
  payrollRecords: (Omit<PayrollRecordWithStaff, 'basic_salary' | 'gross_salary' | 'total_deductions' | 'net_salary' | 'gl_posted'> & {
    basic_salary: number;
    gross_salary: number;
    total_deductions: number;
    net_salary: number;
    glPosted: boolean;
  })[];
  journalEntries: (Omit<JournalEntrySummary, 'total_debit' | 'total_credit'> & {
    total_debit: number;
    total_credit: number;
  })[];
  stats: {
    totalStaff: number;
    totalGrossSalary: number;
    totalNetSalary: number;
    totalDeductions: number;
    journalEntriesCount: number;
  };
}

export class PayrollIntegrationService {
  private readonly db = getDatabase();
  private readonly payrollJournalService: PayrollJournalService;

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
    try {
      // Check if payroll period is approved
      const period = this.db
        .prepare(SELECT_PAYROLL_PERIOD_BY_ID)
        .get(periodId) as PayrollPeriod | undefined;

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
        .get(periodId) as PayrollRecordWithStaff | undefined;

      if (existingPosting) {
        return {
          success: false,
          message: 'Payroll already posted to General Ledger',
        };
      }

      // Post to GL using PayrollJournalService
      const journalResult = await this.payrollJournalService.postPayrollToGL(
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
        journalEntries: journalResult.journal_entry_ids,
      });

      return {
        success: true,
        journalEntryIds: {
          salaryExpenseEntryId: journalResult.journal_entry_ids?.[0],
          deductionEntryId: journalResult.journal_entry_ids?.[1]
        },
      };
    } catch (error) {
      console.error('Payroll GL posting error:', error);
      throw error;
    }
  }

  /**
   * Records salary payment in both systems
   */
  async recordSalaryPayment(
    periodId: number,
    userId: number
  ): Promise<PayrollIntegrationResult> {
    try {
      // Check if payroll is posted to GL
      const period = this.db
        .prepare(SELECT_PAYROLL_PERIOD_BY_ID)
        .get(periodId) as PayrollPeriod | undefined;

      if (!period?.gl_posted) {
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
      const paymentResult = await this.payrollJournalService.postSalaryPayment(
        periodId,
        '1020', // Default bank account
        new Date().toISOString().split('T')[0],
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

      const entryId = paymentResult.journal_entry_ids?.[0];

      logAudit(userId, 'UPDATE', 'payroll_period', periodId, null, {
        action: 'SALARY_PAYMENT_RECORDED',
        journalEntryId: entryId,
      });

      return {
        success: true,
        journalEntryIds: {
          paymentEntryId: entryId,
        },
      };
    } catch (error) {
      console.error('Salary payment recording error:', error);
      throw error;
    }
  }

  /**
   * Records statutory payment (PAYE, NSSF, NHIF, Housing Levy) to government
   */
  async recordStatutoryPayment(
    periodId: number,
    deductionType: 'PAYE' | 'NSSF' | 'NHIF' | 'HOUSING_LEVY',
    userId: number
  ): Promise<PayrollIntegrationResult> {
    try {
      // Verify payroll is paid
      const period = this.db
        .prepare(SELECT_PAYROLL_PERIOD_BY_ID)
        .get(periodId) as PayrollPeriod | undefined;

      if (period?.status !== 'PAID') {
        return {
          success: false,
          message: 'Payroll must be paid before recording statutory payments',
        };
      }

      // Calculate amount for this deduction type
      const deductionQuery = this.db.prepare(`
        SELECT SUM(pd.amount) as total_amount
        FROM payroll_deduction pd
        JOIN payroll p ON pd.payroll_id = p.id
        WHERE p.period_id = ? AND pd.deduction_name LIKE ?
      `).get(periodId, `%${deductionType}%`) as { total_amount: number } | undefined;
      
      const amount = deductionQuery?.total_amount || 0;

      // Record statutory payment
      const result = await this.payrollJournalService.postStatutoryPayment(
        deductionType,
        amount,
        new Date().toISOString().split('T')[0],
        '1020', // Default bank account
        `STAT-${periodId}-${deductionType}`,
        userId
      );

      if (!result.success) {
        return {
            success: false,
            message: result.message
        };
      }

      const entryId = result.journal_entry_ids?.[0];

      // Log the payment
      logAudit(userId, 'CREATE', 'journal_entry', entryId!, null, {
        action: 'STATUTORY_PAYMENT',
        deductionType,
        periodId,
      });

      return {
        success: true,
        journalEntryIds: {
          paymentEntryId: entryId,
        },
      };
    } catch (error) {
      console.error('Statutory payment error:', error);
      throw error;
    }
  }

  /**
   * Gets payroll summary with GL integration status
   */
  getPayrollSummaryWithGLStatus(periodId: number): PayrollSummaryResult | null {
    const period = this.db
      .prepare(SELECT_PAYROLL_PERIOD_BY_ID)
      .get(periodId) as PayrollPeriod | undefined;

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
      .all(periodId) as PayrollRecordWithStaff[];

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
      .all(periodId) as JournalEntrySummary[];

    return {
      period: {
        ...period,
        isPostedToGL: period.gl_posted === 1,
        isPaid: period.status === 'PAID',
      },
      payrollRecords: payrollRecords.map((p) => ({
        ...p,
        basic_salary: p.basic_salary,
        gross_salary: p.gross_salary,
        total_deductions: p.total_deductions,
        net_salary: p.net_salary,
        glPosted: p.gl_posted === 1,
      })),
      journalEntries: journalEntries.map((je) => ({
        ...je,
        total_debit: je.total_debit,
        total_credit: je.total_credit,
      })),
      stats: {
        totalStaff: payrollRecords.length,
        totalGrossSalary: payrollRecords.reduce((sum, p) => sum + p.gross_salary, 0),
        totalNetSalary: payrollRecords.reduce((sum, p) => sum + p.net_salary, 0),
        totalDeductions:
          payrollRecords.reduce((sum, p) => sum + p.total_deductions, 0),
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
    } catch {
      // Column already exists
    }

    try {
      this.db.exec(`
        ALTER TABLE payroll ADD COLUMN gl_posted_date TEXT;
      `);
    } catch {
      // Column already exists
    }

    try {
      this.db.exec(`
        ALTER TABLE payroll ADD COLUMN payment_status TEXT DEFAULT 'PENDING';
      `);
    } catch {
      // Column already exists
    }

    try {
      this.db.exec(`
        ALTER TABLE payroll ADD COLUMN payment_date TEXT;
      `);
    } catch {
      // Column already exists
    }

    try {
      this.db.exec(`
        ALTER TABLE payroll_period ADD COLUMN gl_posted INTEGER DEFAULT 0;
      `);
    } catch {
      // Column already exists
    }
  }
}


