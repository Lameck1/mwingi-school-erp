import { getDatabase } from '../../database'
import { InstallmentPolicyService } from '../../services/finance/InstallmentPolicyService'
import type { InstallmentPolicyData } from '../../services/finance/InstallmentPolicyService'
import { VoteHeadSpreadingService } from '../../services/finance/VoteHeadSpreadingService'
import { ROLES } from '../ipc-result'
import {
    InstallmentPolicyCreateSchema,
    InstallmentPolicyGetSchema,
    PolicyIdSchema,
    InvoiceIdSchema
} from '../schemas/fee-policy-schemas'
import { validatedHandler } from '../validated-handler'

export function registerFeePolicyHandlers(): void {
    const db = getDatabase()
    const installmentService = new InstallmentPolicyService(db)
    const voteHeadService = new VoteHeadSpreadingService(db)

    // Installment Policies
    validatedHandler('feePolicy:createInstallmentPolicy', ROLES.FINANCE, InstallmentPolicyCreateSchema, async (_event, data, actorCtx) => {
        try {
            // strip out undefined explicit keys to satisfy exactOptionalPropertyTypes
            const cleanData = { ...data }
            if (cleanData.stream_id === undefined) {
                delete cleanData.stream_id
            }

            return installmentService.createPolicy(cleanData as InstallmentPolicyData, actorCtx.id)
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })

    validatedHandler('feePolicy:getPoliciesForTerm', ROLES.STAFF, InstallmentPolicyGetSchema, async (_event, data) => {
        try {
            return {
                success: true,
                data: installmentService.getPoliciesForTerm(data.academicYearId, data.streamId, data.studentType)
            }
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })

    validatedHandler('feePolicy:getSchedule', ROLES.STAFF, PolicyIdSchema, async (_event, policyId) => {
        try {
            return {
                success: true,
                data: installmentService.getInstallmentSchedule(policyId)
            }
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })

    validatedHandler('feePolicy:deactivatePolicy', ROLES.FINANCE, PolicyIdSchema, async (_event, policyId, actorCtx) => {
        try {
            return installmentService.deactivatePolicy(policyId, actorCtx.id)
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })

    // Vote Head Balances
    validatedHandler('feePolicy:getVoteHeadBalances', ROLES.STAFF, InvoiceIdSchema, async (_event, invoiceId) => {
        try {
            return {
                success: true,
                data: voteHeadService.getVoteHeadBalance(invoiceId)
            }
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })
}
