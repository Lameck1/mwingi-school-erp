import { container } from '../../services/base/ServiceContainer';
import { safeHandleRaw } from '../ipc-result';

import type { ReconciliationService } from '../../services/accounting/ReconciliationService';

/**
 * Reconciliation IPC Handlers
 * 
 * Provides frontend access to:
 * - Reconciliation checks and reports
 */

export function registerReconciliationAndBudgetHandlers(): void {
  const reconciliationService = container.resolve('ReconciliationService');
  registerReconciliationHandlers(reconciliationService)
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
