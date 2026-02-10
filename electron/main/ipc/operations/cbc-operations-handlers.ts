import { ipcMain } from '../../electron-env'
import { GrantTrackingService } from '../../services/operations/GrantTrackingService'
import { StudentCostService } from '../../services/operations/StudentCostService'

import type { IpcMainInvokeEvent } from 'electron'

type GrantCreateInput = Parameters<GrantTrackingService['createGrant']>[0]
type GrantUtilizationInput = Parameters<GrantTrackingService['recordUtilization']>[0]
type GrantStatus = Parameters<GrantTrackingService['getGrantsByStatus']>[0]
type StudentCostPeriodCount = Parameters<StudentCostService['getCostTrendAnalysis']>[1]

export const registerCbcOperationsHandlers = () => {
  const grantService = new GrantTrackingService()
  const studentCostService = new StudentCostService()

  // Grant Handlers
  ipcMain.handle('operations:grants:create', (_event: IpcMainInvokeEvent, data: GrantCreateInput, userId: number) => {
    return grantService.createGrant(data, userId)
  })

  ipcMain.handle('operations:grants:recordUtilization', (_event: IpcMainInvokeEvent, payload: GrantUtilizationInput) => {
    return grantService.recordUtilization(payload)
  })

  ipcMain.handle('operations:grants:getSummary', (_event: IpcMainInvokeEvent, grantId: number) => {
    return grantService.getGrantSummary(grantId)
  })

  ipcMain.handle('operations:grants:getByStatus', (_event: IpcMainInvokeEvent, status: GrantStatus) => {
    return grantService.getGrantsByStatus(status)
  })

  ipcMain.handle('operations:grants:getExpiring', (_event: IpcMainInvokeEvent, daysThreshold: number) => {
    return grantService.getExpiringGrants(daysThreshold)
  })

  ipcMain.handle('operations:grants:generateNEMISExport', (_event: IpcMainInvokeEvent, fiscalYear: number) => {
    return grantService.generateNEMISExport(fiscalYear)
  })

  // Student Cost Handlers
  ipcMain.handle('operations:studentCost:calculate', (_event: IpcMainInvokeEvent, studentId: number, termId: number, academicYearId: number) => {
    return studentCostService.calculateStudentCost(studentId, termId, academicYearId)
  })

  ipcMain.handle('operations:studentCost:getBreakdown', (_event: IpcMainInvokeEvent, studentId: number, termId: number) => {
    return studentCostService.getCostBreakdown(studentId, termId)
  })

  ipcMain.handle('operations:studentCost:getVsRevenue', (_event: IpcMainInvokeEvent, studentId: number, termId: number) => {
    return studentCostService.getCostVsRevenue(studentId, termId)
  })

  ipcMain.handle('operations:studentCost:getAverage', (_event: IpcMainInvokeEvent, grade: number, termId: number) => {
    return studentCostService.getAverageCostPerStudent(grade, termId)
  })

  ipcMain.handle('operations:studentCost:getTrend', (_event: IpcMainInvokeEvent, studentId: number, periods: StudentCostPeriodCount = 6) => {
    return studentCostService.getCostTrendAnalysis(studentId, periods)
  })
}
