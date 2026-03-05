import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()

const reportCardAnalyticsServiceMock = {
  getPerformanceSummary: vi.fn(async () => ({ totalStudents: 40, averageScore: 68 })),
  getGradeDistribution: vi.fn(async () => [{ grade: 'A', count: 5 }, { grade: 'B', count: 15 }]),
  getSubjectPerformance: vi.fn(async () => [{ subject: 'Math', mean: 72 }]),
  getStrugglingStu: vi.fn(async () => [{ studentId: 3, average: 30 }]),
  getTermComparison: vi.fn(async () => ({ current: 68, previous: 62 })),
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
      if (name === 'ReportCardAnalyticsService') { return reportCardAnalyticsServiceMock }
      return {}
    })
  }
}))

import { registerReportCardAnalyticsHandlers } from '../report-card-analytics-handlers'

type Result = { success?: boolean; error?: string; [key: string]: unknown }

async function invoke(channel: string, ...args: unknown[]): Promise<Result> {
  const handler = handlerMap.get(channel)
  if (!handler) { throw new Error(`No handler for ${channel}`) }
  return handler({}, ...args) as Promise<Result>
}

describe('report-card-analytics IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    vi.clearAllMocks()
    registerReportCardAnalyticsHandlers()
  })

  it('registers all report-card-analytics channels', () => {
    expect(handlerMap.has('report-card-analytics:getPerformanceSummary')).toBe(true)
    expect(handlerMap.has('report-card-analytics:getGradeDistribution')).toBe(true)
    expect(handlerMap.has('report-card-analytics:getSubjectPerformance')).toBe(true)
    expect(handlerMap.has('report-card-analytics:getStrugglingStudents')).toBe(true)
    expect(handlerMap.has('report-card-analytics:getTermComparison')).toBe(true)
  })

  it('getPerformanceSummary returns summary data', async () => {
    const result = await invoke('report-card-analytics:getPerformanceSummary', {
      exam_id: 10,
      stream_id: 1
    })
    expect(result).toEqual({ totalStudents: 40, averageScore: 68 })
    expect(reportCardAnalyticsServiceMock.getPerformanceSummary).toHaveBeenCalledWith(10, 1)
  })

  it('getGradeDistribution returns grade breakdown', async () => {
    const result = await invoke('report-card-analytics:getGradeDistribution', {
      exam_id: 10,
      stream_id: 1
    })
    expect(result).toEqual([{ grade: 'A', count: 5 }, { grade: 'B', count: 15 }])
  })

  it('getSubjectPerformance returns subject-level data', async () => {
    const result = await invoke('report-card-analytics:getSubjectPerformance', {
      exam_id: 10,
      stream_id: 1
    })
    expect(result).toEqual([{ subject: 'Math', mean: 72 }])
  })

  it('getStrugglingStudents returns students below threshold', async () => {
    const result = await invoke('report-card-analytics:getStrugglingStudents', {
      exam_id: 10,
      stream_id: 1,
      threshold: 40
    })
    expect(result).toEqual([{ studentId: 3, average: 30 }])
    expect(reportCardAnalyticsServiceMock.getStrugglingStu).toHaveBeenCalledWith(10, 1, 40)
  })

  it('getStrugglingStudents uses default threshold of 50', async () => {
    await invoke('report-card-analytics:getStrugglingStudents', {
      exam_id: 10,
      stream_id: 1
    })
    expect(reportCardAnalyticsServiceMock.getStrugglingStu).toHaveBeenCalledWith(10, 1, 50)
  })

  it('getTermComparison returns term-over-term comparison', async () => {
    const result = await invoke('report-card-analytics:getTermComparison', {
      exam_id: 10,
      stream_id: 1
    })
    expect(result).toEqual({ current: 68, previous: 62 })
  })
})
