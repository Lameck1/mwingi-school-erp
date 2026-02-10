import * as path from 'path'

import { ipcMain, shell, app } from '../../electron-env'
import { BackupService } from '../../services/BackupService'

import type { IpcMainInvokeEvent } from 'electron'

export function registerBackupHandlers(): void {

    ipcMain.handle('backup:create', async () => {
        const result = await BackupService.createBackup()
        return { ...result, cancelled: false }
    })

    ipcMain.handle('backup:createTo', async (_event: IpcMainInvokeEvent, filePath: string) => {
        const result = await BackupService.createBackupToPath(filePath)
        return { ...result, cancelled: false }
    })

    ipcMain.handle('backup:getList', async () => {
        return BackupService.listBackups()
    })

    ipcMain.handle('backup:restore', async (_event: IpcMainInvokeEvent, filename: string) => {
        const success = await BackupService.restoreBackup(filename)
        return { success, message: success ? 'Restore initiated. App will restart.' : 'Restore failed', cancelled: false }
    })

    ipcMain.handle('backup:openFolder', async () => {
        // We need to access private static or just reconstruct path
        // It's cleaner to ask Service for path or just use userData/backups
        // Let's add a openFolder method to Service or just do it here
        // BackupService.BACKUP_DIR is private.
        // Let's use shell.openPath with userData
        // But better to expose a method in Service if we want to change dir later.
        // For now, let's assume standard path is okay to expose via helper if needed.
        // Actually, let's just use the known path in Service or make it public.
        // I will make it public getter in Service correction or just assume standard path here.
        // Let's stick to standard path here for now.
        const backupDir = path.join(app.getPath('userData'), 'backups')
        await shell.openPath(backupDir)
        return { success: true }
    })
}
