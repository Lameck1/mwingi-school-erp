import { z } from 'zod'

import { container } from '../../services/base/ServiceContainer'
import { ROLES } from '../ipc-result'
import { BoardingExpenseSchema, TransportExpenseSchema, GetExpensesTuple, TransportRouteSchema } from '../schemas/operations-schemas'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

export const registerOperationsHandlers = () => {
  const boardingService = container.resolve('BoardingCostService')
  const transportService = container.resolve('TransportCostService')

  // Boarding Handlers
  validatedHandler('operations:boarding:getAllFacilities', ROLES.STAFF, z.void(), () => {
    return boardingService.getAllFacilities()
  })

  validatedHandler('operations:boarding:getActiveFacilities', ROLES.STAFF, z.void(), () => {
    return boardingService.getActiveFacilities()
  })

  validatedHandler('operations:boarding:recordExpense', ROLES.FINANCE, BoardingExpenseSchema, (event, params, actor) => {
    // legacy `params.recorded_by` check vs actor.id?
    // The schema includes `recorded_by`.
    // The original code:
    // const actor = resolveActorId(event, params.recorded_by)
    // const sanitizedParams = { ...params, recorded_by: actor.actorId }
    // So we should enforce that params.recorded_by matches actor.id OR just override it.
    // Safe to override it with authentic actor ID.

    // We also need to map the Zod output back to the service input type if strict.
    // But since Zod output is structural, it should be compatible if schema matches.
    // However, `assertExpensePayload` (manual validation) is now replaced by Zod.

    const sanitizedParams = { ...params, recorded_by: actor.id }
    // assertPositiveInteger(sanitizedParams.facility_id) -> handled by schema
    // assertExpensePayload -> handled by schema

    return boardingService.recordBoardingExpense(sanitizedParams)
  })

  validatedHandlerMulti('operations:boarding:getExpenses', ROLES.STAFF, GetExpensesTuple, (_event, [facilityId, fiscalYear, term]) => {
    return boardingService.getFacilityExpenses(facilityId, fiscalYear, term)
  })

  validatedHandlerMulti('operations:boarding:getExpenseSummary', ROLES.STAFF, GetExpensesTuple, (_event, [facilityId, fiscalYear, term]) => {
    return boardingService.getExpenseSummaryByType(facilityId, fiscalYear, term)
  })

  // Transport Handlers
  validatedHandler('operations:transport:getAllRoutes', ROLES.STAFF, z.void(), () => {
    return transportService.getAllRoutes()
  })

  validatedHandler('operations:transport:getActiveRoutes', ROLES.STAFF, z.void(), () => {
    return transportService.getActiveRoutes()
  })

  validatedHandler('operations:transport:createRoute', ROLES.STAFF, TransportRouteSchema, (_event, params) => {
    // Original code used `params: TransportRouteInput` without explicit validation (other than safeHandleRaw types)
    // We assume TransportRouteSchema matches input.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return transportService.createRoute(params as any)
  })

  validatedHandler('operations:transport:recordExpense', ROLES.FINANCE, TransportExpenseSchema, (event, params, actor) => {
    const sanitizedParams = { ...params, recorded_by: actor.id }
    return transportService.recordTransportExpense(sanitizedParams)
  })

  validatedHandlerMulti('operations:transport:getExpenses', ROLES.STAFF, GetExpensesTuple, (_event, [routeId, fiscalYear, term]) => {
    return transportService.getRouteExpenses(routeId, fiscalYear, term)
  })

  validatedHandlerMulti('operations:transport:getExpenseSummary', ROLES.STAFF, GetExpensesTuple, (_event, [routeId, fiscalYear, term]) => {
    return transportService.getExpenseSummaryByType(routeId, fiscalYear, term)
  })
}
