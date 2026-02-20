import { z } from 'zod'

import { container } from '../../services/base/ServiceContainer'
import { ROLES } from '../ipc-result'
import {
    CbcLinkFeeSchema,
    CbcRecordExpenseSchema,
    CbcGetProfitabilitySchema,
    CbcRecordParticipationSchema,
    CbcGetParticipationSchema
} from '../schemas/academic-schemas'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

import type { CBCStrandService } from '../../services/cbc/CBCStrandService'

type StrandExpenseInput = Parameters<CBCStrandService['recordStrandExpense']>[0]
type StudentParticipationInput = Parameters<CBCStrandService['recordStudentParticipation']>[0]

export function registerCBCHandlers() {
    const cbcService = container.resolve('CBCStrandService')

    // Get all strands
    validatedHandler('cbc:getStrands', ROLES.STAFF, z.undefined(), () => {
        return { success: true, data: cbcService.getAllStrands() }
    })

    // Get active strands
    validatedHandler('cbc:getActiveStrands', ROLES.STAFF, z.undefined(), () => {
        return { success: true, data: cbcService.getActiveStrands() }
    })

    // Link fee category to strand
    validatedHandlerMulti('cbc:linkFeeCategory', ROLES.FINANCE, CbcLinkFeeSchema, (event, [feeCategoryId, strandId, allocationPercentage]: [number, number, number, number?], actor) => {
        const id = cbcService.linkFeeCategoryToStrand(feeCategoryId, strandId, allocationPercentage, actor.id)
        return { success: true, data: id }
    })

    // Record strand expense
    validatedHandler('cbc:recordExpense', ROLES.FINANCE, CbcRecordExpenseSchema, (_event, data: StrandExpenseInput) => {
        const id = cbcService.recordStrandExpense(data)
        return { success: true, data: id }
    })

    // Get profitability report
    validatedHandlerMulti('cbc:getProfitabilityReport', ROLES.STAFF, CbcGetProfitabilitySchema, (_event, [fiscalYear, term]: [number, number?]) => {
        return { success: true, data: cbcService.getStrandProfitability(fiscalYear, term) }
    })

    // Record participation
    validatedHandler('cbc:recordParticipation', ROLES.STAFF, CbcRecordParticipationSchema, (_event, data: StudentParticipationInput) => {
        const id = cbcService.recordStudentParticipation(data)
        return { success: true, data: id }
    })

    // Get student participation
    validatedHandlerMulti('cbc:getStudentParticipations', ROLES.STAFF, CbcGetParticipationSchema, (_event, [studentId]: [number]) => {
        return { success: true, data: cbcService.getStudentParticipations(studentId) }
    })
}
