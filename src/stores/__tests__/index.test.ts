/**
 * Tests for Zustand stores (useAuthStore & useAppStore).
 *
 * Verifies login, logout, session management, app state actions,
 * and dashboard cache validation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAuthStore, useAppStore } from '../index'
import type { User } from '../../types/electron-api/UserAPI'

let mockApi: {
  auth: Record<string, ReturnType<typeof vi.fn>>
}

const testUser: User = {
  id: 1,
  username: 'admin',
  full_name: 'Admin User',
  email: 'admin@test.com',
  role: 'ADMIN',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  last_login: '',
  updated_at: '',
}

beforeEach(() => {
  mockApi = {
    auth: {
      setSession: vi.fn().mockResolvedValue(void 0),
      clearSession: vi.fn().mockResolvedValue(void 0),
      getSession: vi.fn().mockResolvedValue(null),
    },
  }
  ;(globalThis as Record<string, unknown>).electronAPI = mockApi

  // Reset stores to initial state
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    lastActivity: null,
    isSessionLoaded: false,
  })
  useAppStore.getState().resetAppState()
})

afterEach(() => {
  delete (globalThis as Record<string, unknown>).electronAPI
})

describe('useAuthStore', () => {
  it('starts with no user and not authenticated', () => {
    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.isAuthenticated).toBe(false)
  })

  it('login sets user and isAuthenticated', () => {
    useAuthStore.getState().login(testUser)
    const state = useAuthStore.getState()
    expect(state.user).toEqual(testUser)
    expect(state.isAuthenticated).toBe(true)
    expect(state.lastActivity).toBeTypeOf('number')
    expect(state.isSessionLoaded).toBe(true)
  })

  it('login persists session via electronAPI', () => {
    useAuthStore.getState().login(testUser)
    expect(mockApi.auth.setSession).toHaveBeenCalledWith(
      expect.objectContaining({ user: testUser }),
    )
  })

  it('logout clears user and calls clearSession', () => {
    useAuthStore.getState().login(testUser)
    useAuthStore.getState().logout()
    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.isAuthenticated).toBe(false)
    expect(mockApi.auth.clearSession).toHaveBeenCalled()
  })

  it('logout resets app state', () => {
    useAppStore.getState().setCurrentTerm({ id: 1, term_name: 'Term 1', academic_year_id: 1, start_date: '', end_date: '', is_current: true, created_at: '', updated_at: '' })
    useAuthStore.getState().login(testUser)
    useAuthStore.getState().logout()
    expect(useAppStore.getState().currentTerm).toBeNull()
  })

  it('checkSession returns true for active session', () => {
    useAuthStore.getState().login(testUser)
    expect(useAuthStore.getState().checkSession()).toBe(true)
  })

  it('checkSession returns false when not authenticated', () => {
    expect(useAuthStore.getState().checkSession()).toBe(false)
  })

  it('checkSession expires session after timeout', () => {
    useAuthStore.getState().login(testUser)
    // Set lastActivity far in the past (> 8 hours)
    useAuthStore.setState({ lastActivity: Date.now() - 9 * 60 * 60 * 1000 })
    const result = useAuthStore.getState().checkSession()
    expect(result).toBe(false)
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('touchSession updates lastActivity', () => {
    useAuthStore.getState().login(testUser)
    const firstActivity = useAuthStore.getState().lastActivity!
    // Force enough time difference for the > 60s persist guard
    useAuthStore.setState({ lastActivity: firstActivity - 120_000 })

    useAuthStore.getState().touchSession()
    expect(useAuthStore.getState().lastActivity).toBeGreaterThan(firstActivity - 120_000)
  })

  it('hydrateSession sets isSessionLoaded when no session found', async () => {
    mockApi.auth.getSession.mockResolvedValue(null)
    await useAuthStore.getState().hydrateSession()
    const state = useAuthStore.getState()
    expect(state.isSessionLoaded).toBe(true)
    expect(state.isAuthenticated).toBe(false)
  })

  it('hydrateSession restores valid session', async () => {
    mockApi.auth.getSession.mockResolvedValue({
      user: testUser,
      lastActivity: Date.now() - 1000,
    })
    await useAuthStore.getState().hydrateSession()
    const state = useAuthStore.getState()
    expect(state.user?.username).toBe('admin')
    expect(state.isAuthenticated).toBe(true)
    expect(state.isSessionLoaded).toBe(true)
  })
})

describe('useAppStore', () => {
  it('starts with null state', () => {
    const state = useAppStore.getState()
    expect(state.currentAcademicYear).toBeNull()
    expect(state.currentTerm).toBeNull()
    expect(state.schoolSettings).toBeNull()
    expect(state.dashboardCache).toBeNull()
  })

  it('setCurrentAcademicYear updates state', () => {
    useAppStore.getState().setCurrentAcademicYear({ id: 1, year_name: '2026', start_date: '', end_date: '', is_current: true, created_at: '', updated_at: '' })
    expect(useAppStore.getState().currentAcademicYear?.year_name).toBe('2026')
  })

  it('setCurrentTerm updates state', () => {
    useAppStore.getState().setCurrentTerm({ id: 1, term_name: 'Term 2', academic_year_id: 1, start_date: '', end_date: '', is_current: false, created_at: '', updated_at: '' })
    expect(useAppStore.getState().currentTerm?.term_name).toBe('Term 2')
  })

  it('setDashboardCache adds a timestamp', () => {
    useAppStore.getState().setDashboardCache({
      dashboardData: null,
      feeCollectionData: [],
      feeCategories: [],
      recentActivities: [],
      kpiData: null,
    })
    const cache = useAppStore.getState().dashboardCache
    expect(cache).not.toBeNull()
    expect(cache!.timestamp).toBeTypeOf('number')
  })

  it('isDashboardCacheValid returns false when no cache', () => {
    expect(useAppStore.getState().isDashboardCacheValid()).toBe(false)
  })

  it('isDashboardCacheValid returns true for fresh cache', () => {
    useAppStore.getState().setDashboardCache({
      dashboardData: null,
      feeCollectionData: [],
      feeCategories: [],
      recentActivities: [],
      kpiData: null,
    })
    expect(useAppStore.getState().isDashboardCacheValid()).toBe(true)
  })

  it('resetAppState clears all fields', () => {
    useAppStore.getState().setCurrentTerm({ id: 1, term_name: 'Term 1', academic_year_id: 1, start_date: '', end_date: '', is_current: true, created_at: '', updated_at: '' })
    useAppStore.getState().resetAppState()
    expect(useAppStore.getState().currentTerm).toBeNull()
    expect(useAppStore.getState().currentAcademicYear).toBeNull()
  })

  it('isDashboardCacheValid returns false for expired cache (> 2 min)', () => {
    useAppStore.getState().setDashboardCache({
      dashboardData: null,
      feeCollectionData: [],
      feeCategories: [],
      recentActivities: [],
      kpiData: null,
    })
    // Manually set timestamp to 3 minutes ago
    const cache = useAppStore.getState().dashboardCache!
    useAppStore.setState({ dashboardCache: { ...cache, timestamp: Date.now() - 3 * 60 * 1000 } })
    expect(useAppStore.getState().isDashboardCacheValid()).toBe(false)
  })
})

describe('useAuthStore edge cases', () => {
  it('touchSession does nothing when not authenticated', () => {
    // Not authenticated by default
    useAuthStore.getState().touchSession()
    expect(useAuthStore.getState().lastActivity).toBeNull()
    expect(mockApi.auth.setSession).not.toHaveBeenCalled()
  })

  it('touchSession does not persist when elapsed <= 60s', () => {
    useAuthStore.getState().login(testUser)
    mockApi.auth.setSession.mockClear()
    // lastActivity is just set by login, so elapsed is ~0ms which is <= 60s
    useAuthStore.getState().touchSession()
    expect(useAuthStore.getState().lastActivity).toBeTypeOf('number')
    // setSession should NOT be called because elapsed <= 60_000
    expect(mockApi.auth.setSession).not.toHaveBeenCalled()
  })

  it('hydrateSession returns early when already authenticated', async () => {
    useAuthStore.getState().login(testUser)
    mockApi.auth.getSession.mockClear()
    await useAuthStore.getState().hydrateSession()
    // getSession should not be called since we're already authenticated
    expect(mockApi.auth.getSession).not.toHaveBeenCalled()
    expect(useAuthStore.getState().isSessionLoaded).toBe(true)
  })

  it('hydrateSession handles login happening while waiting for getSession', async () => {
    // Mock getSession to simulate a delayed response during which login occurs
    mockApi.auth.getSession.mockImplementation(async () => {
      // Simulate login happening while we await getSession
      useAuthStore.setState({ isAuthenticated: true, user: testUser, lastActivity: Date.now(), isSessionLoaded: false })
      return { user: testUser, lastActivity: Date.now() }
    })
    await useAuthStore.getState().hydrateSession()
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(useAuthStore.getState().isSessionLoaded).toBe(true)
  })

  it('hydrateSession handles error response object (success: false)', async () => {
    mockApi.auth.getSession.mockResolvedValue({ success: false, error: 'session corrupt' })
    await useAuthStore.getState().hydrateSession()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().isSessionLoaded).toBe(true)
  })

  it('hydrateSession clears expired session', async () => {
    const expiredActivity = Date.now() - 9 * 60 * 60 * 1000 // 9 hours ago
    mockApi.auth.getSession.mockResolvedValue({ user: testUser, lastActivity: expiredActivity })
    await useAuthStore.getState().hydrateSession()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().user).toBeNull()
    expect(mockApi.auth.clearSession).toHaveBeenCalled()
  })

  it('hydrateSession rejects user with no id', async () => {
    const noIdUser = { ...testUser, id: 0 }
    mockApi.auth.getSession.mockResolvedValue({ user: noIdUser, lastActivity: Date.now() })
    await useAuthStore.getState().hydrateSession()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().isSessionLoaded).toBe(true)
  })

  it('login catches setSession error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockApi.auth.setSession.mockRejectedValue(new Error('IPC down'))
    useAuthStore.getState().login(testUser)
    // Wait for the .catch to fire
    await vi.waitFor(() => expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('persist'), expect.any(Error)))
    consoleSpy.mockRestore()
  })

  it('logout catches clearSession error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockApi.auth.clearSession.mockRejectedValue(new Error('IPC down'))
    useAuthStore.getState().login(testUser)
    useAuthStore.getState().logout()
    await vi.waitFor(() => expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('clear'), expect.any(Error)))
    consoleSpy.mockRestore()
  })

  it('hydrateSession with user missing optional fields covers validateUser fallbacks', async () => {
    const sparseUser = { id: 5, username: '', full_name: '', email: '', role: 'ADMIN' as const, is_active: true, created_at: '', last_login: null as unknown as string, updated_at: '' }
    mockApi.auth.getSession.mockResolvedValue({ user: sparseUser, lastActivity: Date.now() - 1000 })
    await useAuthStore.getState().hydrateSession()
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.user!.username).toBe('')
    expect(state.user!.full_name).toBe('')
    expect(state.user!.email).toBe('')
    expect(state.user!.last_login).toBe('')
  })

  it('touchSession with lastActivity: null takes Infinity path', () => {
    useAuthStore.setState({ isAuthenticated: true, user: testUser, lastActivity: null })
    useAuthStore.getState().touchSession()
    expect(useAuthStore.getState().lastActivity).toBeTypeOf('number')
    // lastActivity was null → elapsed = Infinity > 60_000 → setSession called
    expect(mockApi.auth.setSession).toHaveBeenCalled()
  })

  it('touchSession catches setSession rejection', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockApi.auth.setSession.mockRejectedValue(new Error('IPC down'))
    // Set lastActivity far enough in the past to trigger persist
    useAuthStore.setState({ isAuthenticated: true, user: testUser, lastActivity: Date.now() - 120_000 })
    useAuthStore.getState().touchSession()
    await vi.waitFor(() => expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('persist'), expect.any(Error)))
    consoleSpy.mockRestore()
  })

  it('checkSession catches clearSession rejection on expiry', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockApi.auth.clearSession.mockRejectedValue(new Error('IPC down'))
    useAuthStore.setState({ isAuthenticated: true, user: testUser, lastActivity: Date.now() - 9 * 60 * 60 * 1000 })
    const result = useAuthStore.getState().checkSession()
    expect(result).toBe(false)
    await vi.waitFor(() => expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('clear'), expect.any(Error)))
    consoleSpy.mockRestore()
  })

  it('hydrateSession with lastActivity: null in session covers Infinity path', async () => {
    mockApi.auth.getSession.mockResolvedValue({ user: testUser, lastActivity: null })
    await useAuthStore.getState().hydrateSession()
    // lastActivity null → elapsed = Infinity > SESSION_TIMEOUT_MS → session cleared
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(mockApi.auth.clearSession).toHaveBeenCalled()
  })

  it('hydrateSession catches clearSession rejection on expired session', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockApi.auth.clearSession.mockRejectedValue(new Error('IPC down'))
    const expiredActivity = Date.now() - 9 * 60 * 60 * 1000
    mockApi.auth.getSession.mockResolvedValue({ user: testUser, lastActivity: expiredActivity })
    await useAuthStore.getState().hydrateSession()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    await vi.waitFor(() => expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('clear'), expect.any(Error)))
    consoleSpy.mockRestore()
  })
})

describe('useAppStore – setSchoolSettings', () => {
  it('setSchoolSettings updates schoolSettings in store', () => {
    const settings = { id: 1, school_name: 'Mwingi Primary', school_motto: null, address: null, phone: null, email: null, logo_path: null, mpesa_paybill: null, school_type: 'PUBLIC' as const, created_at: '', updated_at: '' }
    useAppStore.getState().setSchoolSettings(settings)
    expect(useAppStore.getState().schoolSettings).toEqual(settings)
  })
})
