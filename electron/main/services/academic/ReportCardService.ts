import { getDatabase } from '../../database'
import { AttendanceService } from './AttendanceService'

export interface Subject {
    id: number
    subject_name: string
    subject_code: string
}

export interface Grade {
    student_id: number
    subject_id: number
    exam_type: 'CAT1' | 'CAT2' | 'MIDTERM' | 'FINAL'
    score: number
    max_score: number
    term_id: number
    academic_year_id: number
}

export interface ReportCardData {
    student: {
        id: number
        admission_number: string
        first_name: string
        last_name: string
        stream_name: string
    }
    academic_year: string
    term: string
    grades: {
        subject_name: string
        subject_code: string
        cat1: number | null
        cat2: number | null
        midterm: number | null
        final_exam: number | null
        average: number
        grade_letter: string
        remarks: string
    }[]
    attendance: {
        total_days: number
        present: number
        absent: number
        attendance_rate: number
    }
    summary: {
        total_marks: number
        average: number
        grade: string
        position: number | null
        class_size: number
        teacher_remarks: string
        principal_remarks: string
    }
}

export class ReportCardService {
    private get db() { return getDatabase() }
    private attendanceService = new AttendanceService()

    /**
     * Get all subjects
     */
    async getSubjects(): Promise<Subject[]> {
        return this.db.prepare(`
      SELECT id, subject_name, subject_code FROM subject WHERE is_active = 1 ORDER BY subject_name
    `).all() as Subject[]
    }

    /**
     * Get grades for a student in a term
     */
    async getStudentGrades(
        studentId: number,
        academicYearId: number,
        termId: number
    ): Promise<Grade[]> {
        return this.db.prepare(`
      SELECT * FROM grade 
      WHERE student_id = ? AND academic_year_id = ? AND term_id = ?
    `).all(studentId, academicYearId, termId) as Grade[]
    }

    /**
     * Generate a complete report card for a student
     */
    async generateReportCard(
        studentId: number,
        academicYearId: number,
        termId: number
    ): Promise<ReportCardData | null> {
        // Get student info
        const student = this.db.prepare(`
      SELECT s.id, s.admission_number, s.first_name, s.last_name, st.stream_name
      FROM student s
      LEFT JOIN enrollment e ON s.id = e.student_id AND e.academic_year_id = ? AND e.term_id = ?
      LEFT JOIN stream st ON e.stream_id = st.id
      WHERE s.id = ?
    `).get(academicYearId, termId, studentId) as any

        if (!student) return null

        // Get academic year and term info
        const yearInfo = this.db.prepare(`SELECT year_name FROM academic_year WHERE id = ?`).get(academicYearId) as { year_name: string }
        const termInfo = this.db.prepare(`SELECT term_name FROM term WHERE id = ?`).get(termId) as { term_name: string }

        // Get all subjects
        const subjects = await this.getSubjects()

        // Get all grades for this student
        const grades = await this.getStudentGrades(studentId, academicYearId, termId)
        const gradeMap = new Map<string, Grade>()
        grades.forEach(g => {
            gradeMap.set(`${g.subject_id}-${g.exam_type}`, g)
        })

        // Fetch dynamic grading scale for curriculum (Defaulting to 8-4-4 for now, can be refined per student level)
        const gradingScale = this.db.prepare('SELECT * FROM grading_scale WHERE curriculum = ?').all('8-4-4') as any[]
        const getDynamicGrade = (score: number) => {
            const row = gradingScale.find(gs => score >= gs.min_score && score <= gs.max_score)
            return { grade: row?.grade || 'F', remarks: row?.remarks || 'Poor' }
        }

        // Build grade rows
        const gradeRows = subjects.map(subject => {
            // Updated to use the new exam_result table
            const results = this.db.prepare(`
                SELECT er.score, er.competency_level, e.weight
                FROM exam_result er
                JOIN exam e ON er.exam_id = e.id
                WHERE er.student_id = ? AND er.subject_id = ? AND e.term_id = ?
            `).all(studentId, subject.id, termId) as any[]

            if (results.length === 0) return null

            // Calculate weighted average
            let totalWeight = 0
            let weightedSum = 0
            results.forEach(r => {
                const score = r.score !== null ? r.score : (r.competency_level * 25)
                weightedSum += score * r.weight
                totalWeight += r.weight
            })

            const average = totalWeight > 0 ? weightedSum / totalWeight : 0
            const { grade, remarks } = getDynamicGrade(average)

            return {
                subject_name: subject.subject_name,
                subject_code: subject.subject_code,
                average: Math.round(average * 10) / 10,
                grade_letter: grade,
                remarks
            }
        }).filter(g => g !== null) as any[]

        // Get attendance
        const attendance = await this.attendanceService.getStudentAttendanceSummary(studentId, academicYearId, termId)

        // Calculate fallbacks if summary doesn't exist
        const totalMarks = gradeRows.reduce((sum, g) => sum + g.average, 0)
        const overallAverage = gradeRows.length > 0 ? totalMarks / gradeRows.length : 0

        // Fetch overall summary (position, total)
        const summary = this.db.prepare(`
            SELECT * FROM report_card_summary 
            WHERE student_id = ? AND exam_id IN (SELECT id FROM exam WHERE term_id = ?)
            ORDER BY id DESC LIMIT 1
        `).get(studentId, termId) as any

        // Calculate class size
        const { count: classSize } = this.db.prepare(`
            SELECT COUNT(*) as count FROM enrollment 
            WHERE stream_id = (SELECT stream_id FROM enrollment WHERE student_id = ? AND academic_year_id = ? AND term_id = ?)
            AND academic_year_id = ? AND term_id = ? AND status = 'ACTIVE'
        `).get(studentId, academicYearId, termId, academicYearId, termId) as { count: number }

        return {
            student: {
                id: student.id,
                admission_number: student.admission_number,
                first_name: student.first_name,
                last_name: student.last_name,
                stream_name: student.stream_name || 'N/A'
            },
            academic_year: yearInfo?.year_name || '',
            term: termInfo?.term_name || '',
            grades: gradeRows,
            attendance: {
                total_days: attendance.total_days,
                present: attendance.present,
                absent: attendance.absent,
                attendance_rate: attendance.attendance_rate
            },
            summary: {
                total_marks: summary?.total_marks || Math.round(totalMarks * 10) / 10,
                average: summary?.mean_score || Math.round(overallAverage * 10) / 10,
                grade: summary?.mean_grade || getDynamicGrade(overallAverage).grade,
                position: summary?.class_position || null,
                class_size: classSize || 0,
                teacher_remarks: summary?.class_teacher_remarks || this.getOverallRemarks(overallAverage),
                principal_remarks: summary?.principal_remarks || ''
            }
        }
    }

    /**
     * Get students in a class for batch report card generation
     */
    async getStudentsForReportCards(
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
      ORDER BY s.first_name, s.last_name
    `).all(streamId, academicYearId, termId) as { student_id: number; student_name: string; admission_number: string }[]
    }

    private getOverallRemarks(average: number): string {
        if (average >= 80) return 'Outstanding performance. Keep up the excellent work!'
        if (average >= 70) return 'Very good performance. Continue working hard.'
        if (average >= 60) return 'Good effort. There is room for improvement.'
        if (average >= 50) return 'Fair performance. More effort needed.'
        return 'Needs significant improvement. Please seek additional support.'
    }
}
