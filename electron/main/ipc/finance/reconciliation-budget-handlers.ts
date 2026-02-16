import { container } from '../../services/base/ServiceContainer';
import { safeHandleRawWithRole, ROLES, resolveActorId } from '../ipc-result';

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
  safeHandleRawWithRole(
    'reconciliation:runAll',
    ROLES.FINANCE,
    async (event, legacyUserId?: number) => {
      const actor = resolveActorId(event, legacyUserId);
      if (!actor.success) {
        return { success: false, error: actor.error };
      }
      return await reconciliationService.runAllChecks(actor.actorId);
    }
  );

  safeHandleRawWithRole(
    'reconciliation:getHistory',
    ROLES.STAFF,
    async (_event, limit: number = 30) => {
      return await reconciliationService.getReconciliationHistory(limit);
    }
  );

  /**
   * Get latest reconciliation summary
   */
  safeHandleRawWithRole(
    'reconciliation:getLatest',
    ROLES.STAFF,
    async () => {
      return await reconciliationService.getLatestReconciliationSummary();
    }
  );
}
