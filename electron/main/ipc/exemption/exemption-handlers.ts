import { ipcMain } from '../../electron-env'
import { ExemptionService, type ExemptionCreateData } from '../../services/finance/ExemptionService'

import type { IpcMainInvokeEvent } from 'electron'

export function registerExemptionHandlers(): void {
    const exemptionService = new ExemptionService()
    type CalculateExemptionArgs = [
        studentId: number,
        academicYearId: number,
        termId: number,
        categoryId: number,
        originalAmount: number
    ]

    ipcMain.handle('exemption:getAll', async (_event: IpcMainInvokeEvent, filters?: {
        studentId?: number;
        academicYearId?: number;
        termId?: number;
        status?: string
    }) => {
        return exemptionService.getExemptions(filters)
    })

    ipcMain.handle('exemption:getById', async (_event: IpcMainInvokeEvent, id: number) => {
        return exemptionService.getExemptionById(id)
    })

    ipcMain.handle('exemption:getStudentExemptions', async (_event: IpcMainInvokeEvent, studentId: number, academicYearId: number, termId: number) => {
        return exemptionService.getStudentExemptions(studentId, academicYearId, termId)
    })

    ipcMain.handle('exemption:calculate', async (_event: IpcMainInvokeEvent, ...[studentId, academicYearId, termId, categoryId, originalAmount]: CalculateExemptionArgs) => {
        return exemptionService.calculateExemption(studentId, academicYearId, termId, categoryId, originalAmount)
    })

    ipcMain.handle('exemption:create', async (_event: IpcMainInvokeEvent, data: ExemptionCreateData, userId: number) => {
        return exemptionService.createExemption(data, userId)
    })

    ipcMain.handle('exemption:revoke', async (_event: IpcMainInvokeEvent, id: number, reason: string, userId: number) => {
        return exemptionService.revokeExemption(id, reason, userId)
    })

    ipcMain.handle('exemption:getStats', async (_event: IpcMainInvokeEvent, academicYearId?: number) => {
        return exemptionService.getExemptionStats(academicYearId)
    })
}
