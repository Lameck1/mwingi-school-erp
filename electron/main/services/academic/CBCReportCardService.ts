
import { getDatabase } from '../../database'
import QRCode from 'qrcode'
import { PDFDocument } from 'pdf-lib'

export interface StudentReportCard {
  student_id: number
  student_name: string
  admission_number: string
  stream_name: string
  academic_year: string
  term_name: string
  
  // Academic Performance
  subjects: SubjectGrade[]
  total_marks: number
  average_marks: number
  overall_grade: string
  position_in_class: number
  position_in_stream: number
  
  // CBC Learning Areas
  learning_areas: LearningAreaCompetency[]
  
  // Attendance
  days_present: number
  days_absent: number
  attendance_percentage: number
  
  // Comments
  class_teacher_comment: string
  principal_comment: string
  
  // Additional Info
  next_term_begin_date: string
  fees_balance: number
  qr_code_token: string
  generated_at: string
  email_sent_at?: string
}

export interface SubjectGrade {
  subject_id: number
  subject_name: string
  marks: number
  grade: string
  percentage: number
  teacher_comment: string
  competency_level: string
}

export interface LearningAreaCompetency {
  area_name: string
  competency_level: 'exceeds_expectations' | 'meets_expectations' | 'approaching_expectations' | 'below_expectations'
  teacher_comment: string
}

export class CBCReportCardService {
  private get db() {
    return getDatabase()
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
      // Get student info
      const student = this.db.prepare('SELECT * FROM student WHERE id = ?').get(studentId) as unknown
      if (!student) throw new Error('Student not found')

      // Get exam details
      const exam = this.db.prepare('SELECT * FROM exam WHERE id = ?').get(examId) as unknown
      if (!exam) throw new Error('Exam not found')

      // Get stream info
      const stream = this.db.prepare('SELECT * FROM stream WHERE id = ?').get(student.stream_id) as unknown
      const streamName = stream?.stream_name || 'Unknown'

      // Get academic year and term
      const academicYear = this.db.prepare('SELECT * FROM academic_year WHERE id = ?').get(exam.academic_year_id) as unknown
      const term = this.db.prepare('SELECT * FROM term WHERE id = ?').get(exam.term_id) as unknown

      // Get subject grades
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
      `).all(examId, studentId) as unknown[]

      if (subjects.length === 0) {
        throw new Error('No exam results found for this student')
      }

      // Calculate overall performance
      const totalMarks = subjects.reduce((sum, s) => sum + s.marks, 0)
      const averageMarks = totalMarks / subjects.length
      const overallGrade = this.getGrade(averageMarks)

      // Get learning area competencies (CBC specific)
      const learningAreas = this.db.prepare(`
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
      `).all() as unknown[]

      // Get attendance
      const attendance = this.db.prepare(`
        SELECT 
          COUNT(*) as days_present,
          COALESCE((SELECT COUNT(*) FROM attendance WHERE student_id = ? AND is_present = 0), 0) as days_absent
        FROM attendance
        WHERE student_id = ? AND is_present = 1
      `).get(studentId, studentId) as unknown

      const totalAttendanceDays = (attendance.days_present || 0) + (attendance.days_absent || 0)
      const attendancePercentage = totalAttendanceDays > 0
        ? ((attendance.days_present || 0) / totalAttendanceDays) * 100
        : 0

      // Get position
      const classPosition = this.db.prepare(`
        SELECT COUNT(*) as position FROM exam_result er
        JOIN student s ON er.student_id = s.id
        WHERE er.exam_id = ? AND s.stream_id = ? AND er.exam_id IN (
          SELECT id FROM exam WHERE academic_year_id = ? AND term_id = ?
        ) AND (
          SELECT AVG(score) FROM exam_result WHERE student_id = s.id AND exam_id = ?
        ) > (
          SELECT AVG(score) FROM exam_result WHERE student_id = ? AND exam_id = ?
        )
      `).get(examId, student.stream_id, exam.academic_year_id, exam.term_id, examId, studentId, examId) as unknown

      // Generate QR code token
      const qrCodeToken = this.generateQRToken(studentId, examId)

      // Get fees balance
      const feeBalance = this.db.prepare(`
        SELECT COALESCE(balance, 0) as balance FROM student WHERE id = ?
      `).get(studentId) as unknown

      // Create report card record
      const insertQuery = this.db.prepare(`
        INSERT OR REPLACE INTO report_card 
        (exam_id, student_id, stream_id, generated_by_user_id, overall_grade, total_marks, average_marks, 
         position_in_class, class_teacher_remarks, principal_remarks, attendance_days_present, 
         attendance_days_absent, attendance_percentage, qr_code_token, generated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      const now = new Date().toISOString()
      const reportCardId = insertQuery.run(
        examId,
        studentId,
        student.stream_id,
        generatedByUserId,
        overallGrade,
        totalMarks,
        averageMarks,
        classPosition?.position || 1,
        'Excellent performance this term. Keep up the good work!',
        'Well done on your academic progress.',
        attendance.days_present || 0,
        attendance.days_absent || 0,
        attendancePercentage,
        qrCodeToken,
        now
      ).lastInsertRowid as number

      // Insert subject grades
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

      return {
        student_id: studentId,
        student_name: student.name,
        admission_number: student.admission_number,
        stream_name: streamName,
        academic_year: academicYear?.name || 'Unknown',
        term_name: term?.name || 'Unknown',
        subjects: subjects.map(s => ({
          subject_id: s.subject_id,
          subject_name: s.subject_name,
          marks: s.marks,
          grade: s.grade,
          percentage: s.percentage,
          teacher_comment: s.teacher_comment,
          competency_level: s.competency_level
        })),
        total_marks: totalMarks,
        average_marks: averageMarks,
        overall_grade: overallGrade,
        position_in_class: classPosition?.position || 1,
        position_in_stream: classPosition?.position || 1,
        learning_areas: learningAreas.map(la => ({
          area_name: la.area_name,
          competency_level: la.competency_level as unknown,
          teacher_comment: la.teacher_comment
        })),
        days_present: attendance.days_present || 0,
        days_absent: attendance.days_absent || 0,
        attendance_percentage: attendancePercentage,
        class_teacher_comment: 'Excellent performance this term. Keep up the good work!',
        principal_comment: 'Well done on your academic progress.',
        next_term_begin_date: this.getNextTermDate(exam.term_id),
        fees_balance: feeBalance?.balance || 0,
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
      // Get all students in stream
      const students = this.db.prepare(`
        SELECT id FROM student WHERE stream_id = ? AND is_active = 1 ORDER BY name
      `).all(streamId) as unknown[]

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
      `).get(examId, studentId) as unknown

      if (!rc) return null

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
    if (score >= 80) return 'A'
    if (score >= 75) return 'A-'
    if (score >= 70) return 'B+'
    if (score >= 65) return 'B'
    if (score >= 60) return 'B-'
    if (score >= 55) return 'C+'
    if (score >= 50) return 'C'
    if (score >= 45) return 'C-'
    return 'E'
  }

  private generateQRToken(studentId: number, examId: number): string {
    // Generate a token for QR code verification
    const timestamp = Date.now()
    return `RC-${studentId}-${examId}-${timestamp}`
  }

  private getNextTermDate(termId: number): string {
    // Calculate next term start date (typically 3 months after current term)
    const today = new Date()
    const nextTerm = new Date(today.getFullYear(), today.getMonth() + 3, 1)
    return nextTerm.toISOString().split('T')[0]
  }

  private async buildReportCardFromRecord(
    rc: unknown,
    examId: number,
    studentId: number
  ): Promise<StudentReportCard> {
    const student = this.db.prepare('SELECT * FROM student WHERE id = ?').get(studentId) as unknown
    const exam = this.db.prepare('SELECT * FROM exam WHERE id = ?').get(examId) as unknown
    const stream = this.db.prepare('SELECT * FROM stream WHERE id = ?').get(rc.stream_id) as unknown
    const year = this.db.prepare('SELECT * FROM academic_year WHERE id = ?').get(exam.academic_year_id) as unknown
    const term = this.db.prepare('SELECT * FROM term WHERE id = ?').get(exam.term_id) as unknown

    const subjects = this.db.prepare(`
      SELECT * FROM report_card_subject WHERE report_card_id = ?
    `).all(rc.id) as unknown[]

    return {
      student_id: studentId,
      student_name: student?.name || 'Unknown',
      admission_number: student?.admission_number || '',
      stream_name: stream?.stream_name || 'Unknown',
      academic_year: year?.name || 'Unknown',
      term_name: term?.name || 'Unknown',
      subjects: subjects.map(s => ({
        subject_id: s.subject_id,
        subject_name: '', // Would need to fetch
        marks: s.marks,
        grade: s.grade,
        percentage: s.percentage,
        teacher_comment: s.teacher_comment || '',
        competency_level: s.competency_level || ''
      })),
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


