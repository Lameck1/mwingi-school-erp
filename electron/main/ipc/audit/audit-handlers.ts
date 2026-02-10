import { getDatabase } from '../../database'
import { ipcMain } from '../../electron-env'

import type { IpcMainInvokeEvent } from 'electron'

export function registerAuditHandlers(): void {
    const db = getDatabase()

    // ======== AUDIT LOG ========
    ipcMain.handle('audit:getLog', async (_event: IpcMainInvokeEvent, limit = 100) => {
        return db.prepare(`
            SELECT a.*, u.full_name as user_name 
            FROM audit_log a
            LEFT JOIN user u ON a.user_id = u.id
            ORDER BY a.created_at DESC
            LIMIT ?
        `).all(limit)
    })
}


















