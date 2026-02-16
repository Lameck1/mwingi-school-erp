import { container } from '../../services/base/ServiceContainer';
import { safeHandleRaw, safeHandleRawWithRole, ROLES, resolveActorId } from '../ipc-result';

import type { GLAccountService, GLAccountData } from '../../services/finance/GLAccountService';

const getService = () => container.resolve('GLAccountService');

type GLAccountFilters = Parameters<GLAccountService['getAll']>[0]

export function registerGLAccountHandlers() {
  safeHandleRaw('gl:get-accounts', async (_event, filters?: GLAccountFilters) => {
    return await getService().getAll(filters);
  });

  safeHandleRaw('gl:get-account', async (_event, id: number) => {
    return await getService().getById(id);
  });

  safeHandleRawWithRole('gl:create-account', ROLES.FINANCE, async (event, data: GLAccountData, legacyUserId?: number) => {
    const actor = resolveActorId(event, legacyUserId);
    if (!actor.success) {
      return { success: false, error: actor.error };
    }
    return await getService().create(data, actor.actorId);
  });

  safeHandleRawWithRole('gl:update-account', ROLES.FINANCE, async (event, id: number, data: Partial<GLAccountData>, legacyUserId?: number) => {
    const actor = resolveActorId(event, legacyUserId);
    if (!actor.success) {
      return { success: false, error: actor.error };
    }
    return await getService().update(id, data, actor.actorId);
  });

  safeHandleRawWithRole('gl:delete-account', ROLES.FINANCE, async (event, id: number, legacyUserId?: number) => {
    const actor = resolveActorId(event, legacyUserId);
    if (!actor.success) {
      return { success: false, error: actor.error };
    }
    return await getService().delete(id, actor.actorId);
  });
}
