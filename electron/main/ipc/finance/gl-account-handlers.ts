import { container } from '../../services/base/ServiceContainer';
import { safeHandleRaw } from '../ipc-result';

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

  safeHandleRaw('gl:create-account', async (_event, data: GLAccountData, userId: number) => {
    return await getService().create(data, userId);
  });

  safeHandleRaw('gl:update-account', async (_event, id: number, data: Partial<GLAccountData>, userId: number) => {
    return await getService().update(id, data, userId);
  });

  safeHandleRaw('gl:delete-account', async (_event, id: number, userId: number) => {
    return await getService().delete(id, userId);
  });
}
