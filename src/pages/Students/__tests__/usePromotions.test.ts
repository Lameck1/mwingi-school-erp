// @vitest-environment jsdom
/**
 * Tests for usePromotions hook.
 *
 * Covers: initial state, loadStreams, loadAcademicYears, loadTerms,
 * loadStudents, suggestNextStream, toggleStudent, selectAll,
 * handlePromote validation, executePromotion (success/failure/partial),
 * cancelPromotion, and all error paths.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────

const mockShowToast = vi.fn()
vi.mock('../../../contexts/ToastContext', () => ({
    useToast: () => ({ showToast: mockShowToast }),
}))

const mockStore = vi.hoisted(() => ({
    currentAcademicYear: { id: 1, year_name: '2025', is_current: true } as Record<string, unknown> | null,
    user: { id: 1, username: 'admin', role: 'ADMIN' } as Record<string, unknown> | null,
}))

vi.mock('../../../stores', () => ({
    useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
        selector({ currentAcademicYear: mockStore.currentAcademicYear }),
    useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
        selector({ user: mockStore.user }),
}))

vi.mock('../../../utils/ipc', () => ({
    // eslint-disable-next-line sonarjs/function-return-type
    unwrapArrayResult: <T,>(value: T) => {
        if (value && typeof value === 'object' && 'success' in (value as Record<string, unknown>) && !(value as Record<string, unknown>).success) {
            throw new Error(((value as Record<string, unknown>).error as string) || 'Failed')
        }
        return Array.isArray(value) ? value : []
    },
    unwrapIPCResult: <T,>(value: T) => {
        if (value && typeof value === 'object' && 'success' in (value as Record<string, unknown>) && !(value as Record<string, unknown>).success) {
            throw new Error(((value as Record<string, unknown>).error as string) || 'Failed')
        }
        return value
    },
}))

vi.mock('../../../utils/runtimeError', () => ({
    reportRuntimeError: vi.fn((_err: unknown, _ctx: unknown, fallback: string) => fallback),
}))

vi.mock('../promotion-feedback.logic', () => ({
    buildPromotionRunFeedback: vi.fn().mockReturnValue({
        attempted: 0,
        promoted: 0,
        failed: 0,
        errors: [],
        failureDetails: [],
    }),
}))

// ── electronAPI stub ─────────────────────────────────────────

let mockApi: ReturnType<typeof buildElectronAPI>

const mockStreams = [
    { id: 1, stream_name: 'Grade 1A', class_id: 1, class_name: 'Grade 1' },
    { id: 2, stream_name: 'Grade 2A', class_id: 2, class_name: 'Grade 2' },
]

const mockAcademicYears = [
    { id: 1, year_name: '2025', is_current: true },
    { id: 2, year_name: '2026', is_current: false },
]

const mockTerms = [
    { id: 10, term_name: 'Term 1', academic_year_id: 2 },
    { id: 11, term_name: 'Term 2', academic_year_id: 2 },
]

const mockStudents = [
    { student_id: 100, student_name: 'Alice Mwende', admission_number: 'ADM001' },
    { student_id: 101, student_name: 'Bob Mutua', admission_number: 'ADM002' },
    { student_id: 102, student_name: 'Carol Njeri', admission_number: 'ADM003' },
]

function buildElectronAPI() {
    return {
        academic: {
            getPromotionStreams: vi.fn().mockResolvedValue(mockStreams),
            getAcademicYears: vi.fn().mockResolvedValue(mockAcademicYears),
            getTermsByYear: vi.fn().mockResolvedValue(mockTerms),
            getStudentsForPromotion: vi.fn().mockResolvedValue(mockStudents),
            getNextStream: vi.fn().mockResolvedValue({ id: 2, stream_name: 'Grade 2A' }),
            batchPromoteStudents: vi.fn().mockResolvedValue({
                success: true,
                promoted: 3,
                failed: 0,
                errors: [],
                failureDetails: [],
            }),
        },
        system: {
            logError: vi.fn().mockResolvedValue(undefined), // eslint-disable-line unicorn/no-useless-undefined
        },
    }
}

beforeEach(() => {
    mockStore.currentAcademicYear = { id: 1, year_name: '2025', is_current: true }
    mockStore.user = { id: 1, username: 'admin', role: 'ADMIN' }
    mockApi = buildElectronAPI()
    ;(globalThis as Record<string, unknown>).electronAPI = mockApi
    mockShowToast.mockClear()
})

afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as Record<string, unknown>).electronAPI
})

// ── Lazy import ──────────────────────────────────────────────

const { usePromotions } = await import('../usePromotions')

/** Wait for mount effects to settle */
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

describe('usePromotions', () => {
    // ── Initial state ──────────────────────────────────

    describe('initial state', () => {
        it('returns correct default values before mount effects settle', () => {
            const { result } = renderHook(() => usePromotions())

            expect(result.current.loading).toBe(false)
            expect(result.current.promoting).toBe(false)
            expect(result.current.confirmingPromotion).toBe(false)
            expect(result.current.selectedStudents).toEqual([])
            expect(result.current.fromStream).toBe(0)
            expect(result.current.toStream).toBe(0)
            expect(result.current.toAcademicYear).toBe(0)
            expect(result.current.toTerm).toBe(0)
            expect(result.current.lastPromotionFeedback).toBeNull()
        })
    })

    // ── loadStreams ─────────────────────────────────────

    describe('loadStreams', () => {
        it('loads streams on mount', async () => {
            const { result } = renderHook(() => usePromotions())
            await settle()

            expect(mockApi.academic.getPromotionStreams).toHaveBeenCalled()
            expect(result.current.streams).toEqual(mockStreams)
        })

        it('handles loadStreams failure with Error', async () => {
            mockApi.academic.getPromotionStreams.mockRejectedValue(new Error('Stream DB error'))

            const { result } = renderHook(() => usePromotions())
            await settle()

            expect(result.current.streams).toEqual([])
            expect(result.current.fromStream).toBe(0)
            expect(result.current.toStream).toBe(0)
            expect(result.current.students).toEqual([])
            expect(result.current.selectedStudents).toEqual([])
            expect(mockShowToast).toHaveBeenCalledWith('Stream DB error', 'error')
        })

        it('handles loadStreams non-Error failure', async () => {
            mockApi.academic.getPromotionStreams.mockRejectedValue('crash')

            const { result } = renderHook(() => usePromotions())
            await settle()

            expect(result.current.streams).toEqual([])
            expect(mockShowToast).toHaveBeenCalledWith('Failed to load streams', 'error')
        })
    })

    // ── loadAcademicYears ──────────────────────────────

    describe('loadAcademicYears', () => {
        it('loads academic years on mount and prefers non-current as target year', async () => {
            const { result } = renderHook(() => usePromotions())
            await settle()

            expect(mockApi.academic.getAcademicYears).toHaveBeenCalled()
            expect(result.current.academicYears).toEqual(mockAcademicYears)
            // Should pick year id=2 (non-current) as toAcademicYear
            expect(result.current.toAcademicYear).toBe(2)
        })

        it('falls back to first year if all are current', async () => {
            mockApi.academic.getAcademicYears.mockResolvedValue([
                { id: 5, year_name: '2025', is_current: true },
            ])

            const { result } = renderHook(() => usePromotions())
            await settle()

            expect(result.current.toAcademicYear).toBe(5)
        })

        it('handles loadAcademicYears failure with Error', async () => {
            mockApi.academic.getAcademicYears.mockRejectedValue(new Error('Year DB error'))

            const { result } = renderHook(() => usePromotions())
            await settle()

            expect(result.current.academicYears).toEqual([])
            expect(result.current.toAcademicYear).toBe(0)
            expect(result.current.terms).toEqual([])
            expect(result.current.toTerm).toBe(0)
            expect(mockShowToast).toHaveBeenCalledWith('Year DB error', 'error')
        })

        it('handles loadAcademicYears non-Error failure', async () => {
            mockApi.academic.getAcademicYears.mockRejectedValue(42)

            renderHook(() => usePromotions())
            await settle()

            expect(mockShowToast).toHaveBeenCalledWith('Failed to load academic years', 'error')
        })
    })

    // ── loadTerms ──────────────────────────────────────

    describe('loadTerms', () => {
        it('loads terms when toAcademicYear is set and selects first term', async () => {
            const { result } = renderHook(() => usePromotions())
            await settle()

            // toAcademicYear should be 2 from loadAcademicYears
            expect(mockApi.academic.getTermsByYear).toHaveBeenCalledWith(2)
            expect(result.current.terms).toEqual(mockTerms)
            expect(result.current.toTerm).toBe(10) // first term id
        })

        it('handles loadTerms failure with Error', async () => {
            mockApi.academic.getTermsByYear.mockRejectedValue(new Error('Term error'))

            const { result } = renderHook(() => usePromotions())
            await settle()

            expect(result.current.terms).toEqual([])
            expect(result.current.toTerm).toBe(0)
            expect(mockShowToast).toHaveBeenCalledWith('Term error', 'error')
        })

        it('handles loadTerms non-Error failure', async () => {
            mockApi.academic.getTermsByYear.mockRejectedValue('bad')

            renderHook(() => usePromotions())
            await settle()

            expect(mockShowToast).toHaveBeenCalledWith('Failed to load terms', 'error')
        })
    })

    // ── loadStudents + suggestNextStream ────────────────

    describe('loadStudents and suggestNextStream', () => {
        it('loads students when fromStream changes (requires currentAcademicYear)', async () => {
            const { result } = renderHook(() => usePromotions())
            await settle()

            await act(async () => { result.current.setFromStream(1) })
            await settle()

            expect(mockApi.academic.getStudentsForPromotion).toHaveBeenCalledWith(1, 1)
            expect(result.current.students).toEqual(mockStudents)
            expect(result.current.selectedStudents).toEqual([])
        })

        it('suggests next stream when fromStream changes', async () => {
            const { result } = renderHook(() => usePromotions())
            await settle()

            await act(async () => { result.current.setFromStream(1) })
            await settle()

            expect(mockApi.academic.getNextStream).toHaveBeenCalledWith(1)
            expect(result.current.toStream).toBe(2)
        })

        it('clears students when fromStream is 0', async () => {
            const { result } = renderHook(() => usePromotions())
            await settle()

            // first set a stream to load students
            await act(async () => { result.current.setFromStream(1) })
            await settle()
            expect(result.current.students).toEqual(mockStudents)

            // then clear it
            await act(async () => { result.current.setFromStream(0) })
            await settle()

            expect(result.current.students).toEqual([])
            expect(result.current.selectedStudents).toEqual([])
        })

        it('handles loadStudents failure with Error', async () => {
            mockApi.academic.getStudentsForPromotion.mockRejectedValue(new Error('Students error'))

            const { result } = renderHook(() => usePromotions())
            await settle()

            await act(async () => { result.current.setFromStream(1) })
            await settle()

            expect(result.current.students).toEqual([])
            expect(result.current.selectedStudents).toEqual([])
            expect(mockShowToast).toHaveBeenCalledWith('Students error', 'error')
        })

        it('handles loadStudents non-Error failure', async () => {
            mockApi.academic.getStudentsForPromotion.mockRejectedValue(null)

            renderHook(() => usePromotions())
            await settle()

            await act(async () => {
                ;(globalThis as Record<string, unknown>).electronAPI = mockApi
            })

            const { result } = renderHook(() => usePromotions())
            await settle()

            await act(async () => { result.current.setFromStream(1) })
            await settle()

            expect(mockShowToast).toHaveBeenCalledWith('Failed to load students for promotion', 'error')
        })

        it('handles suggestNextStream failure', async () => {
            mockApi.academic.getNextStream.mockRejectedValue(new Error('Next stream err'))

            const { result } = renderHook(() => usePromotions())
            await settle()

            await act(async () => { result.current.setFromStream(1) })
            await settle()

            expect(mockShowToast).toHaveBeenCalledWith('Next stream err', 'error')
        })
    })

    // ── toggleStudent ──────────────────────────────────

    describe('toggleStudent', () => {
        it('adds a student to selection', async () => {
            const { result } = renderHook(() => usePromotions())
            await settle()

            await act(async () => { result.current.setFromStream(1) })
            await settle()

            act(() => { result.current.toggleStudent(100) })
            expect(result.current.selectedStudents).toEqual([100])
        })

        it('removes a student from selection', async () => {
            const { result } = renderHook(() => usePromotions())
            await settle()

            await act(async () => { result.current.setFromStream(1) })
            await settle()

            act(() => { result.current.toggleStudent(100) })
            expect(result.current.selectedStudents).toEqual([100])

            act(() => { result.current.toggleStudent(100) })
            expect(result.current.selectedStudents).toEqual([])
        })
    })

    // ── selectAll ──────────────────────────────────────

    describe('selectAll', () => {
        it('selects all students', async () => {
            const { result } = renderHook(() => usePromotions())
            await settle()

            await act(async () => { result.current.setFromStream(1) })
            await settle()

            act(() => { result.current.selectAll() })
            expect(result.current.selectedStudents).toEqual([100, 101, 102])
        })

        it('deselects all when all are already selected', async () => {
            const { result } = renderHook(() => usePromotions())
            await settle()

            await act(async () => { result.current.setFromStream(1) })
            await settle()

            act(() => { result.current.selectAll() })
            expect(result.current.selectedStudents).toEqual([100, 101, 102])

            act(() => { result.current.selectAll() })
            expect(result.current.selectedStudents).toEqual([])
        })
    })

    // ── handlePromote validation ───────────────────────

    describe('handlePromote validation', () => {
        it('shows error when no students selected', async () => {
            const { result } = renderHook(() => usePromotions())
            await settle()

            act(() => { result.current.handlePromote() })

            expect(mockShowToast).toHaveBeenCalledWith('Please select students to promote', 'warning')
            expect(result.current.confirmingPromotion).toBe(false)
        })

        it('shows error when destination fields are missing', async () => {
            const { result } = renderHook(() => usePromotions())
            await settle()

            // Load students and select them
            await act(async () => { result.current.setFromStream(1) })
            await settle()
            act(() => { result.current.selectAll() })

            // Clear toStream to trigger validation
            act(() => { result.current.setToStream(0) })

            act(() => { result.current.handlePromote() })

            expect(mockShowToast).toHaveBeenCalledWith('Please select destination stream, academic year, and term', 'warning')
            expect(result.current.confirmingPromotion).toBe(false)
        })

        it('sets confirmingPromotion=true when all validations pass', async () => {
            const { result } = renderHook(() => usePromotions())
            await settle()

            // Set fromStream to load students and suggest next stream
            await act(async () => { result.current.setFromStream(1) })
            await settle()

            act(() => { result.current.selectAll() })

            act(() => { result.current.handlePromote() })

            expect(result.current.confirmingPromotion).toBe(true)
            expect(mockShowToast).not.toHaveBeenCalledWith(expect.any(String), 'warning')
        })
    })

    // ── cancelPromotion ────────────────────────────────

    describe('cancelPromotion', () => {
        it('sets confirmingPromotion to false', async () => {
            const { result } = renderHook(() => usePromotions())
            await settle()

            await act(async () => { result.current.setFromStream(1) })
            await settle()

            act(() => { result.current.selectAll() })
            act(() => { result.current.handlePromote() })
            expect(result.current.confirmingPromotion).toBe(true)

            act(() => { result.current.cancelPromotion() })
            expect(result.current.confirmingPromotion).toBe(false)
        })
    })

    // ── executePromotion ───────────────────────────────

    describe('executePromotion', () => {
        it('executes promotion successfully', async () => {
            const { result } = renderHook(() => usePromotions())
            await settle()

            await act(async () => { result.current.setFromStream(1) })
            await settle()

            act(() => { result.current.selectAll() })
            act(() => { result.current.handlePromote() })

            await act(async () => { await result.current.executePromotion() })
            await settle()

            expect(mockApi.academic.batchPromoteStudents).toHaveBeenCalledWith(
                [100, 101, 102], // selectedStudents
                1,               // fromStream
                2,               // toStream (suggested)
                1,               // currentAcademicYear.id
                2,               // toAcademicYear
                10,              // toTerm
                1                // user.id
            )
            expect(result.current.confirmingPromotion).toBe(false)
            expect(result.current.promoting).toBe(false)
            expect(mockShowToast).toHaveBeenCalledWith('Successfully promoted 3 students', 'success')
        })

        it('handles partial success (some failures)', async () => {
            mockApi.academic.batchPromoteStudents.mockResolvedValue({
                success: false,
                promoted: 2,
                failed: 1,
                errors: ['Student 102 failed'],
                failureDetails: [{ student_id: 102, reason: 'Duplicate entry' }],
            })

            const { result } = renderHook(() => usePromotions())
            await settle()

            await act(async () => { result.current.setFromStream(1) })
            await settle()

            act(() => { result.current.selectAll() })

            await act(async () => { await result.current.executePromotion() })
            await settle()

            expect(mockShowToast).toHaveBeenCalledWith('Promotion completed with 1 failure(s)', 'warning')
            expect(result.current.promoting).toBe(false)
            // Should reload students since promoted > 0
            expect(mockApi.academic.getStudentsForPromotion).toHaveBeenCalled()
        })

        it('handles total failure (promoted=0)', async () => {
            mockApi.academic.batchPromoteStudents.mockResolvedValue({
                success: false,
                promoted: 0,
                failed: 3,
                errors: ['All failed'],
                failureDetails: [],
            })

            const { result } = renderHook(() => usePromotions())
            await settle()

            await act(async () => { result.current.setFromStream(1) })
            await settle()

            act(() => { result.current.selectAll() })

            // Track calls before executePromotion
            const callCountBefore = mockApi.academic.getStudentsForPromotion.mock.calls.length

            await act(async () => { await result.current.executePromotion() })
            await settle()

            expect(mockShowToast).toHaveBeenCalledWith('Promotion completed with 3 failure(s)', 'warning')
            // Should NOT reload students since promoted === 0
            // (only calls from the initial setFromStream effect should exist)
            expect(mockApi.academic.getStudentsForPromotion.mock.calls.length).toBe(callCountBefore)
        })

        it('handles executePromotion exception', async () => {
            mockApi.academic.batchPromoteStudents.mockRejectedValue(new Error('Network error'))

            const { result } = renderHook(() => usePromotions())
            await settle()

            await act(async () => { result.current.setFromStream(1) })
            await settle()

            act(() => { result.current.selectAll() })

            await act(async () => { await result.current.executePromotion() })

            expect(result.current.promoting).toBe(false)
            expect(result.current.lastPromotionFeedback).toEqual({
                attempted: 3,
                promoted: 0,
                failed: 3,
                errors: ['Failed to promote students'],
                failureDetails: [],
            })
            expect(mockShowToast).toHaveBeenCalledWith('Failed to promote students', 'error')
        })

        it('calls buildPromotionRunFeedback on success', async () => {
            const { buildPromotionRunFeedback } = await import('../promotion-feedback.logic')

            const { result } = renderHook(() => usePromotions())
            await settle()

            await act(async () => { result.current.setFromStream(1) })
            await settle()

            act(() => { result.current.selectAll() })

            await act(async () => { await result.current.executePromotion() })

            expect(buildPromotionRunFeedback).toHaveBeenCalled()
        })
    })

    // ── setters ────────────────────────────────────────

    describe('setters', () => {
        it('setToStream updates toStream', async () => {
            const { result } = renderHook(() => usePromotions())
            await settle()

            act(() => { result.current.setToStream(5) })
            expect(result.current.toStream).toBe(5)
        })

        it('setToAcademicYear updates toAcademicYear and triggers loadTerms', async () => {
            const { result } = renderHook(() => usePromotions())
            await settle()

            await act(async () => { result.current.setToAcademicYear(3) })
            await settle()

            expect(result.current.toAcademicYear).toBe(3)
            expect(mockApi.academic.getTermsByYear).toHaveBeenCalledWith(3)
        })

        it('setToTerm updates toTerm', async () => {
            const { result } = renderHook(() => usePromotions())
            await settle()

            act(() => { result.current.setToTerm(99) })
            expect(result.current.toTerm).toBe(99)
        })
    })

    // ── guard clauses (null store values) ──────────────

    describe('guard clauses with null store values', () => {
        it('handlePromote shows error when currentAcademicYear is null', async () => {
            mockStore.currentAcademicYear = null

            const { result } = renderHook(() => usePromotions())
            await settle()

            act(() => { result.current.handlePromote() })

            expect(mockShowToast).toHaveBeenCalledWith('No active academic year selected', 'error')
        })

        it('handlePromote shows error when user is null', async () => {
            mockStore.user = null

            const { result } = renderHook(() => usePromotions())
            await settle()

            act(() => { result.current.handlePromote() })

            expect(mockShowToast).toHaveBeenCalledWith('You must be signed in to promote students', 'error')
        })

        it('executePromotion shows error when currentAcademicYear is null', async () => {
            mockStore.currentAcademicYear = null

            const { result } = renderHook(() => usePromotions())
            await settle()

            await act(async () => { await result.current.executePromotion() })

            expect(mockShowToast).toHaveBeenCalledWith('No active academic year selected', 'error')
        })

        it('executePromotion shows error when user is null', async () => {
            mockStore.user = null

            const { result } = renderHook(() => usePromotions())
            await settle()

            await act(async () => { await result.current.executePromotion() })

            expect(mockShowToast).toHaveBeenCalledWith('You must be signed in to promote students', 'error')
        })

        it('loadStudents early-returns when currentAcademicYear is null', async () => {
            mockStore.currentAcademicYear = null

            const { result } = renderHook(() => usePromotions())
            await settle()

            await act(async () => { result.current.setFromStream(1) })
            await settle()

            expect(result.current.students).toEqual([])
            expect(result.current.selectedStudents).toEqual([])
            expect(mockApi.academic.getStudentsForPromotion).not.toHaveBeenCalled()
        })
    })

    // ── Additional branch coverage ─────────────────────────

    describe('branch edge cases', () => {
        it('suggestNextStream does not set toStream when result is null', async () => {
            mockApi.academic.getNextStream.mockResolvedValue(null)

            const { result } = renderHook(() => usePromotions())
            await settle()

            await act(async () => { result.current.setFromStream(1) })
            await settle()

            // toStream should remain 0 (no suggestion)
            expect(result.current.toStream).toBe(0)
        })

        it('suggestNextStream handles non-Error failure', async () => {
            mockApi.academic.getNextStream.mockRejectedValue('bad')

            const { result } = renderHook(() => usePromotions())
            await settle()

            await act(async () => { result.current.setFromStream(1) })
            await settle()

            expect(mockShowToast).toHaveBeenCalledWith('Failed to get next stream', 'error')
        })

        it('loadAcademicYears uses first year as fallback when all are current', async () => {
            mockApi.academic.getAcademicYears.mockResolvedValue([
                { id: 5, year_name: '2025', is_current: true },
            ])

            const { result } = renderHook(() => usePromotions())
            await settle()

            // Falls through to data[0] since none are !is_current
            expect(result.current.toAcademicYear).toBe(5)
        })

        it('loadAcademicYears sets 0 when data is empty', async () => {
            mockApi.academic.getAcademicYears.mockResolvedValue([])

            const { result } = renderHook(() => usePromotions())
            await settle()

            expect(result.current.toAcademicYear).toBe(0)
        })

        it('loadTerms handles empty terms array', async () => {
            mockApi.academic.getTermsByYear.mockResolvedValue([])

            const { result } = renderHook(() => usePromotions())
            await settle()

            await act(async () => { result.current.setToAcademicYear(99) })
            await settle()

            expect(result.current.terms).toEqual([])
        })
    })

    // ── Function coverage: loadTerms catch block ────────────────
    describe('loadTerms error handling', () => {
        it('loadTerms catches error and resets terms', async () => {
            mockApi.academic.getTermsByYear.mockRejectedValue(new Error('Terms fetch failed'))

            const { result } = renderHook(() => usePromotions())
            await settle()

            await act(async () => { result.current.setToAcademicYear(50) })
            await settle()

            expect(result.current.terms).toEqual([])
            expect(result.current.toTerm).toBe(0)
            expect(mockShowToast).toHaveBeenCalledWith('Terms fetch failed', 'error')
        })
    })

    // ── Function coverage: loadStudents catch block ─────────────
    describe('loadStudents error handling', () => {
        it('loadStudents catches error and resets students', async () => {
            mockApi.academic.getStudentsForPromotion.mockRejectedValue(new Error('Students load error'))

            const { result } = renderHook(() => usePromotions())
            await settle()

            await act(async () => { result.current.setFromStream(1) })
            await settle()

            expect(result.current.students).toEqual([])
            expect(mockShowToast).toHaveBeenCalledWith('Students load error', 'error')
        })
    })

    // ── Function coverage: handlePromote validations ─────────────
    describe('handlePromote validation paths', () => {
        it('warns when no students are selected', async () => {
            const { result } = renderHook(() => usePromotions())
            await settle()

            act(() => result.current.handlePromote())

            expect(mockShowToast).toHaveBeenCalledWith('Please select students to promote', 'warning')
        })

        it('warns when destination is incomplete', async () => {
            mockApi.academic.getStudentsForPromotion.mockResolvedValue([
                { student_id: 1, first_name: 'A', last_name: 'B', admission_number: 'ADM001' }
            ])
            // Prevent suggestNextStream from auto-setting toStream
            mockApi.academic.getNextStream.mockResolvedValue(null)

            const { result } = renderHook(() => usePromotions())
            await settle()

            // Simulate selecting students
            await act(async () => { result.current.setFromStream(1) })
            await settle()
            act(() => result.current.toggleStudent(1))
            // Ensure toStream is still 0
            act(() => result.current.setToStream(0))

            act(() => result.current.handlePromote())

            expect(mockShowToast).toHaveBeenCalledWith('Please select destination stream, academic year, and term', 'warning')
        })
    })

    // ── Function coverage: executePromotion catch block ──────────
    describe('executePromotion error handling', () => {
        it('executePromotion catches error and sets feedback', async () => {
            mockApi.academic.getStudentsForPromotion.mockResolvedValue([
                { student_id: 1, first_name: 'A', last_name: 'B', admission_number: 'ADM001' }
            ])
            mockApi.academic.batchPromoteStudents.mockRejectedValue(new Error('Promotion failed'))

            const { result } = renderHook(() => usePromotions())
            await settle()

            await act(async () => { result.current.setFromStream(1) })
            await settle()
            act(() => result.current.toggleStudent(1))
            await act(async () => {
                result.current.setToStream(2)
                result.current.setToAcademicYear(1)
                result.current.setToTerm(1)
            })

            await act(async () => result.current.executePromotion())

            expect(result.current.promoting).toBe(false)
            expect(result.current.lastPromotionFeedback).toBeDefined()
            expect(result.current.lastPromotionFeedback?.failed).toBe(1)
        })
    })

    // ── Function coverage: useEffect .catch() safety handlers ──────
    describe('useEffect .catch() safety handlers', () => {
        it('first useEffect catches loadStreams rejection when internal catch re-throws', async () => {
            const { reportRuntimeError } = await import('../../../utils/runtimeError')
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

            mockApi.academic.getPromotionStreams.mockRejectedValue(new Error('api-fail'))
            vi.mocked(reportRuntimeError).mockImplementationOnce(() => { throw new Error('catch-crash') })

            renderHook(() => usePromotions())
            await settle()

            expect(consoleSpy).toHaveBeenCalledWith('Failed to load streams', expect.any(Error))
            consoleSpy.mockRestore()
        })

        it('first useEffect catches loadAcademicYears rejection when internal catch re-throws', async () => {
            const { reportRuntimeError } = await import('../../../utils/runtimeError')
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

            mockApi.academic.getAcademicYears.mockRejectedValue(new Error('api-fail'))
            vi.mocked(reportRuntimeError).mockImplementationOnce(() => { throw new Error('catch-crash') })

            renderHook(() => usePromotions())
            await settle()

            expect(consoleSpy).toHaveBeenCalledWith('Failed to load academic years', expect.any(Error))
            consoleSpy.mockRestore()
        })

        it('second useEffect catches loadTerms rejection when internal catch re-throws', async () => {
            const { reportRuntimeError } = await import('../../../utils/runtimeError')
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

            mockApi.academic.getTermsByYear.mockRejectedValue(new Error('api-fail'))
            vi.mocked(reportRuntimeError).mockImplementationOnce(() => { throw new Error('catch-crash') })

            renderHook(() => usePromotions())
            await settle()

            expect(consoleSpy).toHaveBeenCalledWith('Failed to load terms', expect.any(Error))
            consoleSpy.mockRestore()
        })

        it('third useEffect catches loadStudents rejection when internal catch re-throws', async () => {
            const { reportRuntimeError } = await import('../../../utils/runtimeError')
            const { result } = renderHook(() => usePromotions())
            await settle()

            mockApi.academic.getStudentsForPromotion.mockRejectedValue(new Error('api-fail'))
            vi.mocked(reportRuntimeError).mockImplementationOnce(() => { throw new Error('catch-crash') })

            await act(async () => { result.current.setFromStream(1) })
            await settle()

            expect(vi.mocked(reportRuntimeError)).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({ action: 'loadStudentsEffect' }),
                'Failed to load students for promotion'
            )
        })

        it('third useEffect catches suggestNextStream rejection when internal catch re-throws', async () => {
            const { reportRuntimeError } = await import('../../../utils/runtimeError')
            const { result } = renderHook(() => usePromotions())
            await settle()

            mockApi.academic.getNextStream.mockRejectedValue(new Error('api-fail'))
            vi.mocked(reportRuntimeError).mockImplementationOnce(() => { throw new Error('catch-crash') })

            await act(async () => { result.current.setFromStream(1) })
            await settle()

            expect(vi.mocked(reportRuntimeError)).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({ action: 'suggestNextStreamEffect' }),
                'Failed to suggest next stream'
            )
        })
    })
})
