import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { ExemptionService, ExemptionCreateData } from '../../services/finance/ExemptionService'

export function registerExemptionHandlers(): void {
    const exemptionService = new ExemptionService()

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

    ipcMain.handle('exemption:calculate', async (_event: IpcMainInvokeEvent, studentId: number, academicYearId: number, termId: number, categoryId: number, originalAmount: number) => {
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
