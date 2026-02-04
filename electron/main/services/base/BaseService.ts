import { Database } from 'better-sqlite3'
import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'
import { IReadable, IWritable, IAuditable, AuditEntry } from './interfaces/IService'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Abstract base service implementing common CRUD operations.
 * Follows Single Responsibility: Only handles data access patterns.
 * Follows Open/Closed: Extended by specific services without modification.
 */
export abstract class BaseService<T, C, U = Partial<C>, F = Record<string, unknown>>
    implements IReadable<T, F>, IWritable<T, C, U>, IAuditable {

    protected abstract getTableName(): string
    protected abstract getPrimaryKey(): string
    protected getTableAlias(): string | null { return null }

    protected getTablePrefix(): string {
        return (this.getTableAlias() || this.getTableName()) + '.'
    }

    protected get db(): Database {
        return getDatabase()
    }

    /**
     * Template method for building SELECT queries.
     * Subclasses override to add JOINs, computed columns, etc.
     */
    protected abstract buildSelectQuery(): string

    /**
     * Template method for mapping database rows to domain objects.
     */
    protected abstract mapRowToEntity(row: unknown): T

    /**
     * Template method for validating create data.
     * Returns validation errors or null if valid.
     */
    protected abstract validateCreate(data: C): string[] | null

    /**
     * Template method for validating update data.
     */
    protected abstract validateUpdate(id: number, data: U): Promise<string[] | null>

    async findById(id: number): Promise<T | null> {
        const prefix = this.getTablePrefix()
        const primaryKey = this.getPrimaryKey()
        const query = `${this.buildSelectQuery()} WHERE ${prefix}${primaryKey} = ?${this.getGroupBy()}`

        try {
            const logMsg = `[${new Date().toISOString()}] ${this.constructor.name}.findById(${id}) | Table: ${this.getTableName()} | Alias: ${this.getTableAlias()} | Prefix: ${prefix} | Query: ${query}\n`
            fs.appendFileSync('sql_debug.log', logMsg)
        } catch (e) { /* ignore */ }

        try {
            const row = this.db.prepare(query).get(id)
            return row ? this.mapRowToEntity(row) : null
        } catch (error: unknown) {
            try {
                const errorMsg = `[${new Date().toISOString()}] ERROR in ${this.constructor.name}: ${error.message} | Query: ${query}\n`
                fs.appendFileSync('sql_debug.log', errorMsg)
            } catch (e) { /* ignore */ }
            throw error
        }
    }

    async findAll(filters?: F): Promise<T[]> {
        const { query, params } = this.buildFilteredQuery(filters)
        const rows = this.db.prepare(query).all(...params)
        return rows.map(row => this.mapRowToEntity(row))
    }

    async exists(id: number): Promise<boolean> {
        const result = this.db.prepare(
            `SELECT 1 FROM ${this.getTableName()} WHERE ${this.getPrimaryKey()} = ? LIMIT 1`
        ).get(id)
        return !!result
    }

    async create(data: C, userId: number): Promise<{ success: boolean; id: number; errors?: string[] }> {
        const errors = this.validateCreate(data)
        if (errors) {
            return { success: false, id: 0, errors }
        }

        try {
            const result = this.executeCreate(data)
            const id = result.lastInsertRowid as number

            logAudit(userId, 'CREATE', this.getTableName(), id, null, data)

            return { success: true, id }
        } catch (error) {
            return {
                success: false,
                id: 0,
                errors: [error instanceof Error ? error.message : 'Unknown error']
            }
        }
    }

    async update(id: number, data: U, userId: number): Promise<{ success: boolean; errors?: string[] }> {
        const existing = await this.findById(id)
        if (!existing) {
            return { success: false, errors: ['Record not found'] }
        }

        const errors = await this.validateUpdate(id, data)
        if (errors) {
            return { success: false, errors }
        }

        try {
            this.executeUpdate(id, data)
            logAudit(userId, 'UPDATE', this.getTableName(), id, existing, data)
            return { success: true }
        } catch (error) {
            return {
                success: false,
                errors: [error instanceof Error ? error.message : 'Unknown error']
            }
        }
    }

    async delete(id: number, userId: number): Promise<{ success: boolean; errors?: string[] }> {
        const existing = await this.findById(id)
        if (!existing) {
            return { success: false, errors: ['Record not found'] }
        }

        try {
            this.db.prepare(`DELETE FROM ${this.getTableName()} WHERE ${this.getPrimaryKey()} = ?`).run(id)
            logAudit(userId, 'DELETE', this.getTableName(), id, existing, null)
            return { success: true }
        } catch (error) {
            return {
                success: false,
                errors: [error instanceof Error ? error.message : 'Unknown error']
            }
        }
    }

    async getAuditTrail(recordId: number): Promise<AuditEntry[]> {
        return this.db.prepare(`
      SELECT a.*, u.full_name as user_name
      FROM audit_log a
      LEFT JOIN user u ON a.user_id = u.id
      WHERE a.table_name = ? AND a.record_id = ?
      ORDER BY a.created_at DESC
    `).all(this.getTableName(), recordId) as AuditEntry[]
    }

    /**
     * Build filtered query with dynamic WHERE clauses.
     * Override in subclasses for custom filtering logic.
     */
    protected buildFilteredQuery(filters?: F): { query: string; params: unknown[] } {
        const baseQuery = this.buildSelectQuery()
        const conditions: string[] = []
        const params: unknown[] = []

        if (filters) {
            this.applyFilters(filters, conditions, params)
        }

        const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
        const query = `${baseQuery}${whereClause}${this.getGroupBy()}`
        return { query, params }
    }

    /**
     * Override to add filter conditions.
     */
    protected applyFilters(filters: F, conditions: string[], params: unknown[]): void {
        // Default: no filters. Override in subclasses.
    }

    /**
     * Override to add GROUP BY clause.
     */
    protected getGroupBy(): string {
        return ''
    }

    /**
     * Execute create operation. Override for custom insert logic.
     */
    protected abstract executeCreate(data: C): { lastInsertRowid: number | bigint }

    /**
     * Execute update operation. Override for custom update logic.
     */
    protected abstract executeUpdate(id: number, data: U): void
}

