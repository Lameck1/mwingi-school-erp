import { container } from '../../services/base/ServiceContainer'
import { ROLES, resolveActorId, safeHandleRawWithRole } from '../ipc-result'

const getService = () => container.resolve('ApprovalService')

export function registerApprovalHandlers(): void {
    // Get pending approvals
    safeHandleRawWithRole('approval:getPending', ROLES.STAFF, (event, userId?: number) => {
        const actor = resolveActorId(event, userId)
        if (!actor.success) { return actor }
        return getService().getPendingApprovals(actor.actorId)
    })

    // Get all approvals with filters
    safeHandleRawWithRole('approval:getAll', ROLES.STAFF, (_event, filters?: { status?: string; entity_type?: string }) => {
        return getService().getAllApprovals(filters)
    })

    // Get approval counts for dashboard
    safeHandleRawWithRole('approval:getCounts', ROLES.STAFF, () => {
        return getService().getApprovalCounts()
    })

    // Create approval request
    safeHandleRawWithRole('approval:create', ROLES.STAFF, (
        event,
        entityType: string,
        entityId: number,
        legacyRequestedByUserId?: number
    ) => {
        const actor = resolveActorId(event, legacyRequestedByUserId)
        if (!actor.success) { return actor }
        return getService().createApprovalRequest(entityType, entityId, actor.actorId)
    })

    // Approve request
    safeHandleRawWithRole('approval:approve', ROLES.MANAGEMENT, (
        event,
        requestId: number,
        legacyApproverId?: number
    ) => {
        const actor = resolveActorId(event, legacyApproverId)
        if (!actor.success) { return actor }
        return getService().approve(requestId, actor.actorId)
    })

    // Reject request
    safeHandleRawWithRole('approval:reject', ROLES.MANAGEMENT, (
        event,
        requestId: number,
        legacyApproverId: number | undefined,
        reason: string
    ) => {
        const actor = resolveActorId(event, legacyApproverId)
        if (!actor.success) { return actor }
        return getService().reject(requestId, actor.actorId, reason)
    })

    // Cancel request
    safeHandleRawWithRole('approval:cancel', ROLES.STAFF, (
        event,
        requestId: number,
        legacyUserId?: number
    ) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) { return actor }
        return getService().cancel(requestId, actor.actorId)
    })
}
