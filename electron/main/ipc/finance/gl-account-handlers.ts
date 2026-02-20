import { z } from 'zod';

import { container } from '../../services/base/ServiceContainer';
import { ROLES } from '../ipc-result';
import { GLAccountFiltersSchema, CreateGLAccountTuple, UpdateGLAccountTuple, DeleteGLAccountTuple } from '../schemas/finance-schemas';
import { validatedHandler, validatedHandlerMulti } from '../validated-handler';

const getService = () => container.resolve('GLAccountService');

export function registerGLAccountHandlers() {
  validatedHandler('gl:get-accounts', ROLES.FINANCE, GLAccountFiltersSchema, async (_event, filters) => {
    return await getService().getAll(filters);
  });

  validatedHandler('gl:get-account', ROLES.FINANCE, z.number().int().positive(), async (_event, id) => {
    return await getService().getById(id);
  });

  validatedHandlerMulti('gl:create-account', ROLES.FINANCE, CreateGLAccountTuple, async (event, [data, legacyUserId], actor) => {
    if (legacyUserId !== undefined && legacyUserId !== actor.id) {
      throw new Error("Unauthorized: renderer user mismatch")
    }
    return await getService().create(data, actor.id);
  });

  validatedHandlerMulti('gl:update-account', ROLES.FINANCE, UpdateGLAccountTuple, async (event, [id, data, legacyUserId], actor) => {
    if (legacyUserId !== undefined && legacyUserId !== actor.id) {
      throw new Error("Unauthorized: renderer user mismatch")
    }
    return await getService().update(id, data, actor.id);
  });

  validatedHandlerMulti('gl:delete-account', ROLES.FINANCE, DeleteGLAccountTuple, async (event, [id, legacyUserId], actor) => {
    if (legacyUserId !== undefined && legacyUserId !== actor.id) {
      throw new Error("Unauthorized: renderer user mismatch")
    }
    return await getService().delete(id, actor.id);
  });
}
