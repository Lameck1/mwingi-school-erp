import { z } from 'zod';

import { container } from '../../services/base/ServiceContainer';
import { ROLES } from '../ipc-result';
import { RunReconciliationTuple } from '../schemas/finance-schemas';
import { validatedHandler, validatedHandlerMulti } from '../validated-handler';

import type { ReconciliationService } from '../../services/accounting/ReconciliationService';

export function registerReconciliationAndBudgetHandlers(): void {
  const reconciliationService = container.resolve('ReconciliationService');
  registerReconciliationHandlers(reconciliationService)
}

function registerReconciliationHandlers(reconciliationService: ReconciliationService): void {
  validatedHandlerMulti(
    'reconciliation:runAll',
    ROLES.FINANCE,
    RunReconciliationTuple,
    async (event, [legacyUserId], actor) => {
      if (legacyUserId !== undefined && legacyUserId !== actor.id) {
        throw new Error("Unauthorized: renderer user mismatch")
      }
      return await reconciliationService.runAllChecks(actor.id);
    }
  );

  validatedHandler(
    'reconciliation:getHistory',
    ROLES.STAFF,
    z.number().int().optional(), // limit
    async (_event, limit) => {
      return await reconciliationService.getReconciliationHistory(limit || 30);
    }
  );

  validatedHandler(
    'reconciliation:getLatest',
    ROLES.STAFF,
    z.void(),
    async () => {
      return await reconciliationService.getLatestReconciliationSummary();
    }
  );
}
