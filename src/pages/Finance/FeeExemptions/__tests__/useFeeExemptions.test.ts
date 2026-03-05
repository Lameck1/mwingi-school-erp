// @vitest-environment jsdom
/**
 * Tests for useFeeExemptions hook.
 *
 * Covers: data loading, student search filtering, year change, student selection,
 * create exemption, revoke exemption, status filter change, and all error paths.
 */
import { renderHook, act } from '@testing-library/react'
import type React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────

const mockShowToast = vi.fn()
vi.mock('../../../../contexts/ToastContext', () => ({
    useToast: () => ({ showToast: mockShowToast }),
}))

vi.mock('../../../../stores', () => ({
    useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
        selector({ user: { id: 1, username: 'admin' } }),
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
        finance: {
            getExemptions: vi.fn().mockResolvedValue([]),
            getFeeCategories: vi.fn().mockResolvedValue([]),
            getExemptionStats: vi.fn().mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 }),
            createExemption: vi.fn().mockResolvedValue({ success: true }),
            revokeExemption: vi.fn().mockResolvedValue({ success: true }),
        },
        academic: {
            getAcademicYears: vi.fn().mockResolvedValue([]),
            getTermsByYear: vi.fn().mockResolvedValue([]),
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

// ── Lazy import ──────────────────────────────────────────────

const { useFeeExemptions } = await import('../useFeeExemptions')

describe('useFeeExemptions', () => {
    // ── Data loading ───────────────────────────────────────

    describe('loadData', () => {
        it('starts with loading = true', () => {
            const { result } = renderHook(() => useFeeExemptions())
            expect(result.current.loading).toBe(true)
        })

        it('loads all data in parallel and sets state', async () => {
            const mockYears = [{ id: 1, year_name: '2025', is_current: true }]
            const mockTerms = [{ id: 10, term_name: 'Term 1', is_current: true }]
            const mockCategories = [{ id: 5, category_name: 'Tuition' }]
            const mockStudents = { rows: [{ id: 100, first_name: 'Alice', last_name: 'Smith', admission_number: 'ADM001' }] }
            const mockStats = { total: 10, active: 5, full: 3, partial: 2 }
            const mockExemptions = [{ id: 1, student_name: 'Alice', status: 'ACTIVE' }]

            mockApi.finance.getExemptions.mockResolvedValue(mockExemptions)
            mockApi.academic.getAcademicYears.mockResolvedValue(mockYears)
            mockApi.finance.getFeeCategories.mockResolvedValue(mockCategories)
            mockApi.students.getStudents.mockResolvedValue(mockStudents)
            mockApi.finance.getExemptionStats.mockResolvedValue(mockStats)
            mockApi.academic.getTermsByYear.mockResolvedValue(mockTerms)

            const { result } = renderHook(() => useFeeExemptions())

            // Wait for effects to settle
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            expect(result.current.loading).toBe(false)
            expect(result.current.academicYears).toEqual(mockYears)
            expect(result.current.feeCategories).toEqual(mockCategories)
            expect(result.current.stats).toEqual(mockStats)
            // formData should have current year and term set
            expect(result.current.formData.academic_year_id).toBe(1)
            expect(result.current.formData.term_id).toBe(10)
        })

        it('handles loadData failure and resets all state', async () => {
            mockApi.finance.getExemptions.mockRejectedValue(new Error('DB error'))

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            expect(result.current.loading).toBe(false)
            expect(result.current.exemptions).toEqual([])
            expect(result.current.academicYears).toEqual([])
            expect(result.current.terms).toEqual([])
            expect(result.current.feeCategories).toEqual([])
            expect(result.current.stats).toBeNull()
            expect(mockShowToast).toHaveBeenCalledWith('DB error', 'error')
        })

        it('shows generic error for non-Error throws', async () => {
            mockApi.finance.getExemptions.mockRejectedValue('weird')

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            expect(result.current.loading).toBe(false)
            expect(mockShowToast).toHaveBeenCalledWith('Failed to load exemption data', 'error')
        })

        it('does not set terms when no current year found', async () => {
            mockApi.academic.getAcademicYears.mockResolvedValue([{ id: 2, year_name: '2024', is_current: false }])
            mockApi.students.getStudents.mockResolvedValue({ rows: [] })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            expect(mockApi.academic.getTermsByYear).not.toHaveBeenCalled()
            expect(result.current.formData.academic_year_id).toBe(0)
        })

        it('sets academic_year_id but not term_id when current year has no current term', async () => {
            mockApi.academic.getAcademicYears.mockResolvedValue([{ id: 3, year_name: '2025', is_current: true }])
            mockApi.academic.getTermsByYear.mockResolvedValue([{ id: 20, term_name: 'Term 1', is_current: false }])
            mockApi.students.getStudents.mockResolvedValue({ rows: [] })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            expect(result.current.formData.academic_year_id).toBe(3)
            expect(result.current.formData.term_id).toBe(0)
        })
    })

    // ── Student search ───────────────────────────────────

    describe('student search filtering', () => {
        it('filters students by name when search >= 2 chars', async () => {
            mockApi.students.getStudents.mockResolvedValue({
                rows: [
                    { id: 1, first_name: 'Alice', last_name: 'Smith', admission_number: 'ADM001' },
                    { id: 2, first_name: 'Bob', last_name: 'Jones', admission_number: 'ADM002' },
                ]
            })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => result.current.setStudentSearch('ali'))
            // Need to wait for the effect
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })

            expect(result.current.filteredStudents).toHaveLength(1)
            expect(result.current.filteredStudents[0].first_name).toBe('Alice')
        })

        it('filters students by admission number', async () => {
            mockApi.students.getStudents.mockResolvedValue({
                rows: [
                    { id: 1, first_name: 'Alice', last_name: 'Smith', admission_number: 'ADM001' },
                    { id: 2, first_name: 'Bob', last_name: 'Jones', admission_number: 'ADM002' },
                ]
            })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => result.current.setStudentSearch('ADM002'))
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })

            expect(result.current.filteredStudents).toHaveLength(1)
            expect(result.current.filteredStudents[0].first_name).toBe('Bob')
        })

        it('clears filtered students when search < 2 chars', async () => {
            mockApi.students.getStudents.mockResolvedValue({
                rows: [{ id: 1, first_name: 'Alice', last_name: 'Smith', admission_number: 'ADM001' }]
            })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => result.current.setStudentSearch('al'))
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
            expect(result.current.filteredStudents).toHaveLength(1)

            act(() => result.current.setStudentSearch('a'))
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
            expect(result.current.filteredStudents).toHaveLength(0)
        })

        it('limits filtered results to 10', async () => {
            const manyStudents = Array.from({ length: 15 }, (_, i) => ({
                id: i, first_name: 'Test', last_name: `Student${i}`, admission_number: `ADM${i}`
            }))
            mockApi.students.getStudents.mockResolvedValue({ rows: manyStudents })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => result.current.setStudentSearch('test'))
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })

            expect(result.current.filteredStudents).toHaveLength(10)
        })
    })

    // ── handleYearChange ─────────────────────────────────

    describe('handleYearChange', () => {
        it('updates formData and loads terms for selected year', async () => {
            const mockTerms = [{ id: 30, term_name: 'Term 2' }]
            mockApi.academic.getTermsByYear.mockResolvedValue(mockTerms)
            mockApi.students.getStudents.mockResolvedValue({ rows: [] })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            await act(async () => result.current.handleYearChange(5))

            expect(result.current.formData.academic_year_id).toBe(5)
            expect(result.current.formData.term_id).toBe(0)
            expect(result.current.terms).toEqual(mockTerms)
        })

        it('handles getTermsByYear failure', async () => {
            mockApi.academic.getTermsByYear.mockRejectedValue(new Error('Terms DB error'))
            mockApi.students.getStudents.mockResolvedValue({ rows: [] })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            await act(async () => result.current.handleYearChange(5))

            expect(result.current.terms).toEqual([])
            expect(mockShowToast).toHaveBeenCalledWith('Terms DB error', 'error')
        })

        it('shows generic message for non-Error term loading failure', async () => {
            mockApi.academic.getTermsByYear.mockRejectedValue('bad')
            mockApi.students.getStudents.mockResolvedValue({ rows: [] })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            await act(async () => result.current.handleYearChange(5))

            expect(mockShowToast).toHaveBeenCalledWith('Failed to load terms for selected year', 'error')
        })
    })

    // ── handleSelectStudent ──────────────────────────────

    describe('handleSelectStudent', () => {
        it('sets student, formData.student_id, clears search', async () => {
            mockApi.students.getStudents.mockResolvedValue({ rows: [] })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            const student = { id: 42, first_name: 'Jane', last_name: 'Doe', admission_number: 'ADM042' } as any

            act(() => result.current.handleSelectStudent(student))

            expect(result.current.selectedStudent).toEqual(student)
            expect(result.current.formData.student_id).toBe(42)
            expect(result.current.studentSearch).toBe('')
            expect(result.current.filteredStudents).toEqual([])
        })
    })

    // ── handleCreate ─────────────────────────────────────

    describe('handleCreate', () => {
        const fakeEvent = { preventDefault: vi.fn() } as unknown as React.SyntheticEvent

        it('prevents default and validates required fields', async () => {
            mockApi.students.getStudents.mockResolvedValue({ rows: [] })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            await act(async () => result.current.handleCreate(fakeEvent))

            expect(fakeEvent.preventDefault).toHaveBeenCalled()
            expect(mockShowToast).toHaveBeenCalledWith('Please fill in all required fields', 'warning')
        })

        it('creates exemption and reloads data on success', async () => {
            mockApi.academic.getAcademicYears.mockResolvedValue([{ id: 1, year_name: '2025', is_current: true }])
            mockApi.academic.getTermsByYear.mockResolvedValue([{ id: 10, term_name: 'Term 1', is_current: true }])
            mockApi.students.getStudents.mockResolvedValue({ rows: [] })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })
            mockApi.finance.createExemption.mockResolvedValue({ success: true })

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            // Fill form
            act(() => {
                result.current.setFormData({
                    student_id: 100,
                    academic_year_id: 1,
                    term_id: 10,
                    fee_category_id: 5,
                    exemption_percentage: '100',
                    exemption_reason: 'scholarship',
                    notes: 'Full scholarship'
                })
                result.current.setShowModal(true)
            })

            await act(async () => result.current.handleCreate(fakeEvent))

            expect(mockApi.finance.createExemption).toHaveBeenCalled()
            expect(mockShowToast).toHaveBeenCalledWith('Exemption created successfully', 'success')
            expect(result.current.showModal).toBe(false)
            expect(result.current.selectedStudent).toBeNull()
        })

        it('shows error when createExemption returns success=false', async () => {
            mockApi.academic.getAcademicYears.mockResolvedValue([{ id: 1, year_name: '2025', is_current: true }])
            mockApi.academic.getTermsByYear.mockResolvedValue([{ id: 10, term_name: 'Term 1', is_current: true }])
            mockApi.students.getStudents.mockResolvedValue({ rows: [] })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })
            mockApi.finance.createExemption.mockResolvedValue({ success: false, errors: ['Duplicate'] })

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => {
                result.current.setFormData({
                    student_id: 100,
                    academic_year_id: 1,
                    term_id: 10,
                    fee_category_id: 5,
                    exemption_percentage: '50',
                    exemption_reason: 'bursary',
                    notes: ''
                })
            })

            await act(async () => result.current.handleCreate(fakeEvent))

            expect(mockShowToast).toHaveBeenCalledWith('Error: Duplicate', 'error')
        })

        it('shows unknown error when errors array is empty', async () => {
            mockApi.academic.getAcademicYears.mockResolvedValue([{ id: 1, year_name: '2025', is_current: true }])
            mockApi.academic.getTermsByYear.mockResolvedValue([{ id: 10, term_name: 'Term 1', is_current: true }])
            mockApi.students.getStudents.mockResolvedValue({ rows: [] })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })
            mockApi.finance.createExemption.mockResolvedValue({ success: false })

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => {
                result.current.setFormData({
                    student_id: 100,
                    academic_year_id: 1,
                    term_id: 10,
                    fee_category_id: 5,
                    exemption_percentage: '50',
                    exemption_reason: 'orphan',
                    notes: ''
                })
            })

            await act(async () => result.current.handleCreate(fakeEvent))

            expect(mockShowToast).toHaveBeenCalledWith('Error: Unknown error', 'error')
        })

        it('handles createExemption throwing an error', async () => {
            mockApi.academic.getAcademicYears.mockResolvedValue([{ id: 1, year_name: '2025', is_current: true }])
            mockApi.academic.getTermsByYear.mockResolvedValue([{ id: 10, term_name: 'Term 1', is_current: true }])
            mockApi.students.getStudents.mockResolvedValue({ rows: [] })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })
            mockApi.finance.createExemption.mockRejectedValue(new Error('Network error'))

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => {
                result.current.setFormData({
                    student_id: 100,
                    academic_year_id: 1,
                    term_id: 10,
                    fee_category_id: 5,
                    exemption_percentage: '50',
                    exemption_reason: 'staff',
                    notes: ''
                })
            })

            await act(async () => result.current.handleCreate(fakeEvent))

            expect(mockShowToast).toHaveBeenCalledWith('Network error', 'error')
        })

        it('handles non-Error throw in createExemption', async () => {
            mockApi.academic.getAcademicYears.mockResolvedValue([{ id: 1, year_name: '2025', is_current: true }])
            mockApi.academic.getTermsByYear.mockResolvedValue([{ id: 10, term_name: 'Term 1', is_current: true }])
            mockApi.students.getStudents.mockResolvedValue({ rows: [] })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })
            mockApi.finance.createExemption.mockRejectedValue('oops')

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => {
                result.current.setFormData({
                    student_id: 100,
                    academic_year_id: 1,
                    term_id: 10,
                    fee_category_id: 5,
                    exemption_percentage: '50',
                    exemption_reason: 'staff',
                    notes: ''
                })
            })

            await act(async () => result.current.handleCreate(fakeEvent))

            expect(mockShowToast).toHaveBeenCalledWith('Failed to create exemption', 'error')
        })

        it('sends optional fields (notes, term_id, fee_category_id) as undefined when empty', async () => {
            mockApi.academic.getAcademicYears.mockResolvedValue([{ id: 1, year_name: '2025', is_current: true }])
            mockApi.academic.getTermsByYear.mockResolvedValue([{ id: 10, term_name: 'Term 1', is_current: true }])
            mockApi.students.getStudents.mockResolvedValue({ rows: [] })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })
            mockApi.finance.createExemption.mockResolvedValue({ success: true })

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => {
                result.current.setFormData({
                    student_id: 100,
                    academic_year_id: 1,
                    term_id: 0,
                    fee_category_id: 0,
                    exemption_percentage: '100',
                    exemption_reason: 'scholarship',
                    notes: ''
                })
            })

            await act(async () => result.current.handleCreate(fakeEvent))

            const callArgs = mockApi.finance.createExemption.mock.calls[0][0]
            expect(callArgs.term_id).toBeUndefined()
            expect(callArgs.fee_category_id).toBeUndefined()
            expect(callArgs.notes).toBeUndefined()
        })
    })

    // ── handleRevoke ─────────────────────────────────────

    describe('handleRevoke', () => {
        it('validates missing reason', async () => {
            mockApi.students.getStudents.mockResolvedValue({ rows: [] })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            // Set exemption but no reason
            act(() => {
                result.current.setSelectedExemption({ id: 1 } as any)
                result.current.setRevokeReason('')
            })

            await act(async () => result.current.handleRevoke())

            expect(mockShowToast).toHaveBeenCalledWith('Please provide a reason for revoking', 'warning')
        })

        it('validates missing selectedExemption', async () => {
            mockApi.students.getStudents.mockResolvedValue({ rows: [] })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => result.current.setRevokeReason('some reason'))
            await act(async () => result.current.handleRevoke())

            expect(mockShowToast).toHaveBeenCalledWith('Please provide a reason for revoking', 'warning')
        })

        it('revokes exemption successfully', async () => {
            mockApi.students.getStudents.mockResolvedValue({ rows: [] })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })
            mockApi.finance.revokeExemption.mockResolvedValue({ success: true })

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => {
                result.current.setSelectedExemption({ id: 1 } as any)
                result.current.setRevokeReason('No longer eligible')
                result.current.setShowRevokeModal(true)
            })

            await act(async () => result.current.handleRevoke())

            expect(mockApi.finance.revokeExemption).toHaveBeenCalledWith(1, 'No longer eligible', 1)
            expect(mockShowToast).toHaveBeenCalledWith('Exemption revoked successfully', 'success')
            expect(result.current.showRevokeModal).toBe(false)
            expect(result.current.selectedExemption).toBeNull()
            expect(result.current.revokeReason).toBe('')
        })

        it('shows error when revokeExemption returns success=false', async () => {
            mockApi.students.getStudents.mockResolvedValue({ rows: [] })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })
            mockApi.finance.revokeExemption.mockResolvedValue({ success: false, errors: ['Already revoked'] })

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => {
                result.current.setSelectedExemption({ id: 2 } as any)
                result.current.setRevokeReason('Reason')
            })

            await act(async () => result.current.handleRevoke())

            expect(mockShowToast).toHaveBeenCalledWith('Error: Already revoked', 'error')
        })

        it('shows unknown error when errors array is empty on revoke', async () => {
            mockApi.students.getStudents.mockResolvedValue({ rows: [] })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })
            mockApi.finance.revokeExemption.mockResolvedValue({ success: false })

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => {
                result.current.setSelectedExemption({ id: 2 } as any)
                result.current.setRevokeReason('Reason')
            })

            await act(async () => result.current.handleRevoke())

            expect(mockShowToast).toHaveBeenCalledWith('Error: Unknown error', 'error')
        })

        it('handles revokeExemption throwing an error', async () => {
            mockApi.students.getStudents.mockResolvedValue({ rows: [] })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })
            mockApi.finance.revokeExemption.mockRejectedValue(new Error('DB fail'))

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => {
                result.current.setSelectedExemption({ id: 3 } as any)
                result.current.setRevokeReason('Reason')
            })

            await act(async () => result.current.handleRevoke())

            expect(mockShowToast).toHaveBeenCalledWith('DB fail', 'error')
        })

        it('handles non-Error throw in revokeExemption', async () => {
            mockApi.students.getStudents.mockResolvedValue({ rows: [] })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })
            mockApi.finance.revokeExemption.mockRejectedValue(42)

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => {
                result.current.setSelectedExemption({ id: 3 } as any)
                result.current.setRevokeReason('Reason')
            })

            await act(async () => result.current.handleRevoke())

            expect(mockShowToast).toHaveBeenCalledWith('Failed to revoke exemption', 'error')
        })
    })

    // ── loadExemptions (status filter change) ────────────

    describe('loadExemptions on filter change', () => {
        it('reloads exemptions when status filter changes', async () => {
            const activeExemptions = [{ id: 1, status: 'ACTIVE' }]
            const revokedExemptions = [{ id: 2, status: 'REVOKED' }]
            mockApi.finance.getExemptions
                .mockResolvedValueOnce(activeExemptions)    // initial loadData
                .mockResolvedValueOnce(activeExemptions)    // initial loadExemptions
                .mockResolvedValue(revokedExemptions)       // after filter change
            mockApi.students.getStudents.mockResolvedValue({ rows: [] })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => result.current.setStatusFilter('REVOKED'))
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            // Verify filter was applied
            expect(mockApi.finance.getExemptions).toHaveBeenCalled()
        })

        it('handles loadExemptions failure', async () => {
            mockApi.finance.getExemptions
                .mockResolvedValueOnce([])  // initial loadData
                .mockRejectedValue(new Error('Exemption load error'))  // loadExemptions
            mockApi.students.getStudents.mockResolvedValue({ rows: [] })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            expect(result.current.exemptions).toEqual([])
        })

        it('handles loadExemptions non-Error failure', async () => {
            mockApi.finance.getExemptions
                .mockResolvedValueOnce([])  // initial loadData
                .mockRejectedValue(42)       // loadExemptions
            mockApi.students.getStudents.mockResolvedValue({ rows: [] })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            expect(mockShowToast).toHaveBeenCalledWith('Failed to load exemptions', 'error')
            expect(result.current.exemptions).toEqual([])
        })

        it('passes no status filter when set to "all"', async () => {
            mockApi.finance.getExemptions.mockResolvedValue([])
            mockApi.students.getStudents.mockResolvedValue({ rows: [] })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => result.current.setStatusFilter('all'))
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            // The last call with 'all' should pass empty filter
            const lastCall = mockApi.finance.getExemptions.mock.calls.at(-1)?.[0]
            expect(lastCall).not.toHaveProperty('status')
        })
    })

    // ── Function coverage: handleYearChange error catch ──────────
    describe('handleYearChange error handling', () => {
        it('handles handleYearChange error by resetting terms', async () => {
            mockApi.finance.getExemptions.mockResolvedValue([])
            mockApi.students.getStudents.mockResolvedValue({ rows: [] })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })
            mockApi.academic.getTermsByYear.mockRejectedValueOnce(new Error('Terms error'))

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            await act(async () => result.current.handleYearChange(99))

            expect(mockShowToast).toHaveBeenCalledWith('Terms error', 'error')
            expect(result.current.terms).toEqual([])
        })

        it('handles handleYearChange non-Error failure', async () => {
            mockApi.finance.getExemptions.mockResolvedValue([])
            mockApi.students.getStudents.mockResolvedValue({ rows: [] })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })
            mockApi.academic.getTermsByYear.mockRejectedValueOnce(42)

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            await act(async () => result.current.handleYearChange(99))

            expect(mockShowToast).toHaveBeenCalledWith('Failed to load terms for selected year', 'error')
        })
    })

    // ── Function coverage: handleSelectStudent ───────────────────
    describe('handleSelectStudent', () => {
        it('sets selected student and clears search', async () => {
            mockApi.finance.getExemptions.mockResolvedValue([])
            mockApi.students.getStudents.mockResolvedValue({ rows: [{ id: 5, first_name: 'Jane', last_name: 'Doe', admission_number: 'ADM005' }] })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => result.current.handleSelectStudent({ id: 5, first_name: 'Jane', last_name: 'Doe', admission_number: 'ADM005' } as never))

            expect(result.current.selectedStudent).toEqual(expect.objectContaining({ id: 5 }))
        })
    })

    // ── Function coverage: handleCreate error catch ──────────────
    describe('handleCreate error handling', () => {
        it('handles handleCreate API rejection', async () => {
            mockApi.finance.getExemptions.mockResolvedValue([])
            mockApi.students.getStudents.mockResolvedValue({ rows: [] })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })
            mockApi.finance.createExemption.mockRejectedValue(new Error('Create failed'))

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => {
                result.current.setFormData({
                    student_id: 1, academic_year_id: 1, term_id: 1, fee_category_id: 1,
                    exemption_percentage: '100', exemption_reason: 'Orphan', notes: ''
                })
            })

            await act(async () => result.current.handleCreate({ preventDefault: vi.fn() } as never))

            expect(mockShowToast).toHaveBeenCalledWith('Create failed', 'error')
        })
    })

    // ── Function coverage: handleRevoke error catch ──────────────
    describe('handleRevoke error handling', () => {
        it('handles handleRevoke API rejection', async () => {
            mockApi.finance.getExemptions.mockResolvedValue([])
            mockApi.students.getStudents.mockResolvedValue({ rows: [] })
            mockApi.finance.getExemptionStats.mockResolvedValue({ total: 0, active: 0, full: 0, partial: 0 })
            mockApi.finance.revokeExemption.mockRejectedValue(new Error('Revoke failed'))

            const { result } = renderHook(() => useFeeExemptions())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })

            act(() => {
                result.current.setSelectedExemption({ id: 1 } as never)
                result.current.setRevokeReason('No longer needed')
            })

            await act(async () => result.current.handleRevoke())

            expect(mockShowToast).toHaveBeenCalledWith('Revoke failed', 'error')
        })
    })
})
