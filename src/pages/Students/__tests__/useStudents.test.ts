// @vitest-environment jsdom
/**
 * Tests for useStudents hook.
 *
 * Covers: initial state, data loading, pagination, search, print statement,
 * import dialog, view mode, filter state, and error paths.
 */
import { renderHook, act } from '@testing-library/react'
import type React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────

const mockShowToast = vi.fn()
vi.mock('../../../contexts/ToastContext', () => ({
    useToast: () => ({ showToast: mockShowToast }),
}))

const mockNavigate = vi.fn()
const mockLocation = { search: '' }
vi.mock('react-router-dom', () => ({
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocation,
    Link: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../../stores', () => {
    const schoolSettings = { school_name: 'Test School' }
    return {
        useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
            selector({ schoolSettings }),
    }
})

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

vi.mock('../../../utils/filters', () => ({
    normalizeFilters: (obj: Record<string, unknown>) => obj,
}))

vi.mock('../../../utils/print', () => ({
    printDocument: vi.fn(),
}))

// ── electronAPI stub ─────────────────────────────────────────

let mockApi: ReturnType<typeof buildElectronAPI>

function buildElectronAPI() {
    return {
        students: {
            getStudents: vi.fn().mockResolvedValue({ rows: [], totalCount: 0, page: 1, pageSize: 12 }),
        },
        academic: {
            getStreams: vi.fn().mockResolvedValue([]),
        },
        reports: {
            getStudentLedgerReport: vi.fn().mockResolvedValue({
                student: {},
                ledger: [],
                openingBalance: 0,
                closingBalance: 0,
            }),
        },
        menuEvents: {
            onOpenImportDialog: vi.fn().mockReturnValue(() => {}),
        },
    }
}

beforeEach(() => {
    mockApi = buildElectronAPI()
    ;(globalThis as Record<string, unknown>).electronAPI = mockApi
    mockShowToast.mockClear()
    mockNavigate.mockClear()
    mockLocation.search = ''
})

afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as Record<string, unknown>).electronAPI
})

// ── Lazy import ──────────────────────────────────────────────

const { useStudents } = await import('../useStudents')

// Helper
const fakeEvent = { preventDefault: vi.fn() } as unknown as React.SyntheticEvent
const tick = () => new Promise(resolve => setTimeout(resolve, 100))

describe('useStudents', () => {
    // ── Initial state ────────────────────────────────

    describe('initial state', () => {
        it('returns default values', async () => {
            const { result } = renderHook(() => useStudents())
            // Before data loads, check sync defaults
            expect(result.current.students).toEqual([])
            expect(result.current.totalCount).toBe(0)
            expect(result.current.streams).toEqual([])
            expect(result.current.loading).toBe(true)
            expect(result.current.search).toBe('')
            expect(result.current.showImport).toBe(false)
            expect(result.current.filters).toEqual({ streamId: '', isActive: true })
            expect(result.current.currentPage).toBe(1)
            expect(result.current.viewMode).toBe('list')
            expect(result.current.itemsPerPage).toBe(12)
            expect(result.current.totalPages).toBe(0)
            expect(result.current.printingId).toBeNull()

            await act(async () => { await tick() })
        })
    })

    // ── loadData ────────────────────────────────────

    describe('loadData', () => {
        it('loads streams and students on mount', async () => {
            const mockStreams = [{ id: 1, name: 'Form 1A' }, { id: 2, name: 'Form 2B' }]
            const mockStudentResult = {
                rows: [{ id: 1, first_name: 'John', last_name: 'Doe', admission_number: 'ADM001' }],
                totalCount: 1,
                page: 1,
                pageSize: 12,
            }
            mockApi.academic.getStreams.mockResolvedValue(mockStreams)
            mockApi.students.getStudents.mockResolvedValue(mockStudentResult)

            const { result } = renderHook(() => useStudents())
            await act(async () => { await tick() })

            expect(result.current.streams).toEqual(mockStreams)
            expect(result.current.students).toEqual(mockStudentResult.rows)
            expect(result.current.totalCount).toBe(1)
            expect(result.current.loading).toBe(false)
        })

        it('handles loadData failure with Error', async () => {
            mockApi.academic.getStreams.mockRejectedValue(new Error('Stream DB error'))

            const { result } = renderHook(() => useStudents())
            await act(async () => { await tick() })

            expect(result.current.streams).toEqual([])
            expect(result.current.students).toEqual([])
            expect(result.current.totalCount).toBe(0)
            expect(result.current.loading).toBe(false)
            expect(mockShowToast).toHaveBeenCalledWith('Stream DB error', 'error')
        })

        it('handles loadData failure with non-Error', async () => {
            mockApi.academic.getStreams.mockRejectedValue('crash')

            const { result: _result } = renderHook(() => useStudents())
            await act(async () => { await tick() })

            expect(mockShowToast).toHaveBeenCalledWith('Failed to load data', 'error')
        })
    })

    // ── loadStudents pagination ────────────────────────

    describe('loadStudents / pagination', () => {
        it('computes totalPages from totalCount', async () => {
            mockApi.students.getStudents.mockResolvedValue({
                rows: Array.from({ length: 12 }, (_, i) => ({ id: i + 1 })),
                totalCount: 25,
                page: 1,
                pageSize: 12,
            })

            const { result } = renderHook(() => useStudents())
            await act(async () => { await tick() })

            expect(result.current.totalPages).toBe(3) // ceil(25/12)
        })

        it('loads a specific page when currentPage changes', async () => {
            mockApi.students.getStudents.mockResolvedValue({ rows: [], totalCount: 50, page: 1, pageSize: 12 })

            const { result } = renderHook(() => useStudents())
            await act(async () => { await tick() })

            mockApi.students.getStudents.mockClear()
            mockApi.students.getStudents.mockResolvedValue({ rows: [{ id: 20 }], totalCount: 50, page: 2, pageSize: 12 })

            await act(async () => { result.current.setCurrentPage(2) })
            await act(async () => { await tick() })

            expect(mockApi.students.getStudents).toHaveBeenCalled()
            expect(result.current.students).toEqual([{ id: 20 }])
        })

        it('handles loadStudents failure with Error', async () => {
            // Let initial load succeed
            mockApi.students.getStudents.mockResolvedValueOnce({ rows: [], totalCount: 0, page: 1, pageSize: 12 })

            const { result } = renderHook(() => useStudents())
            await act(async () => { await tick() })

            mockApi.students.getStudents.mockRejectedValue(new Error('Query failed'))

            await act(async () => { result.current.setCurrentPage(2) })
            await act(async () => { await tick() })

            expect(result.current.students).toEqual([])
            expect(result.current.totalCount).toBe(0)
            expect(mockShowToast).toHaveBeenCalledWith('Query failed', 'error')
        })

        it('handles loadStudents failure with non-Error', async () => {
            mockApi.students.getStudents.mockResolvedValueOnce({ rows: [], totalCount: 0, page: 1, pageSize: 12 })

            const { result } = renderHook(() => useStudents())
            await act(async () => { await tick() })

            mockApi.students.getStudents.mockRejectedValue(42)

            await act(async () => { result.current.setCurrentPage(2) })
            await act(async () => { await tick() })

            expect(mockShowToast).toHaveBeenCalledWith('Failed to load students', 'error')
        })
    })

    // ── handleSearch ────────────────────────────────

    describe('handleSearch', () => {
        it('calls loadStudents with current search value', async () => {
            const { result } = renderHook(() => useStudents())
            await act(async () => { await tick() })

            mockApi.students.getStudents.mockClear()
            mockApi.students.getStudents.mockResolvedValue({
                rows: [{ id: 5, first_name: 'Jane' }],
                totalCount: 1,
                page: 1,
                pageSize: 12,
            })

            act(() => { result.current.setSearch('Jane') })
            await act(async () => { result.current.handleSearch(fakeEvent) })
            await act(async () => { await tick() })

            expect(fakeEvent.preventDefault).toHaveBeenCalled()
            expect(mockApi.students.getStudents).toHaveBeenCalled()
        })
    })

    // ── handlePrintStatement ────────────────────────

    describe('handlePrintStatement', () => {
        const sampleStudent = {
            id: 10,
            first_name: 'John',
            middle_name: 'K',
            last_name: 'Doe',
            admission_number: 'ADM010',
            stream_name: 'Form 1A',
        } as never

        it('prints statement successfully', async () => {
            const ledgerResult = {
                student: { id: 10 },
                ledger: [{ id: 1, amount: 500 }],
                openingBalance: 1000,
                closingBalance: 1500,
            }
            mockApi.reports.getStudentLedgerReport.mockResolvedValue(ledgerResult)

            const { result } = renderHook(() => useStudents())
            await act(async () => { await tick() })

            await act(async () => { await result.current.handlePrintStatement(sampleStudent) })

            expect(mockApi.reports.getStudentLedgerReport).toHaveBeenCalledWith(10)
            expect(result.current.printingId).toBeNull()
        })

        it('handles print statement failure with Error', async () => {
            mockApi.reports.getStudentLedgerReport.mockRejectedValue(new Error('Ledger fail'))

            const { result } = renderHook(() => useStudents())
            await act(async () => { await tick() })

            await act(async () => { await result.current.handlePrintStatement(sampleStudent) })

            expect(mockShowToast).toHaveBeenCalledWith('Ledger fail', 'error')
            expect(result.current.printingId).toBeNull()
        })

        it('handles print statement failure with non-Error', async () => {
            mockApi.reports.getStudentLedgerReport.mockRejectedValue(null)

            const { result } = renderHook(() => useStudents())
            await act(async () => { await tick() })

            await act(async () => { await result.current.handlePrintStatement(sampleStudent) })

            expect(mockShowToast).toHaveBeenCalledWith('Error generating statement', 'error')
            expect(result.current.printingId).toBeNull()
        })
    })

    // ── Import dialog ────────────────────────────────

    describe('import dialog', () => {
        it('openImport sets showImport to true', async () => {
            const { result } = renderHook(() => useStudents())
            await act(async () => { await tick() })

            act(() => { result.current.openImport() })
            expect(result.current.showImport).toBe(true)
        })

        it('closeImport sets showImport to false', async () => {
            const { result } = renderHook(() => useStudents())
            await act(async () => { await tick() })

            act(() => { result.current.openImport() })
            expect(result.current.showImport).toBe(true)

            act(() => { result.current.closeImport() })
            expect(result.current.showImport).toBe(false)
        })

        it('onImportSuccess closes dialog, shows toast, and reloads', async () => {
            const { result } = renderHook(() => useStudents())
            await act(async () => { await tick() })

            act(() => { result.current.openImport() })

            mockApi.students.getStudents.mockClear()
            mockApi.students.getStudents.mockResolvedValue({ rows: [{ id: 99 }], totalCount: 1, page: 1, pageSize: 12 })

            await act(async () => { result.current.onImportSuccess() })
            await act(async () => { await tick() })

            expect(result.current.showImport).toBe(false)
            expect(mockShowToast).toHaveBeenCalledWith('Students imported successfully', 'success')
            expect(mockApi.students.getStudents).toHaveBeenCalled()
        })

        it('opens import dialog when location has ?import=1', async () => {
            mockLocation.search = '?import=1'

            const { result } = renderHook(() => useStudents())
            await act(async () => { await tick() })

            expect(result.current.showImport).toBe(true)
        })

        it('registers and cleans up menuEvents.onOpenImportDialog', async () => {
            const unsubscribe = vi.fn()
            mockApi.menuEvents.onOpenImportDialog.mockReturnValue(unsubscribe)

            const { unmount } = renderHook(() => useStudents())
            await act(async () => { await tick() })

            expect(mockApi.menuEvents.onOpenImportDialog).toHaveBeenCalled()

            unmount()
            expect(unsubscribe).toHaveBeenCalled()
        })

        it('menuEvents.onOpenImportDialog callback sets showImport to true', async () => {
            let capturedCallback: (() => void) | undefined
            mockApi.menuEvents.onOpenImportDialog.mockImplementation((cb: () => void) => {
                capturedCallback = cb
                return () => {}
            })

            const { result } = renderHook(() => useStudents())
            await act(async () => { await tick() })

            expect(capturedCallback).toBeDefined()
            act(() => { capturedCallback!() })
            expect(result.current.showImport).toBe(true)
        })
    })

    // ── setters ────────────────────────────────────

    describe('setters', () => {
        it('setViewMode toggles between list and grid', async () => {
            const { result } = renderHook(() => useStudents())
            await act(async () => { await tick() })

            expect(result.current.viewMode).toBe('list')

            act(() => { result.current.setViewMode('grid') })
            expect(result.current.viewMode).toBe('grid')

            act(() => { result.current.setViewMode('list') })
            expect(result.current.viewMode).toBe('list')
        })

        it('setSearch updates search state', async () => {
            const { result } = renderHook(() => useStudents())
            await act(async () => { await tick() })

            act(() => { result.current.setSearch('test query') })
            expect(result.current.search).toBe('test query')
        })

        it('setFilters updates filter state', async () => {
            const { result } = renderHook(() => useStudents())
            await act(async () => { await tick() })

            act(() => { result.current.setFilters({ streamId: '5', isActive: false }) })
            expect(result.current.filters).toEqual({ streamId: '5', isActive: false })
        })

        it('setFilters resets currentPage to 1', async () => {
            mockApi.students.getStudents.mockResolvedValue({ rows: [], totalCount: 50, page: 1, pageSize: 12 })

            const { result } = renderHook(() => useStudents())
            await act(async () => { await tick() })

            await act(async () => { result.current.setCurrentPage(3) })
            await act(async () => { await tick() })

            act(() => { result.current.setFilters({ streamId: '2', isActive: true }) })
            await act(async () => { await tick() })

            expect(result.current.currentPage).toBe(1)
        })
    })

    // ── navigate ────────────────────────────────────

    describe('navigate', () => {
        it('exposes navigate function', async () => {
            const { result } = renderHook(() => useStudents())
            await act(async () => { await tick() })

            expect(result.current.navigate).toBe(mockNavigate)
        })
    })

    // ── Additional branch coverage ─────────────────────────

    describe('branch edge cases', () => {
        it('handles result with undefined rows (nullish coalescing)', async () => {
            mockApi.students.getStudents.mockResolvedValue({ totalCount: 3, page: 1, pageSize: 12 })

            const { result } = renderHook(() => useStudents())
            await act(async () => { await tick() })

            expect(result.current.students).toEqual([])
            expect(result.current.totalCount).toBe(3)
        })

        it('handles result with undefined totalCount (nullish coalescing)', async () => {
            mockApi.students.getStudents.mockResolvedValue({ rows: [{ id: 1 }], page: 1, pageSize: 12 })

            const { result } = renderHook(() => useStudents())
            await act(async () => { await tick() })

            expect(result.current.students).toEqual([{ id: 1 }])
            expect(result.current.totalCount).toBe(0)
        })

        it('handlePrintStatement uses empty string when middle_name is falsy', async () => {
            const studentNoMiddle = {
                id: 20,
                first_name: 'Ali',
                middle_name: '',
                last_name: 'Omar',
                admission_number: 'ADM020',
                stream_name: 'Form 2A',
            } as never

            const ledgerResult = {
                student: { id: 20 },
                ledger: [],
                openingBalance: 0,
                closingBalance: 0,
            }
            mockApi.reports.getStudentLedgerReport.mockResolvedValue(ledgerResult)

            const { result } = renderHook(() => useStudents())
            await act(async () => { await tick() })

            await act(async () => { await result.current.handlePrintStatement(studentNoMiddle) })

            expect(mockApi.reports.getStudentLedgerReport).toHaveBeenCalledWith(20)
            expect(result.current.printingId).toBeNull()
        })

        it('handlePrintStatement with undefined middle_name', async () => {
            const studentUndefined = {
                id: 21,
                first_name: 'Ben',
                last_name: 'Kamau',
                admission_number: 'ADM021',
                stream_name: 'Form 3A',
            } as never

            mockApi.reports.getStudentLedgerReport.mockResolvedValue({
                student: { id: 21 },
                ledger: [],
                openingBalance: 0,
                closingBalance: 0,
            })

            const { result } = renderHook(() => useStudents())
            await act(async () => { await tick() })

            await act(async () => { await result.current.handlePrintStatement(studentUndefined) })

            expect(result.current.printingId).toBeNull()
        })
    })

    // ── Function coverage: loadStudents failure with non-Error in loadData ──
    describe('loadData non-Error edge', () => {
        it('handles loadStudents rejection within loadData gracefully', async () => {
            mockApi.academic.getStreams.mockResolvedValue([])
            mockApi.students.getStudents.mockRejectedValue(new Error('inner fail'))

            const { result } = renderHook(() => useStudents())
            await act(async () => { await tick() })

            expect(result.current.students).toEqual([])
            expect(result.current.loading).toBe(false)
        })
    })

    // ── Branch coverage: schoolSettings falsy → undefined (L136 false branch) ──
    describe('handlePrintStatement with null schoolSettings', () => {
        it('passes undefined schoolSettings when store returns null', async () => {
            const storesMod = await import('../../../stores')
            const _origApp = storesMod.useAppStore
            vi.spyOn(storesMod, 'useAppStore').mockImplementation(
                ((selector: (s: Record<string, unknown>) => unknown) =>
                    selector({ schoolSettings: null })) as typeof _origApp
            )

            const student = {
                id: 50,
                first_name: 'Null',
                middle_name: 'S',
                last_name: 'Settings',
                admission_number: 'ADM050',
                stream_name: 'Form 1A',
            } as never

            mockApi.reports.getStudentLedgerReport.mockResolvedValue({
                student: { id: 50 },
                ledger: [],
                openingBalance: 0,
                closingBalance: 0,
            })

            const { result } = renderHook(() => useStudents())
            await act(async () => { await tick() })

            await act(async () => { await result.current.handlePrintStatement(student) })

            const { printDocument } = await import('../../../utils/print')
            expect(printDocument).toHaveBeenCalledWith(
                expect.objectContaining({ schoolSettings: undefined })
            )

            vi.mocked(storesMod.useAppStore).mockRestore()
        })
    })

    // ── Branch coverage: filters.isActive null → ?? undefined (L40) ──
    describe('loadStudents with isActive null', () => {
        it('normalizes null isActive to undefined via ?? operator', async () => {
            const { result } = renderHook(() => useStudents())
            await act(async () => { await tick() })

            mockApi.students.getStudents.mockClear()

            act(() => {
                result.current.setFilters({ streamId: '', isActive: null as unknown as boolean })
            })

            // Wait for effect to trigger loadStudents with updated filters
            await act(async () => { await tick() })

            expect(mockApi.students.getStudents).toHaveBeenCalledWith(
                expect.objectContaining({ isActive: undefined })
            )
        })
    })
})
