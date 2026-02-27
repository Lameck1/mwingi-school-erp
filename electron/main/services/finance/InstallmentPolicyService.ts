
import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

import type Database from 'better-sqlite3'

// ============================================================================
// TYPES
// ============================================================================

interface InstallmentPolicyData {
    readonly policy_name: string
    readonly academic_year_id: number
    readonly stream_id?: number
    readonly student_type: 'DAY_SCHOLAR' | 'BOARDER' | 'ALL'
    readonly schedules: ReadonlyArray<{
        readonly installment_number: number
        readonly percentage: number
        readonly due_date: string
        readonly description?: string
    }>
}

interface InstallmentPolicy {
    readonly id: number
    readonly policy_name: string
    readonly academic_year_id: number
    readonly stream_id: number | null
    readonly student_type: string
    readonly number_of_installments: number
    readonly is_active: number
    readonly created_at: string
}

interface InstallmentScheduleRow {
    readonly id: number
    readonly policy_id: number
    readonly installment_number: number
    readonly percentage: number
    readonly due_date: string
    readonly description: string | null
}

// ============================================================================
// SERVICE
// ============================================================================

class InstallmentPolicyService {
    private readonly db: Database.Database

    constructor(db?: Database.Database) {
        this.db = db || getDatabase()
    }

    /**
     * Create a new installment policy with its schedule.
     * Schedule percentages must sum to exactly 100.
     */
    createPolicy(data: InstallmentPolicyData, userId: number): { success: boolean; id?: number; error?: string } {
        const totalPercentage = data.schedules.reduce((sum, s) => sum + s.percentage, 0)
        if (totalPercentage !== 100) {
            return { success: false, error: `Schedule percentages must sum to 100, got ${totalPercentage}` }
        }

        if (data.schedules.length < 2) {
            return { success: false, error: 'At least 2 installments are required' }
        }

        return this.db.transaction(() => {
            const result = this.db.prepare(`
        INSERT INTO installment_policy (policy_name, academic_year_id, stream_id, student_type, number_of_installments, created_by_user_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
                data.policy_name.trim(),
                data.academic_year_id,
                data.stream_id ?? null,
                data.student_type,
                data.schedules.length,
                userId
            )

            const policyId = result.lastInsertRowid as number
            const scheduleStmt = this.db.prepare(`
        INSERT INTO installment_schedule (policy_id, installment_number, percentage, due_date, description)
        VALUES (?, ?, ?, ?, ?)
      `)

            for (const schedule of data.schedules) {
                scheduleStmt.run(
                    policyId,
                    schedule.installment_number,
                    schedule.percentage,
                    schedule.due_date,
                    schedule.description ?? null
                )
            }

            logAudit(userId, 'CREATE', 'installment_policy', policyId, null, {
                policy_name: data.policy_name,
                installments: data.schedules.length
            })

            return { success: true, id: policyId }
        })()
    }

    /**
     * Get active policies for a given academic year, optionally filtered by stream and student type.
     */
    getPoliciesForTerm(
        academicYearId: number,
        streamId?: number,
        studentType?: string
    ): InstallmentPolicy[] {
        let sql = `
      SELECT * FROM installment_policy
      WHERE academic_year_id = ? AND is_active = 1
    `
        const params: Array<number | string> = [academicYearId]

        if (streamId !== undefined) {
            sql += ' AND (stream_id = ? OR stream_id IS NULL)'
            params.push(streamId)
        }
        if (studentType) {
            sql += " AND (student_type = ? OR student_type = 'ALL')"
            params.push(studentType)
        }

        sql += ' ORDER BY policy_name ASC'

        return this.db.prepare(sql).all(...params) as InstallmentPolicy[]
    }

    /**
     * Get the schedule rows for a specific policy.
     */
    getInstallmentSchedule(policyId: number): InstallmentScheduleRow[] {
        return this.db.prepare(`
      SELECT * FROM installment_schedule
      WHERE policy_id = ?
      ORDER BY installment_number ASC
    `).all(policyId) as InstallmentScheduleRow[]
    }

    /**
     * Deactivate a policy (soft-delete).
     */
    deactivatePolicy(policyId: number, userId: number): { success: boolean } {
        this.db.prepare('UPDATE installment_policy SET is_active = 0 WHERE id = ?').run(policyId)
        logAudit(userId, 'UPDATE', 'installment_policy', policyId, { is_active: 1 }, { is_active: 0 })
        return { success: true }
    }
}

export { InstallmentPolicyService }
export type { InstallmentPolicyData, InstallmentPolicy, InstallmentScheduleRow }
