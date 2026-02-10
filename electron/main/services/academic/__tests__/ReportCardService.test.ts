import { beforeEach, describe, expect, it, vi } from 'vitest'

type MockStatement = {
  all: (...args: unknown[]) => unknown
  get: (...args: unknown[]) => unknown
}

type MockDb = {
  prepare: (sql: string) => MockStatement
}

let mockDb: MockDb

vi.mock('../../../database', () => ({
  getDatabase: () => mockDb,
}))

vi.mock('../AttendanceService', () => ({
  AttendanceService: class {
    async getStudentAttendanceSummary() {
      return {
        total_days: 60,
        present: 58,
        absent: 2,
        late: 0,
        excused: 0,
        attendance_rate: 97,
      }
    }
  },
}))

import { ReportCardService } from '../ReportCardService'

function createStatementHandlers(sql: string): MockStatement {
  return {
    all: () => {
      if (sql.includes('PRAGMA table_info(subject)')) {
        return [
          { name: 'id' },
          { name: 'code' },
          { name: 'name' },
          { name: 'is_active' },
        ]
      }

      if (sql.includes('SELECT id, name as subject_name, code as subject_code')) {
        return [
          { id: 1, subject_name: 'Mathematics', subject_code: 'J-MATH' },
          { id: 2, subject_name: 'English', subject_code: 'J-ENG' },
        ]
      }

      if (sql.includes('FROM enrollment e') && sql.includes('student_name')) {
        return [
          { student_id: 1, student_name: 'Grace Mutua', admission_number: '2026/001' },
          { student_id: 2, student_name: 'Samuel Kamau', admission_number: '2026/002' },
        ]
      }

      if (sql.includes('FROM exam_result er') && sql.includes('1 as weight')) {
        return [
          { score: 82, competency_level: 3, weight: 1 },
          { score: 78, competency_level: 3, weight: 1 },
        ]
      }

      if (sql.includes('FROM exam_result er') && sql.includes('as exam_type')) {
        return [
          {
            student_id: 1,
            subject_id: 1,
            exam_type: 'FINAL',
            score: 82,
            max_score: 100,
            term_id: 1,
            academic_year_id: 1,
          },
        ]
      }

      if (sql.includes('SELECT * FROM grade')) {
        return []
      }

      return []
    },
    get: () => {
      if (sql.includes("FROM sqlite_master WHERE type = 'table' AND name = ?")) {
        return
      }

      if (sql.includes('FROM student s')) {
        return {
          id: 1,
          admission_number: '2026/001',
          first_name: 'Grace',
          last_name: 'Mutua',
          stream_name: 'Grade 7',
        }
      }

      if (sql.includes('SELECT year_name FROM academic_year')) {
        return { year_name: '2026' }
      }

      if (sql.includes('SELECT term_name FROM term')) {
        return { term_name: 'Term 1' }
      }

      if (sql.includes('FROM report_card_summary')) {
        return
      }

      if (sql.includes('COUNT(*) as count FROM enrollment')) {
        return { count: 45 }
      }
    },
  }
}

describe('ReportCardService', () => {
  beforeEach(() => {
    mockDb = {
      prepare: (sql: string) => {
        if (sql.includes('e.weight')) {
          throw new Error('Legacy exam.weight usage is not allowed in current schema')
        }
        return createStatementHandlers(sql)
      },
    }
  })

  it('maps current subject schema columns to legacy report-card output fields', async () => {
    const service = new ReportCardService()
    const subjects = await service.getSubjects()

    expect(subjects).toHaveLength(2)
    expect(subjects[0]).toEqual({
      id: 1,
      subject_name: 'Mathematics',
      subject_code: 'J-MATH',
    })
  })

  it('generates report card data without legacy subject_name or exam.weight column dependency', async () => {
    const service = new ReportCardService()
    const reportCard = await service.generateReportCard(1, 1, 1)

    expect(reportCard).not.toBeNull()
    expect(reportCard?.student.first_name).toBe('Grace')
    expect(reportCard?.grades.length).toBeGreaterThan(0)
    expect(reportCard?.grades[0].subject_name).toBe('Mathematics')
    expect(reportCard?.summary.class_size).toBe(45)
  })

  it('falls back to exam_result table when legacy grade table is absent', async () => {
    const service = new ReportCardService()
    const grades = await service.getStudentGrades(1, 1, 1)

    expect(grades).toHaveLength(1)
    expect(grades[0].exam_type).toBe('FINAL')
    expect(grades[0].score).toBe(82)
  })

  it('returns students for report-card generation from active enrollments', async () => {
    const service = new ReportCardService()
    const students = await service.getStudentsForReportCards(1, 1, 1)

    expect(students).toHaveLength(2)
    expect(students[0].student_name).toBe('Grace Mutua')
  })
})
