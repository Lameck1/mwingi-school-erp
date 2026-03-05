// @vitest-environment jsdom
/**
 * Tests for useStaff hook.
 *
 * Covers: staff loading, openCreate, openEdit (centsToShillings),
 * handleSave (validation, create, update, shillingsToCents),
 * handleToggleActive (confirm dialog), and all error paths.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────

const mockShowToast = vi.fn()
vi.mock('../../../contexts/ToastContext', () => ({
    useToast: () => ({ showToast: mockShowToast }),
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

vi.mock('../../../utils/format', () => ({
    centsToShillings: (cents: number) => cents / 100,
    shillingsToCents: (shillings: number | string) => Number(shillings) * 100,
}))

// ── electronAPI stub ─────────────────────────────────────────

let mockApi: ReturnType<typeof buildElectronAPI>

function buildElectronAPI() {
    return {
        staff: {
            getStaff: vi.fn().mockResolvedValue([]),
            createStaff: vi.fn().mockResolvedValue({ success: true }),
            updateStaff: vi.fn().mockResolvedValue({ success: true }),
            setStaffActive: vi.fn().mockResolvedValue({ success: true }),
        },
    }
}

beforeEach(() => {
    mockApi = buildElectronAPI()
    ;(globalThis as Record<string, unknown>).electronAPI = mockApi
    mockShowToast.mockClear()
    ;(globalThis as Record<string, unknown>).confirm = vi.fn(() => true)
})

afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as Record<string, unknown>).electronAPI
    delete (globalThis as Record<string, unknown>).confirm
})

// ── Lazy import ──────────────────────────────────────────────

const { useStaff } = await import('../useStaff')

// ── Helpers ──────────────────────────────────────────────────

const sampleMember = {
    id: 1,
    staff_number: 'S001',
    first_name: 'John',
    middle_name: 'M',
    last_name: 'Doe',
    phone: '0700000000',
    email: 'john@example.com',
    department: 'Math',
    job_title: 'Teacher',
    employment_date: '2024-01-01',
    basic_salary: 500000, // 5000.00 shillings in cents
    is_active: true,
} as const

const wait = () => new Promise(resolve => setTimeout(resolve, 100))

describe('useStaff', () => {
    // ── Initial state ───────────────────────────────────

    it('returns correct initial state', async () => {
        const { result } = renderHook(() => useStaff())
        // Before load completes
        expect(result.current.staff).toEqual([])
        expect(result.current.showModal).toBe(false)
        expect(result.current.saving).toBe(false)
        expect(result.current.editing).toBeNull()
        expect(result.current.form.staff_number).toBe('')
        expect(result.current.form.is_active).toBe(true)

        await act(async () => { await wait() })
        expect(result.current.loading).toBe(false)
    })

    // ── loadStaff ───────────────────────────────────────

    describe('loadStaff', () => {
        it('loads staff on mount', async () => {
            const mockStaff = [sampleMember]
            mockApi.staff.getStaff.mockResolvedValue(mockStaff)

            const { result } = renderHook(() => useStaff())
            await act(async () => { await wait() })

            expect(mockApi.staff.getStaff).toHaveBeenCalledWith(false)
            expect(result.current.staff).toEqual(mockStaff)
            expect(result.current.loading).toBe(false)
        })

        it('handles loadStaff Error failure', async () => {
            mockApi.staff.getStaff.mockRejectedValue(new Error('DB down'))

            const { result } = renderHook(() => useStaff())
            await act(async () => { await wait() })

            expect(result.current.staff).toEqual([])
            expect(result.current.loading).toBe(false)
            expect(mockShowToast).toHaveBeenCalledWith('DB down', 'error')
        })

        it('handles loadStaff non-Error failure', async () => {
            mockApi.staff.getStaff.mockRejectedValue('crash')

            const { result } = renderHook(() => useStaff())
            await act(async () => { await wait() })

            expect(result.current.staff).toEqual([])
            expect(mockShowToast).toHaveBeenCalledWith('Failed to synchronize staff directory', 'error')
        })
    })

    // ── openCreate ──────────────────────────────────────

    describe('openCreate', () => {
        it('resets form and shows modal', async () => {
            const { result } = renderHook(() => useStaff())
            await act(async () => { await wait() })

            // Dirty the form first
            act(() => result.current.setForm({ ...result.current.form, first_name: 'Dirty' }))
            expect(result.current.form.first_name).toBe('Dirty')

            act(() => result.current.openCreate())

            expect(result.current.showModal).toBe(true)
            expect(result.current.editing).toBeNull()
            expect(result.current.form.first_name).toBe('')
            expect(result.current.form.staff_number).toBe('')
            expect(result.current.form.basic_salary).toBe('')
            expect(result.current.form.is_active).toBe(true)
        })
    })

    // ── openEdit ────────────────────────────────────────

    describe('openEdit', () => {
        it('populates form from member with centsToShillings conversion', async () => {
            const { result } = renderHook(() => useStaff())
            await act(async () => { await wait() })

            act(() => result.current.openEdit(sampleMember as never))

            expect(result.current.showModal).toBe(true)
            expect(result.current.editing).toBe(sampleMember)
            expect(result.current.form.staff_number).toBe('S001')
            expect(result.current.form.first_name).toBe('John')
            expect(result.current.form.middle_name).toBe('M')
            expect(result.current.form.last_name).toBe('Doe')
            expect(result.current.form.phone).toBe('0700000000')
            expect(result.current.form.email).toBe('john@example.com')
            expect(result.current.form.department).toBe('Math')
            expect(result.current.form.job_title).toBe('Teacher')
            expect(result.current.form.employment_date).toBe('2024-01-01')
            // 500000 cents / 100 = 5000
            expect(result.current.form.basic_salary).toBe('5000')
            expect(result.current.form.is_active).toBe(true)
        })

        it('handles member with missing optional fields', async () => {
            const sparseStaff = { id: 2, staff_number: 'S002', first_name: 'Jane', last_name: 'Smith', is_active: false }

            const { result } = renderHook(() => useStaff())
            await act(async () => { await wait() })

            act(() => result.current.openEdit(sparseStaff as never))

            expect(result.current.form.middle_name).toBe('')
            expect(result.current.form.phone).toBe('')
            expect(result.current.form.email).toBe('')
            expect(result.current.form.department).toBe('')
            expect(result.current.form.basic_salary).toBe('0')
            expect(result.current.form.is_active).toBe(false)
        })

        it('handles openEdit with undefined core fields (staff_number, first_name, last_name fallbacks)', async () => {
            const minimalMember = { id: 3, is_active: true } as never

            const { result } = renderHook(() => useStaff())
            await act(async () => { await wait() })

            act(() => result.current.openEdit(minimalMember))

            expect(result.current.form.staff_number).toBe('')
            expect(result.current.form.first_name).toBe('')
            expect(result.current.form.last_name).toBe('')
            expect(result.current.form.middle_name).toBe('')
            expect(result.current.form.phone).toBe('')
            expect(result.current.form.email).toBe('')
            expect(result.current.form.department).toBe('')
            expect(result.current.form.job_title).toBe('')
            expect(result.current.form.employment_date).toBe('')
            expect(result.current.form.basic_salary).toBe('0')
            expect(result.current.form.is_active).toBe(true)
        })
    })

    // ── handleSave ──────────────────────────────────────

    describe('handleSave', () => {
        it('validates required fields - missing staff_number', async () => {
            const { result } = renderHook(() => useStaff())
            await act(async () => { await wait() })

            act(() => result.current.setForm({
                ...result.current.form,
                staff_number: '',
                first_name: 'John',
                last_name: 'Doe',
            }))

            await act(async () => result.current.handleSave())

            expect(mockShowToast).toHaveBeenCalledWith(
                'Staff number, first name, and last name are required',
                'error'
            )
            expect(mockApi.staff.createStaff).not.toHaveBeenCalled()
        })

        it('validates required fields - missing first_name', async () => {
            const { result } = renderHook(() => useStaff())
            await act(async () => { await wait() })

            act(() => result.current.setForm({
                ...result.current.form,
                staff_number: 'S001',
                first_name: '  ',
                last_name: 'Doe',
            }))

            await act(async () => result.current.handleSave())

            expect(mockShowToast).toHaveBeenCalledWith(
                'Staff number, first name, and last name are required',
                'error'
            )
        })

        it('validates required fields - missing last_name', async () => {
            const { result } = renderHook(() => useStaff())
            await act(async () => { await wait() })

            act(() => result.current.setForm({
                ...result.current.form,
                staff_number: 'S001',
                first_name: 'John',
                last_name: '',
            }))

            await act(async () => result.current.handleSave())

            expect(mockShowToast).toHaveBeenCalledWith(
                'Staff number, first name, and last name are required',
                'error'
            )
        })

        it('creates staff with shillingsToCents conversion', async () => {
            const { result } = renderHook(() => useStaff())
            await act(async () => { await wait() })

            act(() => {
                result.current.openCreate()
                result.current.setForm({
                    staff_number: 'S003',
                    first_name: 'Alice',
                    middle_name: '',
                    last_name: 'Wonder',
                    phone: '0711111111',
                    email: 'alice@test.com',
                    department: 'Science',
                    job_title: 'Lab Tech',
                    employment_date: '2025-01-15',
                    basic_salary: '3000',
                    is_active: true,
                })
            })

            await act(async () => result.current.handleSave())

            expect(mockApi.staff.createStaff).toHaveBeenCalledWith(
                expect.objectContaining({
                    staff_number: 'S003',
                    first_name: 'Alice',
                    last_name: 'Wonder',
                    basic_salary: 300000, // 3000 * 100
                    is_active: true,
                })
            )
            expect(mockShowToast).toHaveBeenCalledWith('Staff record created', 'success')
            expect(result.current.showModal).toBe(false)
            expect(result.current.saving).toBe(false)
        })

        it('updates existing staff record', async () => {
            const { result } = renderHook(() => useStaff())
            await act(async () => { await wait() })

            act(() => result.current.openEdit(sampleMember as never))
            act(() => result.current.setForm({
                ...result.current.form,
                first_name: 'Johnny',
                basic_salary: '6000',
            }))

            await act(async () => result.current.handleSave())

            expect(mockApi.staff.updateStaff).toHaveBeenCalledWith(
                1,
                expect.objectContaining({
                    first_name: 'Johnny',
                    basic_salary: 600000, // 6000 * 100
                })
            )
            expect(mockShowToast).toHaveBeenCalledWith('Staff record updated', 'success')
            expect(result.current.showModal).toBe(false)
        })

        it('handles create Error failure', async () => {
            mockApi.staff.createStaff.mockRejectedValue(new Error('Create boom'))

            const { result } = renderHook(() => useStaff())
            await act(async () => { await wait() })

            act(() => result.current.setForm({
                ...result.current.form,
                staff_number: 'S004',
                first_name: 'Err',
                last_name: 'Staff',
            }))

            await act(async () => result.current.handleSave())

            expect(mockShowToast).toHaveBeenCalledWith('Create boom', 'error')
            expect(result.current.saving).toBe(false)
        })

        it('handles create non-Error failure', async () => {
            mockApi.staff.createStaff.mockRejectedValue(42)

            const { result } = renderHook(() => useStaff())
            await act(async () => { await wait() })

            act(() => result.current.setForm({
                ...result.current.form,
                staff_number: 'S005',
                first_name: 'Num',
                last_name: 'Err',
            }))

            await act(async () => result.current.handleSave())

            expect(mockShowToast).toHaveBeenCalledWith('Failed to save staff record', 'error')
        })
    })

    // ── handleToggleActive ──────────────────────────────

    describe('handleToggleActive', () => {
        it('deactivates staff when confirmed', async () => {
            (globalThis.confirm as ReturnType<typeof vi.fn>).mockReturnValue(true)

            const { result } = renderHook(() => useStaff())
            await act(async () => { await wait() })

            await act(async () => result.current.handleToggleActive(sampleMember as never, false))

            expect(globalThis.confirm).toHaveBeenCalledWith('Deactivate John Doe?')
            expect(mockApi.staff.setStaffActive).toHaveBeenCalledWith(1, false)
            expect(mockShowToast).toHaveBeenCalledWith('Staff deactivated', 'success')
            expect(result.current.saving).toBe(false)
        })

        it('activates staff when confirmed', async () => {
            (globalThis.confirm as ReturnType<typeof vi.fn>).mockReturnValue(true)

            const { result } = renderHook(() => useStaff())
            await act(async () => { await wait() })

            await act(async () => result.current.handleToggleActive(sampleMember as never, true))

            expect(globalThis.confirm).toHaveBeenCalledWith('Activate John Doe?')
            expect(mockApi.staff.setStaffActive).toHaveBeenCalledWith(1, true)
            expect(mockShowToast).toHaveBeenCalledWith('Staff activated', 'success')
        })

        it('does nothing when confirm is cancelled', async () => {
            (globalThis.confirm as ReturnType<typeof vi.fn>).mockReturnValue(false)

            const { result } = renderHook(() => useStaff())
            await act(async () => { await wait() })

            await act(async () => result.current.handleToggleActive(sampleMember as never, false))

            expect(mockApi.staff.setStaffActive).not.toHaveBeenCalled()
            expect(mockShowToast).not.toHaveBeenCalledWith(expect.anything(), 'success')
        })

        it('handles toggle Error failure', async () => {
            (globalThis.confirm as ReturnType<typeof vi.fn>).mockReturnValue(true)
            mockApi.staff.setStaffActive.mockRejectedValue(new Error('Toggle fail'))

            const { result } = renderHook(() => useStaff())
            await act(async () => { await wait() })

            await act(async () => result.current.handleToggleActive(sampleMember as never, true))

            expect(mockShowToast).toHaveBeenCalledWith('Toggle fail', 'error')
            expect(result.current.saving).toBe(false)
        })

        it('handles toggle non-Error failure', async () => {
            (globalThis.confirm as ReturnType<typeof vi.fn>).mockReturnValue(true)
            mockApi.staff.setStaffActive.mockRejectedValue(null)

            const { result } = renderHook(() => useStaff())
            await act(async () => { await wait() })

            await act(async () => result.current.handleToggleActive(sampleMember as never, false))

            expect(mockShowToast).toHaveBeenCalledWith('Failed to update staff status', 'error')
        })
    })
})
