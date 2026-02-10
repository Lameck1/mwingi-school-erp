import { ipcMain } from '../../electron-env'
import { ApprovalService } from '../../services/workflow/ApprovalService'

import type { IpcMainInvokeEvent } from 'electron'

let cachedService: ApprovalService | null = null
const getService = () => {
    if (!cachedService) {
        cachedService = new ApprovalService()
    }
    return cachedService
}

export function registerApprovalHandlers(): void {
    // Get pending approvals
    ipcMain.handle('approval:getPending', async (_event: IpcMainInvokeEvent, userId?: number) => {
        return getService().getPendingApprovals(userId)
    })

    // Get all approvals with filters
    ipcMain.handle('approval:getAll', async (_event: IpcMainInvokeEvent, filters?: { status?: string; entity_type?: string }) => {
        return getService().getAllApprovals(filters)
    })

    // Get approval counts for dashboard
    ipcMain.handle('approval:getCounts', async () => {
        return getService().getApprovalCounts()
    })

    // Create approval request
    ipcMain.handle('approval:create', async (
        _event: IpcMainInvokeEvent,
        entityType: string,
        entityId: number,
        requestedByUserId: number
    ) => {
        return getService().createApprovalRequest(entityType, entityId, requestedByUserId)
    })

    // Approve request
    ipcMain.handle('approval:approve', async (
        _event: IpcMainInvokeEvent,
        requestId: number,
        approverId: number
    ) => {
        return getService().approve(requestId, approverId)
    })

    // Reject request
    ipcMain.handle('approval:reject', async (
        _event: IpcMainInvokeEvent,
        requestId: number,
        approverId: number,
        reason: string
    ) => {
        return getService().reject(requestId, approverId, reason)
    })

    // Cancel request
    ipcMain.handle('approval:cancel', async (
        _event: IpcMainInvokeEvent,
        requestId: number,
        userId: number
    ) => {
        return getService().cancel(requestId, userId)
    })
}
