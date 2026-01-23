import { ipcMain } from '../../electron-env'
import { getDatabase } from '../../database/index'

export function registerAuditHandlers(): void {
    const db = getDatabase()

    // ======== AUDIT LOG ========
    ipcMain.handle('audit:getLog', async (_, limit = 100) => {
        return db.prepare(`
            SELECT a.*, u.full_name as user_name 
            FROM audit_log a
            LEFT JOIN user u ON a.user_id = u.id
            ORDER BY a.created_at DESC
            LIMIT ?
        `).all(limit)
    })
}

















