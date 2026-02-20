import * as path from 'node:path'
import { z } from 'zod'

import { shell, app } from '../../electron-env'
import { BackupService } from '../../services/BackupService'
import { ROLES } from '../ipc-result'
import { BackupCreateToSchema, BackupRestoreSchema } from '../schemas/system-schemas'
import { validatedHandler } from '../validated-handler'

export function registerBackupHandlers(): void {
    validatedHandler('backup:create', ROLES.ADMIN_ONLY, z.void(), async () => {
        const result = await BackupService.createBackup()
        return { ...result, cancelled: false }
    })

    validatedHandler('backup:createTo', ROLES.ADMIN_ONLY, BackupCreateToSchema, async (_event, filePath) => {
        const result = await BackupService.createBackupToPath(filePath)
        return { ...result, cancelled: false }
    })

    validatedHandler('backup:getList', ROLES.ADMIN_ONLY, z.void(), () => {
        return BackupService.listBackups()
    })

    validatedHandler('backup:restore', ROLES.ADMIN_ONLY, BackupRestoreSchema, async (_event, filename) => {
        const success = await BackupService.restoreBackup(filename)
        return { success, message: success ? 'Restore initiated. App will restart.' : 'Restore failed', cancelled: false }
    })

    validatedHandler('backup:openFolder', ROLES.ADMIN_ONLY, z.void(), async () => {
        const backupDir = path.join(app.getPath('userData'), 'backups')
        await shell.openPath(backupDir)
        return { success: true }
    })
}
