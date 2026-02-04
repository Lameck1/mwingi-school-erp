import { ipcMain } from 'electron';
import { OpeningBalanceService, OpeningBalanceImport, StudentOpeningBalance } from '../../services/accounting/OpeningBalanceService';

const service = new OpeningBalanceService();

export function registerOpeningBalanceHandlers() {
  ipcMain.handle('opening-balance:import-student', async (_, balances: StudentOpeningBalance[], academicYearId: number, importSource: string, userId: number) => {
    return await service.importStudentOpeningBalances(balances, academicYearId, importSource, userId);
  });

  ipcMain.handle('opening-balance:import-gl', async (_, balances: OpeningBalanceImport[], userId: number) => {
    return await service.importGLOpeningBalances(balances, userId);
  });
}
