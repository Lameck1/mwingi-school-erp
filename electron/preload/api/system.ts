import { ipcRenderer } from 'electron'

import type { ImportConfig, UserCreateData, UserUpdateData } from '../types'

export function createSystemAPI() {
  return {
    // Backup
    createBackup: () => ipcRenderer.invoke('backup:create'),
    createBackupTo: (filePath: string) => ipcRenderer.invoke('backup:createTo', filePath),
    restoreBackup: (filePath: string) => ipcRenderer.invoke('backup:restore', filePath),
    getBackupList: () => ipcRenderer.invoke('backup:getList'),
    openBackupFolder: () => ipcRenderer.invoke('backup:openFolder'),

    // Users
    getUsers: () => ipcRenderer.invoke('user:getAll'),
    createUser: (data: UserCreateData) => ipcRenderer.invoke('user:create', data),
    updateUser: (id: number, data: UserUpdateData) => ipcRenderer.invoke('user:update', id, data),
    toggleUserStatus: (id: number, isActive: boolean) => ipcRenderer.invoke('user:toggleStatus', id, isActive),
    resetUserPassword: (id: number, newPassword: string) => ipcRenderer.invoke('user:resetPassword', id, newPassword),

    // Approval Workflows
    getPendingApprovals: (userId?: number) => ipcRenderer.invoke('approval:getPending', userId),
    getAllApprovals: (filters?: { status?: string; entity_type?: string }) => ipcRenderer.invoke('approval:getAll', filters),
    getApprovalCounts: () => ipcRenderer.invoke('approval:getCounts'),
    createApprovalRequest: (entityType: string, entityId: number, userId: number) => ipcRenderer.invoke('approval:create', entityType, entityId, userId),
    approveRequest: (requestId: number, approverId: number) => ipcRenderer.invoke('approval:approve', requestId, approverId),
    rejectRequest: (requestId: number, approverId: number, reason: string) => ipcRenderer.invoke('approval:reject', requestId, approverId, reason),
    cancelApprovalRequest: (requestId: number, userId: number) => ipcRenderer.invoke('approval:cancel', requestId, userId),

    // Data Import
    importData: (filePath: string, config: ImportConfig, userId: number) => ipcRenderer.invoke('data:import', filePath, config, userId),
    getImportTemplate: (entityType: string) => ipcRenderer.invoke('data:getTemplate', entityType),
    downloadImportTemplate: (entityType: string) => ipcRenderer.invoke('data:downloadTemplate', entityType),

    // Updates
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    installUpdate: () => ipcRenderer.invoke('install-update'),
    getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  }
}
