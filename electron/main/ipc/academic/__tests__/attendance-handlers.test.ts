import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()

const attendanceServiceMock = {
  getAttendanceByDate: vi.fn(() => [{ student_id: 1, status: 'PRESENT' }]),
  markAttendance: vi.fn(() => ({ success: true, count: 5 })),
  getStudentAttendanceSummary: vi.fn(() => ({ present: 80, absent: 10, late: 5 })),
  getClassAttendanceSummary: vi.fn(() => ({ total: 40, present: 38, absent: 2 })),
  getStudentsForAttendance: vi.fn(() => [{ id: 1, name: 'Student A' }]),
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
      if (name === 'AttendanceService') { return attendanceServiceMock }
      return {}
    })
  }
}))

import { registerAttendanceHandlers } from '../attendance-handlers'

type Result = { success?: boolean; error?: string; [key: string]: unknown }

async function invoke(channel: string, ...args: unknown[]): Promise<Result> {
  const handler = handlerMap.get(channel)
  if (!handler) { throw new Error(`No handler for ${channel}`) }
  return handler({}, ...args) as Promise<Result>
}

describe('attendance IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    vi.clearAllMocks()
    registerAttendanceHandlers()
  })

  it('registers all attendance channels', () => {
    expect(handlerMap.has('attendance:getByDate')).toBe(true)
    expect(handlerMap.has('attendance:markAttendance')).toBe(true)
    expect(handlerMap.has('attendance:getStudentSummary')).toBe(true)
    expect(handlerMap.has('attendance:getClassSummary')).toBe(true)
    expect(handlerMap.has('attendance:getStudentsForMarking')).toBe(true)
  })

  it('getByDate returns attendance records', async () => {
    const result = await invoke('attendance:getByDate', 1, '2025-01-15', 1, 1)
    expect(result).toEqual([{ student_id: 1, status: 'PRESENT' }])
    expect(attendanceServiceMock.getAttendanceByDate).toHaveBeenCalledWith(1, '2025-01-15', 1, 1)
  })

  it('markAttendance records entries', async () => {
    const entries = [{ student_id: 1, status: 'PRESENT' }]
    const result = await invoke('attendance:markAttendance', entries, 1, '2025-01-15', 1, 1)
    expect(result).toEqual({ success: true, count: 5 })
    expect(attendanceServiceMock.markAttendance).toHaveBeenCalledWith(
      entries, 1, '2025-01-15', 1, 1, 1
    )
  })

  it('getStudentSummary returns summary data', async () => {
    const result = await invoke('attendance:getStudentSummary', 1, 1, 1)
    expect(result).toEqual({ present: 80, absent: 10, late: 5 })
    expect(attendanceServiceMock.getStudentAttendanceSummary).toHaveBeenCalledWith(1, 1, 1)
  })

  it('getClassSummary returns class attendance data', async () => {
    const result = await invoke('attendance:getClassSummary', 1, '2025-01-15', 1, 1)
    expect(result).toEqual({ total: 40, present: 38, absent: 2 })
    expect(attendanceServiceMock.getClassAttendanceSummary).toHaveBeenCalledWith(1, '2025-01-15', 1, 1)
  })

  it('getStudentsForMarking returns student list', async () => {
    const result = await invoke('attendance:getStudentsForMarking', 1, 1, 1)
    expect(result).toEqual([{ id: 1, name: 'Student A' }])
    expect(attendanceServiceMock.getStudentsForAttendance).toHaveBeenCalledWith(1, 1, 1)
  })

  it('rejects invalid getByDate params with validation error', async () => {
    const result = await invoke('attendance:getByDate', 'not-a-number', '2025-01-15', 1, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Validation failed')
  })

  it('rejects markAttendance with invalid entries', async () => {
    const result = await invoke('attendance:markAttendance', 'invalid', 1, '2025-01-15', 1, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Validation failed')
  })

  it('handles service error gracefully', async () => {
    attendanceServiceMock.getAttendanceByDate.mockImplementationOnce(() => {
      throw new Error('DB connection failed')
    })
    const result = await invoke('attendance:getByDate', 1, '2025-01-15', 1, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('DB connection failed')
  })
})
