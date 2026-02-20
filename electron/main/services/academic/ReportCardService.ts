import { AttendanceService } from './AttendanceService'
import { getDatabase } from '../../database'
import { getImageAsBase64DataUrl } from '../../utils/image-utils'

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
        photo?: string | null
    }
    school?: {
        name: string
        motto: string
        logo: string | null
        address?: string
        email?: string
        phone?: string
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
    rankings: {
        cat1: number | null
        cat2: number | null
        midterm: number | null
        final_exam: number | null
        average: number | null
    }
}

interface StudentInfoResult {
    id: number;
    admission_number: string;
    first_name: string;
    last_name: string;
    stream_name: string | null;
    photo_path?: string | null;
}

interface GradingScaleRow {
    grade: string;
    remarks: string;
    min_score: number;
    max_score: number;
}

interface ExamResultRow {
    score: number | null;
    competency_level: number;
    weight: number;
}

interface TypedExamResultRow {
    subject_id: number;
    exam_type: string;
    score: number;
}

interface ReportCardSummaryRow {
    total_marks: number;
    mean_score: number;
    mean_grade: string;
    class_position: number;
    class_teacher_remarks: string;
    principal_remarks: string;
}

interface SchoolSettingsRow {
    school_name: string
    school_motto: string
    logo_path: string
    address: string
    email: string
    phone: string
}

export class ReportCardService {
    private get db() { return getDatabase() }
    private readonly attendanceService = new AttendanceService()
    private subjectColumnCache: { nameColumn: 'name' | 'subject_name'; codeColumn: 'code' | 'subject_code' } | null = null

    private tableExists(tableName: string): boolean {
        const row = this.db
            .prepare(`SELECT 1 as found FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`)
            .get(tableName) as { found?: number } | undefined
        return row?.found === 1
    }

    private resolveSubjectColumns(forceRefresh: boolean = false): { nameColumn: 'name' | 'subject_name'; codeColumn: 'code' | 'subject_code' } {
        if (!forceRefresh && this.subjectColumnCache) {
            return this.subjectColumnCache
        }

        const columns = this.db.prepare(`PRAGMA table_info(subject)`).all() as Array<{ name: string }>
        const columnNames = new Set(columns.map((column) => column.name))

        let nameColumn: 'name' | 'subject_name' | null = null
        if (columnNames.has('name')) {
            nameColumn = 'name'
        } else if (columnNames.has('subject_name')) {
            nameColumn = 'subject_name'
        }

        let codeColumn: 'code' | 'subject_code' | null = null
        if (columnNames.has('code')) {
            codeColumn = 'code'
        } else if (columnNames.has('subject_code')) {
            codeColumn = 'subject_code'
        }

        if (!nameColumn || !codeColumn) {
            throw new Error('Subject schema mismatch: required subject name/code columns are missing')
        }

        this.subjectColumnCache = { nameColumn, codeColumn }
        return this.subjectColumnCache
    }

    /**
     * Get all subjects
     */
    async getSubjects(): Promise<Subject[]> {
        const querySubjects = (nameColumn: 'name' | 'subject_name', codeColumn: 'code' | 'subject_code'): Subject[] =>
            this.db.prepare(`
              SELECT id, ${nameColumn} as subject_name, ${codeColumn} as subject_code
              FROM subject
              WHERE COALESCE(is_active, 1) = 1
              ORDER BY ${nameColumn}
            `).all() as Subject[]

        const { nameColumn, codeColumn } = this.resolveSubjectColumns()

        try {
            return querySubjects(nameColumn, codeColumn)
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            const isColumnError = message.includes('no such column')
            if (!isColumnError) {
                throw error
            }

            // Schema may have changed after cache warm-up; refresh and retry once.
            this.subjectColumnCache = null
            const refreshed = this.resolveSubjectColumns(true)
            return querySubjects(refreshed.nameColumn, refreshed.codeColumn)
        }
    }

    /**
     * Get grades for a student in a term
     */
    async getStudentGrades(
        studentId: number,
        academicYearId: number,
        termId: number
    ): Promise<Grade[]> {
        if (!this.tableExists('grade')) {
            return this.db.prepare(`
                SELECT
                  er.student_id,
                  er.subject_id,
                  CASE
                    WHEN lower(e.exam_name) LIKE '%cat 1%' OR lower(e.exam_name) LIKE '%cat1%' OR lower(e.exam_name) LIKE '%opening%' THEN 'CAT1'
                    WHEN lower(e.exam_name) LIKE '%cat 2%' OR lower(e.exam_name) LIKE '%cat2%' THEN 'CAT2'
                    WHEN lower(e.exam_name) LIKE '%mid%' THEN 'MIDTERM'
                    ELSE 'FINAL'
                  END as exam_type,
                  COALESCE(er.score, 0) as score,
                  100 as max_score,
                  e.term_id,
                  e.academic_year_id
                FROM exam_result er
                JOIN exam e ON er.exam_id = e.id
                WHERE er.student_id = ? AND e.academic_year_id = ? AND e.term_id = ?
            `).all(studentId, academicYearId, termId) as Grade[]
        }

        return this.db.prepare(`
      SELECT * FROM grade 
      WHERE student_id = ? AND academic_year_id = ? AND term_id = ?
    `).all(studentId, academicYearId, termId) as Grade[]
    }

    /**
     * Generate a complete report card for a student
     */
    private getStudentInfo(studentId: number, academicYearId: number, termId: number): StudentInfoResult | null {
        const student = this.db.prepare(`
      SELECT s.id, s.admission_number, s.first_name, s.last_name, s.photo_path, st.stream_name
      FROM student s
      LEFT JOIN enrollment e
        ON s.id = e.student_id
       AND e.academic_year_id = ?
       AND e.term_id = ?
       AND e.status = 'ACTIVE'
      LEFT JOIN stream st ON e.stream_id = st.id
      WHERE s.id = ?
    `).get(academicYearId, termId, studentId) as StudentInfoResult | undefined
        return student || null
    }

    private detectCurriculum(streamName: string | null): 'ECDE' | 'CBC' | '8-4-4' {
        if (!streamName) {return 'CBC'}
        const name = streamName.toUpperCase()
        if (name.includes('BABY') || name.includes('PP') || name.includes('NURSERY') || name.includes('PRE-')) {
            return 'ECDE'
        }
        if (name.includes('CLASS 8') || name.includes('STD 8')) {
            return '8-4-4'
        }
        return 'CBC'
    }

    private getDynamicGradeResolver(curriculum: 'ECDE' | 'CBC' | '8-4-4'): (score: number) => { grade: string; remarks: string } {
        const gradingScale = this.db.prepare('SELECT * FROM grading_scale WHERE curriculum = ?').all(curriculum) as GradingScaleRow[]
        return (score: number) => {
            const row = gradingScale.find(scale => score >= scale.min_score && score <= scale.max_score)
            let grade = row?.grade || (curriculum === '8-4-4' ? 'E' : 'BE2')
            const remarks = row?.remarks || 'Below Expectations'

            // FALLBACK: Enforce short codes if long names are found (DB fix fallback)
            // This handles cases where the DB grading_scale table still has full text like "Meeting Expectations"
            if (curriculum !== '8-4-4' && grade.length > 5) {
                if (score >= 90) {grade = 'EE1'}
                else if (score >= 75) {grade = 'EE2'}
                else if (score >= 58) {grade = 'ME1'}
                else if (score >= 41) {grade = 'ME2'}
                else if (score >= 31) {grade = 'AE1'}
                else if (score >= 21) {grade = 'AE2'}
                else if (score >= 11) {grade = 'BE1'}
                else {grade = 'BE2'}
            }

            return { grade, remarks }
        }
    }

    private getSubjectExamResults(studentId: number, subjectId: number, academicYearId: number, termId: number): ExamResultRow[] {
        return this.db.prepare(`
                SELECT er.score, er.competency_level, 1 as weight
                FROM exam_result er
                JOIN exam e ON er.exam_id = e.id
                WHERE er.student_id = ?
                  AND er.subject_id = ?
                  AND e.academic_year_id = ?
                  AND e.term_id = ?
            `).all(studentId, subjectId, academicYearId, termId) as ExamResultRow[]
    }

    /**
     * Get all exam results for a student grouped by exam type (CAT1, CAT2, MIDTERM, FINAL)
     */
    private getAllExamResultsByType(studentId: number, academicYearId: number, termId: number): TypedExamResultRow[] {
        return this.db.prepare(`
            SELECT
                er.subject_id,
                CASE
                    WHEN lower(e.exam_name) LIKE '%cat 1%' OR lower(e.exam_name) LIKE '%cat1%' OR lower(e.exam_name) LIKE '%opening%' THEN 'CAT1'
                    WHEN lower(e.exam_name) LIKE '%cat 2%' OR lower(e.exam_name) LIKE '%cat2%' THEN 'CAT2'
                    WHEN lower(e.exam_name) LIKE '%mid%' THEN 'MIDTERM'
                    ELSE 'FINAL'
                END as exam_type,
                COALESCE(er.score, er.competency_level * 25, 0) as score
            FROM exam_result er
            JOIN exam e ON er.exam_id = e.id
            WHERE er.student_id = ?
              AND e.academic_year_id = ?
              AND e.term_id = ?
        `).all(studentId, academicYearId, termId) as TypedExamResultRow[]
    }

    private buildGradeRows(
        subjects: Subject[],
        studentId: number,
        academicYearId: number,
        termId: number,
        resolveGrade: (score: number) => { grade: string; remarks: string }
    ): ReportCardData['grades'] {
        // Fetch all typed results upfront
        const typedResults = this.getAllExamResultsByType(studentId, academicYearId, termId)

        return subjects.map(subject => {
            const results = this.getSubjectExamResults(studentId, subject.id, academicYearId, termId)
            if (results.length === 0) { return null }

            // Get per-type scores for this subject
            const subjectTyped = typedResults.filter(r => r.subject_id === subject.id)
            const cat1Score = subjectTyped.find(r => r.exam_type === 'CAT1')?.score ?? null
            const cat2Score = subjectTyped.find(r => r.exam_type === 'CAT2')?.score ?? null
            const midScore = subjectTyped.find(r => r.exam_type === 'MIDTERM')?.score ?? null
            const finalScore = subjectTyped.find(r => r.exam_type === 'FINAL')?.score ?? null

            // Compute average from the displayed per-type scores
            const availableScores = [cat1Score, cat2Score, midScore, finalScore].filter((s): s is number => s !== null)
            const average = availableScores.length > 0
                ? availableScores.reduce((a, b) => a + b, 0) / availableScores.length
                : 0
            const { grade, remarks } = resolveGrade(average)
            return {
                subject_name: subject.subject_name,
                subject_code: subject.subject_code,
                cat1: cat1Score,
                cat2: cat2Score,
                midterm: midScore,
                final_exam: finalScore,
                average: Math.round(average * 10) / 10,
                grade_letter: grade,
                remarks
            }
        }).filter(Boolean) as ReportCardData['grades']
    }

    private getClassSize(studentId: number, academicYearId: number, termId: number): number {
        const result = this.db.prepare(`
            SELECT COUNT(*) as count FROM enrollment 
            WHERE stream_id = (
              SELECT stream_id
              FROM enrollment
              WHERE student_id = ?
                AND academic_year_id = ?
                AND term_id = ?
                AND status = 'ACTIVE'
              ORDER BY created_at DESC
              LIMIT 1
            )
            AND academic_year_id = ? AND term_id = ? AND status = 'ACTIVE'
        `).get(studentId, academicYearId, termId, academicYearId, termId) as { count: number }

        return result.count || 0
    }

    private calculateRoundedScoreMetrics(gradeRows: ReportCardData['grades']): { totalMarks: number; overallAverage: number } {
        const totalMarks = gradeRows.reduce((sum, row) => sum + row.average, 0)
        const average = gradeRows.length > 0 ? totalMarks / gradeRows.length : 0
        return {
            totalMarks: Math.round(totalMarks * 10) / 10,
            overallAverage: Math.round(average * 10) / 10
        }
    }

    private resolveSummaryGrade(
        summary: ReportCardSummaryRow | undefined,
        rawAverage: number,
        resolveGrade: (score: number) => { grade: string; remarks: string }
    ): string {
        return summary?.mean_grade ?? resolveGrade(rawAverage).grade
    }

    private resolveTeacherRemarks(summary: ReportCardSummaryRow | undefined, rawAverage: number): string {
        return summary?.class_teacher_remarks ?? this.getOverallRemarks(rawAverage)
    }

    private buildSummary(
        summary: ReportCardSummaryRow | undefined,
        gradeRows: ReportCardData['grades'],
        classSize: number,
        resolveGrade: (score: number) => { grade: string; remarks: string },
        computedPosition: number | null
    ): ReportCardData['summary'] {
        const rawAverage = gradeRows.length > 0
            ? gradeRows.reduce((sum, row) => sum + row.average, 0) / gradeRows.length
            : 0
        const { totalMarks, overallAverage } = this.calculateRoundedScoreMetrics(gradeRows)

        return {
            total_marks: summary?.total_marks ?? totalMarks,
            average: summary?.mean_score ?? overallAverage,
            grade: this.resolveSummaryGrade(summary, rawAverage, resolveGrade),
            position: summary?.class_position ?? computedPosition,
            class_size: classSize,
            teacher_remarks: this.resolveTeacherRemarks(summary, rawAverage),
            principal_remarks: summary?.principal_remarks ?? ''
        }
    }

    /**
     * Compute class rankings: overall and per exam type
     */
    private computeClassRankings(
        studentId: number,
        academicYearId: number,
        termId: number
    ): { position: number; rankings: ReportCardData['rankings'] } {
        // Get all students in the same stream
        const streamResult = this.db.prepare(`
            SELECT stream_id FROM enrollment
            WHERE student_id = ? AND academic_year_id = ? AND term_id = ? AND status = 'ACTIVE'
            ORDER BY created_at DESC LIMIT 1
        `).get(studentId, academicYearId, termId) as { stream_id: number } | undefined

        if (!streamResult) {
            return { position: 0, rankings: { cat1: null, cat2: null, midterm: null, final_exam: null, average: null } }
        }

        const classmates = this.db.prepare(`
            SELECT e.student_id
            FROM enrollment e
            JOIN student s ON e.student_id = s.id
            WHERE e.stream_id = ? AND e.academic_year_id = ? AND e.term_id = ?
              AND e.status = 'ACTIVE' AND s.is_active = 1
        `).all(streamResult.stream_id, academicYearId, termId) as { student_id: number }[]

        // For each classmate, compute totals per exam type and overall average
        const studentScores: {
            id: number
            cat1Total: number; cat2Total: number; midTotal: number; finalTotal: number
            avgTotal: number; subjectCount: number
        }[] = []

        for (const mate of classmates) {
            const results = this.getAllExamResultsByType(mate.student_id, academicYearId, termId)
            if (results.length === 0) {continue}

            let cat1T = 0, cat2T = 0, midT = 0, finalT = 0
            const subjectScores: Map<number, number[]> = new Map()

            for (const r of results) {
                if (r.exam_type === 'CAT1') {cat1T += r.score}
                else if (r.exam_type === 'CAT2') {cat2T += r.score}
                else if (r.exam_type === 'MIDTERM') {midT += r.score}
                else {finalT += r.score}

                if (!subjectScores.has(r.subject_id)) {subjectScores.set(r.subject_id, [])}
                subjectScores.get(r.subject_id)!.push(r.score)
            }

            // Compute average per subject, then overall average
            let avgTotal = 0
            let subjectCount = 0
            for (const scores of subjectScores.values()) {
                const subjectAvg = scores.reduce((a, b) => a + b, 0) / scores.length
                avgTotal += subjectAvg
                subjectCount++
            }

            studentScores.push({
                id: mate.student_id,
                cat1Total: cat1T, cat2Total: cat2T, midTotal: midT, finalTotal: finalT,
                avgTotal, subjectCount
            })
        }

        // Rank helper: returns rank of studentId in sorted array (descending)
        const rankBy = (key: (s: typeof studentScores[0]) => number): number | null => {
            const sorted = [...studentScores].sort((a, b) => key(b) - key(a))
            const idx = sorted.findIndex(s => s.id === studentId)
            return idx >= 0 ? idx + 1 : null
        }

        // Check if any students have data for each exam type
        const hasCat1 = studentScores.some(s => s.cat1Total > 0)
        const hasCat2 = studentScores.some(s => s.cat2Total > 0)
        const hasMid = studentScores.some(s => s.midTotal > 0)
        const hasFinal = studentScores.some(s => s.finalTotal > 0)

        return {
            position: rankBy(s => s.subjectCount > 0 ? s.avgTotal / s.subjectCount : 0) ?? 0,
            rankings: {
                cat1: hasCat1 ? rankBy(s => s.cat1Total) : null,
                cat2: hasCat2 ? rankBy(s => s.cat2Total) : null,
                midterm: hasMid ? rankBy(s => s.midTotal) : null,
                final_exam: hasFinal ? rankBy(s => s.finalTotal) : null,
                average: rankBy(s => s.subjectCount > 0 ? s.avgTotal / s.subjectCount : 0)
            }
        }
    }

    async generateReportCard(
        studentId: number,
        academicYearId: number,
        termId: number
    ): Promise<ReportCardData | null> {
        const student = this.getStudentInfo(studentId, academicYearId, termId)

        if (!student) { return null }

        const yearInfo = this.db.prepare(`SELECT year_name FROM academic_year WHERE id = ?`).get(academicYearId) as { year_name: string }
        const termInfo = this.db.prepare(`SELECT term_name FROM term WHERE id = ?`).get(termId) as { term_name: string }

        // Fetch school settings
        const schoolSettings = this.db.prepare('SELECT * FROM school_settings LIMIT 1').get() as SchoolSettingsRow | undefined

        const subjects = await this.getSubjects()

        const curriculum = this.detectCurriculum(student.stream_name)
        const resolveGrade = this.getDynamicGradeResolver(curriculum)

        const gradeRows = this.buildGradeRows(subjects, studentId, academicYearId, termId, resolveGrade)

        const attendance = await this.attendanceService.getStudentAttendanceSummary(studentId, academicYearId, termId)
        const summary = this.db.prepare(`
            SELECT * FROM report_card_summary 
            WHERE student_id = ?
              AND exam_id IN (
                SELECT id
                FROM exam
                WHERE term_id = ?
                  AND academic_year_id = ?
              )
            ORDER BY id DESC LIMIT 1
        `).get(studentId, termId, academicYearId) as ReportCardSummaryRow | undefined
        const classSize = this.getClassSize(studentId, academicYearId, termId)

        // Compute class rankings (overall and per exam type)
        const rankingData = this.computeClassRankings(studentId, academicYearId, termId)

        return {
            student: {
                id: student.id,
                admission_number: student.admission_number,
                first_name: student.first_name,
                last_name: student.last_name,
                stream_name: student.stream_name || 'N/A',
                photo: student.photo_path ? getImageAsBase64DataUrl(student.photo_path) : null
            },
            school: schoolSettings ? {
                name: schoolSettings.school_name,
                motto: schoolSettings.school_motto,
                logo: schoolSettings.logo_path ? getImageAsBase64DataUrl(schoolSettings.logo_path) : null,
                address: schoolSettings.address,
                email: schoolSettings.email,
                phone: schoolSettings.phone
            } : undefined,
            academic_year: yearInfo.year_name || '',
            term: termInfo.term_name || '',
            grades: gradeRows,
            attendance: {
                total_days: attendance.total_days,
                present: attendance.present,
                absent: attendance.absent,
                attendance_rate: attendance.attendance_rate
            },
            summary: this.buildSummary(summary, gradeRows, classSize, resolveGrade, rankingData.position),
            rankings: rankingData.rankings
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
        AND s.is_active = 1
      ORDER BY s.first_name, s.last_name
    `).all(streamId, academicYearId, termId) as { student_id: number; student_name: string; admission_number: string }[]
    }

    private getOverallRemarks(average: number): string {
        if (average >= 80) { return 'Outstanding performance. Keep up the excellent work!' }
        if (average >= 70) { return 'Very good performance. Continue working hard.' }
        if (average >= 60) { return 'Good effort. There is room for improvement.' }
        if (average >= 50) { return 'Fair performance. More effort needed.' }
        return 'Needs significant improvement. Please seek additional support.'
    }
}
