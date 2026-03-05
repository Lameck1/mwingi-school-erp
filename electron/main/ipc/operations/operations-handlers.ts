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

  validatedHandler('operations:boarding:recordExpense', ROLES.FINANCE, BoardingExpenseSchema, (_event, params, actor) => {
    if (params.recorded_by !== actor.id) {
      throw new Error('Unauthorized: renderer user mismatch')
    }
    const sanitizedParams = {
      facility_id: params.facility_id,
      gl_account_code: params.gl_account_code,
      fiscal_year: params.fiscal_year,
      term: params.term,
      amount_cents: params.amount_cents,
      expense_type: params.expense_type,
      description: params.description,
      recorded_by: actor.id,
      ...(params.payment_method === undefined ? {} : { payment_method: params.payment_method })
    }

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
    return transportService.createRoute({
      route_name: params.route_name,
      distance_km: params.distance_km,
      estimated_students: params.estimated_students,
      budget_per_term_cents: params.budget_per_term_cents,
      ...(params.driver_id === undefined ? {} : { driver_id: params.driver_id }),
      ...(params.vehicle_registration === undefined ? {} : { vehicle_registration: params.vehicle_registration })
    })
  })

  validatedHandler('operations:transport:recordExpense', ROLES.FINANCE, TransportExpenseSchema, (_event, params, actor) => {
    if (params.recorded_by !== actor.id) {
      throw new Error('Unauthorized: renderer user mismatch')
    }
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
