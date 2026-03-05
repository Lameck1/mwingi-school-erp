import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()

const performanceServiceMock = {
  getMostImprovedStudents: vi.fn(() => [{ studentId: 1, improvement: 20 }]),
  getStudentPerformanceComparison: vi.fn(() => ({ current: 75, previous: 60 })),
  getStrugglingStudents: vi.fn(() => [{ studentId: 2, average: 35 }]),
  getPerformanceTrends: vi.fn(() => [{ termId: 1, average: 65 }, { termId: 2, average: 70 }]),
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
      if (name === 'PerformanceAnalysisService') { return performanceServiceMock }
      return {}
    })
  }
}))

import { registerPerformanceAnalysisHandlers } from '../performance-analysis-handlers'

type Result = { success?: boolean; error?: string; [key: string]: unknown }

async function invoke(channel: string, ...args: unknown[]): Promise<Result> {
  const handler = handlerMap.get(channel)
  if (!handler) { throw new Error(`No handler for ${channel}`) }
  return handler({}, ...args) as Promise<Result>
}

describe('performance-analysis IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    vi.clearAllMocks()
    registerPerformanceAnalysisHandlers()
  })

  it('registers all performance channels', () => {
    expect(handlerMap.has('performance:getMostImproved')).toBe(true)
    expect(handlerMap.has('performance:getComparison')).toBe(true)
    expect(handlerMap.has('performance:getStruggling')).toBe(true)
    expect(handlerMap.has('performance:getTrends')).toBe(true)
  })

  it('getMostImproved returns improved students', async () => {
    const result = await invoke('performance:getMostImproved', {
      academicYearId: 1,
      currentTermId: 2,
      comparisonTermId: 1
    })
    expect(result).toEqual([{ studentId: 1, improvement: 20 }])
    expect(performanceServiceMock.getMostImprovedStudents).toHaveBeenCalledWith(
      expect.objectContaining({ academicYearId: 1, currentTermId: 2, comparisonTermId: 1 })
    )
  })

  it('getComparison returns performance comparison', async () => {
    const result = await invoke('performance:getComparison', 1, 1, 2, 1)
    expect(result).toEqual({ current: 75, previous: 60 })
    expect(performanceServiceMock.getStudentPerformanceComparison).toHaveBeenCalledWith(1, 1, 2, 1)
  })

  it('getStruggling returns struggling students with default threshold', async () => {
    const result = await invoke('performance:getStruggling', 1, 1)
    expect(result).toEqual([{ studentId: 2, average: 35 }])
    expect(performanceServiceMock.getStrugglingStudents).toHaveBeenCalledWith(1, 1, 50, undefined)
  })

  it('getStruggling uses custom threshold and streamId', async () => {
    await invoke('performance:getStruggling', 1, 1, 40, 2)
    expect(performanceServiceMock.getStrugglingStudents).toHaveBeenCalledWith(1, 1, 40, 2)
  })

  it('getTrends returns performance trends with default periods', async () => {
    const result = await invoke('performance:getTrends', 1, 1)
    expect(result).toEqual([{ termId: 1, average: 65 }, { termId: 2, average: 70 }])
    expect(performanceServiceMock.getPerformanceTrends).toHaveBeenCalledWith(1, 1, 3)
  })

  it('getTrends uses custom number of periods', async () => {
    await invoke('performance:getTrends', 1, 1, 6)
    expect(performanceServiceMock.getPerformanceTrends).toHaveBeenCalledWith(1, 1, 6)
  })

  // ── Coverage: getMostImproved with both optional streamId + minimumImprovement ──
  it('getMostImproved passes optional streamId and minimumImprovement', async () => {
    const result = await invoke('performance:getMostImproved', {
      academicYearId: 1,
      currentTermId: 2,
      comparisonTermId: 1,
      streamId: 5,
      minimumImprovement: 10
    })
    expect(result).toEqual([{ studentId: 1, improvement: 20 }])
    expect(performanceServiceMock.getMostImprovedStudents).toHaveBeenCalledWith(
      expect.objectContaining({ streamId: 5, minimumImprovement: 10 })
    )
  })

  it('getMostImproved omits undefined optional fields', async () => {
    await invoke('performance:getMostImproved', {
      academicYearId: 1,
      currentTermId: 2,
      comparisonTermId: 1
    })
    const arg = (performanceServiceMock.getMostImprovedStudents.mock.calls[0] as unknown[])[0]
    expect(arg).not.toHaveProperty('streamId')
    expect(arg).not.toHaveProperty('minimumImprovement')
  })
})
