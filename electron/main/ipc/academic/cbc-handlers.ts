import { getDatabase } from '../../database'
import { ipcMain } from '../../electron-env'
import { CBCStrandService } from '../../services/cbc/CBCStrandService'

import type { IpcMainInvokeEvent } from 'electron'

type StrandExpenseInput = Parameters<CBCStrandService['recordStrandExpense']>[0]
type StudentParticipationInput = Parameters<CBCStrandService['recordStudentParticipation']>[0]

export function registerCBCHandlers() {
    const db = getDatabase()
    const cbcService = new CBCStrandService(db)

    // Get all strands
    ipcMain.handle('cbc:getStrands', async () => {
        try {
            return { success: true, data: cbcService.getAllStrands() }
        } catch (error) {
            return { success: false, message: (error as Error).message }
        }
    })

    // Get active strands
    ipcMain.handle('cbc:getActiveStrands', async () => {
        try {
            return { success: true, data: cbcService.getActiveStrands() }
        } catch (error) {
            return { success: false, message: (error as Error).message }
        }
    })

    // Link fee category to strand
    ipcMain.handle(
        'cbc:linkFeeCategory',
        async (_event: IpcMainInvokeEvent, feeCategoryId: number, strandId: number, allocationPercentage: number, userId: number) => {
        try {
            const id = cbcService.linkFeeCategoryToStrand(feeCategoryId, strandId, allocationPercentage, userId)
            return { success: true, data: id }
        } catch (error) {
            return { success: false, message: (error as Error).message }
        }
    })

    // Record strand expense
    ipcMain.handle('cbc:recordExpense', async (_event: IpcMainInvokeEvent, data: StrandExpenseInput) => {
        try {
            const id = cbcService.recordStrandExpense(data)
            return { success: true, data: id }
        } catch (error) {
            return { success: false, message: (error as Error).message }
        }
    })

    // Get profitability report
    ipcMain.handle('cbc:getProfitabilityReport', async (_event: IpcMainInvokeEvent, fiscalYear: number, term?: number) => {
        try {
            return { success: true, data: cbcService.getStrandProfitability(fiscalYear, term) }
        } catch (error) {
            return { success: false, message: (error as Error).message }
        }
    })

    // Record participation
    ipcMain.handle('cbc:recordParticipation', async (_event: IpcMainInvokeEvent, data: StudentParticipationInput) => {
        try {
            const id = cbcService.recordStudentParticipation(data)
            return { success: true, data: id }
        } catch (error) {
            return { success: false, message: (error as Error).message }
        }
    })

    // Get student participation
    ipcMain.handle('cbc:getStudentParticipations', async (_event: IpcMainInvokeEvent, studentId: number) => {
        try {
            return { success: true, data: cbcService.getStudentParticipations(studentId) }
        } catch (error) {
            return { success: false, message: (error as Error).message }
        }
    })
}
