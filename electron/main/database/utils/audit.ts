import { getDatabase } from '../index'

export function logAudit(userId: number, actionType: string, tableName: string, recordId: number | null, oldValues: unknown, newValues: unknown): void {
    const db = getDatabase()
    try {
        db.prepare(`INSERT INTO audit_log (
            user_id, action_type, table_name, record_id, old_values, new_values
        ) VALUES (?, ?, ?, ?, ?, ?)`).run(
            userId, actionType, tableName, recordId, 
            oldValues ? JSON.stringify(oldValues) : null, 
            newValues ? JSON.stringify(newValues) : null
        )
    } catch (error) {
        console.error('Failed to log audit:', error)
    }
}

