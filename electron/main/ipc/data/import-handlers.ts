import * as fs from 'fs'
import * as path from 'path'

import { dialog, BrowserWindow } from '../../electron-env'
import { dataImportService } from '../../services/data/DataImportService'
import { ROLES } from '../ipc-result'
import { ImportTuple, TemplateTypeSchema } from '../schemas/system-schemas'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'


export function registerDataImportHandlers(): void {
    // Import from file
    validatedHandlerMulti('data:import', ROLES.ADMIN_ONLY, ImportTuple, (
        event,
        [filePath, config, _legacyId],
        actorCtx
    ) => {
        try {
            const resolved = path.resolve(filePath)
            const allowedExtensions = ['.csv', '.xlsx', '.xls']
            const ext = path.extname(resolved).toLowerCase()
            if (!allowedExtensions.includes(ext)) {
                return {
                    success: false,
                    totalRows: 0,
                    imported: 0,
                    skipped: 0,
                    errors: [{ row: 0, message: `Invalid file type '${ext}'. Allowed: ${allowedExtensions.join(', ')}` }]
                }
            }
            const buffer = fs.readFileSync(resolved)
            return dataImportService.importFromFile(
                buffer,
                filePath,
                config,
                actorCtx.id
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
    validatedHandler('data:getTemplate', ROLES.ADMIN_ONLY, TemplateTypeSchema, (_event, entityType) => {
        return dataImportService.getImportTemplate(entityType)
    })

    // Download Template
    validatedHandler('data:downloadTemplate', ROLES.ADMIN_ONLY, TemplateTypeSchema, async (event, entityType) => {
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
