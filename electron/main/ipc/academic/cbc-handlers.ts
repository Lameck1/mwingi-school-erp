import { ipcMain } from 'electron'
import { getDatabase } from '../../database'
import { CBCStrandService } from '../../services/cbc/CBCStrandService'

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
    ipcMain.handle('cbc:linkFeeCategory', async (_, feeCategoryId, strandId, allocationPercentage, userId) => {
        try {
            const id = cbcService.linkFeeCategoryToStrand(feeCategoryId, strandId, allocationPercentage, userId)
            return { success: true, data: id }
        } catch (error) {
            return { success: false, message: (error as Error).message }
        }
    })

    // Record strand expense
    ipcMain.handle('cbc:recordExpense', async (_, data) => {
        try {
            const id = cbcService.recordStrandExpense(data)
            return { success: true, data: id }
        } catch (error) {
            return { success: false, message: (error as Error).message }
        }
    })

    // Get profitability report
    ipcMain.handle('cbc:getProfitabilityReport', async (_, fiscalYear, term) => {
        try {
            return { success: true, data: cbcService.getStrandProfitability(fiscalYear, term) }
        } catch (error) {
            return { success: false, message: (error as Error).message }
        }
    })

    // Record participation
    ipcMain.handle('cbc:recordParticipation', async (_, data) => {
        try {
            const id = cbcService.recordStudentParticipation(data)
            return { success: true, data: id }
        } catch (error) {
            return { success: false, message: (error as Error).message }
        }
    })

    // Get student participation
    ipcMain.handle('cbc:getStudentParticipations', async (_, studentId) => {
        try {
            return { success: true, data: cbcService.getStudentParticipations(studentId) }
        } catch (error) {
            return { success: false, message: (error as Error).message }
        }
    })
}
