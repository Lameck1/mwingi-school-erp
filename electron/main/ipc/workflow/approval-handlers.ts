import { container } from '../../services/base/ServiceContainer'
import { safeHandleRaw } from '../ipc-result'

const getService = () => container.resolve('ApprovalService')

export function registerApprovalHandlers(): void {
    // Get pending approvals
    safeHandleRaw('approval:getPending', (_event, userId?: number) => {
        return getService().getPendingApprovals(userId)
    })

    // Get all approvals with filters
    safeHandleRaw('approval:getAll', (_event, filters?: { status?: string; entity_type?: string }) => {
        return getService().getAllApprovals(filters)
    })

    // Get approval counts for dashboard
    safeHandleRaw('approval:getCounts', () => {
        return getService().getApprovalCounts()
    })

    // Create approval request
    safeHandleRaw('approval:create', (
        _event,
        entityType: string,
        entityId: number,
        requestedByUserId: number
    ) => {
        return getService().createApprovalRequest(entityType, entityId, requestedByUserId)
    })

    // Approve request
    safeHandleRaw('approval:approve', (
        _event,
        requestId: number,
        approverId: number
    ) => {
        return getService().approve(requestId, approverId)
    })

    // Reject request
    safeHandleRaw('approval:reject', (
        _event,
        requestId: number,
        approverId: number,
        reason: string
    ) => {
        return getService().reject(requestId, approverId, reason)
    })

    // Cancel request
    safeHandleRaw('approval:cancel', (
        _event,
        requestId: number,
        userId: number
    ) => {
        return getService().cancel(requestId, userId)
    })
}
