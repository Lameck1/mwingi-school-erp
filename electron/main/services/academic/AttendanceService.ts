import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

export interface AttendanceRecord {
    id: number
    student_id: number
    class_id: number | null
    stream_id: number
    academic_year_id: number
    term_id: number
    attendance_date: string
    status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'
    notes: string | null
    marked_by_user_id: number
    created_at: string
    // Computed
    student_name?: string
    admission_number?: string
}

export interface AttendanceSummary {
    total_days: number
    present: number
    absent: number
    late: number
    excused: number
    attendance_rate: number
}

export interface DailyAttendanceEntry {
    student_id: number
    status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'
    notes?: string
}

type MarkAttendanceArgs = [
    entries: DailyAttendanceEntry[],
    streamId: number,
    date: string,
    academicYearId: number,
    termId: number,
    userId: number
]

export class AttendanceService {
    private get db() { return getDatabase() }
    private static readonly ALLOWED_STATUSES = new Set<DailyAttendanceEntry['status']>(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'])
    private static readonly ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

    private formatLocalDate(date: Date): string {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
    }

    private isIsoDate(date: string): boolean {
        if (!AttendanceService.ISO_DATE_REGEX.test(date)) {
            return false
        }
        const parsed = new Date(`${date}T00:00:00`)
        return !Number.isNaN(parsed.getTime()) && this.formatLocalDate(parsed) === date
    }

    private hasColumn(tableName: string, columnName: string): boolean {
        try {
            const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
            return columns.some((column) => column.name === columnName)
        } catch {
            return false
        }
    }

    private validateAttendanceDatePolicy(date: string, academicYearId: number, termId: number): string | null {
        if (!this.isIsoDate(date)) {
            return 'Attendance date must be in YYYY-MM-DD format'
        }

        const today = this.formatLocalDate(new Date())
        if (date > today) {
            return 'Attendance date cannot be in the future'
        }

        const hasTermDates = this.hasColumn('term', 'start_date') && this.hasColumn('term', 'end_date')
        if (hasTermDates) {
            const termWindow = this.db.prepare(`
                SELECT start_date, end_date
                FROM term
                WHERE id = ? AND academic_year_id = ?
            `).get(termId, academicYearId) as { start_date: string; end_date: string } | undefined

            if (!termWindow) {
                return 'Selected term context is invalid for attendance date validation'
            }
            if (date < termWindow.start_date || date > termWindow.end_date) {
                return 'Attendance date must be within the selected term period'
            }
        }

        const hasYearDates = this.hasColumn('academic_year', 'start_date') && this.hasColumn('academic_year', 'end_date')
        if (hasYearDates) {
            const yearWindow = this.db.prepare(`
                SELECT start_date, end_date
                FROM academic_year
                WHERE id = ?
            `).get(academicYearId) as { start_date: string; end_date: string } | undefined

            if (!yearWindow) {
                return 'Selected academic year context is invalid for attendance date validation'
            }
            if (date < yearWindow.start_date || date > yearWindow.end_date) {
                return 'Attendance date must be within the selected academic year period'
            }
        }

        return null
    }

    /**
     * Get attendance records for a specific date and stream
     */
    async getAttendanceByDate(
        streamId: number,
        date: string,
        academicYearId: number,
        termId: number
    ): Promise<AttendanceRecord[]> {
        return this.db.prepare(`
      SELECT a.*, 
             s.first_name || ' ' || s.last_name as student_name,
             s.admission_number
      FROM attendance a
      JOIN student s ON a.student_id = s.id
      WHERE a.stream_id = ?
        AND a.attendance_date = ?
        AND a.academic_year_id = ?
        AND a.term_id = ?
      ORDER BY s.first_name, s.last_name
    `).all(streamId, date, academicYearId, termId) as AttendanceRecord[]
    }

    /**
     * Mark attendance for a class on a specific date
     */
    async markAttendance(
        ...[entries, streamId, date, academicYearId, termId, userId]: MarkAttendanceArgs
    ): Promise<{ success: boolean; marked: number; errors?: string[] }> {
        if (!Number.isFinite(streamId) || streamId <= 0 || !Number.isFinite(academicYearId) || academicYearId <= 0 || !Number.isFinite(termId) || termId <= 0) {
            return { success: false, marked: 0, errors: ['Invalid attendance context (stream/year/term)'] }
        }
        if (!Number.isFinite(userId) || userId <= 0) {
            return { success: false, marked: 0, errors: ['Invalid user context for attendance marking'] }
        }
        if (!Array.isArray(entries) || entries.length === 0) {
            return { success: false, marked: 0, errors: ['At least one attendance entry is required'] }
        }

        const datePolicyError = this.validateAttendanceDatePolicy(date, academicYearId, termId)
        if (datePolicyError) {
            return { success: false, marked: 0, errors: [datePolicyError] }
        }

        const validationErrors: string[] = []
        const seenStudents = new Set<number>()
        const enrollmentCheckStmt = this.db.prepare(`
            SELECT 1
            FROM enrollment
            WHERE student_id = ?
              AND stream_id = ?
              AND academic_year_id = ?
              AND term_id = ?
              AND status = 'ACTIVE'
            LIMIT 1
        `)

        for (const entry of entries) {
            if (!Number.isFinite(entry.student_id) || entry.student_id <= 0) {
                validationErrors.push('Attendance payload contains invalid student IDs')
                continue
            }
            if (seenStudents.has(entry.student_id)) {
                validationErrors.push(`Duplicate attendance entry detected for student ${entry.student_id}`)
                continue
            }
            seenStudents.add(entry.student_id)

            if (!AttendanceService.ALLOWED_STATUSES.has(entry.status)) {
                validationErrors.push(`Invalid attendance status for student ${entry.student_id}`)
                continue
            }

            const enrolled = enrollmentCheckStmt.get(entry.student_id, streamId, academicYearId, termId)
            if (!enrolled) {
                validationErrors.push(`Student ${entry.student_id} is not actively enrolled in the selected stream/term`)
            }
        }

        if (validationErrors.length > 0) {
            return { success: false, marked: 0, errors: Array.from(new Set(validationErrors)) }
        }

        let marked = 0

        try {
            const updateStmt = this.db.prepare(`
                UPDATE attendance
                SET status = ?, notes = ?, marked_by_user_id = ?, stream_id = ?
                WHERE student_id = ?
                  AND attendance_date = ?
                  AND academic_year_id = ?
                  AND term_id = ?
            `)
            const insertStmt = this.db.prepare(`
                INSERT INTO attendance (
                    student_id, stream_id, academic_year_id, term_id,
                    attendance_date, status, notes, marked_by_user_id
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `)

            const transaction = this.db.transaction(() => {
                for (const entry of entries) {
                    const normalizedNotes = entry.notes?.trim() ? entry.notes.trim() : null
                    const updateResult = updateStmt.run(
                        entry.status,
                        normalizedNotes,
                        userId,
                        streamId,
                        entry.student_id,
                        date,
                        academicYearId,
                        termId
                    )

                    if (updateResult.changes === 0) {
                        insertStmt.run(
                            entry.student_id,
                            streamId,
                            academicYearId,
                            termId,
                            date,
                            entry.status,
                            normalizedNotes,
                            userId
                        )
                    }

                    marked += 1
                }
            })

            transaction()

            logAudit(userId, 'BULK_UPSERT', 'attendance', 0, null, {
                stream_id: streamId,
                date,
                count: marked
            })

            return { success: true, marked }
        } catch (error) {
            return { success: false, marked: 0, errors: [error instanceof Error ? error.message : 'Unknown error'] }
        }
    }

    /**
     * Get attendance summary for a student
     */
    async getStudentAttendanceSummary(
        studentId: number,
        academicYearId: number,
        termId?: number
    ): Promise<AttendanceSummary> {
        let query = `
      SELECT 
        COUNT(*) as total_days,
        SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END) as present,
        SUM(CASE WHEN status = 'ABSENT' THEN 1 ELSE 0 END) as absent,
        SUM(CASE WHEN status = 'LATE' THEN 1 ELSE 0 END) as late,
        SUM(CASE WHEN status = 'EXCUSED' THEN 1 ELSE 0 END) as excused
      FROM attendance
      WHERE student_id = ? AND academic_year_id = ?
    `

        const params: (number | undefined)[] = [studentId, academicYearId]

        if (termId) {
            query += ' AND term_id = ?'
            params.push(termId)
        }

        const result = this.db.prepare(query).get(...params) as {
            total_days: number
            present: number
            absent: number
            late: number
            excused: number
        }

        const totalDays = result.total_days || 0
        const present = result.present || 0

        return {
            total_days: totalDays,
            present,
            absent: result.absent || 0,
            late: result.late || 0,
            excused: result.excused || 0,
            attendance_rate: totalDays > 0 ? Math.round((present / totalDays) * 100) : 0
        }
    }

    /**
     * Get class attendance summary for a specific date
     */
    async getClassAttendanceSummary(
        streamId: number,
        date: string,
        academicYearId: number,
        termId: number
    ): Promise<{ present: number; absent: number; late: number; excused: number; total: number }> {
        const result = this.db.prepare(`
      SELECT 
        SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END) as present,
        SUM(CASE WHEN status = 'ABSENT' THEN 1 ELSE 0 END) as absent,
        SUM(CASE WHEN status = 'LATE' THEN 1 ELSE 0 END) as late,
        SUM(CASE WHEN status = 'EXCUSED' THEN 1 ELSE 0 END) as excused,
        COUNT(*) as total
      FROM attendance
      WHERE stream_id = ? AND attendance_date = ? AND academic_year_id = ? AND term_id = ?
    `).get(streamId, date, academicYearId, termId) as {
            present: number
            absent: number
            late: number
            excused: number
            total: number
        }

        return {
            present: result.present || 0,
            absent: result.absent || 0,
            late: result.late || 0,
            excused: result.excused || 0,
            total: result.total || 0
        }
    }

    /**
     * Get students for attendance marking (enrolled students in stream)
     */
    async getStudentsForAttendance(
        streamId: number,
        academicYearId: number,
        termId: number
    ): Promise<{ student_id: number; student_name: string; admission_number: string }[]> {
        return this.db.prepare(`
      SELECT 
        e.student_id,
        s.first_name || ' ' || s.last_name as student_name,
        s.admission_number
      FROM enrollment e
      JOIN student s ON e.student_id = s.id
      WHERE e.stream_id = ?
        AND e.academic_year_id = ?
        AND e.term_id = ?
        AND e.status = 'ACTIVE'
        AND s.is_active = 1
      ORDER BY s.first_name, s.last_name
    `).all(streamId, academicYearId, termId) as { student_id: number; student_name: string; admission_number: string }[]
    }
}
