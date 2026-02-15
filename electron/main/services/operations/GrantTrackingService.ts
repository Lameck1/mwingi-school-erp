import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'
import { DoubleEntryJournalService } from '../accounting/DoubleEntryJournalService'

export interface Grant {
    id: number
    grant_name: string
    grant_type: 'CAPITATION' | 'FREE_DAY_SECONDARY' | 'SPECIAL_NEEDS' | 'INFRASTRUCTURE' | 'FEEDING_PROGRAM' | 'OTHER'
    fiscal_year: number
    amount_allocated: number
    amount_received: number
    date_received: string | null
    expiry_date: string | null
    nemis_reference_number: string | null
    conditions: string | null
    is_utilized: boolean
    utilization_percentage: number
    created_at: string
    updated_at: string
}

export interface GrantUtilization {
    id: number
    grant_id: number
    gl_account_code: string | null
    amount_used: number
    utilization_date: string
    description: string
    journal_entry_id: number | null
    created_at: string
}

export interface CreateGrantDTO {
    grant_name: string
    grant_type: string
    fiscal_year: number
    amount_allocated: number
    amount_received: number
    date_received?: string
    expiry_date?: string
    nemis_reference_number?: string
    conditions?: string
}

export interface RecordUtilizationDTO {
    grantId: number
    amount: number
    description: string
    glAccountCode: string | null
    utilizationDate: string
    userId: number
}

const UNKNOWN_ERROR = 'Unknown error'
const GRANT_NOT_FOUND = 'Grant not found'
const GRANT_TABLE = 'government_grant'

export class GrantTrackingService {
    private get db() {
        return getDatabase()
    }

    private columnExists(tableName: string, columnName: string): boolean {
        const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
        return columns.some(column => column.name === columnName)
    }

    private getGrantExpiryExpression(): string {
        return this.columnExists(GRANT_TABLE, 'expiry_date')
            ? `COALESCE(expiry_date, printf('%04d-12-31', fiscal_year))`
            : `printf('%04d-12-31', fiscal_year)`
    }

    private resolveExpiryDate(data: CreateGrantDTO): string {
        if (data.expiry_date && /^\d{4}-\d{2}-\d{2}$/.test(data.expiry_date)) {
            return data.expiry_date
        }
        return `${data.fiscal_year}-12-31`
    }

    private withComputedExpiry(grants: Array<Grant & { computed_expiry_date?: string | null }>): Grant[] {
        return grants.map((grant) => ({
            ...grant,
            expiry_date: grant.expiry_date ?? grant.computed_expiry_date ?? `${grant.fiscal_year}-12-31`
        }))
    }

    async createGrant(data: CreateGrantDTO, userId: number): Promise<{ success: boolean, id?: number, error?: string }> {
        try {
            const hasExpiryDateColumn = this.columnExists(GRANT_TABLE, 'expiry_date')
            const columns = [
                'grant_name',
                'grant_type',
                'fiscal_year',
                'amount_allocated',
                'amount_received',
                'date_received',
                'nemis_reference_number',
                'conditions'
            ]
            const values: unknown[] = [
                data.grant_name,
                data.grant_type,
                data.fiscal_year,
                data.amount_allocated,
                data.amount_received,
                data.date_received || null,
                data.nemis_reference_number || null,
                data.conditions || null
            ]

            if (hasExpiryDateColumn) {
                columns.push('expiry_date')
                values.push(this.resolveExpiryDate(data))
            }

            const placeholders = columns.map(() => '?').join(', ')
            const stmt = this.db.prepare(`
                INSERT INTO ${GRANT_TABLE} (${columns.join(', ')})
                VALUES (${placeholders})
            `)

            const result = stmt.run(...values)

            const grantId = result.lastInsertRowid as number
            logAudit(userId, 'CREATE', GRANT_TABLE, grantId, null, data)

            // Create Journal Entry for grant receipt
            const journalService = new DoubleEntryJournalService(this.db)
            journalService.createJournalEntrySync({
                entry_date: data.date_received || new Date().toISOString().split('T')[0],
                entry_type: 'RECEIPT',
                description: `Grant receipt: ${data.grant_name} (Grant #${grantId})`,
                created_by_user_id: userId,
                lines: [
                    {
                        gl_account_code: '1010',
                        debit_amount: 0,
                        credit_amount: data.amount_received,
                        description: 'Grant receipt'
                    },
                    {
                        gl_account_code: '5010',
                        debit_amount: data.amount_received,
                        credit_amount: 0,
                        description: 'Grant income'
                    }
                ]
            })

            return { success: true, id: grantId }
        } catch (error) {
            console.error('Error creating grant:', error)
            return { success: false, error: error instanceof Error ? error.message : UNKNOWN_ERROR }
        }
    }

    async recordUtilization(data: RecordUtilizationDTO): Promise<{ success: boolean, error?: string }> {
        try {
            // Check grant exists and has funds
            const grant = this.db.prepare(`SELECT * FROM ${GRANT_TABLE} WHERE id = ?`).get(data.grantId) as Grant | undefined
            if (!grant) {return { success: false, error: GRANT_NOT_FOUND }}

            const usedSoFar = this.db.prepare('SELECT SUM(amount_used) as total FROM grant_utilization WHERE grant_id = ?').get(data.grantId) as { total: number | null }
            const amountUsedSoFar = usedSoFar.total ?? 0
            const totalUsed = amountUsedSoFar + data.amount

            if (totalUsed > grant.amount_allocated) {
                return { success: false, error: `Insufficient grant funds. Available: ${grant.amount_allocated - amountUsedSoFar}, Requested: ${data.amount}` }
            }

            // Begin transaction
            const transaction = this.db.transaction(() => {
                // 1. Record utilization
                this.db.prepare(`
                    INSERT INTO grant_utilization (
                        grant_id, gl_account_code, amount_used, utilization_date, description
                    ) VALUES (?, ?, ?, ?, ?)
                `).run(data.grantId, data.glAccountCode, data.amount, data.utilizationDate, data.description)

                // 2. Update grant status
                const utilizationPct = (totalUsed / grant.amount_allocated) * 100
                const isUtilized = totalUsed >= grant.amount_allocated ? 1 : 0

                this.db.prepare(`
                    UPDATE ${GRANT_TABLE}
                    SET utilization_percentage = ?, is_utilized = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(utilizationPct, isUtilized, data.grantId)

                // 3. Create Journal Entry (if GL code provided)
                if (data.glAccountCode) {
                    const journalService = new DoubleEntryJournalService(this.db)
                    journalService.createJournalEntrySync({
                        entry_date: data.utilizationDate,
                        entry_type: 'EXPENSE',
                        description: `Grant utilization: ${data.description} (Grant #${data.grantId})`,
                        created_by_user_id: data.userId,
                        lines: [
                            {
                                gl_account_code: data.glAccountCode,
                                debit_amount: data.amount,
                                credit_amount: 0,
                                description: data.description
                            },
                            {
                                gl_account_code: '1010',
                                debit_amount: 0,
                                credit_amount: data.amount,
                                description: 'Cash disbursement for grant utilization'
                            }
                        ]
                    })
                }
            })

            transaction()
            logAudit(data.userId, 'UPDATE', GRANT_TABLE, data.grantId, { utilization: data.amount }, { description: data.description })

            return { success: true }
        } catch (error) {
            console.error('Error recording utilization:', error)
            return { success: false, error: error instanceof Error ? error.message : UNKNOWN_ERROR }
        }
    }

    async getGrantSummary(grantId: number): Promise<{ success: boolean, data?: unknown }> {
        try {
            const grant = this.db.prepare(`SELECT * FROM ${GRANT_TABLE} WHERE id = ?`).get(grantId) as Grant | undefined
            if (!grant) {return { success: false, data: null }}

            const utilizations = this.db.prepare(`
                SELECT gu.*, ga.account_name 
                FROM grant_utilization gu
                LEFT JOIN gl_account ga ON gu.gl_account_code = ga.account_code
                WHERE gu.grant_id = ?
                ORDER BY gu.utilization_date DESC
            `).all(grantId)

            return { success: true, data: { ...grant, utilizations } }
        } catch {
            return { success: false, data: null }
        }
    }

    async getGrantsByStatus(status: 'ACTIVE' | 'EXPIRED' | 'FULLY_UTILIZED'): Promise<Grant[]> {
        const expiryExpr = this.getGrantExpiryExpression()
        let query = `
            SELECT *, ${expiryExpr} as computed_expiry_date
            FROM ${GRANT_TABLE}
            WHERE 1=1
        `
        const params: unknown[] = []

        if (status === 'FULLY_UTILIZED') {
            query += ' AND is_utilized = 1'
        } else if (status === 'ACTIVE') {
            query += ` AND is_utilized = 0 AND date(${expiryExpr}) >= date('now')`
        } else if (status === 'EXPIRED') {
            query += ` AND is_utilized = 0 AND date(${expiryExpr}) < date('now')`
        }

        query += ` ORDER BY date(${expiryExpr}) ASC, created_at DESC`

        const grants = this.db.prepare(query).all(...params) as Array<Grant & { computed_expiry_date?: string | null }>
        return this.withComputedExpiry(grants)
    }

    async getExpiringGrants(daysThreshold: number): Promise<Grant[]> {
        if (!Number.isInteger(daysThreshold) || daysThreshold <= 0) {
            return []
        }

        const expiryExpr = this.getGrantExpiryExpression()
        const grants = this.db.prepare(`
            SELECT *, ${expiryExpr} as computed_expiry_date
            FROM ${GRANT_TABLE}
            WHERE is_utilized = 0
              AND date(${expiryExpr}) >= date('now')
              AND date(${expiryExpr}) <= date('now', '+' || ? || ' days')
            ORDER BY date(${expiryExpr}) ASC
        `).all(daysThreshold) as Array<Grant & { computed_expiry_date?: string | null }>

        return this.withComputedExpiry(grants)
    }

    async generateNEMISExport(fiscalYear: number): Promise<string> {
        // Generate XML or CSV string for NEMIS
        const grants = this.db.prepare(`SELECT * FROM ${GRANT_TABLE} WHERE fiscal_year = ?`).all(fiscalYear) as Grant[]

        if (grants.length === 0) {return ''}

        // Simple CSV format
        const header = 'GrantName,Type,Allocated,Received,NEMIS_Ref,Utilization%\n'
        const rows = grants.map(g =>
            `"${g.grant_name}","${g.grant_type}",${g.amount_allocated},${g.amount_received},"${g.nemis_reference_number || ''}",${g.utilization_percentage}`
        ).join('\n')

        return header + rows
    }

    async validateGrantCompliance(grantId: number): Promise<{ compliant: boolean, issues: string[] }> {
        const issues: string[] = []
        const grant = this.db.prepare(`SELECT * FROM ${GRANT_TABLE} WHERE id = ?`).get(grantId) as Grant | undefined

        if (!grant) {return { compliant: false, issues: [GRANT_NOT_FOUND] }}

        if (!grant.nemis_reference_number) {
            issues.push('Missing NEMIS reference number')
        }

        if (grant.amount_received > grant.amount_allocated) {
            issues.push('Received amount exceeds allocation')
        }

        // Check if utilization matches conditions (mock logic)
        if (grant.conditions && !grant.is_utilized) {
            // potential issue if time passed?
        }

        return { compliant: issues.length === 0, issues }
    }
}
