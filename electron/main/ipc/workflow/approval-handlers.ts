import { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from '../../electron-env'
import { ApprovalService } from '../../services/workflow/ApprovalService'

const service = new ApprovalService()

export function registerApprovalHandlers(): void {
    // Get pending approvals
    ipcMain.handle('approval:getPending', async (_event: IpcMainInvokeEvent, userId?: number) => {
        return service.getPendingApprovals(userId)
    })

    // Get all approvals with filters
    ipcMain.handle('approval:getAll', async (_event: IpcMainInvokeEvent, filters?: { status?: string; entity_type?: string }) => {
        return service.getAllApprovals(filters)
    })

    // Get approval counts for dashboard
    ipcMain.handle('approval:getCounts', async () => {
        return service.getApprovalCounts()
    })

    // Create approval request
    ipcMain.handle('approval:create', async (
        _event: IpcMainInvokeEvent,
        entityType: string,
        entityId: number,
        requestedByUserId: number
    ) => {
        return service.createApprovalRequest(entityType, entityId, requestedByUserId)
    })

    // Approve request
    ipcMain.handle('approval:approve', async (
        _event: IpcMainInvokeEvent,
        requestId: number,
        approverId: number
    ) => {
        return service.approve(requestId, approverId)
    })

    // Reject request
    ipcMain.handle('approval:reject', async (
        _event: IpcMainInvokeEvent,
        requestId: number,
        approverId: number,
        reason: string
    ) => {
        return service.reject(requestId, approverId, reason)
    })

    // Cancel request
    ipcMain.handle('approval:cancel', async (
        _event: IpcMainInvokeEvent,
        requestId: number,
        userId: number
    ) => {
        return service.cancel(requestId, userId)
    })
}
