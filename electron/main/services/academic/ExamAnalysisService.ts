
import { getDatabase } from '../../database'

export interface SubjectAnalysis {
  subject_id: number
  subject_name: string
  mean_score: number
  median_score: number
  mode_score: number
  std_deviation: number
  min_score: number
  max_score: number
  pass_rate: number
  fail_rate: number
  difficulty_index: number
  discrimination_index: number
  student_count: number
}

interface SubjectStatisticsResult {
  subject_id: number
  subject_name: string
  student_count: number
  mean_score: number
  min_score: number
  max_score: number
}

interface ScoreResult {
  score: number
}

interface SubjectIdResult {
  subject_id: number
}

interface TeacherSubjectPerformanceResult {
  subject_id: number
  subject_name: string
  student_count: number
  avg_score: number
}

interface StudentResult {
  id: number
  admission_number: string
  name: string;
  stream_id: number;
}

interface StudentSubjectScoreResult {
  subject_id: number;
  subject_name: string;
  score: number;
}

interface PreviousExamScoreResult {
  avg_score: number;
}

interface StudentIdResult {
  student_id: number;
}

export interface TeacherPerformance {
  teacher_id: number
  teacher_name: string
  subject_id: number
  subject_name: string
  avg_class_score: number
  pass_rate: number
  improvement_from_last_term: number
  overall_rating: string
}

export interface StudentAnalysis {
  student_id: number
  admission_number: string
  student_name: string
  average_score: number
  best_subjects: string[]
  worst_subjects: string[]
  performance_trend: 'improving' | 'declining' | 'stable'
  predicted_kcpe_grade: string
}

export class ExamAnalysisService {
  private get db() {
    return getDatabase()
  }

  /**
   * Get comprehensive subject analysis
   */
  async getSubjectAnalysis(
    examId: number,
    subjectId: number,
    streamId?: number
  ): Promise<SubjectAnalysis> {
    try {
      let query = `
        SELECT 
          s.id as subject_id,
          s.name as subject_name,
          COUNT(er.id) as student_count,
          AVG(er.score) as mean_score,
          MIN(er.score) as min_score,
          MAX(er.score) as max_score
        FROM exam_result er
        JOIN subject s ON er.subject_id = s.id
        JOIN student st ON er.student_id = st.id
        WHERE er.exam_id = ? AND er.subject_id = ?
          AND er.score IS NOT NULL
      `

      const params = [examId, subjectId]

      if (streamId) {
        query += ` AND st.stream_id = ?`
        params.push(streamId)
      }

      query += ` GROUP BY s.id`

      const result = this.db.prepare(query).get(...params) as SubjectStatisticsResult | undefined

      if (!result) { throw new Error('No data found for this subject') }

      // Get all scores for calculations
      const scores = (this.db.prepare(`
        SELECT er.score FROM exam_result er
        JOIN student st ON er.student_id = st.id
        WHERE er.exam_id = ? AND er.subject_id = ? AND er.score IS NOT NULL
      `).all(examId, subjectId) as ScoreResult[]).map(r => r.score)

      if (streamId) {
        const filteredScores = (this.db.prepare(`
          SELECT er.score FROM exam_result er
          JOIN student st ON er.student_id = st.id
          WHERE er.exam_id = ? AND er.subject_id = ? AND st.stream_id = ? AND er.score IS NOT NULL
        `).all(examId, subjectId, streamId) as ScoreResult[]).map(r => r.score)

        return {
          subject_id: result.subject_id,
          subject_name: result.subject_name,
          mean_score: result.mean_score,
          median_score: this.calculateMedian(filteredScores),
          mode_score: this.calculateMode(filteredScores),
          std_deviation: this.calculateStdDeviation(filteredScores, result.mean_score),
          min_score: result.min_score,
          max_score: result.max_score,
          pass_rate: (filteredScores.filter(s => s >= 50).length / filteredScores.length) * 100,
          fail_rate: (filteredScores.filter(s => s < 50).length / filteredScores.length) * 100,
          difficulty_index: 100 - result.mean_score,
          discrimination_index: this.calculateDiscriminationIndex(filteredScores),
          student_count: filteredScores.length
        }
      }

      return {
        subject_id: result.subject_id,
        subject_name: result.subject_name,
        mean_score: result.mean_score,
        median_score: this.calculateMedian(scores),
        mode_score: this.calculateMode(scores),
        std_deviation: this.calculateStdDeviation(scores, result.mean_score),
        min_score: result.min_score,
        max_score: result.max_score,
        pass_rate: (scores.filter(s => s >= 50).length / scores.length) * 100,
        fail_rate: (scores.filter(s => s < 50).length / scores.length) * 100,
        difficulty_index: 100 - result.mean_score,
        discrimination_index: this.calculateDiscriminationIndex(scores),
        student_count: scores.length
      }
    } catch (error) {
      throw new Error(
        `Failed to analyze subject: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Analyze all subjects for an exam
   */
  async analyzeAllSubjects(examId: number, streamId?: number): Promise<SubjectAnalysis[]> {
    try {
      const subjects = (this.db.prepare(`
        SELECT DISTINCT er.subject_id FROM exam_result er
        JOIN student st ON er.student_id = st.id
        WHERE er.exam_id = ?
      `).all(examId) as SubjectIdResult[]).map(r => r.subject_id)

      const analyses: SubjectAnalysis[] = []

      for (const subjectId of subjects) {
        try {
          const analysis = await this.getSubjectAnalysis(examId, subjectId, streamId)
          analyses.push(analysis)
        } catch (error) {
          console.error(`Failed to analyze subject ${subjectId}:`, error)
        }
      }

      return analyses
    } catch (error) {
      throw new Error(
        `Failed to analyze all subjects: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Get teacher performance analysis
   */
  async getTeacherPerformance(
    teacherId: number,
    academicYearId: number,
    termId: number
  ): Promise<TeacherPerformance[]> {
    try {
      const subjects = this.db.prepare(`
        SELECT 
          sa.subject_id,
          s.name as subject_name,
          COUNT(er.id) as student_count,
          AVG(er.score) as avg_score
        FROM subject_allocation sa
        JOIN subject s ON sa.subject_id = s.id
        LEFT JOIN exam_result er ON s.id = er.subject_id
        LEFT JOIN exam e ON er.exam_id = e.id
        WHERE sa.teacher_id = ?
          AND sa.academic_year_id = ?
          AND sa.term_id = ?
          AND er.score IS NOT NULL
        GROUP BY sa.subject_id
      `).all(teacherId, academicYearId, termId) as TeacherSubjectPerformanceResult[]

      const gradingScale = this.getGradingScale()
      const performances = subjects.map(subject => {
        const avgScore = subject.avg_score || 0
        const gradeInfo = this.resolveGrade(avgScore, gradingScale)

        return {
          teacher_id: teacherId,
          teacher_name: '', // Would need to fetch
          subject_id: subject.subject_id,
          subject_name: subject.subject_name,
          avg_class_score: avgScore,
          pass_rate: subject.student_count > 0 ? ((subject.avg_score / 100) * 100) : 0,
          improvement_from_last_term: 0, // Would calculate from previous term
          overall_rating: gradeInfo.remarks
        }
      })

      return performances
    } catch (error) {
      throw new Error(
        `Failed to analyze teacher performance: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Get student performance analysis
   */
  async getStudentPerformance(studentId: number, examId: number): Promise<StudentAnalysis> {
    try {
      const student = this.db.prepare('SELECT * FROM student WHERE id = ?').get(studentId) as StudentResult | undefined

      if (!student) { throw new Error('Student not found') }

      // Get all subject scores
      const results = this.db.prepare(`
        SELECT 
          er.subject_id,
          s.name as subject_name,
          er.score
        FROM exam_result er
        JOIN subject s ON er.subject_id = s.id
        WHERE er.exam_id = ? AND er.student_id = ? AND er.score IS NOT NULL
        ORDER BY er.score DESC
      `).all(examId, studentId) as StudentSubjectScoreResult[]

      if (results.length === 0) { throw new Error('No exam results found') }

      const averageScore = results.reduce((sum, r) => sum + r.score, 0) / results.length
      const bestSubjects = results.slice(0, 3).map(r => r.subject_name)
      const worstSubjects = results.slice(-3).map(r => r.subject_name).reverse()

      // Determine trend
      const previousExam = this.db.prepare(`
        SELECT AVG(er.score) as avg_score
        FROM exam_result er
        JOIN exam e ON er.exam_id = e.id
        WHERE er.student_id = ? AND e.academic_year_id = (
          SELECT academic_year_id FROM exam WHERE id = ?
        ) AND e.term_id < (SELECT term_id FROM exam WHERE id = ?)
        LIMIT 1
      `).get(studentId, examId, examId) as PreviousExamScoreResult | undefined

      let trend: 'improving' | 'declining' | 'stable' = 'stable'
      if (previousExam?.avg_score) {
        if (averageScore > previousExam.avg_score + 5) { trend = 'improving' }
        else if (averageScore < previousExam.avg_score - 5) { trend = 'declining' }
      }

      const gradingScale = this.getGradingScale()
      const gradeInfo = this.resolveGrade(averageScore, gradingScale)
      const predictedGrade = `${gradeInfo.grade} (${gradeInfo.remarks})`

      return {
        student_id: studentId,
        admission_number: student.admission_number,
        student_name: student.name,
        average_score: averageScore,
        best_subjects: bestSubjects,
        worst_subjects: worstSubjects,
        performance_trend: trend,
        predicted_kcpe_grade: predictedGrade
      }
    } catch (error) {
      throw new Error(
        `Failed to analyze student performance: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Identify struggling students
   */
  async getStrugglingStudents(
    examId: number,
    failThreshold: number = 50
  ): Promise<StudentAnalysis[]> {
    try {
      const students = (this.db.prepare(`
        SELECT DISTINCT er.student_id FROM exam_result er
        WHERE er.exam_id = ?
      `).all(examId) as StudentIdResult[]).map(r => r.student_id)

      const struggling: StudentAnalysis[] = []

      for (const studentId of students) {
        try {
          const analysis = await this.getStudentPerformance(studentId, examId)
          if (analysis.average_score < failThreshold) {
            struggling.push(analysis)
          }
        } catch (error) {
          console.error(`Failed to analyze student ${studentId}:`, error)
        }
      }

      return struggling.sort((a, b) => a.average_score - b.average_score)
    } catch (error) {
      throw new Error(
        `Failed to get struggling students: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Private helper methods
   */
  private calculateMedian(scores: number[]): number {
    const sorted = [...scores].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  }

  private calculateMode(scores: number[]): number {
    const frequency: { [key: number]: number } = {}
    let maxFreq = 0
    let mode = scores[0]

    for (const score of scores) {
      frequency[score] = (frequency[score] || 0) + 1
      if (frequency[score] > maxFreq) {
        maxFreq = frequency[score]
        mode = score
      }
    }

    return mode
  }

  private calculateStdDeviation(scores: number[], mean: number): number {
    const squareDiffs = scores.map(score => Math.pow(score - mean, 2))
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / scores.length
    return Math.sqrt(avgSquareDiff)
  }

  private calculateDiscriminationIndex(scores: number[]): number {
    // Top 27% vs bottom 27%
    const sorted = [...scores].sort((a, b) => b - a)
    const cutoff = Math.ceil(sorted.length * 0.27)

    const top = sorted.slice(0, cutoff)
    const bottom = sorted.slice(-cutoff)

    const topMean = top.reduce((a, b) => a + b, 0) / top.length
    const bottomMean = bottom.reduce((a, b) => a + b, 0) / bottom.length

    return (topMean - bottomMean) / 100
  }

  private getGradingScale(): { grade: string; remarks: string; min_score: number; max_score: number }[] {
    try {
      return this.db.prepare('SELECT grade, remarks, min_score, max_score FROM grading_scale WHERE curriculum = ? ORDER BY min_score DESC').all('8-4-4') as any[]
    } catch {
      // Fallback if table doesn't exist yet
      return [
        { grade: 'A', remarks: 'Excellent', min_score: 80, max_score: 100 },
        { grade: 'B', remarks: 'Good', min_score: 60, max_score: 79 },
        { grade: 'C', remarks: 'Fair', min_score: 40, max_score: 59 },
        { grade: 'D', remarks: 'Poor', min_score: 0, max_score: 39 }
      ]
    }
  }

  private resolveGrade(score: number, scale: { grade: string; remarks: string; min_score: number; max_score: number }[]): { grade: string; remarks: string } {
    const found = scale.find(s => score >= s.min_score && score <= s.max_score)
    return found ? { grade: found.grade, remarks: found.remarks } : { grade: 'E', remarks: 'Fail' }
  }
}

