import { ipcMain } from 'electron'
import { getDatabase } from '../../database'
import { JSSTransitionService } from '../../services/cbc/JSSTransitionService'

export function registerJSSHandlers() {
    const db = getDatabase()
    const jssService = new JSSTransitionService(db)

    // Initiate transition for single student
    ipcMain.handle('jss:initiateTransition', async (_, data) => {
        try {
            const id = jssService.processStudentTransition(data)
            return { success: true, data: id }
        } catch (error) {
            return { success: false, message: (error as Error).message }
        }
    })

    // Bulk transition
    ipcMain.handle('jss:bulkTransition', async (_, data) => {
        try {
            const result = jssService.batchProcessTransitions(data)
            return { success: true, data: result }
        } catch (error) {
            return { success: false, message: (error as Error).message }
        }
    })

    // Get eligible students
    ipcMain.handle('jss:getEligibleStudents', async (_, fromGrade, fiscalYear) => {
        try {
            const students = jssService.getEligibleStudentsForTransition(fromGrade, fiscalYear)
            return { success: true, data: students }
        } catch (error) {
            return { success: false, message: (error as Error).message }
        }
    })

    // Get fee structure
    ipcMain.handle('jss:getFeeStructure', async (_, grade, fiscalYear) => {
        try {
            const structure = jssService.getJSSFeeStructure(grade, fiscalYear)
            if (structure) {
                // Convert cents to shillings for display
                return {
                    success: true,
                    data: {
                        ...structure,
                        tuition_fee_cents: structure.tuition_fee_cents / 100,
                        boarding_fee_cents: structure.boarding_fee_cents ? structure.boarding_fee_cents / 100 : null,
                        activity_fee_cents: structure.activity_fee_cents ? structure.activity_fee_cents / 100 : null,
                        exam_fee_cents: structure.exam_fee_cents ? structure.exam_fee_cents / 100 : null,
                        library_fee_cents: structure.library_fee_cents ? structure.library_fee_cents / 100 : null,
                        lab_fee_cents: structure.lab_fee_cents ? structure.lab_fee_cents / 100 : null,
                        ict_fee_cents: structure.ict_fee_cents ? structure.ict_fee_cents / 100 : null
                    }
                }
            }
            return { success: true, data: null }
        } catch (error) {
            return { success: false, message: (error as Error).message }
        }
    })

    // Set fee structure
    ipcMain.handle('jss:setFeeStructure', async (_, data) => {
        try {
            // Convert shillings to cents for storage
            const dataInCents = {
                ...data,
                tuition_fee_cents: Math.round(data.tuition_fee_cents * 100),
                boarding_fee_cents: data.boarding_fee_cents ? Math.round(data.boarding_fee_cents * 100) : null,
                activity_fee_cents: data.activity_fee_cents ? Math.round(data.activity_fee_cents * 100) : null,
                exam_fee_cents: data.exam_fee_cents ? Math.round(data.exam_fee_cents * 100) : null,
                library_fee_cents: data.library_fee_cents ? Math.round(data.library_fee_cents * 100) : null,
                lab_fee_cents: data.lab_fee_cents ? Math.round(data.lab_fee_cents * 100) : null,
                ict_fee_cents: data.ict_fee_cents ? Math.round(data.ict_fee_cents * 100) : null
            }
            const id = jssService.setJSSFeeStructure(dataInCents)
            return { success: true, data: id }
        } catch (error) {
            return { success: false, message: (error as Error).message }
        }
    })

    // Get transition report (history)
    ipcMain.handle('jss:getTransitionReport', async (_, studentId) => {
        try {
            const history = jssService.getStudentTransitionHistory(studentId)
            return { success: true, data: history }
        } catch (error) {
            return { success: false, message: (error as Error).message }
        }
    })

    // Get transition summary
    ipcMain.handle('jss:getTransitionSummary', async (_, fiscalYear) => {
        try {
            const summary = jssService.getTransitionSummary(fiscalYear)
            return { success: true, data: summary }
        } catch (error) {
            return { success: false, message: (error as Error).message }
        }
    })
}
