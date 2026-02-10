import { ipcMain } from '../../electron-env';
import { GLAccountService, type GLAccountData } from '../../services/finance/GLAccountService';

let cachedService: GLAccountService | null = null;
const getService = () => {
  if (!cachedService) {
    cachedService = new GLAccountService();
  }
  return cachedService;
};

export function registerGLAccountHandlers() {
  ipcMain.handle('gl:get-accounts', async (_, filters) => {
    return await getService().getAll(filters);
  });

  ipcMain.handle('gl:get-account', async (_, id) => {
    return await getService().getById(id);
  });

  ipcMain.handle('gl:create-account', async (_, data: GLAccountData, userId: number) => {
    return await getService().create(data, userId);
  });

  ipcMain.handle('gl:update-account', async (_, id: number, data: Partial<GLAccountData>, userId: number) => {
    return await getService().update(id, data, userId);
  });

  ipcMain.handle('gl:delete-account', async (_, id: number, userId: number) => {
    return await getService().delete(id, userId);
  });
}
