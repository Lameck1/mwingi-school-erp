// @vitest-environment jsdom
/**
 * Tests for useOpeningBalanceImport hook.
 *
 * Covers: state initialization, handleFileUpload (CSV parsing), handleAddBalance
 * (validation + add), handleRemoveBalance, handleVerify (debit/credit check),
 * handleImport (student + GL import via electronAPI), Escape key listener,
 * and all derived values (totalDebits, totalCredits, variance, isBalanced).
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
    const user = { id: 1, username: 'admin', role: 'ADMIN' }
    const year = { id: 5, year_name: '2025', is_current: true }
    return {
        useAuthStore: (selector: (s: Record<string, unknown>) => unknown) => selector({ user }),
        useAppStore: (selector: (s: Record<string, unknown>) => unknown) => selector({ currentAcademicYear: year }),
    }
})

const mockParseCsvBalances = vi.fn()
const mockGetResultMessage = vi.fn()
vi.mock('../openingBalanceImport.helpers', () => ({
    parseCsvBalances: (...args: unknown[]) => mockParseCsvBalances(...args),
    getResultMessage: (...args: unknown[]) => mockGetResultMessage(...args),
}))

vi.mock('../../../../utils/format', () => ({
    shillingsToCents: (v: number | string) => Math.round(Number(v) * 100),
}))

// ── electronAPI stub ─────────────────────────────────────────

let mockApi: ReturnType<typeof buildElectronAPI>

function buildElectronAPI() {
    return {
        finance: {
            importStudentOpeningBalances: vi.fn().mockResolvedValue({ success: true }),
            importGLOpeningBalances: vi.fn().mockResolvedValue({ success: true }),
        },
    }
}

beforeEach(() => {
    mockApi = buildElectronAPI()
    ;(globalThis as Record<string, unknown>).electronAPI = mockApi
    mockShowToast.mockClear()
    mockParseCsvBalances.mockReset()
    mockGetResultMessage.mockReset()
})

afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as Record<string, unknown>).electronAPI
})

// ── Lazy import ──────────────────────────────────────────────

const { useOpeningBalanceImport } = await import('../useOpeningBalanceImport')

// ── Helpers ──────────────────────────────────────────────────
async function setupVerifiedBalances(
    hook: { current: ReturnType<typeof useOpeningBalanceImport> },
    rows = [
        makeBalance({ identifier: '10', amount: 500, debitCredit: 'DEBIT' }),
        makeBalance({ identifier: '11', amount: 500, debitCredit: 'CREDIT' }),
    ]
) {
    mockParseCsvBalances.mockReturnValue({ balances: rows })
    await act(async () => {
        await hook.current.handleFileUpload(makeFileEvent('csv'))
    })
    act(() => { hook.current.handleVerify() })
}
function makeBalance(overrides: Record<string, unknown> = {}) {
    return {
        type: 'STUDENT' as const,
        identifier: '101',
        name: 'John Doe',
        amount: 500,
        debitCredit: 'DEBIT' as const,
        ...overrides,
    }
}

function makeFileEvent(text: string, hasFile = true): React.ChangeEvent<HTMLInputElement> {
    const file = hasFile
        ? { text: vi.fn().mockResolvedValue(text) }
        : undefined
    return {
        target: {
            files: hasFile ? [file] : [],
            value: 'fake.csv',
        },
    } as unknown as React.ChangeEvent<HTMLInputElement>
}

function makeEmptyFileEvent(): React.ChangeEvent<HTMLInputElement> {
    return {
        target: { files: null, value: '' },
    } as unknown as React.ChangeEvent<HTMLInputElement>
}

// ── Tests ────────────────────────────────────────────────────

describe('useOpeningBalanceImport', () => {
    // ── State initialization ─────────────────────────────────

    describe('initial state', () => {
        it('returns empty balances', () => {
            const { result } = renderHook(() => useOpeningBalanceImport())
            expect(result.current.balances).toEqual([])
        })

        it('importing is false', () => {
            const { result } = renderHook(() => useOpeningBalanceImport())
            expect(result.current.importing).toBe(false)
        })

        it('verified is false', () => {
            const { result } = renderHook(() => useOpeningBalanceImport())
            expect(result.current.verified).toBe(false)
        })

        it('showAddModal is false', () => {
            const { result } = renderHook(() => useOpeningBalanceImport())
            expect(result.current.showAddModal).toBe(false)
        })

        it('derived values are zero/balanced', () => {
            const { result } = renderHook(() => useOpeningBalanceImport())
            expect(result.current.totalDebits).toBe(0)
            expect(result.current.totalCredits).toBe(0)
            expect(result.current.variance).toBe(0)
            expect(result.current.isBalanced).toBe(true)
        })
    })

    // ── handleFileUpload ─────────────────────────────────────

    describe('handleFileUpload', () => {
        it('does nothing when no file is selected', async () => {
            const { result } = renderHook(() => useOpeningBalanceImport())
            await act(async () => {
                await result.current.handleFileUpload(makeEmptyFileEvent())
            })
            expect(mockParseCsvBalances).not.toHaveBeenCalled()
            expect(result.current.balances).toEqual([])
        })

        it('parses CSV and sets balances on success', async () => {
            const rows = [makeBalance(), makeBalance({ identifier: '102', name: 'Jane', debitCredit: 'CREDIT' })]
            mockParseCsvBalances.mockReturnValue({ balances: rows })

            const { result } = renderHook(() => useOpeningBalanceImport())
            await act(async () => {
                await result.current.handleFileUpload(makeFileEvent('csv-text'))
            })

            expect(mockParseCsvBalances).toHaveBeenCalledWith('csv-text')
            expect(result.current.balances).toEqual(rows)
            expect(mockShowToast).toHaveBeenCalledWith('Loaded 2 balance row(s)', 'success')
        })

        it('shows error toast when parser returns an error', async () => {
            mockParseCsvBalances.mockReturnValue({ balances: [], error: 'Bad CSV' })

            const { result } = renderHook(() => useOpeningBalanceImport())
            await act(async () => {
                await result.current.handleFileUpload(makeFileEvent('bad'))
            })

            expect(mockShowToast).toHaveBeenCalledWith('Bad CSV', 'error')
            expect(result.current.balances).toEqual([])
        })

        it('shows warning toast when parser returns zero rows', async () => {
            mockParseCsvBalances.mockReturnValue({ balances: [] })

            const { result } = renderHook(() => useOpeningBalanceImport())
            await act(async () => {
                await result.current.handleFileUpload(makeFileEvent('empty csv'))
            })

            expect(mockShowToast).toHaveBeenCalledWith('No valid rows found in CSV file', 'warning')
        })

        it('shows error toast when file.text() throws', async () => {
            const event = {
                target: {
                    files: [{ text: vi.fn().mockRejectedValue(new Error('read fail')) }],
                    value: 'fail.csv',
                },
            } as unknown as React.ChangeEvent<HTMLInputElement>

            const { result } = renderHook(() => useOpeningBalanceImport())
            await act(async () => {
                await result.current.handleFileUpload(event)
            })

            expect(mockShowToast).toHaveBeenCalledWith(
                'Failed to parse CSV file. Ensure it is a valid CSV format.',
                'error'
            )
        })

        it('resets verified flag after loading new CSV', async () => {
            const rows = [makeBalance()]
            mockParseCsvBalances.mockReturnValue({ balances: rows })

            const { result } = renderHook(() => useOpeningBalanceImport())

            // First: load + verify
            await act(async () => {
                await result.current.handleFileUpload(makeFileEvent('csv'))
            })

            // Upload again - verified should reset
            mockParseCsvBalances.mockReturnValue({ balances: [makeBalance({ amount: 999 })] })
            await act(async () => {
                await result.current.handleFileUpload(makeFileEvent('csv2'))
            })

            expect(result.current.verified).toBe(false)
        })
    })

    // ── handleAddBalance ─────────────────────────────────────

    describe('handleAddBalance', () => {
        it('warns when identifier is empty', () => {
            const { result } = renderHook(() => useOpeningBalanceImport())

            act(() => {
                result.current.setNewBalance({ type: 'STUDENT', identifier: '', name: 'X', amount: 10, debitCredit: 'DEBIT' })
            })
            act(() => {
                result.current.handleAddBalance()
            })

            expect(mockShowToast).toHaveBeenCalledWith('Please fill all fields', 'warning')
            expect(result.current.balances).toEqual([])
        })

        it('warns when name is empty', () => {
            const { result } = renderHook(() => useOpeningBalanceImport())

            act(() => {
                result.current.setNewBalance({ type: 'STUDENT', identifier: '10', name: '', amount: 10, debitCredit: 'DEBIT' })
            })
            act(() => {
                result.current.handleAddBalance()
            })

            expect(mockShowToast).toHaveBeenCalledWith('Please fill all fields', 'warning')
        })

        it('warns when amount is zero', () => {
            const { result } = renderHook(() => useOpeningBalanceImport())

            act(() => {
                result.current.setNewBalance({ type: 'GL_ACCOUNT', identifier: 'A', name: 'GL', amount: 0, debitCredit: 'CREDIT' })
            })
            act(() => {
                result.current.handleAddBalance()
            })

            expect(mockShowToast).toHaveBeenCalledWith('Please fill all fields', 'warning')
        })

        it('adds balance and resets newBalance + closes modal on valid input', () => {
            const { result } = renderHook(() => useOpeningBalanceImport())

            act(() => {
                result.current.setShowAddModal(true)
            })
            act(() => {
                result.current.setNewBalance({ type: 'STUDENT', identifier: '201', name: 'Alice', amount: 100, debitCredit: 'DEBIT' })
            })
            act(() => {
                result.current.handleAddBalance()
            })

            expect(result.current.balances).toHaveLength(1)
            expect(result.current.balances[0]).toMatchObject({ identifier: '201', name: 'Alice', amount: 100 })
            expect(result.current.showAddModal).toBe(false)
            expect(result.current.newBalance).toMatchObject({ identifier: '', name: '', amount: 0 })
        })

        it('resets verified flag when adding a balance', async () => {
            const rows = [makeBalance({ amount: 100, debitCredit: 'DEBIT' }), makeBalance({ amount: 100, debitCredit: 'CREDIT' })]
            mockParseCsvBalances.mockReturnValue({ balances: rows })

            const { result } = renderHook(() => useOpeningBalanceImport())

            await act(async () => {
                await result.current.handleFileUpload(makeFileEvent('csv'))
            })
            act(() => { result.current.handleVerify() })
            expect(result.current.verified).toBe(true)

            act(() => {
                result.current.setNewBalance({ type: 'STUDENT', identifier: '999', name: 'New', amount: 50, debitCredit: 'DEBIT' })
            })
            act(() => { result.current.handleAddBalance() })
            expect(result.current.verified).toBe(false)
        })
    })

    // ── handleRemoveBalance ──────────────────────────────────

    describe('handleRemoveBalance', () => {
        it('removes balance at given index', async () => {
            const rows = [makeBalance({ identifier: 'A' }), makeBalance({ identifier: 'B' }), makeBalance({ identifier: 'C' })]
            mockParseCsvBalances.mockReturnValue({ balances: rows })

            const { result } = renderHook(() => useOpeningBalanceImport())
            await act(async () => {
                await result.current.handleFileUpload(makeFileEvent('csv'))
            })

            act(() => { result.current.handleRemoveBalance(1) })

            expect(result.current.balances).toHaveLength(2)
            expect(result.current.balances.map((b: { identifier: string }) => b.identifier)).toEqual(['A', 'C'])
        })

        it('resets verified flag on removal', async () => {
            const rows = [makeBalance({ amount: 50, debitCredit: 'DEBIT' }), makeBalance({ amount: 50, debitCredit: 'CREDIT' })]
            mockParseCsvBalances.mockReturnValue({ balances: rows })

            const { result } = renderHook(() => useOpeningBalanceImport())
            await act(async () => {
                await result.current.handleFileUpload(makeFileEvent('csv'))
            })
            act(() => { result.current.handleVerify() })
            expect(result.current.verified).toBe(true)

            act(() => { result.current.handleRemoveBalance(0) })
            expect(result.current.verified).toBe(false)
        })
    })

    // ── handleVerify ─────────────────────────────────────────

    describe('handleVerify', () => {
        it('warns when balances are empty', () => {
            const { result } = renderHook(() => useOpeningBalanceImport())
            act(() => { result.current.handleVerify() })
            expect(mockShowToast).toHaveBeenCalledWith('Add balances before verification', 'warning')
        })

        it('sets verified=true when debits equal credits', async () => {
            const rows = [
                makeBalance({ amount: 200, debitCredit: 'DEBIT' }),
                makeBalance({ amount: 200, debitCredit: 'CREDIT' }),
            ]
            mockParseCsvBalances.mockReturnValue({ balances: rows })

            const { result } = renderHook(() => useOpeningBalanceImport())
            await act(async () => {
                await result.current.handleFileUpload(makeFileEvent('csv'))
            })

            act(() => { result.current.handleVerify() })

            expect(result.current.verified).toBe(true)
            expect(mockShowToast).toHaveBeenCalledWith('Verification successful. Debits equal credits.', 'success')
        })

        it('sets verified=false when debits do not equal credits', async () => {
            const rows = [
                makeBalance({ amount: 300, debitCredit: 'DEBIT' }),
                makeBalance({ amount: 100, debitCredit: 'CREDIT' }),
            ]
            mockParseCsvBalances.mockReturnValue({ balances: rows })

            const { result } = renderHook(() => useOpeningBalanceImport())
            await act(async () => {
                await result.current.handleFileUpload(makeFileEvent('csv'))
            })

            act(() => { result.current.handleVerify() })

            expect(result.current.verified).toBe(false)
            expect(mockShowToast).toHaveBeenCalledWith(
                expect.stringContaining('Verification failed'),
                'error'
            )
        })
    })

    // ── handleImport ─────────────────────────────────────────

    describe('handleImport', () => {
        it('warns when balances are empty', async () => {
            const { result } = renderHook(() => useOpeningBalanceImport())
            await act(async () => { await result.current.handleImport() })
            expect(mockShowToast).toHaveBeenCalledWith('Add balances before importing', 'warning')
        })

        it('warns when not verified', async () => {
            mockParseCsvBalances.mockReturnValue({ balances: [makeBalance()] })
            const { result } = renderHook(() => useOpeningBalanceImport())
            await act(async () => {
                await result.current.handleFileUpload(makeFileEvent('csv'))
            })
            // verified is false
            await act(async () => { await result.current.handleImport() })
            expect(mockShowToast).toHaveBeenCalledWith('Please verify balances before importing', 'warning')
        })

        it('imports student balances successfully', async () => {
            const { result } = renderHook(() => useOpeningBalanceImport())
            await setupVerifiedBalances(result)

            await act(async () => { await result.current.handleImport() })

            expect(mockApi.finance.importStudentOpeningBalances).toHaveBeenCalledTimes(1)
            const [students, yearId, source, userId] = mockApi.finance.importStudentOpeningBalances.mock.calls[0]
            expect(yearId).toBe(5)
            expect(source).toBe('csv_import')
            expect(userId).toBe(1)
            expect(students).toHaveLength(2)
            expect(students[0]).toMatchObject({
                student_id: 10,
                admission_number: '10',
                opening_balance: 50000, // 500 * 100
                balance_type: 'DEBIT',
            })
            expect(mockShowToast).toHaveBeenCalledWith('Opening balances imported successfully', 'success')
        })

        it('imports GL balances successfully', async () => {
            const glRows = [
                makeBalance({ type: 'GL_ACCOUNT', identifier: 'GL-100', amount: 300, debitCredit: 'DEBIT' }),
                makeBalance({ type: 'GL_ACCOUNT', identifier: 'GL-200', amount: 300, debitCredit: 'CREDIT' }),
            ]
            const { result } = renderHook(() => useOpeningBalanceImport())
            await setupVerifiedBalances(result, glRows)

            await act(async () => { await result.current.handleImport() })

            expect(mockApi.finance.importGLOpeningBalances).toHaveBeenCalledTimes(1)
            const [glBalances, userId] = mockApi.finance.importGLOpeningBalances.mock.calls[0]
            expect(userId).toBe(1)
            expect(glBalances).toHaveLength(2)
            expect(glBalances[0]).toMatchObject({
                academic_year_id: 5,
                gl_account_code: 'GL-100',
                debit_amount: 30000,
                credit_amount: 0,
                imported_from: 'csv_import',
                imported_by_user_id: 1,
            })
            expect(glBalances[1]).toMatchObject({
                debit_amount: 0,
                credit_amount: 30000,
            })
        })

        it('imports mixed student + GL balances', async () => {
            const mixed = [
                makeBalance({ type: 'STUDENT', identifier: '5', amount: 400, debitCredit: 'DEBIT' }),
                makeBalance({ type: 'GL_ACCOUNT', identifier: 'GL-01', amount: 400, debitCredit: 'CREDIT' }),
            ]
            const { result } = renderHook(() => useOpeningBalanceImport())
            await setupVerifiedBalances(result, mixed)

            await act(async () => { await result.current.handleImport() })

            expect(mockApi.finance.importStudentOpeningBalances).toHaveBeenCalledTimes(1)
            expect(mockApi.finance.importGLOpeningBalances).toHaveBeenCalledTimes(1)
            expect(mockShowToast).toHaveBeenCalledWith('Opening balances imported successfully', 'success')
        })

        it('errors on invalid student ID (NaN identifier)', async () => {
            const rows = [
                makeBalance({ identifier: 'abc', amount: 100, debitCredit: 'DEBIT' }),
                makeBalance({ identifier: '99', amount: 100, debitCredit: 'CREDIT' }),
            ]
            const { result } = renderHook(() => useOpeningBalanceImport())
            await setupVerifiedBalances(result, rows)

            await act(async () => { await result.current.handleImport() })

            expect(mockShowToast).toHaveBeenCalledWith(
                'Student balances must include a valid numeric student ID in the identifier field.',
                'error'
            )
            expect(mockApi.finance.importStudentOpeningBalances).not.toHaveBeenCalled()
        })

        it('handles student import API failure', async () => {
            mockApi.finance.importStudentOpeningBalances.mockResolvedValue({ success: false, error: 'DB error' })
            mockGetResultMessage.mockReturnValue('DB error')

            const { result } = renderHook(() => useOpeningBalanceImport())
            await setupVerifiedBalances(result)

            await act(async () => { await result.current.handleImport() })

            expect(mockShowToast).toHaveBeenCalledWith('DB error', 'error')
        })

        it('handles GL import API failure', async () => {
            const glRows = [
                makeBalance({ type: 'GL_ACCOUNT', identifier: 'GL-1', amount: 100, debitCredit: 'DEBIT' }),
                makeBalance({ type: 'GL_ACCOUNT', identifier: 'GL-2', amount: 100, debitCredit: 'CREDIT' }),
            ]
            mockApi.finance.importGLOpeningBalances.mockResolvedValue({ success: false, error: 'GL fail' })
            mockGetResultMessage.mockReturnValue('GL fail')

            const { result } = renderHook(() => useOpeningBalanceImport())
            await setupVerifiedBalances(result, glRows)

            await act(async () => { await result.current.handleImport() })

            expect(mockShowToast).toHaveBeenCalledWith('GL fail', 'error')
        })

        it('clears balances and verified after successful import', async () => {
            const { result } = renderHook(() => useOpeningBalanceImport())
            await setupVerifiedBalances(result)

            await act(async () => { await result.current.handleImport() })

            expect(result.current.balances).toEqual([])
            expect(result.current.verified).toBe(false)
        })

        it('sets importing=false after failure', async () => {
            mockApi.finance.importStudentOpeningBalances.mockRejectedValue(new Error('network'))

            const { result } = renderHook(() => useOpeningBalanceImport())
            await setupVerifiedBalances(result)

            await act(async () => { await result.current.handleImport() })

            expect(result.current.importing).toBe(false)
        })
    })

    // ── Escape key listener ──────────────────────────────────

    describe('Escape key listener', () => {
        it('closes the add modal when Escape is pressed', () => {
            const { result } = renderHook(() => useOpeningBalanceImport())

            act(() => { result.current.setShowAddModal(true) })
            expect(result.current.showAddModal).toBe(true)

            act(() => {
                globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
            })

            expect(result.current.showAddModal).toBe(false)
        })

        it('does not close when a different key is pressed', () => {
            const { result } = renderHook(() => useOpeningBalanceImport())

            act(() => { result.current.setShowAddModal(true) })

            act(() => {
                globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
            })

            expect(result.current.showAddModal).toBe(true)
        })

        it('does not interfere when modal is already closed', () => {
            const { result } = renderHook(() => useOpeningBalanceImport())
            expect(result.current.showAddModal).toBe(false)

            act(() => {
                globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
            })

            expect(result.current.showAddModal).toBe(false)
        })
    })

    // ── Derived values ───────────────────────────────────────

    describe('derived values', () => {
        it('computes totalDebits and totalCredits correctly', async () => {
            const rows = [
                makeBalance({ amount: 100, debitCredit: 'DEBIT' }),
                makeBalance({ amount: 250, debitCredit: 'DEBIT' }),
                makeBalance({ amount: 300, debitCredit: 'CREDIT' }),
            ]
            mockParseCsvBalances.mockReturnValue({ balances: rows })

            const { result } = renderHook(() => useOpeningBalanceImport())
            await act(async () => {
                await result.current.handleFileUpload(makeFileEvent('csv'))
            })

            expect(result.current.totalDebits).toBe(350)
            expect(result.current.totalCredits).toBe(300)
        })

        it('computes variance as absolute difference', async () => {
            const rows = [
                makeBalance({ amount: 100, debitCredit: 'DEBIT' }),
                makeBalance({ amount: 300, debitCredit: 'CREDIT' }),
            ]
            mockParseCsvBalances.mockReturnValue({ balances: rows })

            const { result } = renderHook(() => useOpeningBalanceImport())
            await act(async () => {
                await result.current.handleFileUpload(makeFileEvent('csv'))
            })

            expect(result.current.variance).toBe(200)
        })

        it('isBalanced is true when variance < 0.01', async () => {
            const rows = [
                makeBalance({ amount: 500, debitCredit: 'DEBIT' }),
                makeBalance({ amount: 500, debitCredit: 'CREDIT' }),
            ]
            mockParseCsvBalances.mockReturnValue({ balances: rows })

            const { result } = renderHook(() => useOpeningBalanceImport())
            await act(async () => {
                await result.current.handleFileUpload(makeFileEvent('csv'))
            })

            expect(result.current.isBalanced).toBe(true)
        })

        it('isBalanced is false when debits != credits', async () => {
            const rows = [
                makeBalance({ amount: 500, debitCredit: 'DEBIT' }),
                makeBalance({ amount: 100, debitCredit: 'CREDIT' }),
            ]
            mockParseCsvBalances.mockReturnValue({ balances: rows })

            const { result } = renderHook(() => useOpeningBalanceImport())
            await act(async () => {
                await result.current.handleFileUpload(makeFileEvent('csv'))
            })

            expect(result.current.isBalanced).toBe(false)
        })
    })

    // ── Additional branch coverage ─────────────────────────

    describe('branch edge cases', () => {
        it('handleImport shows fallback message for non-Error exception', async () => {
            mockApi.finance.importStudentOpeningBalances.mockRejectedValue(42)

            const rows = [
                makeBalance({ identifier: '10', amount: 500, debitCredit: 'DEBIT' }),
                makeBalance({ identifier: '11', amount: 500, debitCredit: 'CREDIT' }),
            ]
            mockParseCsvBalances.mockReturnValue({ balances: rows })

            const { result } = renderHook(() => useOpeningBalanceImport())
            await act(async () => {
                await result.current.handleFileUpload(makeFileEvent('csv'))
            })
            act(() => { result.current.handleVerify() })

            await act(async () => { await result.current.handleImport() })

            expect(mockShowToast).toHaveBeenCalledWith('Import failed. Please try again.', 'error')
            expect(result.current.importing).toBe(false)
        })

        it('handleFileUpload catches exception from file.text()', async () => {
            const badFile = { text: vi.fn().mockRejectedValue(new Error('Read error')) }
            const event = {
                target: { files: [badFile], value: 'bad.csv' },
            } as unknown as React.ChangeEvent<HTMLInputElement>

            const { result } = renderHook(() => useOpeningBalanceImport())
            await act(async () => {
                await result.current.handleFileUpload(event)
            })

            expect(mockShowToast).toHaveBeenCalledWith(
                'Failed to parse CSV file. Ensure it is a valid CSV format.',
                'error'
            )
        })

        it('handleImport errors on student with zero ID', async () => {
            const rows = [
                makeBalance({ identifier: '0', amount: 100, debitCredit: 'DEBIT' }),
                makeBalance({ identifier: '5', amount: 100, debitCredit: 'CREDIT' }),
            ]
            mockParseCsvBalances.mockReturnValue({ balances: rows })

            const { result } = renderHook(() => useOpeningBalanceImport())
            await act(async () => {
                await result.current.handleFileUpload(makeFileEvent('csv'))
            })
            act(() => { result.current.handleVerify() })

            await act(async () => { await result.current.handleImport() })

            expect(mockShowToast).toHaveBeenCalledWith(
                'Student balances must include a valid numeric student ID in the identifier field.',
                'error'
            )
        })
    })
})
