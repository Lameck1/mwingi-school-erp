export interface AuditLogEntry {
  id: number
  user_id: number
  action_type: string
  table_name: string
  record_id: number | null
  old_values: string | null
  new_values: string | null
  created_at: string
  user_name?: string
}

type IPCResult<T> = T | { success: false; error: string; errors?: string[] };

export interface AuditAPI {
  getAuditLog: (limit?: number) => Promise<IPCResult<AuditLogEntry[]>>
}
