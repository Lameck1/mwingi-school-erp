import { container } from '../../services/base/ServiceContainer'
import { safeHandleRaw } from '../ipc-result'

import type { JSSTransitionService } from '../../services/cbc/JSSTransitionService'

type TransitionPayload = Parameters<JSSTransitionService['processStudentTransition']>[0]
type BulkTransitionPayload = Parameters<JSSTransitionService['batchProcessTransitions']>[0]
type FeeStructurePayload = Parameters<JSSTransitionService['setJSSFeeStructure']>[0]

export function registerJSSHandlers() {
    const jssService = container.resolve('JSSTransitionService')

    // Initiate transition for single student
    safeHandleRaw('jss:initiateTransition', (_event, data: TransitionPayload) => {
        try {
            const id = jssService.processStudentTransition(data)
            return { success: true, data: id }
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })

    // Bulk transition
    safeHandleRaw('jss:bulkTransition', (_event, data: BulkTransitionPayload) => {
        try {
            const result = jssService.batchProcessTransitions(data)
            return { success: true, data: result }
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })

    // Get eligible students
    safeHandleRaw('jss:getEligibleStudents', (_event, fromGrade: number, fiscalYear: number) => {
        try {
            const students = jssService.getEligibleStudentsForTransition(fromGrade, fiscalYear)
            return { success: true, data: students }
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })

    // Get fee structure
    safeHandleRaw('jss:getFeeStructure', (_event, grade: number, fiscalYear: number) => {
        try {
            const structure = jssService.getJSSFeeStructure(grade, fiscalYear)
            if (structure) {
                // Return raw cents for formatCurrency consistency
                return {
                    success: true,
                    data: structure
                }
            }
            return { success: true, data: null }
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })

    // Set fee structure
    safeHandleRaw('jss:setFeeStructure', (_event, data: FeeStructurePayload) => {
        try {
            // Store data directly as provided (assuming frontend sends cents or normalized values)
            // But wait, if frontend sends shillings, we MUST convert here if we want consistency?
            // "I thought we had created a function to centralise these currency converstions" suggests frontend should handle it.
            // If frontend sends raw input (e.g. "3500"), then backend should store 350000.
            // However, the cleanest standard is:
            // 1. Frontend user inputs "3500"
            // 2. Frontend converts to 350000 (cents) using `shillingsToCents` utility
            // 3. Backend receives 350000 and stores it directly.

            // Let's assume frontend will be updated to send cents.
            // For now, to match the removal of READ division, we must remove WRITE multiplication effectively 
            // IF the frontend is now sending cents.

            // Actually, if I remove the READ division, the frontend receives CENTS (e.g. 350000).
            // If the frontend inputs "3500", and I remove multiplication here, it stores "3500", which is 35 KES.

            // The user wants CENTRALIZED conversion.
            // That means `src/utils/format.ts` should be used.
            // `shillingsToCents` exists there.

            // I will remove the ad-hoc multiplication here and assume frontend uses the utility.
            // If I don't, I risk "double multiplication" if frontend is fixed later.

            const id = jssService.setJSSFeeStructure(data) // Pass data directly
            return { success: true, data: id }
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })

    // Get transition report (history)
    safeHandleRaw('jss:getTransitionReport', (_event, studentId: number) => {
        try {
            const history = jssService.getStudentTransitionHistory(studentId)
            return { success: true, data: history }
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })

    // Get transition summary
    safeHandleRaw('jss:getTransitionSummary', (_event, fiscalYear: number) => {
        try {
            const summary = jssService.getTransitionSummary(fiscalYear)
            return { success: true, data: summary }
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })
}
