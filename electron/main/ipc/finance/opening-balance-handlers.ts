import { container } from '../../services/base/ServiceContainer';
import { safeHandleRaw } from '../ipc-result';

import type { OpeningBalanceImport, StudentOpeningBalance } from '../../services/accounting/OpeningBalanceService';

const getService = () => container.resolve('OpeningBalanceService');

export function registerOpeningBalanceHandlers() {
  safeHandleRaw('opening-balance:import-student', async (_event, balances: StudentOpeningBalance[], academicYearId: number, importSource: string, userId: number) => {
    return await getService().importStudentOpeningBalances(balances, academicYearId, importSource, userId);
  });

  safeHandleRaw('opening-balance:import-gl', async (_event, balances: OpeningBalanceImport[], userId: number) => {
    return await getService().importGLOpeningBalances(balances, userId);
  });
}
