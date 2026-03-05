// @vitest-environment jsdom
/**
 * Tests for useScheduledReports hook.
 *
 * Covers: loadSchedules, handleSave (create/update + validations),
 * handleDelete (confirm/no-confirm + validations), addRecipient,
 * removeRecipient, modal helpers, getRecipients parsing.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────

const mockShowToast = vi.fn()
vi.mock('../../../contexts/ToastContext', () => ({
    useToast: () => ({ showToast: mockShowToast }),
}))

vi.mock('../../../stores', () => {
    const user = { id: 1, username: 'admin', role: 'ADMIN' }
    return {
        useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
            selector({ user }),
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

// ── electronAPI stub ─────────────────────────────────────────

let mockApi: ReturnType<typeof buildElectronAPI>

function buildElectronAPI() {
    return {
        reports: {
            getScheduledReports: vi.fn().mockResolvedValue([]),
            createScheduledReport: vi.fn().mockResolvedValue({ success: true }),
            updateScheduledReport: vi.fn().mockResolvedValue({ success: true }),
            deleteScheduledReport: vi.fn().mockResolvedValue({ success: true }),
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

const { useScheduledReports } = await import('../useScheduledReports')

// Helper: wait for async effects
const tick = () => new Promise(resolve => setTimeout(resolve, 100))

describe('useScheduledReports', () => {

    // ── Initial state ──────────────────────────────────

    describe('initial state', () => {
        it('returns default state values', async () => {
            const { result } = renderHook(() => useScheduledReports())
            // loading is true initially before loadSchedules completes
            expect(result.current.schedules).toEqual([])
            expect(result.current.showModal).toBe(false)
            expect(result.current.saving).toBe(false)
            expect(result.current.recipientInput).toBe('')
            expect(result.current.editingSchedule.schedule_type).toBe('WEEKLY')
            expect(result.current.editingSchedule.is_active).toBe(true)
            await act(async () => { await tick() })
        })
    })

    // ── loadSchedules ──────────────────────────────────

    describe('loadSchedules', () => {
        it('loads schedules on mount', async () => {
            const mockSchedules = [
                { id: 1, report_name: 'Weekly Report', report_type: 'FEE_COLLECTION', schedule_type: 'WEEKLY', recipients: '["a@b.com"]', is_active: true },
            ]
            mockApi.reports.getScheduledReports.mockResolvedValue(mockSchedules)

            const { result } = renderHook(() => useScheduledReports())
            await act(async () => { await tick() })

            expect(result.current.schedules).toEqual(mockSchedules)
            expect(result.current.loading).toBe(false)
        })

        it('handles loadSchedules error (Error instance)', async () => {
            mockApi.reports.getScheduledReports.mockRejectedValue(new Error('DB failure'))

            const { result } = renderHook(() => useScheduledReports())
            await act(async () => { await tick() })

            expect(result.current.schedules).toEqual([])
            expect(result.current.loading).toBe(false)
            expect(mockShowToast).toHaveBeenCalledWith('DB failure', 'error')
        })

        it('handles loadSchedules error (non-Error)', async () => {
            mockApi.reports.getScheduledReports.mockRejectedValue('crash')

            const { result } = renderHook(() => useScheduledReports())
            await act(async () => { await tick() })

            expect(result.current.schedules).toEqual([])
            expect(mockShowToast).toHaveBeenCalledWith('Failed to load schedules', 'error')
        })
    })

    // ── handleSave ─────────────────────────────────────

    describe('handleSave', () => {
        it('shows error when no user', async () => {
            // Temporarily override the store mock to return no user
            const _origMock = vi.fn()
            const storesModule = await import('../../../stores')
            const origUseAuthStore = storesModule.useAuthStore
            ;(storesModule as Record<string, unknown>).useAuthStore = ((sel: (s: Record<string, unknown>) => unknown) => sel({ user: null })) as typeof origUseAuthStore

            const { result } = renderHook(() => useScheduledReports())
            await act(async () => { await tick() })

            await act(async () => result.current.handleSave())
            expect(mockShowToast).toHaveBeenCalledWith('You must be signed in to save schedules', 'error')

            // Restore
            ;(storesModule as Record<string, unknown>).useAuthStore = origUseAuthStore
        })

        it('shows error when report_name is empty', async () => {
            const { result } = renderHook(() => useScheduledReports())
            await act(async () => { await tick() })

            // editingSchedule has no report_name by default
            await act(async () => result.current.handleSave())
            expect(mockShowToast).toHaveBeenCalledWith('Report name is required', 'error')
        })

        it('shows error when recipients list is empty', async () => {
            const { result } = renderHook(() => useScheduledReports())
            await act(async () => { await tick() })

            act(() => result.current.setEditingSchedule({
                ...result.current.editingSchedule,
                report_name: 'My Report',
                recipients: JSON.stringify([]),
            }))

            await act(async () => result.current.handleSave())
            expect(mockShowToast).toHaveBeenCalledWith('Add at least one recipient email', 'error')
        })

        it('creates a new schedule when no id present', async () => {
            const { result } = renderHook(() => useScheduledReports())
            await act(async () => { await tick() })

            act(() => result.current.setEditingSchedule({
                ...result.current.editingSchedule,
                report_name: 'Weekly Fee Report',
                recipients: JSON.stringify(['test@example.com']),
            }))

            await act(async () => result.current.handleSave())

            expect(mockApi.reports.createScheduledReport).toHaveBeenCalledWith(
                expect.objectContaining({ report_name: 'Weekly Fee Report' }),
                1 // user.id
            )
            expect(mockShowToast).toHaveBeenCalledWith('Schedule saved successfully', 'success')
        })

        it('updates an existing schedule when id is present', async () => {
            const { result } = renderHook(() => useScheduledReports())
            await act(async () => { await tick() })

            act(() => result.current.setEditingSchedule({
                ...result.current.editingSchedule,
                id: 42,
                report_name: 'Updated Report',
                recipients: JSON.stringify(['user@school.com']),
            }))

            await act(async () => result.current.handleSave())

            expect(mockApi.reports.updateScheduledReport).toHaveBeenCalledWith(
                42,
                expect.objectContaining({ report_name: 'Updated Report' }),
                1
            )
            expect(mockShowToast).toHaveBeenCalledWith('Schedule saved successfully', 'success')
        })

        it('handles save failure (Error instance)', async () => {
            mockApi.reports.createScheduledReport.mockRejectedValue(new Error('Save boom'))

            const { result } = renderHook(() => useScheduledReports())
            await act(async () => { await tick() })

            act(() => result.current.setEditingSchedule({
                ...result.current.editingSchedule,
                report_name: 'Report',
                recipients: JSON.stringify(['x@y.com']),
            }))

            await act(async () => result.current.handleSave())

            expect(mockShowToast).toHaveBeenCalledWith('Save boom', 'error')
            expect(result.current.saving).toBe(false)
        })

        it('handles save failure (non-Error)', async () => {
            mockApi.reports.createScheduledReport.mockRejectedValue(null)

            const { result } = renderHook(() => useScheduledReports())
            await act(async () => { await tick() })

            act(() => result.current.setEditingSchedule({
                ...result.current.editingSchedule,
                report_name: 'Report',
                recipients: JSON.stringify(['x@y.com']),
            }))

            await act(async () => result.current.handleSave())

            expect(mockShowToast).toHaveBeenCalledWith('Failed to save schedule', 'error')
        })
    })

    // ── handleDelete ───────────────────────────────────

    describe('handleDelete', () => {
        it('does nothing when confirm returns false', async () => {
            ;(globalThis as Record<string, unknown>).confirm = vi.fn().mockReturnValue(false)

            const { result } = renderHook(() => useScheduledReports())
            await act(async () => { await tick() })

            await act(async () => result.current.handleDelete(1))

            expect(mockApi.reports.deleteScheduledReport).not.toHaveBeenCalled()
            delete (globalThis as Record<string, unknown>).confirm
        })

        it('shows error when no user after confirm', async () => {
            ;(globalThis as Record<string, unknown>).confirm = vi.fn().mockReturnValue(true)

            const storesModule = await import('../../../stores')
            const origUseAuthStore = storesModule.useAuthStore
            ;(storesModule as Record<string, unknown>).useAuthStore = ((sel: (s: Record<string, unknown>) => unknown) => sel({ user: null })) as typeof origUseAuthStore

            const { result } = renderHook(() => useScheduledReports())
            await act(async () => { await tick() })

            await act(async () => result.current.handleDelete(1))

            expect(mockShowToast).toHaveBeenCalledWith('You must be signed in to delete schedules', 'error')
            expect(mockApi.reports.deleteScheduledReport).not.toHaveBeenCalled()

            ;(storesModule as Record<string, unknown>).useAuthStore = origUseAuthStore
            delete (globalThis as Record<string, unknown>).confirm
        })

        it('deletes schedule successfully', async () => {
            ;(globalThis as Record<string, unknown>).confirm = vi.fn().mockReturnValue(true)

            const { result } = renderHook(() => useScheduledReports())
            await act(async () => { await tick() })

            await act(async () => result.current.handleDelete(5))

            expect(mockApi.reports.deleteScheduledReport).toHaveBeenCalledWith(5, 1)
            expect(mockShowToast).toHaveBeenCalledWith('Schedule deleted successfully', 'success')
            delete (globalThis as Record<string, unknown>).confirm
        })

        it('handles delete failure (Error instance)', async () => {
            ;(globalThis as Record<string, unknown>).confirm = vi.fn().mockReturnValue(true)
            mockApi.reports.deleteScheduledReport.mockRejectedValue(new Error('Delete fail'))

            const { result } = renderHook(() => useScheduledReports())
            await act(async () => { await tick() })

            await act(async () => result.current.handleDelete(5))

            expect(mockShowToast).toHaveBeenCalledWith('Delete fail', 'error')
            delete (globalThis as Record<string, unknown>).confirm
        })

        it('handles delete failure (non-Error)', async () => {
            ;(globalThis as Record<string, unknown>).confirm = vi.fn().mockReturnValue(true)
            mockApi.reports.deleteScheduledReport.mockRejectedValue(99)

            const { result } = renderHook(() => useScheduledReports())
            await act(async () => { await tick() })

            await act(async () => result.current.handleDelete(5))

            expect(mockShowToast).toHaveBeenCalledWith('Failed to delete schedule', 'error')
            delete (globalThis as Record<string, unknown>).confirm
        })
    })

    // ── addRecipient ───────────────────────────────────

    describe('addRecipient', () => {
        it('shows warning for invalid email (no @)', async () => {
            const { result } = renderHook(() => useScheduledReports())
            await act(async () => { await tick() })

            act(() => result.current.setRecipientInput('invalidemail'))
            act(() => result.current.addRecipient())

            expect(mockShowToast).toHaveBeenCalledWith('Enter a valid recipient email address', 'warning')
        })

        it('shows warning for duplicate recipient', async () => {
            const { result } = renderHook(() => useScheduledReports())
            await act(async () => { await tick() })

            act(() => result.current.setEditingSchedule({
                ...result.current.editingSchedule,
                recipients: JSON.stringify(['dup@test.com']),
            }))

            act(() => result.current.setRecipientInput('dup@test.com'))
            act(() => result.current.addRecipient())

            expect(mockShowToast).toHaveBeenCalledWith('Recipient already added', 'warning')
        })

        it('adds a valid unique recipient', async () => {
            const { result } = renderHook(() => useScheduledReports())
            await act(async () => { await tick() })

            act(() => result.current.setRecipientInput('new@school.com'))
            act(() => result.current.addRecipient())

            const recipients = JSON.parse(result.current.editingSchedule.recipients || '[]')
            expect(recipients).toContain('new@school.com')
            expect(result.current.recipientInput).toBe('')
        })
    })

    // ── removeRecipient ────────────────────────────────

    describe('removeRecipient', () => {
        it('removes a recipient from the list', async () => {
            const { result } = renderHook(() => useScheduledReports())
            await act(async () => { await tick() })

            act(() => result.current.setEditingSchedule({
                ...result.current.editingSchedule,
                recipients: JSON.stringify(['a@b.com', 'c@d.com']),
            }))

            act(() => result.current.removeRecipient('a@b.com'))

            const recipients = JSON.parse(result.current.editingSchedule.recipients || '[]')
            expect(recipients).toEqual(['c@d.com'])
        })
    })

    // ── Modal helpers ──────────────────────────────────

    describe('modal helpers', () => {
        it('openNewSchedule resets editingSchedule and opens modal', async () => {
            const { result } = renderHook(() => useScheduledReports())
            await act(async () => { await tick() })

            act(() => result.current.openNewSchedule())

            expect(result.current.showModal).toBe(true)
            expect(result.current.editingSchedule.schedule_type).toBe('WEEKLY')
            expect(result.current.editingSchedule.day_of_week).toBe(1)
            expect(result.current.editingSchedule.time_of_day).toBe('08:00')
            expect(result.current.editingSchedule.is_active).toBe(true)
            expect(result.current.editingSchedule.report_type).toBe('FEE_COLLECTION')
            expect(result.current.editingSchedule.id).toBeUndefined()
        })

        it('openEditSchedule sets editingSchedule from passed schedule and opens modal', async () => {
            const schedule = {
                id: 10,
                report_name: 'Term End',
                report_type: 'DEFAULTERS',
                schedule_type: 'MONTHLY' as const,
                day_of_week: null,
                day_of_month: 15,
                time_of_day: '09:00',
                recipients: JSON.stringify(['head@school.com']),
                export_format: 'PDF' as const,
                is_active: false,
                last_run_at: null,
                parameters: '{}',
            }

            const { result } = renderHook(() => useScheduledReports())
            await act(async () => { await tick() })

            act(() => result.current.openEditSchedule(schedule))

            expect(result.current.showModal).toBe(true)
            expect(result.current.editingSchedule.id).toBe(10)
            expect(result.current.editingSchedule.report_name).toBe('Term End')
        })

        it('closeModal hides the modal', async () => {
            const { result } = renderHook(() => useScheduledReports())
            await act(async () => { await tick() })

            act(() => result.current.openNewSchedule())
            expect(result.current.showModal).toBe(true)

            act(() => result.current.closeModal())
            expect(result.current.showModal).toBe(false)
        })
    })

    // ── getRecipients ──────────────────────────────────

    describe('getRecipients', () => {
        it('parses recipients JSON correctly', async () => {
            const { result } = renderHook(() => useScheduledReports())
            await act(async () => { await tick() })

            act(() => result.current.setEditingSchedule({
                ...result.current.editingSchedule,
                recipients: JSON.stringify(['x@y.com', 'a@b.com']),
            }))

            expect(result.current.getRecipients).toEqual(['x@y.com', 'a@b.com'])
        })

        it('returns empty array for invalid JSON', async () => {
            const { result } = renderHook(() => useScheduledReports())
            await act(async () => { await tick() })

            act(() => result.current.setEditingSchedule({
                ...result.current.editingSchedule,
                recipients: 'not-json',
            }))

            expect(result.current.getRecipients).toEqual([])
        })

        it('returns empty array when recipients is undefined', async () => {
            const { result } = renderHook(() => useScheduledReports())
            await act(async () => { await tick() })

            act(() => result.current.setEditingSchedule({
                ...result.current.editingSchedule,
                recipients: undefined as unknown as string,
            }))

            expect(result.current.getRecipients).toEqual([])
        })
    })
})
