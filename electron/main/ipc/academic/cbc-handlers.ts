import { container } from '../../services/base/ServiceContainer'
import { safeHandleRaw } from '../ipc-result'

import type { CBCStrandService } from '../../services/cbc/CBCStrandService'

type StrandExpenseInput = Parameters<CBCStrandService['recordStrandExpense']>[0]
type StudentParticipationInput = Parameters<CBCStrandService['recordStudentParticipation']>[0]

export function registerCBCHandlers() {
    const cbcService = container.resolve('CBCStrandService')

    // Get all strands
    safeHandleRaw('cbc:getStrands', () => {
        try {
            return { success: true, data: cbcService.getAllStrands() }
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })

    // Get active strands
    safeHandleRaw('cbc:getActiveStrands', () => {
        try {
            return { success: true, data: cbcService.getActiveStrands() }
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })

    // Link fee category to strand
    safeHandleRaw(
        'cbc:linkFeeCategory',
        (_event, feeCategoryId: number, strandId: number, allocationPercentage: number, userId: number) => {
        try {
            const id = cbcService.linkFeeCategoryToStrand(feeCategoryId, strandId, allocationPercentage, userId)
            return { success: true, data: id }
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })

    // Record strand expense
    safeHandleRaw('cbc:recordExpense', (_event, data: StrandExpenseInput) => {
        try {
            const id = cbcService.recordStrandExpense(data)
            return { success: true, data: id }
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })

    // Get profitability report
    safeHandleRaw('cbc:getProfitabilityReport', (_event, fiscalYear: number, term?: number) => {
        try {
            return { success: true, data: cbcService.getStrandProfitability(fiscalYear, term) }
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })

    // Record participation
    safeHandleRaw('cbc:recordParticipation', (_event, data: StudentParticipationInput) => {
        try {
            const id = cbcService.recordStudentParticipation(data)
            return { success: true, data: id }
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })

    // Get student participation
    safeHandleRaw('cbc:getStudentParticipations', (_event, studentId: number) => {
        try {
            return { success: true, data: cbcService.getStudentParticipations(studentId) }
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })
}
