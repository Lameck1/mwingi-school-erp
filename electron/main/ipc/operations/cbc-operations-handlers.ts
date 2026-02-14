import { container } from '../../services/base/ServiceContainer'
import { safeHandleRaw } from '../ipc-result'

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
  safeHandleRaw('operations:grants:create', (_event, data: GrantCreateInput, userId: number) => {
    return grantService.createGrant(data, userId)
  })

  safeHandleRaw('operations:grants:recordUtilization', (_event, payload: GrantUtilizationInput) => {
    return grantService.recordUtilization(payload)
  })

  safeHandleRaw('operations:grants:getSummary', (_event, grantId: number) => {
    return grantService.getGrantSummary(grantId)
  })

  safeHandleRaw('operations:grants:getByStatus', (_event, status: GrantStatus) => {
    return grantService.getGrantsByStatus(status)
  })

  safeHandleRaw('operations:grants:getExpiring', (_event, daysThreshold: number) => {
    return grantService.getExpiringGrants(daysThreshold)
  })

  safeHandleRaw('operations:grants:generateNEMISExport', (_event, fiscalYear: number) => {
    return grantService.generateNEMISExport(fiscalYear)
  })

  // Student Cost Handlers
  safeHandleRaw('operations:studentCost:calculate', (_event, studentId: number, termId: number, academicYearId: number) => {
    return studentCostService.calculateStudentCost(studentId, termId, academicYearId)
  })

  safeHandleRaw('operations:studentCost:getBreakdown', (_event, studentId: number, termId: number) => {
    return studentCostService.getCostBreakdown(studentId, termId)
  })

  safeHandleRaw('operations:studentCost:getVsRevenue', (_event, studentId: number, termId: number) => {
    return studentCostService.getCostVsRevenue(studentId, termId)
  })

  safeHandleRaw('operations:studentCost:getAverage', (_event, grade: number, termId: number) => {
    return studentCostService.getAverageCostPerStudent(grade, termId)
  })

  safeHandleRaw('operations:studentCost:getTrend', (_event, studentId: number, periods: StudentCostPeriodCount = 6) => {
    return studentCostService.getCostTrendAnalysis(studentId, periods)
  })
}
