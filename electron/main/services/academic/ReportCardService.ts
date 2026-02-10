import { AttendanceService } from './AttendanceService'
import { getDatabase } from '../../database'

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

interface StudentInfoResult {
  id: number;
  admission_number: string;
  first_name: string;
  last_name: string;
  stream_name: string | null;
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

interface ReportCardSummaryRow {
  total_marks: number;
  mean_score: number;
  mean_grade: string;
  class_position: number;
  class_teacher_remarks: string;
  principal_remarks: string;
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
                    WHEN lower(e.exam_name) LIKE '%cat 1%' OR lower(e.exam_name) LIKE '%cat1%' THEN 'CAT1'
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
      SELECT s.id, s.admission_number, s.first_name, s.last_name, st.stream_name
      FROM student s
      LEFT JOIN enrollment e ON s.id = e.student_id AND e.academic_year_id = ? AND e.term_id = ?
      LEFT JOIN stream st ON e.stream_id = st.id
      WHERE s.id = ?
    `).get(academicYearId, termId, studentId) as StudentInfoResult | undefined
        return student || null
    }

    private getDynamicGradeResolver(): (score: number) => { grade: string; remarks: string } {
        const gradingScale = this.db.prepare('SELECT * FROM grading_scale WHERE curriculum = ?').all('8-4-4') as GradingScaleRow[]
        return (score: number) => {
            const row = gradingScale.find(scale => score >= scale.min_score && score <= scale.max_score)
            return { grade: row?.grade || 'F', remarks: row?.remarks || 'Poor' }
        }
    }

    private getSubjectExamResults(studentId: number, subjectId: number, termId: number): ExamResultRow[] {
        return this.db.prepare(`
                SELECT er.score, er.competency_level, 1 as weight
                FROM exam_result er
                JOIN exam e ON er.exam_id = e.id
                WHERE er.student_id = ? AND er.subject_id = ? AND e.term_id = ?
            `).all(studentId, subjectId, termId) as ExamResultRow[]
    }

    private buildGradeRows(
        subjects: Subject[],
        studentId: number,
        termId: number,
        resolveGrade: (score: number) => { grade: string; remarks: string }
    ): ReportCardData['grades'] {
        return subjects.map(subject => {
            const results = this.getSubjectExamResults(studentId, subject.id, termId)
            if (results.length === 0) {return null}

            const totals = results.reduce((acc, result) => {
                const score = result.score ?? (result.competency_level * 25)
                return {
                    weightedSum: acc.weightedSum + (score * result.weight),
                    totalWeight: acc.totalWeight + result.weight
                }
            }, { weightedSum: 0, totalWeight: 0 })

            const average = totals.totalWeight > 0 ? totals.weightedSum / totals.totalWeight : 0
            const { grade, remarks } = resolveGrade(average)
            return {
                subject_name: subject.subject_name,
                subject_code: subject.subject_code,
                cat1: null,
                cat2: null,
                midterm: null,
                final_exam: null,
                average: Math.round(average * 10) / 10,
                grade_letter: grade,
                remarks
            }
        }).filter(Boolean) as ReportCardData['grades']
    }

    private getClassSize(studentId: number, academicYearId: number, termId: number): number {
        const result = this.db.prepare(`
            SELECT COUNT(*) as count FROM enrollment 
            WHERE stream_id = (SELECT stream_id FROM enrollment WHERE student_id = ? AND academic_year_id = ? AND term_id = ?)
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
        resolveGrade: (score: number) => { grade: string; remarks: string }
    ): ReportCardData['summary'] {
        const rawAverage = gradeRows.length > 0
            ? gradeRows.reduce((sum, row) => sum + row.average, 0) / gradeRows.length
            : 0
        const { totalMarks, overallAverage } = this.calculateRoundedScoreMetrics(gradeRows)

        return {
            total_marks: summary?.total_marks ?? totalMarks,
            average: summary?.mean_score ?? overallAverage,
            grade: this.resolveSummaryGrade(summary, rawAverage, resolveGrade),
            position: summary?.class_position ?? null,
            class_size: classSize,
            teacher_remarks: this.resolveTeacherRemarks(summary, rawAverage),
            principal_remarks: summary?.principal_remarks ?? ''
        }
    }

    async generateReportCard(
        studentId: number,
        academicYearId: number,
        termId: number
    ): Promise<ReportCardData | null> {
        const student = this.getStudentInfo(studentId, academicYearId, termId)

        if (!student) {return null}

        const yearInfo = this.db.prepare(`SELECT year_name FROM academic_year WHERE id = ?`).get(academicYearId) as { year_name: string }
        const termInfo = this.db.prepare(`SELECT term_name FROM term WHERE id = ?`).get(termId) as { term_name: string }
        const subjects = await this.getSubjects()
        const resolveGrade = this.getDynamicGradeResolver()
        const gradeRows = this.buildGradeRows(subjects, studentId, termId, resolveGrade)

        const attendance = await this.attendanceService.getStudentAttendanceSummary(studentId, academicYearId, termId)
        const summary = this.db.prepare(`
            SELECT * FROM report_card_summary 
            WHERE student_id = ? AND exam_id IN (SELECT id FROM exam WHERE term_id = ?)
            ORDER BY id DESC LIMIT 1
        `).get(studentId, termId) as ReportCardSummaryRow | undefined
        const classSize = this.getClassSize(studentId, academicYearId, termId)

        return {
            student: {
                id: student.id,
                admission_number: student.admission_number,
                first_name: student.first_name,
                last_name: student.last_name,
                stream_name: student.stream_name || 'N/A'
            },
            academic_year: yearInfo.year_name || '',
            term: termInfo.term_name || '',
            grades: gradeRows,
            attendance: {
                total_days: attendance.total_days,
                present: attendance.present,
                absent: attendance.absent,
                attendance_rate: attendance.attendance_rate
            },
            summary: this.buildSummary(summary, gradeRows, classSize, resolveGrade)
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
        if (average >= 80) {return 'Outstanding performance. Keep up the excellent work!'}
        if (average >= 70) {return 'Very good performance. Continue working hard.'}
        if (average >= 60) {return 'Good effort. There is room for improvement.'}
        if (average >= 50) {return 'Fair performance. More effort needed.'}
        return 'Needs significant improvement. Please seek additional support.'
    }
}

