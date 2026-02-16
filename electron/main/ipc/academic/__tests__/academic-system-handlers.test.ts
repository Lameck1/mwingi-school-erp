import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()
let sessionUserId = 41
let sessionRole = 'TEACHER'

const academicSystemServiceMock = {
  getAllSubjects: vi.fn(() => []),
  getAllSubjectsAdmin: vi.fn(() => []),
  createSubject: vi.fn(() => ({ success: true, id: 1 })),
  updateSubject: vi.fn(() => ({ success: true })),
  setSubjectActive: vi.fn(() => ({ success: true })),
  getAllExams: vi.fn(() => []),
  createExam: vi.fn(() => ({ success: true })),
  deleteExam: vi.fn(() => ({ success: true })),
  allocateTeacher: vi.fn(() => ({ success: true })),
  getAllocations: vi.fn(() => []),
  deleteAllocation: vi.fn(() => ({ success: true })),
  saveResults: vi.fn(() => ({ success: true })),
  getResults: vi.fn(() => []),
  processResults: vi.fn(() => ({ success: true })),
}

const notificationServiceMock = {
  send: vi.fn(async () => ({ success: true })),
}

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn(async () => JSON.stringify({
      user: {
        id: sessionUserId,
        username: 'session-user',
        role: sessionRole,
        full_name: 'Session User',
        email: null,
        is_active: 1,
        last_login: null,
        created_at: '2026-01-01'
      },
      lastActivity: Date.now()
    })),
    setPassword: vi.fn().mockResolvedValue(null),
    deletePassword: vi.fn().mockResolvedValue(true),
  }
}))

vi.mock('../../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      handlerMap.set(channel, handler)
    }),
    removeHandler: vi.fn(),
  },
  app: {
    getPath: vi.fn(() => 'C:/app-data'),
  }
}))

vi.mock('../../../services/base/ServiceContainer', () => ({
  container: {
    resolve: vi.fn((name: string) => {
      if (name === 'AcademicSystemService') {
        return academicSystemServiceMock
      }
      if (name === 'NotificationService') {
        return notificationServiceMock
      }
      return {}
    })
  }
}))

vi.mock('../../../database', () => ({
  getDatabase: () => ({
    prepare: vi.fn(() => ({ get: vi.fn() }))
  })
}))

import { registerAcademicSystemHandlers } from '../academic-system-handlers'

describe('academic-system IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    sessionUserId = 41
    sessionRole = 'TEACHER'
    academicSystemServiceMock.createSubject.mockClear()
    registerAcademicSystemHandlers()
  })

  it('academic:createSubject rejects renderer actor mismatch', async () => {
    const handler = handlerMap.get('academic:createSubject')
    expect(handler).toBeDefined()

    const result = await handler!({}, { name: 'Math' }, 3) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
    expect(academicSystemServiceMock.createSubject).not.toHaveBeenCalled()
  })

  it('academic:createSubject uses authenticated actor id', async () => {
    const handler = handlerMap.get('academic:createSubject')!
    const payload = { name: 'English' }
    const result = await handler({}, payload, 41) as { success: boolean }

    expect(result.success).toBe(true)
    expect(academicSystemServiceMock.createSubject).toHaveBeenCalledWith(payload, 41)
  })
})
