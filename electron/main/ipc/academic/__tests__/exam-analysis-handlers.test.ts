import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()

const examAnalysisServiceMock = {
  getSubjectAnalysis: vi.fn(() => ({ mean: 65, highest: 95, lowest: 20 })),
  analyzeAllSubjects: vi.fn(() => [{ subject: 'Math', mean: 70 }]),
  getTeacherPerformance: vi.fn(() => ({ teacherId: 1, averageScore: 72 })),
  getStudentPerformance: vi.fn(() => ({ studentId: 1, totalScore: 450 })),
  getStrugglingStudents: vi.fn(() => [{ studentId: 2, average: 35 }]),
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
  getDatabase: () => ({})
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

vi.mock('../../../services/base/ServiceContainer', () => ({
  container: {
    resolve: vi.fn((name: string) => {
      if (name === 'ExamAnalysisService') { return examAnalysisServiceMock }
      return {}
    })
  }
}))

import { registerExamAnalysisHandlers } from '../exam-analysis-handlers'

type Result = { success?: boolean; error?: string; [key: string]: unknown }

async function invoke(channel: string, ...args: unknown[]): Promise<Result> {
  const handler = handlerMap.get(channel)
  if (!handler) { throw new Error(`No handler for ${channel}`) }
  return handler({}, ...args) as Promise<Result>
}

describe('exam-analysis IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    vi.clearAllMocks()
    registerExamAnalysisHandlers()
  })

  it('registers all exam-analysis channels', () => {
    expect(handlerMap.has('exam-analysis:getSubjectAnalysis')).toBe(true)
    expect(handlerMap.has('exam-analysis:analyzeAllSubjects')).toBe(true)
    expect(handlerMap.has('exam-analysis:getTeacherPerf')).toBe(true)
    expect(handlerMap.has('exam-analysis:getStudentPerf')).toBe(true)
    expect(handlerMap.has('exam-analysis:getStruggling')).toBe(true)
  })

  it('getSubjectAnalysis returns analysis for a subject', async () => {
    const result = await invoke('exam-analysis:getSubjectAnalysis', 1, 10)
    expect(result).toEqual({ mean: 65, highest: 95, lowest: 20 })
    // Note: handler calls getSubjectAnalysis(examId, subjectId) — schema is [subjectId, examId]
    expect(examAnalysisServiceMock.getSubjectAnalysis).toHaveBeenCalledWith(10, 1)
  })

  it('analyzeAllSubjects returns all subject analyses', async () => {
    const result = await invoke('exam-analysis:analyzeAllSubjects', 10)
    expect(result).toEqual([{ subject: 'Math', mean: 70 }])
    expect(examAnalysisServiceMock.analyzeAllSubjects).toHaveBeenCalledWith(10)
  })

  it('getTeacherPerf returns teacher performance', async () => {
    const result = await invoke('exam-analysis:getTeacherPerf', 1, 1, 1)
    expect(result).toEqual({ teacherId: 1, averageScore: 72 })
    expect(examAnalysisServiceMock.getTeacherPerformance).toHaveBeenCalledWith(1, 1, 1)
  })

  it('getStudentPerf returns student performance', async () => {
    const result = await invoke('exam-analysis:getStudentPerf', 1, 10)
    expect(result).toEqual({ studentId: 1, totalScore: 450 })
    expect(examAnalysisServiceMock.getStudentPerformance).toHaveBeenCalledWith(1, 10)
  })

  it('getStruggling returns struggling students with default threshold', async () => {
    const result = await invoke('exam-analysis:getStruggling', 10)
    expect(result).toEqual([{ studentId: 2, average: 35 }])
    expect(examAnalysisServiceMock.getStrugglingStudents).toHaveBeenCalledWith(10, 50)
  })

  it('getStruggling uses custom threshold when provided', async () => {
    await invoke('exam-analysis:getStruggling', 10, 40)
    expect(examAnalysisServiceMock.getStrugglingStudents).toHaveBeenCalledWith(10, 40)
  })

  it('getStruggling uses 0 as threshold when explicitly passed (nullish coalescing left branch)', async () => {
    await invoke('exam-analysis:getStruggling', 10, 0)
    expect(examAnalysisServiceMock.getStrugglingStudents).toHaveBeenCalledWith(10, 0)
  })
})
