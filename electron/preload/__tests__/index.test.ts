/**
 * Tests for electron/preload/index.ts
 *
 * This file is the bridge orchestrator that wires up all API modules,
 * sets role-aware factories, and exposes the namespaced API via contextBridge.
 *
 * We mock the dependencies and verify the exposed API shape.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock all dependencies before importing the module under test
// ---------------------------------------------------------------------------
const mockExposeInMainWorld = vi.fn()

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (...args: unknown[]) => mockExposeInMainWorld(...args),
  },
  ipcRenderer: {
    invoke: vi.fn().mockResolvedValue({ success: true }),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}))

// We don't need to mock individual API modules since they just call ipcRenderer
// which is already mocked. Let the real factories run so we can verify the shape.

describe('preload/index.ts', () => {
  // Module is cached after first import, so we import once and capture the API.
  let api: Record<string, any>

  beforeEach(async () => {
    // Don't clear mockExposeInMainWorld — the module only executes once.
    // Instead, ensure we always have the exposed API reference.
    if (!api) {
      await import('../index')
      const [[, exposedApi]] = mockExposeInMainWorld.mock.calls
      api = exposedApi
    }
  })

  it('exposes electronAPI via contextBridge.exposeInMainWorld', () => {
    expect(mockExposeInMainWorld).toHaveBeenCalledWith('electronAPI', expect.any(Object))
  })

  it('exposed API has all expected domain namespaces', () => {
    expect(api).toHaveProperty('auth')
    expect(api).toHaveProperty('settings')
    expect(api).toHaveProperty('academic')
    expect(api).toHaveProperty('finance')
    expect(api).toHaveProperty('students')
    expect(api).toHaveProperty('staff')
    expect(api).toHaveProperty('operations')
    expect(api).toHaveProperty('reports')
    expect(api).toHaveProperty('communications')
    expect(api).toHaveProperty('system')
    expect(api).toHaveProperty('menuEvents')
  })

  it('auth namespace has login, getSession, setSession, clearSession', () => {
    expect(typeof api.auth.login).toBe('function')
    expect(typeof api.auth.getSession).toBe('function')
    expect(typeof api.auth.setSession).toBe('function')
    expect(typeof api.auth.clearSession).toBe('function')
  })

  it('finance namespace has methods (runtime guarded)', () => {
    expect(typeof api.finance.getFeeCategories).toBe('function')
  })

  it('menuEvents namespace has event listeners', () => {
    expect(typeof api.menuEvents.onNavigate).toBe('function')
    expect(typeof api.menuEvents.onOpenImportDialog).toBe('function')
    expect(typeof api.menuEvents.onTriggerPrint).toBe('function')
    expect(typeof api.menuEvents.onBackupDatabase).toBe('function')
  })

  it('system namespace has backup and user methods', () => {
    expect(typeof api.system.createBackup).toBe('function')
    expect(typeof api.system.getUsers).toBe('function')
  })
})

describe('preload/index.ts auth role integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset modules so we get fresh imports
    vi.resetModules()
  })

  it('login sets current role on success', async () => {
    const { ipcRenderer } = await import('electron')
    vi.mocked(ipcRenderer.invoke).mockResolvedValue({
      success: true,
      user: { role: 'ADMIN' },
    })

    await import('../index')
    const [[, api]] = mockExposeInMainWorld.mock.calls

    await api.auth.login('admin', 'password')

    const { getCurrentRole } = await import('../roleFilter')
    expect(getCurrentRole()).toBe('ADMIN')
  })

  it('login does not change role on failure', async () => {
    const { ipcRenderer } = await import('electron')
    vi.mocked(ipcRenderer.invoke).mockResolvedValue({
      success: false,
      error: 'Invalid credentials',
    })

    await import('../index')
    const [[, api]] = mockExposeInMainWorld.mock.calls

    await api.auth.login('bad', 'bad')

    // Role should remain the default (AUDITOR since that's the fallback)
    const { getCurrentRole } = await import('../roleFilter')
    expect(getCurrentRole()).toBe('AUDITOR')
  })

  it('clearSession resets role to AUDITOR', async () => {
    const { ipcRenderer } = await import('electron')
    vi.mocked(ipcRenderer.invoke).mockResolvedValue({ success: true })

    await import('../index')
    const [[, api]] = mockExposeInMainWorld.mock.calls

    await api.auth.clearSession()

    const { getCurrentRole } = await import('../roleFilter')
    expect(getCurrentRole()).toBe('AUDITOR')
  })

  it('getSession sets role from session', async () => {
    const { ipcRenderer } = await import('electron')
    vi.mocked(ipcRenderer.invoke).mockResolvedValue({
      user: { role: 'TEACHER' },
    })

    await import('../index')
    const [[, api]] = mockExposeInMainWorld.mock.calls

    await api.auth.getSession()

    const { getCurrentRole } = await import('../roleFilter')
    expect(getCurrentRole()).toBe('TEACHER')
  })

  it('getSession with null session falls back to AUDITOR', async () => {
    const { ipcRenderer } = await import('electron')
    vi.mocked(ipcRenderer.invoke).mockResolvedValue(null)

    await import('../index')
    const [[, api]] = mockExposeInMainWorld.mock.calls

    await api.auth.getSession()

    const { getCurrentRole } = await import('../roleFilter')
    expect(getCurrentRole()).toBe('AUDITOR')
  })

  it('setSession sets role from provided session', async () => {
    const { ipcRenderer } = await import('electron')
    vi.mocked(ipcRenderer.invoke).mockResolvedValue({ success: true })

    await import('../index')
    const [[, api]] = mockExposeInMainWorld.mock.calls

    await api.auth.setSession({ user: { role: 'PRINCIPAL' } })

    const { getCurrentRole } = await import('../roleFilter')
    expect(getCurrentRole()).toBe('PRINCIPAL')
  })
})
