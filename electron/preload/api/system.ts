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
    getPendingApprovals: () => ipcRenderer.invoke('approval:getPending'),
    getAllApprovals: (filters?: { status?: string; entity_type?: string }) => ipcRenderer.invoke('approval:getAll', filters),
    getApprovalCounts: () => ipcRenderer.invoke('approval:getCounts'),
    createApprovalRequest: (entityType: string, entityId: number) => ipcRenderer.invoke('approval:create', entityType, entityId),
    approveRequest: (requestId: number) => ipcRenderer.invoke('approval:approve', requestId),
    rejectRequest: (requestId: number, reason: string) => ipcRenderer.invoke('approval:reject', requestId, reason),
    cancelApprovalRequest: (requestId: number) => ipcRenderer.invoke('approval:cancel', requestId),

    // Data Import
    importData: (filePath: string, config: ImportConfig) => ipcRenderer.invoke('data:import', filePath, config),
    getImportTemplate: (entityType: string) => ipcRenderer.invoke('data:getTemplate', entityType),
    downloadImportTemplate: (entityType: string) => ipcRenderer.invoke('data:downloadTemplate', entityType),

    // Error Logging
    logError: (data: { error: string; stack?: string; componentStack?: string | null; timestamp: string }) =>
      ipcRenderer.invoke('system:logError', data),

    // Updates
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    installUpdate: () => ipcRenderer.invoke('install-update'),
    getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  }
}
