import { getDatabase } from '../../database'
import { ROLES } from '../ipc-result'
import { AuditGetLogSchema } from '../schemas/system-schemas'
import { validatedHandler } from '../validated-handler'

export function registerAuditHandlers(): void {
    const db = getDatabase()

    // ======== AUDIT LOG ========
    validatedHandler('audit:getLog', ROLES.MANAGEMENT, AuditGetLogSchema, (_event, input) => {
        let safeLimit = 200
        let page: number | undefined
        let pageSize: number | undefined
        let action: string | undefined
        let table: string | undefined
        let search: string | undefined

        if (typeof input === 'object' && input != null && !Array.isArray(input)) {
            const filters = input as { limit?: number; page?: number; pageSize?: number; action?: string; table?: string; search?: string }
            safeLimit = Math.min(Math.max(1, Number(filters.limit) || 200), 10000)
            page = filters.page
            pageSize = filters.pageSize ? Math.min(filters.pageSize, 500) : undefined
            action = filters.action || undefined
            table = filters.table || undefined
            search = filters.search || undefined
        } else if (input != null) {
            safeLimit = Math.min(Math.max(1, Number(input) || 200), 10000)
        }

        const conditions: string[] = []
        const params: unknown[] = []

        if (action) {
            conditions.push('a.action_type = ?')
            params.push(action)
        }
        if (table) {
            conditions.push('a.table_name = ?')
            params.push(table)
        }
        if (search) {
            conditions.push('(u.full_name LIKE ? OR CAST(a.record_id AS TEXT) LIKE ?)')
            const pattern = `%${search}%`
            params.push(pattern, pattern)
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

        // Server-side pagination when page is provided
        if (page && pageSize) {
            const offset = (page - 1) * pageSize

            const countQuery = `SELECT COUNT(*) as total FROM audit_log a LEFT JOIN user u ON a.user_id = u.id ${whereClause}`
            const totalCount = (db.prepare(countQuery).get(...params) as { total: number })?.total ?? 0

            const dataQuery = `
                SELECT a.*, u.full_name as user_name 
                FROM audit_log a
                LEFT JOIN user u ON a.user_id = u.id
                ${whereClause}
                ORDER BY a.created_at DESC
                LIMIT ? OFFSET ?`

            const rows = db.prepare(dataQuery).all(...params, pageSize, offset)
            return { rows, totalCount, page, pageSize }
        }

        // Legacy: simple limit-based query
        params.push(safeLimit)
        return db.prepare(`
            SELECT a.*, u.full_name as user_name 
            FROM audit_log a
            LEFT JOIN user u ON a.user_id = u.id
            ${whereClause}
            ORDER BY a.created_at DESC
            LIMIT ?
        `).all(...params)
    })
}


















