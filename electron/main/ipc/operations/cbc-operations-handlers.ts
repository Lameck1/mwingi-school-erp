import { z } from 'zod'

import { container } from '../../services/base/ServiceContainer'
import { ROLES } from '../ipc-result'
import {
  GrantCreateTuple, CreateUtilizationTuple, GetExpiringGrantsTuple,
  CostCalculateTuple, CostBreakdownTuple, CostAverageTuple, CostTrendTuple
} from '../schemas/operations-schemas'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

export const registerCbcOperationsHandlers = () => {
  const grantService = container.resolve('GrantTrackingService')
  const studentCostService = container.resolve('StudentCostService')

  // Grant Handlers
  validatedHandlerMulti('operations:grants:create', ROLES.FINANCE, GrantCreateTuple, (event, [data, legacyUserId], actor) => {
    if (legacyUserId !== undefined && legacyUserId !== actor.id) {
      throw new Error("Unauthorized: renderer user mismatch")
    }
    return grantService.createGrant(data, actor.id)
  })

  validatedHandlerMulti('operations:grants:recordUtilization', ROLES.FINANCE, CreateUtilizationTuple, (event, [payload], actor) => {
    // payload has userId? Check it.
    if (payload.userId !== undefined && payload.userId !== actor.id) {
      throw new Error("Unauthorized: renderer user mismatch")
    }
    // Force actor ID
    const finalPayload = { ...payload, userId: actor.id }
    return grantService.recordUtilization(finalPayload)
  })

  validatedHandler('operations:grants:getSummary', ROLES.STAFF, z.number().int().positive(), (_event, grantId) => {
    return grantService.getGrantSummary(grantId)
  })

  validatedHandler('operations:grants:getByStatus', ROLES.STAFF, z.string(), (_event, status) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return grantService.getGrantsByStatus(status as any)
  })

  validatedHandlerMulti('operations:grants:getExpiring', ROLES.STAFF, GetExpiringGrantsTuple, (_event, [daysThreshold]) => {
    return grantService.getExpiringGrants(daysThreshold)
  })

  validatedHandler('operations:grants:generateNEMISExport', ROLES.FINANCE, z.number().int().positive(), (_event, fiscalYear) => {
    return grantService.generateNEMISExport(fiscalYear)
  })

  // Student Cost Handlers
  validatedHandlerMulti('operations:studentCost:calculate', ROLES.STAFF, CostCalculateTuple, (_event, [studentId, termId, academicYearId]) => {
    return studentCostService.calculateStudentCost(studentId, termId, academicYearId)
  })

  validatedHandlerMulti('operations:studentCost:getBreakdown', ROLES.STAFF, CostBreakdownTuple, (_event, [studentId, termId]) => {
    return studentCostService.getCostBreakdown(studentId, termId)
  })

  validatedHandlerMulti('operations:studentCost:getVsRevenue', ROLES.STAFF, CostBreakdownTuple, (_event, [studentId, termId]) => {
    return studentCostService.getCostVsRevenue(studentId, termId)
  })

  validatedHandlerMulti('operations:studentCost:getAverage', ROLES.STAFF, CostAverageTuple, (_event, [grade, termId]) => {
    return studentCostService.getAverageCostPerStudent(grade, termId)
  })

  validatedHandlerMulti('operations:studentCost:getTrend', ROLES.STAFF, CostTrendTuple, (_event, [studentId, periods]) => {
    return studentCostService.getCostTrendAnalysis(studentId, periods ?? 6)
  })
}
