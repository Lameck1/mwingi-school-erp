import { ipcMain, dialog, app } from '../../electron-env'
import { getDatabase, backupDatabase, initializeDatabase } from '../../database/index'
import fs from 'fs'
import path from 'path'

export function registerBackupHandlers(): void {
    // ======== BACKUP ========
    ipcMain.handle('backup:create', async () => {
        const { filePath } = await dialog.showSaveDialog({
            title: 'Save Backup',
            defaultPath: `mwingi-erp-backup-${new Date().toISOString().slice(0, 10)}.db`,
            filters: [{ name: 'SQLite Database', extensions: ['db'] }]
        })
        if (!filePath) return { success: false, cancelled: true }

        await backupDatabase(filePath)
        return { success: true, path: filePath }
    })

    ipcMain.handle('backup:restore', async () => {
        const { filePaths } = await dialog.showOpenDialog({
            title: 'Restore Backup',
            filters: [{ name: 'SQLite Database', extensions: ['db'] }],
            properties: ['openFile']
        })
        if (!filePaths.length) return { success: false, cancelled: true }

        const backupFilePath = filePaths[0]

        // Validate that the selected file is a valid SQLite database
        try {
            // Check if file has SQLite header signature
            const fd = fs.openSync(backupFilePath, 'r');
            const buffer = Buffer.alloc(16);
            fs.readSync(fd, buffer, 0, 16, 0);
            fs.closeSync(fd);
            const header = buffer.toString('hex', 0, 16)
            if (header !== '53514c69746520666f726d6174203300') { // SQLite format 3\0
                return { success: false, error: 'Selected file is not a valid SQLite database' }
            }
        } catch (error) {
            return { success: false, error: 'Failed to validate backup file: ' + (error as Error).message }
        }

        // Close current database connection
        try {
            const currentDb = getDatabase()
            if (currentDb) {
                currentDb.close()
            }
        } catch (error) {
            console.warn('Failed to close database connection:', error)
        }

        // Copy backup to app data
        const userDataPath = app.getPath('userData')
        const dbPath = path.join(userDataPath, 'data', 'school_erp.db')

        try {
            fs.copyFileSync(backupFilePath, dbPath)

            // Reinitialize database connection
            await initializeDatabase()

            return { success: true, message: 'Backup restored successfully' }
        } catch (error) {
            // Attempt to restore original database if backup fails
            try {
                await initializeDatabase()
            } catch (recoveryError) {
                console.error('Failed to recover database after restore failure:', recoveryError)
            }
            console.error('Failed to restore backup:', error)
            return { success: false, error: 'Failed to restore backup: ' + (error as Error).message }
        }
    })
}
















