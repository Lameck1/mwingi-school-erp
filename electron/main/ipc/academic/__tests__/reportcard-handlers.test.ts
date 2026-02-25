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

import { registerReportCardHandlers } from '../reportcard-handlers'

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
})
