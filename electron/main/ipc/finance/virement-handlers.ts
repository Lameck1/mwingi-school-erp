import { getDatabase } from '../../database'
import { VirementPreventionService } from '../../services/finance/VirementPreventionService'
import { ROLES } from '../ipc-result'
import {
    VirementValidateSchema,
    VirementRequestSchema,
    VirementReviewSchema
} from '../schemas/virement-schemas'
import { validatedHandler } from '../validated-handler'
import { z } from 'zod'

export function registerVirementHandlers(): void {
    const db = getDatabase()
    const virementService = new VirementPreventionService(db)

    validatedHandler('virement:validateExpenditure', ROLES.FINANCE, VirementValidateSchema, async (_event, data) => {
        try {
            return {
                success: true,
                data: virementService.validateExpenditure(data.expenseAccountType, data.fundingCategoryId)
            }
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })

    validatedHandler('virement:request', ROLES.FINANCE, VirementRequestSchema, async (_event, data, actorCtx) => {
        try {
            return virementService.requestVirement(data.fromAccount, data.toAccount, data.amount, data.reason, actorCtx.id)
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })

    validatedHandler('virement:review', ROLES.MANAGEMENT, VirementReviewSchema, async (_event, data, actorCtx) => {
        try {
            return virementService.reviewVirement(data.requestId, data.decision, data.reviewNotes, actorCtx.id)
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })

    validatedHandler('virement:getPendingRequests', ROLES.STAFF, z.void(), async () => {
        try {
            return {
                success: true,
                data: virementService.getPendingRequests()
            }
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })

    validatedHandler('virement:getAccountSummaries', ROLES.STAFF, z.void(), async () => {
        try {
            return {
                success: true,
                data: virementService.getAccountSummaries()
            }
        } catch (error) {
            return { success: false, error: (error as Error).message }
        }
    })
}
