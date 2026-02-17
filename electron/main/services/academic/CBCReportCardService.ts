import { getDatabase } from '../../database'
import { buildFeeInvoiceActiveStatusPredicate, buildFeeInvoiceOutstandingBalanceSql } from '../../utils/feeInvoiceSql'

import type {
  BatchGenerationResult,
  AcademicYearResult,
  AttendanceResult,
  ClassPositionResult,
  ExamResult,
  FeeBalanceResult,
  LearningAreaResult,
  ReportCardRecord,
  ReportCardSubjectRecord,
  StreamResult,
  StudentReportCard,
  StudentResult,
  SubjectGradeResult,
  TermResult
} from './CBCReportCardService.types'

export type { StudentReportCard } from './CBCReportCardService.types'

export class CBCReportCardService {
  private get db() {
    return getDatabase()
  }
  private subjectNameColumnCache: 'name' | 'subject_name' | null = null

  private resolveSubjectNameColumn(forceRefresh: boolean = false): 'name' | 'subject_name' {
    if (!forceRefresh && this.subjectNameColumnCache) {
      return this.subjectNameColumnCache
    }

    const columns = this.db.prepare('PRAGMA table_info(subject)').all() as Array<{ name: string }>
    const columnNames = new Set(columns.map((column) => column.name))

    if (columnNames.has('name')) {
      this.subjectNameColumnCache = 'name'
      return this.subjectNameColumnCache
    }

    if (columnNames.has('subject_name')) {
      this.subjectNameColumnCache = 'subject_name'
      return this.subjectNameColumnCache
    }

    throw new Error('Subject schema mismatch: required subject name column is missing')
  }

  private getRecordById<T>(tableName: string, id: number): T | undefined {
    return this.db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id) as T | undefined
  }

  private getExamOrThrow(examId: number): ExamResult {
    const exam = this.getRecordById<ExamResult>('exam', examId)
    if (!exam) {
      throw new Error('Exam not found')
    }
    return exam
  }

  private getEnrolledStudentOrThrow(studentId: number, exam: ExamResult): StudentResult {
    const student = this.db.prepare(`
      SELECT s.id, s.admission_number, s.first_name, s.last_name, s.student_type, e.stream_id
      FROM student s
      JOIN enrollment e ON s.id = e.student_id
      WHERE s.id = ?
        AND s.is_active = 1
        AND e.academic_year_id = ?
        AND e.term_id = ?
        AND e.status = 'ACTIVE'
      ORDER BY e.enrollment_date DESC
      LIMIT 1
    `).get(studentId, exam.academic_year_id, exam.term_id) as StudentResult | undefined

    if (!student) {
      throw new Error('Student not found or not enrolled for this term')
    }
    return student
  }

  private getSubjectGradesOrThrow(examId: number, studentId: number): SubjectGradeResult[] {
    const subjects = this.db.prepare(`
      SELECT
        s.id as subject_id,
        s.name as subject_name,
        er.score as marks,
        CASE
          WHEN er.score >= 90 THEN 'EE1'
          WHEN er.score >= 75 THEN 'EE2'
          WHEN er.score >= 58 THEN 'ME1'
          WHEN er.score >= 41 THEN 'ME2'
          WHEN er.score >= 31 THEN 'AE1'
          WHEN er.score >= 21 THEN 'AE2'
          WHEN er.score >= 11 THEN 'BE1'
          ELSE 'BE2'
        END as grade,
        ROUND(er.score, 1) as percentage,
        COALESCE(er.teacher_remarks, '') as teacher_comment,
        CASE
          WHEN er.score >= 75 THEN 'Exceeding Expectation'
          WHEN er.score >= 41 THEN 'Meeting Expectation'
          WHEN er.score >= 21 THEN 'Approaching Expectation'
          ELSE 'Below Expectation'
        END as competency_level
      FROM exam_result er
      JOIN subject s ON er.subject_id = s.id
      WHERE er.exam_id = ? AND er.student_id = ?
      ORDER BY s.name
    `).all(examId, studentId) as SubjectGradeResult[]

    if (subjects.length === 0) {
      throw new Error('No exam results found for this student')
    }

    return subjects
  }

  private calculatePerformance(subjects: SubjectGradeResult[]): { totalMarks: number; averageMarks: number; overallGrade: string; totalPoints: number; averagePoints: number } {
    const totalMarks = subjects.reduce((sum, subject) => sum + subject.marks, 0)
    const averageMarks = totalMarks / subjects.length
    const overallGrade = this.getGrade(averageMarks)
    const totalPoints = subjects.reduce((sum, subject) => sum + this.getPoints(this.getGrade(subject.marks)), 0)
    const averagePoints = totalPoints / subjects.length
    return {
      totalMarks,
      averageMarks,
      overallGrade,
      totalPoints,
      averagePoints
    }
  }

  private getLearningAreas(): LearningAreaResult[] {
    return this.db.prepare(`
      SELECT
        'Sports & Games' as area_name,
        'meets_expectations' as competency_level,
        'Good participation in sports activities' as teacher_comment
      UNION ALL
      SELECT 'Arts & Crafts', 'meets_expectations', 'Creative work shown'
      UNION ALL
      SELECT 'Agriculture & Nutrition', 'meets_expectations', 'Active in field work'
      UNION ALL
      SELECT 'Leadership & Community Service', 'meets_expectations', 'Good contributions'
    `).all() as LearningAreaResult[]
  }

  private getAttendanceMetrics(
    studentId: number,
    academicYearId: number,
    termId: number
  ): { daysPresent: number; daysAbsent: number; attendancePercentage: number } {
    const attendance = this.db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END), 0) as days_present,
        COALESCE(SUM(CASE WHEN status = 'ABSENT' THEN 1 ELSE 0 END), 0) as days_absent,
        COUNT(*) as total_days
      FROM attendance
      WHERE student_id = ?
        AND academic_year_id = ?
        AND term_id = ?
    `).get(studentId, academicYearId, termId) as AttendanceResult | undefined

    const daysPresent = attendance?.days_present || 0
    const daysAbsent = attendance?.days_absent || 0
    const totalDays = attendance?.total_days || 0
    const attendancePercentage = totalDays > 0 ? (daysPresent / totalDays) * 100 : 0

    return { daysPresent, daysAbsent, attendancePercentage }
  }

  private getClassPosition(exam: ExamResult, streamId: number | undefined, studentId: number, examId: number): number {
    const studentAverage = this.db.prepare(`
      SELECT AVG(score) as avg_score
      FROM exam_result
      WHERE exam_id = ? AND student_id = ?
    `).get(examId, studentId) as { avg_score: number } | undefined

    if (!Number.isFinite(studentAverage?.avg_score)) {
      return 1
    }

    const classPosition = this.db.prepare(`
      SELECT COUNT(*) as position
      FROM (
        SELECT er.student_id, AVG(er.score) as avg_score
        FROM exam_result er
        JOIN enrollment e ON er.student_id = e.student_id
        WHERE er.exam_id = ?
          AND e.stream_id = ?
          AND e.academic_year_id = ?
          AND e.term_id = ?
          AND e.status = 'ACTIVE'
        GROUP BY er.student_id
      ) t
      WHERE t.avg_score > ?
    `).get(
      examId,
      streamId,
      exam.academic_year_id,
      exam.term_id,
      studentAverage!.avg_score
    ) as ClassPositionResult | undefined

    return (classPosition?.position ?? 0) + 1
  }

  private getFeesBalance(studentId: number): number {
    const outstandingBalanceSql = buildFeeInvoiceOutstandingBalanceSql(this.db, 'fi')
    const activeStatusPredicate = buildFeeInvoiceActiveStatusPredicate(this.db, 'fi')
    const feeBalance = this.db.prepare(`
      SELECT COALESCE(SUM(${outstandingBalanceSql}), 0) as balance
      FROM fee_invoice fi
      WHERE fi.student_id = ?
        AND ${activeStatusPredicate}
    `).get(studentId) as FeeBalanceResult | undefined

    return feeBalance?.balance || 0
  }

  private insertReportCardRecord(params: {
    examId: number
    studentId: number
    streamId: number | undefined
    generatedByUserId: number
    overallGrade: string
    totalMarks: number
    averageMarks: number
    classPosition: number
    daysPresent: number
    daysAbsent: number
    attendancePercentage: number
    qrCodeToken: string
    generatedAt: string
  }): number {
    const insertQuery = this.db.prepare(`
      INSERT OR REPLACE INTO report_card
      (exam_id, student_id, stream_id, generated_by_user_id, overall_grade, total_marks, average_marks,
       position_in_class, class_teacher_remarks, principal_remarks, attendance_days_present,
       attendance_days_absent, attendance_percentage, qr_code_token, generated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    return insertQuery.run(
      params.examId,
      params.studentId,
      params.streamId,
      params.generatedByUserId,
      params.overallGrade,
      params.totalMarks,
      params.averageMarks,
      params.classPosition,
      'Excellent performance this term. Keep up the good work!',
      'Well done on your academic progress.',
      params.daysPresent,
      params.daysAbsent,
      params.attendancePercentage,
      params.qrCodeToken,
      params.generatedAt
    ).lastInsertRowid as number
  }

  private insertReportCardSubjects(reportCardId: number, subjects: SubjectGradeResult[]): void {
    const subjectInsert = this.db.prepare(`
      INSERT OR REPLACE INTO report_card_subject
      (report_card_id, subject_id, marks, grade, percentage, teacher_comment, competency_level)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    for (const subject of subjects) {
      subjectInsert.run(
        reportCardId,
        subject.subject_id,
        subject.marks,
        subject.grade,
        subject.percentage,
        subject.teacher_comment,
        subject.competency_level
      )
    }
  }

  private mapReportCardSubjects(subjects: SubjectGradeResult[]): StudentReportCard['subjects'] {
    return subjects.map((subject) => ({
      subject_id: subject.subject_id,
      subject_name: subject.subject_name,
      marks: subject.marks,
      grade: subject.grade,
      points: this.getPoints(subject.grade),
      percentage: subject.percentage,
      teacher_comment: subject.teacher_comment,
      competency_level: subject.competency_level
    }))
  }

  private mapLearningAreas(learningAreas: LearningAreaResult[]): StudentReportCard['learning_areas'] {
    return learningAreas.map((learningArea) => ({
      area_name: learningArea.area_name,
      competency_level: learningArea.competency_level as 'meets_expectations',
      teacher_comment: learningArea.teacher_comment
    }))
  }

  /**
   * Generate report card for a single student
   */
  async generateReportCard(
    studentId: number,
    examId: number,
    generatedByUserId: number
  ): Promise<StudentReportCard> {
    try {
      const exam = this.getExamOrThrow(examId)
      const termId = exam.term_id
      const student = this.getEnrolledStudentOrThrow(studentId, exam)
      const studentName = `${student.first_name} ${student.last_name}`

      if (student.stream_id == null) {
        throw new Error('Student stream is missing')
      }
      const streamId = student.stream_id

      const stream = this.getRecordById<StreamResult>('stream', streamId)
      const streamName = stream?.stream_name || 'Unknown'
      const academicYear = this.getRecordById<AcademicYearResult>('academic_year', exam.academic_year_id)
      const term = this.getRecordById<TermResult>('term', termId)

      const subjects = this.getSubjectGradesOrThrow(examId, studentId)
      const { totalMarks, averageMarks, overallGrade, totalPoints, averagePoints } = this.calculatePerformance(subjects)
      const learningAreas = this.getLearningAreas()
      const { daysPresent, daysAbsent, attendancePercentage } = this.getAttendanceMetrics(studentId, exam.academic_year_id, exam.term_id)
      const classPosition = this.getClassPosition(exam, streamId, studentId, examId)
      const qrCodeToken = this.generateQRToken(studentId, examId)
      const now = new Date().toISOString()
      const reportCardId = this.insertReportCardRecord({
        examId,
        studentId,
        streamId,
        generatedByUserId,
        overallGrade,
        totalMarks,
        averageMarks,
        classPosition,
        daysPresent,
        daysAbsent,
        attendancePercentage,
        qrCodeToken,
        generatedAt: now
      })
      this.insertReportCardSubjects(reportCardId, subjects)
      const feesBalance = this.getFeesBalance(studentId)

      return {
        student_id: studentId,
        student_name: studentName,
        admission_number: student.admission_number,
        stream_name: streamName,
        academic_year: academicYear?.year_name || 'Unknown',
        term_name: term?.term_name || 'Unknown',
        subjects: this.mapReportCardSubjects(subjects),
        total_marks: totalMarks,
        average_marks: averageMarks,
        overall_grade: overallGrade,
        total_points: totalPoints,
        average_points: averagePoints,
        position_in_class: classPosition,
        position_in_stream: classPosition,
        learning_areas: this.mapLearningAreas(learningAreas),
        days_present: daysPresent,
        days_absent: daysAbsent,
        attendance_percentage: attendancePercentage,
        class_teacher_comment: 'Excellent performance this term. Keep up the good work!',
        principal_comment: 'Well done on your academic progress.',
        next_term_begin_date: this.getNextTermDate(exam.academic_year_id, termId),
        fees_balance: feesBalance,
        qr_code_token: qrCodeToken,
        generated_at: now
      }
    } catch (error) {
      throw new Error(
        `Failed to generate report card: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Batch generate report cards for entire class
   */
  async generateBatchReportCards(
    examId: number,
    streamId: number,
    generatedByUserId: number
  ): Promise<BatchGenerationResult> {
    try {
      const exam = this.db.prepare('SELECT * FROM exam WHERE id = ?').get(examId) as ExamResult | undefined
      if (!exam) { throw new Error('Exam not found') }

      const students = this.db.prepare(`
        SELECT s.id
        FROM student s
        JOIN enrollment e ON s.id = e.student_id
        WHERE e.stream_id = ?
          AND e.academic_year_id = ?
          AND e.term_id = ?
          AND e.status = 'ACTIVE'
          AND s.is_active = 1
        ORDER BY s.last_name, s.first_name
      `).all(streamId, exam.academic_year_id, exam.term_id) as { id: number }[]

      const reportCards: StudentReportCard[] = []
      const failures: Array<{ student_id: number; error: string }> = []

      for (const student of students) {
        try {
          const reportCard = await this.generateReportCard(
            student.id,
            examId,
            generatedByUserId
          )
          reportCards.push(reportCard)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          failures.push({ student_id: student.id, error: message })
          console.error(`Failed to generate report card for student ${student.id}:`, message)
        }
      }

      return {
        generated: reportCards,
        failed: failures.length,
        total: students.length,
        failures
      }
    } catch (error) {
      throw new Error(
        `Failed to batch generate report cards: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Get report card by exam and student
   */
  async getReportCard(
    examId: number,
    studentId: number
  ): Promise<StudentReportCard | null> {
    try {
      const rc = this.db.prepare(`
        SELECT * FROM report_card WHERE exam_id = ? AND student_id = ?
      `).get(examId, studentId) as ReportCardRecord | undefined

      if (!rc) { return null }

      // Reconstruct full report card
      return this.buildReportCardFromRecord(rc, examId, studentId)
    } catch (error) {
      throw new Error(`Failed to get report card: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Private helper methods — CBC/CBE grading scale
   */
  private getGrade(score: number): string {
    if (score >= 90) {return 'EE1'}
    if (score >= 75) {return 'EE2'}
    if (score >= 58) {return 'ME1'}
    if (score >= 41) {return 'ME2'}
    if (score >= 31) {return 'AE1'}
    if (score >= 21) {return 'AE2'}
    if (score >= 11) {return 'BE1'}
    return 'BE2'
  }

  private getPoints(grade: string): number {
    const pointsMap: Record<string, number> = {
      'EE1': 4.0, 'EE2': 3.5,
      'ME1': 3.0, 'ME2': 2.5,
      'AE1': 2.0, 'AE2': 1.5,
      'BE1': 1.0, 'BE2': 0.5,
    }
    return pointsMap[grade] ?? 0
  }

  private generateQRToken(studentId: number, examId: number): string {
    // Generate a token for QR code verification
    const timestamp = Date.now()
    return `RC-${studentId}-${examId}-${timestamp}`
  }

  private getNextTermDate(academicYearId: number, currentTermId: number): string {
    const currentTerm = this.db.prepare(`
      SELECT term_number
      FROM term
      WHERE id = ?
      LIMIT 1
    `).get(currentTermId) as { term_number: number } | undefined

    if (!currentTerm) {
      return ''
    }

    const nextInYear = this.db.prepare(`
      SELECT start_date
      FROM term
      WHERE academic_year_id = ?
        AND term_number > ?
      ORDER BY term_number ASC
      LIMIT 1
    `).get(academicYearId, currentTerm.term_number) as { start_date: string } | undefined

    if (nextInYear?.start_date) {
      return nextInYear.start_date
    }

    const nextAcademicYear = this.db.prepare(`
      SELECT id
      FROM academic_year
      WHERE id > ?
      ORDER BY id ASC
      LIMIT 1
    `).get(academicYearId) as { id: number } | undefined

    if (!nextAcademicYear?.id) {
      return ''
    }

    const firstTermNextYear = this.db.prepare(`
      SELECT start_date
      FROM term
      WHERE academic_year_id = ?
      ORDER BY term_number ASC
      LIMIT 1
    `).get(nextAcademicYear.id) as { start_date: string } | undefined

    return firstTermNextYear?.start_date || ''
  }

  private mapStoredReportCardSubjects(reportCardId: number): StudentReportCard['subjects'] {
    const fetchSubjects = (nameColumn: 'name' | 'subject_name'): ReportCardSubjectRecord[] => this.db.prepare(`
      SELECT rcs.*, s.${nameColumn} as subject_name
      FROM report_card_subject rcs
      LEFT JOIN subject s ON s.id = rcs.subject_id
      WHERE rcs.report_card_id = ?
      ORDER BY rcs.id ASC
    `).all(reportCardId) as ReportCardSubjectRecord[]

    const nameColumn = this.resolveSubjectNameColumn()

    let subjects: ReportCardSubjectRecord[]
    try {
      subjects = fetchSubjects(nameColumn)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('no such column')) {
        throw error
      }
      this.subjectNameColumnCache = null
      subjects = fetchSubjects(this.resolveSubjectNameColumn(true))
    }

    return subjects.map((subject) => ({
      subject_id: subject.subject_id,
      subject_name: subject.subject_name || 'Unknown',
      marks: subject.marks,
      grade: subject.grade,
      points: this.getPoints(subject.grade),
      percentage: subject.percentage,
      teacher_comment: subject.teacher_comment || '',
      competency_level: subject.competency_level || ''
    }))
  }

  private loadReportCardContext(rc: ReportCardRecord, examId: number, studentId: number): {
    student: StudentResult | undefined
    exam: ExamResult | undefined
    stream: StreamResult | undefined
    year: AcademicYearResult | undefined
    term: TermResult | undefined
  } {
    const student = this.db.prepare('SELECT * FROM student WHERE id = ?').get(studentId) as StudentResult | undefined
    const exam = this.db.prepare('SELECT * FROM exam WHERE id = ?').get(examId) as ExamResult | undefined
    const stream = this.db.prepare('SELECT * FROM stream WHERE id = ?').get(rc.stream_id) as StreamResult | undefined
    const year = this.db.prepare('SELECT * FROM academic_year WHERE id = ?').get(exam?.academic_year_id) as AcademicYearResult | undefined
    const term = this.db.prepare('SELECT * FROM term WHERE id = ?').get(exam?.term_id) as TermResult | undefined

    return { student, exam, stream, year, term }
  }

  private getStudentName(student: StudentResult | undefined): string {
    if (!student) {
      return 'Unknown'
    }
    return `${student.first_name} ${student.last_name}`
  }

  private async buildReportCardFromRecord(
    rc: ReportCardRecord,
    examId: number,
    studentId: number
  ): Promise<StudentReportCard> {
    const { student, stream, year, term } = this.loadReportCardContext(rc, examId, studentId)
    const subjects = this.mapStoredReportCardSubjects(rc.id)
    const feesBalance = this.getFeesBalance(studentId)

    return {
      student_id: studentId,
      student_name: this.getStudentName(student),
      admission_number: student?.admission_number || '',
      stream_name: stream?.stream_name || 'Unknown',
      academic_year: year?.year_name || 'Unknown',
      term_name: term?.term_name || 'Unknown',
      subjects,
      total_marks: rc.total_marks,
      average_marks: rc.average_marks,
      overall_grade: rc.overall_grade,
      total_points: subjects.reduce((sum, s) => sum + s.points, 0),
      average_points: subjects.length > 0 ? subjects.reduce((sum, s) => sum + s.points, 0) / subjects.length : 0,
      position_in_class: rc.position_in_class,
      position_in_stream: rc.position_in_stream,
      learning_areas: [],
      days_present: rc.attendance_days_present,
      days_absent: rc.attendance_days_absent,
      attendance_percentage: rc.attendance_percentage,
      class_teacher_comment: rc.class_teacher_remarks || '',
      principal_comment: rc.principal_remarks || '',
      next_term_begin_date: '',
      fees_balance: feesBalance,
      qr_code_token: rc.qr_code_token || '',
      generated_at: rc.generated_at,
      email_sent_at: rc.email_sent_at
    }
  }
}
