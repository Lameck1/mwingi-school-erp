import { z } from 'zod';

import { container } from '../../services/base/ServiceContainer';
import { ROLES } from '../ipc-result';
import { GLAccountFiltersSchema, CreateGLAccountTuple, UpdateGLAccountTuple, DeleteGLAccountTuple } from '../schemas/finance-schemas';
import { validatedHandler, validatedHandlerMulti } from '../validated-handler';

import type { GLAccountData } from '../../services/finance/GLAccountService';

const getService = () => container.resolve('GLAccountService');

function normalizeAccountType(type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'REVENUE' | 'EXPENSE'): GLAccountData['account_type'] {
  return type === 'INCOME' ? 'REVENUE' : type
}

function normalizeNormalBalance(type: GLAccountData['account_type']): GLAccountData['normal_balance'] {
  return type === 'ASSET' || type === 'EXPENSE' ? 'DEBIT' : 'CREDIT'
}

function normalizeCreateData(data: z.infer<typeof CreateGLAccountTuple>[0]): GLAccountData {
  const accountType = normalizeAccountType(data.account_type)
  const normalized: GLAccountData = {
    account_code: data.account_code,
    account_name: data.account_name,
    account_type: accountType,
    normal_balance: normalizeNormalBalance(accountType)
  }
  if (data.description !== undefined) { normalized.description = data.description }
  if (data.is_active !== undefined) { normalized.is_active = data.is_active === true || data.is_active === 1 }
  return normalized
}

function normalizeUpdateData(data: z.infer<typeof UpdateGLAccountTuple>[1]): Partial<GLAccountData> {
  const normalized: Partial<GLAccountData> = {}
  if (data.account_code !== undefined) { normalized.account_code = data.account_code }
  if (data.account_name !== undefined) { normalized.account_name = data.account_name }
  if (data.account_type !== undefined) {
    const mappedType = normalizeAccountType(data.account_type)
    normalized.account_type = mappedType
    normalized.normal_balance = normalizeNormalBalance(mappedType)
  }
  if (data.description !== undefined) { normalized.description = data.description }
  if (data.is_active !== undefined) { normalized.is_active = data.is_active === true || data.is_active === 1 }
  return normalized
}

function normalizeFilters(filters: z.infer<typeof GLAccountFiltersSchema>) {
  if (!filters) {
    return
  }
  const normalized: { type?: string; isActive?: boolean } = {}
  if (filters.type !== undefined) { normalized.type = filters.type }
  const isActive = filters.is_active ?? filters.isActive
  if (isActive !== undefined) { normalized.isActive = isActive }
  return normalized
}

export function registerGLAccountHandlers() {
  validatedHandler('gl:get-accounts', ROLES.FINANCE, GLAccountFiltersSchema, async (_event, filters) => {
    return await getService().getAll(normalizeFilters(filters));
  });

  validatedHandler('gl:get-account', ROLES.FINANCE, z.number().int().positive(), async (_event, id) => {
    return await getService().getById(id);
  });

  validatedHandlerMulti('gl:create-account', ROLES.FINANCE, CreateGLAccountTuple, async (_event, [data, legacyUserId], actor) => {
    if (legacyUserId !== undefined && legacyUserId !== actor.id) {
      throw new Error("Unauthorized: renderer user mismatch")
    }
    return await getService().create(normalizeCreateData(data), actor.id);
  });

  validatedHandlerMulti('gl:update-account', ROLES.FINANCE, UpdateGLAccountTuple, async (_event, [id, data, legacyUserId], actor) => {
    if (legacyUserId !== undefined && legacyUserId !== actor.id) {
      throw new Error("Unauthorized: renderer user mismatch")
    }
    return await getService().update(id, normalizeUpdateData(data), actor.id);
  });

  validatedHandlerMulti('gl:delete-account', ROLES.FINANCE, DeleteGLAccountTuple, async (_event, [id, legacyUserId], actor) => {
    if (legacyUserId !== undefined && legacyUserId !== actor.id) {
      throw new Error("Unauthorized: renderer user mismatch")
    }
    return await getService().delete(id, actor.id);
  });
}
