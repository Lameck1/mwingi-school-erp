import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()
let sessionUserId = 41
const validIsoDate = new Date().toISOString();
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
        created_at: validIsoDate
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

  it('academic:createSubject uses authenticated actor id', async () => {
    const handler = handlerMap.get('academic:createSubject')!
    const payload = { name: 'English', code: 'ENG', curriculum: '8-4-4' }
    // sessionRole must be ADMIN for createSubject (ADMIN_ONLY)
    // The default sessionRole in beforeEach is TEACHER.
    // I need to change it to ADMIN for this test to pass role check.
    sessionRole = 'ADMIN'
    // But wait, the mock uses the variable `sessionRole` strictly?
    // The mock definition:
    // role: sessionRole,
    // Yes.
    // I need to update sessionRole variable.
    // Re-register options?
    // No, handler is registered once in beforeEach.
    // Handler reads session at runtime.
    // So changing sessionRole variable IS enough IF the mock reads it dynamically.
    // Mock definition: `getPassword: vi.fn(async () => JSON.stringify({ user: { ... role: sessionRole ... } }))`
    // Yes, it uses current value of sessionRole.

    const result = await handler({}, payload, 41) as { success: boolean; error?: string }

    expect(result.success).toBe(true)
    expect(academicSystemServiceMock.createSubject).toHaveBeenCalledWith(payload, 41)
  })
})
