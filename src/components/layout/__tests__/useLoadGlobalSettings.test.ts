// @vitest-environment jsdom
/**
 * Tests for useLoadGlobalSettings hook.
 *
 * Covers: successful load of settings/year/term, partial failures,
 * fallback values, and store update calls.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────

const mockSetSchoolSettings = vi.fn()
const mockSetCurrentAcademicYear = vi.fn()
const mockSetCurrentTerm = vi.fn()

let mockStoreState: Record<string, unknown> = {}

vi.mock('../../../stores', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) => selector(mockStoreState),
}))

vi.mock('../../../utils/ipc', () => ({
  unwrapIPCResult: <T,>(value: T, fallback: string) => {
    if (value && typeof value === 'object' && 'success' in (value as any) && !(value as any).success) {
      throw new Error((value as any).error || fallback)
    }
    return value
  },
}))

// ── electronAPI stub ─────────────────────────────────────────

let mockApi: Record<string, Record<string, ReturnType<typeof vi.fn>>>

function buildElectronAPI() {
  return {
    settings: {
      getSettings: vi.fn().mockResolvedValue({ school_name: 'Mwingi School' }),
    },
    academic: {
      getCurrentAcademicYear: vi.fn().mockResolvedValue({ year_name: '2026' }),
      getCurrentTerm: vi.fn().mockResolvedValue({ term_name: 'Term 1' }),
    },
  }
}

beforeEach(() => {
  mockApi = buildElectronAPI()
  ;(globalThis as any).electronAPI = mockApi
  mockSetSchoolSettings.mockClear()
  mockSetCurrentAcademicYear.mockClear()
  mockSetCurrentTerm.mockClear()

  mockStoreState = {
    schoolSettings: null,
    currentAcademicYear: null,
    setSchoolSettings: mockSetSchoolSettings,
    setCurrentAcademicYear: mockSetCurrentAcademicYear,
    setCurrentTerm: mockSetCurrentTerm,
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  delete (globalThis as any).electronAPI
})

// ── Lazy import ──────────────────────────────────────────────

const { useLoadGlobalSettings } = await import('../useLoadGlobalSettings')

describe('useLoadGlobalSettings', () => {
  // ── Success path ───────────────────────────────────────

  it('loads settings, year, and term on mount', async () => {
    renderHook(() => useLoadGlobalSettings())
    await act(async () => {})

    expect(mockApi.settings.getSettings).toHaveBeenCalledTimes(1)
    expect(mockApi.academic.getCurrentAcademicYear).toHaveBeenCalledTimes(1)
    expect(mockApi.academic.getCurrentTerm).toHaveBeenCalledTimes(1)
  })

  it('calls setSchoolSettings with loaded data', async () => {
    renderHook(() => useLoadGlobalSettings())
    await act(async () => {})

    expect(mockSetSchoolSettings).toHaveBeenCalledWith({ school_name: 'Mwingi School' })
  })

  it('calls setCurrentAcademicYear with loaded data', async () => {
    renderHook(() => useLoadGlobalSettings())
    await act(async () => {})

    expect(mockSetCurrentAcademicYear).toHaveBeenCalledWith({ year_name: '2026' })
  })

  it('calls setCurrentTerm with loaded data', async () => {
    renderHook(() => useLoadGlobalSettings())
    await act(async () => {})

    expect(mockSetCurrentTerm).toHaveBeenCalledWith({ term_name: 'Term 1' })
  })

  // ── Return values ──────────────────────────────────────

  it('returns empty schoolName when store has no settings', () => {
    const { result } = renderHook(() => useLoadGlobalSettings())
    expect(result.current.schoolName).toBe('')
  })

  it('returns schoolName from store settings', async () => {
    mockStoreState.schoolSettings = { school_name: 'My School' }
    const { result } = renderHook(() => useLoadGlobalSettings())
    expect(result.current.schoolName).toBe('My School')
  })

  it('returns empty currentAcademicYearName when store has no year', () => {
    const { result } = renderHook(() => useLoadGlobalSettings())
    expect(result.current.currentAcademicYearName).toBe('')
  })

  it('returns currentAcademicYearName from store', () => {
    mockStoreState.currentAcademicYear = { year_name: '2025' }
    const { result } = renderHook(() => useLoadGlobalSettings())
    expect(result.current.currentAcademicYearName).toBe('2025')
  })

  // ── Error paths ────────────────────────────────────────

  it('does not crash when settings API fails', async () => {
    mockApi.settings.getSettings.mockRejectedValue(new Error('DB down'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    renderHook(() => useLoadGlobalSettings())
    await act(async () => {})

    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to load global settings:',
      expect.any(Error)
    )
    consoleSpy.mockRestore()
  })

  it('does not crash when academic year API fails', async () => {
    mockApi.academic.getCurrentAcademicYear.mockRejectedValue(new Error('No year'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    renderHook(() => useLoadGlobalSettings())
    await act(async () => {})

    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('does not crash when term API fails', async () => {
    mockApi.academic.getCurrentTerm.mockRejectedValue(new Error('No term'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    renderHook(() => useLoadGlobalSettings())
    await act(async () => {})

    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('handles IPC failure result from getSettings', async () => {
    mockApi.settings.getSettings.mockResolvedValue({ success: false, error: 'Auth required' })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    renderHook(() => useLoadGlobalSettings())
    await act(async () => {})

    // unwrapIPCResult throws, caught by outer catch
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
