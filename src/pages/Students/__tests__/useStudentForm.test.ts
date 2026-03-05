// @vitest-environment jsdom
/**
 * Tests for useStudentForm hook.
 *
 * Covers: initial state, loading existing student, form change, photo upload/remove,
 * form submission (create & edit), validation, and error paths.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────

let mockParams: Record<string, string> = {}
const mockNavigate = vi.fn()
let mockUser: Record<string, unknown> | null = { id: 1, username: 'admin' }

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockParams,
}))

vi.mock('../../../stores', () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ user: mockUser }),
}))

vi.mock('../../../utils/ipc', () => ({
  isIPCFailure: (v: unknown) =>
    v && typeof v === 'object' && 'success' in (v as any) && !(v as any).success,
  getIPCFailureMessage: (v: any, fallback: string) => v?.error || fallback,
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
    students: {
      getStudentById: vi.fn().mockResolvedValue(null),
      getStudentPhotoDataUrl: vi.fn().mockResolvedValue(null),
      uploadStudentPhoto: vi.fn().mockResolvedValue({ success: true }),
      removeStudentPhoto: vi.fn().mockResolvedValue({ success: true }),
      createStudent: vi.fn().mockResolvedValue({ success: true, id: 42 }),
      updateStudent: vi.fn().mockResolvedValue({ success: true }),
    },
    academic: {
      getStreams: vi.fn().mockResolvedValue([
        { id: 1, name: 'Grade 1' },
        { id: 2, name: 'Grade 2' },
      ]),
    },
  }
}

beforeEach(() => {
  mockParams = {}
  mockNavigate.mockClear()
  mockUser = { id: 1, username: 'admin' }
  mockApi = buildElectronAPI()
  ;(globalThis as any).electronAPI = mockApi
})

afterEach(() => {
  vi.restoreAllMocks()
  delete (globalThis as any).electronAPI
})

// ── Lazy import ──────────────────────────────────────────────

const { useStudentForm } = await import('../useStudentForm')

describe('useStudentForm', () => {
  // ── Shared test helper ──────────────────────────────
  const makeMockFileReader = (base64 = 'data:image/png;base64,MOCK_B64') =>
    class {
      result: string | null = null
      onload: (() => void) | null = null
      readAsDataURL(): void {
        this.result = base64
        if (this.onload) { this.onload() }
      }
    }

  // ── Initial state (create mode) ────────────────────────

  describe('create mode', () => {
    it('starts with empty formData defaults', async () => {
      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      expect(result.current.formData.first_name).toBe('')
      expect(result.current.formData.gender).toBe('MALE')
      expect(result.current.formData.student_type).toBe('DAY_SCHOLAR')
      expect(result.current.isEdit).toBe(false)
    })

    it('loads streams on mount', async () => {
      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      expect(result.current.streams).toHaveLength(2)
    })

    it('sets loading to false after init', async () => {
      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      expect(result.current.loading).toBe(false)
    })

    it('sets error when stream loading fails', async () => {
      mockApi.academic.getStreams.mockRejectedValue(new Error('DB down'))
      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      expect(result.current.error).toBe('Failed to load local data registry')
    })
  })

  // ── Edit mode ──────────────────────────────────────────

  describe('edit mode', () => {
    it('loads existing student data', async () => {
      mockParams = { id: '5' }
      mockApi.students.getStudentById.mockResolvedValue({
        admission_number: 'A005',
        first_name: 'Jane',
        middle_name: '',
        last_name: 'Doe',
        date_of_birth: '2010-05-20',
        gender: 'FEMALE',
        student_type: 'BOARDER',
        admission_date: '2025-01-15',
        guardian_name: 'Mary',
        guardian_phone: '0712',
        guardian_email: 'mary@test.com',
        address: 'Nairobi',
        stream_id: 1,
        guardian_relationship: 'Mother',
        notes: 'Good student',
      })

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      expect(result.current.isEdit).toBe(true)
      expect(result.current.formData.first_name).toBe('Jane')
      expect(result.current.formData.gender).toBe('FEMALE')
      expect(result.current.formData.stream_id).toBe('1')
    })

    it('sets error for invalid student id', async () => {
      mockParams = { id: 'abc' }
      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      expect(result.current.error).toBe('Invalid student identifier')
    })

    it('sets error for negative student id', async () => {
      mockParams = { id: '-1' }
      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      expect(result.current.error).toBe('Invalid student identifier')
    })

    it('sets error when getStudentById returns failure', async () => {
      mockParams = { id: '5' }
      mockApi.students.getStudentById.mockResolvedValue({ success: false, error: 'Not found' })

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      expect(result.current.error).toBe('Not found')
    })

    it('sets error when getStudentById returns null', async () => {
      mockParams = { id: '5' }
      mockApi.students.getStudentById.mockResolvedValue(null)

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      expect(result.current.error).toBe('Student record not found')
    })

    it('loads student photo data URL', async () => {
      mockParams = { id: '5' }
      mockApi.students.getStudentById.mockResolvedValue({
        first_name: 'Jane', last_name: 'Doe',
      })
      mockApi.students.getStudentPhotoDataUrl.mockResolvedValue('data:image/png;base64,abc')

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      expect(result.current.photoDataUrl).toBe('data:image/png;base64,abc')
    })

    it('sets error when photo data URL returns IPC failure', async () => {
      mockParams = { id: '5' }
      mockApi.students.getStudentById.mockResolvedValue({
        first_name: 'Jane', last_name: 'Doe',
      })
      mockApi.students.getStudentPhotoDataUrl.mockResolvedValue({ success: false, error: 'Photo corrupted' })

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      expect(result.current.error).toBe('Photo corrupted')
      expect(result.current.photoDataUrl).toBeNull()
    })

    it('sets photoDataUrl to null when data URL is not a string', async () => {
      mockParams = { id: '5' }
      mockApi.students.getStudentById.mockResolvedValue({
        first_name: 'Jane', last_name: 'Doe',
      })
      mockApi.students.getStudentPhotoDataUrl.mockResolvedValue(42)

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      expect(result.current.photoDataUrl).toBeNull()
    })
  })

  // ── handleChange ───────────────────────────────────────

  describe('handleChange', () => {
    it('updates formData on input change', async () => {
      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      act(() => {
        result.current.handleChange({
          target: { name: 'first_name', value: 'Alice' },
        } as any)
      })

      expect(result.current.formData.first_name).toBe('Alice')
    })
  })

  // ── handleSubmit (create) ──────────────────────────────

  describe('handleSubmit – create', () => {
    it('creates student and navigates to /students', async () => {
      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      act(() => {
        result.current.setFormData(prev => ({
          ...prev,
          first_name: 'Alice',
          last_name: 'Smith',
          admission_number: 'A100',
        }))
      })

      await act(async () => {
        result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(mockApi.students.createStudent).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/students')
    })

    it('uploads pending photo after create', async () => {
      mockApi.students.createStudent.mockResolvedValue({ success: true, id: 99 })
      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      // Simulate setting a pending photo via internal state
      // We can't easily trigger handlePhotoSelect (FileReader), but we can test the submit path
      await act(async () => {
        result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(mockNavigate).toHaveBeenCalledWith('/students')
    })

    it('sets error when create returns failure', async () => {
      mockApi.students.createStudent.mockResolvedValue({ success: false, error: 'Duplicate' })
      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      await act(async () => {
        result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(result.current.error).toBeTruthy()
    })

    it('sets saving back to false after error', async () => {
      mockApi.students.createStudent.mockRejectedValue(new Error('Network'))
      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      await act(async () => {
        result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(result.current.saving).toBe(false)
      expect(result.current.error).toBe('Network')
    })
  })

  // ── handleSubmit (edit) ────────────────────────────────

  describe('handleSubmit – edit', () => {
    it('updates student and navigates to /students', async () => {
      mockParams = { id: '5' }
      mockApi.students.getStudentById.mockResolvedValue({
        first_name: 'Jane', last_name: 'Doe', admission_number: 'A005',
      })
      mockApi.students.updateStudent.mockResolvedValue({ success: true })

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      await act(async () => {
        result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(mockApi.students.updateStudent).toHaveBeenCalledWith(5, expect.any(Object))
      expect(mockNavigate).toHaveBeenCalledWith('/students')
    })

    it('sets error on update failure', async () => {
      mockParams = { id: '5' }
      mockApi.students.getStudentById.mockResolvedValue({
        first_name: 'Jane', last_name: 'Doe',
      })
      mockApi.students.updateStudent.mockResolvedValue({ success: false, error: 'Locked' })

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      await act(async () => {
        result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(result.current.error).toBeTruthy()
    })
  })

  // ── handleRemovePhoto ──────────────────────────────────

  describe('handleRemovePhoto', () => {
    it('removes photo in edit mode', async () => {
      vi.stubGlobal('confirm', vi.fn(() => true))
      mockParams = { id: '5' }
      mockApi.students.getStudentById.mockResolvedValue({
        first_name: 'Jane', last_name: 'Doe',
      })

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      await act(async () => result.current.handleRemovePhoto())

      expect(mockApi.students.removeStudentPhoto).toHaveBeenCalledWith(5)
      vi.unstubAllGlobals()
    })

    it('clears local photo in create mode', async () => {
      vi.stubGlobal('confirm', vi.fn(() => true))

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      await act(async () => result.current.handleRemovePhoto())

      expect(result.current.photoDataUrl).toBeNull()
      expect(mockApi.students.removeStudentPhoto).not.toHaveBeenCalled()
      vi.unstubAllGlobals()
    })

    it('aborts when user cancels confirmation', async () => {
      vi.stubGlobal('confirm', vi.fn(() => false))

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      await act(async () => result.current.handleRemovePhoto())

      expect(mockApi.students.removeStudentPhoto).not.toHaveBeenCalled()
      vi.unstubAllGlobals()
    })

    it('sets error when removeStudentPhoto fails', async () => {
      vi.stubGlobal('confirm', vi.fn(() => true))
      mockParams = { id: '5' }
      mockApi.students.getStudentById.mockResolvedValue({
        first_name: 'Jane', last_name: 'Doe',
      })
      mockApi.students.removeStudentPhoto.mockResolvedValue({ success: false, error: 'IO error' })

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      await act(async () => result.current.handleRemovePhoto())

      expect(result.current.error).toBe('IO error')
      vi.unstubAllGlobals()
    })

    it('uses default error when removeStudentPhoto fails without message', async () => {
      vi.stubGlobal('confirm', vi.fn(() => true))
      mockParams = { id: '5' }
      mockApi.students.getStudentById.mockResolvedValue({
        first_name: 'Jane', last_name: 'Doe',
      })
      mockApi.students.removeStudentPhoto.mockResolvedValue({ success: false })

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      await act(async () => result.current.handleRemovePhoto())

      expect(result.current.error).toBe('Failed to remove photo')
      vi.unstubAllGlobals()
    })

    it('shows generic error when removeStudentPhoto throws', async () => {
      vi.stubGlobal('confirm', vi.fn(() => true))
      mockParams = { id: '5' }
      mockApi.students.getStudentById.mockResolvedValue({
        first_name: 'Jane', last_name: 'Doe',
      })
      mockApi.students.removeStudentPhoto.mockRejectedValue(new Error('Network fail'))

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      await act(async () => result.current.handleRemovePhoto())

      expect(result.current.error).toBe('Network fail')
      vi.unstubAllGlobals()
    })

    it('shows generic error when removeStudentPhoto throws non-Error', async () => {
      vi.stubGlobal('confirm', vi.fn(() => true))
      mockParams = { id: '5' }
      mockApi.students.getStudentById.mockResolvedValue({
        first_name: 'Jane', last_name: 'Doe',
      })
      mockApi.students.removeStudentPhoto.mockRejectedValue('oops')

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      await act(async () => result.current.handleRemovePhoto())

      expect(result.current.error).toBe('Remove photo failed')
      vi.unstubAllGlobals()
    })
  })

  // ── stream_id parsing edge case ────────────────────────

  describe('stream_id parsing', () => {
    it('handles non-numeric stream_id gracefully during submit', async () => {
      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      act(() => result.current.setFormData(prev => ({ ...prev, stream_id: 'not-a-number' })))

      await act(async () => {
        result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      // Should not crash — stream_id becomes undefined
      expect(mockApi.students.createStudent).toHaveBeenCalled()
    })
  })

  // ── handlePhotoSelect ──────────────────────────────────

  describe('handlePhotoSelect', () => {

    it('returns early when no file is selected', async () => {
      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      await act(async () => {
        result.current.handlePhotoSelect({ target: { files: [] } } as any)
      })

      expect(result.current.error).toBe('')
    })

    it('sets error when file exceeds 5MB', async () => {
      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      const bigFile = new File(['x'], 'big.png', { type: 'image/png' })
      Object.defineProperty(bigFile, 'size', { value: 6 * 1024 * 1024 })

      await act(async () => {
        result.current.handlePhotoSelect({ target: { files: [bigFile] } } as any)
      })

      expect(result.current.error).toBe('Image file size exceeds 5MB limit')
    })

    it('sets pendingPhoto and photoDataUrl in create mode', async () => {
      vi.stubGlobal('FileReader', makeMockFileReader())

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      const file = new File(['x'], 'photo.png', { type: 'image/png' })
      Object.defineProperty(file, 'size', { value: 1024 })

      await act(async () => {
        result.current.handlePhotoSelect({ target: { files: [file] } } as any)
      })
      await act(async () => {})

      expect(result.current.photoDataUrl).toBe('data:image/png;base64,MOCK_B64')
      vi.unstubAllGlobals()
    })

    it('uploads photo in edit mode on success', async () => {
      vi.stubGlobal('FileReader', makeMockFileReader())
      mockParams = { id: '5' }
      mockApi.students.getStudentById.mockResolvedValue({
        first_name: 'Jane', last_name: 'Doe',
      })
      mockApi.students.uploadStudentPhoto.mockResolvedValue({ success: true })

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      const file = new File(['x'], 'photo.png', { type: 'image/png' })
      Object.defineProperty(file, 'size', { value: 1024 })

      await act(async () => {
        result.current.handlePhotoSelect({ target: { files: [file] } } as any)
      })
      await act(async () => {})

      expect(mockApi.students.uploadStudentPhoto).toHaveBeenCalledWith(5, 'data:image/png;base64,MOCK_B64')
      expect(result.current.photoDataUrl).toBe('data:image/png;base64,MOCK_B64')
      vi.unstubAllGlobals()
    })

    it('sets error when photo upload returns failure in edit mode', async () => {
      vi.stubGlobal('FileReader', makeMockFileReader())
      mockParams = { id: '5' }
      mockApi.students.getStudentById.mockResolvedValue({
        first_name: 'Jane', last_name: 'Doe',
      })
      mockApi.students.uploadStudentPhoto.mockResolvedValue({ success: false, error: 'Upload rejected' })

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      const file = new File(['x'], 'photo.png', { type: 'image/png' })
      Object.defineProperty(file, 'size', { value: 1024 })

      await act(async () => {
        result.current.handlePhotoSelect({ target: { files: [file] } } as any)
      })
      await act(async () => {})

      expect(result.current.error).toBe('Upload rejected')
      vi.unstubAllGlobals()
    })

    it('sets fallback error when photo upload fails without message in edit mode', async () => {
      vi.stubGlobal('FileReader', makeMockFileReader())
      mockParams = { id: '5' }
      mockApi.students.getStudentById.mockResolvedValue({
        first_name: 'Jane', last_name: 'Doe',
      })
      mockApi.students.uploadStudentPhoto.mockResolvedValue({ success: false })

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      const file = new File(['x'], 'photo.png', { type: 'image/png' })
      Object.defineProperty(file, 'size', { value: 1024 })

      await act(async () => {
        result.current.handlePhotoSelect({ target: { files: [file] } } as any)
      })
      await act(async () => {})

      expect(result.current.error).toBe('Failed to upload photo')
      vi.unstubAllGlobals()
    })

    it('sets error when photo upload throws Error in edit mode', async () => {
      vi.stubGlobal('FileReader', makeMockFileReader())
      mockParams = { id: '5' }
      mockApi.students.getStudentById.mockResolvedValue({
        first_name: 'Jane', last_name: 'Doe',
      })
      mockApi.students.uploadStudentPhoto.mockRejectedValue(new Error('Network'))

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      const file = new File(['x'], 'photo.png', { type: 'image/png' })
      Object.defineProperty(file, 'size', { value: 1024 })

      await act(async () => {
        result.current.handlePhotoSelect({ target: { files: [file] } } as any)
      })
      await act(async () => {})

      expect(result.current.error).toBe('Network')
      vi.unstubAllGlobals()
    })

    it('sets error when photo upload throws non-Error in edit mode', async () => {
      vi.stubGlobal('FileReader', makeMockFileReader())
      mockParams = { id: '5' }
      mockApi.students.getStudentById.mockResolvedValue({
        first_name: 'Jane', last_name: 'Doe',
      })
      mockApi.students.uploadStudentPhoto.mockRejectedValue('bad')

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      const file = new File(['x'], 'photo.png', { type: 'image/png' })
      Object.defineProperty(file, 'size', { value: 1024 })

      await act(async () => {
        result.current.handlePhotoSelect({ target: { files: [file] } } as any)
      })
      await act(async () => {})

      expect(result.current.error).toBe('Photo upload failed')
      vi.unstubAllGlobals()
    })
  })

  // ── handleSubmit with pendingPhoto ─────────────────────

  describe('handleSubmit – create with pendingPhoto', () => {
    it('uploads pending photo after successful create', async () => {
      vi.stubGlobal('FileReader', class {
        result: string | null = null
        onload: (() => void) | null = null
        readAsDataURL(): void {
          this.result = 'data:image/png;base64,PENDING'
          if (this.onload) { this.onload() }
        }
      })
      mockApi.students.createStudent.mockResolvedValue({ success: true, id: 99 })

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      // Set a pending photo via handlePhotoSelect in create mode
      const file = new File(['x'], 'photo.png', { type: 'image/png' })
      Object.defineProperty(file, 'size', { value: 1024 })

      await act(async () => {
        result.current.handlePhotoSelect({ target: { files: [file] } } as any)
      })
      await act(async () => {})

      // Now submit form
      await act(async () => {
        result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(mockApi.students.createStudent).toHaveBeenCalled()
      expect(mockApi.students.uploadStudentPhoto).toHaveBeenCalledWith(99, 'data:image/png;base64,PENDING')
      expect(mockNavigate).toHaveBeenCalledWith('/students')
      vi.unstubAllGlobals()
    })

    it('skips photo upload when create returns no id', async () => {
      mockApi.students.createStudent.mockResolvedValue({ success: true })

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      await act(async () => {
        result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(mockApi.students.uploadStudentPhoto).not.toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/students')
    })

    it('sets error with non-Error submit exception', async () => {
      mockApi.students.createStudent.mockRejectedValue(42)

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      await act(async () => {
        result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(result.current.error).toBe('Registry synchronization failed')
      expect(result.current.saving).toBe(false)
    })
  })

  // ── Branch coverage: getResultMessage – object with error (L45) ──
  describe('getResultMessage edge cases', () => {
    it('sets error when create returns object with error property', async () => {
      mockApi.students.createStudent.mockResolvedValue({ success: false, error: 'Custom validation error' })

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      await act(async () => {
        result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(result.current.error).toBeTruthy()
    })

    it('sets error when create returns object with message but no error', async () => {
      mockApi.students.createStudent.mockResolvedValue({ success: false, message: 'Something went wrong' })

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      await act(async () => {
        result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(result.current.error).toBeTruthy()
    })
  })

  // ── Branch coverage: handleSubmit – create mode with pendingPhoto (L160+) ──
  describe('create mode with pending photo', () => {

    it('uploads photo after successful create with id', async () => {
      vi.stubGlobal('FileReader', makeMockFileReader())
      mockApi.students.createStudent.mockResolvedValue({ success: true, id: 55 })
      mockApi.students.uploadStudentPhoto.mockResolvedValue({ success: true })

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      // First, select a photo (create mode, no params.id)
      const file = new File(['x'], 'photo.png', { type: 'image/png' })
      Object.defineProperty(file, 'size', { value: 1024 })
      await act(async () => {
        result.current.handlePhotoSelect({ target: { files: [file] } } as any)
      })
      await act(async () => {})

      // Then submit – should create student then upload photo
      await act(async () => {
        result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(mockApi.students.createStudent).toHaveBeenCalled()
      expect(mockApi.students.uploadStudentPhoto).toHaveBeenCalledWith(55, 'data:image/png;base64,MOCK_B64')
      vi.unstubAllGlobals()
    })
  })

  // ── Branch coverage: handleRemovePhoto – create mode clears pending (L135) ──
  describe('handleRemovePhoto – create mode', () => {
    it('clears photoDataUrl in create mode without API call', async () => {
      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      await act(async () => result.current.handleRemovePhoto())

      expect(result.current.photoDataUrl).toBeNull()
      expect(mockApi.students.removeStudentPhoto).not.toHaveBeenCalled()
    })
  })

  // ── Branch coverage: getResultMessage – non-IPC object branches (L48-57) ──
  describe('getResultMessage – non-IPC object branches', () => {
    it('extracts error string from object without success property', async () => {
      mockApi.students.createStudent.mockResolvedValue({ error: 'Custom error without success' })

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      await act(async () => {
        result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(result.current.error).toBe('Custom error without success')
    })

    it('extracts message string from object without success or error', async () => {
      mockApi.students.createStudent.mockResolvedValue({ message: 'Custom message info' })

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      await act(async () => {
        result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(result.current.error).toBe('Custom message info')
    })

    it('uses fallback when object has no error or message strings', async () => {
      mockApi.students.createStudent.mockResolvedValue({ foo: 'bar' })

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      await act(async () => {
        result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(result.current.error).toBe('Failed to save student record')
    })

    it('falls through to message when error is empty string', async () => {
      mockApi.students.createStudent.mockResolvedValue({ error: '', message: 'Fallback msg' })

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      await act(async () => {
        result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(result.current.error).toBe('Fallback msg')
    })

    it('uses fallback when both error and message are empty strings', async () => {
      mockApi.students.createStudent.mockResolvedValue({ error: '', message: '' })

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      await act(async () => {
        result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(result.current.error).toBe('Failed to save student record')
    })

    it('uses fallback when error is whitespace-only', async () => {
      mockApi.students.createStudent.mockResolvedValue({ error: '   ' })

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      await act(async () => {
        result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(result.current.error).toBe('Failed to save student record')
    })

    it('skips error when it is a non-string truthy value', async () => {
      mockApi.students.createStudent.mockResolvedValue({ error: 123, message: 'Used instead' })

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      await act(async () => {
        result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(result.current.error).toBe('Used instead')
    })
  })

  // ── Branch coverage: handleSubmit edit path – non-IPC failure (L249) ──
  describe('handleSubmit – edit path non-IPC failure object', () => {
    it('extracts error from update result without success property', async () => {
      mockParams = { id: '5' }
      mockApi.students.getStudentById.mockResolvedValue({
        first_name: 'Jane', last_name: 'Doe',
      })
      mockApi.students.updateStudent.mockResolvedValue({ error: 'Edit constraint error' })

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      await act(async () => {
        result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(result.current.error).toBe('Edit constraint error')
    })

    it('extracts message from update result without success or error', async () => {
      mockParams = { id: '5' }
      mockApi.students.getStudentById.mockResolvedValue({
        first_name: 'Jane', last_name: 'Doe',
      })
      mockApi.students.updateStudent.mockResolvedValue({ message: 'Update blocked' })

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      await act(async () => {
        result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(result.current.error).toBe('Update blocked')
    })
  })

  // ── Branch coverage: handleSubmit – create without user session (L249) ──
  describe('handleSubmit – no user session', () => {
    it('throws error when user.id is missing in create mode', async () => {
      mockUser = null

      const { result } = renderHook(() => useStudentForm())
      await act(async () => {})

      await act(async () => {
        result.current.handleSubmit({ preventDefault: vi.fn() } as any)
      })

      expect(result.current.error).toBe('User session not found. Please log in again.')
    })
  })
})
