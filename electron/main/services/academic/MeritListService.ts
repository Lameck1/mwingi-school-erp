import { getDatabase } from '../../database'

export interface StudentRanking {
  position: number
  student_id: number
  student_name: string
  admission_number: string
  total_marks: number
  average_marks: number
  grade: string
  percentage: number
  tied_with: number[]
  remarks?: string
}

export interface MeritListResult {
  id: number
  academic_year_id: number
  term_id: number
  stream_id: number
  exam_id: number
  list_type: 'overall' | 'subject'
  subject_id?: number
  total_students: number
  generated_by_user_id: number
  generated_date: string
  rankings: StudentRanking[]
}

export interface SubjectDifficulty {
  subject_id: number
  subject_name: string
  mean_score: number
  median_score: number
  pass_rate: number
  difficulty_index: number
  discrimination_index: number
}

export interface PerformanceImprovement {
  student_id: number
  student_name: string
  previous_average: number
  current_average: number
  improvement_percentage: number
  improvement_points: number
  grade_improvement: string
  subjects_improved: number
  subjects_declined: number
}

interface MeritListRow {
  position: number;
  student_id: number;
  admission_number: string;
  student_name: string;
  total_marks: number;
  average_marks: number;
  grade: string;
}

interface StudentResultRow {
  id: number;
  name: string;
  admission_number: string;
  subject_count: number;
  total_marks: number;
  average_marks: number;
}

interface GradingScaleRow {
  grade: string;
  min_score: number;
  max_score: number;
}

interface SubjectMeritListRow {
  student_id: number;
  student_name: string;
  admission_number: string;
  marks: number;
  percentage: number;
}

interface ImprovementRow {
  id: number;
  name: string;
  previous_average: number;
  current_average: number;
}

export class MeritListService {
  private get db() {
    return getDatabase()
  }

  async generateMeritList(options: {
    academicYearId: number
    termId: number
    streamId: number
  }) {
    const { academicYearId, termId, streamId } = options

    // Get latest exam for this term
    const exam = this.db.prepare(`
      SELECT id FROM exam 
      WHERE academic_year_id = ? AND term_id = ? 
      ORDER BY created_at DESC 
      LIMIT 1
    `).get(academicYearId, termId) as { id: number } | undefined

    if (!exam) {
      throw new Error('No exam found for the selected academic year and term.')
    }

    const meritList = this.db.prepare(`
      SELECT 
        rcs.class_position as position,
        s.id as student_id,
        s.admission_number,
        s.first_name || ' ' || s.last_name as student_name,
        rcs.total_marks,
        rcs.mean_score as average_marks,
        rcs.mean_grade as grade
      FROM report_card_summary rcs
      JOIN student s ON rcs.student_id = s.id
      WHERE rcs.exam_id = ? AND s.stream_id = ? AND s.is_active = 1
      ORDER BY rcs.class_position ASC
    `).all(exam.id, streamId) as MeritListRow[]

    // Format results
    return meritList.map((item, index) => ({
      position: index + 1,
      student_id: item.student_id,
      admission_number: item.admission_number,
      student_name: item.student_name,
      total_marks: item.total_marks,
      average_marks: item.average_marks,
      grade: item.grade,
      percentage: (item.average_marks / 100) * 100
    }))
  }

  /**
   * Generate class merit list with proper ranking
   */
  async generateClassMeritList(
    academicYearId: number,
    termId: number,
    streamId: number,
    examId: number,
    generatedByUserId: number
  ): Promise<MeritListResult> {
    try {
      // Get all student results for this exam and stream
      const studentResults = this.db.prepare(`
        SELECT 
          s.id,
          s.name,
          s.admission_number,
          COUNT(er.id) as subject_count,
          SUM(er.score) as total_marks,
          AVG(er.score) as average_marks
        FROM student s
        JOIN stream st ON s.stream_id = st.id
        JOIN exam_result er ON s.id = er.student_id
        WHERE er.exam_id = ? 
          AND st.id = ?
          AND s.is_active = 1
        GROUP BY s.id
        ORDER BY average_marks DESC, total_marks DESC
      `).all(examId, streamId) as StudentResultRow[]

      if (studentResults.length === 0) {
        throw new Error('No exam results found for this class/stream')
      }

      // Create merit list record
      const meritListInsert = this.db.prepare(`
        INSERT INTO merit_list 
        (academic_year_id, term_id, stream_id, exam_id, list_type, generated_by_user_id, generated_date, total_students)
        VALUES (?, ?, ?, ?, 'overall', ?, ?, ?)
      `)

      const now = new Date().toISOString()
      const meritListId = meritListInsert.run(
        academicYearId,
        termId,
        streamId,
        examId,
        generatedByUserId,
        now,
        studentResults.length
      ).lastInsertRowid as number

      // Calculate rankings
      const rankings = this.calculateRankings(studentResults)

      // Get grading scale
      const gradingScale = this.db.prepare(`
        SELECT * FROM grading_scale 
        WHERE curriculum = 'CBC'
        ORDER BY min_score DESC
      `).all() as GradingScaleRow[]

      // Insert merit list entries
      const entryInsert = this.db.prepare(`
        INSERT INTO merit_list_entry 
        (merit_list_id, student_id, position, total_marks, average_marks, grade, percentage, class_position, tied_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      const insertedRankings: StudentRanking[] = []

      for (const ranking of rankings) {
        const grade = this.getGrade(ranking.average_marks, gradingScale)
        const percentage = (ranking.average_marks / 100) * 100

        entryInsert.run(
          meritListId,
          ranking.student_id,
          ranking.position,
          ranking.total_marks,
          ranking.average_marks,
          grade,
          percentage,
          ranking.position,
          ranking.tied_with.length + 1
        )

        insertedRankings.push({
          ...ranking,
          grade,
          percentage
        })
      }

      return {
        id: meritListId,
        academic_year_id: academicYearId,
        term_id: termId,
        stream_id: streamId,
        exam_id: examId,
        list_type: 'overall',
        total_students: studentResults.length,
        generated_by_user_id: generatedByUserId,
        generated_date: now,
        rankings: insertedRankings
      }
    } catch (error) {
      throw new Error(
        `Failed to generate merit list: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Get subject merit list
   */
  async getSubjectMeritList(examId: number, subjectId: number, streamId: number): Promise<(SubjectMeritListRow & { position: number })[]> {
    const results = this.db.prepare(`
      SELECT 
        s.id as student_id,
        s.name as student_name,
        s.admission_number,
        er.score as marks,
        (er.score / 100) * 100 as percentage
      FROM student s
      JOIN exam_result er ON s.id = er.student_id
      WHERE er.exam_id = ? 
        AND er.subject_id = ?
        AND s.stream_id = ?
        AND er.score IS NOT NULL
      ORDER BY er.score DESC
    `).all(examId, subjectId, streamId) as SubjectMeritListRow[]

    return results.map((r, index) => ({
      ...r,
      position: index + 1
    }))
  }

  /**
   * Calculate performance improvements
   */
  async calculatePerformanceImprovements(
    academicYearId: number,
    currentTermId: number,
    previousTermId: number,
    streamId?: number
  ): Promise<PerformanceImprovement[]> {
    try {
      let query = `
        SELECT 
          s.id,
          s.name,
          COALESCE(prev.average_marks, 0) as previous_average,
          COALESCE(curr.average_marks, 0) as current_average
        FROM student s
        LEFT JOIN (
          SELECT student_id, AVG(mean_score) as average_marks
          FROM report_card_summary rcs
          JOIN exam e ON rcs.exam_id = e.id
          WHERE e.term_id = ? AND e.academic_year_id = ?
          GROUP BY student_id
        ) prev ON s.id = prev.student_id
        LEFT JOIN (
          SELECT student_id, AVG(mean_score) as average_marks
          FROM report_card_summary rcs
          JOIN exam e ON rcs.exam_id = e.id
          WHERE e.term_id = ? AND e.academic_year_id = ?
          GROUP BY student_id
        ) curr ON s.id = curr.student_id
        WHERE s.is_active = 1
      `

      const params = [previousTermId, academicYearId, currentTermId, academicYearId]

      if (streamId) {
        query += ` AND s.stream_id = ?`
        params.push(streamId)
      }

      query += ` ORDER BY ((curr.average_marks - prev.average_marks) / NULLIF(prev.average_marks, 0) * 100) DESC`

      const results = this.db.prepare(query).all(...params) as ImprovementRow[]

      return results.map(result => {
        const improvement = result.current_average - result.previous_average
        const improvementPercentage = result.previous_average > 0
          ? (improvement / result.previous_average) * 100
          : 0
        const gradeImprovement = this.getGradeChange(result.previous_average, result.current_average)

        return {
          student_id: result.id,
          student_name: result.name,
          previous_average: result.previous_average,
          current_average: result.current_average,
          improvement_percentage: improvementPercentage,
          improvement_points: improvement,
          grade_improvement: gradeImprovement,
          subjects_improved: 0,
          subjects_declined: 0
        }
      })
    } catch (error) {
      throw new Error(
        `Failed to calculate improvements: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Private helper methods
   */
  private calculateRankings(students: StudentResultRow[]): StudentRanking[] {
    const rankings: StudentRanking[] = []
    let position = 1

    for (let i = 0; i < students.length; i++) {
      const student = students[i]

      // Check if tied with previous student
      if (i > 0 && students[i].average_marks === students[i - 1].average_marks) {
        const lastRanking = rankings[rankings.length - 1]
        lastRanking.tied_with.push(student.id)

        rankings.push({
          position: lastRanking.position,
          student_id: student.id,
          student_name: student.name,
          admission_number: student.admission_number,
          total_marks: student.total_marks,
          average_marks: student.average_marks,
          grade: '',
          percentage: 0,
          tied_with: [lastRanking.student_id]
        })
      } else {
        position = i + 1
        rankings.push({
          position,
          student_id: student.id,
          student_name: student.name,
          admission_number: student.admission_number,
          total_marks: student.total_marks,
          average_marks: student.average_marks,
          grade: '',
          percentage: 0,
          tied_with: []
        })
      }
    }

    return rankings
  }

  private getGrade(score: number, gradingScale: GradingScaleRow[]): string {
    for (const grade of gradingScale) {
      if (score >= grade.min_score && score <= grade.max_score) {
        return grade.grade
      }
    }
    return 'E'
  }

  private getGradeChange(previousScore: number, currentScore: number): string {
    const previousGrade = this.scoreToGrade(previousScore)
    const currentGrade = this.scoreToGrade(currentScore)
    return `${previousGrade} → ${currentGrade}`
  }

  private scoreToGrade(score: number): string {
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
}

