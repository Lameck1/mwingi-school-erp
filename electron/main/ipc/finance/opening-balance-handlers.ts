import { container } from '../../services/base/ServiceContainer';
import { safeHandleRawWithRole, ROLES, resolveActorId } from '../ipc-result';

import type { OpeningBalanceImport, StudentOpeningBalance } from '../../services/accounting/OpeningBalanceService';

const getService = () => container.resolve('OpeningBalanceService');

export function registerOpeningBalanceHandlers() {
  safeHandleRawWithRole('opening-balance:import-student', ROLES.FINANCE, async (event, balances: StudentOpeningBalance[], academicYearId: number, importSource: string, legacyUserId?: number) => {
    const actor = resolveActorId(event, legacyUserId);
    if (!actor.success) {
      return { success: false, error: actor.error };
    }
    return await getService().importStudentOpeningBalances(balances, academicYearId, importSource, actor.actorId);
  });

  safeHandleRawWithRole('opening-balance:import-gl', ROLES.FINANCE, async (event, balances: OpeningBalanceImport[], legacyUserId?: number) => {
    const actor = resolveActorId(event, legacyUserId);
    if (!actor.success) {
      return { success: false, error: actor.error };
    }
    return await getService().importGLOpeningBalances(balances, actor.actorId);
  });
}
