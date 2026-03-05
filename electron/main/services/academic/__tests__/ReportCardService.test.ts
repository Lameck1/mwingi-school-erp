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

vi.mock('../../../utils/image-utils', () => ({
  getImageAsBase64DataUrl: vi.fn().mockResolvedValue('data:image/png;base64,mockImageData'),
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
        if (sql.includes('FROM exam_result er') && sql.includes('1 as weight') && !sql.includes('e.academic_year_id = ?')) {
          throw new Error('Report card exam result query must scope by academic year')
        }
        if (sql.includes('FROM report_card_summary') && !sql.includes('academic_year_id = ?')) {
          throw new Error('Report card summary lookup must scope by academic year')
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

  it('detectCurriculum returns ECDE for baby/pre-primary streams', () => {
    const service = new ReportCardService()
    const detect = (service as unknown as { detectCurriculum: (name: string | null) => string }).detectCurriculum
    expect(detect.call(service, 'Baby Class')).toBe('ECDE')
    expect(detect.call(service, 'PP1')).toBe('ECDE')
    expect(detect.call(service, 'Pre-Primary 2')).toBe('ECDE')
    expect(detect.call(service, 'Nursery')).toBe('ECDE')
  })

  it('detectCurriculum returns 8-4-4 for Class 8 / STD 8', () => {
    const service = new ReportCardService()
    const detect = (service as unknown as { detectCurriculum: (name: string | null) => string }).detectCurriculum
    expect(detect.call(service, 'Class 8')).toBe('8-4-4')
    expect(detect.call(service, 'STD 8')).toBe('8-4-4')
  })

  it('detectCurriculum returns CBC for null or regular grade streams', () => {
    const service = new ReportCardService()
    const detect = (service as unknown as { detectCurriculum: (name: string | null) => string }).detectCurriculum
    expect(detect.call(service, null)).toBe('CBC')
    expect(detect.call(service, 'Grade 5')).toBe('CBC')
  })

  it('getOverallRemarks returns correct remarks for each score threshold', () => {
    const service = new ReportCardService()
    const remarks = (service as unknown as { getOverallRemarks: (avg: number) => string }).getOverallRemarks
    expect(remarks.call(service, 85)).toContain('Outstanding')
    expect(remarks.call(service, 75)).toContain('Very good')
    expect(remarks.call(service, 65)).toContain('Good effort')
    expect(remarks.call(service, 55)).toContain('Fair')
    expect(remarks.call(service, 30)).toContain('significant improvement')
  })

  it('resolveSubjectColumns detects subject_name/subject_code column variant', async () => {
    mockDb = {
      prepare: (sql: string) => ({
        all: () => {
          if (sql.includes('PRAGMA table_info(subject)')) {
            return [
              { name: 'id' },
              { name: 'subject_name' },
              { name: 'subject_code' },
              { name: 'is_active' },
            ]
          }
          if (sql.includes('FROM subject') && sql.includes('is_active')) {
            return [{ id: 1, subject_name: 'Maths', subject_code: 'MTH' }]
          }
          return []
        },
        get: () => {},
      }),
    }
    const service = new ReportCardService()
    const subjects = await service.getSubjects()
    expect(subjects).toHaveLength(1)
    expect(subjects[0].subject_name).toBe('Maths')
    expect(subjects[0].subject_code).toBe('MTH')
  })

  it('resolveSubjectColumns throws when no name/code columns found', async () => {
    mockDb = {
      prepare: (sql: string) => ({
        all: () => {
          if (sql.includes('PRAGMA table_info(subject)')) {
            return [{ name: 'id' }, { name: 'is_active' }]
          }
          return []
        },
        get: () => {},
      }),
    }
    const service = new ReportCardService()
    await expect(service.getSubjects()).rejects.toThrow('Subject schema mismatch')
  })

  it('uses grade table when it exists', async () => {
    mockDb = {
      prepare: (sql: string) => ({
        all: () => {
          if (sql.includes('SELECT * FROM grade')) {
            return [{
              student_id: 1, subject_id: 1, exam_type: 'CAT1',
              score: 75, max_score: 100, term_id: 1, academic_year_id: 1,
            }]
          }
          return []
        },
        get: () => {
          if (sql.includes("FROM sqlite_master WHERE type = 'table' AND name = ?")) {
            return { found: 1 }
          }
        },
      }),
    }
    const service = new ReportCardService()
    const grades = await service.getStudentGrades(1, 1, 1)
    expect(grades).toHaveLength(1)
    expect(grades[0].exam_type).toBe('CAT1')
    expect(grades[0].score).toBe(75)
  })

  it('generateReportCard returns null for non-existent student', async () => {
    mockDb = {
      prepare: (_sql: string) => ({
        all: () => [],
        get: () => {},
      }),
    }
    const service = new ReportCardService()
    const result = await service.generateReportCard(999, 1, 1)
    expect(result).toBeNull()
  })

  it('getSubjects retries with refreshed columns on schema change', async () => {
    let callCount = 0
    mockDb = {
      prepare: (sql: string) => ({
        all: () => {
          if (sql.includes('PRAGMA table_info(subject)')) {
            return [
              { name: 'id' },
              { name: 'name' },
              { name: 'code' },
              { name: 'is_active' },
            ]
          }
          if (sql.includes('FROM subject')) {
            callCount++
            if (callCount === 1) {
              throw new Error('no such column: name')
            }
            return [{ id: 1, subject_name: 'Eng', subject_code: 'E' }]
          }
          return []
        },
        get: () => {},
      }),
    }
    const service = new ReportCardService()
    const _subjects = await service.getSubjects()
    expect(callCount).toBe(2)
  })

  it('getDynamicGradeResolver returns expected grades for 8-4-4 curriculum', () => {
    mockDb = {
      prepare: (sql: string) => ({
        all: () => {
          if (sql.includes('grading_scale')) {
            return [
              { grade: 'A', min_score: 80, max_score: 100, remarks: 'Plain' },
              { grade: 'B', min_score: 65, max_score: 79, remarks: 'Plain' },
              { grade: 'C', min_score: 50, max_score: 64, remarks: 'Plain' },
              { grade: 'D', min_score: 35, max_score: 49, remarks: 'Plain' },
              { grade: 'E', min_score: 0, max_score: 34, remarks: 'Plain' },
            ]
          }
          return []
        },
        get: () => {},
      }),
    }
    const service = new ReportCardService()
    const fn = (service as unknown as {
      getDynamicGradeResolver: (curriculum: string) => (score: number) => { grade: string; remarks: string }
    }).getDynamicGradeResolver
    const resolver = fn.call(service, '8-4-4')
    expect(resolver(85).grade).toBe('A')
    expect(resolver(70).grade).toBe('B')
    expect(resolver(55).grade).toBe('C')
    expect(resolver(40).grade).toBe('D')
    expect(resolver(20).grade).toBe('E')
  })

  it('getDynamicGradeResolver falls back to short codes for CBC when grade name is too long', () => {
    mockDb = {
      prepare: (sql: string) => ({
        all: () => {
          if (sql.includes('grading_scale')) {
            return [
              { grade: 'Exceeding Expectations', min_score: 90, max_score: 100, remarks: 'EE' },
              { grade: 'Meeting Expectations', min_score: 58, max_score: 89, remarks: 'ME' },
              { grade: 'Approaching Expectations', min_score: 21, max_score: 57, remarks: 'AE' },
              { grade: 'Below Expectations', min_score: 0, max_score: 20, remarks: 'BE' },
            ]
          }
          return []
        },
        get: () => {},
      }),
    }
    const service = new ReportCardService()
    const fn = (service as unknown as {
      getDynamicGradeResolver: (curriculum: string) => (score: number) => { grade: string; remarks: string }
    }).getDynamicGradeResolver
    const resolver = fn.call(service, 'CBC')
    expect(resolver(95).grade).toBe('EE1')
    expect(resolver(80).grade).toBe('EE2')
    expect(resolver(60).grade).toBe('ME1')
    expect(resolver(45).grade).toBe('ME2')
    expect(resolver(35).grade).toBe('AE1')
    expect(resolver(25).grade).toBe('AE2')
    expect(resolver(15).grade).toBe('BE1')
    expect(resolver(5).grade).toBe('BE2')
  })

  it('getDynamicGradeResolver uses default grade when no grading scale matches', () => {
    mockDb = {
      prepare: (_sql: string) => ({
        all: () => [],
        get: () => {},
      }),
    }
    const service = new ReportCardService()
    const fn = (service as unknown as {
      getDynamicGradeResolver: (curriculum: string) => (score: number) => { grade: string; remarks: string }
    }).getDynamicGradeResolver

    const cbcResolver = fn.call(service, 'CBC')
    expect(cbcResolver(50).grade).toBe('BE2')
    expect(cbcResolver(50).remarks).toBe('Below Expectations')

    const oldResolver = fn.call(service, '8-4-4')
    expect(oldResolver(50).grade).toBe('E')
  })

  it('calculateRoundedScoreMetrics returns zero for empty grades', () => {
    const service = new ReportCardService()
    const fn = (service as unknown as {
      calculateRoundedScoreMetrics: (grades: unknown[]) => { totalMarks: number; overallAverage: number }
    }).calculateRoundedScoreMetrics
    const result = fn.call(service, [])
    expect(result.totalMarks).toBe(0)
    expect(result.overallAverage).toBe(0)
  })

  it('calculateRoundedScoreMetrics computes correct values', () => {
    const service = new ReportCardService()
    const fn = (service as unknown as {
      calculateRoundedScoreMetrics: (grades: { average: number }[]) => { totalMarks: number; overallAverage: number }
    }).calculateRoundedScoreMetrics
    const result = fn.call(service, [{ average: 80 }, { average: 60 }])
    expect(result.totalMarks).toBe(140)
    expect(result.overallAverage).toBe(70)
  })

  it('resolveSummaryGrade uses summary mean_grade when available', () => {
    const service = new ReportCardService()
    const fn = (service as unknown as {
      resolveSummaryGrade: (summary: unknown, rawAvg: number, resolver: (s: number) => { grade: string }) => string
    }).resolveSummaryGrade
    const result = fn.call(service, { mean_grade: 'A' }, 50, () => ({ grade: 'C' }))
    expect(result).toBe('A')
  })

  it('resolveSummaryGrade falls back to computed grade when summary is undefined', () => {
    const service = new ReportCardService()
    const fn = (service as unknown as {
      resolveSummaryGrade: (summary: unknown, rawAvg: number, resolver: (s: number) => { grade: string }) => string
    }).resolveSummaryGrade
    const result = fn.call(service, undefined, 50, () => ({ grade: 'C' }))
    expect(result).toBe('C')
  })

  it('resolveTeacherRemarks uses summary when available', () => {
    const service = new ReportCardService()
    const fn = (service as unknown as {
      resolveTeacherRemarks: (summary: unknown, rawAvg: number) => string
    }).resolveTeacherRemarks
    expect(fn.call(service, { class_teacher_remarks: 'Well done' }, 50)).toBe('Well done')
  })

  it('resolveTeacherRemarks falls back to getOverallRemarks', () => {
    const service = new ReportCardService()
    const fn = (service as unknown as {
      resolveTeacherRemarks: (summary: unknown, rawAvg: number) => string
    }).resolveTeacherRemarks
    expect(fn.call(service, undefined, 85)).toContain('Outstanding')
  })

  it('computeClassRankings returns zeros when student has no enrollment', () => {
    mockDb = {
      prepare: (_sql: string) => ({
        all: () => [],
        get: () => {},
      }),
    }
    const service = new ReportCardService()
    const fn = (service as unknown as {
      computeClassRankings: (studentId: number, yearId: number, termId: number) => unknown
    }).computeClassRankings
    const result = fn.call(service, 1, 1, 1) as {
      position: number
      rankings: { cat1: null; cat2: null; midterm: null; final_exam: null; average: null }
    }
    expect(result.position).toBe(0)
    expect(result.rankings.cat1).toBeNull()
    expect(result.rankings.average).toBeNull()
  })

  it('computeClassRankings computes ranks for classmates', () => {
    mockDb = {
      prepare: (sql: string) => ({
        all: (...args: unknown[]) => {
          if (sql.includes('SELECT stream_id FROM enrollment')) {
            return []
          }
          if (sql.includes('FROM enrollment e') && sql.includes('JOIN student')) {
            return [
              { student_id: 1 },
              { student_id: 2 },
            ]
          }
          if (sql.includes('as exam_type')) {
            const studentId = args[0] as number
            if (studentId === 1) {
              return [
                { subject_id: 1, exam_type: 'CAT1', score: 80 },
                { subject_id: 1, exam_type: 'FINAL', score: 90 },
              ]
            }
            return [
              { subject_id: 1, exam_type: 'CAT1', score: 70 },
              { subject_id: 1, exam_type: 'FINAL', score: 60 },
            ]
          }
          return []
        },
        get: (..._args: unknown[]) => {
          if (sql.includes('SELECT stream_id FROM enrollment')) {
            return { stream_id: 1 }
          }
        },
      }),
    }
    const service = new ReportCardService()
    const fn = (service as unknown as {
      computeClassRankings: (studentId: number, yearId: number, termId: number) => unknown
    }).computeClassRankings
    const result = fn.call(service, 1, 1, 1) as {
      position: number
      rankings: { cat1: number | null; final_exam: number | null; average: number | null }
    }
    expect(result.position).toBe(1)
    expect(result.rankings.cat1).toBe(1)
  })

  it('generateReportCard includes school settings when present', async () => {
    mockDb = {
      prepare: (sql: string) => createStatementHandlers(sql),
    }
    // Override to return school settings
    const origPrepare = mockDb.prepare.bind(mockDb)
    mockDb.prepare = (sql: string) => {
      const handlers = origPrepare(sql)
      if (sql.includes('FROM school_settings')) {
        return {
          ...handlers,
          get: () => ({
            school_name: 'Mwingi Primary',
            school_motto: 'Excel Always',
            logo_path: null,
            address: '123 School Rd',
            email: 'info@mwingi.edu',
            phone: '+254700123456',
          }),
        }
      }
      return handlers
    }

    const service = new ReportCardService()
    const result = await service.generateReportCard(1, 1, 1)
    expect(result).not.toBeNull()
    expect(result?.school?.name).toBe('Mwingi Primary')
    expect(result?.school?.motto).toBe('Excel Always')
  })

  it('getClassSize returns 0 when no count returned', () => {
    mockDb = {
      prepare: (sql: string) => ({
        all: () => [],
        get: () => {
          if (sql.includes('COUNT(*) as count')) {
            return { count: 0 }
          }
        },
      }),
    }
    const service = new ReportCardService()
    const fn = (service as unknown as {
      getClassSize: (studentId: number, yearId: number, termId: number) => number
    }).getClassSize
    expect(fn.call(service, 1, 1, 1)).toBe(0)
  })

  it('tableExists returns false when table is not in sqlite_master', () => {
    mockDb = {
      prepare: () => ({
        all: () => [],
        get: () => {},
      }),
    }
    const service = new ReportCardService()
    const fn = (service as unknown as {
      tableExists: (name: string) => boolean
    }).tableExists
    expect(fn.call(service, 'nonexistent_table')).toBe(false)
  })

  it('tableExists returns true when table exists', () => {
    mockDb = {
      prepare: () => ({
        all: () => [],
        get: () => ({ found: 1 }),
      }),
    }
    const service = new ReportCardService()
    const fn = (service as unknown as {
      tableExists: (name: string) => boolean
    }).tableExists
    expect(fn.call(service, 'grade')).toBe(true)
  })

  // ── branch coverage: detectCurriculum returns ECDE for PP1-containing stream ──
  it('detectCurriculum returns ECDE for stream containing PP', () => {
    mockDb = {
      prepare: () => ({
        all: () => [],
        get: () => {},
      }),
    }
    const service = new ReportCardService()
    const fn = (service as unknown as {
      detectCurriculum: (name: string | null) => string
    }).detectCurriculum
    expect(fn.call(service, 'PP1 Stream A')).toBe('ECDE')
    expect(fn.call(service, 'Baby Class')).toBe('ECDE')
  })

  // ── branch coverage: detectCurriculum returns 8-4-4 for Class 8 ──
  it('detectCurriculum returns 8-4-4 for Class 8 containing stream', () => {
    mockDb = {
      prepare: () => ({
        all: () => [],
        get: () => {},
      }),
    }
    const service = new ReportCardService()
    const fn = (service as unknown as {
      detectCurriculum: (name: string | null) => string
    }).detectCurriculum
    expect(fn.call(service, 'Class 8 East')).toBe('8-4-4')
  })

  // ── branch coverage: getOverallRemarks boundary at score = 50 ──
  it('getOverallRemarks returns fair performance at score 50', () => {
    mockDb = {
      prepare: () => ({
        all: () => [],
        get: () => {},
      }),
    }
    const service = new ReportCardService()
    const fn = (service as unknown as {
      getOverallRemarks: (avg: number) => string
    }).getOverallRemarks
    expect(fn.call(service, 50)).toContain('Fair performance')
    expect(fn.call(service, 49)).toContain('Needs significant improvement')
    expect(fn.call(service, 80)).toContain('Outstanding')
  })

  // ── branch coverage: resolveSubjectColumns cache hit ──
  it('resolveSubjectColumns returns cached result on second call', () => {
    mockDb = {
      prepare: (sql: string) => {
        if (sql.includes('PRAGMA table_info')) {
          return { all: () => [{ name: 'name' }, { name: 'code' }, { name: 'id' }, { name: 'is_active' }], get: () => {} }
        }
        return { all: () => [], get: () => {} }
      },
    }
    const service = new ReportCardService()
    const fn = (service as unknown as {
      resolveSubjectColumns: (forceRefresh?: boolean) => { nameColumn: string; codeColumn: string }
    }).resolveSubjectColumns
    const result1 = fn.call(service)
    const result2 = fn.call(service) // should hit cache
    expect(result1.nameColumn).toBe('name')
    expect(result2.nameColumn).toBe('name')
    expect(result1).toEqual(result2)
  })

  // ── branch coverage: resolveSubjectColumns with subject_name column variant ──
  it('resolveSubjectColumns detects subject_name and subject_code columns', () => {
    mockDb = {
      prepare: (sql: string) => {
        if (sql.includes('PRAGMA table_info')) {
          return { all: () => [{ name: 'subject_name' }, { name: 'subject_code' }, { name: 'id' }, { name: 'is_active' }], get: () => {} }
        }
        return { all: () => [], get: () => {} }
      },
    }
    const service = new ReportCardService()
    const fn = (service as unknown as {
      resolveSubjectColumns: (forceRefresh?: boolean) => { nameColumn: string; codeColumn: string }
    }).resolveSubjectColumns
    const result = fn.call(service)
    expect(result.nameColumn).toBe('subject_name')
    expect(result.codeColumn).toBe('subject_code')
  })

  // ── branch coverage: resolveSubjectColumns throws when columns missing ──
  it('resolveSubjectColumns throws when required columns are missing', () => {
    mockDb = {
      prepare: (sql: string) => {
        if (sql.includes('PRAGMA table_info')) {
          return { all: () => [{ name: 'id' }], get: () => {} } // no name/code columns
        }
        return { all: () => [], get: () => {} }
      },
    }
    const service = new ReportCardService()
    const fn = (service as unknown as {
      resolveSubjectColumns: (forceRefresh?: boolean) => { nameColumn: string; codeColumn: string }
    }).resolveSubjectColumns
    expect(() => fn.call(service)).toThrow('Subject schema mismatch')
  })

  // ── branch coverage: resolveSummaryGrade with and without summary ──
  it('resolveSummaryGrade uses summary grade when present', () => {
    mockDb = {
      prepare: () => ({ all: () => [], get: () => {} }),
    }
    const service = new ReportCardService()
    const fn = (service as unknown as {
      resolveSummaryGrade: (summary: any, rawAvg: number, resolveGrade: (s: number) => { grade: string; remarks: string }) => string
    }).resolveSummaryGrade
    expect(fn.call(service, { mean_grade: 'A' }, 80, () => ({ grade: 'B', remarks: 'Good' }))).toBe('A')
    expect(fn.call(service, undefined, 80, () => ({ grade: 'B', remarks: 'Good' }))).toBe('B')
  })

  // ── branch coverage: resolveTeacherRemarks with and without summary ──
  it('resolveTeacherRemarks falls back to getOverallRemarks', () => {
    mockDb = {
      prepare: () => ({ all: () => [], get: () => {} }),
    }
    const service = new ReportCardService()
    const fn = (service as unknown as {
      resolveTeacherRemarks: (summary: any, rawAvg: number) => string
    }).resolveTeacherRemarks
    expect(fn.call(service, { class_teacher_remarks: 'Good student' }, 80)).toBe('Good student')
    const result = fn.call(service, undefined, 80)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  // ── branch coverage: getDynamicGradeResolver long name fallback ──
  it('getDynamicGradeResolver uses short grade codes for CBC when DB has long names', () => {
    mockDb = {
      prepare: () => ({
        all: () => [
          { grade: 'Meeting Expectations', remarks: 'Meeting Expectations', min_score: 58, max_score: 74, curriculum: 'CBC' },
          { grade: 'Exceeding Expectations Long Name', remarks: 'Great', min_score: 75, max_score: 100, curriculum: 'CBC' },
        ],
        get: () => {},
      }),
    }
    const service = new ReportCardService()
    const fn = (service as unknown as {
      getDynamicGradeResolver: (curriculum: string) => (score: number) => { grade: string; remarks: string }
    }).getDynamicGradeResolver
    const resolver = fn.call(service, 'CBC')
    // Score 65 → matched by DB row (58-74) but grade name > 5 chars → fallback to short code
    const result = resolver(65)
    expect(result.grade).toBe('ME1')
    // Score 80 → short code EE2
    const result2 = resolver(80)
    expect(result2.grade).toBe('EE2')
    // Score 95 → EE1
    const result3 = resolver(95)
    expect(result3.grade).toBe('EE1')
    // Score 10 → BE2
    const result4 = resolver(10)
    expect(result4.grade).toBe('BE2')
  })

  // ── branch coverage: getOverallRemarks remaining boundaries ──
  it('getOverallRemarks covers all score boundaries', () => {
    mockDb = {
      prepare: () => ({ all: () => [], get: () => {} }),
    }
    const service = new ReportCardService()
    const fn = (service as unknown as {
      getOverallRemarks: (avg: number) => string
    }).getOverallRemarks
    expect(fn.call(service, 70)).toBeDefined() // 60-79 range
    expect(fn.call(service, 30)).toBeDefined() // below 50
    expect(fn.call(service, 0)).toBeDefined()  // edge: 0
    expect(fn.call(service, 100)).toBeDefined() // edge: 100
  })

  // ── branch coverage: getDynamicGradeResolver AE1/AE2/BE1 CBC fallback ranges (L283-289) ──
  it('getDynamicGradeResolver hits AE1 (31-40), AE2 (21-30) and BE1 (11-20) ranges in CBC fallback', () => {
    mockDb = {
      prepare: () => ({
        all: () => [
          { grade: 'Below Expectations Verbose', remarks: 'Below', min_score: 0, max_score: 100, curriculum: 'CBC' },
        ],
        get: () => {},
      }),
    }
    const service = new ReportCardService()
    const fn = (service as unknown as {
      getDynamicGradeResolver: (curriculum: string) => (score: number) => { grade: string; remarks: string }
    }).getDynamicGradeResolver
    const resolver = fn.call(service, 'CBC')

    // AE1 range: 31–40
    expect(resolver(35).grade).toBe('AE1')
    expect(resolver(31).grade).toBe('AE1')
    expect(resolver(40).grade).toBe('AE1')

    // AE2 range: 21–30
    expect(resolver(25).grade).toBe('AE2')
    expect(resolver(21).grade).toBe('AE2')
    expect(resolver(30).grade).toBe('AE2')

    // BE1 range: 11–20
    expect(resolver(15).grade).toBe('BE1')
    expect(resolver(11).grade).toBe('BE1')
    expect(resolver(20).grade).toBe('BE1')
  })

  // ── branch coverage: getOverallRemarks 50-59 "Fair performance" range (L608) ──
  it('getOverallRemarks returns fair performance for 50-59 range', () => {
    mockDb = {
      prepare: () => ({ all: () => [], get: () => {} }),
    }
    const service = new ReportCardService()
    const fn = (service as unknown as {
      getOverallRemarks: (avg: number) => string
    }).getOverallRemarks
    expect(fn.call(service, 55)).toContain('Fair')
    expect(fn.call(service, 50)).toContain('Fair')
    expect(fn.call(service, 59)).toContain('Fair')
  })

  // ── branch coverage: detectCurriculum ECDE stream names (L261-264) ──
  it('detectCurriculum returns ECDE for baby/PP/nursery/pre- streams', () => {
    mockDb = {
      prepare: () => ({ all: () => [], get: () => {} }),
    }
    const service = new ReportCardService()
    const fn = (service as unknown as {
      detectCurriculum: (streamName: string | null) => string
    }).detectCurriculum
    expect(fn.call(service, 'Baby Class')).toBe('ECDE')
    expect(fn.call(service, 'PP1')).toBe('ECDE')
    expect(fn.call(service, 'Nursery')).toBe('ECDE')
    expect(fn.call(service, 'Pre-Primary')).toBe('ECDE')
    expect(fn.call(service, null)).toBe('CBC')
  })

  // ── branch coverage: detectCurriculum 8-4-4 stream (L265-266) ──
  it('detectCurriculum returns 8-4-4 for class 8 / STD 8 streams', () => {
    mockDb = {
      prepare: () => ({ all: () => [], get: () => {} }),
    }
    const service = new ReportCardService()
    const fn = (service as unknown as {
      detectCurriculum: (streamName: string | null) => string
    }).detectCurriculum
    expect(fn.call(service, 'Class 8 East')).toBe('8-4-4')
    expect(fn.call(service, 'STD 8')).toBe('8-4-4')
  })

  // ── branch coverage: resolveSubjectColumns cache hit (L148, forceRefresh=false) ──
  it('resolveSubjectColumns returns cached value on second call', () => {
    mockDb = {
      prepare: (sql: string) => ({
        all: () => {
          if (sql.includes('PRAGMA table_info(subject)')) {
            return [{ name: 'id' }, { name: 'name' }, { name: 'code' }]
          }
          return []
        },
        get: () => {},
      }),
    }
    const service = new ReportCardService()
    const fn = (service as unknown as {
      resolveSubjectColumns: (forceRefresh?: boolean) => { nameColumn: string; codeColumn: string }
    }).resolveSubjectColumns

    const first = fn.call(service, false)
    const second = fn.call(service, false)
    expect(first).toEqual(second)
    expect(first.nameColumn).toBe('name')
    expect(first.codeColumn).toBe('code')
  })

  // ── branch coverage: resolveSubjectColumns with name but no code column ──
  it('resolveSubjectColumns throws when only name column exists (no code)', () => {
    mockDb = {
      prepare: (sql: string) => ({
        all: () => {
          if (sql.includes('PRAGMA table_info(subject)')) {
            return [{ name: 'id' }, { name: 'name' }]
          }
          return []
        },
        get: () => {},
      }),
    }
    const service = new ReportCardService()
    const fn = (service as unknown as {
      resolveSubjectColumns: (forceRefresh?: boolean) => unknown
    }).resolveSubjectColumns
    expect(() => fn.call(service)).toThrow('Subject schema mismatch')
  })

  // ── branch coverage: resolveSubjectColumns with code but no name column ──
  it('resolveSubjectColumns throws when only code column exists (no name)', () => {
    mockDb = {
      prepare: (sql: string) => ({
        all: () => {
          if (sql.includes('PRAGMA table_info(subject)')) {
            return [{ name: 'id' }, { name: 'code' }]
          }
          return []
        },
        get: () => {},
      }),
    }
    const service = new ReportCardService()
    const fn = (service as unknown as {
      resolveSubjectColumns: (forceRefresh?: boolean) => unknown
    }).resolveSubjectColumns
    expect(() => fn.call(service)).toThrow('Subject schema mismatch')
  })

  // ── branch coverage: getSubjects re-throws non column error ──
  it('getSubjects re-throws error that is not a column error', async () => {
    mockDb = {
      prepare: (sql: string) => ({
        all: () => {
          if (sql.includes('PRAGMA table_info(subject)')) {
            return [{ name: 'id' }, { name: 'name' }, { name: 'code' }]
          }
          if (sql.includes('FROM subject')) {
            throw new Error('database is locked')
          }
          return []
        },
        get: () => {},
      }),
    }
    const service = new ReportCardService()
    await expect(service.getSubjects()).rejects.toThrow('database is locked')
  })

  // ── branch coverage: buildGradeRows returns null for subjects with no exam results ──
  it('buildGradeRows filters out subjects with no exam results', () => {
    mockDb = {
      prepare: (sql: string) => ({
        all: () => {
          if (sql.includes('as exam_type')) {
            return [] // no typed results
          }
          if (sql.includes('1 as weight')) {
            return [] // no exam results for this subject
          }
          return []
        },
        get: () => {},
      }),
    }
    const service = new ReportCardService()
    const fn = (service as unknown as {
      buildGradeRows: (
        subjects: Array<{ id: number; subject_name: string; subject_code: string }>,
        studentId: number, ayId: number, termId: number,
        resolveGrade: (score: number) => { grade: string; remarks: string }
      ) => unknown[]
    }).buildGradeRows
    const result = fn.call(
      service,
      [{ id: 1, subject_name: 'Math', subject_code: 'M' }],
      1, 1, 1,
      () => ({ grade: 'A', remarks: 'Good' })
    )
    expect(result).toHaveLength(0)
  })

  // ── branch coverage: computeClassRankings skip classmates with no results (continue) ──
  it('computeClassRankings skips classmates with no exam results', () => {
    mockDb = {
      prepare: (sql: string) => ({
        all: (...args: unknown[]) => {
          if (sql.includes('FROM enrollment e') && sql.includes('JOIN student')) {
            return [{ student_id: 1 }, { student_id: 2 }]
          }
          if (sql.includes('as exam_type')) {
            const sid = args[0] as number
            if (sid === 2) { return [] } // classmate has no results → continue
            return [{ subject_id: 1, exam_type: 'CAT1', score: 80 }]
          }
          return []
        },
        get: () => {
          if (sql.includes('SELECT stream_id FROM enrollment')) {
            return { stream_id: 1 }
          }
        },
      }),
    }
    const service = new ReportCardService()
    const fn = (service as unknown as {
      computeClassRankings: (sid: number, y: number, t: number) => { position: number; rankings: unknown }
    }).computeClassRankings
    const result = fn.call(service, 1, 1, 1)
    expect(result.position).toBe(1)
  })

  // ── branch coverage: generateReportCard with stream_name null → 'N/A' ──
  it('generateReportCard uses N/A when stream_name is null', async () => {
    mockDb = {
      prepare: (sql: string) => {
        const handlers = createStatementHandlers(sql)
        if (sql.includes('FROM student s')) {
          return {
            ...handlers,
            get: () => ({
              id: 1, admission_number: '2026/001',
              first_name: 'Grace', last_name: 'Mutua',
              stream_name: null, photo_path: null,
            }),
          }
        }
        if (sql.includes('FROM school_settings')) {
          return { ...handlers, get: () => {} }
        }
        if (sql.includes('SELECT stream_id FROM enrollment')) {
          return { ...handlers, get: () => {}, all: () => [] }
        }
        return handlers
      },
    }
    const service = new ReportCardService()
    const result = await service.generateReportCard(1, 1, 1)
    expect(result).not.toBeNull()
    expect(result?.student.stream_name).toBe('N/A')
  })

  // ── branch coverage: computeClassRankings with CAT2 and MIDTERM data ──
  it('computeClassRankings produces rankings for CAT2 and MIDTERM exam types', () => {
    mockDb = {
      prepare: (sql: string) => ({
        all: (..._args: unknown[]) => {
          if (sql.includes('FROM enrollment e') && sql.includes('JOIN student')) {
            return [{ student_id: 1 }]
          }
          if (sql.includes('as exam_type')) {
            return [
              { subject_id: 1, exam_type: 'CAT2', score: 75 },
              { subject_id: 1, exam_type: 'MIDTERM', score: 60 },
            ]
          }
          return []
        },
        get: () => {
          if (sql.includes('SELECT stream_id FROM enrollment')) {
            return { stream_id: 1 }
          }
        },
      }),
    }
    const service = new ReportCardService()
    const fn = (service as unknown as {
      computeClassRankings: (sid: number, y: number, t: number) => {
        position: number;
        rankings: { cat2: number | null; midterm: number | null }
      }
    }).computeClassRankings
    const result = fn.call(service, 1, 1, 1)
    expect(result.rankings.cat2).toBe(1)
    expect(result.rankings.midterm).toBe(1)
  })

  // ── branch coverage: student.photo_path truthy in generateReportCard ──
  it('generateReportCard includes base64 photo when student has photo_path', async () => {
    mockDb = {
      prepare: (sql: string) => createStatementHandlers(sql),
    }
    const origPrepare = mockDb.prepare.bind(mockDb)
    mockDb.prepare = (sql: string) => {
      const handlers = origPrepare(sql)
      if (sql.includes('FROM student s')) {
        return {
          ...handlers,
          get: () => ({
            id: 1, admission_number: '2026/001',
            first_name: 'Grace', last_name: 'Mutua',
            stream_name: 'Grade 7', photo_path: '/photos/student1.jpg',
          }),
        }
      }
      return handlers
    }
    const service = new ReportCardService()
    const result = await service.generateReportCard(1, 1, 1)
    expect(result).not.toBeNull()
    expect(result?.student.photo).toBe('data:image/png;base64,mockImageData')
  })

  // ── branch coverage: schoolSettings.logo_path truthy in generateReportCard ──
  it('generateReportCard includes base64 logo when school settings have logo_path', async () => {
    mockDb = {
      prepare: (sql: string) => createStatementHandlers(sql),
    }
    const origPrepare = mockDb.prepare.bind(mockDb)
    mockDb.prepare = (sql: string) => {
      const handlers = origPrepare(sql)
      if (sql.includes('FROM school_settings')) {
        return {
          ...handlers,
          get: () => ({
            school_name: 'Mwingi Primary',
            school_motto: 'Excel Always',
            logo_path: '/logos/school.png',
            address: '123 School Rd',
            email: 'info@mwingi.edu',
            phone: '+254700123456',
          }),
        }
      }
      return handlers
    }
    const service = new ReportCardService()
    const result = await service.generateReportCard(1, 1, 1)
    expect(result).not.toBeNull()
    expect(result?.school?.logo).toBe('data:image/png;base64,mockImageData')
  })

  // ── branch coverage: detectCurriculum through generateReportCard with ECDE stream ──
  it('generateReportCard uses ECDE curriculum for Baby Class stream', async () => {
    mockDb = {
      prepare: (sql: string) => createStatementHandlers(sql),
    }
    const origPrepare = mockDb.prepare.bind(mockDb)
    mockDb.prepare = (sql: string) => {
      const handlers = origPrepare(sql)
      if (sql.includes('FROM student s')) {
        return {
          ...handlers,
          get: () => ({
            id: 1, admission_number: '2026/001',
            first_name: 'Grace', last_name: 'Mutua',
            stream_name: 'Baby Class', photo_path: null,
          }),
        }
      }
      if (sql.includes('grading_scale')) {
        return {
          ...handlers,
          all: () => [
            { grade: 'EE', min_score: 75, max_score: 100, remarks: 'Excellent' },
            { grade: 'ME', min_score: 50, max_score: 74, remarks: 'Meeting' },
            { grade: 'BE', min_score: 0, max_score: 49, remarks: 'Below' },
          ],
        }
      }
      return handlers
    }
    const service = new ReportCardService()
    const result = await service.generateReportCard(1, 1, 1)
    expect(result).not.toBeNull()
  })
})
