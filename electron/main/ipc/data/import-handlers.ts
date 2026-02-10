import * as fs from 'node:fs'

import { ipcMain, dialog, BrowserWindow } from '../../electron-env'
import { dataImportService, type ImportConfig } from '../../services/data/DataImportService'

import type { IpcMainInvokeEvent } from 'electron'


export function registerDataImportHandlers(): void {
    // Import from file
    ipcMain.handle('data:import', async (
        _event: IpcMainInvokeEvent,
        filePath: string,
        config: ImportConfig,
        userId: number
    ) => {
        try {
            const buffer = fs.readFileSync(filePath)
            return dataImportService.importFromFile(
                buffer,
                filePath,
                config,
                userId
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
    ipcMain.handle('data:getTemplate', async (_event: IpcMainInvokeEvent, entityType: string) => {
        return dataImportService.getImportTemplate(entityType)
    })

    // Download Template
    ipcMain.handle('data:downloadTemplate', async (event: IpcMainInvokeEvent, entityType: string) => {
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
