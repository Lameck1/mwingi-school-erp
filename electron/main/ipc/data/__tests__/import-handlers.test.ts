import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()
let sessionUserId = 21
let sessionRole = 'ADMIN'

const { importServiceMock } = vi.hoisted(() => ({
  importServiceMock: {
    importFromFile: vi.fn(() => ({ success: true, totalRows: 1, imported: 1, skipped: 0, errors: [] })),
    getImportTemplate: vi.fn(() => []),
    generateTemplateFile: vi.fn(async () => Buffer.from('template')),
  }
}))

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

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => Buffer.from('id,name\n1,Test')),
  writeFileSync: vi.fn(),
}))

vi.mock('../../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      handlerMap.set(channel, handler)
    }),
    removeHandler: vi.fn(),
  },
  BrowserWindow: {
    fromWebContents: vi.fn(() => ({})),
  },
  dialog: {
    showSaveDialog: vi.fn(async () => ({ filePath: 'C:/tmp/template.xlsx' })),
  }
}))

vi.mock('../../../services/data/DataImportService', () => ({
  dataImportService: importServiceMock
}))

import { registerDataImportHandlers } from '../import-handlers'

describe('data import IPC handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    sessionUserId = 21
    sessionRole = 'ADMIN'
    importServiceMock.importFromFile.mockClear()
    registerDataImportHandlers()
  })

  it('data:import rejects renderer actor mismatch in import audit trail', async () => {
    const handler = handlerMap.get('data:import')
    expect(handler).toBeDefined()

    const result = await handler!({}, 'C:/tmp/students.xlsx', { entityType: 'student' }, 3) as {
      success: boolean
      errors?: Array<{ message: string }>
    }

    expect(result.success).toBe(false)
    expect(result.errors?.[0]?.message).toContain('renderer user mismatch')
    expect(importServiceMock.importFromFile).not.toHaveBeenCalled()
  })

  it('data:import enforces admin role', async () => {
    sessionRole = 'TEACHER'
    const handler = handlerMap.get('data:import')!
    const result = await handler({}, 'C:/tmp/students.xlsx', { entityType: 'student' }, 21) as {
      success: boolean
      error?: string
    }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
    expect(importServiceMock.importFromFile).not.toHaveBeenCalled()
  })
})
