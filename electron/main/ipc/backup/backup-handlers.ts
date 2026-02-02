import { ipcMain } from '../../electron-env'
import { BackupService } from '../../services/BackupService'
import { shell, IpcMainInvokeEvent } from 'electron'
import * as path from 'path'

export function registerBackupHandlers(): void {

    ipcMain.handle('backup:create', async () => {
        return BackupService.createBackup()
    })

    ipcMain.handle('backup:getList', async () => {
        return BackupService.listBackups()
    })

    ipcMain.handle('backup:restore', async (_event: IpcMainInvokeEvent, filename: string) => {
        return BackupService.restoreBackup(filename)
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
        const { app } = await import('electron')
        const backupDir = path.join(app.getPath('userData'), 'backups')
        await shell.openPath(backupDir)
        return { success: true }
    })
}
