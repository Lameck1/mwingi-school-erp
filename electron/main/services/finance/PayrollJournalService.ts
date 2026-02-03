import Database from 'better-sqlite3-multiple-ciphers';
import { getDatabase } from '../../database';
import { logAudit } from '../../database/utils/audit';
import { DoubleEntryJournalService, JournalEntryData } from '../accounting/DoubleEntryJournalService';

/**
 * Payroll Journal Service
 * 
 * Integrates payroll with the general ledger by creating journal entries
 * for salary expenses, statutory deductions, and payments.
 */

export interface PayrollJournalResult {
  success: boolean;
  message: string;
  journal_entry_ids?: number[];
}

export class PayrollJournalService {
  private db: Database.Database;
  private journalService: DoubleEntryJournalService;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
    this.journalService = new DoubleEntryJournalService(this.db);
  }

  /**
   * Post complete payroll to GL
   * Creates multiple journal entries for a payroll period
   */
  async postPayrollToGL(
    periodId: number,
    userId: number
  ): Promise<PayrollJournalResult> {
    try {
      const journalIds: number[] = [];

      // Step 1: Post salary expense
      const expenseResult = await this.postSalaryExpense(periodId, userId);
      if (!expenseResult.success) {
        return expenseResult;
      }
      journalIds.push(...(expenseResult.journal_entry_ids || []));

      // Step 2: Post statutory deductions as liabilities
      const deductionsResult = await this.postStatutoryDeductions(periodId, userId);
      if (!deductionsResult.success) {
        return deductionsResult;
      }
      journalIds.push(...(deductionsResult.journal_entry_ids || []));

      return {
        success: true,
        message: `Payroll posted to GL successfully. ${journalIds.length} journal entries created.`,
        journal_entry_ids: journalIds
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to post payroll to GL: ${(error as Error).message}`
      };
    }
  }

  /**
   * Post salary expense entry
   * Debit: Salary Expense (5010/5020)
   * Credit: Salary Payable (2100)
   */
  async postSalaryExpense(
    periodId: number,
    userId: number
  ): Promise<PayrollJournalResult> {
    try {
      // Get payroll period details
      const period = this.db.prepare(`
        SELECT * FROM payroll_period WHERE id = ?
      `).get(periodId) as any;

      if (!period) {
        return {
          success: false,
          message: `Payroll period ${periodId} not found`
        };
      }

      // Get payroll records grouped by department/type
      const payrollRecords = this.db.prepare(`
        SELECT
          s.department,
          s.job_title,
          SUM(p.gross_salary) as total_gross
        FROM payroll p
        JOIN staff s ON p.staff_id = s.id
        WHERE p.period_id = ?
        GROUP BY s.department
      `).all(periodId) as Array<{ department: string; total_gross: number }>;

      const journalIds: number[] = [];

      for (const record of payrollRecords) {
        // Determine expense account based on department
        const expenseAccountCode = this.getExpenseAccountCode(record.department);

        const journalData: JournalEntryData = {
          entry_date: period.end_date,
          entry_type: 'SALARY_PAYMENT',
          description: `Salary expense for ${period.period_name} - ${record.department}`,
          created_by_user_id: userId,
          lines: [
            {
              gl_account_code: expenseAccountCode,
              debit_amount: record.total_gross,
              credit_amount: 0,
              description: `Gross salary - ${record.department}`
            },
            {
              gl_account_code: '2100', // Salary Payable
              debit_amount: 0,
              credit_amount: record.total_gross,
              description: 'Salary accrued'
            }
          ]
        };

        const result = await this.journalService.createJournalEntry(journalData);
        if (result.success && result.entry_id) {
          journalIds.push(result.entry_id);
        }
      }

      return {
        success: true,
        message: `Salary expenses posted successfully`,
        journal_entry_ids: journalIds
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to post salary expense: ${(error as Error).message}`
      };
    }
  }

  /**
   * Post statutory deductions as liabilities
   * Debit: Salary Payable (2100)
   * Credit: PAYE Payable (2110), NSSF Payable (2120), NHIF Payable (2130), etc.
   */
  async postStatutoryDeductions(
    periodId: number,
    userId: number
  ): Promise<PayrollJournalResult> {
    try {
      // Get period details
      const period = this.db.prepare(`
        SELECT * FROM payroll_period WHERE id = ?
      `).get(periodId) as any;

      // Aggregate deductions by type
      const deductions = this.db.prepare(`
        SELECT
          pd.deduction_name,
          SUM(pd.amount) as total_amount
        FROM payroll_deduction pd
        JOIN payroll p ON pd.payroll_id = p.id
        WHERE p.period_id = ?
        GROUP BY pd.deduction_name
      `).all(periodId) as Array<{ deduction_name: string; total_amount: number }>;

      if (deductions.length === 0) {
        return {
          success: true,
          message: 'No deductions to post',
          journal_entry_ids: []
        };
      }

      // Create credit lines for each deduction type
      const creditLines = deductions.map((ded) => ({
        gl_account_code: this.getDeductionAccountCode(ded.deduction_name),
        debit_amount: 0,
        credit_amount: ded.total_amount,
        description: ded.deduction_name
      }));

      // Calculate total deductions
      const totalDeductions = deductions.reduce((sum, d) => sum + d.total_amount, 0);

      // Create journal entry
      const journalData: JournalEntryData = {
        entry_date: period.end_date,
        entry_type: 'SALARY_PAYMENT',
        description: `Statutory deductions for ${period.period_name}`,
        created_by_user_id: userId,
        lines: [
          {
            gl_account_code: '2100', // Salary Payable
            debit_amount: totalDeductions,
            credit_amount: 0,
            description: 'Deductions from salary payable'
          },
          ...creditLines
        ]
      };

      const result = await this.journalService.createJournalEntry(journalData);

      return {
        success: result.success,
        message: result.message,
        journal_entry_ids: result.success && result.entry_id ? [result.entry_id] : []
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to post statutory deductions: ${(error as Error).message}`
      };
    }
  }

  /**
   * Post salary payment when bank transfer is made
   * Debit: Salary Payable (2100)
   * Credit: Bank Account (1020)
   */
  async postSalaryPayment(
    periodId: number,
    bankAccountCode: string,
    paymentDate: string,
    userId: number
  ): Promise<PayrollJournalResult> {
    try {
      // Get period details
      const period = this.db.prepare(`
        SELECT * FROM payroll_period WHERE id = ?
      `).get(periodId) as any;

      // Calculate total net salary to be paid
      const totals = this.db.prepare(`
        SELECT SUM(net_salary) as total_net
        FROM payroll
        WHERE period_id = ?
      `).get(periodId) as { total_net: number };

      if (!totals || totals.total_net === 0) {
        return {
          success: false,
          message: 'No salary amounts to pay'
        };
      }

      const journalData: JournalEntryData = {
        entry_date: paymentDate,
        entry_type: 'SALARY_PAYMENT',
        description: `Salary payment for ${period.period_name}`,
        created_by_user_id: userId,
        lines: [
          {
            gl_account_code: '2100', // Salary Payable
            debit_amount: totals.total_net,
            credit_amount: 0,
            description: 'Salary payment'
          },
          {
            gl_account_code: bankAccountCode,
            debit_amount: 0,
            credit_amount: totals.total_net,
            description: 'Bank transfer for salaries'
          }
        ]
      };

      const result = await this.journalService.createJournalEntry(journalData);

      // Update payroll records with payment status
      if (result.success) {
        this.db.prepare(`
          UPDATE payroll
          SET payment_status = 'PAID', payment_date = ?
          WHERE period_id = ?
        `).run(paymentDate, periodId);
      }

      return {
        success: result.success,
        message: result.message,
        journal_entry_ids: result.success && result.entry_id ? [result.entry_id] : []
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to post salary payment: ${(error as Error).message}`
      };
    }
  }

  /**
   * Post statutory payments (PAYE, NSSF, NHIF to government)
   * Debit: PAYE/NSSF/NHIF Payable
   * Credit: Bank Account
   */
  async postStatutoryPayment(
    deductionType: 'PAYE' | 'NSSF' | 'NHIF' | 'HOUSING_LEVY',
    amount: number,
    paymentDate: string,
    bankAccountCode: string,
    referenceNumber: string,
    userId: number
  ): Promise<PayrollJournalResult> {
    try {
      const liabilityAccountCode = this.getDeductionAccountCode(deductionType);

      const journalData: JournalEntryData = {
        entry_date: paymentDate,
        entry_type: 'EXPENSE',
        description: `${deductionType} payment to government - Ref: ${referenceNumber}`,
        created_by_user_id: userId,
        lines: [
          {
            gl_account_code: liabilityAccountCode,
            debit_amount: amount,
            credit_amount: 0,
            description: `${deductionType} payment`
          },
          {
            gl_account_code: bankAccountCode,
            debit_amount: 0,
            credit_amount: amount,
            description: 'Payment to government'
          }
        ]
      };

      const result = await this.journalService.createJournalEntry(journalData);

      return {
        success: result.success,
        message: result.message,
        journal_entry_ids: result.success && result.entry_id ? [result.entry_id] : []
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to post statutory payment: ${(error as Error).message}`
      };
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private getExpenseAccountCode(department: string): string {
    // Map department to expense account
    const normalizedDept = (department || '').toLowerCase();

    if (normalizedDept.includes('teaching') || normalizedDept.includes('academic')) {
      return '5010'; // Salaries - Teaching Staff
    } else {
      return '5020'; // Salaries - Non-Teaching Staff
    }
  }

  private getDeductionAccountCode(deductionName: string): string {
    const normalized = deductionName.toUpperCase();

    if (normalized.includes('PAYE') || normalized.includes('TAX')) {
      return '2110'; // PAYE Payable
    } else if (normalized.includes('NSSF')) {
      return '2120'; // NSSF Payable
    } else if (normalized.includes('NHIF') || normalized.includes('SHIF')) {
      return '2130'; // NHIF/SHIF Payable
    } else if (normalized.includes('HOUSING')) {
      return '2140'; // Housing Levy Payable
    } else {
      return '2100'; // Default to Salary Payable
    }
  }
}
