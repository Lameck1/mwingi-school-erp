/**
 * Additional coverage tests for import-handlers.ts
 * Targets: file size validation (line 92-94), not-a-file check (line 78),
 *          data:import re-validates extension/size on token use (lines 186-192),
 *          dialog error catch, empty filePaths, config normalization without optional fields,
 *          data:downloadTemplate non-Error throw
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSessionCache } from '../../../security/session'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()
let sessionUserId = 21
let sessionRole = 'ADMIN'

const { mockState, importServiceMock } = vi.hoisted(() => ({
  mockState: {
    importToken: 'aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee',
    readFileMock: vi.fn(async (..._args: any[]) => Buffer.from('id,name\n1,Test')),
    statMock: vi.fn(async (..._args: any[]) => ({ isFile: () => true as boolean, size: 120 })),
    showOpenDialogMock: vi.fn(async (..._args: any[]) => ({ canceled: false, filePaths: ['C:/tmp/data.csv'] })),
    showSaveDialogMock: vi.fn(async (..._args: any[]) => ({ filePath: 'C:/tmp/out.xlsx' })),
    writeFileMock: vi.fn(async (..._args: any[]) => {}),
    pathExtnameMock: null as (((p: string) => string) | null),
  },
  importServiceMock: {
    importFromFile: vi.fn(() => ({ success: true, totalRows: 1, imported: 1, skipped: 0, errors: [] })),
    getImportTemplate: vi.fn(() => []),
    generateTemplateFile: vi.fn(async () => Buffer.from('xlsx')),
  }
}))

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn(async () => JSON.stringify({
      user: { id: sessionUserId, username: 'admin', role: sessionRole, full_name: 'Admin', email: null, is_active: 1, last_login: null, created_at: new Date().toISOString() },
      lastActivity: Date.now()
    })),
    setPassword: vi.fn().mockResolvedValue(null),
    deletePassword: vi.fn().mockResolvedValue(true),
  }
}))

vi.mock('node:crypto', () => ({ randomUUID: vi.fn(() => mockState.importToken) }))

vi.mock('node:path', async (importOriginal) => {
  const actual = await importOriginal() as any
  return {
    ...actual,
    extname: (p: string) => {
      if (mockState.pathExtnameMock) {
        const fn = mockState.pathExtnameMock
        mockState.pathExtnameMock = null
        return fn(p)
      }
      return actual.extname(p)
    }
  }
})

vi.mock('node:fs/promises', () => ({
  stat: (...args: unknown[]) => mockState.statMock(...args),
  readFile: (...args: unknown[]) => mockState.readFileMock(...args),
  writeFile: (...args: unknown[]) => mockState.writeFileMock(...args),
}))

vi.mock('../../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => handlerMap.set(channel, handler)),
    removeHandler: vi.fn(),
  },
  BrowserWindow: { fromWebContents: vi.fn(() => ({})) },
  dialog: {
    showOpenDialog: (...args: unknown[]) => mockState.showOpenDialogMock(...args),
    showSaveDialog: (...args: unknown[]) => mockState.showSaveDialogMock(...args),
  }
}))

vi.mock('../../../services/data/DataImportService', () => ({
  dataImportService: importServiceMock
}))

import { registerDataImportHandlers } from '../import-handlers'

describe('import-handlers coverage expansion', () => {
  beforeEach(() => {
    clearSessionCache()
    handlerMap.clear()
    sessionUserId = 21
    sessionRole = 'ADMIN'
    vi.clearAllMocks()
    mockState.statMock.mockResolvedValue({ isFile: () => true, size: 120 })
    mockState.showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: ['C:/tmp/data.csv'] })
    mockState.pathExtnameMock = null
    registerDataImportHandlers()
  })

  // ─── pickImportFile: file too large ─────────────────────
  it('pickImportFile rejects file exceeding 25MB', async () => {
    mockState.statMock.mockResolvedValueOnce({ isFile: () => true, size: 30 * 1024 * 1024 })
    const handler = handlerMap.get('data:pickImportFile')!
    const result = await handler({}) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('File too large')
  })

  // ─── pickImportFile: not a file ─────────────────────────
  it('pickImportFile rejects non-file path', async () => {
    mockState.statMock.mockResolvedValueOnce({ isFile: () => false, size: 100 })
    const handler = handlerMap.get('data:pickImportFile')!
    const result = await handler({}) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('not a file')
  })

  // ─── pickImportFile: empty filePaths ────────────────────
  it('pickImportFile returns cancelled when filePaths is empty', async () => {
    mockState.showOpenDialogMock.mockResolvedValueOnce({ canceled: false, filePaths: [] })
    const handler = handlerMap.get('data:pickImportFile')!
    const result = await handler({}) as { success: boolean; cancelled?: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('No file selected')
  })

  // ─── pickImportFile: dialog throws ──────────────────────
  it('pickImportFile returns error on dialog failure', async () => {
    mockState.showOpenDialogMock.mockRejectedValueOnce(new Error('Dialog crash'))
    const handler = handlerMap.get('data:pickImportFile')!
    const result = await handler({}) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toBe('Dialog crash')
  })

  it('pickImportFile returns generic error on non-Error throw', async () => {
    mockState.showOpenDialogMock.mockRejectedValueOnce('some string')
    const handler = handlerMap.get('data:pickImportFile')!
    const result = await handler({}) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toBe('Unable to open import file picker')
  })

  // ─── data:import readFile failure ──────────────────────
  it('data:import returns error when file read fails', async () => {
    const pickHandler = handlerMap.get('data:pickImportFile')!
    const picked = await pickHandler({}) as { token: string }

    mockState.readFileMock.mockRejectedValueOnce(new Error('ENOENT: no such file'))
    const importHandler = handlerMap.get('data:import')!
    const result = await importHandler({}, picked.token, { entityType: 'STUDENT', mappings: [] }, 21) as { success: boolean; errors?: Array<{ message: string }> }
    expect(result.success).toBe(false)
    expect(result.errors?.[0]?.message).toContain('ENOENT')
  })

  // ─── data:import file size re-validation ────────────────
  it('data:import rejects if file grew too large after token issue', async () => {
    const pickHandler = handlerMap.get('data:pickImportFile')!
    const picked = await pickHandler({}) as { token: string }

    // File grew after pick
    mockState.statMock.mockResolvedValueOnce({ isFile: () => true, size: 30 * 1024 * 1024 })
    const importHandler = handlerMap.get('data:import')!
    const result = await importHandler({}, picked.token, { entityType: 'STUDENT', mappings: [] }, 21) as { success: boolean; errors?: Array<{ message: string }> }
    expect(result.success).toBe(false)
    expect(result.errors?.[0]?.message).toContain('File too large')
  })

  // ─── data:import with undefined legacyId (no mismatch check) ─
  it('data:import succeeds with explicit undefined legacyId', async () => {
    const pickHandler = handlerMap.get('data:pickImportFile')!
    const picked = await pickHandler({}) as { token: string }
    const importHandler = handlerMap.get('data:import')!
    const result = await importHandler({}, picked.token, { entityType: 'STUDENT', mappings: [] }) as { success: boolean }
    expect(result.success).toBe(true)
  })

  // ─── data:import config normalization minimal ───────────
  it('data:import normalizes config without optional fields', async () => {
    const pickHandler = handlerMap.get('data:pickImportFile')!
    const picked = await pickHandler({}) as { token: string }
    const importHandler = handlerMap.get('data:import')!
    await importHandler({}, picked.token, {
      entityType: 'STUDENT',
      mappings: [{ sourceColumn: 'A', targetField: 'first_name' }]
    }, 21)
    expect(importServiceMock.importFromFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.stringContaining('data.csv'),
      expect.objectContaining({ entityType: 'STUDENT', mappings: [{ sourceColumn: 'A', targetField: 'first_name' }] }),
      21
    )
  })

  // ─── data:downloadTemplate non-Error throw ──────────────
  it('data:downloadTemplate returns generic error on non-Error throw', async () => {
    importServiceMock.generateTemplateFile.mockRejectedValueOnce(42)
    const handler = handlerMap.get('data:downloadTemplate')!
    const result = await handler({}, 'STUDENT') as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toBe('Template generation failed')
  })

  // ─── cleanupExpiredImportTokens: expired token deletion (line 30) ──
  it('cleanupExpiredImportTokens deletes expired tokens', async () => {
    const pickHandler = handlerMap.get('data:pickImportFile')!
    // 1. Pick a file → token created with expiresAtMs
    const picked = await pickHandler({}) as { success: boolean; token: string; expiresAtMs: number }
    expect(picked.success).toBe(true)

    // 2. Advance Date.now() past the token's expiry
    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(picked.expiresAtMs + 1000)

    // 3. Call data:import → triggers cleanupExpiredImportTokens which deletes the expired token,
    //    then tries to find it → not found
    const importHandler = handlerMap.get('data:import')!
    const result = await importHandler({}, picked.token, { entityType: 'STUDENT', mappings: [] }, 21) as {
      success: boolean; errors?: Array<{ message: string }>
    }
    expect(result.success).toBe(false)
    expect(result.errors?.[0]?.message).toContain('invalid or has expired')

    dateNowSpy.mockRestore()
  })

  // ─── data:import extension re-validation after pick (line 186) ──
  it('data:import rejects if file extension changed after pick', async () => {
    const pickHandler = handlerMap.get('data:pickImportFile')!
    const picked = await pickHandler({}) as { success: boolean; token: string }
    expect(picked.success).toBe(true)

    // Override path.extname for the next call to return an invalid extension
    mockState.pathExtnameMock = () => '.txt'

    const importHandler = handlerMap.get('data:import')!
    const result = await importHandler({}, picked.token, { entityType: 'STUDENT', mappings: [] }, 21) as {
      success: boolean; errors?: Array<{ message: string }>
    }
    expect(result.success).toBe(false)
    expect(result.errors?.[0]?.message).toContain('Invalid file type')
  })

  // ─── data:import non-Error throw in catch block (line 201) ──
  it('data:import returns generic error on non-Error throw', async () => {
    const pickHandler = handlerMap.get('data:pickImportFile')!
    const picked = await pickHandler({}) as { success: boolean; token: string }
    expect(picked.success).toBe(true)

    // Make stat reject with a non-Error value to trigger the catch block's false branch
    mockState.statMock.mockRejectedValueOnce('string-error-not-Error-instance')

    const importHandler = handlerMap.get('data:import')!
    const result = await importHandler({}, picked.token, { entityType: 'STUDENT', mappings: [] }, 21) as {
      success: boolean; errors?: Array<{ message: string }>
    }
    expect(result.success).toBe(false)
    expect(result.errors?.[0]?.message).toBe('File read error')
  })
})
