import { ipcMain } from 'electron';
import { GLAccountService, GLAccountData } from '../../services/finance/GLAccountService';

const service = new GLAccountService();

export function registerGLAccountHandlers() {
  ipcMain.handle('gl:get-accounts', async (_, filters) => {
    return await service.getAll(filters);
  });

  ipcMain.handle('gl:get-account', async (_, id) => {
    return await service.getById(id);
  });

  ipcMain.handle('gl:create-account', async (_, data: GLAccountData, userId: number) => {
    return await service.create(data, userId);
  });

  ipcMain.handle('gl:update-account', async (_, id: number, data: Partial<GLAccountData>, userId: number) => {
    return await service.update(id, data, userId);
  });

  ipcMain.handle('gl:delete-account', async (_, id: number, userId: number) => {
    return await service.delete(id, userId);
  });
}
