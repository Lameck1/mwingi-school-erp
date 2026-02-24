import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>
type UpdateEventHandler = (payload?: unknown) => void

const ipcHandlers = new Map<string, IpcHandler>()
const autoUpdaterListeners: Record<string, UpdateEventHandler> = {}
const rendererSendMock = vi.fn()
let sessionRole = 'ADMIN'
let sessionUserId = 11

const autoUpdaterMock = {
  logger: undefined as unknown,
  autoDownload: false,
  autoInstallOnAppQuit: false,
  on: vi.fn((event: string, handler: UpdateEventHandler) => {
    autoUpdaterListeners[event] = handler
  }),
  checkForUpdates: vi.fn(async () => {}),
  downloadUpdate: vi.fn(async () => {}),
  quitAndInstall: vi.fn()
}

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn(async () => JSON.stringify({
      user: {
        id: sessionUserId,
        username: 'admin',
        role: sessionRole,
        full_name: 'Admin User',
        email: 'admin@example.com',
        is_active: 1,
        created_at: new Date().toISOString()
      },
      lastActivity: Date.now()
    })),
    setPassword: vi.fn(),
    deletePassword: vi.fn()
  }
}))

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    transports: { file: { level: 'info' } }
  }
}))

vi.mock('electron-updater', () => ({
  autoUpdater: autoUpdaterMock
}))

vi.mock('../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      ipcHandlers.set(channel, handler)
    }),
    removeHandler: vi.fn()
  },
  dialog: {
    showMessageBox: vi.fn(async () => ({ response: 1 })),
    showErrorBox: vi.fn()
  }
}))

describe('auto updater IPC role guards and error paths', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
    sessionRole = 'ADMIN'
    sessionUserId = 11
    ipcHandlers.clear()
    rendererSendMock.mockReset()
    autoUpdaterMock.on.mockClear()
    autoUpdaterMock.checkForUpdates.mockClear()
    autoUpdaterMock.downloadUpdate.mockClear()
    autoUpdaterMock.quitAndInstall.mockClear()
    Object.keys(autoUpdaterListeners).forEach((key) => {
      delete autoUpdaterListeners[key]
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('denies updater channels for unauthorized roles', async () => {
    sessionRole = 'TEACHER'
    const { registerDisabledUpdateHandlers } = await import('../autoUpdater')
    registerDisabledUpdateHandlers('disabled in test')

    const check = await ipcHandlers.get('check-for-updates')!({})
    expect(check).toEqual(expect.objectContaining({
      success: false,
      error: expect.stringContaining('Unauthorized')
    }))
  })

  it('registerDisabledUpdateHandlers returns explicit non-success for authorized roles', async () => {
    sessionRole = 'ADMIN'
    const { registerDisabledUpdateHandlers } = await import('../autoUpdater')
    registerDisabledUpdateHandlers('disabled in test')

    const check = await ipcHandlers.get('check-for-updates')!({})
    const download = await ipcHandlers.get('download-update')!({})
    const install = await ipcHandlers.get('install-update')!({})

    expect(check).toEqual({ success: false, error: 'disabled in test' })
    expect(download).toEqual({ success: false, error: 'disabled in test' })
    expect(install).toEqual({ success: false, error: 'disabled in test' })
  })

  it('wires check/download/install IPC and reports download failure', async () => {
    const { AutoUpdateManager } = await import('../autoUpdater')
    const windowMock = {
      isDestroyed: vi.fn(() => false),
      webContents: {
        send: rendererSendMock
      }
    }

    const manager = new AutoUpdateManager(windowMock as never)
    expect(manager).toBeDefined()

    expect(ipcHandlers.has('check-for-updates')).toBe(true)
    expect(ipcHandlers.has('download-update')).toBe(true)
    expect(ipcHandlers.has('install-update')).toBe(true)

    const checkResult = await ipcHandlers.get('check-for-updates')!({})
    expect(checkResult).toEqual({ success: true })
    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(1)

    const updateAvailable = autoUpdaterListeners['update-available']
    expect(updateAvailable).toBeDefined()
    updateAvailable!({ version: '1.2.3', releaseNotes: 'patch' })

    autoUpdaterMock.downloadUpdate.mockRejectedValueOnce(new Error('network'))
    const downloadResult = await ipcHandlers.get('download-update')!({})
    expect(downloadResult).toEqual({ success: false, error: 'Download failed' })
    expect(autoUpdaterMock.downloadUpdate).toHaveBeenCalledTimes(1)
    expect(rendererSendMock).toHaveBeenCalledWith(
      'update-status',
      expect.objectContaining({ status: 'error', error: 'Download failed' })
    )

    const installResult = await ipcHandlers.get('install-update')!({})
    expect(installResult).toEqual({ success: true, message: 'Update install initiated' })
    expect(autoUpdaterMock.quitAndInstall).toHaveBeenCalledWith(false, true)
  })
})
