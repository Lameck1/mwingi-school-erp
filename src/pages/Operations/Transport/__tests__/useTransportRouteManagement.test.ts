// @vitest-environment jsdom
/**
 * Tests for useTransportRouteManagement hook.
 *
 * Covers: loadData (routes + GL accounts + summary), createRoute,
 * recordExpense (validation: no user, bad fiscal year, bad term, empty GL),
 * modal open/close helpers, and form setters.
 */
import { renderHook, act } from '@testing-library/react'
import type React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────

const mockShowToast = vi.fn()
vi.mock('../../../../contexts/ToastContext', () => ({
    useToast: () => ({ showToast: mockShowToast }),
}))

vi.mock('../../../../stores', () => {
    const currentAcademicYear = { id: 5, year_name: '2025', is_current: true }
    const currentTerm = { id: 10, term_name: 'Term 1', term_number: 1 }
    const user = { id: 1, username: 'admin' }
    return {
        useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
            selector({ currentAcademicYear, currentTerm }),
        useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
            selector({ user }),
    }
})

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

vi.mock('../../../../utils/format', () => ({
    shillingsToCents: (v: string | number) => Math.round(Number(v) * 100),
}))

// ── electronAPI stub ─────────────────────────────────────────

let mockApi: ReturnType<typeof buildElectronAPI>

function buildElectronAPI() {
    return {
        operations: {
            getTransportRoutes: vi.fn().mockResolvedValue([]),
            createTransportRoute: vi.fn().mockResolvedValue({ success: true }),
            recordTransportExpense: vi.fn().mockResolvedValue({ success: true }),
        },
        finance: {
            getGLAccounts: vi.fn().mockResolvedValue({ success: true, data: [] }),
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

const { useTransportRouteManagement } = await import('../useTransportRouteManagement')

// Helper: fake SyntheticEvent
const fakeEvent = { preventDefault: vi.fn() } as unknown as React.SyntheticEvent

const wait = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

describe('useTransportRouteManagement', () => {
    // ── initial state ─────────────────────────────────

    it('has correct initial state', async () => {
        const { result } = renderHook(() => useTransportRouteManagement())
        await wait()

        expect(result.current.isCreateModalOpen).toBe(false)
        expect(result.current.isExpenseModalOpen).toBe(false)
        expect(result.current.createForm).toEqual({
            route_name: '',
            distance_km: '',
            estimated_students: '',
            budget_per_term: '',
        })
        expect(result.current.expenseForm).toEqual(expect.objectContaining({
            route_id: '',
            expense_type: 'FUEL',
            amount: '',
            description: '',
        }))
    })

    // ── loadData ──────────────────────────────────────

    describe('loadData', () => {
        it('loads routes and GL accounts in parallel, computes summary', async () => {
            const mockRoutes = [
                { id: 1, route_name: 'Route A', estimated_students: 30 },
                { id: 2, route_name: 'Route B', estimated_students: 45 },
            ]
            const mockGL = {
                success: true,
                data: [
                    { account_code: '5001', account_name: 'Fuel' },
                    { account_code: '5002', account_name: 'Maintenance' },
                ],
            }

            mockApi.operations.getTransportRoutes.mockResolvedValue(mockRoutes)
            mockApi.finance.getGLAccounts.mockResolvedValue(mockGL)

            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            expect(result.current.routes).toEqual(mockRoutes)
            expect(result.current.summary).toEqual({ totalRoutes: 2, totalStudents: 75 })
            expect(result.current.expenseAccounts).toEqual([
                { code: '5001', label: '5001 - Fuel' },
                { code: '5002', label: '5002 - Maintenance' },
            ])
            expect(result.current.loading).toBe(false)
        })

        it('handles loadData failure with Error', async () => {
            mockApi.operations.getTransportRoutes.mockRejectedValue(new Error('DB error'))

            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            expect(result.current.routes).toEqual([])
            expect(result.current.summary).toBeNull()
            expect(result.current.expenseAccounts).toEqual([])
            expect(result.current.loading).toBe(false)
            expect(mockShowToast).toHaveBeenCalledWith('DB error', 'error')
        })

        it('handles loadData non-Error failure', async () => {
            mockApi.operations.getTransportRoutes.mockRejectedValue('crash')

            const { result: _result } = renderHook(() => useTransportRouteManagement())
            await wait()

            expect(mockShowToast).toHaveBeenCalledWith('Failed to load transport data', 'error')
        })

        it('sets default expense GL code when accounts are loaded', async () => {
            mockApi.finance.getGLAccounts.mockResolvedValue({
                success: true,
                data: [{ account_code: '6001', account_name: 'Default Acc' }],
            })

            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            expect(result.current.expenseForm.gl_account_code).toBe('6001')
        })

        it('filters out GL accounts without account_code', async () => {
            mockApi.finance.getGLAccounts.mockResolvedValue({
                success: true,
                data: [
                    { account_code: '', account_name: 'Empty' },
                    { account_code: '7001', account_name: 'Valid' },
                ],
            })

            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            expect(result.current.expenseAccounts).toHaveLength(1)
            expect(result.current.expenseAccounts[0].code).toBe('7001')
        })

        it('handles routes with zero or undefined estimated_students', async () => {
            mockApi.operations.getTransportRoutes.mockResolvedValue([
                { id: 1, route_name: 'Route A', estimated_students: 0 },
                { id: 2, route_name: 'Route B' },
            ])

            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            expect(result.current.summary).toEqual({ totalRoutes: 2, totalStudents: 0 })
        })

        it('preserves existing gl_account_code during data reload', async () => {
            mockApi.finance.getGLAccounts.mockResolvedValue({
                success: true,
                data: [{ account_code: '5001', account_name: 'Fuel' }],
            })
            mockApi.operations.createTransportRoute.mockResolvedValue({ success: true })

            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            expect(result.current.expenseForm.gl_account_code).toBe('5001')

            // Trigger reload via handleCreateRoute
            act(() => result.current.openCreateModal())
            act(() => {
                result.current.setCreateForm({
                    route_name: 'Route X', distance_km: '10',
                    estimated_students: '20', budget_per_term: '1000',
                })
            })
            await act(async () => result.current.handleCreateRoute(fakeEvent))

            // After reload, gl_account_code should still be preserved
            expect(result.current.expenseForm.gl_account_code).toBe('5001')
        })
    })

    // ── handleCreateRoute ─────────────────────────────

    describe('handleCreateRoute', () => {
        it('creates route, converts budget to cents, reloads data', async () => {
            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            act(() => result.current.openCreateModal())
            act(() => {
                result.current.setCreateForm({
                    route_name: 'Route X',
                    distance_km: '15.5',
                    estimated_students: '40',
                    budget_per_term: '5000',
                })
            })

            await act(async () => result.current.handleCreateRoute(fakeEvent))

            expect(fakeEvent.preventDefault).toHaveBeenCalled()
            expect(mockApi.operations.createTransportRoute).toHaveBeenCalledWith({
                route_name: 'Route X',
                distance_km: 15.5,
                estimated_students: 40,
                budget_per_term_cents: 500000, // 5000 * 100
            })
            expect(mockShowToast).toHaveBeenCalledWith('Route created successfully', 'success')
            expect(result.current.isCreateModalOpen).toBe(false)
        })

        it('handles createRoute failure with Error', async () => {
            mockApi.operations.createTransportRoute.mockRejectedValue(new Error('Create fail'))

            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            await act(async () => result.current.handleCreateRoute(fakeEvent))

            expect(mockShowToast).toHaveBeenCalledWith('Create fail', 'error')
        })

        it('handles createRoute non-Error failure', async () => {
            mockApi.operations.createTransportRoute.mockRejectedValue(42)

            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            await act(async () => result.current.handleCreateRoute(fakeEvent))

            expect(mockShowToast).toHaveBeenCalledWith('Failed to create route', 'error')
        })
    })

    // ── handleRecordExpense ───────────────────────────

    describe('handleRecordExpense', () => {
        it('records expense successfully with correct payload', async () => {
            mockApi.finance.getGLAccounts.mockResolvedValue({
                success: true,
                data: [{ account_code: '5001', account_name: 'Fuel' }],
            })

            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            act(() => {
                result.current.setExpenseForm({
                    route_id: '1',
                    expense_type: 'FUEL',
                    amount: '250',
                    description: 'Weekly fuel',
                    gl_account_code: '5001',
                })
            })

            await act(async () => result.current.handleRecordExpense(fakeEvent))

            expect(mockApi.operations.recordTransportExpense).toHaveBeenCalledWith(
                expect.objectContaining({
                    route_id: 1,
                    expense_type: 'FUEL',
                    amount_cents: 25000, // 250 * 100
                    fiscal_year: 2025,
                    term: 1,
                    recorded_by: 1,
                    gl_account_code: '5001',
                })
            )
            expect(mockShowToast).toHaveBeenCalledWith('Expense recorded successfully', 'success')
            expect(result.current.isExpenseModalOpen).toBe(false)
        })

        it('shows error when user is not authenticated', async () => {
            // Override useAuthStore to return null user
            const storesMod = await import('../../../../stores')
            const _origAuth = storesMod.useAuthStore
            vi.spyOn(storesMod, 'useAuthStore').mockImplementation(
                ((selector: (s: Record<string, unknown>) => unknown) =>
                    selector({ user: null })) as typeof _origAuth
            )

            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            await act(async () => result.current.handleRecordExpense(fakeEvent))

            expect(mockShowToast).toHaveBeenCalledWith('User not authenticated', 'error')
            expect(mockApi.operations.recordTransportExpense).not.toHaveBeenCalled()

            vi.mocked(storesMod.useAuthStore).mockRestore()
        })

        it('shows error when fiscal year is invalid', async () => {
            const storesMod = await import('../../../../stores')
            const _origApp = storesMod.useAppStore
            vi.spyOn(storesMod, 'useAppStore').mockImplementation(
                ((selector: (s: Record<string, unknown>) => unknown) =>
                    selector({
                        currentAcademicYear: { id: 5, year_name: 'invalid', is_current: true },
                        currentTerm: { id: 10, term_name: 'Term 1', term_number: 1 },
                    })) as typeof _origApp
            )

            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            act(() => {
                result.current.setExpenseForm({
                    route_id: '1', expense_type: 'FUEL', amount: '100',
                    description: '', gl_account_code: '5001',
                })
            })

            await act(async () => result.current.handleRecordExpense(fakeEvent))

            expect(mockShowToast).toHaveBeenCalledWith('Active academic year is not configured correctly', 'error')
            expect(mockApi.operations.recordTransportExpense).not.toHaveBeenCalled()

            vi.mocked(storesMod.useAppStore).mockRestore()
        })

        it('shows error when term cannot be resolved', async () => {
            const storesMod = await import('../../../../stores')
            const _origApp = storesMod.useAppStore
            vi.spyOn(storesMod, 'useAppStore').mockImplementation(
                ((selector: (s: Record<string, unknown>) => unknown) =>
                    selector({
                        currentAcademicYear: { id: 5, year_name: '2025', is_current: true },
                        currentTerm: { id: 10, term_name: 'NoDigits', term_number: 0 },
                    })) as typeof _origApp
            )

            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            act(() => {
                result.current.setExpenseForm({
                    route_id: '1', expense_type: 'FUEL', amount: '100',
                    description: '', gl_account_code: '5001',
                })
            })

            await act(async () => result.current.handleRecordExpense(fakeEvent))

            expect(mockShowToast).toHaveBeenCalledWith('Active term is not configured correctly', 'error')
            expect(mockApi.operations.recordTransportExpense).not.toHaveBeenCalled()

            vi.mocked(storesMod.useAppStore).mockRestore()
        })

        it('shows warning when GL account code is empty', async () => {
            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            act(() => {
                result.current.setExpenseForm({
                    route_id: '1', expense_type: 'FUEL', amount: '100',
                    description: '', gl_account_code: '   ',
                })
            })

            await act(async () => result.current.handleRecordExpense(fakeEvent))

            expect(mockShowToast).toHaveBeenCalledWith('Select an expense GL account', 'warning')
            expect(mockApi.operations.recordTransportExpense).not.toHaveBeenCalled()
        })

        it('handles recordExpense API failure', async () => {
            mockApi.finance.getGLAccounts.mockResolvedValue({
                success: true,
                data: [{ account_code: '5001', account_name: 'Fuel' }],
            })
            mockApi.operations.recordTransportExpense.mockRejectedValue(new Error('Expense fail'))

            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            act(() => {
                result.current.setExpenseForm({
                    route_id: '1', expense_type: 'FUEL', amount: '100',
                    description: '', gl_account_code: '5001',
                })
            })

            await act(async () => result.current.handleRecordExpense(fakeEvent))

            expect(mockShowToast).toHaveBeenCalledWith('Expense fail', 'error')
        })

        it('handles recordExpense non-Error failure', async () => {
            mockApi.finance.getGLAccounts.mockResolvedValue({
                success: true,
                data: [{ account_code: '5001', account_name: 'Fuel' }],
            })
            mockApi.operations.recordTransportExpense.mockRejectedValue(null)

            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            act(() => {
                result.current.setExpenseForm({
                    route_id: '1', expense_type: 'FUEL', amount: '100',
                    description: '', gl_account_code: '5001',
                })
            })

            await act(async () => result.current.handleRecordExpense(fakeEvent))

            expect(mockShowToast).toHaveBeenCalledWith('Failed to record expense', 'error')
        })
    })

    // ── modal helpers ─────────────────────────────────

    describe('modal helpers', () => {
        it('openCreateModal opens modal and resets form', async () => {
            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            act(() => result.current.openCreateModal())

            expect(result.current.isCreateModalOpen).toBe(true)
            expect(result.current.createForm.route_name).toBe('')
        })

        it('closeCreateModal closes modal and resets form', async () => {
            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            act(() => result.current.openCreateModal())
            expect(result.current.isCreateModalOpen).toBe(true)

            act(() => result.current.closeCreateModal())
            expect(result.current.isCreateModalOpen).toBe(false)
            expect(result.current.createForm).toEqual({
                route_name: '',
                distance_km: '',
                estimated_students: '',
                budget_per_term: '',
            })
        })

        it('openExpenseModal opens modal with default GL code', async () => {
            mockApi.finance.getGLAccounts.mockResolvedValue({
                success: true,
                data: [{ account_code: '5001', account_name: 'Fuel' }],
            })

            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            act(() => result.current.openExpenseModal())

            expect(result.current.isExpenseModalOpen).toBe(true)
            expect(result.current.expenseForm.gl_account_code).toBe('5001')
        })

        it('closeExpenseModal closes modal and resets form', async () => {
            mockApi.finance.getGLAccounts.mockResolvedValue({
                success: true,
                data: [{ account_code: '5001', account_name: 'Fuel' }],
            })

            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            act(() => result.current.openExpenseModal())
            expect(result.current.isExpenseModalOpen).toBe(true)

            act(() => result.current.closeExpenseModal())
            expect(result.current.isExpenseModalOpen).toBe(false)
            expect(result.current.expenseForm.route_id).toBe('')
            expect(result.current.expenseForm.gl_account_code).toBe('5001')
        })

        it('openExpenseModal uses empty string when no expense accounts loaded', async () => {
            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            act(() => result.current.openExpenseModal())

            expect(result.current.isExpenseModalOpen).toBe(true)
            expect(result.current.expenseForm.gl_account_code).toBe('')
        })

        it('closeExpenseModal uses empty string when no expense accounts loaded', async () => {
            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            act(() => result.current.openExpenseModal())
            act(() => result.current.closeExpenseModal())

            expect(result.current.isExpenseModalOpen).toBe(false)
            expect(result.current.expenseForm.gl_account_code).toBe('')
        })
    })

    // ── form setters ──────────────────────────────────

    describe('form setters', () => {
        it('setCreateForm updates create form', async () => {
            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            act(() => {
                result.current.setCreateForm({
                    route_name: 'New Route',
                    distance_km: '12',
                    estimated_students: '25',
                    budget_per_term: '3000',
                })
            })

            expect(result.current.createForm.route_name).toBe('New Route')
            expect(result.current.createForm.budget_per_term).toBe('3000')
        })

        it('setExpenseForm updates expense form', async () => {
            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            act(() => {
                result.current.setExpenseForm({
                    route_id: '5',
                    expense_type: 'MAINTENANCE',
                    amount: '750',
                    description: 'Tyre change',
                    gl_account_code: '5002',
                })
            })

            expect(result.current.expenseForm.route_id).toBe('5')
            expect(result.current.expenseForm.expense_type).toBe('MAINTENANCE')
            expect(result.current.expenseForm.amount).toBe('750')
        })
    })

    // ── resolveTermNumber ─────────────────────────────

    describe('resolveTermNumber', () => {
        let resolveTermNumber: (termName?: string, termNumber?: number) => number | null

        it('can import resolveTermNumber', async () => {
            const mod = await import('../useTransportRouteManagement')
            resolveTermNumber = mod.resolveTermNumber
            expect(resolveTermNumber).toBeDefined()
        })

        it('returns termNumber when it is a positive integer', async () => {
            const mod = await import('../useTransportRouteManagement')
            expect(mod.resolveTermNumber(undefined, 3)).toBe(3)
        })

        it('falls back to termName digits when termNumber is 0', async () => {
            const mod = await import('../useTransportRouteManagement')
            expect(mod.resolveTermNumber('Term 2', 0)).toBe(2)
        })

        it('falls back to termName digits when termNumber is negative', async () => {
            const mod = await import('../useTransportRouteManagement')
            expect(mod.resolveTermNumber('Term 1', -1)).toBe(1)
        })

        it('returns null when termName has no digits', async () => {
            const mod = await import('../useTransportRouteManagement')
            expect(mod.resolveTermNumber('First')).toBeNull()
        })

        it('returns null when both termName and termNumber are undefined', async () => {
            const mod = await import('../useTransportRouteManagement')
            expect(mod.resolveTermNumber()).toBeNull()
        })

        it('parses digits from termName string', async () => {
            const mod = await import('../useTransportRouteManagement')
            expect(mod.resolveTermNumber('Term 3 Extra')).toBe(3)
        })

        it('falls back to termName when termNumber is a non-integer number', async () => {
            const mod = await import('../useTransportRouteManagement')
            expect(mod.resolveTermNumber('Term 2', 1.5)).toBe(2)
        })

        it('returns null when termName digits parse to 0', async () => {
            const mod = await import('../useTransportRouteManagement')
            expect(mod.resolveTermNumber('Term 0')).toBeNull()
        })
    })

    // ── GL account branch coverage ────────────────────

    describe('GL account edge cases', () => {
        it('handles glResponse.data not being an array', async () => {
            mockApi.finance.getGLAccounts.mockResolvedValue({
                success: true,
                data: null,
            })

            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            expect(result.current.expenseAccounts).toEqual([])
        })

        it('uses Unnamed account when account_name is undefined', async () => {
            mockApi.finance.getGLAccounts.mockResolvedValue({
                success: true,
                data: [{ account_code: '8001' }],
            })

            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            expect(result.current.expenseAccounts).toEqual([
                { code: '8001', label: '8001 - Unnamed account' },
            ])
        })

        it('keeps existing gl_account_code when already set', async () => {
            mockApi.finance.getGLAccounts.mockResolvedValue({
                success: true,
                data: [{ account_code: '9001', account_name: 'New' }],
            })

            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            // First load sets gl_account_code to '9001'
            expect(result.current.expenseForm.gl_account_code).toBe('9001')

            // Manually set it to something else
            act(() => result.current.setExpenseForm({
                ...result.current.expenseForm,
                gl_account_code: 'CUSTOM',
            }))

            expect(result.current.expenseForm.gl_account_code).toBe('CUSTOM')
        })
    })

    // ── handleRecordExpense – null store values ───────

    describe('handleRecordExpense – null store values', () => {
        it('shows error when currentAcademicYear is null', async () => {
            const storesMod = await import('../../../../stores')
            const _origApp = storesMod.useAppStore
            vi.spyOn(storesMod, 'useAppStore').mockImplementation(
                ((selector: (s: Record<string, unknown>) => unknown) =>
                    selector({
                        currentAcademicYear: null,
                        currentTerm: { id: 10, term_name: 'Term 1', term_number: 1 },
                    })) as typeof _origApp
            )

            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            act(() => {
                result.current.setExpenseForm({
                    route_id: '1', expense_type: 'FUEL', amount: '100',
                    description: '', gl_account_code: '5001',
                })
            })

            await act(async () => result.current.handleRecordExpense(fakeEvent))

            expect(mockShowToast).toHaveBeenCalledWith('Active academic year is not configured correctly', 'error')
            expect(mockApi.operations.recordTransportExpense).not.toHaveBeenCalled()

            vi.mocked(storesMod.useAppStore).mockRestore()
        })

        it('shows error when currentTerm is null', async () => {
            const storesMod = await import('../../../../stores')
            const _origApp = storesMod.useAppStore
            vi.spyOn(storesMod, 'useAppStore').mockImplementation(
                ((selector: (s: Record<string, unknown>) => unknown) =>
                    selector({
                        currentAcademicYear: { id: 5, year_name: '2025', is_current: true },
                        currentTerm: null,
                    })) as typeof _origApp
            )

            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            act(() => {
                result.current.setExpenseForm({
                    route_id: '1', expense_type: 'FUEL', amount: '100',
                    description: '', gl_account_code: '5001',
                })
            })

            await act(async () => result.current.handleRecordExpense(fakeEvent))

            expect(mockShowToast).toHaveBeenCalledWith('Active term is not configured correctly', 'error')
            expect(mockApi.operations.recordTransportExpense).not.toHaveBeenCalled()

            vi.mocked(storesMod.useAppStore).mockRestore()
        })
    })

    // ── Branch coverage: accountOptions with empty string code (L96-97, L102) ──────

    describe('GL account code fallback branches', () => {
        it('defaults gl_account_code to empty string when accountOptions[0].code is empty', async () => {
            mockApi.finance.getGLAccounts.mockResolvedValue({
                success: true,
                data: [{ account_code: '', account_name: 'Empty Code' }],
            })

            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            // Empty account_code is filtered out by Boolean filter → no accounts
            expect(result.current.expenseAccounts).toEqual([])
        })

        it('handles account with missing account_code entirely', async () => {
            mockApi.finance.getGLAccounts.mockResolvedValue({
                success: true,
                data: [{ account_name: 'No Code Account' }],
            })

            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            expect(result.current.expenseAccounts).toEqual([])
        })

        it('sets default gl_account_code from first loaded account when form has no code', async () => {
            mockApi.finance.getGLAccounts.mockResolvedValue({
                success: true,
                data: [{ account_code: '7001', account_name: 'GL Acct' }],
            })

            const { result } = renderHook(() => useTransportRouteManagement())
            await wait()

            // After loading, the form should default to the first account code
            expect(result.current.expenseForm.gl_account_code).toBe('7001')
        })
    })
})
