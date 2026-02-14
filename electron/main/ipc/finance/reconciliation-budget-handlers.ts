import { container } from '../../services/base/ServiceContainer';
import { safeHandleRaw } from '../ipc-result';

import type { BudgetEnforcementService } from '../../services/accounting/BudgetEnforcementService';
import type { ReconciliationService } from '../../services/accounting/ReconciliationService';

/**
 * Reconciliation and Budget IPC Handlers
 * 
 * Provides frontend access to:
 * - Reconciliation checks and reports
 * - Budget enforcement and validation
 * - Budget variance reports
 */

export function registerReconciliationAndBudgetHandlers(): void {
  const reconciliationService = container.resolve('ReconciliationService');
  const budgetService = container.resolve('BudgetEnforcementService');
  registerReconciliationHandlers(reconciliationService)
  registerBudgetHandlers(budgetService)
}

function registerReconciliationHandlers(reconciliationService: ReconciliationService): void {
  safeHandleRaw(
    'reconciliation:runAll',
    async (_event, userId: number) => {
      return await reconciliationService.runAllChecks(userId);
    }
  );

  safeHandleRaw(
    'reconciliation:getHistory',
    async (_event, limit: number = 30) => {
      return await reconciliationService.getReconciliationHistory(limit);
    }
  );

  /**
   * Get latest reconciliation summary
   */
  safeHandleRaw(
    'reconciliation:getLatest',
    async () => {
      return await reconciliationService.getLatestReconciliationSummary();
    }
  );
}

function registerBudgetHandlers(budgetService: BudgetEnforcementService): void {
  safeHandleRaw(
    'budget:setAllocation',
    async (
      _event,
      glAccountCode: string,
      fiscalYear: number,
      allocatedAmount: number,
      department: string | null,
      userId: number
    ) => {
      return await budgetService.setBudgetAllocation(
        glAccountCode,
        fiscalYear,
        allocatedAmount,
        department,
        userId
      );
    }
  );

  /**
   * Validate transaction against budget
   */
  safeHandleRaw(
    'budget:validateTransaction',
    async (
      _event,
      glAccountCode: string,
      amount: number,
      fiscalYear: number,
      department: string | null = null
    ) => {
      return await budgetService.validateTransaction(
        glAccountCode,
        amount,
        fiscalYear,
        department
      );
    }
  );

  /**
   * Get all budget allocations for a fiscal year
   */
  safeHandleRaw(
    'budget:getAllocations',
    async (_event, fiscalYear: number) => {
      return await budgetService.getBudgetAllocations(fiscalYear);
    }
  );

  /**
   * Generate budget variance report
   */
  safeHandleRaw(
    'budget:getVarianceReport',
    async (_event, fiscalYear: number) => {
      return await budgetService.generateBudgetVarianceReport(fiscalYear);
    }
  );

  /**
   * Get budget alerts
   */
  safeHandleRaw(
    'budget:getAlerts',
    async (
      _event,
      fiscalYear: number,
      thresholdPercentage: number = 80
    ) => {
      return await budgetService.getBudgetAlerts(fiscalYear, thresholdPercentage);
    }
  );

  safeHandleRaw(
    'budget:deactivateAllocation',
    async (_event, allocationId: number, userId: number) => {
      return await budgetService.deactivateBudgetAllocation(allocationId, userId);
    }
  );
}
