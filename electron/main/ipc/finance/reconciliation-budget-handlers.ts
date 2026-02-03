import { IpcMainInvokeEvent } from 'electron';
import { ipcMain } from '../../electron-env';
import { ReconciliationService } from '../../services/accounting/ReconciliationService';
import { BudgetEnforcementService } from '../../services/accounting/BudgetEnforcementService';

/**
 * Reconciliation and Budget IPC Handlers
 * 
 * Provides frontend access to:
 * - Reconciliation checks and reports
 * - Budget enforcement and validation
 * - Budget variance reports
 */

export function registerReconciliationAndBudgetHandlers(): void {
  const reconciliationService = new ReconciliationService();
  const budgetService = new BudgetEnforcementService();

  // ======== RECONCILIATION ========

  /**
   * Run all reconciliation checks
   */
  ipcMain.handle(
    'reconciliation:runAll',
    async (_event: IpcMainInvokeEvent, userId: number) => {
      return await reconciliationService.runAllChecks(userId);
    }
  );

  /**
   * Get reconciliation history
   */
  ipcMain.handle(
    'reconciliation:getHistory',
    async (_event: IpcMainInvokeEvent, limit: number = 30) => {
      return await reconciliationService.getReconciliationHistory(limit);
    }
  );

  /**
   * Get latest reconciliation summary
   */
  ipcMain.handle(
    'reconciliation:getLatest',
    async () => {
      return await reconciliationService.getLatestReconciliationSummary();
    }
  );

  // ======== BUDGET ENFORCEMENT ========

  /**
   * Set budget allocation for GL account
   */
  ipcMain.handle(
    'budget:setAllocation',
    async (
      _event: IpcMainInvokeEvent,
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
  ipcMain.handle(
    'budget:validateTransaction',
    async (
      _event: IpcMainInvokeEvent,
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
  ipcMain.handle(
    'budget:getAllocations',
    async (_event: IpcMainInvokeEvent, fiscalYear: number) => {
      return await budgetService.getBudgetAllocations(fiscalYear);
    }
  );

  /**
   * Generate budget variance report
   */
  ipcMain.handle(
    'budget:getVarianceReport',
    async (_event: IpcMainInvokeEvent, fiscalYear: number) => {
      return await budgetService.generateBudgetVarianceReport(fiscalYear);
    }
  );

  /**
   * Get budget alerts
   */
  ipcMain.handle(
    'budget:getAlerts',
    async (
      _event: IpcMainInvokeEvent,
      fiscalYear: number,
      thresholdPercentage: number = 80
    ) => {
      return await budgetService.getBudgetAlerts(fiscalYear, thresholdPercentage);
    }
  );

  /**
   * Deactivate budget allocation
   */
  ipcMain.handle(
    'budget:deactivateAllocation',
    async (_event: IpcMainInvokeEvent, allocationId: number, userId: number) => {
      return await budgetService.deactivateBudgetAllocation(allocationId, userId);
    }
  );
}
