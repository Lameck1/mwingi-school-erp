import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSessionCache } from '../../../security/session'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()
let sessionUserId = 21
let sessionRole = 'ADMIN'
const validIsoDate = new Date().toISOString()

const mockState = vi.hoisted(() => ({
  selectedPath: 'C:/tmp/students.xlsx',
  importToken: '11111111-1111-4111-8111-111111111111',
  readFileSyncMock: vi.fn(() => Buffer.from('id,name\n1,Test')),
  readFileMock: vi.fn(async () => Buffer.from('id,name\n1,Test')),
  statSyncMock: vi.fn(() => ({ isFile: () => true, size: 120 })),
  showOpenDialogMock: vi.fn(async () => ({ canceled: false, filePaths: ['C:/tmp/students.xlsx'] })),
  showSaveDialogMock: vi.fn(async () => ({ filePath: 'C:/tmp/template.xlsx' }))
}))

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
        created_at: validIsoDate
      },
      lastActivity: Date.now()
    })),
    setPassword: vi.fn().mockResolvedValue(null),
    deletePassword: vi.fn().mockResolvedValue(true),
  }
}))

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => mockState.importToken)
}))

vi.mock('node:fs', () => ({
  readFileSync: mockState.readFileSyncMock,
  writeFileSync: vi.fn(),
  statSync: mockState.statSyncMock,
}))

vi.mock('node:fs/promises', () => ({
  stat: vi.fn(async () => ({ isFile: () => true, size: 120 })),
  readFile: mockState.readFileMock,
  writeFile: vi.fn(async () => {})
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
    showOpenDialog: mockState.showOpenDialogMock,
    showSaveDialog: mockState.showSaveDialogMock,
  }
}))

vi.mock('../../../services/data/DataImportService', () => ({
  dataImportService: importServiceMock
}))

import { registerDataImportHandlers } from '../import-handlers'

describe('data import IPC handlers', () => {
  beforeEach(() => {
    clearSessionCache()
    handlerMap.clear()
    sessionUserId = 21
    sessionRole = 'ADMIN'
    mockState.readFileSyncMock.mockClear()
    mockState.statSyncMock.mockClear()
    mockState.showOpenDialogMock.mockReset()
    mockState.showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: [mockState.selectedPath] })
    importServiceMock.importFromFile.mockClear()
    registerDataImportHandlers()
  })

  it('data:pickImportFile issues a tokenized import selection', async () => {
    const handler = handlerMap.get('data:pickImportFile')
    expect(handler).toBeDefined()

    const result = await handler!({}) as {
      success: boolean
      token?: string
      fileName?: string
      extension?: string
    }

    expect(result.success).toBe(true)
    expect(result.token).toBe(mockState.importToken)
    expect(result.fileName).toBe('students.xlsx')
    expect(result.extension).toBe('.xlsx')
  })

  it('data:import rejects unknown or expired tokens', async () => {
    const handler = handlerMap.get('data:import')
    expect(handler).toBeDefined()

    const result = await handler!(
      {},
      '22222222-2222-4222-8222-222222222222',
      { entityType: 'STUDENT', mappings: [] },
      21
    ) as { success: boolean; errors?: Array<{ message: string }> }

    expect(result.success).toBe(false)
    expect(result.errors?.[0]?.message).toContain('invalid or has expired')
    expect(importServiceMock.importFromFile).not.toHaveBeenCalled()
  })

  it('data:import rejects renderer actor mismatch in import audit trail', async () => {
    const pickHandler = handlerMap.get('data:pickImportFile')
    const importHandler = handlerMap.get('data:import')
    expect(pickHandler).toBeDefined()
    expect(importHandler).toBeDefined()

    const picked = await pickHandler!({}) as { token?: string }
    const result = await importHandler!(
      {},
      picked.token,
      { entityType: 'STUDENT', mappings: [] },
      3
    ) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
    expect(importServiceMock.importFromFile).not.toHaveBeenCalled()
  })

  it('data:import enforces admin role', async () => {
    sessionRole = 'TEACHER'
    const handler = handlerMap.get('data:import')!
    const result = await handler({}, mockState.importToken, { entityType: 'STUDENT', mappings: [] }, 21) as {
      success: boolean
      error?: string
    }

    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
    expect(importServiceMock.importFromFile).not.toHaveBeenCalled()
  })

  it('data:import reads only token-selected file paths', async () => {
    const pickHandler = handlerMap.get('data:pickImportFile')
    const importHandler = handlerMap.get('data:import')
    expect(pickHandler).toBeDefined()
    expect(importHandler).toBeDefined()

    const picked = await pickHandler!({}) as { token?: string }
    const result = await importHandler!(
      {},
      picked.token,
      { entityType: 'STUDENT', mappings: [] },
      21
    ) as { success: boolean }

    expect(result.success).toBe(true)
    const firstReadArg = mockState.readFileMock.mock.calls[0]?.[0]
    expect(String(firstReadArg)).toContain('students.xlsx')
    expect(importServiceMock.importFromFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      'students.xlsx',
      expect.objectContaining({ entityType: 'STUDENT' }),
      21
    )
  })

  // ── data:pickImportFile edge cases ────────────────────────────
  it('data:pickImportFile returns cancelled when dialog cancelled', async () => {
    mockState.showOpenDialogMock.mockResolvedValueOnce({ canceled: true, filePaths: [] })
    const handler = handlerMap.get('data:pickImportFile')!
    const result = await handler({}) as { success: boolean; cancelled: boolean }
    expect(result.success).toBe(false)
    expect(result.cancelled).toBe(true)
  })

  it('data:pickImportFile rejects invalid extension', async () => {
    mockState.showOpenDialogMock.mockResolvedValueOnce({ canceled: false, filePaths: ['C:/tmp/data.txt'] })
    const handler = handlerMap.get('data:pickImportFile')!
    const result = await handler({}) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid file type')
  })

  // ── data:getTemplate ──────────────────────────────────────────
  it('data:getTemplate returns template for entity type', async () => {
    importServiceMock.getImportTemplate.mockReturnValueOnce([{ field: 'name', required: true }])
    const handler = handlerMap.get('data:getTemplate')!
    const result = await handler({}, 'STUDENT')
    expect(result).toEqual([{ field: 'name', required: true }])
  })

  // ── data:downloadTemplate ─────────────────────────────────────
  it('data:downloadTemplate saves file on success', async () => {
    const handler = handlerMap.get('data:downloadTemplate')!
    const result = await handler({}, 'STUDENT') as { success: boolean; filePath?: string }
    expect(result.success).toBe(true)
    expect(result.filePath).toBe('C:/tmp/template.xlsx')
  })

  it('data:downloadTemplate returns error when user cancels', async () => {
    mockState.showSaveDialogMock.mockResolvedValueOnce({ filePath: undefined })
    const handler = handlerMap.get('data:downloadTemplate')!
    const result = await handler({}, 'STUDENT') as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toBe('Cancelled')
  })

  it('data:downloadTemplate returns error on generation failure', async () => {
    importServiceMock.generateTemplateFile.mockRejectedValueOnce(new Error('Generation failed'))
    const handler = handlerMap.get('data:downloadTemplate')!
    const result = await handler({}, 'STUDENT') as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('Generation failed')
  })

  // ── data:import with config normalization ─────────────────────
  it('data:import normalizes config with optional fields', async () => {
    const pickHandler = handlerMap.get('data:pickImportFile')!
    const importHandler = handlerMap.get('data:import')!

    const picked = await pickHandler({}) as { token: string }
    await importHandler(
      {},
      picked.token,
      {
        entityType: 'STUDENT',
        mappings: [{ sourceColumn: 'Name', targetField: 'first_name', required: true }],
        skipDuplicates: true,
        duplicateKey: 'admission_number',
      },
      21
    )
    expect(importServiceMock.importFromFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      'students.xlsx',
      expect.objectContaining({
        skipDuplicates: true,
        duplicateKey: 'admission_number',
        mappings: [{ sourceColumn: 'Name', targetField: 'first_name', required: true }],
      }),
      21
    )
  })

  // ── data:import token is single-use ───────────────────────────
  it('data:import deletes token after use (single-use)', async () => {
    const pickHandler = handlerMap.get('data:pickImportFile')!
    const importHandler = handlerMap.get('data:import')!

    const picked = await pickHandler({}) as { token: string }
    await importHandler({}, picked.token, { entityType: 'STUDENT', mappings: [] }, 21)

    // Second use should fail
    const result2 = await importHandler({}, picked.token, { entityType: 'STUDENT', mappings: [] }, 21) as { success: boolean; errors?: Array<{ message: string }> }
    expect(result2.success).toBe(false)
    expect(result2.errors?.[0]?.message).toContain('invalid or has expired')
  })

  it('data:import returns validation failure when file read throws', async () => {
    mockState.readFileMock.mockRejectedValueOnce(new Error('ENOENT: no such file'))
    const pickHandler = handlerMap.get('data:pickImportFile')!
    const importHandler = handlerMap.get('data:import')!
    const picked = await pickHandler({}) as { token: string }
    const result = await importHandler({}, picked.token, { entityType: 'STUDENT', mappings: [] }, 21) as { success: boolean; errors?: Array<{ message: string }> }
    expect(result.success).toBe(false)
    expect(result.errors?.[0]?.message).toContain('ENOENT')
  })
})
