// @vitest-environment jsdom
/**
 * Supplementary tests for useAwardsManagement – covers the !user?.id guard
 * branches in handleApproveAward (lines 130-131) and handleRejectAward (lines 164-165).
 *
 * Uses a user mock WITHOUT an `id` so those early-return branches are hit.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks ──────────────────────────────────────────────────

const mockShowToast = vi.fn()
vi.mock('../../../../contexts/ToastContext', () => ({
    useToast: () => ({ showToast: mockShowToast }),
}))

// User has role (so canApprove is true) but NO id
vi.mock('../../../../stores', () => {
    const year = { id: 1, year_name: '2025' }
    const term = { id: 10, term_name: 'Term 1' }
    const user = { username: 'ghost', role: 'ADMIN' } // no id!
    return {
        useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
            selector({ currentAcademicYear: year, currentTerm: term }),
        useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
            selector({ user }),
    }
})

vi.mock('../../../../utils/ipc', () => ({
    unwrapArrayResult: <T,>(value: T) => (Array.isArray(value) ? value : []),
    unwrapIPCResult: <T,>(value: T) => value,
}))

// ── electronAPI stub ──────────────────────────────────────

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
})

afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as Record<string, unknown>).electronAPI
})

// ── Lazy import ──────────────────────────────────────────

const { useAwardsManagement } = await import('../useAwardsManagement')

describe('useAwardsManagement – user without id', () => {
    it('handleApproveAward shows session error when user.id is missing', async () => {
        const { result } = renderHook(() => useAwardsManagement())
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

        await act(async () => result.current.handleApproveAward(1))

        expect(mockShowToast).toHaveBeenCalledWith(
            'User session not found. Please log in again.',
            'error',
        )
        expect(mockApi.academic.approveAward).not.toHaveBeenCalled()
    })

    it('handleRejectAward shows session error when user.id is missing', async () => {
        const { result } = renderHook(() => useAwardsManagement())
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

        // Set up rejection modal state
        act(() => result.current.openRejectModal(5))
        act(() => result.current.setRejectionReason('Not eligible'))

        await act(async () => result.current.handleRejectAward())

        expect(mockShowToast).toHaveBeenCalledWith(
            'User session not found. Please log in again.',
            'error',
        )
        expect(mockApi.academic.rejectAward).not.toHaveBeenCalled()
    })

    it('handleAwardStudent shows session error when user.id is missing', async () => {
        const { result } = renderHook(() => useAwardsManagement())
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

        act(() => {
            result.current.setSelectedStudent(10)
            result.current.setSelectedCategory(1)
        })

        await act(async () => result.current.handleAwardStudent())

        expect(mockShowToast).toHaveBeenCalledWith(
            'User session not found. Please log in again.',
            'error',
        )
        expect(mockApi.academic.awardStudent).not.toHaveBeenCalled()
    })
})
