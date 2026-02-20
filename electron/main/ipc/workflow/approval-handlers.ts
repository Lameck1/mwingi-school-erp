import { z } from 'zod'

import { container } from '../../services/base/ServiceContainer'
import { ROLES } from '../ipc-result'
import { ApprovalFilterSchema } from '../schemas/workflow-schemas'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

const getService = () => container.resolve('ApprovalService')

export function registerApprovalHandlers(): void {
    // Get pending approvals
    validatedHandler('approval:getPending', ROLES.STAFF, z.number().optional(), (_event, userId, actor) => {
        // userId from arg is legacy; check against actor.id if present
        if (userId !== undefined && userId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        return getService().getPendingApprovals(actor.id)
    })

    // Get all approvals with filters
    validatedHandler('approval:getAll', ROLES.STAFF, ApprovalFilterSchema, (_event, filters) => {
        return getService().getAllApprovals(filters)
    })

    // Get approval counts for dashboard
    validatedHandler('approval:getCounts', ROLES.STAFF, z.void(), () => {
        return getService().getApprovalCounts()
    })

    // Create approval request
    validatedHandlerMulti('approval:create', ROLES.STAFF, z.tuple([z.string(), z.number(), z.number().optional()]), (_event, [entityType, entityId, legacyUserId], actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        return getService().createApprovalRequest(entityType, entityId, actor.id)
    })

    // Approve request
    validatedHandlerMulti('approval:approve', ROLES.MANAGEMENT, z.tuple([z.number(), z.number().optional()]), (_event, [requestId, legacyId], actor) => {
        if (legacyId !== undefined && legacyId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        return getService().approve(requestId, actor.id)
    })

    // Reject request
    validatedHandlerMulti('approval:reject', ROLES.MANAGEMENT, z.tuple([z.number(), z.number().optional(), z.string()]), (_event, [requestId, legacyId, reason], actor) => {
        if (legacyId !== undefined && legacyId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        return getService().reject(requestId, actor.id, reason)
    })

    // Cancel request
    validatedHandlerMulti('approval:cancel', ROLES.STAFF, z.tuple([z.number(), z.number().optional()]), (_event, [requestId, legacyId], actor) => {
        if (legacyId !== undefined && legacyId !== actor.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        return getService().cancel(requestId, actor.id)
    })
}
