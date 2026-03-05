// @vitest-environment jsdom
/**
 * Tests for useElectronLayoutEvents hook.
 *
 * Covers: subscription to all menu events, correct callbacks, cleanup on unmount,
 * and various update status branches.
 */
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────

vi.mock('../../../utils/print', () => ({
  printCurrentView: vi.fn(),
}))

vi.mock('../../../utils/ipc', () => ({
  unwrapIPCResult: <T,>(value: T) => {
    if (value && typeof value === 'object' && 'success' in (value as any) && !(value as any).success) {
      throw new Error((value as any).error || 'Failed')
    }
    return value
  },
}))

// Track subscriptions so we can invoke callbacks and test cleanup
type Callback = (...args: any[]) => void
let subscriptions: Record<string, { cb: Callback; unsub: ReturnType<typeof vi.fn> }>

function buildElectronAPI() {
  subscriptions = {}

  const makeSubscriber = (name: string) => {
    const unsub = vi.fn()
    return vi.fn((cb: Callback) => {
      subscriptions[name] = { cb, unsub }
      return unsub
    })
  }

  return {
    menuEvents: {
      onNavigate: makeSubscriber('navigate'),
      onTriggerPrint: makeSubscriber('print'),
      onOpenImportDialog: makeSubscriber('import'),
      onBackupDatabase: makeSubscriber('backup'),
      onCheckForUpdates: makeSubscriber('checkUpdates'),
      onUpdateStatus: makeSubscriber('updateStatus'),
      onDatabaseError: makeSubscriber('dbError'),
    },
    system: {
      createBackupTo: vi.fn().mockResolvedValue({ success: true }),
      checkForUpdates: vi.fn().mockResolvedValue({ success: true }),
    },
  }
}

let mockApi: ReturnType<typeof buildElectronAPI>

beforeEach(() => {
  mockApi = buildElectronAPI()
  ;(globalThis as any).electronAPI = mockApi
})

afterEach(() => {
  vi.restoreAllMocks()
  delete (globalThis as any).electronAPI
})

// ── Lazy import ──────────────────────────────────────────────

const { useElectronLayoutEvents } = await import('../useElectronLayoutEvents')

describe('useElectronLayoutEvents', () => {
  // ── Subscription lifecycle ─────────────────────────────

  it('subscribes to all 7 events on mount', () => {
    const navigate = vi.fn()
    const showToast = vi.fn()

    renderHook(() => useElectronLayoutEvents(navigate, showToast))

    expect(mockApi.menuEvents.onNavigate).toHaveBeenCalledTimes(1)
    expect(mockApi.menuEvents.onTriggerPrint).toHaveBeenCalledTimes(1)
    expect(mockApi.menuEvents.onOpenImportDialog).toHaveBeenCalledTimes(1)
    expect(mockApi.menuEvents.onBackupDatabase).toHaveBeenCalledTimes(1)
    expect(mockApi.menuEvents.onCheckForUpdates).toHaveBeenCalledTimes(1)
    expect(mockApi.menuEvents.onUpdateStatus).toHaveBeenCalledTimes(1)
    expect(mockApi.menuEvents.onDatabaseError).toHaveBeenCalledTimes(1)
  })

  it('unsubscribes from all events on unmount', () => {
    const navigate = vi.fn()
    const showToast = vi.fn()

    const { unmount } = renderHook(() => useElectronLayoutEvents(navigate, showToast))
    unmount()

    for (const key of Object.keys(subscriptions)) {
      expect(subscriptions[key].unsub).toHaveBeenCalledTimes(1)
    }
  })

  // ── Navigate ───────────────────────────────────────────

  it('calls navigate when onNavigate fires', () => {
    const navigate = vi.fn()
    const showToast = vi.fn()

    renderHook(() => useElectronLayoutEvents(navigate, showToast))

    subscriptions.navigate.cb('/students')
    expect(navigate).toHaveBeenCalledWith('/students')
  })

  // ── Print ──────────────────────────────────────────────

  it('calls printCurrentView on print event', async () => {
    const navigate = vi.fn()
    const showToast = vi.fn()

    renderHook(() => useElectronLayoutEvents(navigate, showToast))
    subscriptions.print.cb()

    const { printCurrentView } = await import('../../../utils/print')
    expect(printCurrentView).toHaveBeenCalledWith({ title: 'Page Print Preview' })
  })

  // ── Import ─────────────────────────────────────────────

  it('navigates to /students?import=1 on import event', () => {
    const navigate = vi.fn()
    const showToast = vi.fn()

    renderHook(() => useElectronLayoutEvents(navigate, showToast))
    subscriptions.import.cb()

    expect(navigate).toHaveBeenCalledWith('/students?import=1')
  })

  // ── Backup ─────────────────────────────────────────────

  it('creates backup and toasts success', async () => {
    const navigate = vi.fn()
    const showToast = vi.fn()

    renderHook(() => useElectronLayoutEvents(navigate, showToast))

    subscriptions.backup.cb('/path/to/backup.db')
    // Let the async callback settle
    await vi.waitFor(() => {
      expect(mockApi.system.createBackupTo).toHaveBeenCalledWith('/path/to/backup.db')
    })
    await vi.waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Backup saved successfully', 'success')
    })
  })

  it('toasts error when backup fails', async () => {
    mockApi.system.createBackupTo.mockResolvedValue({ success: false, error: 'Disk full' })
    const navigate = vi.fn()
    const showToast = vi.fn()

    renderHook(() => useElectronLayoutEvents(navigate, showToast))
    subscriptions.backup.cb('/path')

    await vi.waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Disk full', 'error')
    })
  })

  // ── Check for updates ──────────────────────────────────

  it('calls checkForUpdates on event', async () => {
    const navigate = vi.fn()
    const showToast = vi.fn()

    renderHook(() => useElectronLayoutEvents(navigate, showToast))
    subscriptions.checkUpdates.cb()

    await vi.waitFor(() => {
      expect(mockApi.system.checkForUpdates).toHaveBeenCalled()
    })
  })

  it('toasts error when checkForUpdates returns failure', async () => {
    mockApi.system.checkForUpdates.mockResolvedValue({ success: false, error: 'Network' })
    const navigate = vi.fn()
    const showToast = vi.fn()

    renderHook(() => useElectronLayoutEvents(navigate, showToast))
    subscriptions.checkUpdates.cb()

    await vi.waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Network', 'error')
    })
  })

  it('toasts error when checkForUpdates throws', async () => {
    mockApi.system.checkForUpdates.mockRejectedValue(new Error('Boom'))
    const navigate = vi.fn()
    const showToast = vi.fn()

    renderHook(() => useElectronLayoutEvents(navigate, showToast))
    subscriptions.checkUpdates.cb()

    await vi.waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Boom', 'error')
    })
  })

  // ── Update status ──────────────────────────────────────

  describe('onUpdateStatus', () => {
    it.each([
      [{ status: 'available', version: '2.0.0' }, 'Update available: v2.0.0', 'info'],
      [{ status: 'downloading', progress: 42 }, 'Downloading update: 42%', 'info'],
      [{ status: 'downloaded', version: '2.0.0' }, 'Update ready: v2.0.0', 'success'],
      [{ status: 'error', error: 'Fail' }, 'Fail', 'error'],
      [{ status: 'not-available' }, 'No updates available', 'info'],
    ] as const)('handles status=%s', (data, expectedMsg, expectedType) => {
      const navigate = vi.fn()
      const showToast = vi.fn()

      renderHook(() => useElectronLayoutEvents(navigate, showToast))
      subscriptions.updateStatus.cb(data)

      expect(showToast).toHaveBeenCalledWith(expectedMsg, expectedType)
    })
  })

  // ── Database error ─────────────────────────────────────

  it('toasts database error message', () => {
    const navigate = vi.fn()
    const showToast = vi.fn()

    renderHook(() => useElectronLayoutEvents(navigate, showToast))
    subscriptions.dbError.cb('Corruption detected')

    expect(showToast).toHaveBeenCalledWith('Corruption detected', 'error')
  })
})
