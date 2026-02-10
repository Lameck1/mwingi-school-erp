import { getDatabase } from '../../database'

import type {
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
      WHERE s.id = ? AND e.academic_year_id = ? AND e.term_id = ?
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
          WHEN er.score >= 80 THEN 'A'
          WHEN er.score >= 75 THEN 'A-'
          WHEN er.score >= 70 THEN 'B+'
          WHEN er.score >= 65 THEN 'B'
          WHEN er.score >= 60 THEN 'B-'
          WHEN er.score >= 55 THEN 'C+'
          WHEN er.score >= 50 THEN 'C'
          WHEN er.score >= 45 THEN 'C-'
          ELSE 'E'
        END as grade,
        ROUND((er.score / 100) * 100, 1) as percentage,
        COALESCE(er.teacher_remarks, '') as teacher_comment,
        'Meets Expectations' as competency_level
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

  private calculatePerformance(subjects: SubjectGradeResult[]): { totalMarks: number; averageMarks: number; overallGrade: string } {
    const totalMarks = subjects.reduce((sum, subject) => sum + subject.marks, 0)
    const averageMarks = totalMarks / subjects.length
    return {
      totalMarks,
      averageMarks,
      overallGrade: this.getGrade(averageMarks)
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

  private getAttendanceMetrics(studentId: number): { daysPresent: number; daysAbsent: number; attendancePercentage: number } {
    const attendance = this.db.prepare(`
      SELECT
        COUNT(*) as days_present,
        COALESCE((SELECT COUNT(*) FROM attendance WHERE student_id = ? AND is_present = 0), 0) as days_absent
      FROM attendance
      WHERE student_id = ? AND is_present = 1
    `).get(studentId, studentId) as AttendanceResult | undefined

    const daysPresent = attendance?.days_present || 0
    const daysAbsent = attendance?.days_absent || 0
    const totalDays = daysPresent + daysAbsent
    const attendancePercentage = totalDays > 0 ? (daysPresent / totalDays) * 100 : 0

    return { daysPresent, daysAbsent, attendancePercentage }
  }

  private getClassPosition(exam: ExamResult, streamId: number | undefined, studentId: number, examId: number): number {
    const studentAverage = this.db.prepare(`
      SELECT AVG(score) as avg_score
      FROM exam_result
      WHERE exam_id = ? AND student_id = ?
    `).get(examId, studentId) as { avg_score: number } | undefined

    const classPosition = this.db.prepare(`
      SELECT COUNT(*) as position
      FROM (
        SELECT er.student_id, AVG(er.score) as avg_score
        FROM exam_result er
        JOIN enrollment e ON er.student_id = e.student_id
        WHERE er.exam_id = ? AND e.stream_id = ? AND e.academic_year_id = ? AND e.term_id = ?
        GROUP BY er.student_id
      ) t
      WHERE t.avg_score > ?
    `).get(
      examId,
      streamId,
      exam.academic_year_id,
      exam.term_id,
      studentAverage?.avg_score || 0
    ) as ClassPositionResult | undefined

    return classPosition?.position || 1
  }

  private getFeesBalance(studentId: number): number {
    const feeBalance = this.db.prepare(`
      SELECT COALESCE(SUM(total_amount - amount_paid), 0) as balance
      FROM fee_invoice
      WHERE student_id = ?
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
      const student = this.getEnrolledStudentOrThrow(studentId, exam)
      const studentName = `${student.first_name} ${student.last_name}`

      const stream = this.getRecordById<StreamResult>('stream', student.stream_id)
      const streamName = stream?.stream_name || 'Unknown'
      const academicYear = this.getRecordById<AcademicYearResult>('academic_year', exam.academic_year_id)
      const term = this.getRecordById<TermResult>('term', exam.term_id)

      const subjects = this.getSubjectGradesOrThrow(examId, studentId)
      const { totalMarks, averageMarks, overallGrade } = this.calculatePerformance(subjects)
      const learningAreas = this.getLearningAreas()
      const { daysPresent, daysAbsent, attendancePercentage } = this.getAttendanceMetrics(studentId)
      const classPosition = this.getClassPosition(exam, student.stream_id, studentId, examId)
      const qrCodeToken = this.generateQRToken(studentId, examId)
      const now = new Date().toISOString()
      const reportCardId = this.insertReportCardRecord({
        examId,
        studentId,
        streamId: student.stream_id,
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
        position_in_class: classPosition,
        position_in_stream: classPosition,
        learning_areas: this.mapLearningAreas(learningAreas),
        days_present: daysPresent,
        days_absent: daysAbsent,
        attendance_percentage: attendancePercentage,
        class_teacher_comment: 'Excellent performance this term. Keep up the good work!',
        principal_comment: 'Well done on your academic progress.',
        next_term_begin_date: this.getNextTermDate(exam.term_id),
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
  ): Promise<StudentReportCard[]> {
    try {
      const exam = this.db.prepare('SELECT * FROM exam WHERE id = ?').get(examId) as ExamResult | undefined
      if (!exam) {throw new Error('Exam not found')}

      const students = this.db.prepare(`
        SELECT s.id
        FROM student s
        JOIN enrollment e ON s.id = e.student_id
        WHERE e.stream_id = ? AND e.academic_year_id = ? AND e.term_id = ? AND s.is_active = 1
        ORDER BY s.last_name, s.first_name
      `).all(streamId, exam.academic_year_id, exam.term_id) as { id: number }[]

      const reportCards: StudentReportCard[] = []

      for (const student of students) {
        try {
          const reportCard = await this.generateReportCard(
            student.id,
            examId,
            generatedByUserId
          )
          reportCards.push(reportCard)
        } catch (error) {
          console.error(`Failed to generate report card for student ${student.id}:`, error)
          // Continue with next student
        }
      }

      return reportCards
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

      if (!rc) {return null}

      // Reconstruct full report card
      return this.buildReportCardFromRecord(rc, examId, studentId)
    } catch (error) {
      throw new Error(`Failed to get report card: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Private helper methods
   */
  private getGrade(score: number): string {
    if (score >= 80) {return 'A'}
    if (score >= 75) {return 'A-'}
    if (score >= 70) {return 'B+'}
    if (score >= 65) {return 'B'}
    if (score >= 60) {return 'B-'}
    if (score >= 55) {return 'C+'}
    if (score >= 50) {return 'C'}
    if (score >= 45) {return 'C-'}
    return 'E'
  }

  private generateQRToken(studentId: number, examId: number): string {
    // Generate a token for QR code verification
    const timestamp = Date.now()
    return `RC-${studentId}-${examId}-${timestamp}`
  }

  private getNextTermDate(_termId: number): string {
    // Calculate next term start date (typically 3 months after current term)
    const today = new Date()
    const nextTerm = new Date(today.getFullYear(), today.getMonth() + 3, 1)
    return nextTerm.toISOString().split('T')[0]
  }

  private mapStoredReportCardSubjects(reportCardId: number): StudentReportCard['subjects'] {
    const subjects = this.db.prepare(`
      SELECT * FROM report_card_subject WHERE report_card_id = ?
    `).all(reportCardId) as ReportCardSubjectRecord[]

    return subjects.map((subject) => ({
      subject_id: subject.subject_id,
      subject_name: '',
      marks: subject.marks,
      grade: subject.grade,
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
      position_in_class: rc.position_in_class,
      position_in_stream: rc.position_in_stream,
      learning_areas: [],
      days_present: rc.attendance_days_present,
      days_absent: rc.attendance_days_absent,
      attendance_percentage: rc.attendance_percentage,
      class_teacher_comment: rc.class_teacher_remarks || '',
      principal_comment: rc.principal_remarks || '',
      next_term_begin_date: '',
      fees_balance: 0,
      qr_code_token: rc.qr_code_token || '',
      generated_at: rc.generated_at,
      email_sent_at: rc.email_sent_at
    }
  }
}
