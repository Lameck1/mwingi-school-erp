import { container } from '../../services/base/ServiceContainer'
import { ROLES, resolveActorId, safeHandleRawWithRole } from '../ipc-result'

import type { BoardingCostService } from '../../services/operations/BoardingCostService'
import type { TransportCostService } from '../../services/operations/TransportCostService'

type BoardingExpenseInput = Parameters<BoardingCostService['recordBoardingExpense']>[0]
type TransportRouteInput = Parameters<TransportCostService['createRoute']>[0]
type TransportExpenseInput = Parameters<TransportCostService['recordTransportExpense']>[0]

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
}

function assertExpensePayload(params: {
  amount_cents: number
  fiscal_year: number
  gl_account_code: string
  recorded_by: number
  term: number
}, context: 'Boarding' | 'Transport'): void {
  assertPositiveInteger(params.recorded_by, `${context} expense user`)
  if (!Number.isInteger(params.amount_cents) || params.amount_cents <= 0) {
    throw new Error(`${context} expense amount must be greater than zero`)
  }
  if (!Number.isInteger(params.fiscal_year) || params.fiscal_year < 2000 || params.fiscal_year > 2100) {
    throw new Error(`${context} expense fiscal year is invalid`)
  }
  if (![1, 2, 3].includes(params.term)) {
    throw new Error(`${context} expense term must be 1, 2, or 3`)
  }
  if (!params.gl_account_code || !params.gl_account_code.trim()) {
    throw new Error(`${context} expense GL account code is required`)
  }
}

export const registerOperationsHandlers = () => {
  const boardingService = container.resolve('BoardingCostService')
  const transportService = container.resolve('TransportCostService')

  // Boarding Handlers
  safeHandleRawWithRole('operations:boarding:getAllFacilities', ROLES.STAFF, () => {
    return boardingService.getAllFacilities()
  })

  safeHandleRawWithRole('operations:boarding:getActiveFacilities', ROLES.STAFF, () => {
    return boardingService.getActiveFacilities()
  })

  safeHandleRawWithRole('operations:boarding:recordExpense', ROLES.FINANCE, (event, params: BoardingExpenseInput) => {
    const actor = resolveActorId(event, params.recorded_by)
    if (!actor.success) {
      return actor
    }
    const sanitizedParams = { ...params, recorded_by: actor.actorId }
    assertPositiveInteger(sanitizedParams.facility_id, 'Boarding facility')
    assertExpensePayload(sanitizedParams, 'Boarding')
    return boardingService.recordBoardingExpense(sanitizedParams)
  })

  safeHandleRawWithRole('operations:boarding:getExpenses', ROLES.STAFF, (_event, facilityId: number, fiscalYear: number, term?: number) => {
    return boardingService.getFacilityExpenses(facilityId, fiscalYear, term)
  })

  safeHandleRawWithRole('operations:boarding:getExpenseSummary', ROLES.STAFF, (_event, facilityId: number, fiscalYear: number, term?: number) => {
    return boardingService.getExpenseSummaryByType(facilityId, fiscalYear, term)
  })

  // Transport Handlers
  safeHandleRawWithRole('operations:transport:getAllRoutes', ROLES.STAFF, () => {
    return transportService.getAllRoutes()
  })

  safeHandleRawWithRole('operations:transport:getActiveRoutes', ROLES.STAFF, () => {
    return transportService.getActiveRoutes()
  })

  safeHandleRawWithRole('operations:transport:createRoute', ROLES.STAFF, (_event, params: TransportRouteInput) => {
    return transportService.createRoute(params)
  })

  safeHandleRawWithRole('operations:transport:recordExpense', ROLES.FINANCE, (event, params: TransportExpenseInput) => {
    const actor = resolveActorId(event, params.recorded_by)
    if (!actor.success) {
      return actor
    }
    const sanitizedParams = { ...params, recorded_by: actor.actorId }
    assertPositiveInteger(sanitizedParams.route_id, 'Transport route')
    assertExpensePayload(sanitizedParams, 'Transport')
    return transportService.recordTransportExpense(sanitizedParams)
  })

  safeHandleRawWithRole('operations:transport:getExpenses', ROLES.STAFF, (_event, routeId: number, fiscalYear: number, term?: number) => {
    return transportService.getRouteExpenses(routeId, fiscalYear, term)
  })

  safeHandleRawWithRole('operations:transport:getExpenseSummary', ROLES.STAFF, (_event, routeId: number, fiscalYear: number, term?: number) => {
    return transportService.getExpenseSummaryByType(routeId, fiscalYear, term)
  })
}
