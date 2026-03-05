// @vitest-environment jsdom
/**
 * Tests for useLayoutModel hook.
 *
 * Covers: initial state, menu toggling, logout, sidebar state, theme, and
 * expanded menu sync from pathname.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────

const mockNavigate = vi.fn()
const mockLocation = { pathname: '/', search: '' }

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
}))

const mockLogout = vi.fn()
vi.mock('../../../stores', () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ user: { id: 1, username: 'admin', role: 'ADMIN' }, logout: mockLogout }),
}))

vi.mock('../../../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'dark' as const, toggleTheme: vi.fn() }),
}))

const mockShowToast = vi.fn()
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

vi.mock('../../../hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => true,
}))

vi.mock('../useLoadGlobalSettings', () => ({
  useLoadGlobalSettings: () => ({ schoolName: 'Test School', currentAcademicYearName: '2026' }),
}))

vi.mock('../useElectronLayoutEvents', () => ({
  useElectronLayoutEvents: vi.fn(),
}))

vi.mock('../nav-items', () => ({
  navItems: [
    { path: '/', label: 'Dashboard', icon: () => null },
    {
      label: 'Students',
      icon: () => null,
      children: [
        { path: '/students', label: 'Students', icon: () => null },
        { path: '/students/promotions', label: 'Promotions', icon: () => null },
      ],
    },
  ],
  adminItems: [
    { path: '/settings', label: 'Settings', icon: () => null },
  ],
}))

vi.mock('../nav-utils', () => ({
  findMenuChainForPath: (pathname: string) => {
    if (pathname === '/students' || pathname === '/students/promotions') { return ['Students'] }
    if (pathname === '/') { return [] }
    return null
  },
}))

beforeEach(() => {
  mockNavigate.mockClear()
  mockLogout.mockClear()
  mockLocation.pathname = '/'
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── Lazy import ──────────────────────────────────────────────

const { useLayoutModel } = await import('../useLayoutModel')

describe('useLayoutModel', () => {
  it('provides user from auth store', () => {
    const { result } = renderHook(() => useLayoutModel())
    expect(result.current.user).toEqual(expect.objectContaining({ id: 1 }))
  })

  it('provides schoolName from global settings', () => {
    const { result } = renderHook(() => useLayoutModel())
    expect(result.current.schoolName).toBe('Test School')
  })

  it('provides currentAcademicYearName', () => {
    const { result } = renderHook(() => useLayoutModel())
    expect(result.current.currentAcademicYearName).toBe('2026')
  })

  it('reports online status', () => {
    const { result } = renderHook(() => useLayoutModel())
    expect(result.current.isOnline).toBe(true)
  })

  it('starts with sidebar closed', () => {
    const { result } = renderHook(() => useLayoutModel())
    expect(result.current.isSidebarOpen).toBe(false)
  })

  it('toggles sidebar open/close', () => {
    const { result } = renderHook(() => useLayoutModel())

    act(() => result.current.setIsSidebarOpen(true))
    expect(result.current.isSidebarOpen).toBe(true)

    act(() => result.current.setIsSidebarOpen(false))
    expect(result.current.isSidebarOpen).toBe(false)
  })

  describe('toggleMenu', () => {
    it('expands a menu by adding its label', () => {
      mockLocation.pathname = '/'
      const { result } = renderHook(() => useLayoutModel())

      act(() => result.current.toggleMenu('Students', ['Settings']))
      expect(result.current.expandedMenus).toContain('Students')
    })

    it('collapses a menu by removing its label', () => {
      mockLocation.pathname = '/students'
      const { result } = renderHook(() => useLayoutModel())

      // Initially Students is expanded due to pathname
      expect(result.current.expandedMenus).toContain('Students')

      act(() => result.current.toggleMenu('Students', []))
      expect(result.current.expandedMenus).not.toContain('Students')
    })

    it('collapses sibling menus when expanding', () => {
      mockLocation.pathname = '/'
      const { result } = renderHook(() => useLayoutModel())

      // Expand Students
      act(() => result.current.toggleMenu('Students', ['Settings']))
      expect(result.current.expandedMenus).toContain('Students')

      // Expand Settings — should collapse Students (sibling)
      act(() => result.current.toggleMenu('Settings', ['Students']))
      expect(result.current.expandedMenus).toContain('Settings')
      expect(result.current.expandedMenus).not.toContain('Students')
    })
  })

  describe('handleLogout', () => {
    it('calls logout and navigates to /login', () => {
      const { result } = renderHook(() => useLayoutModel())

      act(() => result.current.handleLogout())

      expect(mockLogout).toHaveBeenCalledTimes(1)
      expect(mockNavigate).toHaveBeenCalledWith('/login')
    })
  })

  it('provides current pathname', () => {
    mockLocation.pathname = '/finance'
    const { result } = renderHook(() => useLayoutModel())
    expect(result.current.pathname).toBe('/finance')
  })

  it('provides theme', () => {
    const { result } = renderHook(() => useLayoutModel())
    expect(result.current.theme).toBe('dark')
  })

  describe('expanded menus from path', () => {
    it('auto-expands Students for /students path', () => {
      mockLocation.pathname = '/students'
      const { result } = renderHook(() => useLayoutModel())
      expect(result.current.expandedMenus).toContain('Students')
    })

    it('auto-expands Students for /students/promotions path', () => {
      mockLocation.pathname = '/students/promotions'
      const { result } = renderHook(() => useLayoutModel())
      expect(result.current.expandedMenus).toContain('Students')
    })

    it('returns empty for root path', () => {
      mockLocation.pathname = '/'
      const { result } = renderHook(() => useLayoutModel())
      expect(result.current.expandedMenus).toEqual([])
    })
  })
})
