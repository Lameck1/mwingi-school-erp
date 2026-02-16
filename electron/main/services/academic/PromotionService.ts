import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

export interface Enrollment {
    id: number
    student_id: number
    academic_year_id: number
    term_id: number
    stream_id: number
    class_id: number | null
    student_type: 'DAY_SCHOLAR' | 'BOARDER'
    status: 'ACTIVE' | 'PROMOTED' | 'GRADUATED' | 'TRANSFERRED' | 'DROPPED'
    created_at: string
    // Computed
    student_name?: string
    admission_number?: string
    stream_name?: string
    year_name?: string
}

export interface PromotionData {
    student_id: number
    from_stream_id: number
    to_stream_id: number
    from_academic_year_id: number
    to_academic_year_id: number
    to_term_id: number
}

export interface Stream {
    id: number
    stream_name: string
    level_order: number
}

type BatchPromoteArgs = [
    studentIds: number[],
    fromStreamId: number,
    toStreamId: number,
    fromAcademicYearId: number,
    toAcademicYearId: number,
    toTermId: number,
    userId: number
]

export class PromotionService {
    private get db() { return getDatabase() }

    /**
     * Get all streams ordered by grade level for promotion selection
     */
    async getStreams(): Promise<Stream[]> {
        return this.db.prepare(`
      SELECT id, stream_name, level_order 
      FROM stream 
      WHERE is_active = 1 
      ORDER BY level_order ASC
    `).all() as Stream[]
    }

    /**
     * Get students eligible for promotion from a specific stream
     */
    async getStudentsForPromotion(streamId: number, academicYearId: number): Promise<Enrollment[]> {
        return this.db.prepare(`
      SELECT 
        e.id,
        e.student_id,
        e.stream_id,
        e.academic_year_id,
        e.term_id,
        e.student_type,
        e.status,
        s.first_name || ' ' || s.last_name as student_name,
        s.admission_number,
        st.stream_name,
        ay.year_name
      FROM enrollment e
      JOIN student s ON e.student_id = s.id
      JOIN stream st ON e.stream_id = st.id
      JOIN academic_year ay ON e.academic_year_id = ay.id
      WHERE e.stream_id = ?
        AND e.academic_year_id = ?
        AND e.status = 'ACTIVE'
        AND s.is_active = 1
      ORDER BY s.first_name, s.last_name
    `).all(streamId, academicYearId) as Enrollment[]
    }

    /**
     * Promote a single student to a new stream/academic year
     */
    async promoteStudent(
        data: PromotionData,
        userId: number
    ): Promise<{ success: boolean; errors?: string[] }> {
        if (data.from_stream_id === data.to_stream_id) {
            return { success: false, errors: ['Source and destination streams must be different'] }
        }

        try {
            return this.db.transaction(() => {
                const sourceEnrollment = this.db.prepare(`
                    SELECT id, student_type
                    FROM enrollment
                    WHERE student_id = ?
                      AND academic_year_id = ?
                      AND stream_id = ?
                      AND status = 'ACTIVE'
                    ORDER BY created_at DESC
                    LIMIT 1
                `).get(data.student_id, data.from_academic_year_id, data.from_stream_id) as { id: number; student_type: 'DAY_SCHOLAR' | 'BOARDER' } | undefined

                if (!sourceEnrollment) {
                    return { success: false, errors: ['Student is not actively enrolled in the source stream/year'] }
                }

                // Check if already promoted/active in target year
                const existing = this.db.prepare(`
                    SELECT id, stream_id FROM enrollment
                    WHERE student_id = ? AND academic_year_id = ? AND status = 'ACTIVE'
                    ORDER BY created_at DESC
                    LIMIT 1
                `).get(data.student_id, data.to_academic_year_id) as { id: number; stream_id: number } | undefined

                if (existing) {
                    if (existing.stream_id === data.to_stream_id) {
                        return { success: true } // Already promoted (Idempotent)
                    }

                    return { success: false, errors: ['Student already has an active enrollment in the target academic year'] }
                }

                // Mark old enrollment as PROMOTED
                const updateResult = this.db.prepare(`
          UPDATE enrollment 
          SET status = 'PROMOTED' 
          WHERE id = ?
        `).run(sourceEnrollment.id)

                if (updateResult.changes === 0) {
                    return { success: false, errors: ['Failed to update source enrollment status'] }
                }

                // Create new enrollment
                const result = this.db.prepare(`
          INSERT INTO enrollment (
            student_id, academic_year_id, term_id, academic_term_id, stream_id, student_type, status
          )
          VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
        `).run(
                    data.student_id,
                    data.to_academic_year_id,
                    data.to_term_id,
                    data.to_term_id,
                    data.to_stream_id,
                    sourceEnrollment.student_type
                )

                if (result.changes === 0 || !result.lastInsertRowid) {
                    return { success: false, errors: ['Failed to create target enrollment'] }
                }

                if (result.changes > 0) {
                    logAudit(userId, 'PROMOTE', 'enrollment', result.lastInsertRowid as number,
                        { from_stream_id: data.from_stream_id, from_academic_year_id: data.from_academic_year_id },
                        { to_stream_id: data.to_stream_id, to_academic_year_id: data.to_academic_year_id }
                    )
                }

                return { success: true }
            })()
        } catch (error) {
            return { success: false, errors: [error instanceof Error ? error.message : 'Unknown error'] }
        }
    }

    /**
     * Batch promote multiple students
     */
    async batchPromote(
        ...[studentIds, fromStreamId, toStreamId, fromAcademicYearId, toAcademicYearId, toTermId, userId]: BatchPromoteArgs
    ): Promise<{ success: boolean; promoted: number; failed: number; errors?: string[] }> {
        let promoted = 0
        let failed = 0

        for (const studentId of studentIds) {
            const result = await this.promoteStudent({
                student_id: studentId,
                from_stream_id: fromStreamId,
                to_stream_id: toStreamId,
                from_academic_year_id: fromAcademicYearId,
                to_academic_year_id: toAcademicYearId,
                to_term_id: toTermId
            }, userId)

            if (result.success) {
                promoted++
            } else {
                failed++
            }
        }

        return {
            success: failed === 0,
            promoted,
            failed,
            errors: failed > 0 ? [`${failed} students failed to promote`] : undefined
        }
    }

    /**
     * Get promotion history for a student
     */
    async getStudentPromotionHistory(studentId: number): Promise<Enrollment[]> {
        return this.db.prepare(`
      SELECT 
        e.*,
        st.stream_name,
        ay.year_name
      FROM enrollment e
      JOIN stream st ON e.stream_id = st.id
      JOIN academic_year ay ON e.academic_year_id = ay.id
      WHERE e.student_id = ?
      ORDER BY e.created_at DESC
    `).all(studentId) as Enrollment[]
    }

    /**
     * Get next stream in grade order (for auto-suggestion)
     */
    async getNextStream(currentStreamId: number): Promise<Stream | null> {
        const current = this.db.prepare(`SELECT level_order FROM stream WHERE id = ?`).get(currentStreamId) as { level_order: number } | null
        if (!current) { return null }

        return this.db.prepare(`
      SELECT id, stream_name, level_order 
      FROM stream 
      WHERE level_order > ? AND is_active = 1
      ORDER BY level_order ASC
      LIMIT 1
    `).get(current.level_order) as Stream | null
    }
}
