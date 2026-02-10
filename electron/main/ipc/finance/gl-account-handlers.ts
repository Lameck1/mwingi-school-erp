import { ipcMain } from '../../electron-env';
import { GLAccountService, type GLAccountData } from '../../services/finance/GLAccountService';

import type { IpcMainInvokeEvent } from 'electron';

let cachedService: GLAccountService | null = null;
const getService = () => {
  cachedService ??= new GLAccountService();
  return cachedService;
};

type GLAccountFilters = Parameters<GLAccountService['getAll']>[0]

export function registerGLAccountHandlers() {
  ipcMain.handle('gl:get-accounts', async (_event: IpcMainInvokeEvent, filters?: GLAccountFilters) => {
    return await getService().getAll(filters);
  });

  ipcMain.handle('gl:get-account', async (_event: IpcMainInvokeEvent, id: number) => {
    return await getService().getById(id);
  });

  ipcMain.handle('gl:create-account', async (_event: IpcMainInvokeEvent, data: GLAccountData, userId: number) => {
    return await getService().create(data, userId);
  });

  ipcMain.handle('gl:update-account', async (_event: IpcMainInvokeEvent, id: number, data: Partial<GLAccountData>, userId: number) => {
    return await getService().update(id, data, userId);
  });

  ipcMain.handle('gl:delete-account', async (_event: IpcMainInvokeEvent, id: number, userId: number) => {
    return await getService().delete(id, userId);
  });
}
