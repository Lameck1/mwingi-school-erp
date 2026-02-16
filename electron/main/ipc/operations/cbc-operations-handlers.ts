import { container } from '../../services/base/ServiceContainer'
import { safeHandleRawWithRole, ROLES, resolveActorId } from '../ipc-result'

import type { GrantTrackingService } from '../../services/operations/GrantTrackingService'
import type { StudentCostService } from '../../services/operations/StudentCostService'

type GrantCreateInput = Parameters<GrantTrackingService['createGrant']>[0]
type GrantUtilizationInput = Parameters<GrantTrackingService['recordUtilization']>[0]
type GrantStatus = Parameters<GrantTrackingService['getGrantsByStatus']>[0]
type StudentCostPeriodCount = Parameters<StudentCostService['getCostTrendAnalysis']>[1]

export const registerCbcOperationsHandlers = () => {
  const grantService = container.resolve('GrantTrackingService')
  const studentCostService = container.resolve('StudentCostService')

  // Grant Handlers
  safeHandleRawWithRole('operations:grants:create', ROLES.FINANCE, (event, data: GrantCreateInput, legacyUserId?: number) => {
    const actor = resolveActorId(event, legacyUserId)
    if (!actor.success) {
      return { success: false, error: actor.error }
    }
    return grantService.createGrant(data, actor.actorId)
  })

  safeHandleRawWithRole('operations:grants:recordUtilization', ROLES.FINANCE, (event, payload: GrantUtilizationInput) => {
    const actor = resolveActorId(event, payload.userId)
    if (!actor.success) {
      return { success: false, error: actor.error }
    }
    return grantService.recordUtilization({ ...payload, userId: actor.actorId })
  })

  safeHandleRawWithRole('operations:grants:getSummary', ROLES.STAFF, (_event, grantId: number) => {
    return grantService.getGrantSummary(grantId)
  })

  safeHandleRawWithRole('operations:grants:getByStatus', ROLES.STAFF, (_event, status: GrantStatus) => {
    return grantService.getGrantsByStatus(status)
  })

  safeHandleRawWithRole('operations:grants:getExpiring', ROLES.STAFF, (_event, daysThreshold: number) => {
    return grantService.getExpiringGrants(daysThreshold)
  })

  safeHandleRawWithRole('operations:grants:generateNEMISExport', ROLES.FINANCE, (_event, fiscalYear: number) => {
    return grantService.generateNEMISExport(fiscalYear)
  })

  // Student Cost Handlers
  safeHandleRawWithRole('operations:studentCost:calculate', ROLES.STAFF, (_event, studentId: number, termId: number, academicYearId: number) => {
    return studentCostService.calculateStudentCost(studentId, termId, academicYearId)
  })

  safeHandleRawWithRole('operations:studentCost:getBreakdown', ROLES.STAFF, (_event, studentId: number, termId: number) => {
    return studentCostService.getCostBreakdown(studentId, termId)
  })

  safeHandleRawWithRole('operations:studentCost:getVsRevenue', ROLES.STAFF, (_event, studentId: number, termId: number) => {
    return studentCostService.getCostVsRevenue(studentId, termId)
  })

  safeHandleRawWithRole('operations:studentCost:getAverage', ROLES.STAFF, (_event, grade: number, termId: number) => {
    return studentCostService.getAverageCostPerStudent(grade, termId)
  })

  safeHandleRawWithRole('operations:studentCost:getTrend', ROLES.STAFF, (_event, studentId: number, periods: StudentCostPeriodCount = 6) => {
    return studentCostService.getCostTrendAnalysis(studentId, periods)
  })
}
