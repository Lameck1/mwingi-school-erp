
import { getDatabase } from '../../database'

export interface PerformanceImprovement {
  student_id: number
  admission_number: string
  student_name: string
  previous_term_average: number
  current_term_average: number
  improvement_percentage: number
  improvement_points: number
  grade_improvement: string
  subjects_improved: number
  subjects_declined: number
  previous_rank?: number
  current_rank?: number
  rank_improvement?: number
}

export interface SubjectPerformance {
  subject_id: number
  subject_name: string
  current_score: number
  previous_score: number
  improvement: number
  improvement_percentage: number
  current_grade: string
  previous_grade: string
}

export interface StudentPerformanceSnapshot {
  student_id: number
  admission_number: string
  student_name: string
  total_improvement: number
  improvement_percentage: number
  improvement_level: 'excellent' | 'good' | 'moderate' | 'slight' | 'declined'
  subjects: SubjectPerformance[]
}

export interface PerformanceTrend {
  term_id: number
  term_name: string
  term_number: number
  average_score: number
  subject_count: number
  lowest_score: number
  highest_score: number
}

export interface StrugglingStudent {
  student_id: number
  admission_number: string
  student_name: string
  total_subjects: number
  failing_subjects: number
  average_score: number
  lowest_score: number
}

export class PerformanceAnalysisService {
  private get db() {
    return getDatabase()
  }

  /**
   * Get most improved students between two terms
   */
  async getMostImprovedStudents(options: {
    academicYearId: number
    currentTermId: number
    comparisonTermId: number
    streamId?: number
    minimumImprovement?: number
  }): Promise<PerformanceImprovement[]> {
    const { academicYearId, currentTermId, comparisonTermId, streamId, minimumImprovement = 5 } = options

    try {
      let query = `
        SELECT 
          s.id as student_id,
          s.admission_number,
          s.name as student_name,
          COALESCE(prev.average_marks, 0) as previous_term_average,
          COALESCE(curr.average_marks, 0) as current_term_average,
          COALESCE(curr.average_marks - prev.average_marks, 0) as improvement_points
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
          AND COALESCE(prev.average_marks, 0) > 0
      `

      const params = [comparisonTermId, academicYearId, currentTermId, academicYearId]

      if (streamId) {
        query += ` AND s.stream_id = ?`
        params.push(streamId)
      }

      query += ` ORDER BY (curr.average_marks - prev.average_marks) DESC`

      interface MostImprovedStudentRaw {
        student_id: number
        admission_number: string
        student_name: string
        previous_term_average: number // SQLite returns numbers for calculated columns usually, but check parsing
        current_term_average: number
        improvement_points: number
      }

      const results = this.db.prepare(query).all(...params) as MostImprovedStudentRaw[]

      return results
        .filter(r => r.improvement_points >= minimumImprovement)
        .map((result) => ({
          student_id: result.student_id,
          admission_number: result.admission_number,
          student_name: result.student_name,
          previous_term_average: Number(result.previous_term_average),
          current_term_average: Number(result.current_term_average),
          improvement_percentage: Number(result.previous_term_average) > 0
            ? ((Number(result.improvement_points) / Number(result.previous_term_average)) * 100)
            : 0,
          improvement_points: Number(result.improvement_points),
          grade_improvement: this.getGradeImprovement(
            Number(result.previous_term_average),
            Number(result.current_term_average)
          ),
          subjects_improved: 0, // Will be calculated separately if needed
          subjects_declined: 0  // Will be calculated separately if needed
        }))
    } catch (error) {
      throw new Error(
        `Failed to get most improved students: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Get student performance comparison
   */
  async getStudentPerformanceComparison(
    studentId: number,
    academicYearId: number,
    currentTermId: number,
    comparisonTermId: number
  ): Promise<StudentPerformanceSnapshot | null> {
    try {
      interface StudentRaw {
        id: number
        admission_number: string
        name: string
      }
      const student = this.db.prepare('SELECT * FROM student WHERE id = ?').get(studentId) as StudentRaw | undefined

      if (!student) return null

      interface CurrentPerformanceRaw {
        subject_id: number
        subject_name: string
        current_score: number
      }

      // Get current term performance
      const currentPerformance = this.db.prepare(`
        SELECT 
          er.subject_id,
          s.name as subject_name,
          er.score as current_score
        FROM exam_result er
        JOIN subject s ON er.subject_id = s.id
        JOIN exam e ON er.exam_id = e.id
        WHERE er.student_id = ?
          AND e.term_id = ?
          AND e.academic_year_id = ?
      `).all(studentId, currentTermId, academicYearId) as CurrentPerformanceRaw[]

      interface ComparisonPerformanceRaw {
        subject_id: number
        previous_score: number
      }

      // Get comparison term performance
      const comparisonPerformance = this.db.prepare(`
        SELECT 
          er.subject_id,
          er.score as previous_score
        FROM exam_result er
        JOIN exam e ON er.exam_id = e.id
        WHERE er.student_id = ?
          AND e.term_id = ?
          AND e.academic_year_id = ?
      `).all(studentId, comparisonTermId, academicYearId) as ComparisonPerformanceRaw[]

      // Map scores
      const scoreMap = new Map(comparisonPerformance.map(p => [p.subject_id, p.previous_score]))

      // Calculate subject performance
      const subjects: SubjectPerformance[] = currentPerformance.map(curr => {
        const previous_score = scoreMap.get(curr.subject_id) || 0
        const improvement = curr.current_score - previous_score

        return {
          subject_id: curr.subject_id,
          subject_name: curr.subject_name,
          current_score: curr.current_score,
          previous_score,
          improvement,
          improvement_percentage: previous_score > 0 ? ((improvement / previous_score) * 100) : 0,
          current_grade: this.scoreToGrade(curr.current_score),
          previous_grade: this.scoreToGrade(previous_score)
        }
      })

      // Calculate overall improvement
      const totalImprovement = subjects.reduce((sum, s) => sum + s.improvement, 0)
      const avgImprovement = totalImprovement / subjects.length
      const improvementPercentage = subjects.length > 0
        ? subjects.reduce((sum, s) => sum + s.improvement_percentage, 0) / subjects.length
        : 0

      let improvementLevel: 'excellent' | 'good' | 'moderate' | 'slight' | 'declined'
      if (improvementPercentage >= 20) improvementLevel = 'excellent'
      else if (improvementPercentage >= 10) improvementLevel = 'good'
      else if (improvementPercentage >= 5) improvementLevel = 'moderate'
      else if (improvementPercentage > 0) improvementLevel = 'slight'
      else improvementLevel = 'declined'

      return {
        student_id: student.id,
        admission_number: student.admission_number,
        student_name: student.name,
        total_improvement: totalImprovement,
        improvement_percentage: improvementPercentage,
        improvement_level: improvementLevel,
        subjects
      }
    } catch (error) {
      throw new Error(
        `Failed to get performance comparison: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Identify struggling students
   */
  async getStrugglingStudents(
    academicYearId: number,
    termId: number,
    passThreshold: number = 50,
    streamId?: number
  ): Promise<StrugglingStudent[]> {
    try {
      let query = `
        SELECT 
          s.id as student_id,
          s.admission_number,
          s.name as student_name,
          COUNT(er.id) as total_subjects,
          SUM(CASE WHEN er.score < ? THEN 1 ELSE 0 END) as failing_subjects,
          AVG(er.score) as average_score,
          MIN(er.score) as lowest_score
        FROM student s
        JOIN exam_result er ON s.id = er.student_id
        JOIN exam e ON er.exam_id = e.id
        WHERE e.term_id = ?
          AND e.academic_year_id = ?
          AND s.is_active = 1
          AND er.score IS NOT NULL
        GROUP BY s.id
        HAVING failing_subjects > 0
      `

      const params = [passThreshold, termId, academicYearId]

      if (streamId) {
        query += ` AND s.stream_id = ?`
        params.push(streamId)
      }

      query += ` ORDER BY failing_subjects DESC, average_score ASC`

      return this.db.prepare(query).all(...params) as StrugglingStudent[]
    } catch (error) {
      throw new Error(
        `Failed to get struggling students: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Get performance trends over multiple terms
   */
  async getPerformanceTrends(
    studentId: number,
    academicYearId: number,
    numberOfTerms: number = 3
  ): Promise<PerformanceTrend[]> {
    try {
      const trends = this.db.prepare(`
        SELECT 
          t.id as term_id,
          t.name as term_name,
          t.term_number,
          ROUND(AVG(er.score), 2) as average_score,
          COUNT(er.id) as subject_count,
          MIN(er.score) as lowest_score,
          MAX(er.score) as highest_score
        FROM term t
        JOIN exam e ON t.id = e.term_id
        JOIN exam_result er ON e.id = er.exam_id
        WHERE e.academic_year_id = ?
          AND er.student_id = ?
          AND er.score IS NOT NULL
        GROUP BY t.id
        ORDER BY t.term_number DESC
        LIMIT ?
      `).all(academicYearId, studentId, numberOfTerms) as PerformanceTrend[]

      return trends
    } catch (error) {
      throw new Error(
        `Failed to get performance trends: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Private helper methods
   */
  private getGradeImprovement(previousScore: number, currentScore: number): string {
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


