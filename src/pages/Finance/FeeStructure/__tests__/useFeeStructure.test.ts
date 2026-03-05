// @vitest-environment jsdom
/**
 * Tests for useFeeStructure hook.
 *
 * Covers: initial data loading, year/term selection, structure loading,
 * amount editing, save (shillings→cents), category creation, invoice generation,
 * and all error/edge paths.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────

const mockShowToast = vi.fn()
vi.mock('../../../../contexts/ToastContext', () => ({
    useToast: () => ({ showToast: mockShowToast }),
}))

const { mockUserRef } = vi.hoisted(() => ({
    mockUserRef: { value: { id: 1, username: 'admin', role: 'ADMIN' } as Record<string, unknown> | null }
}))

vi.mock('../../../../stores', () => ({
    useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
        selector({ user: mockUserRef.value }),
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

// Don't mock the real format utils – they are pure functions
// vi.mock format is NOT needed; the hook uses actual conversion

// ── electronAPI stub ─────────────────────────────────────────

let mockApi: ReturnType<typeof buildElectronAPI>

function buildElectronAPI() {
    return {
        academic: {
            getAcademicYears: vi.fn().mockResolvedValue([]),
            getStreams: vi.fn().mockResolvedValue([]),
            getCurrentAcademicYear: vi.fn().mockResolvedValue(null),
            getCurrentTerm: vi.fn().mockResolvedValue(null),
            getTermsByYear: vi.fn().mockResolvedValue([]),
        },
        finance: {
            getFeeCategories: vi.fn().mockResolvedValue([]),
            getFeeStructure: vi.fn().mockResolvedValue([]),
            saveFeeStructure: vi.fn().mockResolvedValue({ success: true }),
            createFeeCategory: vi.fn().mockResolvedValue({ success: true }),
            generateBatchInvoices: vi.fn().mockResolvedValue({ success: true, count: 5 }),
        },
    }
}

beforeEach(() => {
    mockApi = buildElectronAPI()
    ;(globalThis as Record<string, unknown>).electronAPI = mockApi
    mockShowToast.mockClear()
    mockUserRef.value = { id: 1, username: 'admin', role: 'ADMIN' }
})

afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as Record<string, unknown>).electronAPI
})

// ── Lazy import ──────────────────────────────────────────────

const { useFeeStructure } = await import('../useFeeStructure')

describe('useFeeStructure', () => {
    // ── loadInitialData ────────────────────────────────────

    describe('loadInitialData', () => {
        it('loads years, streams, categories on mount', async () => {
            const mockYears = [{ id: 1, year_name: '2025', is_current: true }]
            const mockStreams = [{ id: 10, name: 'East', grade_id: 1 }]
            const mockCategories = [{ id: 5, category_name: 'Tuition' }]

            mockApi.academic.getAcademicYears.mockResolvedValue(mockYears)
            mockApi.academic.getStreams.mockResolvedValue(mockStreams)
            mockApi.finance.getFeeCategories.mockResolvedValue(mockCategories)
            mockApi.academic.getCurrentAcademicYear.mockResolvedValue({ id: 1, year_name: '2025' })
            mockApi.academic.getTermsByYear.mockResolvedValue([{ id: 20, term_name: 'Term 1' }])
            mockApi.academic.getCurrentTerm.mockResolvedValue({ id: 20, term_name: 'Term 1' })

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            expect(result.current.years).toEqual(mockYears)
            expect(result.current.streams).toEqual(mockStreams)
            expect(result.current.categories).toEqual(mockCategories)
            expect(result.current.selectedYear).toBe('1')
            expect(result.current.selectedTerm).toBe('20')
        })

        it('falls back to first term when no current term', async () => {
            mockApi.academic.getCurrentAcademicYear.mockResolvedValue({ id: 1, year_name: '2025' })
            mockApi.academic.getTermsByYear.mockResolvedValue([{ id: 30, term_name: 'Term 2' }, { id: 31, term_name: 'Term 3' }])
            mockApi.academic.getCurrentTerm.mockResolvedValue(null)

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            expect(result.current.selectedYear).toBe('1')
            expect(result.current.selectedTerm).toBe('30')
        })

        it('does not set term when no current year', async () => {
            mockApi.academic.getCurrentAcademicYear.mockResolvedValue(null)

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            expect(result.current.selectedYear).toBe('')
            expect(result.current.selectedTerm).toBe('')
        })

        it('handles loadInitialData failure', async () => {
            mockApi.academic.getAcademicYears.mockRejectedValue(new Error('DB down'))

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            expect(result.current.years).toEqual([])
            expect(mockShowToast).toHaveBeenCalledWith('DB down', 'error')
        })

        it('handles loadInitialData non-Error failure', async () => {
            mockApi.academic.getAcademicYears.mockRejectedValue('boom')

            const { result: _result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            expect(mockShowToast).toHaveBeenCalledWith('Failed to load initial data', 'error')
        })
    })

    // ── loadStructure (triggered by year/term) ─────────────

    describe('loadStructure', () => {
        it('loads fee structure data and converts cents to shillings', async () => {
            mockApi.academic.getCurrentAcademicYear.mockResolvedValue({ id: 1 })
            mockApi.academic.getTermsByYear.mockResolvedValue([{ id: 20 }])
            mockApi.academic.getCurrentTerm.mockResolvedValue({ id: 20 })
            mockApi.finance.getFeeStructure.mockResolvedValue([
                { stream_id: 10, student_type: 'regular', fee_category_id: 5, amount: 150000 },
            ])

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)) })

            // 150000 cents = 1500 shillings
            expect(result.current.structure['10-regular-5']).toBe(1500)
            expect(result.current.loading).toBe(false)
        })

        it('skips rows without required keys', async () => {
            mockApi.academic.getCurrentAcademicYear.mockResolvedValue({ id: 1 })
            mockApi.academic.getTermsByYear.mockResolvedValue([{ id: 20 }])
            mockApi.academic.getCurrentTerm.mockResolvedValue({ id: 20 })
            mockApi.finance.getFeeStructure.mockResolvedValue([
                { stream_id: null, student_type: 'regular', fee_category_id: 5, amount: 100 },
            ])

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)) })

            expect(Object.keys(result.current.structure)).toHaveLength(0)
        })

        it('clears structure when no year/term selected', async () => {
            // loadInitialData returns no current year → selectedYear stays ''
            mockApi.academic.getCurrentAcademicYear.mockResolvedValue(null)

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            expect(result.current.structure).toEqual({})
            expect(result.current.loading).toBe(false)
        })

        it('handles loadStructure failure', async () => {
            mockApi.academic.getCurrentAcademicYear.mockResolvedValue({ id: 1 })
            mockApi.academic.getTermsByYear.mockResolvedValue([{ id: 20 }])
            mockApi.academic.getCurrentTerm.mockResolvedValue({ id: 20 })
            mockApi.finance.getFeeStructure.mockRejectedValue(new Error('Structure fail'))

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)) })

            expect(result.current.structure).toEqual({})
            expect(result.current.loading).toBe(false)
            expect(mockShowToast).toHaveBeenCalledWith('Structure fail', 'error')
        })
    })

    // ── handleAmountChange ─────────────────────────────────

    describe('handleAmountChange', () => {
        it('sets structure value for the composite key', async () => {
            mockApi.academic.getCurrentAcademicYear.mockResolvedValue(null)

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => result.current.handleAmountChange(10, 'regular', 5, '2500'))
            expect(result.current.structure['10-regular-5']).toBe(2500)
        })

        it('defaults to 0 for non-numeric input', async () => {
            mockApi.academic.getCurrentAcademicYear.mockResolvedValue(null)

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => result.current.handleAmountChange(10, 'regular', 5, 'abc'))
            expect(result.current.structure['10-regular-5']).toBe(0)
        })
    })

    // ── handleYearChange ───────────────────────────────────

    describe('handleYearChange', () => {
        it('loads terms for the new year', async () => {
            mockApi.academic.getCurrentAcademicYear.mockResolvedValue(null)
            mockApi.academic.getTermsByYear.mockResolvedValue([{ id: 50, term_name: 'T1' }])

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            await act(async () => result.current.handleYearChange('2'))

            expect(result.current.selectedYear).toBe('2')
            expect(mockApi.academic.getTermsByYear).toHaveBeenCalledWith(2)
        })

        it('clears state when yearValue is 0 (empty selection)', async () => {
            mockApi.academic.getCurrentAcademicYear.mockResolvedValue(null)

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            await act(async () => result.current.handleYearChange('0'))

            expect(result.current.selectedYear).toBe('0')
            expect(result.current.terms).toEqual([])
            expect(result.current.selectedTerm).toBe('')
        })

        it('handles year change failure', async () => {
            mockApi.academic.getCurrentAcademicYear.mockResolvedValue(null)
            mockApi.academic.getTermsByYear.mockRejectedValue(new Error('Year fail'))

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            await act(async () => result.current.handleYearChange('3'))

            expect(mockShowToast).toHaveBeenCalledWith('Year fail', 'error')
            expect(result.current.terms).toEqual([])
        })

        it('handles year change non-Error failure', async () => {
            mockApi.academic.getCurrentAcademicYear.mockResolvedValue(null)
            mockApi.academic.getTermsByYear.mockRejectedValue(99)

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            await act(async () => result.current.handleYearChange('4'))

            expect(mockShowToast).toHaveBeenCalledWith('Failed to load terms', 'error')
        })
    })

    // ── handleSave ─────────────────────────────────────────

    describe('handleSave', () => {
        it('shows error when year/term not selected', async () => {
            mockApi.academic.getCurrentAcademicYear.mockResolvedValue(null)

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            await act(async () => result.current.handleSave())

            expect(mockShowToast).toHaveBeenCalledWith('Please select academic year and term', 'error')
        })

        it('saves structure converting shillings to cents', async () => {
            mockApi.academic.getCurrentAcademicYear.mockResolvedValue({ id: 1 })
            mockApi.academic.getTermsByYear.mockResolvedValue([{ id: 20 }])
            mockApi.academic.getCurrentTerm.mockResolvedValue({ id: 20 })

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)) })

            // Set some amounts
            act(() => result.current.handleAmountChange(10, 'regular', 5, '1500'))

            await act(async () => result.current.handleSave())

            expect(mockApi.finance.saveFeeStructure).toHaveBeenCalled()
            const savedData = mockApi.finance.saveFeeStructure.mock.calls[0][0]
            const match = savedData.find((d: Record<string, unknown>) => d.stream_id === 10)
            // 1500 shillings = 150000 cents
            expect(match.amount).toBe(150000)
            expect(mockShowToast).toHaveBeenCalledWith('Fee structure saved successfully', 'success')
            expect(result.current.saving).toBe(false)
        })

        it('handles save failure', async () => {
            mockApi.academic.getCurrentAcademicYear.mockResolvedValue({ id: 1 })
            mockApi.academic.getTermsByYear.mockResolvedValue([{ id: 20 }])
            mockApi.academic.getCurrentTerm.mockResolvedValue({ id: 20 })
            mockApi.finance.saveFeeStructure.mockRejectedValue(new Error('Save fail'))

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)) })

            await act(async () => result.current.handleSave())

            expect(mockShowToast).toHaveBeenCalledWith('Save fail', 'error')
            expect(result.current.saving).toBe(false)
        })

        it('handles save non-Error failure', async () => {
            mockApi.academic.getCurrentAcademicYear.mockResolvedValue({ id: 1 })
            mockApi.academic.getTermsByYear.mockResolvedValue([{ id: 20 }])
            mockApi.academic.getCurrentTerm.mockResolvedValue({ id: 20 })
            // eslint-disable-next-line unicorn/no-useless-undefined
            mockApi.finance.saveFeeStructure.mockRejectedValue(undefined)

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)) })

            await act(async () => result.current.handleSave())

            expect(mockShowToast).toHaveBeenCalledWith('Failed to save fee structure', 'error')
        })
    })

    // ── handleCreateCategory ───────────────────────────────

    describe('handleCreateCategory', () => {
        it('shows warning when name is empty', async () => {
            mockApi.academic.getCurrentAcademicYear.mockResolvedValue(null)

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            await act(async () => result.current.handleCreateCategory())

            expect(mockShowToast).toHaveBeenCalledWith('Category name is required', 'warning')
        })

        it('creates category and reloads list', async () => {
            mockApi.academic.getCurrentAcademicYear.mockResolvedValue(null)
            mockApi.finance.createFeeCategory.mockResolvedValue({ success: true })
            mockApi.finance.getFeeCategories
                .mockResolvedValueOnce([]) // initial load
                .mockResolvedValueOnce([{ id: 99, category_name: 'New Cat' }]) // after create

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => { result.current.setNewCategoryName('New Cat'); result.current.setShowNewCategory(true) })

            await act(async () => result.current.handleCreateCategory())

            expect(mockApi.finance.createFeeCategory).toHaveBeenCalledWith('New Cat', '')
            expect(result.current.categories).toEqual([{ id: 99, category_name: 'New Cat' }])
            expect(result.current.newCategoryName).toBe('')
            expect(result.current.showNewCategory).toBe(false)
            expect(mockShowToast).toHaveBeenCalledWith('Category created', 'success')
        })

        it('handles create category failure', async () => {
            mockApi.academic.getCurrentAcademicYear.mockResolvedValue(null)
            mockApi.finance.createFeeCategory.mockRejectedValue(new Error('Create fail'))

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => result.current.setNewCategoryName('Test'))
            await act(async () => result.current.handleCreateCategory())

            expect(mockShowToast).toHaveBeenCalledWith('Create fail', 'error')
        })
    })

    // ── handleGenerateInvoices ─────────────────────────────

    describe('handleGenerateInvoices', () => {
        it('shows error when year/term not selected', async () => {
            mockApi.academic.getCurrentAcademicYear.mockResolvedValue(null)

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            await act(async () => result.current.handleGenerateInvoices())

            expect(mockShowToast).toHaveBeenCalledWith('Please select academic year and term before generating invoices', 'error')
        })

        it('generates invoices successfully', async () => {
            mockApi.academic.getCurrentAcademicYear.mockResolvedValue({ id: 1 })
            mockApi.academic.getTermsByYear.mockResolvedValue([{ id: 20 }])
            mockApi.academic.getCurrentTerm.mockResolvedValue({ id: 20 })
            mockApi.finance.generateBatchInvoices.mockResolvedValue({ success: true, count: 10 })

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)) })

            await act(async () => result.current.handleGenerateInvoices())

            expect(mockApi.finance.generateBatchInvoices).toHaveBeenCalledWith(1, 20, 1)
            expect(mockShowToast).toHaveBeenCalledWith('Successfully generated 10 invoices', 'success')
            expect(result.current.generating).toBe(false)
        })

        it('shows error when generation result is not success', async () => {
            mockApi.academic.getCurrentAcademicYear.mockResolvedValue({ id: 1 })
            mockApi.academic.getTermsByYear.mockResolvedValue([{ id: 20 }])
            mockApi.academic.getCurrentTerm.mockResolvedValue({ id: 20 })
            mockApi.finance.generateBatchInvoices.mockResolvedValue({ success: false })

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)) })

            await act(async () => result.current.handleGenerateInvoices())

            expect(mockShowToast).toHaveBeenCalledWith('Failed to generate invoices', 'error')
        })

        it('handles generate thrown Error', async () => {
            mockApi.academic.getCurrentAcademicYear.mockResolvedValue({ id: 1 })
            mockApi.academic.getTermsByYear.mockResolvedValue([{ id: 20 }])
            mockApi.academic.getCurrentTerm.mockResolvedValue({ id: 20 })
            mockApi.finance.generateBatchInvoices.mockRejectedValue(new Error('Net error'))

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)) })

            await act(async () => result.current.handleGenerateInvoices())

            expect(mockShowToast).toHaveBeenCalledWith('Error: Net error', 'error')
        })

        it('handles generate non-Error failure', async () => {
            mockApi.academic.getCurrentAcademicYear.mockResolvedValue({ id: 1 })
            mockApi.academic.getTermsByYear.mockResolvedValue([{ id: 20 }])
            mockApi.academic.getCurrentTerm.mockResolvedValue({ id: 20 })
            mockApi.finance.generateBatchInvoices.mockRejectedValue('bad')

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)) })

            await act(async () => result.current.handleGenerateInvoices())

            expect(mockShowToast).toHaveBeenCalledWith('Error: Unknown error', 'error')
        })
    })

    // ── Additional branch coverage ─────────────────────────

    describe('branch edge cases', () => {
        it('handleYearChange keeps selectedTerm when it exists in loaded terms', async () => {
            mockApi.academic.getCurrentAcademicYear.mockResolvedValue({ id: 1 })
            mockApi.academic.getCurrentTerm.mockResolvedValue({ id: 20 })
            mockApi.academic.getTermsByYear.mockResolvedValue([
                { id: 20, term_name: 'T1' },
                { id: 21, term_name: 'T2' },
            ])

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)) })

            // selectedTerm should be '20' from initial load
            expect(result.current.selectedTerm).toBe('20')

            // Change year but term 20 still exists in the new terms list
            mockApi.academic.getTermsByYear.mockResolvedValue([
                { id: 20, term_name: 'T1' },
                { id: 22, term_name: 'T3' },
            ])

            await act(async () => result.current.handleYearChange('2'))

            // selectedTerm should remain '20' since it exists in the new terms
            expect(result.current.selectedTerm).toBe('20')
        })

        it('handleYearChange selects first term when current term not in loaded list', async () => {
            mockApi.academic.getCurrentAcademicYear.mockResolvedValue({ id: 1 })
            mockApi.academic.getCurrentTerm.mockResolvedValue({ id: 20 })
            mockApi.academic.getTermsByYear.mockResolvedValue([{ id: 20, term_name: 'T1' }])

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)) })

            // Change year so term 20 no longer exists
            mockApi.academic.getTermsByYear.mockResolvedValue([
                { id: 30, term_name: 'New T1' },
                { id: 31, term_name: 'New T2' },
            ])

            await act(async () => result.current.handleYearChange('3'))

            expect(result.current.selectedTerm).toBe('30')
        })

        it('handleSave skips structure entries with negative amounts', async () => {
            mockApi.academic.getCurrentAcademicYear.mockResolvedValue({ id: 1 })
            mockApi.academic.getTermsByYear.mockResolvedValue([{ id: 20 }])
            mockApi.academic.getCurrentTerm.mockResolvedValue({ id: 20 })

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)) })

            // Set one positive and one negative amount
            act(() => {
                result.current.handleAmountChange(10, 'regular', 5, '500')
                result.current.handleAmountChange(11, 'regular', 6, '-100')
            })

            await act(async () => result.current.handleSave())

            const savedData = mockApi.finance.saveFeeStructure.mock.calls[0][0]
            // Only the positive amount should be included
            expect(savedData).toHaveLength(1)
            expect(savedData[0].stream_id).toBe(10)
        })

        it('handleCreateCategory handles non-Error exception', async () => {
            mockApi.academic.getCurrentAcademicYear.mockResolvedValue(null)
            mockApi.finance.createFeeCategory.mockRejectedValue(42)

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => result.current.setNewCategoryName('Test'))
            await act(async () => result.current.handleCreateCategory())

            expect(mockShowToast).toHaveBeenCalledWith('Failed to create category', 'error')
        })

        // ── Branch coverage: handleGenerateInvoices when user is not signed in (L215-216) ──
        it('handleGenerateInvoices shows error when user is not signed in', async () => {
            mockUserRef.value = null
            mockApi.academic.getCurrentAcademicYear.mockResolvedValue({ id: 1, year_name: '2025' })
            mockApi.academic.getTermsByYear.mockResolvedValue([{ id: 20, term_name: 'Term 1' }])
            mockApi.academic.getCurrentTerm.mockResolvedValue({ id: 20, term_name: 'Term 1' })

            const { result } = renderHook(() => useFeeStructure())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)) })

            await act(async () => result.current.handleGenerateInvoices())

            expect(mockShowToast).toHaveBeenCalledWith(
                'You must be signed in to generate invoices',
                'error'
            )
            expect(mockApi.finance.generateBatchInvoices).not.toHaveBeenCalled()
        })
    })
})
