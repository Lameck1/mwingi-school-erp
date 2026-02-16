import { container } from '../../services/base/ServiceContainer'
import { safeHandleRawWithRole, ROLES, resolveActorId } from '../ipc-result'

import type { CBCStrandService } from '../../services/cbc/CBCStrandService'

type StrandExpenseInput = Parameters<CBCStrandService['recordStrandExpense']>[0]
type StudentParticipationInput = Parameters<CBCStrandService['recordStudentParticipation']>[0]

export function registerCBCHandlers() {
    const cbcService = container.resolve('CBCStrandService')

    // Get all strands
    safeHandleRawWithRole('cbc:getStrands', ROLES.STAFF, () => {
        try {
            return { success: true, data: cbcService.getAllStrands() }
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })

    // Get active strands
    safeHandleRawWithRole('cbc:getActiveStrands', ROLES.STAFF, () => {
        try {
            return { success: true, data: cbcService.getActiveStrands() }
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })

    // Link fee category to strand
    safeHandleRawWithRole(
        'cbc:linkFeeCategory',
        ROLES.FINANCE,
        (event, feeCategoryId: number, strandId: number, allocationPercentage: number, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) {
            return { success: false, error: actor.error }
        }
        try {
            const id = cbcService.linkFeeCategoryToStrand(feeCategoryId, strandId, allocationPercentage, actor.actorId)
            return { success: true, data: id }
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })

    // Record strand expense
    safeHandleRawWithRole('cbc:recordExpense', ROLES.FINANCE, (_event, data: StrandExpenseInput) => {
        try {
            const id = cbcService.recordStrandExpense(data)
            return { success: true, data: id }
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })

    // Get profitability report
    safeHandleRawWithRole('cbc:getProfitabilityReport', ROLES.STAFF, (_event, fiscalYear: number, term?: number) => {
        try {
            return { success: true, data: cbcService.getStrandProfitability(fiscalYear, term) }
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })

    // Record participation
    safeHandleRawWithRole('cbc:recordParticipation', ROLES.STAFF, (_event, data: StudentParticipationInput) => {
        try {
            const id = cbcService.recordStudentParticipation(data)
            return { success: true, data: id }
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })

    // Get student participation
    safeHandleRawWithRole('cbc:getStudentParticipations', ROLES.STAFF, (_event, studentId: number) => {
        try {
            return { success: true, data: cbcService.getStudentParticipations(studentId) }
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })
}
