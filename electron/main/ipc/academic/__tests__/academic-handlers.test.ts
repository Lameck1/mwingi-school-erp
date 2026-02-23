import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()

let sessionUserId = 41
let sessionRole = 'TEACHER'
let hasActiveSession = true

const academicYears = [{ id: 1, year_name: '2026' }]
const terms = [{ id: 1, term_number: 1, year_name: '2026' }]
const exams = [{ id: 10, name: 'Midterm' }]

const dbMock = {
  prepare: vi.fn((sql: string) => ({
    all: vi.fn((..._args: unknown[]) => {
      if (sql.includes('FROM academic_year')) {
        return academicYears
      }
      if (sql.includes('FROM term')) {
        return terms
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
    get: vi.fn(() => {
      if (sql.includes('FROM academic_year')) {
        return academicYears[0]
      }
      if (sql.includes('FROM term')) {
        return terms[0]
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
  renderHtmlToPdfBuffer: vi.fn(async () => Buffer.from('pdf')),
  resolveOutputPath: vi.fn(() => 'C:/tmp/export.pdf'),
  writePdfBuffer: vi.fn()
}))

import { registerAcademicHandlers } from '../academic-handlers'

describe('academic handler legacy aliases and validation', () => {
  beforeEach(() => {
    handlerMap.clear()
    sessionUserId = 41
    sessionRole = 'TEACHER'
    hasActiveSession = true
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
})
