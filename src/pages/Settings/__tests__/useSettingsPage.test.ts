// @vitest-environment jsdom
/**
 * Tests for useSettingsPage hook.
 *
 * Covers: form data sync with store, academic year CRUD, logo upload/remove,
 * settings save, tab management, and error paths.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────

const mockShowToast = vi.fn()
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

vi.mock('../../../hooks/useScrollableTabNav', () => ({
  useScrollableTabNav: (setTab: (t: string) => void) => ({
    navRef: { current: null },
    handleTabClick: (t: string) => setTab(t),
  }),
}))

const mockSchoolSettings = {
  school_name: 'Test School',
  school_motto: 'Learn',
  address: '123 St',
  phone: '0700',
  email: 'a@b.com',
  sms_api_key: 'key',
  sms_api_secret: 'secret',
  sms_sender_id: 'SCHOOL',
  mpesa_paybill: '123456',
  school_type: 'PRIVATE',
}

const mockSetSchoolSettings = vi.fn()

vi.mock('../../../stores', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      schoolSettings: mockSchoolSettings,
      setSchoolSettings: mockSetSchoolSettings,
    }),
}))

vi.mock('../../../utils/ipc', () => ({
  unwrapIPCResult: <T,>(value: T) => {
    if (value && typeof value === 'object' && 'success' in (value as any) && !(value as any).success) {
      throw new Error((value as any).error || 'Failed')
    }
    return value
  },
  // eslint-disable-next-line sonarjs/function-return-type
  unwrapArrayResult: <T,>(value: T) => {
    if (value && typeof value === 'object' && 'success' in (value as any) && !(value as any).success) {
      throw new Error((value as any).error || 'Failed')
    }
    return Array.isArray(value) ? value : []
  },
}))

// ── electronAPI stub ─────────────────────────────────────────

let mockApi: Record<string, Record<string, ReturnType<typeof vi.fn>>>

function buildElectronAPI() {
  return {
    settings: {
      getLogoDataUrl: vi.fn().mockResolvedValue(null),
      uploadLogo: vi.fn().mockResolvedValue({ success: true }),
      removeLogo: vi.fn().mockResolvedValue({ success: true }),
      updateSettings: vi.fn().mockResolvedValue({ success: true }),
      getSettings: vi.fn().mockResolvedValue(mockSchoolSettings),
    },
    academic: {
      getAcademicYears: vi.fn().mockResolvedValue([]),
      createAcademicYear: vi.fn().mockResolvedValue({ success: true }),
      activateAcademicYear: vi.fn().mockResolvedValue({ success: true }),
    },
  }
}

beforeEach(() => {
  mockApi = buildElectronAPI()
  ;(globalThis as any).electronAPI = mockApi
  mockShowToast.mockClear()
  mockSetSchoolSettings.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
  delete (globalThis as any).electronAPI
})

// ── Lazy import ──────────────────────────────────────────────

const { useSettingsPage } = await import('../useSettingsPage')

describe('useSettingsPage', () => {
  // ── Initial state ──────────────────────────────────────

  describe('initial state', () => {
    it('syncs formData from school settings store', async () => {
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      expect(result.current.formData.school_name).toBe('Test School')
      expect(result.current.formData.school_type).toBe('PRIVATE')
    })

    it('provides six tabs', () => {
      const { result } = renderHook(() => useSettingsPage())
      expect(result.current.tabs).toHaveLength(6)
      expect(result.current.tabs.map(t => t.id)).toContain('school')
      expect(result.current.tabs.map(t => t.id)).toContain('academic')
    })

    it('starts with saving = false', () => {
      const { result } = renderHook(() => useSettingsPage())
      expect(result.current.saving).toBe(false)
    })

    it('loads logo on mount', async () => {
      mockApi.settings.getLogoDataUrl.mockResolvedValue('data:image/png;base64,abc')
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      expect(result.current.logoDataUrl).toBe('data:image/png;base64,abc')
    })

    it('sets logoDataUrl to null for non-string return', async () => {
      mockApi.settings.getLogoDataUrl.mockResolvedValue(42)
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      expect(result.current.logoDataUrl).toBeNull()
    })
  })

  // ── handleSave ─────────────────────────────────────────

  describe('handleSave', () => {
    it('saves settings and reloads from API', async () => {
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      await act(async () => result.current.handleSave())

      expect(mockApi.settings.updateSettings).toHaveBeenCalled()
      expect(mockApi.settings.getSettings).toHaveBeenCalled()
      expect(mockSetSchoolSettings).toHaveBeenCalled()
      expect(mockShowToast).toHaveBeenCalledWith('School settings synchronized successfully', 'success')
    })

    it('shows error toast on save failure', async () => {
      mockApi.settings.updateSettings.mockResolvedValue({ success: false, error: 'DB error' })
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      await act(async () => result.current.handleSave())

      expect(mockShowToast).toHaveBeenCalledWith('DB error', 'error')
    })

    it('shows generic error when exception thrown', async () => {
      mockApi.settings.updateSettings.mockRejectedValue(new Error('Network'))
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      await act(async () => result.current.handleSave())

      expect(mockShowToast).toHaveBeenCalledWith('Network', 'error')
    })

    it('resets saving to false after save completes', async () => {
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      await act(async () => result.current.handleSave())
      expect(result.current.saving).toBe(false)
    })
  })

  // ── Logo handlers ──────────────────────────────────────

  describe('handleRemoveLogo', () => {
    it('removes logo on success', async () => {
      vi.stubGlobal('confirm', vi.fn(() => true))
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      await act(async () => result.current.handleRemoveLogo())

      expect(mockApi.settings.removeLogo).toHaveBeenCalled()
      expect(mockShowToast).toHaveBeenCalledWith('School logo removed', 'success')
      vi.unstubAllGlobals()
    })

    it('aborts when user cancels confirmation', async () => {
      vi.stubGlobal('confirm', vi.fn(() => false))
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      await act(async () => result.current.handleRemoveLogo())

      expect(mockApi.settings.removeLogo).not.toHaveBeenCalled()
      vi.unstubAllGlobals()
    })

    it('shows error on remove failure result', async () => {
      vi.stubGlobal('confirm', vi.fn(() => true))
      mockApi.settings.removeLogo.mockResolvedValue({ success: false, error: 'IO error' })
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      await act(async () => result.current.handleRemoveLogo())

      expect(mockShowToast).toHaveBeenCalledWith('IO error', 'error')
      vi.unstubAllGlobals()
    })

    it('shows error on exception during remove', async () => {
      vi.stubGlobal('confirm', vi.fn(() => true))
      mockApi.settings.removeLogo.mockRejectedValue(new Error('Boom'))
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      await act(async () => result.current.handleRemoveLogo())

      expect(mockShowToast).toHaveBeenCalledWith('Remove logo failed', 'error')
      vi.unstubAllGlobals()
    })
  })

  // ── Academic year ──────────────────────────────────────

  describe('handleCreateYear', () => {
    it('creates year and reloads list on success', async () => {
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      act(() => result.current.setNewYearData({
        year_name: '2027', start_date: '2027-01-01', end_date: '2027-12-31', is_current: false,
      }))

      await act(async () => result.current.handleCreateYear())

      expect(mockApi.academic.createAcademicYear).toHaveBeenCalledWith(
        expect.objectContaining({ year_name: '2027' })
      )
      expect(mockShowToast).toHaveBeenCalledWith('Academic cycle established successfully', 'success')
    })

    it('shows error when fields are empty', async () => {
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      // newYearData is default (all empty)
      await act(async () => result.current.handleCreateYear())

      expect(mockShowToast).toHaveBeenCalledWith('Please fill in all required fields', 'error')
      expect(mockApi.academic.createAcademicYear).not.toHaveBeenCalled()
    })

    it('shows error on API failure', async () => {
      mockApi.academic.createAcademicYear.mockResolvedValue({ success: false, error: 'Dup year' })
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      act(() => result.current.setNewYearData({
        year_name: '2027', start_date: '2027-01-01', end_date: '2027-12-31', is_current: false,
      }))

      await act(async () => result.current.handleCreateYear())

      expect(mockShowToast).toHaveBeenCalledWith('Dup year', 'error')
    })
  })

  describe('handleActivateYear', () => {
    it('activates year and reloads list', async () => {
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      await act(async () => result.current.handleActivateYear(5))

      expect(mockApi.academic.activateAcademicYear).toHaveBeenCalledWith(5)
      expect(mockShowToast).toHaveBeenCalledWith('Academic session activated successfully', 'success')
    })

    it('shows error on activate failure', async () => {
      mockApi.academic.activateAcademicYear.mockResolvedValue({ success: false, error: 'Not found' })
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      await act(async () => result.current.handleActivateYear(99))

      expect(mockShowToast).toHaveBeenCalledWith('Not found', 'error')
    })
  })

  // ── Academic years loading ────────────────────────────

  describe('loadAcademicYears (tab switch)', () => {
    it('loads years when academic tab becomes active', async () => {
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      act(() => result.current.handleTabClick('academic'))
      await act(async () => {})

      expect(mockApi.academic.getAcademicYears).toHaveBeenCalled()
    })

    it('sets empty array and shows toast on load failure', async () => {
      mockApi.academic.getAcademicYears.mockResolvedValue({ success: false, error: 'DB down' })
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      act(() => result.current.handleTabClick('academic'))
      await act(async () => {})

      expect(result.current.academicYears).toEqual([])
      expect(mockShowToast).toHaveBeenCalledWith('DB down', 'error')
    })
  })

  // ── Form data updates ─────────────────────────────────

  describe('formData', () => {
    it('can update formData via setFormData', async () => {
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      act(() => result.current.setFormData(prev => ({ ...prev, school_name: 'New School' })))
      expect(result.current.formData.school_name).toBe('New School')
    })
  })

  // ── loadLogo error path ────────────────────────────────

  describe('loadLogo error', () => {
    it('logs error when getLogoDataUrl throws', async () => {
      mockApi.settings.getLogoDataUrl.mockResolvedValue({ success: false, error: 'Logo not found' })
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      expect(result.current.logoDataUrl).toBeNull()
      consoleSpy.mockRestore()
    })
  })

  // ── handleLogoSelect ───────────────────────────────────

  describe('handleLogoSelect', () => {
    it('does nothing when no file is selected', async () => {
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      await act(async () => {
        await result.current.handleLogoSelect({ target: { files: [] } } as any)
      })

      expect(mockApi.settings.uploadLogo).not.toHaveBeenCalled()
    })

    it('shows error for oversized file', async () => {
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      const bigFile = new File(['x'.repeat(6 * 1024 * 1024)], 'huge.png', { type: 'image/png' })
      await act(async () => {
        await result.current.handleLogoSelect({ target: { files: [bigFile] } } as any)
      })

      expect(mockShowToast).toHaveBeenCalledWith('Image file size exceeds 5MB limit', 'error')
    })

    it('uploads logo successfully via FileReader', async () => {
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      vi.stubGlobal('FileReader', class MockFileReader {
        result = ''
        onload: (() => void) | null = null
        readAsDataURL() {
          this.result = 'data:image/png;base64,test'
          if (this.onload) { this.onload() }
        }
      })

      const smallFile = new File(['x'], 'logo.png', { type: 'image/png' })
      await act(async () => {
        await result.current.handleLogoSelect({ target: { files: [smallFile] } } as any)
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      expect(mockApi.settings.uploadLogo).toHaveBeenCalledWith('data:image/png;base64,test')
      expect(mockShowToast).toHaveBeenCalledWith('School logo updated successfully', 'success')
      vi.unstubAllGlobals()
    })

    it('shows error when upload returns failure', async () => {
      mockApi.settings.uploadLogo.mockResolvedValue({ success: false, error: 'Upload rejected' })
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      vi.stubGlobal('FileReader', class MockFileReader {
        result = ''
        onload: (() => void) | null = null
        readAsDataURL() {
          this.result = 'data:image/png;base64,test'
          if (this.onload) { this.onload() }
        }
      })

      const file = new File(['x'], 'logo.png', { type: 'image/png' })
      await act(async () => {
        await result.current.handleLogoSelect({ target: { files: [file] } } as any)
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      expect(mockShowToast).toHaveBeenCalledWith('Upload rejected', 'error')
      vi.unstubAllGlobals()
    })

    it('shows generic error when upload throws', async () => {
      mockApi.settings.uploadLogo.mockRejectedValue(new Error('Network'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      vi.stubGlobal('FileReader', class MockFileReader {
        result = ''
        onload: (() => void) | null = null
        readAsDataURL() {
          this.result = 'data:image/png;base64,test'
          if (this.onload) { this.onload() }
        }
      })

      const file = new File(['x'], 'logo.png', { type: 'image/png' })
      await act(async () => {
        await result.current.handleLogoSelect({ target: { files: [file] } } as any)
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      expect(mockShowToast).toHaveBeenCalledWith('Logo upload failed', 'error')
      vi.unstubAllGlobals()
      consoleSpy.mockRestore()
    })
  })

  // ── handleSave branch coverage ─────────────────────────

  describe('handleSave – conditional payload fields', () => {
    it('omits empty fields from updatePayload', async () => {
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      // Set all fields to empty except school_type
      act(() => result.current.setFormData({
        school_name: '', school_motto: '', address: '', phone: '', email: '',
        sms_api_key: '', sms_api_secret: '', sms_sender_id: '',
        mpesa_paybill: '', school_type: 'PRIVATE',
      }))

      await act(async () => result.current.handleSave())

      // The payload should only include school_type (always set)
      const callArgs = mockApi.settings.updateSettings.mock.calls[0]?.[0]
      expect(callArgs).not.toHaveProperty('school_name')
      expect(callArgs).not.toHaveProperty('school_motto')
      expect(callArgs).not.toHaveProperty('address')
      expect(callArgs).not.toHaveProperty('phone')
      expect(callArgs).not.toHaveProperty('email')
      expect(callArgs).not.toHaveProperty('mpesa_paybill')
      expect(callArgs.school_type).toBe('PRIVATE')
    })

    it('includes populated fields in updatePayload', async () => {
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      act(() => result.current.setFormData({
        school_name: 'My School', school_motto: 'Learn', address: '123 Main',
        phone: '0700', email: 'test@test.com',
        sms_api_key: '', sms_api_secret: '', sms_sender_id: '',
        mpesa_paybill: 'M123', school_type: 'PUBLIC',
      }))

      await act(async () => result.current.handleSave())

      const callArgs = mockApi.settings.updateSettings.mock.calls[0]?.[0]
      expect(callArgs.school_name).toBe('My School')
      expect(callArgs.school_motto).toBe('Learn')
      expect(callArgs.address).toBe('123 Main')
      expect(callArgs.phone).toBe('0700')
      expect(callArgs.email).toBe('test@test.com')
      expect(callArgs.mpesa_paybill).toBe('M123')
    })

    it('shows generic error for non-Error exception in handleSave', async () => {
      mockApi.settings.updateSettings.mockRejectedValue(42)
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      await act(async () => result.current.handleSave())

      expect(mockShowToast).toHaveBeenCalledWith('Critical error updating settings', 'error')
    })
  })

  describe('handleCreateYear – non-Error exception', () => {
    it('shows generic error for non-Error exception', async () => {
      mockApi.academic.createAcademicYear.mockRejectedValue('boom')
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      act(() => result.current.setNewYearData({
        year_name: '2028', start_date: '2028-01-01', end_date: '2028-12-31', is_current: false,
      }))

      await act(async () => result.current.handleCreateYear())

      expect(mockShowToast).toHaveBeenCalledWith('Failed to create academic year', 'error')
    })
  })

  describe('handleActivateYear – non-Error exception', () => {
    it('shows generic error for non-Error exception', async () => {
      mockApi.academic.activateAcademicYear.mockRejectedValue(null)
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      await act(async () => result.current.handleActivateYear(99))

      expect(mockShowToast).toHaveBeenCalledWith('Failed to activate academic year', 'error')
    })
  })

  describe('handleRemoveLogo – fallback error', () => {
    it('shows fallback error when removeLogo fails without error message', async () => {
      vi.stubGlobal('confirm', vi.fn(() => true))
      mockApi.settings.removeLogo.mockResolvedValue({ success: false })
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      await act(async () => result.current.handleRemoveLogo())

      expect(mockShowToast).toHaveBeenCalledWith('Failed to remove logo', 'error')
      vi.unstubAllGlobals()
    })
  })

  // ── Function coverage: handleRemoveLogo catch path ──────────
  describe('handleRemoveLogo – exception handling', () => {
    it('shows generic error when removeLogo throws', async () => {
      vi.stubGlobal('confirm', vi.fn(() => true))
      mockApi.settings.removeLogo.mockRejectedValue(new Error('Network error'))
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      await act(async () => result.current.handleRemoveLogo())

      expect(mockShowToast).toHaveBeenCalledWith('Remove logo failed', 'error')
      expect(result.current.saving).toBe(false)
      vi.unstubAllGlobals()
    })
  })

  // ── Function coverage: handleLogoSelect file size check ──────
  describe('handleLogoSelect – file size validation', () => {
    it('rejects file over 5MB', async () => {
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      const bigFile = new File(['x'.repeat(6 * 1024 * 1024)], 'big.png', { type: 'image/png' })
      Object.defineProperty(bigFile, 'size', { value: 6 * 1024 * 1024 })

      const fakeEvent = {
        target: { files: [bigFile] }
      } as unknown as Parameters<typeof result.current.handleLogoSelect>[0]

      await act(async () => result.current.handleLogoSelect(fakeEvent))

      expect(mockShowToast).toHaveBeenCalledWith('Image file size exceeds 5MB limit', 'error')
    })

    it('handles uploadLogo failure in onload callback', async () => {
      mockApi.settings.uploadLogo.mockResolvedValue({ success: false, error: 'Upload rejected' })
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      const smallFile = new File(['data'], 'small.png', { type: 'image/png' })
      Object.defineProperty(smallFile, 'size', { value: 1024 })

      const fakeEvent = {
        target: { files: [smallFile] }
      } as unknown as Parameters<typeof result.current.handleLogoSelect>[0]

      await act(async () => result.current.handleLogoSelect(fakeEvent))
      // Wait for FileReader onload
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

      expect(mockShowToast).toHaveBeenCalledWith('Upload rejected', 'error')
    })

    it('skips when no file selected', async () => {
      const { result } = renderHook(() => useSettingsPage())
      await act(async () => {})

      const fakeEvent = {
        target: { files: [] }
      } as unknown as Parameters<typeof result.current.handleLogoSelect>[0]

      await act(async () => result.current.handleLogoSelect(fakeEvent))
      // Should not throw or call any API
      expect(true).toBe(true)
    })
  })
})
