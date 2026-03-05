// @vitest-environment jsdom
/**
 * Tests for useAwardsManagement hook.
 *
 * Covers: data loading, award assignment, approve/reject/delete workflows,
 * filtering, role-based canApprove, and all error/edge paths.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────

const mockShowToast = vi.fn()
vi.mock('../../../../contexts/ToastContext', () => ({
    useToast: () => ({ showToast: mockShowToast }),
}))

const mockStore = vi.hoisted(() => ({
    currentAcademicYear: { id: 1, year_name: '2025' } as Record<string, unknown> | null,
    currentTerm: { id: 10, term_name: 'Term 1' } as Record<string, unknown> | null,
    user: { id: 1, username: 'admin', role: 'ADMIN' } as Record<string, unknown> | null,
}))

vi.mock('../../../../stores', () => ({
    useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
        selector({ currentAcademicYear: mockStore.currentAcademicYear, currentTerm: mockStore.currentTerm }),
    useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
        selector({ user: mockStore.user }),
}))

vi.mock('../../../../utils/ipc', () => ({
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

// ── electronAPI stub ─────────────────────────────────────────

let mockApi: ReturnType<typeof buildElectronAPI>

function buildElectronAPI() {
    return {
        academic: {
            getAwards: vi.fn().mockResolvedValue([]),
            getAwardCategories: vi.fn().mockResolvedValue([]),
            awardStudent: vi.fn().mockResolvedValue({ success: true }),
            approveAward: vi.fn().mockResolvedValue({ success: true }),
            rejectAward: vi.fn().mockResolvedValue({ success: true }),
            deleteAward: vi.fn().mockResolvedValue({ success: true }),
        },
        students: {
            getStudents: vi.fn().mockResolvedValue({ rows: [] }),
        },
    }
}

beforeEach(() => {
    mockApi = buildElectronAPI()
    ;(globalThis as Record<string, unknown>).electronAPI = mockApi
    mockShowToast.mockClear()
    mockStore.currentAcademicYear = { id: 1, year_name: '2025' }
    mockStore.currentTerm = { id: 10, term_name: 'Term 1' }
    mockStore.user = { id: 1, username: 'admin', role: 'ADMIN' }
})

afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as Record<string, unknown>).electronAPI
})

// ── Lazy import ──────────────────────────────────────────────

const { useAwardsManagement } = await import('../useAwardsManagement')

describe('useAwardsManagement', () => {
    // ── Data loading ───────────────────────────────────────

    describe('loadInitialData + loadAwards', () => {
        it('loads categories, students, and awards on mount', async () => {
            const mockCategories = [{ id: 1, name: 'Best Student', category_type: 'academic', description: 'Top' }]
            const mockStudents = { rows: [{ id: 10, first_name: 'Alice', last_name: 'Smith', full_name: 'Alice Smith', admission_number: 'ADM001' }] }
            const mockAwards = [{ id: 1, student_id: 10, award_category_id: 1, category_name: 'Best Student', awarded_date: '2025-01-01', approval_status: 'pending', admission_number: 'ADM001' }]

            mockApi.academic.getAwardCategories.mockResolvedValue(mockCategories)
            mockApi.students.getStudents.mockResolvedValue(mockStudents)
            mockApi.academic.getAwards.mockResolvedValue(mockAwards)

            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            expect(result.current.categories).toEqual(mockCategories)
            expect(result.current.students).toHaveLength(1)
            expect(result.current.students[0].name).toBe('Alice Smith')
            expect(result.current.awards).toHaveLength(1)
        })

        it('handles loadInitialData failure', async () => {
            mockApi.academic.getAwardCategories.mockRejectedValue(new Error('Cat error'))

            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            expect(result.current.categories).toEqual([])
            expect(result.current.students).toEqual([])
            expect(mockShowToast).toHaveBeenCalledWith('Cat error', 'error')
        })

        it('handles loadInitialData non-Error failure', async () => {
            mockApi.academic.getAwardCategories.mockRejectedValue('bad')

            const { result: _result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            expect(mockShowToast).toHaveBeenCalledWith('Failed to load award setup data', 'error')
        })

        it('handles loadAwards failure', async () => {
            mockApi.academic.getAwards.mockRejectedValue(new Error('Awards error'))

            const { result: _result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            expect(_result.current.awards).toEqual([])
            expect(mockShowToast).toHaveBeenCalledWith('Awards error', 'error')
        })

        it('handles loadAwards non-Error failure', async () => {
            mockApi.academic.getAwards.mockRejectedValue(42)

            const { result: _result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            expect(mockShowToast).toHaveBeenCalledWith('Failed to load awards', 'error')
        })

        it('filters out non-StudentAward objects from awards', async () => {
            mockApi.academic.getAwards.mockResolvedValue([
                { id: 1, student_id: 10, award_category_id: 1, category_name: 'A', awarded_date: '2025-01-01', approval_status: 'pending', admission_number: 'A1' },
                { notAnAward: true }, // should be filtered out
            ])

            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            expect(result.current.awards).toHaveLength(1)
        })
    })

    // ── canApprove ───────────────────────────────────────

    describe('canApprove', () => {
        it('returns true for ADMIN role', async () => {
            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })
            expect(result.current.canApprove).toBe(true)
        })
    })

    // ── handleAwardStudent ───────────────────────────────

    describe('handleAwardStudent', () => {
        it('shows warning when student or category not selected', async () => {
            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            await act(async () => result.current.handleAwardStudent())

            expect(mockShowToast).toHaveBeenCalledWith('Please select a student and award category', 'warning')
        })

        it('assigns award successfully', async () => {
            mockApi.academic.awardStudent.mockResolvedValue({ success: true })

            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => {
                result.current.setSelectedStudent(10)
                result.current.setSelectedCategory(1)
                result.current.setShowForm(true)
            })

            await act(async () => result.current.handleAwardStudent())

            expect(mockApi.academic.awardStudent).toHaveBeenCalled()
            expect(mockShowToast).toHaveBeenCalledWith('Award assigned successfully!', 'success')
            expect(result.current.selectedStudent).toBe(0)
            expect(result.current.selectedCategory).toBe(0)
            expect(result.current.showForm).toBe(false)
        })

        it('handles awardStudent failure', async () => {
            mockApi.academic.awardStudent.mockRejectedValue(new Error('Award failed'))

            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => {
                result.current.setSelectedStudent(10)
                result.current.setSelectedCategory(1)
            })

            await act(async () => result.current.handleAwardStudent())

            expect(mockShowToast).toHaveBeenCalledWith('Award failed', 'error')
            expect(result.current.loading).toBe(false)
        })

        it('handles non-Error awardStudent failure', async () => {
            mockApi.academic.awardStudent.mockRejectedValue('boom')

            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => {
                result.current.setSelectedStudent(10)
                result.current.setSelectedCategory(1)
            })

            await act(async () => result.current.handleAwardStudent())

            expect(mockShowToast).toHaveBeenCalledWith('Failed to assign award', 'error')
        })
    })

    // ── handleApproveAward ───────────────────────────────

    describe('handleApproveAward', () => {
        it('approves award successfully', async () => {
            mockApi.academic.approveAward.mockResolvedValue({ success: true })

            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            await act(async () => result.current.handleApproveAward(1))

            expect(mockApi.academic.approveAward).toHaveBeenCalledWith({ awardId: 1, userId: 1 })
            expect(mockShowToast).toHaveBeenCalledWith('Award approved successfully!', 'success')
        })

        it('handles approve failure', async () => {
            mockApi.academic.approveAward.mockRejectedValue(new Error('Approve fail'))

            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            await act(async () => result.current.handleApproveAward(1))

            expect(mockShowToast).toHaveBeenCalledWith('Approve fail', 'error')
            expect(result.current.loading).toBe(false)
        })

        it('handles non-Error approve failure', async () => {
            mockApi.academic.approveAward.mockRejectedValue(null)

            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            await act(async () => result.current.handleApproveAward(1))

            expect(mockShowToast).toHaveBeenCalledWith('Failed to approve award', 'error')
        })
    })

    // ── handleRejectAward ────────────────────────────────

    describe('handleRejectAward', () => {
        it('shows warning when rejection reason is empty', async () => {
            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            await act(async () => result.current.handleRejectAward())

            expect(mockShowToast).toHaveBeenCalledWith('Please enter a reason for rejection', 'warning')
        })

        it('shows warning when no award selected', async () => {
            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => result.current.setRejectionReason('Not eligible'))
            await act(async () => result.current.handleRejectAward())

            expect(mockShowToast).toHaveBeenCalledWith('No award selected for rejection', 'warning')
        })

        it('rejects award successfully', async () => {
            mockApi.academic.rejectAward.mockResolvedValue({ success: true })

            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => result.current.openRejectModal(5))
            expect(result.current.showRejectModal).toBe(true)

            act(() => result.current.setRejectionReason('Not eligible'))

            await act(async () => result.current.handleRejectAward())

            expect(mockApi.academic.rejectAward).toHaveBeenCalledWith({ awardId: 5, userId: 1, reason: 'Not eligible' })
            expect(mockShowToast).toHaveBeenCalledWith('Award rejected', 'success')
            expect(result.current.showRejectModal).toBe(false)
            expect(result.current.rejectionReason).toBe('')
        })

        it('handles reject failure', async () => {
            mockApi.academic.rejectAward.mockRejectedValue(new Error('Reject fail'))

            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => result.current.openRejectModal(5))
            act(() => result.current.setRejectionReason('reason'))

            await act(async () => result.current.handleRejectAward())

            expect(mockShowToast).toHaveBeenCalledWith('Reject fail', 'error')
            expect(result.current.loading).toBe(false)
        })

        it('handles non-Error reject failure', async () => {
            mockApi.academic.rejectAward.mockRejectedValue(false)

            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => result.current.openRejectModal(5))
            act(() => result.current.setRejectionReason('reason'))

            await act(async () => result.current.handleRejectAward())

            expect(mockShowToast).toHaveBeenCalledWith('Failed to reject award', 'error')
        })
    })

    // ── handleDeleteAward ────────────────────────────────

    describe('handleDeleteAward', () => {
        it('deletes award and removes from list optimistically', async () => {
            const existingAwards = [
                { id: 1, student_id: 10, award_category_id: 1, category_name: 'A', awarded_date: '2025-01-01', approval_status: 'pending', admission_number: 'A1' },
                { id: 2, student_id: 11, award_category_id: 1, category_name: 'B', awarded_date: '2025-01-01', approval_status: 'pending', admission_number: 'A2' },
            ]
            mockApi.academic.getAwards.mockResolvedValue(existingAwards)
            mockApi.academic.deleteAward.mockResolvedValue({ success: true })

            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })
            expect(result.current.awards).toHaveLength(2)

            await act(async () => result.current.handleDeleteAward(1))

            expect(mockApi.academic.deleteAward).toHaveBeenCalledWith({ awardId: 1 })
            expect(mockShowToast).toHaveBeenCalledWith('Award deleted successfully!', 'success')
            expect(result.current.awards).toHaveLength(1)
            expect(result.current.awards[0].id).toBe(2)
        })

        it('handles delete failure', async () => {
            mockApi.academic.deleteAward.mockRejectedValue(new Error('Delete fail'))

            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            await act(async () => result.current.handleDeleteAward(1))

            expect(mockShowToast).toHaveBeenCalledWith('Delete fail', 'error')
            expect(result.current.loading).toBe(false)
        })

        it('handles non-Error delete failure', async () => {
            // eslint-disable-next-line unicorn/no-useless-undefined
            mockApi.academic.deleteAward.mockRejectedValue(undefined)

            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            await act(async () => result.current.handleDeleteAward(1))

            expect(mockShowToast).toHaveBeenCalledWith('Failed to delete award', 'error')
        })
    })

    // ── Filtering ────────────────────────────────────────

    describe('filtering', () => {
        it('filters awards by category', async () => {
            const awards = [
                { id: 1, student_id: 10, award_category_id: 1, category_name: 'A', awarded_date: '2025-01-01', approval_status: 'pending', admission_number: 'A1' },
                { id: 2, student_id: 11, award_category_id: 2, category_name: 'B', awarded_date: '2025-01-01', approval_status: 'pending', admission_number: 'A2' },
            ]
            mockApi.academic.getAwards.mockResolvedValue(awards)

            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            expect(result.current.filteredAwards).toHaveLength(2)

            act(() => result.current.setFilterCategory(1))
            expect(result.current.filteredAwards).toHaveLength(1)
            expect(result.current.filteredAwards[0].category_name).toBe('A')
        })

        it('returns all awards when filterCategory is 0', async () => {
            const awards = [
                { id: 1, student_id: 10, award_category_id: 1, category_name: 'A', awarded_date: '2025-01-01', approval_status: 'pending', admission_number: 'A1' },
            ]
            mockApi.academic.getAwards.mockResolvedValue(awards)

            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => result.current.setFilterCategory(0))
            expect(result.current.filteredAwards).toHaveLength(1)
        })

        it('builds categoryMap from categories', async () => {
            mockApi.academic.getAwardCategories.mockResolvedValue([
                { id: 1, name: 'Best Student', category_type: 'academic', description: 'Top' },
                { id: 2, name: 'Sports', category_type: 'sports', description: 'Athletic' },
            ])

            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            expect(result.current.categoryMap.size).toBe(2)
            expect(result.current.categoryMap.get(1)?.name).toBe('Best Student')
        })
    })

    // ── openRejectModal ──────────────────────────────────

    describe('openRejectModal', () => {
        it('sets modal state correctly', async () => {
            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => result.current.openRejectModal(42))

            expect(result.current.showRejectModal).toBe(true)
            expect(result.current.rejectionReason).toBe('')
        })
    })

    // ── Guard clauses (null store values) ─────────────────

    describe('guard clauses with null store values', () => {
        it('handleAwardStudent warns when currentAcademicYear is null', async () => {
            mockStore.currentAcademicYear = null

            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => { result.current.setSelectedStudent(10); result.current.setSelectedCategory(1) })
            await act(async () => result.current.handleAwardStudent())

            expect(mockShowToast).toHaveBeenCalledWith('Select an active academic year before assigning awards', 'warning')
        })

        it('handleAwardStudent warns when user is null', async () => {
            mockStore.user = null

            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => { result.current.setSelectedStudent(10); result.current.setSelectedCategory(1) })
            await act(async () => result.current.handleAwardStudent())

            expect(mockShowToast).toHaveBeenCalledWith('User session not found. Please log in again.', 'error')
        })

        it('handleApproveAward warns when user is null', async () => {
            mockStore.user = null

            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            await act(async () => result.current.handleApproveAward(1))

            expect(mockShowToast).toHaveBeenCalledWith('User session not found. Please log in again.', 'error')
        })

        it('handleRejectAward warns when user is null', async () => {
            mockStore.user = null

            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => result.current.openRejectModal(5))
            act(() => result.current.setRejectionReason('reason'))
            await act(async () => result.current.handleRejectAward())

            expect(mockShowToast).toHaveBeenCalledWith('User session not found. Please log in again.', 'error')
        })

        it('canApprove is false when user.role is null', async () => {
            mockStore.user = { id: 1, username: 'admin', role: null }

            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            expect(result.current.canApprove).toBe(false)
        })
    })

    // ── Function coverage: handleDeleteAward catch block ──────────
    describe('handleDeleteAward error handling', () => {
        it('handles handleDeleteAward API rejection', async () => {
            mockApi.academic.deleteAward.mockRejectedValue(new Error('Delete failed'))

            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            await act(async () => result.current.handleDeleteAward(1))

            expect(mockShowToast).toHaveBeenCalledWith('Delete failed', 'error')
            expect(result.current.loading).toBe(false)
        })

        it('handles handleDeleteAward non-Error rejection', async () => {
            mockApi.academic.deleteAward.mockRejectedValue(42)

            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            await act(async () => result.current.handleDeleteAward(1))

            expect(mockShowToast).toHaveBeenCalledWith('Failed to delete award', 'error')
        })
    })

    // ── Function coverage: handleRejectAward no rejectingAwardId path ──
    describe('handleRejectAward with no rejectingAwardId', () => {
        it('warns when rejectingAwardId is null', async () => {
            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            // Set reason but DON'T call openRejectModal → rejectingAwardId stays null
            act(() => result.current.setRejectionReason('some reason'))
            await act(async () => result.current.handleRejectAward())

            expect(mockShowToast).toHaveBeenCalledWith('No award selected for rejection', 'warning')
        })
    })

    // ── Function coverage: handleRejectAward catch block ──────────
    describe('handleRejectAward error handling', () => {
        it('handles handleRejectAward API rejection', async () => {
            mockApi.academic.rejectAward.mockRejectedValue(new Error('Reject failed'))

            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => result.current.openRejectModal(5))
            act(() => result.current.setRejectionReason('bad award'))
            await act(async () => result.current.handleRejectAward())

            expect(mockShowToast).toHaveBeenCalledWith('Reject failed', 'error')
            expect(result.current.loading).toBe(false)
        })
    })

    // ── Function coverage: handleApproveAward catch block ──────────
    describe('handleApproveAward error handling', () => {
        it('handles handleApproveAward API rejection', async () => {
            mockApi.academic.approveAward.mockRejectedValue(new Error('Approve failed'))

            const { result } = renderHook(() => useAwardsManagement())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            await act(async () => result.current.handleApproveAward(1))

            expect(mockShowToast).toHaveBeenCalledWith('Approve failed', 'error')
            expect(result.current.loading).toBe(false)
        })
    })
})
