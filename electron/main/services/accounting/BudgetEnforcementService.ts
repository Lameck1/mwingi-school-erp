import { getDatabase } from '../../database';
import { logAudit } from '../../database/utils/audit';
import { centsToShillings } from '../../utils/money';

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * BudgetEnforcementService
 * 
 * Enforces budget limits and provides budget tracking functionality.
 * Prevents overspending and alerts managers when budgets are exceeded.
 * 
 * Key Functions:
 * 1. Validate transactions against budget limits
 * 2. Track budget utilization by GL account
 * 3. Generate budget variance reports
 * 4. Alert on budget overruns
 * 5. Support departmental budget allocations
 */

export interface BudgetAllocation {
  id?: number;
  gl_account_code: string;
  account_name?: string;
  department?: string;
  fiscal_year: number;
  allocated_amount: number;
  spent_amount?: number;
  remaining_amount?: number;
  utilization_percentage?: number;
  is_active: boolean;
}

export interface BudgetValidationResult {
  is_allowed: boolean;
  message: string;
  budget_status?: {
    allocated: number;
    spent: number;
    remaining: number;
    utilization_percentage: number;
    after_transaction: {
      spent: number;
      remaining: number;
      utilization_percentage: number;
    };
  };
}

export interface BudgetVarianceReport {
  fiscal_year: number;
  report_date: string;
  items: Array<{
    gl_account_code: string;
    account_name: string;
    department: string | null;
    allocated: number;
    spent: number;
    remaining: number;
    variance: number;
    variance_percentage: number;
    status: 'UNDER_BUDGET' | 'ON_BUDGET' | 'OVER_BUDGET';
  }>;
  summary: {
    total_allocated: number;
    total_spent: number;
    total_remaining: number;
    overall_utilization_percentage: number;
  };
}

export class BudgetEnforcementService {
  private readonly db = getDatabase();

  private getBudgetAllocation(
    glAccountCode: string,
    fiscalYear: number,
    department: string | null
  ): {
    id: number;
    gl_account_code: string;
    allocated_amount: number;
    account_name: string;
    department: string | null;
  } | undefined {
    return this.db.prepare(`
      SELECT ba.id, ba.gl_account_code, ba.allocated_amount, ga.account_name,
             ba.department
      FROM budget_allocation ba
      JOIN gl_account ga ON ga.account_code = ba.gl_account_code
      WHERE ba.gl_account_code = ?
        AND ba.fiscal_year = ?
        AND (ba.department = ? OR (ba.department IS NULL AND ? IS NULL))
        AND ba.is_active = 1
    `).get(glAccountCode, fiscalYear, department, department) as {
      id: number;
      gl_account_code: string;
      allocated_amount: number;
      account_name: string;
      department: string | null;
    } | undefined;
  }

  private buildBudgetStatus(
    allocatedAmount: number,
    spent: number,
    amount: number
  ): NonNullable<BudgetValidationResult['budget_status']> {
    const remaining = allocatedAmount - spent;
    const utilizationPercentage = (spent / allocatedAmount) * 100;
    const afterSpent = spent + amount;
    const afterRemaining = allocatedAmount - afterSpent;
    const afterUtilization = (afterSpent / allocatedAmount) * 100;

    return {
      allocated: allocatedAmount,
      spent,
      remaining,
      utilization_percentage: utilizationPercentage,
      after_transaction: {
        spent: afterSpent,
        remaining: afterRemaining,
        utilization_percentage: afterUtilization,
      },
    };
  }

  /**
   * Create or update budget allocation
   */
  async setBudgetAllocation(
    glAccountCode: string,
    fiscalYear: number,
    allocatedAmount: number,
    department: string | null,
    userId: number
  ): Promise<{ success: boolean; message: string; allocationId?: number }> {
    try {
      // Check if allocation already exists
      const existing = this.db.prepare(`
        SELECT id FROM budget_allocation
        WHERE gl_account_code = ?
          AND fiscal_year = ?
          AND (department = ? OR (department IS NULL AND ? IS NULL))
      `).get(glAccountCode, fiscalYear, department, department) as { id: number } | undefined;

      if (existing) {
        // Update existing
        this.db.prepare(`
          UPDATE budget_allocation
          SET allocated_amount = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(allocatedAmount, existing.id);

        logAudit(userId, 'UPDATE', 'budget_allocation', existing.id, null, {
          allocated_amount: allocatedAmount,
        });

        return {
          success: true,
          message: 'Budget allocation updated successfully.',
          allocationId: existing.id,
        };
      } else {
        // Create new
        const result = this.db.prepare(`
          INSERT INTO budget_allocation (
            gl_account_code, fiscal_year, allocated_amount, department, is_active
          ) VALUES (?, ?, ?, ?, 1)
        `).run(glAccountCode, fiscalYear, allocatedAmount, department);

        const allocationId = result.lastInsertRowid as number;

        logAudit(userId, 'CREATE', 'budget_allocation', allocationId, null, {
          gl_account_code: glAccountCode,
          fiscal_year: fiscalYear,
          allocated_amount: allocatedAmount,
          department,
        });

        return {
          success: true,
          message: 'Budget allocation created successfully.',
          allocationId,
        };
      }
    } catch (error: unknown) {
      return {
        success: false,
        message: `Failed to set budget allocation: ${getErrorMessage(error)}`,
      };
    }
  }

  /**
   * Validate if a transaction is within budget
   */
  async validateTransaction(
    glAccountCode: string,
    amount: number,
    fiscalYear: number,
    department: string | null = null
  ): Promise<BudgetValidationResult> {
    try {
      const allocation = this.getBudgetAllocation(glAccountCode, fiscalYear, department);

      // If no budget allocation, allow transaction (no budget set)
      if (!allocation) {
        return {
          is_allowed: true,
          message: 'No budget allocation found. Transaction allowed.',
        };
      }

      const spent = this.calculateSpentAmount(glAccountCode, fiscalYear, department);
      const budget_status = this.buildBudgetStatus(allocation.allocated_amount, spent, amount);
      const afterSpent = budget_status.after_transaction.spent;
      const afterUtilization = budget_status.after_transaction.utilization_percentage;
      const utilizationPercentage = budget_status.utilization_percentage;

      // Check if transaction exceeds budget
      if (afterSpent > allocation.allocated_amount) {
        const overrun = afterSpent - allocation.allocated_amount;
        return {
          is_allowed: false,
          message: `Transaction would exceed budget by Kes ${centsToShillings(overrun).toFixed(2)}. Budget: Kes ${centsToShillings(allocation.allocated_amount).toFixed(2)}, Spent: Kes ${centsToShillings(spent).toFixed(2)}, Requested: Kes ${centsToShillings(amount).toFixed(2)}.`,
          budget_status,
        };
      }

      // Warn if exceeding 90% utilization
      if (afterUtilization >= 90 && utilizationPercentage < 90) {
        return {
          is_allowed: true,
          message: `Warning: Transaction will push budget utilization to ${afterUtilization.toFixed(1)}%. Consider requesting additional budget allocation.`,
          budget_status,
        };
      }

      // Warn if exceeding 80% utilization
      if (afterUtilization >= 80 && utilizationPercentage < 80) {
        return {
          is_allowed: true,
          message: `Notice: Transaction will push budget utilization to ${afterUtilization.toFixed(1)}%. Budget is ${(100 - afterUtilization).toFixed(1)}% remaining.`,
          budget_status,
        };
      }

      return {
        is_allowed: true,
        message: 'Transaction is within budget.',
        budget_status,
      };
    } catch (error: unknown) {
      // Fail closed to prevent silent overspending when validation cannot run.
      console.error('Budget validation error:', error);
      return {
        is_allowed: false,
        message: `Budget validation failed: ${getErrorMessage(error)}. Transaction blocked until budget checks recover.`,
      };
    }
  }

  /**
   * Calculate spent amount for a budget allocation
   */
  private calculateSpentAmount(
    glAccountCode: string,
    fiscalYear: number,
    department: string | null
  ): number {
    // 1. Resolve period boundaries (Decouple from hardcoded Jan-Dec)
    const period = this.db.prepare(`
      SELECT MIN(start_date) as start_date, MAX(end_date) as end_date
      FROM accounting_period
      WHERE period_name LIKE ? OR (strftime('%Y', start_date) = ?)
    `).get(`%${fiscalYear}%`, String(fiscalYear)) as { start_date: string | null; end_date: string | null } | undefined;

    const startDate = period?.start_date || `${fiscalYear}-01-01`;
    const endDate = period?.end_date || `${fiscalYear}-12-31`;

    // 2. Build Query with Departmental filtering
    let query = `
      SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) as spent
      FROM journal_entry_line jel
      JOIN journal_entry je ON je.id = jel.journal_entry_id
      JOIN gl_account ga ON ga.id = jel.gl_account_id
      WHERE ga.account_code = ?
        AND je.entry_date BETWEEN ? AND ?
        AND je.is_posted = 1
        AND je.is_voided = 0
    `;

    const params: (string | number)[] = [glAccountCode, startDate, endDate];

    if (department) {
      query += ` AND je.department = ?`;
      params.push(department);
    } else {
      query += ` AND je.department IS NULL`;
    }

    const result = this.db.prepare(query).get(...params) as {
      spent: number;
    } | undefined;

    return result?.spent || 0;
  }

  /**
   * Get all budget allocations for a fiscal year
   */
  async getBudgetAllocations(fiscalYear: number): Promise<BudgetAllocation[]> {
    try {
      const allocations = this.db.prepare(`
        SELECT ba.id, ba.gl_account_code, ga.account_name, ba.department,
               ba.fiscal_year, ba.allocated_amount, ba.is_active
        FROM budget_allocation ba
        JOIN gl_account ga ON ga.account_code = ba.gl_account_code
        WHERE ba.fiscal_year = ?
        ORDER BY ba.gl_account_code, ba.department
      `).all(fiscalYear) as Array<{
        id: number;
        gl_account_code: string;
        account_name: string;
        department: string | null;
        fiscal_year: number;
        allocated_amount: number;
        is_active: number;
      }>;

      return allocations.map(a => {
        const spent = this.calculateSpentAmount(a.gl_account_code, a.fiscal_year, a.department);
        const remaining = a.allocated_amount - spent;
        const utilization = (spent / a.allocated_amount) * 100;

        return {
          id: a.id,
          gl_account_code: a.gl_account_code,
          account_name: a.account_name,
          department: a.department || undefined,
          fiscal_year: a.fiscal_year,
          allocated_amount: a.allocated_amount,
          spent_amount: spent,
          remaining_amount: remaining,
          utilization_percentage: utilization,
          is_active: a.is_active === 1,
        };
      });
    } catch (error: unknown) {
      console.error('Failed to fetch budget allocations:', error);
      return [];
    }
  }

  /**
   * Generate budget variance report
   */
  async generateBudgetVarianceReport(fiscalYear: number): Promise<BudgetVarianceReport> {
    const allocations = await this.getBudgetAllocations(fiscalYear);

    const items = allocations.map(a => {
      const variance = a.allocated_amount - (a.spent_amount || 0);
      const variancePercentage = a.allocated_amount
        ? ((a.spent_amount || 0) / a.allocated_amount) * 100 - 100
        : 0;

      let status: 'UNDER_BUDGET' | 'ON_BUDGET' | 'OVER_BUDGET';
      if ((a.spent_amount || 0) > a.allocated_amount) {
        status = 'OVER_BUDGET';
      } else if ((a.utilization_percentage || 0) >= 95) {
        status = 'ON_BUDGET';
      } else {
        status = 'UNDER_BUDGET';
      }

      return {
        gl_account_code: a.gl_account_code,
        account_name: a.account_name || '',
        department: a.department || null,
        allocated: a.allocated_amount,
        spent: a.spent_amount || 0,
        remaining: a.remaining_amount || 0,
        variance,
        variance_percentage: variancePercentage,
        status,
      };
    });

    const summary = {
      total_allocated: items.reduce((sum, i) => sum + i.allocated, 0),
      total_spent: items.reduce((sum, i) => sum + i.spent, 0),
      total_remaining: items.reduce((sum, i) => sum + i.remaining, 0),
      overall_utilization_percentage: 0,
    };

    summary.overall_utilization_percentage =
      (summary.total_spent / summary.total_allocated) * 100;

    return {
      fiscal_year: fiscalYear,
      report_date: new Date().toISOString(),
      items,
      summary,
    };
  }

  /**
   * Get budget alerts (accounts near or over budget)
   */
  async getBudgetAlerts(fiscalYear: number, thresholdPercentage: number = 80): Promise<Array<{
    gl_account_code: string;
    account_name: string;
    department: string | null;
    allocated: number;
    spent: number;
    utilization_percentage: number;
    alert_type: 'WARNING' | 'CRITICAL' | 'EXCEEDED';
  }>> {
    const allocations = await this.getBudgetAllocations(fiscalYear);

    return allocations
      .filter(a => (a.utilization_percentage || 0) >= thresholdPercentage)
      .map(a => {
        let alert_type: 'WARNING' | 'CRITICAL' | 'EXCEEDED';
        if ((a.utilization_percentage || 0) >= 100) {
          alert_type = 'EXCEEDED';
        } else if ((a.utilization_percentage || 0) >= 90) {
          alert_type = 'CRITICAL';
        } else {
          alert_type = 'WARNING';
        }

        return {
          gl_account_code: a.gl_account_code,
          account_name: a.account_name || '',
          department: a.department || null,
          allocated: a.allocated_amount,
          spent: a.spent_amount || 0,
          utilization_percentage: a.utilization_percentage || 0,
          alert_type,
        };
      })
      .sort((a, b) => b.utilization_percentage - a.utilization_percentage);
  }

  /**
   * Deactivate budget allocation
   */
  async deactivateBudgetAllocation(allocationId: number, userId: number): Promise<void> {
    this.db.prepare(`
      UPDATE budget_allocation
      SET is_active = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(allocationId);

    logAudit(userId, 'UPDATE', 'budget_allocation', allocationId, null, {
      is_active: false,
    });
  }
}


