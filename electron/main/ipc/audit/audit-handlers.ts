import { getDatabase } from '../../database'
import { ROLES } from '../ipc-result'
import { AuditGetLogSchema } from '../schemas/system-schemas'
import { validatedHandler } from '../validated-handler'

export function registerAuditHandlers(): void {
    const db = getDatabase()

    // ======== AUDIT LOG ========
    validatedHandler('audit:getLog', ROLES.MANAGEMENT, AuditGetLogSchema, (_event, limit) => {
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


















