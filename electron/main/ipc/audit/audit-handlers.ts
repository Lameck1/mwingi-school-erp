import { getDatabase } from '../../database'
import { safeHandleRawWithRole, ROLES } from '../ipc-result'

export function registerAuditHandlers(): void {
    const db = getDatabase()

    // ======== AUDIT LOG ========
    safeHandleRawWithRole('audit:getLog', ROLES.MANAGEMENT, (_event, limit = 100) => {
        const safeLimit = Math.min(Math.max(1, Number(limit) || 100), 10000)
        return db.prepare(`
            SELECT a.*, u.full_name as user_name 
            FROM audit_log a
            LEFT JOIN user u ON a.user_id = u.id
            ORDER BY a.created_at DESC
            LIMIT ?
        `).all(safeLimit)
    })
}


















