import { getDatabase } from '../../database'

export interface FeeExemption {
    id: number
    student_id: number
    academic_year_id: number
    term_id?: number
    fee_category_id?: number
    exemption_type: 'FULL' | 'PARTIAL'
    exemption_percentage: number
    exemption_reason: string
    supporting_document?: string
    notes?: string
    approved_by_user_id: number
    approved_at?: string
    status: 'ACTIVE' | 'REVOKED'
    revoked_by_user_id?: number
    revoked_at?: string
    revoke_reason?: string
    created_at: string
    // Joined fields
    student_name?: string
    category_name?: string
    term_name?: string
    year_name?: string
    approved_by_name?: string
}

export interface ExemptionCreateData {
    student_id: number
    academic_year_id: number
    term_id?: number
    fee_category_id?: number
    exemption_percentage: number
    exemption_reason: string
    notes?: string
}

export class ExemptionService {
    private db = getDatabase()

    getExemptions(filters?: {
        studentId?: number;
        academicYearId?: number;
        termId?: number;
        status?: string
    }): FeeExemption[] {
        let query = `
            SELECT e.*, 
                   s.first_name || ' ' || s.last_name as student_name,
                   fc.category_name,
                   t.term_name,
                   ay.year_name,
                   u.full_name as approved_by_name
            FROM fee_exemption e
            LEFT JOIN student s ON e.student_id = s.id
            LEFT JOIN fee_category fc ON e.fee_category_id = fc.id
            LEFT JOIN term t ON e.term_id = t.id
            LEFT JOIN academic_year ay ON e.academic_year_id = ay.id
            LEFT JOIN user u ON e.approved_by_user_id = u.id
            WHERE 1=1
        `
        const params: unknown[] = []

        if (filters?.studentId) {
            query += ' AND e.student_id = ?'
            params.push(filters.studentId)
        }
        if (filters?.academicYearId) {
            query += ' AND e.academic_year_id = ?'
            params.push(filters.academicYearId)
        }
        if (filters?.termId) {
            query += ' AND (e.term_id = ? OR e.term_id IS NULL)'
            params.push(filters.termId)
        }
        if (filters?.status) {
            query += ' AND e.status = ?'
            params.push(filters.status)
        }
        query += ' ORDER BY e.created_at DESC'
        return this.db.prepare(query).all(...params) as FeeExemption[]
    }

    getExemptionById(id: number): FeeExemption | undefined {
        return this.db.prepare(`
            SELECT e.*, 
                   s.first_name || ' ' || s.last_name as student_name,
                   fc.category_name,
                   t.term_name,
                   ay.year_name,
                   u.full_name as approved_by_name
            FROM fee_exemption e
            LEFT JOIN student s ON e.student_id = s.id
            LEFT JOIN fee_category fc ON e.fee_category_id = fc.id
            LEFT JOIN term t ON e.term_id = t.id
            LEFT JOIN academic_year ay ON e.academic_year_id = ay.id
            LEFT JOIN user u ON e.approved_by_user_id = u.id
            WHERE e.id = ?
        `).get(id) as FeeExemption | undefined
    }

    // Get active exemptions for a specific student/term/category combination
    getStudentExemptions(studentId: number, academicYearId: number, termId: number): FeeExemption[] {
        return this.db.prepare(`
            SELECT * FROM fee_exemption 
            WHERE student_id = ? 
            AND academic_year_id = ? 
            AND (term_id = ? OR term_id IS NULL)
            AND status = 'ACTIVE'
        `).all(studentId, academicYearId, termId) as FeeExemption[]
    }

    // Calculate exemption amount for a specific fee
    calculateExemption(studentId: number, academicYearId: number, termId: number, categoryId: number, originalAmount: number): {
        exemption_id?: number;
        exemption_percentage: number;
        exemption_amount: number;
        net_amount: number;
    } {
        // Check for category-specific exemption first
        let exemption = this.db.prepare(`
            SELECT * FROM fee_exemption 
            WHERE student_id = ? 
            AND academic_year_id = ? 
            AND (term_id = ? OR term_id IS NULL)
            AND fee_category_id = ?
            AND status = 'ACTIVE'
            LIMIT 1
        `).get(studentId, academicYearId, termId, categoryId) as FeeExemption | undefined

        // If no category-specific, check for blanket exemption (all categories)
        if (!exemption) {
            exemption = this.db.prepare(`
                SELECT * FROM fee_exemption 
                WHERE student_id = ? 
                AND academic_year_id = ? 
                AND (term_id = ? OR term_id IS NULL)
                AND fee_category_id IS NULL
                AND status = 'ACTIVE'
                LIMIT 1
            `).get(studentId, academicYearId, termId) as FeeExemption | undefined
        }

        if (!exemption) {
            return {
                exemption_percentage: 0,
                exemption_amount: 0,
                net_amount: originalAmount
            }
        }

        const exemptionAmount = Math.round(originalAmount * (exemption.exemption_percentage / 100))
        return {
            exemption_id: exemption.id,
            exemption_percentage: exemption.exemption_percentage,
            exemption_amount: exemptionAmount,
            net_amount: originalAmount - exemptionAmount
        }
    }

    createExemption(data: ExemptionCreateData, userId: number): { success: boolean; id?: number; errors?: string[] } {
        if (!data.student_id || !data.academic_year_id || !data.exemption_percentage || !data.exemption_reason) {
            return { success: false, errors: ['Student, academic year, percentage, and reason are required'] }
        }

        if (data.exemption_percentage <= 0 || data.exemption_percentage > 100) {
            return { success: false, errors: ['Exemption percentage must be between 1 and 100'] }
        }

        // Check for existing active exemption with same scope
        const existing = this.db.prepare(`
            SELECT id FROM fee_exemption 
            WHERE student_id = ? 
            AND academic_year_id = ? 
            AND (term_id = ? OR (? IS NULL AND term_id IS NULL))
            AND (fee_category_id = ? OR (? IS NULL AND fee_category_id IS NULL))
            AND status = 'ACTIVE'
        `).get(
            data.student_id, data.academic_year_id,
            data.term_id, data.term_id,
            data.fee_category_id, data.fee_category_id
        )

        if (existing) {
            return { success: false, errors: ['An active exemption already exists for this scope. Revoke it first.'] }
        }

        try {
            const exemptionType = data.exemption_percentage === 100 ? 'FULL' : 'PARTIAL'
            const result = this.db.prepare(`
                INSERT INTO fee_exemption (
                    student_id, academic_year_id, term_id, fee_category_id,
                    exemption_type, exemption_percentage, exemption_reason, notes,
                    approved_by_user_id, approved_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(
                data.student_id, data.academic_year_id, data.term_id, data.fee_category_id,
                exemptionType, data.exemption_percentage, data.exemption_reason, data.notes,
                userId
            )
            return { success: true, id: Number(result.lastInsertRowid) }
        } catch (error) {
            return { success: false, errors: [error instanceof Error ? error.message : 'Failed to create exemption'] }
        }
    }

    revokeExemption(id: number, reason: string, userId: number): { success: boolean; errors?: string[] } {
        if (!reason) {
            return { success: false, errors: ['Revoke reason is required'] }
        }

        const exemption = this.getExemptionById(id)
        if (!exemption) {
            return { success: false, errors: ['Exemption not found'] }
        }
        if (exemption.status === 'REVOKED') {
            return { success: false, errors: ['Exemption already revoked'] }
        }

        try {
            this.db.prepare(`
                UPDATE fee_exemption 
                SET status = 'REVOKED', 
                    revoked_by_user_id = ?, 
                    revoked_at = CURRENT_TIMESTAMP, 
                    revoke_reason = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(userId, reason, id)
            return { success: true }
        } catch (error) {
            return { success: false, errors: [error instanceof Error ? error.message : 'Failed to revoke exemption'] }
        }
    }

    // Get exemption statistics
    getExemptionStats(academicYearId?: number): {
        totalExemptions: number;
        activeExemptions: number;
        fullExemptions: number;
        partialExemptions: number;
    } {
        let query = `
            SELECT 
                COUNT(*) as totalExemptions,
                SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as activeExemptions,
                SUM(CASE WHEN exemption_type = 'FULL' AND status = 'ACTIVE' THEN 1 ELSE 0 END) as fullExemptions,
                SUM(CASE WHEN exemption_type = 'PARTIAL' AND status = 'ACTIVE' THEN 1 ELSE 0 END) as partialExemptions
            FROM fee_exemption
        `
        const params: unknown[] = []
        if (academicYearId) {
            query += ' WHERE academic_year_id = ?'
            params.push(academicYearId)
        }
        return this.db.prepare(query).get(...params) as any
    }
}
