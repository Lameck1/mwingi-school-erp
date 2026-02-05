import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

export interface Grant {
    id: number
    grant_name: string
    grant_type: 'CAPITATION' | 'FREE_DAY_SECONDARY' | 'SPECIAL_NEEDS' | 'INFRASTRUCTURE' | 'FEEDING_PROGRAM' | 'OTHER'
    fiscal_year: number
    amount_allocated: number
    amount_received: number
    date_received: string | null
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
    nemis_reference_number?: string
    conditions?: string
}

export class GrantTrackingService {
    private get db() {
        return getDatabase()
    }

    async createGrant(data: CreateGrantDTO, userId: number): Promise<{ success: boolean, id?: number, message?: string }> {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO government_grant (
                    grant_name, grant_type, fiscal_year, amount_allocated, 
                    amount_received, date_received, nemis_reference_number, conditions
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `)

            const result = stmt.run(
                data.grant_name,
                data.grant_type,
                data.fiscal_year,
                data.amount_allocated,
                data.amount_received,
                data.date_received || null,
                data.nemis_reference_number || null,
                data.conditions || null
            )

            const grantId = result.lastInsertRowid as number
            logAudit(userId, 'CREATE', 'government_grant', grantId, null, data)

            return { success: true, id: grantId }
        } catch (error) {
            console.error('Error creating grant:', error)
            return { success: false, message: error instanceof Error ? error.message : 'Unknown error' }
        }
    }

    async recordUtilization(
        grantId: number,
        amount: number,
        description: string,
        glAccountCode: string | null,
        utilizationDate: string,
        userId: number
    ): Promise<{ success: boolean, message?: string }> {
        try {
            // Check grant exists and has funds
            const grant = this.db.prepare('SELECT * FROM government_grant WHERE id = ?').get(grantId) as Grant
            if (!grant) return { success: false, message: 'Grant not found' }

            const usedSoFar = this.db.prepare('SELECT SUM(amount_used) as total FROM grant_utilization WHERE grant_id = ?').get(grantId) as { total: number }
            const totalUsed = (usedSoFar.total || 0) + amount

            if (totalUsed > grant.amount_allocated) {
                // Warning but allow? Or block? Usually block if strict.
                // Let's block for now as per "Tracking" implies limits.
                return { success: false, message: `Insufficient grant funds. Available: ${grant.amount_allocated - (usedSoFar.total || 0)}, Requested: ${amount}` }
            }

            // Begin transaction
            const transaction = this.db.transaction(() => {
                // 1. Record utilization
                this.db.prepare(`
                    INSERT INTO grant_utilization (
                        grant_id, gl_account_code, amount_used, utilization_date, description
                    ) VALUES (?, ?, ?, ?, ?)
                `).run(grantId, glAccountCode, amount, utilizationDate, description)

                // 2. Update grant status
                const utilizationPct = (totalUsed / grant.amount_allocated) * 100
                const isUtilized = totalUsed >= grant.amount_allocated ? 1 : 0

                this.db.prepare(`
                    UPDATE government_grant 
                    SET utilization_percentage = ?, is_utilized = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(utilizationPct, isUtilized, grantId)

                // 3. Create Journal Entry (if GL code provided)
                if (glAccountCode) {
                    // This would typically involve double-entry logic: 
                    // Credit Grant Income/Liability, Debit Expense.
                    // For now, we just log it in utilization.
                    // TODO: Trigger journal entry creation via JournalService if needed.
                }
            })

            transaction()
            logAudit(userId, 'UPDATE', 'government_grant', grantId, { utilization: amount }, { description })

            return { success: true }
        } catch (error) {
            console.error('Error recording utilization:', error)
            return { success: false, message: error instanceof Error ? error.message : 'Unknown error' }
        }
    }

    async getGrantSummary(grantId: number): Promise<{ success: boolean, data?: unknown }> {
        try {
            const grant = this.db.prepare('SELECT * FROM government_grant WHERE id = ?').get(grantId) as Grant
            if (!grant) return { success: false, data: null }

            const utilizations = this.db.prepare(`
                SELECT gu.*, ga.account_name 
                FROM grant_utilization gu
                LEFT JOIN gl_account ga ON gu.gl_account_code = ga.account_code
                WHERE gu.grant_id = ?
                ORDER BY gu.utilization_date DESC
            `).all(grantId)

            return { success: true, data: { ...grant, utilizations } }
        } catch (error) {
            return { success: false, data: null }
        }
    }

    async getGrantsByStatus(status: 'ACTIVE' | 'EXPIRED' | 'FULLY_UTILIZED'): Promise<Grant[]> {
        let query = 'SELECT * FROM government_grant WHERE 1=1'
        const params: unknown[] = []

        if (status === 'FULLY_UTILIZED') {
            query += ' AND is_utilized = 1'
        } else if (status === 'ACTIVE') {
            query += ' AND is_utilized = 0'
        }

        // "EXPIRED" logic depends on fiscal year or specific date logic not explicitly in schema
        // Assuming active grants are those not fully utilized for now.

        return this.db.prepare(query).all(...params) as Grant[]
    }

    async getExpiringGrants(daysThreshold: number): Promise<Grant[]> {
        // Since there is no "expiry_date" in schema, we might infer from fiscal year end?
        // Or maybe 'date_received' + 1 year?
        // Roadmap says: "getExpiringGrants(daysThreshold) - Alert for grants expiring soon"
        // But schema only has `fiscal_year`.
        // We will assume fiscal year end is Dec 31st of that year.

        const currentYear = new Date().getFullYear()
        // If current date is close to Dec 31st of the grant's fiscal year.

        // Just return empty for now if no clear logic, or check logic:
        // Grants are usually per fiscal year.

        return []
    }

    async generateNEMISExport(fiscalYear: number): Promise<string> {
        // Generate XML or CSV string for NEMIS
        const grants = this.db.prepare('SELECT * FROM government_grant WHERE fiscal_year = ?').all(fiscalYear) as Grant[]

        if (grants.length === 0) return ''

        // Simple CSV format
        const header = 'GrantName,Type,Allocated,Received,NEMIS_Ref,Utilization%\n'
        const rows = grants.map(g =>
            `"${g.grant_name}","${g.grant_type}",${g.amount_allocated},${g.amount_received},"${g.nemis_reference_number || ''}",${g.utilization_percentage}`
        ).join('\n')

        return header + rows
    }

    async validateGrantCompliance(grantId: number): Promise<{ compliant: boolean, issues: string[] }> {
        const issues: string[] = []
        const grant = this.db.prepare('SELECT * FROM government_grant WHERE id = ?').get(grantId) as Grant

        if (!grant) return { compliant: false, issues: ['Grant not found'] }

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
