import * as fs from 'node:fs'

import { dialog, BrowserWindow } from '../../electron-env'
import { dataImportService, type ImportConfig } from '../../services/data/DataImportService'
import { ROLES, resolveActorId, safeHandleRawWithRole } from '../ipc-result'


export function registerDataImportHandlers(): void {
    // Import from file
    safeHandleRawWithRole('data:import', ROLES.ADMIN_ONLY, (
        event,
        filePath: string,
        config: ImportConfig,
        legacyUserId?: number
    ) => {
        try {
            const actor = resolveActorId(event, legacyUserId)
            if (!actor.success) {
                return {
                    success: false,
                    totalRows: 0,
                    imported: 0,
                    skipped: 0,
                    errors: [{ row: 0, message: actor.error }]
                }
            }
            const buffer = fs.readFileSync(filePath)
            return dataImportService.importFromFile(
                buffer,
                filePath,
                config,
                actor.actorId
            )
        } catch (error) {
            return {
                success: false,
                totalRows: 0,
                imported: 0,
                skipped: 0,
                errors: [{
                    row: 0,
                    message: error instanceof Error ? error.message : 'File read error'
                }]
            }
        }
    })

    // Get Template
    safeHandleRawWithRole('data:getTemplate', ROLES.ADMIN_ONLY, (_event, entityType: string) => {
        return dataImportService.getImportTemplate(entityType)
    })

    // Download Template
    safeHandleRawWithRole('data:downloadTemplate', ROLES.ADMIN_ONLY, async (event, entityType: string) => {
        try {
            const buffer = await dataImportService.generateTemplateFile(entityType)
            const win = BrowserWindow.fromWebContents(event.sender)

            const { filePath } = await dialog.showSaveDialog(win, {
                title: `Download ${entityType} Import Template`,
                defaultPath: `${entityType.toLowerCase()}_import_template.xlsx`,
                filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
            })

            if (filePath) {
                fs.writeFileSync(filePath, buffer)
                return { success: true, filePath }
            }
            return { success: false, error: 'Cancelled' }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Template generation failed'
            }
        }
    })
}
