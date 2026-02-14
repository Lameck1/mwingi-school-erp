import { container } from '../../services/base/ServiceContainer'
import { safeHandleRaw } from '../ipc-result'

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
  safeHandleRaw('operations:boarding:getAllFacilities', () => {
    return boardingService.getAllFacilities()
  })

  safeHandleRaw('operations:boarding:getActiveFacilities', () => {
    return boardingService.getActiveFacilities()
  })

  safeHandleRaw('operations:boarding:recordExpense', (_event, params: BoardingExpenseInput) => {
    assertPositiveInteger(params.facility_id, 'Boarding facility')
    assertExpensePayload(params, 'Boarding')
    return boardingService.recordBoardingExpense(params)
  })

  safeHandleRaw('operations:boarding:getExpenses', (_event, facilityId: number, fiscalYear: number, term?: number) => {
    return boardingService.getFacilityExpenses(facilityId, fiscalYear, term)
  })

  safeHandleRaw('operations:boarding:getExpenseSummary', (_event, facilityId: number, fiscalYear: number, term?: number) => {
    return boardingService.getExpenseSummaryByType(facilityId, fiscalYear, term)
  })

  // Transport Handlers
  safeHandleRaw('operations:transport:getAllRoutes', () => {
    return transportService.getAllRoutes()
  })

  safeHandleRaw('operations:transport:getActiveRoutes', () => {
    return transportService.getActiveRoutes()
  })

  safeHandleRaw('operations:transport:createRoute', (_event, params: TransportRouteInput) => {
    return transportService.createRoute(params)
  })

  safeHandleRaw('operations:transport:recordExpense', (_event, params: TransportExpenseInput) => {
    assertPositiveInteger(params.route_id, 'Transport route')
    assertExpensePayload(params, 'Transport')
    return transportService.recordTransportExpense(params)
  })

  safeHandleRaw('operations:transport:getExpenses', (_event, routeId: number, fiscalYear: number, term?: number) => {
    return transportService.getRouteExpenses(routeId, fiscalYear, term)
  })

  safeHandleRaw('operations:transport:getExpenseSummary', (_event, routeId: number, fiscalYear: number, term?: number) => {
    return transportService.getExpenseSummaryByType(routeId, fiscalYear, term)
  })
}
