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
        let marked = 0

        try {
            const transaction = this.db.transaction(() => {
                // Delete existing records for this date/stream
                this.db.prepare(`
          DELETE FROM attendance 
          WHERE stream_id = ? AND attendance_date = ? AND academic_year_id = ? AND term_id = ?
        `).run(streamId, date, academicYearId, termId)

                // Insert new records
                const insertStmt = this.db.prepare(`
          INSERT INTO attendance (student_id, stream_id, academic_year_id, term_id, attendance_date, status, notes, marked_by_user_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)

                for (const entry of entries) {
                    insertStmt.run(
                        entry.student_id,
                        streamId,
                        academicYearId,
                        termId,
                        date,
                        entry.status,
                        entry.notes || null,
                        userId
                    )
                    marked++
                }
            })

            transaction()

            logAudit(userId, 'BULK_CREATE', 'attendance', 0, null, {
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
