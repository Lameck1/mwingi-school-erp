import { ipcMain } from '../../electron-env';
import { OpeningBalanceService, type OpeningBalanceImport, type StudentOpeningBalance } from '../../services/accounting/OpeningBalanceService';

import type { IpcMainInvokeEvent } from 'electron';

let cachedService: OpeningBalanceService | null = null;
const getService = () => {
  cachedService ??= new OpeningBalanceService();
  return cachedService;
};

export function registerOpeningBalanceHandlers() {
  ipcMain.handle('opening-balance:import-student', async (_event: IpcMainInvokeEvent, balances: StudentOpeningBalance[], academicYearId: number, importSource: string, userId: number) => {
    return await getService().importStudentOpeningBalances(balances, academicYearId, importSource, userId);
  });

  ipcMain.handle('opening-balance:import-gl', async (_event: IpcMainInvokeEvent, balances: OpeningBalanceImport[], userId: number) => {
    return await getService().importGLOpeningBalances(balances, userId);
  });
}
