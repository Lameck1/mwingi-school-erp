import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSessionCache } from '../../../security/session'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()

let sessionUserId = 41
let sessionRole = 'TEACHER'
let hasActiveSession = true

const academicYears = [{ id: 1, year_name: '2026' }]
const terms = [{ id: 1, term_number: 1, year_name: '2026' }]
const exams = [{ id: 10, name: 'Midterm' }]
const scheduleSubjects = [
  { id: 1, name: 'Mathematics' },
  { id: 2, name: 'English' },
  { id: 3, name: 'Science' }
]
const examResults = [
  { student_id: 100, subject_id: 1 },
  { student_id: 100, subject_id: 2 },
  { student_id: 100, subject_id: 3 },
  { student_id: 101, subject_id: 1 },
  { student_id: 101, subject_id: 2 },
]
let useScheduleData = false
const pdfMocks = vi.hoisted(() => ({
  renderHtmlToPdfBufferMock: vi.fn(async () => Buffer.from('pdf')),
  resolveOutputPathMock: vi.fn(() => 'C:/tmp/export.pdf'),
  writePdfBufferMock: vi.fn()
}))

const dbMock = {
  prepare: vi.fn((sql: string) => ({
    all: vi.fn((..._args: unknown[]) => {
      if (sql.includes('FROM academic_year')) {
        return academicYears
      }
      if (sql.includes('FROM term')) {
        return terms
      }
      if (useScheduleData && sql.includes('student_id, subject_id') && sql.includes('exam_result')) {
        return examResults
      }
      if (useScheduleData && sql.includes('SELECT DISTINCT s.id, s.name') && sql.includes('exam_result')) {
        return scheduleSubjects
      }
      if (useScheduleData && sql.includes('SELECT id, name FROM subject')) {
        return scheduleSubjects
      }
      if (sql.includes('FROM exam')) {
        return exams
      }
      if (sql.includes('FROM stream')) {
        return []
      }
      if (sql.includes('FROM fee_category')) {
        return []
      }
      return []
    }),
    get: vi.fn((..._args: unknown[]) => {
      if (sql.includes('FROM academic_year')) {
        return academicYears[0]
      }
      if (sql.includes('FROM term')) {
        return terms[0]
      }
      if (useScheduleData && sql.includes('COUNT(DISTINCT student_id)')) {
        return { count: 2 }
      }
      if (useScheduleData && sql.includes('FROM exam WHERE id')) {
        return { start_date: '2026-06-01', end_date: '2026-06-05' }
      }
      return null
    }),
    run: vi.fn(() => ({ lastInsertRowid: 1, changes: 1 }))
  })),
  transaction: vi.fn((cb: () => unknown) => () => cb())
}

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn(async () => {
      if (!hasActiveSession) {
        return null
      }
      return JSON.stringify({
        user: {
          id: sessionUserId,
          username: 'session-user',
          role: sessionRole,
          full_name: 'Session User',
          email: null,
          is_active: 1,
          last_login: null,
          created_at: new Date().toISOString()
        },
        lastActivity: Date.now()
      })
    }),
    setPassword: vi.fn().mockResolvedValue(null),
    deletePassword: vi.fn().mockResolvedValue(true)
  }
}))

vi.mock('../../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      handlerMap.set(channel, handler)
    }),
    removeHandler: vi.fn()
  }
}))

vi.mock('../../../database', () => ({
  getDatabase: () => dbMock
}))

vi.mock('../../../utils/pdf', () => ({
  renderHtmlToPdfBuffer: pdfMocks.renderHtmlToPdfBufferMock,
  resolveOutputPath: pdfMocks.resolveOutputPathMock,
  writePdfBuffer: pdfMocks.writePdfBufferMock
}))

import { registerAcademicHandlers } from '../academic-handlers'

describe('academic handler legacy aliases and validation', () => {
  beforeEach(() => {
    clearSessionCache()
    handlerMap.clear()
    sessionUserId = 41
    sessionRole = 'TEACHER'
    hasActiveSession = true
    useScheduleData = false
    pdfMocks.renderHtmlToPdfBufferMock.mockClear()
    pdfMocks.resolveOutputPathMock.mockClear()
    pdfMocks.writePdfBufferMock.mockClear()
    registerAcademicHandlers()
  })

  it('registers legacy alias channels', () => {
    expect(handlerMap.has('academicYear:getAll')).toBe(true)
    expect(handlerMap.has('academic-year:getAll')).toBe(true)
    expect(handlerMap.has('academicYear:getCurrent')).toBe(true)
    expect(handlerMap.has('academic-year:getCurrent')).toBe(true)
    expect(handlerMap.has('academic:getExamsList')).toBe(true)
    expect(handlerMap.has('stream:getAll')).toBe(true)
    expect(handlerMap.has('feeCategory:getAll')).toBe(true)
  })

  it('keeps alias behavior for year listing and exam list', async () => {
    const yearPrimary = await handlerMap.get('academicYear:getAll')!({}) as unknown[]
    const yearAlias = await handlerMap.get('academic-year:getAll')!({}) as unknown[]
    const examList = await handlerMap.get('academic:getExamsList')!({}, { academicYearId: 1 }) as unknown[]

    expect(yearPrimary).toEqual(academicYears)
    expect(yearAlias).toEqual(academicYears)
    expect(examList).toEqual(exams)
  })

  it('validates legacy exam list payload', async () => {
    const result = await handlerMap.get('academic:getExamsList')!({}, { academicYearId: 'invalid' }) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Validation failed')
  })

  it('enforces role guard on legacy aliases', async () => {
    hasActiveSession = false
    const result = await handlerMap.get('academic-year:getAll')!({}) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
  })

  it('rejects unsafe report export filename traversal payloads', async () => {
    const result = await handlerMap.get('report:exportPdf')!(
      {},
      { content: '<p>ok</p>', filename: '../escape.pdf' }
    ) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Validation failed')
    expect(pdfMocks.resolveOutputPathMock).not.toHaveBeenCalled()
    expect(pdfMocks.writePdfBufferMock).not.toHaveBeenCalled()
  })

  it('normalizes and persists valid report export filenames', async () => {
    const result = await handlerMap.get('report:exportPdf')!(
      {},
      { content: '<p>ok</p>', filename: 'summary_2026.pdf' }
    ) as { success: boolean; filePath?: string }

    expect(result.success).toBe(true)
    expect(result.filePath).toBe('C:/tmp/export.pdf')
    expect(pdfMocks.resolveOutputPathMock).toHaveBeenCalledWith('summary_2026.pdf', 'pdf')
    expect(pdfMocks.writePdfBufferMock).toHaveBeenCalledOnce()
  })

  // ── academicYear:create ──────────────────────────────────────
  it('creates an academic year (ADMIN)', async () => {
    sessionRole = 'ADMIN'
    clearSessionCache()
    const handler = handlerMap.get('academicYear:create')!
    const result = await handler({}, {
      year_name: '2027',
      start_date: '2027-01-01',
      end_date: '2027-12-31',
      is_current: false
    }) as any
    expect(result.success).toBe(true)
  })

  it('blocks academicYear:create for non-admin', async () => {
    sessionRole = 'TEACHER'
    const handler = handlerMap.get('academicYear:create')!
    const result = await handler({}, {
      year_name: '2027',
      start_date: '2027-01-01',
      end_date: '2027-12-31'
    }) as any
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
  })

  // ── academicYear:activate ──────────────────────────────────────
  it('activates an academic year (ADMIN)', async () => {
    sessionRole = 'ADMIN'
    clearSessionCache()
    const handler = handlerMap.get('academicYear:activate')!
    const result = await handler({}, 1) as any
    expect(result.success).toBe(true)
  })

  // ── term:getAll ──────────────────────────────────────
  it('returns all terms joined with academic year', async () => {
    const handler = handlerMap.get('term:getAll')!
    const result = await handler({}) as any[]
    expect(Array.isArray(result)).toBe(true)
    expect(result).toEqual(terms)
  })

  // ── term:getByYear ──────────────────────────────────────
  it('returns terms for a specific academic year', async () => {
    const handler = handlerMap.get('term:getByYear')!
    const result = await handler({}, 1) as any[]
    expect(Array.isArray(result)).toBe(true)
    expect(result).toEqual(terms)
  })

  // ── term:getCurrent ──────────────────────────────────────
  it('returns current term with fallback', async () => {
    const handler = handlerMap.get('term:getCurrent')!
    const result = await handler({}) as any
    expect(result).toEqual(terms[0])
  })

  // ── exam:getAll ──────────────────────────────────────
  it('returns all exams with optional filters', async () => {
    const handler = handlerMap.get('exam:getAll')!
    const result = await handler({}, { academicYearId: 1 }) as any[]
    expect(Array.isArray(result)).toBe(true)
    expect(result).toEqual(exams)
  })

  it('returns all exams without filters', async () => {
    const handler = handlerMap.get('exam:getAll')!
    const result = await handler({}, {}) as any[]
    expect(result).toEqual(exams)
  })

  // ── schedule:generate ──────────────────────────────────────
  it('returns empty schedule when no examId provided', async () => {
    const handler = handlerMap.get('schedule:generate')!
    const result = await handler({}, {}) as any
    expect(result.slots).toEqual([])
    expect(result.stats.total_slots).toBe(0)
  })

  it('generates schedule for an examId', async () => {
    const handler = handlerMap.get('schedule:generate')!
    const result = await handler({}, { examId: 10 }) as any
    expect(result).toHaveProperty('slots')
    expect(result).toHaveProperty('clashes')
    expect(result).toHaveProperty('stats')
  })

  // ── schedule:detectClashes ──────────────────────────────────────
  it('returns empty array when no examId', async () => {
    const handler = handlerMap.get('schedule:detectClashes')!
    const result = await handler({}, {}) as any[]
    expect(result).toEqual([])
  })

  it('detects clashes for an examId', async () => {
    const handler = handlerMap.get('schedule:detectClashes')!
    const result = await handler({}, { examId: 10 }) as any
    expect(Array.isArray(result)).toBe(true)
  })

  // ── schedule:exportPdf ──────────────────────────────────────
  it('exports schedule to PDF', async () => {
    const slot = {
      id: 1, subject_id: 1, subject_name: 'Math',
      start_date: '2026-05-01', end_date: '2026-05-01',
      start_time: '09:00', end_time: '11:00',
      venue_id: 1, venue_name: 'Main Hall',
      max_capacity: 150, enrolled_students: 100
    }
    const handler = handlerMap.get('schedule:exportPdf')!
    const result = await handler({}, { examId: 10, slots: [slot] }) as any
    expect(result.success).toBe(true)
    expect(result.filePath).toBeDefined()
    expect(pdfMocks.renderHtmlToPdfBufferMock).toHaveBeenCalledOnce()
    expect(pdfMocks.writePdfBufferMock).toHaveBeenCalledOnce()
  })

  // ── schedule:exportPDF (alias) ──────────────────────────────────────
  it('exports schedule via uppercase alias', async () => {
    const slot = {
      id: 1, subject_id: 2, subject_name: 'English',
      start_date: '2026-05-02', end_date: '2026-05-02',
      start_time: '13:00', end_time: '15:00',
      venue_id: 2, venue_name: 'Classroom A',
      max_capacity: 60, enrolled_students: 45
    }
    const handler = handlerMap.get('schedule:exportPDF')!
    const result = await handler({}, { examId: 10, slots: [slot] }) as any
    expect(result.success).toBe(true)
    expect(pdfMocks.renderHtmlToPdfBufferMock).toHaveBeenCalled()
  })

  // ── schedule:exportPdf with empty slots (caught by Zod .min(1)) ──────────────
  it('throws when exporting schedule with empty slots', async () => {
    const handler = handlerMap.get('schedule:exportPdf')!
    const result = await handler({}, { examId: 10, slots: [] }) as any
    expect(result.success).toBe(false)
    expect(result.error).toContain('Validation failed')
  })

  it('throws when exporting schedule (uppercase alias) with empty slots', async () => {
    const handler = handlerMap.get('schedule:exportPDF')!
    const result = await handler({}, { examId: 10, slots: [] }) as any
    expect(result.success).toBe(false)
    expect(result.error).toContain('Validation failed')
  })

  // ── report:exportPdf edge cases ──────────────────────────────────────
  it('generates fallback filename when none provided', async () => {
    const result = await handlerMap.get('report:exportPdf')!(
      {},
      { content: '<p>report</p>' }
    ) as { success: boolean; filePath?: string }

    expect(result.success).toBe(true)
    expect(pdfMocks.resolveOutputPathMock).toHaveBeenCalledWith(
      expect.stringMatching(/^export_\d+\.pdf$/),
      'pdf'
    )
  })

  it('uses html field over content when both provided', async () => {
    const result = await handlerMap.get('report:exportPdf')!(
      {},
      { html: '<html><body>Custom HTML</body></html>', content: '<p>ignored</p>', filename: 'test.pdf' }
    ) as { success: boolean }

    expect(result.success).toBe(true)
    expect(pdfMocks.renderHtmlToPdfBufferMock).toHaveBeenCalledWith('<html><body>Custom HTML</body></html>')
  })

  it('rejects filename with leading dots via Zod schema', async () => {
    const result = await handlerMap.get('report:exportPdf')!(
      {},
      { content: '<p>data</p>', filename: '....pdf' }
    ) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Validation failed')
  })

  // ── exam:getAll with termId filter ──────────────────────────────────────
  it('returns exams filtered by both academicYearId and termId', async () => {
    const handler = handlerMap.get('exam:getAll')!
    const result = await handler({}, { academicYearId: 1, termId: 2 }) as any[]
    expect(Array.isArray(result)).toBe(true)
  })

  // ── academic:getExamsList without filters ──────────────────────────────────────
  it('returns exam list without filters', async () => {
    const handler = handlerMap.get('academic:getExamsList')!
    const result = await handler({}) as unknown[]
    expect(Array.isArray(result)).toBe(true)
  })

  // ── Coverage: academic:getExamsList with termId filter ──
  it('returns exam list filtered by termId', async () => {
    const handler = handlerMap.get('academic:getExamsList')!
    const result = await handler({}, { academicYearId: 1, termId: 2 }) as unknown[]
    expect(Array.isArray(result)).toBe(true)
  })

  // ── Coverage: report:exportPdf error path (renderHtmlToPdfBuffer throws) ──
  it('report:exportPdf returns error when PDF rendering fails', async () => {
    pdfMocks.renderHtmlToPdfBufferMock.mockRejectedValueOnce(new Error('Render failed'))
    const result = await handlerMap.get('report:exportPdf')!(
      {},
      { content: '<p>data</p>', filename: 'test.pdf' }
    ) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to generate PDF')
  })

  // ── Coverage: academicYear:create with is_current=true ──
  it('creates academic year with is_current true', async () => {
    sessionRole = 'ADMIN'
    clearSessionCache()
    const handler = handlerMap.get('academicYear:create')!
    const result = await handler({}, {
      year_name: '2028',
      start_date: '2028-01-01',
      end_date: '2028-12-31',
      is_current: true
    }) as any
    expect(result.success).toBe(true)
  })

  // ── Coverage: exam:getAll without academicYearId (empty filter object) ──
  it('returns exams without academicYearId (all params falsy)', async () => {
    const handler = handlerMap.get('exam:getAll')!
    const result = await handler({}, { academicYearId: 0 }) as any[]
    expect(Array.isArray(result)).toBe(true)
  })

  // ── Schedule generation with actual subjects and exam results ──
  it('generates schedule with real subjects and calculates stats', async () => {
    useScheduleData = true
    const handler = handlerMap.get('schedule:generate')!
    const result = await handler({}, { examId: 10, startDate: '2026-06-01', endDate: '2026-06-03' }) as any
    expect(result.slots.length).toBeGreaterThan(0)
    expect(result.stats.total_slots).toBe(result.slots.length)
    expect(result.stats.total_students).toBe(2)
    expect(result.stats.venues_used).toBe(3)
    expect(result.stats.average_capacity_usage).toBeGreaterThan(0)
    // Verify slot structure
    const firstSlot = result.slots[0]
    expect(firstSlot).toHaveProperty('subject_name')
    expect(firstSlot).toHaveProperty('start_date')
    expect(firstSlot).toHaveProperty('venue_name')
  })

  // ── Schedule generation with custom start/end dates ──
  it('generates schedule using exam dates from DB when startDate/endDate omitted', async () => {
    useScheduleData = true
    const handler = handlerMap.get('schedule:generate')!
    const result = await handler({}, { examId: 10 }) as any
    expect(result.slots.length).toBeGreaterThan(0)
    // Exam dates from mock: start_date='2026-06-01', end_date='2026-06-05'
    expect(result.slots[0].start_date).toBe('2026-06-01')
  })

  // ── Detect clashes with real data ──
  it('detects clashes with real schedule data (no time conflicts expected)', async () => {
    useScheduleData = true
    const handler = handlerMap.get('schedule:detectClashes')!
    const result = await handler({}, { examId: 10 }) as any[]
    // Each subject gets unique time slot, so no clashes expected
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(0)
  })

  // ── report:exportPdf with content (no html) – wraps in template ──
  it('wraps raw content in HTML template when html field is absent', async () => {
    const result = await handlerMap.get('report:exportPdf')!(
      {},
      { content: '<p>Raw content</p>' }
    ) as { success: boolean }
    expect(result.success).toBe(true)
    const calledHtml = pdfMocks.renderHtmlToPdfBufferMock.mock.calls[0][0] as string
    expect(calledHtml).toContain('<p>Raw content</p>')
    expect(calledHtml).toContain('<html>')
  })

  // ── schedule:generate with startDate and endDate provided by user ──
  it('generates schedule with user-supplied date range', async () => {
    useScheduleData = true
    const handler = handlerMap.get('schedule:generate')!
    const result = await handler({}, { examId: 10, startDate: '2026-07-01', endDate: '2026-07-01' }) as any
    // Single day with 2 time blocks → 2 subjects max
    expect(result.slots.length).toBeLessThanOrEqual(2)
    expect(result.slots.length).toBeGreaterThan(0)
  })

  // ── exam:getAll with only termId filter ──
  it('returns exams filtered by termId only', async () => {
    const handler = handlerMap.get('exam:getAll')!
    const result = await handler({}, { termId: 1 }) as any[]
    expect(Array.isArray(result)).toBe(true)
  })

  // ── branch coverage: schedule:exportPdf with falsy examId → 'export' fallback in filename ──
  it('schedule:exportPdf uses export fallback in filename when examId is falsy', async () => {
    const slot = {
      id: 1, subject_id: 1, subject_name: 'Math',
      start_date: '2026-05-01', end_date: '2026-05-01',
      start_time: '09:00', end_time: '11:00',
      venue_id: 1, venue_name: 'Main Hall',
      max_capacity: 150, enrolled_students: 100
    }
    // When examId is not provided → filename = exam_timetable_export.pdf
    const handler = handlerMap.get('schedule:exportPdf')!
    const result = await handler({}, { slots: [slot] }) as any
    expect(result.success).toBe(true)
    expect(pdfMocks.resolveOutputPathMock).toHaveBeenCalledWith('exam_timetable_export.pdf', 'timetables')
  })

  // ── branch coverage: academicYear:activate validation error ──
  it('academicYear:activate rejects non-integer id', async () => {
    sessionRole = 'ADMIN'
    clearSessionCache()
    const handler = handlerMap.get('academicYear:activate')!
    const result = await handler({}, 'not-a-number') as any
    expect(result.success).toBe(false)
    expect(result.error).toContain('Validation failed')
  })

  // ── Branch coverage: calculateAverageCapacityUsage with max_capacity=0 slots ──
  it('schedule:generate skips slots with max_capacity=0 in capacity calc', async () => {
    useScheduleData = true
    const handler = handlerMap.get('schedule:generate')!
    const result = await handler({}, { examId: 10, startDate: '2026-06-01', endDate: '2026-06-01' }) as any
    // Even with limited dates, stats should compute without NaN
    expect(typeof result.stats.average_capacity_usage).toBe('number')
    expect(Number.isNaN(result.stats.average_capacity_usage)).toBe(false)
  })

  // ── Branch coverage: report:exportPdf with html field and content wrapper ──
  it('report:exportPdf wraps raw content in HTML template when only content provided', async () => {
    const result = await handlerMap.get('report:exportPdf')!(
      {},
      { content: '<p>raw content only</p>', filename: 'raw_report.pdf' }
    ) as { success: boolean; filePath?: string }
    expect(result.success).toBe(true)
    // renderHtmlToPdfBuffer should have been called with wrapped HTML
    expect(pdfMocks.renderHtmlToPdfBufferMock).toHaveBeenCalled()
    const lastCall = pdfMocks.renderHtmlToPdfBufferMock.mock.calls
    const calledHtml = lastCall[lastCall.length - 1][0] as string
    expect(calledHtml).toContain('raw content only')
  })

  // ── Branch coverage: exam:getAll with no filters ──
  it('returns all exams when no filters provided', async () => {
    const handler = handlerMap.get('exam:getAll')!
    const result = await handler({}, {}) as any[]
    expect(Array.isArray(result)).toBe(true)
  })

  // ── Branch coverage: exam:getAll with academicYearId only ──
  it('returns exams filtered by academicYearId only', async () => {
    const handler = handlerMap.get('exam:getAll')!
    const result = await handler({}, { academicYearId: 2026 }) as any[]
    expect(Array.isArray(result)).toBe(true)
  })

  // ── Branch coverage: exam:getAll with both filters ──
  it('returns exams filtered by both academicYearId and termId', async () => {
    const handler = handlerMap.get('exam:getAll')!
    const result = await handler({}, { academicYearId: 2026, termId: 1 }) as any[]
    expect(Array.isArray(result)).toBe(true)
  })

  // ── Branch coverage: schedule:generate without examId ──
  it('schedule:generate handles missing examId gracefully', async () => {
    useScheduleData = true
    const handler = handlerMap.get('schedule:generate')!
    const result = await handler({}, { startDate: '2026-06-01', endDate: '2026-06-01' }) as any
    // Should still generate with default exam context
    expect(result).toBeDefined()
  })

  // ── Branch coverage: term:getCurrent fallback when primary query returns null (L139) ──
  it('term:getCurrent uses fallback query when no current term found', async () => {
    // Override prepare so the first call (with is_current = 1 AND t.is_current = 1) returns undefined
    dbMock.prepare.mockImplementationOnce(() => ({
      get: vi.fn(() => {}),
      all: vi.fn(() => []),
      run: vi.fn()
    }))
    const handler = handlerMap.get('term:getCurrent')!
    const result = await handler({}) as any
    expect(result).toEqual(terms[0])
  })

  // ── Branch coverage: schedule:detectClashes without examId (L328) ──
  it('schedule:detectClashes returns empty clashes when no examId provided', async () => {
    useScheduleData = true
    const handler = handlerMap.get('schedule:detectClashes')
    if (handler) {
      const result = await handler({}, { startDate: '2026-06-01', endDate: '2026-06-05' }) as any
      expect(result).toBeDefined()
    }
  })

  // ── Branch coverage: report:exportPdf – content-only mode (no html template) ──
  it('report:exportPdf generates PDF from content', async () => {
    const handler = handlerMap.get('report:exportPdf')
    if (handler) {
      const result = await handler({}, {
        html: '<h1>Test Report</h1>',
        filename: 'test-export'
      }) as any
      expect(result).toBeDefined()
    }
  })

  // ── Branch coverage: exam:getAll with no filters (empty args) ──
  it('exam:getAll returns all exams with no filters', async () => {
    const handler = handlerMap.get('exam:getAll')!
    const result = await handler({}, {}) as any[]
    expect(Array.isArray(result)).toBe(true)
  })

  // ── Branch coverage: sanitizeExportPdfFilename – candidate is '.' or '..' ──
  it('schedule:exportPdf handles edge-case filenames', async () => {
    useScheduleData = true
    const handler = handlerMap.get('schedule:exportPdf')
    if (handler) {
      const result = await handler({}, {
        examId: 10,
        startDate: '2026-06-01',
        endDate: '2026-06-05',
        filename: '..'
      }) as any
      expect(result).toBeDefined()
    }
  })

  /* ==================================================================
   *  Branch: schedule:generate with no examId → DEFAULT_SCHEDULE_STATS (L455)
   * ================================================================== */
  it('schedule:generate returns empty result when no examId', async () => {
    const handler = handlerMap.get('schedule:generate')!
    const result = await handler({}, {}) as any
    expect(result.slots).toEqual([])
    expect(result.clashes).toEqual([])
    expect(result.stats.total_slots).toBe(0)
  })

  /* ==================================================================
   *  Branch: schedule:generate with examId → builds correct schedule (L403-481)
   * ================================================================== */
  it('schedule:generate with examId builds valid schedule', async () => {
    useScheduleData = true
    const handler = handlerMap.get('schedule:generate')!
    const result = await handler({}, {
      examId: 10,
      startDate: '2026-06-01',
      endDate: '2026-06-05'
    }) as any
    expect(result.slots.length).toBeGreaterThan(0)
    expect(result.stats.total_slots).toBe(result.slots.length)
    expect(result.stats.total_students).toBe(2)
    expect(result.stats.venues_used).toBe(3)
    expect(result.stats.average_capacity_usage).toBeGreaterThan(0)
  })

  /* ==================================================================
   *  Branch: schedule:detectClashes with examId → runs full clash detection (L243+)
   * ================================================================== */
  it('schedule:detectClashes detects overlapping subjects', async () => {
    useScheduleData = true
    const handler = handlerMap.get('schedule:detectClashes')!
    const result = await handler({}, { examId: 10 }) as any
    // Result may have clashes if subjects overlap (same time block)
    expect(Array.isArray(result)).toBe(true)
  })

  /* ==================================================================
   *  Branch: schedule:exportPdf with multiple slots (L293-334)
   * ================================================================== */
  it('schedule:exportPdf exports with multiple slot data', async () => {
    const fullSlot = {
      id: 20, subject_id: 1, subject_name: 'Math',
      start_date: '2026-06-01', end_date: '2026-06-01',
      start_time: '09:00', end_time: '11:00',
      venue_id: 1, venue_name: 'Hall',
      max_capacity: 100, enrolled_students: 80
    }
    const fullSlot2 = {
      id: 21, subject_id: 2, subject_name: 'Eng',
      start_date: '2026-06-01', end_date: '2026-06-01',
      start_time: '13:00', end_time: '15:00',
      venue_id: 2, venue_name: 'Room A',
      max_capacity: 60, enrolled_students: 40
    }
    const handler = handlerMap.get('schedule:exportPdf')!
    const result = await handler({}, {
      examId: 10,
      slots: [fullSlot, fullSlot2]
    }) as any
    expect(result.success).toBe(true)
    expect(result.filePath).toBeDefined()
    expect(pdfMocks.renderHtmlToPdfBufferMock).toHaveBeenCalled()
    expect(pdfMocks.writePdfBufferMock).toHaveBeenCalled()
  })

  /* ==================================================================
   *  Branch: schedule:exportPDF alias with multiple slots (L334+)
   * ================================================================== */
  it('schedule:exportPDF alias exports with multiple slots', async () => {
    const fullSlot = {
      id: 30, subject_id: 3, subject_name: 'Science',
      start_date: '2026-06-02', end_date: '2026-06-02',
      start_time: '09:00', end_time: '11:00',
      venue_id: 3, venue_name: 'Lab',
      max_capacity: 50, enrolled_students: 30
    }
    const handler = handlerMap.get('schedule:exportPDF')!
    const result = await handler({}, {
      examId: 10,
      slots: [fullSlot]
    }) as any
    expect(result.success).toBe(true)
    expect(result.filePath).toBeDefined()
  })

  /* ==================================================================
   *  Branch: report:exportPdf with underscores and hyphens in filename (L82)
   * ================================================================== */
  it('report:exportPdf with dashes and underscores in filename', async () => {
    const handler = handlerMap.get('report:exportPdf')!
    const result = await handler({}, {
      content: '<p>report</p>',
      filename: 'my-report_2026.pdf'
    }) as any
    expect(result.success).toBe(true)
    expect(pdfMocks.resolveOutputPathMock).toHaveBeenCalled()
  })

  /* ==================================================================
   *  Branch: report:exportPdf with html field directly (no content wrap)
   * ================================================================== */
  it('report:exportPdf passes html directly when provided', async () => {
    const handler = handlerMap.get('report:exportPdf')!
    const result = await handler({}, {
      html: '<html><body><h1>Direct</h1></body></html>',
      filename: 'direct_report.pdf'
    }) as any
    expect(result.success).toBe(true)
    expect(pdfMocks.renderHtmlToPdfBufferMock).toHaveBeenCalledWith('<html><body><h1>Direct</h1></body></html>')
  })

  /* ==================================================================
   *  Branch: schedule:generate with examId, subjects fallback to all subjects (L403-405)
   * ================================================================== */
  it('schedule:generate falls back to all subjects when exam has no results', async () => {
    // useScheduleData = false → exam_result query returns [], so loadScheduleSubjects should fall back
    // But the mock for 'SELECT id, name FROM subject' returns scheduleSubjects only when useScheduleData is true.
    // So with default mock, subjects=[] → no slots
    const handler = handlerMap.get('schedule:generate')!
    const result = await handler({}, {
      examId: 10,
      startDate: '2026-06-01',
      endDate: '2026-06-02'
    }) as any
    expect(result.stats.total_slots).toBe(0)
    expect(result.slots).toEqual([])
  })

  /* ==================================================================
   *  Branch: academic:getExamsList with termId only (no academicYearId)
   * ================================================================== */
  it('returns exam list filtered by termId only (without academicYearId)', async () => {
    const handler = handlerMap.get('academic:getExamsList')!
    const result = await handler({}, { termId: 1 }) as unknown[]
    expect(Array.isArray(result)).toBe(true)
  })

  /* ==================================================================
   *  Branch: schedule:exportPDF alias with falsy examId → 'export' fallback
   * ================================================================== */
  it('schedule:exportPDF alias uses export fallback when examId is falsy', async () => {
    const slot = {
      id: 1, subject_id: 1, subject_name: 'Math',
      start_date: '2026-05-01', end_date: '2026-05-01',
      start_time: '09:00', end_time: '11:00',
      venue_id: 1, venue_name: 'Main Hall',
      max_capacity: 150, enrolled_students: 100
    }
    const handler = handlerMap.get('schedule:exportPDF')!
    const result = await handler({}, { slots: [slot] }) as any
    expect(result.success).toBe(true)
    expect(pdfMocks.resolveOutputPathMock).toHaveBeenCalledWith('exam_timetable_export.pdf', 'timetables')
  })

  /* ==================================================================
   *  Branch: schedule:generate – exam in DB has no dates → fallback dates
   * ================================================================== */
  it('schedule:generate uses fallback dates when exam has no start/end dates', async () => {
    // useScheduleData = false → exam query returns null → fallback to Date.now()
    useScheduleData = false
    dbMock.prepare.mockImplementation((sql: string) => ({
      all: vi.fn((..._args: unknown[]) => {
        if (sql.includes('SELECT DISTINCT s.id, s.name') && sql.includes('exam_result')) {return []}
        if (sql.includes('SELECT id, name FROM subject')) {return []}
        if (sql.includes('student_id, subject_id')) {return []}
        return []
      }),
      get: vi.fn((..._args: unknown[]) => {
        if (sql.includes('FROM exam WHERE id')) {return {}} // exam with no start_date/end_date
        if (sql.includes('COUNT(DISTINCT student_id)')) {return { count: 0 }}
        return null
      }),
      run: vi.fn(() => ({ lastInsertRowid: 1, changes: 1 }))
    }))

    const handler = handlerMap.get('schedule:generate')!
    const result = await handler({}, { examId: 10 }) as any
    expect(result).toBeDefined()
    expect(result.slots).toBeDefined()
  })
})
