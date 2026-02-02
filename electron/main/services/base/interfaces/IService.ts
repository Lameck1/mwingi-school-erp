/**
 * Base service interface following Interface Segregation Principle.
 * Services implement only the interfaces they need.
 */

export interface IReadable<T, F = Record<string, unknown>> {
    findById(id: number): Promise<T | null>
    findAll(filters?: F): Promise<T[]>
    exists(id: number): Promise<boolean>
}

export interface IWritable<T, C, U = Partial<C>> {
    create(data: C, userId: number): Promise<{ success: boolean; id: number; data?: T; errors?: string[] }>
    update(id: number, data: U, userId: number): Promise<{ success: boolean; data?: T; errors?: string[] }>
    delete(id: number, userId: number): Promise<{ success: boolean; errors?: string[] }>
}

export interface ISoftDeletable {
    softDelete(id: number, userId: number): Promise<{ success: boolean }>
    restore(id: number, userId: number): Promise<{ success: boolean }>
    findDeleted(): Promise<unknown[]>
}

export interface IAuditable {
    getAuditTrail(recordId: number): Promise<AuditEntry[]>
}

export interface IExportable<T> {
    exportToPDF(data: T[], options: ExportOptions): Promise<Buffer>
    exportToExcel(data: T[], options: ExportOptions): Promise<Buffer>
    exportToCSV(data: T[], options: ExportOptions): Promise<string>
}

export interface IPeriodLockable {
    lockPeriod(periodId: number, userId: number): Promise<{ success: boolean }>
    unlockPeriod(periodId: number, userId: number): Promise<{ success: boolean }>
    isPeriodLocked(periodId: number): Promise<boolean>
}

export interface AuditEntry {
    id: number
    action_type: string
    old_values: Record<string, unknown> | null
    new_values: Record<string, unknown> | null
    user_id: number
    user_name: string
    created_at: string
}

export interface ExportOptions {
    title?: string
    dateRange?: { start: string; end: string }
    columns?: string[]
    orientation?: 'portrait' | 'landscape'
    includeHeaders?: boolean
}
