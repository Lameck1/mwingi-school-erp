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

export function registerCBCHandlers() {
    const cbcService = container.resolve('CBCStrandService')

    const normalizeExpensePayload = (data: z.infer<typeof CbcRecordExpenseSchema>) => {
        const payload: {
            strand_id: number
            expense_date: string
            description: string
            gl_account_code: string
            amount_cents: number
            term: number
            fiscal_year: number
            created_by: number
            receipt_number?: string
        } = {
            strand_id: data.strand_id,
            expense_date: data.expense_date,
            description: data.description,
            gl_account_code: data.gl_account_code,
            amount_cents: data.amount_cents,
            term: data.term,
            fiscal_year: data.fiscal_year,
            created_by: data.created_by
        }
        if (data.receipt_number !== undefined) {
            payload.receipt_number = data.receipt_number
        }
        return payload
    }

    // Get all strands
    validatedHandler('cbc:getStrands', ROLES.STAFF, z.undefined(), () => {
        return { success: true, data: cbcService.getAllStrands() }
    })

    // Get active strands
    validatedHandler('cbc:getActiveStrands', ROLES.STAFF, z.undefined(), () => {
        return { success: true, data: cbcService.getActiveStrands() }
    })

    // Link fee category to strand
    validatedHandlerMulti('cbc:linkFeeCategory', ROLES.FINANCE, CbcLinkFeeSchema, (_event, [feeCategoryId, strandId, allocationPercentage], actor) => {
        const id = cbcService.linkFeeCategoryToStrand(feeCategoryId, strandId, allocationPercentage, actor.id)
        return { success: true, data: id }
    })

    // Record strand expense
    validatedHandler('cbc:recordExpense', ROLES.FINANCE, CbcRecordExpenseSchema, (_event, data) => {
        const id = cbcService.recordStrandExpense(normalizeExpensePayload(data))
        return { success: true, data: id }
    })

    // Get profitability report
    validatedHandlerMulti('cbc:getProfitabilityReport', ROLES.STAFF, CbcGetProfitabilitySchema, (_event, [fiscalYear, term]) => {
        return { success: true, data: cbcService.getStrandProfitability(fiscalYear, term) }
    })

    // Record participation
    validatedHandler('cbc:recordParticipation', ROLES.STAFF, CbcRecordParticipationSchema, (_event, data) => {
        const id = cbcService.recordStudentParticipation(data)
        return { success: true, data: id }
    })

    // Get student participation
    validatedHandlerMulti('cbc:getStudentParticipations', ROLES.STAFF, CbcGetParticipationSchema, (_event, [studentId]) => {
        return { success: true, data: cbcService.getStudentParticipations(studentId) }
    })
}
