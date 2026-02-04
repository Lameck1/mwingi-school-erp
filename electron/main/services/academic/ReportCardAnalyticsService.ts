import { getDatabase } from '../../database'

interface PerformanceSummary {
  mean_score: number
  median_score: number
  mode_score: number
  top_performer: string
  top_performer_score: number
  total_students: number
  pass_count: number
  pass_rate: number
  fail_count: number
  fail_rate: number
}

interface GradeDistribution {
  grade: string
  count: number
  percentage: number
}

interface SubjectPerformance {
  subject_name: string
  mean_score: number
  pass_rate: number
  difficulty_index: number
  discrimination_index: number
}

interface StrugglingStu {
  student_id: number
  student_name: string
  admission_number: string
  average_score: number
  needs_intervention: boolean
  recommended_action: string
}

interface TermComparison {
  term_name: string
  mean_score: number
  pass_rate: number
  improvement: number
}

class ReportCardAnalyticsService {
  /**
   * Get performance summary for a class
   */
  async getPerformanceSummary(examId: number, streamId: number): Promise<PerformanceSummary> {
    try {
      const db = getDatabase()

      // Get all students in stream and their average scores
      const studentScores = db
        .prepare(`
          SELECT 
            s.id,
            s.first_name || ' ' || s.last_name as student_name,
            COALESCE(AVG(rcs.marks), 0) as average_score
          FROM students s
          LEFT JOIN enrollments e ON s.id = e.student_id AND e.stream_id = ?
          LEFT JOIN report_card_subject rcs ON s.id = rcs.student_id 
            AND rcs.exam_id = ?
          WHERE s.deleted_at IS NULL 
            AND e.stream_id = ?
          GROUP BY s.id, s.first_name, s.last_name
          ORDER BY average_score DESC
        `)
        .all(streamId, examId, streamId) as Array<{
          id: number
          student_name: string
          average_score: number
        }>

      const totalStudents = studentScores.length
      const scores = studentScores.map((s) => s.average_score)

      // Calculate statistics
      const mean = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
      const sortedScores = [...scores].sort((a, b) => a - b)
      const median =
        sortedScores.length > 0
          ? sortedScores.length % 2 === 0
            ? (sortedScores[sortedScores.length / 2 - 1] + sortedScores[sortedScores.length / 2]) / 2
            : sortedScores[Math.floor(sortedScores.length / 2)]
          : 0

      // Calculate mode
      const frequencyMap = new Map<number, number>()
      scores.forEach((score) => frequencyMap.set(score, (frequencyMap.get(score) || 0) + 1))
      let mode = 0
      let maxFreq = 0
      frequencyMap.forEach((freq, score) => {
        if (freq > maxFreq) {
          maxFreq = freq
          mode = score
        }
      })

      // Pass rate (assuming 40% is pass)
      const passThreshold = 40
      const passCount = scores.filter((s) => s >= passThreshold).length
      const failCount = totalStudents - passCount

      // Top performer
      const topStudent = studentScores[0]

      return {
        mean_score: mean,
        median_score: median,
        mode_score: mode,
        top_performer: topStudent?.student_name || 'N/A',
        top_performer_score: topStudent?.average_score || 0,
        total_students: totalStudents,
        pass_count: passCount,
        pass_rate: totalStudents > 0 ? (passCount / totalStudents) * 100 : 0,
        fail_count: failCount,
        fail_rate: totalStudents > 0 ? (failCount / totalStudents) * 100 : 0
      }
    } catch (error) {
      console.error('Error getting performance summary:', error)
      throw new Error(`Failed to get performance summary: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get grade distribution for a class
   */
  async getGradeDistribution(examId: number, streamId: number): Promise<GradeDistribution[]> {
    try {
      const db = getDatabase()

      const distribution = db
        .prepare(`
          SELECT 
            rcs.grade,
            COUNT(*) as count
          FROM report_card_subject rcs
          JOIN report_card rc ON rcs.report_card_id = rc.id
          WHERE rc.exam_id = ? 
            AND rc.stream_id = ?
            AND rcs.grade IS NOT NULL
          GROUP BY rcs.grade
          ORDER BY 
            CASE 
              WHEN rcs.grade = 'A' THEN 1
              WHEN rcs.grade = 'B' THEN 2
              WHEN rcs.grade = 'C' THEN 3
              WHEN rcs.grade = 'D' THEN 4
              WHEN rcs.grade = 'E' THEN 5
              ELSE 6
            END
        `)
        .all(examId, streamId) as Array<{ grade: string; count: number }>

      // Calculate total
      const total = distribution.reduce((sum, d) => sum + d.count, 0)

      return distribution.map((d) => ({
        grade: d.grade,
        count: d.count,
        percentage: total > 0 ? (d.count / total) * 100 : 0
      }))
    } catch (error) {
      console.error('Error getting grade distribution:', error)
      throw new Error(`Failed to get grade distribution: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get subject performance analysis
   */
  async getSubjectPerformance(examId: number, streamId: number): Promise<SubjectPerformance[]> {
    try {
      const db = getDatabase()

      const subjects = db
        .prepare(`
          SELECT DISTINCT sub.id, sub.name
          FROM subjects sub
          WHERE sub.deleted_at IS NULL
          ORDER BY sub.name
        `)
        .all() as Array<{ id: number; name: string }>

      const analysis: SubjectPerformance[] = []

      for (const subject of subjects) {
        const scores = db
          .prepare(`
            SELECT rcs.marks
            FROM report_card_subject rcs
            JOIN report_card rc ON rcs.report_card_id = rc.id
            WHERE rc.exam_id = ? 
              AND rc.stream_id = ?
              AND rcs.subject_id = ?
              AND rcs.marks IS NOT NULL
          `)
          .all(examId, streamId, subject.id) as Array<{ marks: number }>

        if (scores.length > 0) {
          const marks = scores.map((s) => s.marks)
          const mean = marks.reduce((a, b) => a + b, 0) / marks.length
          const passCount = marks.filter((m) => m >= 40).length
          const passRate = (passCount / marks.length) * 100
          const difficultyIndex = 100 - mean

          // Discrimination index (top 27% - bottom 27%)
          const sorted = [...marks].sort((a, b) => b - a)
          const topCount = Math.ceil(marks.length * 0.27)
          const topScores = sorted.slice(0, topCount)
          const bottomScores = sorted.slice(-topCount)
          const topMean = topScores.reduce((a, b) => a + b, 0) / topCount
          const bottomMean = bottomScores.reduce((a, b) => a + b, 0) / topCount
          const discriminationIndex = topMean - bottomMean

          analysis.push({
            subject_name: subject.name,
            mean_score: mean,
            pass_rate: passRate,
            difficulty_index: difficultyIndex,
            discrimination_index: discriminationIndex
          })
        }
      }

      return analysis.sort((a, b) => b.mean_score - a.mean_score)
    } catch (error) {
      console.error('Error getting subject performance:', error)
      throw new Error(`Failed to get subject performance: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get struggling students needing intervention
   */
  async getStrugglingStu(
    examId: number,
    streamId: number,
    threshold: number = 50
  ): Promise<StrugglingStu[]> {
    try {
      const db = getDatabase()

      const struggling = db
        .prepare(`
          SELECT 
            s.id as student_id,
            s.first_name || ' ' || s.last_name as student_name,
            s.admission_number,
            COALESCE(AVG(rcs.marks), 0) as average_score
          FROM students s
          LEFT JOIN enrollments e ON s.id = e.student_id AND e.stream_id = ?
          LEFT JOIN report_card_subject rcs ON s.id = rcs.student_id 
            AND rcs.exam_id = ?
          WHERE s.deleted_at IS NULL 
            AND e.stream_id = ?
          GROUP BY s.id
          HAVING COALESCE(AVG(rcs.marks), 0) < ?
          ORDER BY average_score ASC
        `)
        .all(streamId, examId, streamId, threshold) as Array<{
          student_id: number
          student_name: string
          admission_number: string
          average_score: number
        }>

      return struggling.map((s) => {
        let action = ''
        if (s.average_score < 20) {
          action = 'Intensive intervention required'
        } else if (s.average_score < 35) {
          action = 'Structured remedial classes'
        } else if (s.average_score < 50) {
          action = 'Regular extra coaching'
        }

        return {
          student_id: s.student_id,
          student_name: s.student_name,
          admission_number: s.admission_number,
          average_score: s.average_score,
          needs_intervention: true,
          recommended_action: action
        }
      })
    } catch (error) {
      console.error('Error getting struggling students:', error)
      throw new Error(`Failed to get struggling students: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get term-to-term comparison for improvement tracking
   */
  async getTermComparison(examId: number, streamId: number): Promise<TermComparison[]> {
    try {
      const db = getDatabase()

      // Get current exam details
      const currentExam = db
        .prepare('SELECT academic_year_id, term_id FROM exams WHERE id = ?')
        .get(examId) as { academic_year_id: number; term_id: number }

      if (!currentExam) {
        return []
      }

      // Get previous exams in same academic year and earlier
      const previousExams = db
        .prepare(`
          SELECT id, name, term_id, academic_year_id
          FROM exams
          WHERE (academic_year_id < ? OR 
                 (academic_year_id = ? AND term_id < ?))
          ORDER BY academic_year_id DESC, term_id DESC
          LIMIT 2
        `)
        .all(currentExam.academic_year_id, currentExam.academic_year_id, currentExam.term_id) as Array<{
        id: number
        name: string
        term_id: number
        academic_year_id: number
      }>

      const comparison: TermComparison[] = []

      // Add current exam
      const currentSummary = await this.getPerformanceSummary(examId, streamId)
      comparison.push({
        term_name: `Current (Exam ${examId})`,
        mean_score: currentSummary.mean_score,
        pass_rate: currentSummary.pass_rate,
        improvement: 0
      })

      // Add previous exams
      let previousMean = currentSummary.mean_score
      for (const prevExam of previousExams) {
        const prevSummary = await this.getPerformanceSummary(prevExam.id, streamId)
        const improvement = prevSummary.mean_score > 0 ? previousMean - prevSummary.mean_score : 0

        comparison.push({
          term_name: prevExam.name,
          mean_score: prevSummary.mean_score,
          pass_rate: prevSummary.pass_rate,
          improvement
        })

        previousMean = prevSummary.mean_score
      }

      return comparison
    } catch (error) {
      console.error('Error getting term comparison:', error)
      throw new Error(`Failed to get term comparison: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}

export default new ReportCardAnalyticsService()
