import * as path from 'node:path'

import { shell, app } from '../../electron-env'
import { BackupService } from '../../services/BackupService'
import { log } from '../../utils/logger'
import { ROLES, safeHandleRaw, safeHandleRawWithRole } from '../ipc-result'

export function registerBackupHandlers(): void {

    safeHandleRaw('system:logError', (_event, data: { error: string; stack?: string; componentStack?: string | null; timestamp: string }) => {
        log.error(`[Renderer Error] ${data.error}`, data.stack || '', data.componentStack || '')
    })

    safeHandleRawWithRole('backup:create', ROLES.ADMIN_ONLY, async () => {
        const result = await BackupService.createBackup()
        return { ...result, cancelled: false }
    })

    safeHandleRawWithRole('backup:createTo', ROLES.ADMIN_ONLY, async (_event, filePath: string) => {
        const result = await BackupService.createBackupToPath(filePath)
        return { ...result, cancelled: false }
    })

    safeHandleRawWithRole('backup:getList', ROLES.ADMIN_ONLY, () => {
        return BackupService.listBackups()
    })

    safeHandleRawWithRole('backup:restore', ROLES.ADMIN_ONLY, async (_event, filename: string) => {
        const success = await BackupService.restoreBackup(filename)
        return { success, message: success ? 'Restore initiated. App will restart.' : 'Restore failed', cancelled: false }
    })

    safeHandleRawWithRole('backup:openFolder', ROLES.ADMIN_ONLY, async () => {
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
