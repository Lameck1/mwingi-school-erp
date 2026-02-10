import { ipcMain } from '../../electron-env'
import { GrantTrackingService } from '../../services/operations/GrantTrackingService'
import { StudentCostService } from '../../services/operations/StudentCostService'

export const registerCbcOperationsHandlers = () => {
  const grantService = new GrantTrackingService()
  const studentCostService = new StudentCostService()

  // Grant Handlers
  ipcMain.handle('operations:grants:create', (_event, data, userId) => {
    return grantService.createGrant(data, userId)
  })

  ipcMain.handle('operations:grants:recordUtilization', (_event, payload) => {
    return grantService.recordUtilization(payload)
  })

  ipcMain.handle('operations:grants:getSummary', (_event, grantId) => {
    return grantService.getGrantSummary(grantId)
  })

  ipcMain.handle('operations:grants:getByStatus', (_event, status) => {
    return grantService.getGrantsByStatus(status)
  })

  ipcMain.handle('operations:grants:getExpiring', (_event, daysThreshold) => {
    return grantService.getExpiringGrants(daysThreshold)
  })

  ipcMain.handle('operations:grants:generateNEMISExport', (_event, fiscalYear) => {
    return grantService.generateNEMISExport(fiscalYear)
  })

  // Student Cost Handlers
  ipcMain.handle('operations:studentCost:calculate', (_event, studentId, termId, academicYearId) => {
    return studentCostService.calculateStudentCost(studentId, termId, academicYearId)
  })

  ipcMain.handle('operations:studentCost:getBreakdown', (_event, studentId, termId) => {
    return studentCostService.getCostBreakdown(studentId, termId)
  })

  ipcMain.handle('operations:studentCost:getVsRevenue', (_event, studentId, termId) => {
    return studentCostService.getCostVsRevenue(studentId, termId)
  })

  ipcMain.handle('operations:studentCost:getAverage', (_event, grade, termId) => {
    return studentCostService.getAverageCostPerStudent(grade, termId)
  })

  ipcMain.handle('operations:studentCost:getTrend', (_event, studentId, periods) => {
    return studentCostService.getCostTrendAnalysis(studentId, periods)
  })
}
