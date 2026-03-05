/**
 * Tests for WindowStateManager (windowState.ts).
 *
 * Covers: factory creation, state loading from disk, fallback on missing/corrupt
 * file, display-bounds validation, managing a BrowserWindow (maximize vs
 * setBounds), event listener registration, debounced save, updateState for
 * destroyed windows, and getState returning a copy.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
//  Mocks
// ---------------------------------------------------------------------------
const readFileMock = vi.fn()
const writeFileMock = vi.fn()

vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => readFileMock(...args),
  writeFile: (...args: unknown[]) => writeFileMock(...args),
}))

vi.mock('node:path', () => ({
  join: (...parts: string[]) => parts.join('/'),
}))

const getAllDisplaysMock = vi.fn()

vi.mock('../../electron-env', () => ({
  app: { getPath: () => '/mock/userData' },
  screen: { getAllDisplays: () => getAllDisplaysMock() },
}))

import { WindowStateManager } from '../windowState'

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------
function defaultDisplay(overrides: Partial<{ x: number; y: number; width: number; height: number }> = {}) {
  return {
    bounds: { x: 0, y: 0, width: 1920, height: 1080, ...overrides },
  }
}

function savedState(overrides: Partial<{ x: number; y: number; width: number; height: number; isMaximized: boolean }> = {}) {
  return { x: 100, y: 100, width: 1280, height: 800, isMaximized: false, ...overrides }
}

function createMockWindow(overrides: Record<string, unknown> = {}) {
  const listeners: Record<string, Array<() => void>> = {}
  return {
    getBounds: vi.fn(() => ({ x: 50, y: 50, width: 1000, height: 600 })),
    isMaximized: vi.fn(() => false),
    isDestroyed: vi.fn(() => false),
    maximize: vi.fn(),
    setBounds: vi.fn(),
    on: vi.fn((event: string, cb: () => void) => {
      listeners[event] = listeners[event] ?? []
      listeners[event].push(cb)
    }),
    _listeners: listeners,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
//  Tests
// ---------------------------------------------------------------------------
describe('WindowStateManager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    getAllDisplaysMock.mockReturnValue([defaultDisplay()])
    readFileMock.mockRejectedValue(new Error('ENOENT'))
    // eslint-disable-next-line unicorn/no-useless-undefined
    writeFileMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ========== Factory creation ==========
  describe('create', () => {
    it('returns a WindowStateManager with defaults when no saved file', async () => {
      const mgr = await WindowStateManager.create('main')
      const state = mgr.getState()
      expect(state).toEqual({ x: 0, y: 0, width: 1280, height: 800, isMaximized: false })
    })

    it('uses "main" as default window name', async () => {
      await WindowStateManager.create()
      expect(readFileMock).toHaveBeenCalledWith(
        expect.stringContaining('window-state-main.json'),
        'utf-8',
      )
    })

    it('uses custom window name for state file path', async () => {
      await WindowStateManager.create('settings')
      expect(readFileMock).toHaveBeenCalledWith(
        expect.stringContaining('window-state-settings.json'),
        'utf-8',
      )
    })

    it('loads saved state from disk when valid and within display bounds', async () => {
      const saved = savedState({ x: 100, y: 100, width: 1280, height: 800 })
      readFileMock.mockResolvedValue(JSON.stringify(saved))

      const mgr = await WindowStateManager.create()
      expect(mgr.getState()).toEqual(saved)
    })

    it('falls back to defaults when saved state is outside display bounds', async () => {
      const saved = savedState({ x: 5000, y: 5000 }) // way off-screen
      readFileMock.mockResolvedValue(JSON.stringify(saved))

      const mgr = await WindowStateManager.create()
      expect(mgr.getState()).toEqual({ x: 0, y: 0, width: 1280, height: 800, isMaximized: false })
    })

    it('falls back to defaults when saved file contains invalid JSON', async () => {
      readFileMock.mockResolvedValue('not json{{{')

      const mgr = await WindowStateManager.create()
      expect(mgr.getState()).toEqual({ x: 0, y: 0, width: 1280, height: 800, isMaximized: false })
    })

    it('validates against multiple displays', async () => {
      // Window is on the second monitor at x=1920
      getAllDisplaysMock.mockReturnValue([
        defaultDisplay(),
        defaultDisplay({ x: 1920, y: 0, width: 1920, height: 1080 }),
      ])
      const saved = savedState({ x: 2000, y: 100, width: 1280, height: 800 })
      readFileMock.mockResolvedValue(JSON.stringify(saved))

      const mgr = await WindowStateManager.create()
      expect(mgr.getState()).toEqual(saved)
    })
  })

  // ========== manage ==========
  describe('manage', () => {
    it('maximizes the window when saved state has isMaximized=true', async () => {
      const saved = savedState({ isMaximized: true })
      readFileMock.mockResolvedValue(JSON.stringify(saved))
      getAllDisplaysMock.mockReturnValue([defaultDisplay()])

      const mgr = await WindowStateManager.create()
      const win = createMockWindow()
      mgr.manage(win as never)

      expect(win.maximize).toHaveBeenCalled()
      expect(win.setBounds).not.toHaveBeenCalled()
    })

    it('sets bounds when saved state is not maximized', async () => {
      const saved = savedState({ isMaximized: false })
      readFileMock.mockResolvedValue(JSON.stringify(saved))

      const mgr = await WindowStateManager.create()
      const win = createMockWindow()
      mgr.manage(win as never)

      expect(win.setBounds).toHaveBeenCalledWith({
        x: saved.x,
        y: saved.y,
        width: saved.width,
        height: saved.height,
      })
      expect(win.maximize).not.toHaveBeenCalled()
    })

    it('registers resize, move, maximize, unmaximize, and close listeners', async () => {
      const mgr = await WindowStateManager.create()
      const win = createMockWindow()
      mgr.manage(win as never)

      const events = win.on.mock.calls.map((c: unknown[]) => c[0]) as string[]
      expect(events).toContain('resize')
      expect(events).toContain('move')
      expect(events).toContain('maximize')
      expect(events).toContain('unmaximize')
      expect(events).toContain('close')
    })
  })

  // ========== updateState + saveState (debounce) ==========
  describe('updateState / saveState', () => {
    it('saves bounds to disk after debounce on resize', async () => {
      const mgr = await WindowStateManager.create()
      const win = createMockWindow()
      mgr.manage(win as never)

      // Trigger resize
      win._listeners['resize']![0]()

      // Not saved yet (debounce)
      expect(writeFileMock).not.toHaveBeenCalled()

      // Advance past 500ms debounce
      await vi.advanceTimersByTimeAsync(600)

      expect(writeFileMock).toHaveBeenCalledWith(
        expect.stringContaining('window-state-main.json'),
        expect.any(String),
      )
      // Saved data should match getBounds
      const written = JSON.parse(writeFileMock.mock.calls[0][1] as string)
      expect(written).toMatchObject({ x: 50, y: 50, width: 1000, height: 600, isMaximized: false })
    })

    it('debounces multiple rapid events into a single write', async () => {
      const mgr = await WindowStateManager.create()
      const win = createMockWindow()
      mgr.manage(win as never)

      // Trigger several events quickly
      win._listeners['resize']![0]()
      win._listeners['move']![0]()
      win._listeners['resize']![0]()

      await vi.advanceTimersByTimeAsync(600)

      // Should write only once
      expect(writeFileMock).toHaveBeenCalledTimes(1)
    })

    it('records isMaximized = true but skips bounds update when maximized', async () => {
      const mgr = await WindowStateManager.create()
      const win = createMockWindow()
      win.isMaximized.mockReturnValue(true)
      mgr.manage(win as never)

      win._listeners['maximize']![0]()
      await vi.advanceTimersByTimeAsync(600)

      const written = JSON.parse(writeFileMock.mock.calls[0][1] as string)
      expect(written.isMaximized).toBe(true)
      // Bounds should be the default (0,0,1280,800) since getBounds is not called when maximized
      expect(written.x).toBe(0)
      expect(written.y).toBe(0)
    })

    it('does nothing when window is destroyed', async () => {
      const mgr = await WindowStateManager.create()
      const win = createMockWindow()
      win.isDestroyed.mockReturnValue(true)
      mgr.manage(win as never)

      win._listeners['resize']![0]()
      await vi.advanceTimersByTimeAsync(600)

      expect(writeFileMock).not.toHaveBeenCalled()
    })

    it('logs error when writeFile fails', async () => {
      writeFileMock.mockRejectedValue(new Error('disk full'))
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const mgr = await WindowStateManager.create()
      const win = createMockWindow()
      mgr.manage(win as never)

      win._listeners['resize']![0]()
      await vi.advanceTimersByTimeAsync(600)

      // Let the rejected promise propagate
      await vi.advanceTimersByTimeAsync(0)

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to save window state:',
        expect.any(Error),
      )
      consoleErrorSpy.mockRestore()
    })
  })

  // ========== getState ==========
  describe('getState', () => {
    it('returns a copy that is not the same reference', async () => {
      const mgr = await WindowStateManager.create()
      const a = mgr.getState()
      const b = mgr.getState()
      expect(a).toEqual(b)
      expect(a).not.toBe(b)
    })
  })

  // ========== unmaximize event ==========
  describe('unmaximize event', () => {
    it('captures bounds on unmaximize and saves state', async () => {
      const mgr = await WindowStateManager.create()
      const win = createMockWindow()
      win.isMaximized.mockReturnValue(false)
      win.getBounds.mockReturnValue({ x: 200, y: 100, width: 1024, height: 768 })
      mgr.manage(win as never)

      // Trigger unmaximize event
      win._listeners['unmaximize']![0]()
      await vi.advanceTimersByTimeAsync(600)

      const written = JSON.parse(writeFileMock.mock.calls[0][1] as string)
      expect(written.isMaximized).toBe(false)
      expect(written.x).toBe(200)
      expect(written.y).toBe(100)
      expect(written.width).toBe(1024)
      expect(written.height).toBe(768)
    })
  })

  // ========== close event ==========
  describe('close event', () => {
    it('persists state on window close', async () => {
      const mgr = await WindowStateManager.create()
      const win = createMockWindow()
      win.isMaximized.mockReturnValue(false)
      mgr.manage(win as never)

      win._listeners['close']![0]()
      await vi.advanceTimersByTimeAsync(600)

      expect(writeFileMock).toHaveBeenCalled()
    })
  })
})
