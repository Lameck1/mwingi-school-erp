import { container } from '../../services/base/ServiceContainer';
import { ROLES } from '../ipc-result';
import { ImportStudentBalanceTuple, ImportGLBalanceTuple } from '../schemas/finance-schemas';
import { validatedHandlerMulti } from '../validated-handler';

const getService = () => container.resolve('OpeningBalanceService');

export function registerOpeningBalanceHandlers() {
  validatedHandlerMulti('opening-balance:import-student', ROLES.FINANCE, ImportStudentBalanceTuple, async (event, [balances, academicYearId, importSource, legacyUserId], actor) => {
    if (legacyUserId !== undefined && legacyUserId !== actor.id) {
      throw new Error("Unauthorized: renderer user mismatch")
    }
    const enrichedBalances = balances.map(b => ({
      ...b,
      admission_number: b.admission_number ?? '',
      student_name: b.student_name ?? '',
      description: b.description ?? ''
    }))
    return await getService().importStudentOpeningBalances(enrichedBalances, academicYearId, importSource, actor.id);
  });

  validatedHandlerMulti('opening-balance:import-gl', ROLES.FINANCE, ImportGLBalanceTuple, async (event, [balances, legacyUserId], actor) => {
    if (legacyUserId !== undefined && legacyUserId !== actor.id) {
      throw new Error("Unauthorized: renderer user mismatch")
    }
    // internal fields injection
    const enrichedBalances = balances.map(b => ({
      ...b,
      imported_from: 'MANUAL', // or 'EXCEL' etc? Manual implied here
      imported_by_user_id: actor.id,
      description: b.description ?? ''
    }))
    return await getService().importGLOpeningBalances(enrichedBalances, actor.id);
  });
}
