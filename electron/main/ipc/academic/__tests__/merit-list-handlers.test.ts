import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

let db: Database.Database
const handlerMap = new Map<string, IpcHandler>()

const meritListServiceMock = {
  generateMeritList: vi.fn(async () => [{ rank: 1, studentId: 1, total: 480 }]),
  generateClassMeritList: vi.fn(async () => [{ rank: 1, studentId: 1, total: 480 }]),
  getSubjectMeritList: vi.fn(async () => [{ rank: 1, studentId: 1, score: 95 }]),
  getSubjectDifficulty: vi.fn(async () => ({ mean: 55, passRate: 0.72 })),
  calculatePerformanceImprovements: vi.fn(async () => [
    { studentId: 1, improvement_percentage: 15 },
    { studentId: 2, improvement_percentage: 3 },
  ]),
}

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue(JSON.stringify({
      user: { id: 1, username: 'admin', role: 'ADMIN', full_name: 'Admin', email: 'a@a.com', is_active: 1, created_at: new Date().toISOString() },
      lastActivity: Date.now()
    })),
    setPassword: vi.fn().mockResolvedValue(null),
    deletePassword: vi.fn().mockResolvedValue(true)
  }
}))

vi.mock('../../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      handlerMap.set(channel, handler)
    }),
    removeHandler: vi.fn(),
  }
}))

vi.mock('../../../database', () => ({
  getDatabase: () => db
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

vi.mock('../../../services/base/ServiceContainer', () => ({
  container: {
    resolve: vi.fn((name: string) => {
      if (name === 'MeritListService') { return meritListServiceMock }
      return {}
    })
  }
}))

import { registerMeritListHandlers } from '../merit-list-handlers'

type Result = { success?: boolean; error?: string; [key: string]: unknown }

async function invoke(channel: string, ...args: unknown[]): Promise<Result> {
  const handler = handlerMap.get(channel)
  if (!handler) { throw new Error(`No handler for ${channel}`) }
  return handler({}, ...args) as Promise<Result>
}

describe('merit-list IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    vi.clearAllMocks()
    db = new Database(':memory:')
    // merit-list:getClass handler uses getDatabase() to look up exam info
    db.exec(`
      CREATE TABLE exam (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        academic_year_id INTEGER,
        term_id INTEGER
      );
      CREATE TABLE report_card_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER,
        exam_id INTEGER,
        mean_score REAL
      );
      CREATE TABLE term (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        term_name TEXT,
        term_number INTEGER
      );

      INSERT INTO exam (id, academic_year_id, term_id) VALUES (10, 1, 1);
      INSERT INTO term (id, term_name, term_number) VALUES (1, 'Term 1', 1);
    `)
    registerMeritListHandlers()
  })

  afterEach(() => {
    db.close()
  })

  it('registers all merit-list channels', () => {
    expect(handlerMap.has('merit-list:generate')).toBe(true)
    expect(handlerMap.has('merit-list:getClass')).toBe(true)
    expect(handlerMap.has('merit-list:getImprovement')).toBe(true)
    expect(handlerMap.has('merit-list:getSubject')).toBe(true)
    expect(handlerMap.has('merit-list:getSubjectDifficulty')).toBe(true)
    expect(handlerMap.has('merit-list:getMostImproved')).toBe(true)
  })

  it('generate produces a merit list', async () => {
    const result = await invoke('merit-list:generate', {
      academicYearId: 1,
      termId: 1,
      streamId: 1
    })
    expect(result).toEqual([{ rank: 1, studentId: 1, total: 480 }])
    expect(meritListServiceMock.generateMeritList).toHaveBeenCalledWith({
      academicYearId: 1, termId: 1, streamId: 1
    })
  })

  it('getClass returns class merit list using exam lookup', async () => {
    const result = await invoke('merit-list:getClass', 10, 1)
    expect(result).toEqual([{ rank: 1, studentId: 1, total: 480 }])
    expect(meritListServiceMock.generateClassMeritList).toHaveBeenCalledWith(1, 1, 1, 10, 1)
  })

  it('getClass throws when exam not found', async () => {
    const result = await invoke('merit-list:getClass', 999, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Exam not found')
  })

  it('getImprovement returns performance improvement data', async () => {
    // No report_card_summary rows → returns empty array
    const result = await invoke('merit-list:getImprovement', 1) as unknown as unknown[]
    expect(Array.isArray(result)).toBe(true)
  })

  it('getSubject returns subject merit list', async () => {
    const result = await invoke('merit-list:getSubject', {
      examId: 10, subjectId: 1, streamId: 1
    })
    expect(result).toEqual([{ rank: 1, studentId: 1, score: 95 }])
  })

  it('getMostImproved filters by minimumImprovement', async () => {
    const result = await invoke('merit-list:getMostImproved', {
      academicYearId: 1,
      currentTermId: 2,
      comparisonTermId: 1,
      minimumImprovement: 10
    }) as unknown as unknown[]
    expect(Array.isArray(result)).toBe(true)
    // Only the student with 15% improvement should pass the filter
    expect(result.length).toBe(1)
  })

  it('getMostImproved returns all results when no minimumImprovement set', async () => {
    const result = await invoke('merit-list:getMostImproved', {
      academicYearId: 1,
      currentTermId: 2,
      comparisonTermId: 1
    }) as unknown as unknown[]
    // Both students pass threshold of 0
    expect(result.length).toBe(2)
  })

  it('getSubjectDifficulty returns difficulty analysis', async () => {
    const result = await invoke('merit-list:getSubjectDifficulty', {
      examId: 10, subjectId: 1, streamId: 1
    })
    expect(result).toEqual({ mean: 55, passRate: 0.72 })
    expect(meritListServiceMock.getSubjectDifficulty).toHaveBeenCalledWith(10, 1, 1)
  })

  it('getImprovement computes improvement when multiple terms exist', async () => {
    db.exec(`
      INSERT INTO term (id, term_name, term_number) VALUES (2, 'Term 2', 2);
      INSERT INTO exam (id, academic_year_id, term_id) VALUES (20, 1, 2);
      INSERT INTO report_card_summary (student_id, exam_id, mean_score) VALUES (1, 10, 65.0);
      INSERT INTO report_card_summary (student_id, exam_id, mean_score) VALUES (1, 20, 75.0);
    `)
    const result = await invoke('merit-list:getImprovement', 1) as unknown as Array<{
      improvement_points: number
      improvement_percentage: number
      term_name: string
    }>
    expect(result.length).toBe(1)
    expect(result[0].improvement_points).toBe(10)
    expect(result[0].improvement_percentage).toBeCloseTo(15.38, 1)
    expect(result[0].term_name).toBe('Term 2')
  })

  it('getImprovement returns zero percentage when previous average is zero', async () => {
    db.exec(`
      INSERT INTO term (id, term_name, term_number) VALUES (2, 'Term 2', 2);
      INSERT INTO exam (id, academic_year_id, term_id) VALUES (20, 1, 2);
      INSERT INTO report_card_summary (student_id, exam_id, mean_score) VALUES (5, 10, 0.0);
      INSERT INTO report_card_summary (student_id, exam_id, mean_score) VALUES (5, 20, 50.0);
    `)
    const result = await invoke('merit-list:getImprovement', 5) as unknown as Array<{
      improvement_percentage: number
    }>
    expect(result.length).toBe(1)
    expect(result[0].improvement_percentage).toBe(0)
  })

  // ── Branch L33-46: getImprovement with exactly 1 record (early return) ──
  it('getImprovement returns empty when only one term record exists', async () => {
    db.exec(`
      INSERT INTO report_card_summary (student_id, exam_id, mean_score) VALUES (1, 10, 80.0);
    `)
    const result = await invoke('merit-list:getImprovement', 1) as unknown as unknown[]
    expect(result).toEqual([])
  })

  // ── Branch L33-46: getImprovement with 3+ records produces multiple improvements ──
  it('getImprovement computes multiple improvements for 3+ terms', async () => {
    db.exec(`
      INSERT INTO term (id, term_name, term_number) VALUES (2, 'Term 2', 2);
      INSERT INTO term (id, term_name, term_number) VALUES (3, 'Term 3', 3);
      INSERT INTO exam (id, academic_year_id, term_id) VALUES (20, 1, 2);
      INSERT INTO exam (id, academic_year_id, term_id) VALUES (30, 1, 3);
      INSERT INTO report_card_summary (student_id, exam_id, mean_score) VALUES (1, 10, 60.0);
      INSERT INTO report_card_summary (student_id, exam_id, mean_score) VALUES (1, 20, 70.0);
      INSERT INTO report_card_summary (student_id, exam_id, mean_score) VALUES (1, 30, 85.0);
    `)
    const result = await invoke('merit-list:getImprovement', 1) as unknown as Array<{
      term_name: string
      improvement_points: number
      improvement_percentage: number
    }>
    expect(result.length).toBe(2)
    // First: Term 3 vs Term 2 (85 - 70 = 15)
    expect(result[0].term_name).toBe('Term 3')
    expect(result[0].improvement_points).toBe(15)
    expect(result[0].improvement_percentage).toBeCloseTo(21.43, 1)
    // Second: Term 2 vs Term 1 (70 - 60 = 10)
    expect(result[1].term_name).toBe('Term 2')
    expect(result[1].improvement_points).toBe(10)
    expect(result[1].improvement_percentage).toBeCloseTo(16.67, 1)
  })

  // ── Branch: getImprovement with negative improvement (score decrease) ──
  it('getImprovement reports negative improvement when score drops', async () => {
    db.exec(`
      INSERT INTO term (id, term_name, term_number) VALUES (2, 'Term 2', 2);
      INSERT INTO exam (id, academic_year_id, term_id) VALUES (20, 1, 2);
      INSERT INTO report_card_summary (student_id, exam_id, mean_score) VALUES (2, 10, 90.0);
      INSERT INTO report_card_summary (student_id, exam_id, mean_score) VALUES (2, 20, 70.0);
    `)
    const result = await invoke('merit-list:getImprovement', 2) as unknown as Array<{
      improvement_points: number
      improvement_percentage: number
    }>
    expect(result.length).toBe(1)
    expect(result[0].improvement_points).toBe(-20)
    expect(result[0].improvement_percentage).toBeCloseTo(-22.22, 1)
  })
})
