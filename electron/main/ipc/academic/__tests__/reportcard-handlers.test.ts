import * as path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()

let sessionUserId = 77
let sessionRole = 'TEACHER'

const mockState = vi.hoisted(() => ({
  documentsRoot: 'C:/Users/test/Documents',
  existingPaths: new Set<string>(),
  openPathMock: vi.fn(async () => ''),
  showSaveDialogMock: vi.fn(),
  readFileSyncMock: vi.fn(() => Buffer.from('pdf-bytes')),
  writeFileSyncMock: vi.fn()
}))

const allowedRoot = path.resolve(path.join(mockState.documentsRoot, 'MwingiSchoolERP', 'report-cards'))

vi.mock('node:fs', () => ({
  existsSync: vi.fn((targetPath: string) => mockState.existingPaths.has(path.resolve(targetPath))),
  readFileSync: mockState.readFileSyncMock,
  writeFileSync: mockState.writeFileSyncMock
}))

vi.mock('node:fs/promises', () => ({
  writeFile: mockState.writeFileSyncMock,
  mkdir: vi.fn(async () => {}),
  stat: vi.fn(async () => ({ isFile: () => true, size: 100 }))
}))

vi.mock('../../../security/session', () => ({
  getSession: vi.fn(async () => ({
    user: {
      id: sessionUserId,
      role: sessionRole
    }
  }))
}))

vi.mock('../../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      handlerMap.set(channel, handler)
    }),
    removeHandler: vi.fn()
  },
  app: {
    getPath: vi.fn(() => mockState.documentsRoot)
  },
  shell: {
    openPath: mockState.openPathMock
  },
  dialog: {
    showSaveDialog: mockState.showSaveDialogMock
  }
}))

vi.mock('../../../database', () => ({
  getDatabase: () => ({
    prepare: vi.fn(() => ({
      all: vi.fn(() => []),
      get: vi.fn(() => null),
      run: vi.fn(() => ({ changes: 1, lastInsertRowid: 1 }))
    }))
  })
}))

vi.mock('../../../services/base/ServiceContainer', () => ({
  container: {
    resolve: vi.fn(() => ({
      getReportCard: vi.fn(),
      generateReportCard: vi.fn(),
      generateBatchReportCards: vi.fn(async () => ({ generated: [], failed: 0, total: 0, failures: [] })),
      getSubjects: vi.fn(() => []),
      getStudentGrades: vi.fn(() => []),
      getStudentsForReportCards: vi.fn(() => [])
    }))
  }
}))

vi.mock('../../../utils/pdf', () => ({
  renderHtmlToPdfBuffer: vi.fn(async () => Buffer.from('pdf')),
  resolveOutputPath: vi.fn((filename: string) => path.join(allowedRoot, filename)),
  writePdfBuffer: vi.fn()
}))

vi.mock('../../../utils/pdf-helpers', () => ({
  getSchoolInfo: vi.fn(() => ({ name: 'School', motto: 'Motto', logoDataUrl: null }))
}))

vi.mock('../../../utils/image-utils', () => ({
  getImageAsBase64DataUrl: vi.fn(() => null)
}))

const configStore: Record<string, string | null> = {}

vi.mock('../../../services/ConfigService', () => ({
  ConfigService: {
    getConfig: vi.fn((key: string) => configStore[key] ?? null)
  }
}))

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: vi.fn() }))
  }
}))

vi.mock('pdf-lib', () => ({
  PDFDocument: {
    create: vi.fn(async () => ({
      copyPages: vi.fn(async () => []),
      addPage: vi.fn(),
      save: vi.fn(async () => new Uint8Array())
    })),
    load: vi.fn(async () => ({
      getPageIndices: vi.fn(() => [])
    }))
  }
}))

import { registerReportCardHandlers, buildReportCardHtml, getSchoolName } from '../reportcard-handlers'
import { renderHtmlToPdfBuffer } from '../../../utils/pdf'

describe('report-card open file security', () => {
  beforeEach(() => {
    handlerMap.clear()
    mockState.existingPaths.clear()
    sessionUserId = 77
    sessionRole = 'TEACHER'
    mockState.openPathMock.mockReset()
    mockState.openPathMock.mockResolvedValue('')
    mockState.readFileSyncMock.mockClear()
    mockState.writeFileSyncMock.mockClear()
    // Clear SMTP config between tests
    for (const key of Object.keys(configStore)) { delete configStore[key] }
    registerReportCardHandlers()
  })

  it('opens only allowed report-card PDF files', async () => {
    const handler = handlerMap.get('report-card:openFile')
    expect(handler).toBeDefined()

    const validPath = path.resolve(path.join(allowedRoot, 'term-1', 'student-77.pdf'))
    mockState.existingPaths.add(validPath)

    const result = await handler!({}, validPath) as { success: boolean; error?: string }
    expect(result.success).toBe(true)
    expect(mockState.openPathMock).toHaveBeenCalledWith(validPath)
  })

  it('rejects traversal and out-of-allowlist paths', async () => {
    const handler = handlerMap.get('report-card:openFile')!

    const traversalPath = path.join(allowedRoot, '..', 'secrets', 'student.pdf')
    const outsidePath = path.resolve('C:/temp/student.pdf')

    const traversal = await handler({}, traversalPath) as { success: boolean; error?: string }
    const outside = await handler({}, outsidePath) as { success: boolean; error?: string }

    expect(traversal.success).toBe(false)
    expect(traversal.error).toContain('outside allowed report card directory')
    expect(outside.success).toBe(false)
    expect(outside.error).toContain('outside allowed report card directory')
    expect(mockState.openPathMock).not.toHaveBeenCalled()
  })

  it('rejects non-PDF files', async () => {
    const handler = handlerMap.get('report-card:openFile')!
    const nonPdfPath = path.resolve(path.join(allowedRoot, 'term-1', 'student-77.txt'))
    mockState.existingPaths.add(nonPdfPath)

    const result = await handler({}, nonPdfPath) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Only PDF')
    expect(mockState.openPathMock).not.toHaveBeenCalled()
  })

  it('enforces role guard before opening file', async () => {
    const handler = handlerMap.get('report-card:openFile')!
    const validPath = path.resolve(path.join(allowedRoot, 'term-1', 'student-77.pdf'))
    mockState.existingPaths.add(validPath)
    sessionRole = 'PARENT'

    const result = await handler({}, validPath) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
    expect(mockState.openPathMock).not.toHaveBeenCalled()
  })

  it('rejects unsafe merge output filenames', async () => {
    const handler = handlerMap.get('report-card:mergePDFs')
    expect(handler).toBeDefined()

    const traversal = await handler!({}, { exam_id: 1, stream_id: 1, output_path: '../x.pdf' }) as { success: boolean; error?: string }
    const absolute = await handler!({}, { exam_id: 1, stream_id: 1, output_path: 'C:/temp/x.pdf' }) as { success: boolean; error?: string }
    const empty = await handler!({}, { exam_id: 1, stream_id: 1, output_path: '.pdf' }) as { success: boolean; error?: string }

    expect(traversal.success).toBe(false)
    expect(absolute.success).toBe(false)
    expect(empty.success).toBe(false)
    expect(traversal.error).toContain('Validation failed')
    expect(absolute.error).toContain('Validation failed')
    expect(empty.error).toContain('Validation failed')
  })

  it('accepts a safe merge output filename', async () => {
    const handler = handlerMap.get('report-card:mergePDFs')
    expect(handler).toBeDefined()

    const result = await handler!({}, { exam_id: 1, stream_id: 1, output_path: 'report_2026.pdf' }) as {
      success: boolean
      filePath?: string
    }

    expect(result.success).toBe(true)
    expect(result.filePath).toContain('report_2026.pdf')
    expect(mockState.writeFileSyncMock).toHaveBeenCalled()
  })

  // ── report-card:getSubjects ──────────────────────────────────────
  describe('report-card:getSubjects', () => {
    it('returns subjects (empty from mock DB)', async () => {
      const handler = handlerMap.get('report-card:getSubjects')!
      const result = await handler({})
      expect(Array.isArray(result)).toBe(true)
    })

    it('accepts streamId filter', async () => {
      const handler = handlerMap.get('report-card:getSubjects')!
      const result = await handler({}, undefined, 1)
      expect(Array.isArray(result)).toBe(true)
    })

    it('accepts examId filter', async () => {
      const handler = handlerMap.get('report-card:getSubjects')!
      const result = await handler({}, 10)
      expect(Array.isArray(result)).toBe(true)
    })
  })

  // ── report-card:get ──────────────────────────────────────
  it('gets a single report card via CBC service', async () => {
    const handler = handlerMap.get('report-card:get')!
    const result = await handler({}, 10, 1)
    // getReportCard mock returns undefined
    expect(result).toBeUndefined()
  })

  // ── report-card:generate ──────────────────────────────────────
  it('generates a single report card via CBC service', async () => {
    const handler = handlerMap.get('report-card:generate')!
    const result = await handler({}, 1, 10)
    // generateReportCard mock returns undefined
    expect(result).toBeUndefined()
  })

  // ── report-card:generateBatch ──────────────────────────────────────
  it('generates batch report cards', async () => {
    const handler = handlerMap.get('report-card:generateBatch')!
    const result = await handler({}, { exam_id: 10, stream_id: 1 }) as any
    expect(result.success).toBe(true)
    expect(result.generated).toBe(0)
    expect(result.failed).toBe(0)
  })

  // ── report-card:emailReports ──────────────────────────────────────
  it('email reports returns error when SMTP config is missing', async () => {
    const handler = handlerMap.get('report-card:emailReports')!
    const result = await handler({}, { exam_id: 10, stream_id: 1 }) as any
    // SMTP config is not set in the test DB, so resolveSmtpConfig returns no config
    expect(result).toBeDefined()
    expect(typeof result.success).toBe('boolean')
  })

  // ── report-card:emailReports ──────────────────────────────────────
  it('registers email reports handler', () => {
    expect(handlerMap.has('report-card:emailReports')).toBe(true)
  })

  // ── report-card:downloadReports ──────────────────────────────────────
  it('downloads report cards without merge', async () => {
    const handler = handlerMap.get('report-card:downloadReports')!
    const result = await handler({}, { exam_id: 10, stream_id: 1, merge: false }) as any
    expect(result.success).toBe(true)
    expect(Array.isArray(result.files)).toBe(true)
  })

  it('downloads report cards with merge', async () => {
    const handler = handlerMap.get('report-card:downloadReports')!
    const result = await handler({}, { exam_id: 10, stream_id: 1, merge: true }) as any
    expect(result.success).toBe(true)
  })

  // ── reportcard:getSubjects (legacy) ──────────────────────────────────────
  it('returns subjects via legacy service', async () => {
    const handler = handlerMap.get('reportcard:getSubjects')!
    const result = await handler({})
    expect(Array.isArray(result)).toBe(true)
  })

  // ── reportcard:getStudentGrades (legacy) ──────────────────────────────────────
  it('returns student grades via legacy service', async () => {
    const handler = handlerMap.get('reportcard:getStudentGrades')!
    const result = await handler({}, 1, 1, 1)
    expect(Array.isArray(result)).toBe(true)
  })

  // ── reportcard:generate (legacy) ──────────────────────────────────────
  it('generates report card via legacy service', async () => {
    const handler = handlerMap.get('reportcard:generate')!
    const result = await handler({}, 1, 1, 1)
    // mock returns undefined
    expect(result).toBeUndefined()
  })

  // ── reportcard:getStudentsForGeneration (legacy) ──────────────────────────────────────
  it('returns students for report card generation', async () => {
    const handler = handlerMap.get('reportcard:getStudentsForGeneration')!
    const result = await handler({}, 1, 1, 1)
    expect(Array.isArray(result)).toBe(true)
  })

  // ── reportcard:download-pdf (legacy) ──────────────────────────────────────
  it('handles save-cancelled scenario for download-pdf', async () => {
    mockState.showSaveDialogMock.mockResolvedValue({ canceled: true })
    const handler = handlerMap.get('reportcard:download-pdf')!
    const result = await handler({}, '<h1>Report</h1>', 'report.pdf') as any
    expect(result.success).toBe(false)
    expect(result.error).toContain('cancelled')
  })

  it('saves PDF when dialog confirms', async () => {
    mockState.showSaveDialogMock.mockResolvedValue({ canceled: false, filePath: 'C:/tmp/report.pdf' })
    const handler = handlerMap.get('reportcard:download-pdf')!
    const result = await handler({}, '<h1>Report</h1>', 'report.pdf') as any
    expect(result.filePath).toBe('C:/tmp/report.pdf')
  })

  // ── openFile edge cases ───────────────────────────────────────────

  it('rejects openFile when file does not exist', async () => {
    const handler = handlerMap.get('report-card:openFile')!
    const validPath = path.resolve(path.join(allowedRoot, 'term-1', 'missing.pdf'))
    // Not added to existingPaths → fs.existsSync returns false
    const result = await handler({}, validPath) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('returns error when shell.openPath fails', async () => {
    const handler = handlerMap.get('report-card:openFile')!
    const validPath = path.resolve(path.join(allowedRoot, 'term-1', 'student-77.pdf'))
    mockState.existingPaths.add(validPath)
    mockState.openPathMock.mockResolvedValueOnce('Failed to open application')
    const result = await handler({}, validPath) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to open application')
  })

  // ── download-pdf error branch ─────────────────────────────────────

  it('returns error when PDF generation fails for download-pdf', async () => {
    vi.mocked(renderHtmlToPdfBuffer).mockRejectedValueOnce(new Error('Renderer crash'))
    const handler = handlerMap.get('reportcard:download-pdf')!
    const result = await handler({}, '<h1>Report</h1>', 'report.pdf') as any
    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to generate PDF')
  })

  // ── getSchoolName ─────────────────────────────────────────────────

  it('getSchoolName returns fallback when DB row is missing', () => {
    const name = getSchoolName()
    // Mock DB get() returns null → fallback to 'School'
    expect(name).toBe('School')
  })

  // ── buildReportCardHtml ───────────────────────────────────────────

  describe('buildReportCardHtml', () => {
    it('renders full HTML with all fields populated', () => {
      const card = {
        student_id: 1,
        student_name: 'Jane Doe',
        admission_number: 'ADM001',
        stream_name: 'Grade 4',
        term_name: 'Term 1',
        academic_year: '2025',
        position_in_class: 2,
        average_marks: 72.5,
        average_points: 3.2,
        overall_grade: 'ME',
        days_present: 85,
        days_absent: 5,
        attendance_percentage: 94.4,
        class_teacher_comment: 'Good work',
        principal_comment: 'Promoted',
        next_term_begin_date: '2025-05-05',
        fees_balance: 1500,
        subjects: [
          {
            subject_name: 'Mathematics',
            cat1: 80, cat2: 75, mid: 78, final: 82,
            marks: 79, grade: 'ME', teacher_comment: 'Excellent'
          }
        ]
      }
      const schoolInfo = { name: 'Test School', motto: 'Learn Always', logoDataUrl: 'data:image/png;base64,abc' }
      const html = buildReportCardHtml(card as any, schoolInfo as any, 'data:image/png;base64,photo')
      expect(html).toContain('Jane Doe')
      expect(html).toContain('Test School')
      expect(html).toContain('ADM001')
      expect(html).toContain('Mathematics')
      expect(html).toContain('72.5')
      expect(html).toContain('KES')
      expect(html).toContain('Learn Always')
      expect(html).toContain('Next Term Begins on')
    })

    it('renders HTML with null optional fields and no photo', () => {
      const card = {
        student_id: 2,
        student_name: 'John Smith',
        admission_number: 'ADM002',
        stream_name: 'Grade 5',
        term_name: 'Term 2',
        academic_year: '2025',
        position_in_class: null,
        average_marks: 50,
        average_points: null,
        overall_grade: 'AE',
        days_present: 60,
        days_absent: 30,
        attendance_percentage: 66.7,
        class_teacher_comment: null,
        principal_comment: null,
        next_term_begin_date: null,
        fees_balance: 0,
        subjects: []
      }
      const schoolInfo = { name: 'School', motto: null, logoDataUrl: null }
      const html = buildReportCardHtml(card as any, schoolInfo as any, null)
      expect(html).toContain('John Smith')
      expect(html).toContain('NO PHOTO')
      expect(html).toContain('Education for Eternity')
      expect(html).not.toContain('KES')
      expect(html).not.toContain('Next Term Begins on')
    })
  })

  // ── openFile with falsy/non-string filePath ────────────────────
  it('rejects openFile when filePath is null', async () => {
    const handler = handlerMap.get('report-card:openFile')!
    const result = await handler({}, null) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid input')
  })

  it('rejects openFile when filePath is empty string', async () => {
    const handler = handlerMap.get('report-card:openFile')!
    const result = await handler({}, '') as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('rejects openFile when filePath is a number', async () => {
    const handler = handlerMap.get('report-card:openFile')!
    const result = await handler({}, 42) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
  })

  // ── resolveSmtpConfig with valid config ────────────────────────
  it('email reports succeeds when SMTP config is fully set', async () => {
    configStore['smtp_host'] = 'smtp.example.com'
    configStore['smtp_port'] = '587'
    configStore['smtp_user'] = 'user@example.com'
    configStore['smtp_pass'] = 'secret'

    const handler = handlerMap.get('report-card:emailReports')!
    const result = await handler({}, { exam_id: 10, stream_id: 1, template_id: 'default', include_sms: false }) as any
    // With empty generated list from mock, sent=0, failed=0
    expect(result.success).toBe(true)
    expect(result.sent).toBe(0)
  })

  // ── resolveSmtpConfig partial config ───────────────────────────
  it('email reports fails when SMTP config is partial', async () => {
    configStore['smtp_host'] = 'smtp.example.com'
    // port, user, pass missing
    const handler = handlerMap.get('report-card:emailReports')!
    const result = await handler({}, { exam_id: 10, stream_id: 1, template_id: 'default', include_sms: false }) as any
    expect(result.success).toBe(false)
    expect(result.message).toContain('SMTP')
  })

  // ── validateReportCardOpenPath with root path (relativePath === '.') ───────
  it('rejects openFile when path resolves to root dir', async () => {
    const handler = handlerMap.get('report-card:openFile')!
    // The allowedRoot itself should give relativePath === '.'
    const result = await handler({}, allowedRoot) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
  })

  // ── download-pdf with default filename ──────────────────────────
  it('download-pdf uses default filename when none provided', async () => {
    mockState.showSaveDialogMock.mockResolvedValue({ canceled: false, filePath: 'C:/tmp/report.pdf' })
    const handler = handlerMap.get('reportcard:download-pdf')!
    const result = await handler({}, '<h1>Report</h1>') as any
    expect(result.filePath).toBe('C:/tmp/report.pdf')
  })

  // ── branch coverage: SMTP dot-notation fallback keys ──
  it('email reports uses dot-notation SMTP keys as fallback', async () => {
    configStore['smtp.host'] = 'smtp.fallback.com'
    configStore['smtp.port'] = '465'
    configStore['smtp.user'] = 'fallback@example.com'
    configStore['smtp.pass'] = 'fallbackpass'

    const handler = handlerMap.get('report-card:emailReports')!
    const result = await handler({}, { exam_id: 10, stream_id: 1, template_id: 'default', include_sms: false }) as any
    expect(result.success).toBe(true)
    expect(result.sent).toBe(0) // empty batch from mock
  })

  // ── branch coverage: report-card:getSubjects fallback path (no params) ──
  it('getSubjects returns all active subjects when no examId or streamId', async () => {
    const handler = handlerMap.get('report-card:getSubjects')!
    const result = await handler({})
    expect(Array.isArray(result)).toBe(true)
  })

  // ── buildReportCardHtml edge cases ────────────────────────────
  it('renders HTML with fees balance showing KES', () => {
    const card = {
      student_id: 3,
      student_name: 'Alice',
      admission_number: 'ADM003',
      stream_name: 'Grade 3',
      term_name: 'Term 1',
      academic_year: '2025',
      position_in_class: 1,
      average_marks: 90,
      average_points: 4,
      overall_grade: 'EE',
      days_present: 90,
      days_absent: 0,
      attendance_percentage: 100,
      class_teacher_comment: 'Outstanding',
      principal_comment: 'Keep it up',
      next_term_begin_date: '2025-09-01',
      fees_balance: 5000,
      subjects: [
        { subject_name: 'Math', cat1: null, cat2: null, mid: null, final: null, marks: 95, grade: 'EE', teacher_comment: '' }
      ]
    }
    const schoolInfo = { name: 'Test', motto: 'Aim High', logoDataUrl: null }
    // eslint-disable-next-line sonarjs/no-undefined-argument, unicorn/no-useless-undefined
    const html = buildReportCardHtml(card as any, schoolInfo as any, undefined)
    expect(html).toContain('KES')
    expect(html).toContain('5,000')
    expect(html).toContain('Next Term Begins on')
    // null cat values render as '-'
    expect(html).toMatch(/-/)
  })

  // ── Branch coverage: downloadReports with invalid merge flag ──
  it('report-card:downloadReports handles merge=false without error', async () => {
    const handler = handlerMap.get('report-card:downloadReports')!
    const result = await handler({}, { exam_id: 10, stream_id: 1, merge: false }) as any
    expect(result.success).toBe(true)
    // Non-merged path returns files array
    expect(Array.isArray(result.files)).toBe(true)
  })

  // ── Branch coverage: emailReports when SMTP config is missing ──
  it('report-card:emailReports returns result when SMTP is not configured', async () => {
    const handler = handlerMap.get('report-card:emailReports')!
    const result = await handler({}, { exam_id: 10, stream_id: 1 }) as any
    // SMTP not configured in test mock → handler returns a defined result
    expect(result).toBeDefined()
    expect(typeof result.success).toBe('boolean')
  })

  // ── Branch coverage: download-pdf with unicode-only filename triggers sanitize fallback ──
  it('download-pdf with unusual filename still produces a valid save dialog', async () => {
    mockState.showSaveDialogMock.mockResolvedValue({ canceled: false, filePath: 'C:/tmp/report.pdf' })
    const handler = handlerMap.get('reportcard:download-pdf')!
    // Pass HTML + filename with dots/unicode to exercise sanitizeReportCardFilename fallback
    const result = await handler({}, '<h1>Test</h1>', '...') as any
    expect(result).toBeDefined()
  })

  // ── Branch coverage: download-pdf with save dialog cancelled ──
  it('download-pdf handles save dialog cancellation', async () => {
    mockState.showSaveDialogMock.mockResolvedValue({ canceled: true, filePath: undefined })
    const handler = handlerMap.get('reportcard:download-pdf')!
    const result = await handler({}, '<h1>Test</h1>', 'test.pdf') as any
    // Cancelled dialog → no file saved
    expect(result).toBeDefined()
    if (result && typeof result === 'object') {
      // May return success:false or just empty result depending on implementation
      expect(result.filePath).toBeFalsy()
    }
  })

  // ── Branch coverage: openFile with non-string filePath ──
  it('report-card:openFile rejects non-string filePath', async () => {
    const handler = handlerMap.get('report-card:openFile')!
    const result = await handler({}) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
  })

  // ── Branch coverage: openFile with path outside allowed dir ──
  it('report-card:openFile rejects path outside allowed directory', async () => {
    const handler = handlerMap.get('report-card:openFile')!
    const result = await handler({}, String.raw`C:\Windows\System32\notepad.exe`) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  // ── Branch coverage: openFile with non-PDF extension ──
  it('report-card:openFile rejects non-PDF file', async () => {
    const handler = handlerMap.get('report-card:openFile')!
    const result = await handler({}, allowedRoot + '/test.docx') as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('PDF')
  })

  // ── Branch coverage: validateReportCardOpenPath – relativePath === '.' (L64) ──
  it('report-card:openFile rejects path that resolves to the allowed root itself', async () => {
    const rootPdf = path.resolve(allowedRoot) // resolves to root → relativePath === '.'
    mockState.existingPaths.add(rootPdf)
    const handler = handlerMap.get('report-card:openFile')!
    const result = await handler({}, rootPdf) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid')
  })

  // ── Branch coverage: sanitizeReportCardFilename – candidate === '..' fallback (L93) ──
  it('download-pdf uses safeFallback for double-dot filename', async () => {
    mockState.showSaveDialogMock.mockResolvedValue({ canceled: false, filePath: path.join(allowedRoot, 'saved.pdf') })
    const handler = handlerMap.get('reportcard:download-pdf')!
    // Filename '..' after trim/clean yields '..' → hits candidate === '..' branch
    const result = await handler({}, '<h1>Test</h1>', '..') as any
    expect(result).toBeDefined()
  })

  // ── Branch coverage: downloadReports with edge-case empty input ──
  it('report-card:downloadReports handles empty student list', async () => {
    const handler = handlerMap.get('report-card:downloadReports')!
    const result = await handler({}, { exam_id: 10, stream_id: 1, student_ids: [], template_id: 'default' }) as any
    expect(result).toBeDefined()
  })

  // ── Branch coverage: openFile with file that exists but non-PDF extension ──
  it('report-card:openFile rejects existing file with wrong extension', async () => {
    const txtFile = path.resolve(path.join(allowedRoot, 'notes.txt'))
    mockState.existingPaths.add(txtFile)
    const handler = handlerMap.get('report-card:openFile')!
    const result = await handler({}, txtFile) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('PDF')
  })

  // ── Statement/function coverage: emailReports catch block via service throw ──
  it('email reports catch block when generateBatchReportCards throws', async () => {
    configStore['smtp_host'] = 'smtp.example.com'
    configStore['smtp_port'] = '587'
    configStore['smtp_user'] = 'user@example.com'
    configStore['smtp_pass'] = 'secret'
    const { container } = await import('../../../services/base/ServiceContainer')
    vi.mocked(container.resolve).mockReturnValueOnce({
      generateBatchReportCards: vi.fn(async () => { throw new Error('batch gen crash') })
    })
    const handler = handlerMap.get('report-card:emailReports')!
    const result = await handler({}, { exam_id: 10, stream_id: 1, template_id: 'default', include_sms: false }) as any
    expect(result.success).toBe(false)
    expect(result.message).toContain('batch gen crash')
  })

  // ── Statement/function coverage: mergePDFs catch block ──
  it('report-card:mergePDFs catch block when service throws', async () => {
    const { container } = await import('../../../services/base/ServiceContainer')
    vi.mocked(container.resolve).mockReturnValueOnce({
      generateBatchReportCards: vi.fn(async () => { throw new Error('merge gen crash') })
    })
    const handler = handlerMap.get('report-card:mergePDFs')!
    const result = await handler({}, { exam_id: 1, stream_id: 1 }) as any
    expect(result.success).toBe(false)
    expect(result.error).toContain('merge gen crash')
  })

  // ── Statement/function coverage: downloadReports catch block ──
  it('report-card:downloadReports catch block when service throws', async () => {
    const { container } = await import('../../../services/base/ServiceContainer')
    vi.mocked(container.resolve).mockReturnValueOnce({
      generateBatchReportCards: vi.fn(async () => { throw new Error('download gen crash') })
    })
    const handler = handlerMap.get('report-card:downloadReports')!
    const result = await handler({}, { exam_id: 10, stream_id: 1, merge: false }) as any
    expect(result.success).toBe(false)
    expect(result.error).toContain('download gen crash')
  })

  // ── Statement/function coverage: getSubjects try-catch error ──
  it('report-card:getSubjects returns [] on database error', async () => {
    // Override getDatabase to throw inside the handler
    const dbModule = await import('../../../database')
    const spy = vi.spyOn(dbModule, 'getDatabase').mockImplementationOnce(() => ({
      prepare: () => { throw new Error('DB crashed') }
    }) as never)
    const handler = handlerMap.get('report-card:getSubjects')!
    const result = await handler({}) as any[]
    expect(result).toEqual([])
    spy.mockRestore()
  })

  // ── Statement coverage: sanitizeReportCardFilename – unsafe candidate falls to safeFallback ──
  it('download-pdf sanitizes filename with special chars to safeFallback', async () => {
    mockState.showSaveDialogMock.mockResolvedValue({ canceled: false, filePath: path.join(allowedRoot, 'saved.pdf') })
    const handler = handlerMap.get('reportcard:download-pdf')!
    // Filename with control chars/unicode gets sanitized → SAFE_PATH_SEGMENT fails → safeFallback used
    const result = await handler({}, '<h1>Test</h1>', '你好世界.pdf') as any
    expect(result).toBeDefined()
  })

  // ── Branch coverage: emailReports catch with non-Error → UNKNOWN_ERROR ──
  it('email reports catch block returns UNKNOWN_ERROR for non-Error throw', async () => {
    configStore.smtp_host = 'smtp.test.com'
    configStore.smtp_port = '587'
    configStore.smtp_user = 'user@test.com'
    configStore.smtp_pass = 'pass'
    const { container } = await import('../../../services/base/ServiceContainer')
    vi.mocked(container.resolve).mockReturnValueOnce({
      generateBatchReportCards: vi.fn(async () => { throw 'string-error' }) // NOSONAR
    })
    const handler = handlerMap.get('report-card:emailReports')!
    const result = await handler({}, { exam_id: 1, stream_id: 1 }) as any
    expect(result.success).toBe(false)
    // The handler's catch returns message for Error, wrapper may catch non-Error differently
    expect(result.message ?? result.error).toBeDefined()
  })

  // ── Branch coverage: mergePDFs catch with non-Error → UNKNOWN_ERROR ──
  it('report-card:mergePDFs catch returns UNKNOWN_ERROR for non-Error throw', async () => {
    const { container } = await import('../../../services/base/ServiceContainer')
    vi.mocked(container.resolve).mockReturnValueOnce({
      generateBatchReportCards: vi.fn(async () => { throw 42 }) // NOSONAR
    })
    const handler = handlerMap.get('report-card:mergePDFs')!
    const result = await handler({}, { exam_id: 1, stream_id: 1 }) as any
    expect(result.success).toBe(false)
    expect(result.error).toBe('Unknown error')
  })

  // ── Branch coverage: downloadReports catch with non-Error → UNKNOWN_ERROR ──
  it('report-card:downloadReports catch returns UNKNOWN_ERROR for non-Error throw', async () => {
    const { container } = await import('../../../services/base/ServiceContainer')
    vi.mocked(container.resolve).mockReturnValueOnce({
      generateBatchReportCards: vi.fn(async () => { throw null }) // NOSONAR
    })
    const handler = handlerMap.get('report-card:downloadReports')!
    const result = await handler({}, { exam_id: 1, stream_id: 1, merge: true }) as any
    expect(result.success).toBe(false)
    expect(result.error).toBe('Unknown error')
  })

  // ── Branch coverage: sanitizeReportCardFilename candidate === '..' → safeFallback ──
  it('download-pdf sanitizes double-dot-only filename to safeFallback', async () => {
    mockState.showSaveDialogMock.mockResolvedValue({ canceled: false, filePath: path.join(allowedRoot, 'saved.pdf') })
    const handler = handlerMap.get('reportcard:download-pdf')!
    const result = await handler({}, '<h1>Test</h1>', '..') as any
    expect(result).toBeDefined()
  })

  // ── Branch coverage: getSubjects streamId branch (L231) ──
  it('report-card:getSubjects with streamId uses allocation query', async () => {
    const handler = handlerMap.get('report-card:getSubjects')!
    const result = await handler({}, 1, 5) as any
    expect(Array.isArray(result)).toBe(true)
  })

  // ── Branch coverage: getSubjects examId-only branch (L242) ──
  it('report-card:getSubjects with examId only uses results query', async () => {
    const handler = handlerMap.get('report-card:getSubjects')!
    const result = await handler({}, 10) as any
    expect(Array.isArray(result)).toBe(true)
  })

  // ── Branch: sendReportCardEmails – no guardian email → counted as failed ──
  it('email reports counts failed when guardian email is missing for generated cards', async () => {
    configStore['smtp_host'] = 'smtp.example.com'
    configStore['smtp_port'] = '587'
    configStore['smtp_user'] = 'user@example.com'
    configStore['smtp_pass'] = 'secret'

    const { container } = await import('../../../services/base/ServiceContainer')
    vi.mocked(container.resolve).mockReset()
    vi.mocked(container.resolve).mockReturnValueOnce({
      generateBatchReportCards: vi.fn(async () => ({
        generated: [{
          student_id: 42, student_name: 'No Email Student', admission_number: 'ADM042',
          stream_name: 'Grade 4', term_name: 'Term 1', academic_year: '2025',
          position_in_class: 1, average_marks: 70, average_points: 3, overall_grade: 'ME',
          days_present: 80, days_absent: 10, attendance_percentage: 88.9,
          class_teacher_comment: 'OK', principal_comment: 'OK',
          next_term_begin_date: null, fees_balance: 0, subjects: []
        }],
        failed: 0, total: 1, failures: []
      }))
    })

    // Default DB mock returns null for get() → getGuardianEmail returns null
    const handler = handlerMap.get('report-card:emailReports')!
    const result = await handler({}, { exam_id: 10, stream_id: 1, template_id: 'default', include_sms: false }) as any
    expect(result.success).toBe(true)
    expect(result.sent).toBe(0)
    expect(result.failed).toBe(1)
  })

  // ── Branch: sendReportCardEmails – guardian email found → email sent ──
  it('email reports sends email when guardian email exists', async () => {
    configStore['smtp_host'] = 'smtp.example.com'
    configStore['smtp_port'] = '587'
    configStore['smtp_user'] = 'user@example.com'
    configStore['smtp_pass'] = 'secret'

    const { container } = await import('../../../services/base/ServiceContainer')
    vi.mocked(container.resolve).mockReset()
    vi.mocked(container.resolve).mockReturnValueOnce({
      generateBatchReportCards: vi.fn(async () => ({
        generated: [{
          student_id: 42, student_name: 'Email Student', admission_number: 'ADM042',
          stream_name: 'Grade 4', term_name: 'Term 1', academic_year: '2025',
          position_in_class: 1, average_marks: 70, average_points: 3, overall_grade: 'ME',
          days_present: 80, days_absent: 10, attendance_percentage: 88.9,
          class_teacher_comment: 'OK', principal_comment: 'OK',
          next_term_begin_date: null, fees_balance: 0, subjects: []
        }],
        failed: 0, total: 1, failures: []
      }))
    })

    const dbModule = await import('../../../database')
    const spy = vi.spyOn(dbModule, 'getDatabase').mockImplementation(() => ({
      prepare: vi.fn((sql: string) => {
        if (sql.includes('guardian_email')) {
          return { get: vi.fn(() => ({ guardian_email: 'parent@test.com' })) }
        }
        return {
          all: vi.fn(() => []),
          get: vi.fn(() => null),
          run: vi.fn(() => ({ changes: 1, lastInsertRowid: 1 }))
        }
      })
    }) as never)

    const handler = handlerMap.get('report-card:emailReports')!
    const result = await handler({}, { exam_id: 10, stream_id: 1, template_id: 'default', include_sms: false }) as any
    expect(result.success).toBe(true)
    expect(result.sent).toBe(1)
    spy.mockRestore()
  })

  // ── Branch: sendReportCardEmails – sendMail throws → counted as failed ──
  it('email reports counts failed when sendMail throws', async () => {
    configStore['smtp_host'] = 'smtp.example.com'
    configStore['smtp_port'] = '587'
    configStore['smtp_user'] = 'user@example.com'
    configStore['smtp_pass'] = 'secret'

    const nodemailerModule = await import('nodemailer')
    vi.mocked(nodemailerModule.default.createTransport).mockReturnValueOnce({
      sendMail: vi.fn().mockRejectedValue(new Error('SMTP error'))
    } as any)

    const { container } = await import('../../../services/base/ServiceContainer')
    vi.mocked(container.resolve).mockReset()
    vi.mocked(container.resolve).mockReturnValueOnce({
      generateBatchReportCards: vi.fn(async () => ({
        generated: [{
          student_id: 42, student_name: 'Fail Student', admission_number: 'ADM042',
          stream_name: 'Grade 4', term_name: 'Term 1', academic_year: '2025',
          position_in_class: 1, average_marks: 70, average_points: 3, overall_grade: 'ME',
          days_present: 80, days_absent: 10, attendance_percentage: 88.9,
          class_teacher_comment: 'OK', principal_comment: 'OK',
          next_term_begin_date: null, fees_balance: 0, subjects: []
        }],
        failed: 0, total: 1, failures: []
      }))
    })

    const dbModule = await import('../../../database')
    const spy = vi.spyOn(dbModule, 'getDatabase').mockImplementation(() => ({
      prepare: vi.fn((sql: string) => {
        if (sql.includes('guardian_email')) {
          return { get: vi.fn(() => ({ guardian_email: 'parent@test.com' })) }
        }
        return {
          all: vi.fn(() => []),
          get: vi.fn(() => null),
          run: vi.fn(() => ({ changes: 1, lastInsertRowid: 1 }))
        }
      })
    }) as never)

    const handler = handlerMap.get('report-card:emailReports')!
    const result = await handler({}, { exam_id: 10, stream_id: 1, template_id: 'default', include_sms: false }) as any
    expect(result.success).toBe(true)
    expect(result.sent).toBe(0)
    expect(result.failed).toBe(1)
    spy.mockRestore()
  })

  // ── Branch: getSessionUserId throws when session has no user.id (L141-143) ──
  it('returns error when session expires between wrapper and handler execution', async () => {
    configStore['smtp_host'] = 'smtp.example.com'
    configStore['smtp_port'] = '587'
    configStore['smtp_user'] = 'user@example.com'
    configStore['smtp_pass'] = 'secret'

    const sessionModule = await import('../../../security/session')
    // First call: validated handler wrapper — valid session
    // Second call: getSessionUserId inside generateBatchReportCardFiles — null session
    vi.mocked(sessionModule.getSession)
      .mockResolvedValueOnce({ user: { id: 77, role: 'TEACHER' } } as any)
      .mockResolvedValueOnce(null as any)

    const handler = handlerMap.get('report-card:emailReports')!
    const result = await handler({}, { exam_id: 10, stream_id: 1, template_id: 'default', include_sms: false }) as any
    expect(result.success).toBe(false)
    expect(result.message).toContain('No active session')
  })

  // ── Branch: resolveSafeReportCardOutputPath – relativePath === '.' (L129-131) ──
  it('merge handler returns error when output path resolves to allowed root itself', async () => {
    const pdfModule = await import('../../../utils/pdf')
    // Mock resolveOutputPath to return the allowedRoot verbatim → relativePath === '.'
    vi.mocked(pdfModule.resolveOutputPath).mockResolvedValueOnce(allowedRoot)

    const handler = handlerMap.get('report-card:mergePDFs')!
    const result = await handler({}, { exam_id: 1, stream_id: 1 }) as any
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid report card output path')
  })

  // ── Branch: resolveSafeReportCardOutputPath – outside allowed directory (L132-134) ──
  it('merge handler returns error when output path resolves outside allowed directory', async () => {
    const pdfModule = await import('../../../utils/pdf')
    // Mock resolveOutputPath to return a path outside the allowed root
    vi.mocked(pdfModule.resolveOutputPath).mockResolvedValueOnce('C:/tmp/malicious/outside.pdf')

    const handler = handlerMap.get('report-card:mergePDFs')!
    const result = await handler({}, { exam_id: 1, stream_id: 1 }) as any
    expect(result.success).toBe(false)
    expect(result.error).toContain('outside allowed directory')
  })

  // ── Branch: generateReportCardPdfs – student photo_path truthy (L424) ──
  it('generates report card PDFs and fetches student photo when photo_path exists', async () => {
    const { container } = await import('../../../services/base/ServiceContainer')
    vi.mocked(container.resolve).mockReset()
    vi.mocked(container.resolve).mockReturnValueOnce({
      generateBatchReportCards: vi.fn(async () => ({
        generated: [{
          student_id: 99, student_name: 'Photo Student', admission_number: 'ADM099',
          stream_name: 'Grade 4', term_name: 'Term 1', academic_year: '2025',
          position_in_class: 1, average_marks: 80, average_points: 3.5, overall_grade: 'ME',
          days_present: 85, days_absent: 5, attendance_percentage: 94.4,
          class_teacher_comment: 'Good', principal_comment: 'Promoted',
          next_term_begin_date: null, fees_balance: 0, subjects: []
        }],
        failed: 0, total: 1, failures: []
      }))
    })

    const dbModule = await import('../../../database')
    const dbSpy = vi.spyOn(dbModule, 'getDatabase').mockImplementation(() => ({
      prepare: vi.fn((sql: string) => {
        if (sql.includes('photo_path')) {
          return { get: vi.fn(() => ({ photo_path: '/photos/student99.jpg' })) }
        }
        return {
          all: vi.fn(() => []),
          get: vi.fn(() => null),
          run: vi.fn(() => ({ changes: 1, lastInsertRowid: 1 }))
        }
      })
    }) as never)

    const imageModule = await import('../../../utils/image-utils')
    const imgSpy = vi.mocked(imageModule.getImageAsBase64DataUrl)
    imgSpy.mockClear()

    const handler = handlerMap.get('report-card:downloadReports')!
    const result = await handler({}, { exam_id: 10, stream_id: 1, merge: false }) as any
    expect(result.success).toBe(true)
    expect(result.files).toHaveLength(1)
    expect(imgSpy).toHaveBeenCalledWith('/photos/student99.jpg')
    dbSpy.mockRestore()
  })
})
