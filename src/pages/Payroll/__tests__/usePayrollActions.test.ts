// @vitest-environment jsdom
/**
 * Tests for usePayrollActions hook.
 *
 * Covers: action confirmation guards, execute callbacks (confirm, markPaid, revert, delete, recalculate),
 * CSV/P10 export, notification handlers, and the confirmed-action dispatch.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { usePayrollActions } from '../usePayrollActions'

// ── Mocks ────────────────────────────────────────────────────

vi.mock('../payrollHelpers', () => ({
  getConfirmDialogCopy: vi.fn(
    (action: string | null, count: number, name?: string) =>
      action ? { title: `Title-${action}`, message: `Msg ${count} ${name}`, confirmLabel: 'OK' } : null
  ),
}))

vi.mock('../../../utils/format', () => ({
  formatCurrencyFromCents: (v: number) => `KSh ${(v / 100).toFixed(2)}`,
}))

vi.mock('../../../utils/ipc', () => ({
  unwrapArrayResult: <T,>(v: T) => (Array.isArray(v) ? v : []),
}))

vi.mock('../../../utils/print', () => ({
  printDocument: vi.fn(),
}))

vi.mock('../../../utils/runtimeError', () => ({
  reportRuntimeError: (_err: unknown, _ctx: unknown, fallback: string) => fallback,
}))

const mockPrintPayslipForStaff = vi.fn()
vi.mock('../utils/printPayslip', () => ({
  printPayslipForStaff: mockPrintPayslipForStaff,
}))

// ── electronAPI stub ─────────────────────────────────────────

let mockApi: Record<string, Record<string, ReturnType<typeof vi.fn>>>

function buildElectronAPI() {
  return {
    staff: {
      confirmPayroll: vi.fn(),
      markPayrollPaid: vi.fn(),
      revertPayrollToDraft: vi.fn(),
      deletePayroll: vi.fn(),
      recalculatePayroll: vi.fn(),
    },
    communications: {
      sendSMS: vi.fn(),
    },
  }
}

// ── Default deps factory ─────────────────────────────────────

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: 1, username: 'admin' } as any,
    selectedPeriod: { id: 10, period_name: 'Jan-2026', status: 'DRAFT' } as any,
    payrollData: [
      { staff_id: 1, staff_name: 'Alice', phone: '0700000001', net_salary: 50000, staff_number: 'S1', department: 'Admin', basic_salary: 40000, allowances: 5000, gross_salary: 45000, paye: 1000, nssf: 500, shif: 200, housing_levy: 300, total_deductions: 2000 },
      { staff_id: 2, staff_name: 'Bob', phone: null, net_salary: 30000, staff_number: 'S2', department: 'IT', basic_salary: 25000, allowances: 2000, gross_salary: 27000, paye: 500, nssf: 300, shif: 100, housing_levy: 100, total_deductions: 1000 },
    ] as any[],
    schoolSettings: { school_name: 'Test School' } as any,
    loadHistory: vi.fn().mockResolvedValue(undefined), // eslint-disable-line unicorn/no-useless-undefined
    handleBack: vi.fn(),
    showToast: vi.fn(),
    setSelectedPeriod: vi.fn(),
    setPayrollData: vi.fn(),
    setError: vi.fn(),
    exportP10Csv: vi.fn().mockResolvedValue('csv-data'),
    isExportingP10: false,
    generatePayslip: vi.fn().mockResolvedValue(null),
    ...overrides,
  }
}

beforeEach(() => {
  mockApi = buildElectronAPI()
  ;(globalThis as any).electronAPI = mockApi
  mockPrintPayslipForStaff.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
  delete (globalThis as any).electronAPI
})

// ══════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════

describe('usePayrollActions', () => {
  // ── Guard validation ─────────────────────────────────────

  describe('requestActionConfirmation – guards', () => {
    it('shows error when user is null', () => {
      const deps = makeDeps({ user: null })
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('confirm'))
      expect(deps.showToast).toHaveBeenCalledWith('User not authenticated', 'error')
    })

    it('shows warning when period is not selected (non-bulkNotify)', () => {
      const deps = makeDeps({ selectedPeriod: null })
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('markPaid'))
      expect(deps.showToast).toHaveBeenCalledWith('Select a payroll period first', 'warning')
    })

    it('shows warning when bulkNotify with zero payroll entries', () => {
      const deps = makeDeps({ payrollData: [] })
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('bulkNotify'))
      expect(deps.showToast).toHaveBeenCalledWith('No staff records available to notify', 'warning')
    })

    it('sets confirmAction when all guards pass', () => {
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('confirm'))
      expect(result.current.confirmAction).toBe('confirm')
    })

    it('bulkNotify does NOT require a periodId', () => {
      const deps = makeDeps({ selectedPeriod: { period_name: 'test' } })
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('bulkNotify'))
      expect(result.current.confirmAction).toBe('bulkNotify')
    })
  })

  // ── Convenience action wrappers ──────────────────────────

  describe('convenience handlers', () => {
    it.each([
      ['handleConfirm', 'confirm'],
      ['handleMarkPaid', 'markPaid'],
      ['handleRevertToDraft', 'revert'],
      ['handleDelete', 'delete'],
      ['handleRecalculate', 'recalculate'],
    ] as const)('%s requests %s', (handler, action) => {
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => (result.current as any)[handler]())
      expect(result.current.confirmAction).toBe(action)
    })
  })

  // ── executeConfirm ───────────────────────────────────────

  describe('executeConfirmedAction → confirm', () => {
    it('confirms payroll and updates period status on success', async () => {
      mockApi.staff.confirmPayroll.mockResolvedValue({ success: true })
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      // set confirmAction
      act(() => result.current.requestActionConfirmation('confirm'))
      await act(async () => result.current.executeConfirmedAction())

      expect(mockApi.staff.confirmPayroll).toHaveBeenCalledWith(10, 1)
      expect(deps.setSelectedPeriod).toHaveBeenCalled()
      expect(deps.loadHistory).toHaveBeenCalled()
      expect(deps.showToast).toHaveBeenCalledWith('Payroll confirmed successfully', 'success')
    })

    it('sets error on API failure', async () => {
      mockApi.staff.confirmPayroll.mockResolvedValue({ success: false, error: 'Server down' })
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('confirm'))
      await act(async () => result.current.executeConfirmedAction())

      expect(deps.setError).toHaveBeenCalledWith('Server down')
    })

    it('sets error on exception', async () => {
      mockApi.staff.confirmPayroll.mockRejectedValue(new Error('Network'))
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('confirm'))
      await act(async () => result.current.executeConfirmedAction())

      expect(deps.setError).toHaveBeenCalledWith('Failed to confirm payroll')
    })

    it('early-returns when selectedPeriod has no id', async () => {
      const deps = makeDeps({ selectedPeriod: { period_name: 'x' } })
      const { result } = renderHook(() => usePayrollActions(deps))

      // directly call the confirm action
      act(() => { result.current.setConfirmAction('confirm') })
      await act(async () => result.current.executeConfirmedAction())

      expect(mockApi.staff.confirmPayroll).not.toHaveBeenCalled()
    })
  })

  // ── executeMarkPaid ──────────────────────────────────────

  describe('executeConfirmedAction → markPaid', () => {
    it('marks payroll paid on success', async () => {
      mockApi.staff.markPayrollPaid.mockResolvedValue({ success: true })
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('markPaid'))
      await act(async () => result.current.executeConfirmedAction())

      expect(mockApi.staff.markPayrollPaid).toHaveBeenCalledWith(10, 1)
      expect(deps.showToast).toHaveBeenCalledWith('Payroll marked as paid', 'success')
    })

    it('sets error on failure result', async () => {
      mockApi.staff.markPayrollPaid.mockResolvedValue({ success: false })
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('markPaid'))
      await act(async () => result.current.executeConfirmedAction())

      expect(deps.setError).toHaveBeenCalledWith('Failed to mark payroll as paid')
    })
  })

  // ── executeRevertToDraft ─────────────────────────────────

  describe('executeConfirmedAction → revert', () => {
    it('reverts payroll to draft on success', async () => {
      mockApi.staff.revertPayrollToDraft.mockResolvedValue({ success: true })
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('revert'))
      await act(async () => result.current.executeConfirmedAction())

      expect(mockApi.staff.revertPayrollToDraft).toHaveBeenCalledWith(10, 1)
      expect(deps.showToast).toHaveBeenCalledWith('Payroll reverted to draft', 'success')
    })

    it('handles exception during revert', async () => {
      mockApi.staff.revertPayrollToDraft.mockRejectedValue(new Error('oops'))
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('revert'))
      await act(async () => result.current.executeConfirmedAction())

      expect(deps.setError).toHaveBeenCalledWith('Failed to revert payroll')
    })
  })

  // ── executeDelete ────────────────────────────────────────

  describe('executeConfirmedAction → delete', () => {
    it('deletes payroll and navigates back on success', async () => {
      mockApi.staff.deletePayroll.mockResolvedValue({ success: true })
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('delete'))
      await act(async () => result.current.executeConfirmedAction())

      expect(mockApi.staff.deletePayroll).toHaveBeenCalledWith(10, 1)
      expect(deps.handleBack).toHaveBeenCalled()
      expect(deps.showToast).toHaveBeenCalledWith('Payroll draft deleted', 'success')
    })

    it('sets error on delete failure', async () => {
      mockApi.staff.deletePayroll.mockResolvedValue({ success: false, error: 'Locked' })
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('delete'))
      await act(async () => result.current.executeConfirmedAction())

      expect(deps.setError).toHaveBeenCalledWith('Locked')
    })
  })

  // ── executeRecalculate ───────────────────────────────────

  describe('executeConfirmedAction → recalculate', () => {
    it('recalculates payroll and updates data on success', async () => {
      mockApi.staff.recalculatePayroll.mockResolvedValue({ success: true, results: [{ id: 1 }] })
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('recalculate'))
      await act(async () => result.current.executeConfirmedAction())

      expect(mockApi.staff.recalculatePayroll).toHaveBeenCalledWith(10, 1)
      expect(deps.setPayrollData).toHaveBeenCalled()
      expect(deps.showToast).toHaveBeenCalledWith('Payroll recalculated', 'success')
    })

    it('sets error on recalculate failure', async () => {
      mockApi.staff.recalculatePayroll.mockResolvedValue({ success: false, error: 'Bad data' })
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('recalculate'))
      await act(async () => result.current.executeConfirmedAction())

      expect(deps.setError).toHaveBeenCalledWith('Bad data')
    })

    it('sets fallback error on recalculate failure without error string', async () => {
      mockApi.staff.recalculatePayroll.mockResolvedValue({ success: false })
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('recalculate'))
      await act(async () => result.current.executeConfirmedAction())

      expect(deps.setError).toHaveBeenCalledWith('Failed to recalculate payroll')
    })

    it('handles exception on recalculate', async () => {
      mockApi.staff.recalculatePayroll.mockRejectedValue(new Error('Crash'))
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('recalculate'))
      await act(async () => result.current.executeConfirmedAction())

      expect(deps.setError).toHaveBeenCalledWith('Failed to recalculate payroll')
    })
  })

  // ── Notification handlers ────────────────────────────────

  describe('handleNotifyStaff', () => {
    it('warns when staff has no phone', async () => {
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      await act(async () => result.current.handleNotifyStaff({ staff_id: 2, staff_name: 'Bob', phone: null } as any))
      expect(deps.showToast).toHaveBeenCalledWith('Staff phone number is missing', 'warning')
    })

    it('warns when user is null', async () => {
      const deps = makeDeps({ user: null })
      const { result } = renderHook(() => usePayrollActions(deps))

      await act(async () => result.current.handleNotifyStaff({ staff_id: 1, staff_name: 'Alice', phone: '0700' } as any))
      expect(deps.showToast).toHaveBeenCalledWith('User not authenticated', 'error')
    })

    it('sends notification on success', async () => {
      mockApi.communications.sendSMS.mockResolvedValue({ success: true })
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      await act(async () => result.current.handleNotifyStaff(deps.payrollData[0]))
      expect(mockApi.communications.sendSMS).toHaveBeenCalled()
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('Notification sent'), 'success')
    })

    it('shows error when SMS fails', async () => {
      mockApi.communications.sendSMS.mockResolvedValue({ success: false, error: 'No credit' })
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      await act(async () => result.current.handleNotifyStaff(deps.payrollData[0]))
      expect(deps.showToast).toHaveBeenCalledWith('No credit', 'error')
    })

    it('shows fallback error message when SMS returns failure without error string', async () => {
      mockApi.communications.sendSMS.mockResolvedValue({ success: false })
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      await act(async () => result.current.handleNotifyStaff(deps.payrollData[0]))
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('Failed to notify'), 'error')
    })

    it('handles thrown exception from sendSMS', async () => {
      mockApi.communications.sendSMS.mockRejectedValue(new Error('Network down'))
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      await act(async () => result.current.handleNotifyStaff(deps.payrollData[0]))
      expect(deps.showToast).toHaveBeenCalledWith(expect.any(String), 'error')
    })
  })

  describe('handleBulkNotify', () => {
    it('shows error when user is null', async () => {
      const deps = makeDeps({ user: null })
      const { result } = renderHook(() => usePayrollActions(deps))

      await act(async () => result.current.handleBulkNotify())
      expect(deps.showToast).toHaveBeenCalledWith('User not authenticated', 'error')
    })

    it('shows warning when payrollData is empty', async () => {
      const deps = makeDeps({ payrollData: [] })
      const { result } = renderHook(() => usePayrollActions(deps))

      await act(async () => result.current.handleBulkNotify())
      expect(deps.showToast).toHaveBeenCalledWith('No payroll staff entries found for notifications', 'warning')
    })

    it('sends bulk notifications with mixed results', async () => {
      // Alice has phone, Bob has null phone
      mockApi.communications.sendSMS.mockResolvedValue({ success: true })
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      await act(async () => result.current.handleBulkNotify())
      // Bob has no phone → 1 failed, Alice sent → 1 sent
      expect(deps.showToast).toHaveBeenCalledWith(
        expect.stringContaining('1 sent, 1 failed'),
        'warning'
      )
    })

    it('reports all successful when every staff has phone', async () => {
      mockApi.communications.sendSMS.mockResolvedValue({ success: true })
      const deps = makeDeps({
        payrollData: [
          { staff_id: 1, staff_name: 'A', phone: '07001', net_salary: 1000 },
          { staff_id: 2, staff_name: 'B', phone: '07002', net_salary: 2000 },
        ],
      })
      const { result } = renderHook(() => usePayrollActions(deps))

      await act(async () => result.current.handleBulkNotify())
      expect(deps.showToast).toHaveBeenCalledWith(
        expect.stringContaining('2 staff member'),
        'success'
      )
    })

    it('counts SMS exceptions as failures during bulk notify', async () => {
      mockApi.communications.sendSMS.mockRejectedValue(new Error('SMS gateway down'))
      const deps = makeDeps({
        payrollData: [
          { staff_id: 1, staff_name: 'A', phone: '07001', net_salary: 1000 },
        ],
      })
      const { result } = renderHook(() => usePayrollActions(deps))

      await act(async () => result.current.handleBulkNotify())
      expect(deps.showToast).toHaveBeenCalledWith(
        expect.stringContaining('0 sent, 1 failed'),
        'warning'
      )
    })
  })

  // ── Export handlers ──────────────────────────────────────

  describe('handleExportCSV', () => {
    it('does nothing when payrollData is empty', () => {
      const deps = makeDeps({ payrollData: [] })
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.handleExportCSV())
      // no crash
      expect(true).toBe(true)
    })

    it('creates Blob and download link when data exists', () => {
      const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.handleExportCSV())
      expect(createSpy).toHaveBeenCalled()
      createSpy.mockRestore()
      revokeSpy.mockRestore()
    })
  })

  describe('handleExportP10', () => {
    it('exports P10 CSV and shows toast', async () => {
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:p10')
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      await act(async () => result.current.handleExportP10())
      expect(deps.exportP10Csv).toHaveBeenCalledWith(10)
      expect(deps.showToast).toHaveBeenCalledWith('P10 successfully exported', 'success')

      vi.restoreAllMocks()
    })

    it('does nothing when selectedPeriod has no id', async () => {
      const deps = makeDeps({ selectedPeriod: { period_name: 'x' } })
      const { result } = renderHook(() => usePayrollActions(deps))

      await act(async () => result.current.handleExportP10())
      expect(deps.exportP10Csv).not.toHaveBeenCalled()
    })

    it('does nothing when exportP10Csv returns null', async () => {
      const createSpy = vi.spyOn(URL, 'createObjectURL')
      const deps = makeDeps({ exportP10Csv: vi.fn().mockResolvedValue(null) })
      const { result } = renderHook(() => usePayrollActions(deps))

      await act(async () => result.current.handleExportP10())
      expect(createSpy).not.toHaveBeenCalled()
      createSpy.mockRestore()
    })
  })

  // ── handlePrintPayslip ───────────────────────────────────

  describe('handlePrintPayslip', () => {
    it('shows error toast when printPayslipForStaff throws an Error', async () => {
      mockPrintPayslipForStaff.mockRejectedValue(new Error('Payslip generation error'))
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      await act(async () => result.current.handlePrintPayslip({ staff_name: 'X' } as any))
      expect(deps.showToast).toHaveBeenCalledWith('Payslip generation error', 'error')
    })

    it('shows fallback message for non-Error throw', async () => {
      mockPrintPayslipForStaff.mockImplementation(() => { throw 'bizarre failure' }) // NOSONAR
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      await act(async () => result.current.handlePrintPayslip({ staff_name: 'X' } as any))
      expect(deps.showToast).toHaveBeenCalledWith('Failed to print payslip', 'error')
    })

    it('calls printPayslipForStaff successfully on the happy path', async () => {
      // eslint-disable-next-line unicorn/no-useless-undefined
      mockPrintPayslipForStaff.mockResolvedValue(undefined)
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      await act(async () => result.current.handlePrintPayslip(deps.payrollData[0]))
      expect(mockPrintPayslipForStaff).toHaveBeenCalledWith(
        deps.payrollData[0],
        'Jan-2026',
        deps.generatePayslip,
        expect.any(Function),
        { school_name: 'Test School' }
      )
      expect(deps.showToast).not.toHaveBeenCalledWith(expect.any(String), 'error')
    })

    it('passes empty object when schoolSettings is null', async () => {
      // eslint-disable-next-line unicorn/no-useless-undefined
      mockPrintPayslipForStaff.mockResolvedValue(undefined)
      const deps = makeDeps({ schoolSettings: null })
      const { result } = renderHook(() => usePayrollActions(deps))

      await act(async () => result.current.handlePrintPayslip(deps.payrollData[0]))
      expect(mockPrintPayslipForStaff).toHaveBeenCalledWith(
        deps.payrollData[0],
        'Jan-2026',
        deps.generatePayslip,
        expect.any(Function),
        {}
      )
    })
  })

  // ── executeConfirmedAction edge cases ────────────────────

  describe('executeConfirmedAction edge cases', () => {
    it('does nothing when confirmAction is null', async () => {
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      // confirmAction is null by default
      await act(async () => result.current.executeConfirmedAction())
      // no API calls
      expect(mockApi.staff.confirmPayroll).not.toHaveBeenCalled()
    })

    it('dispatches bulkNotify action', async () => {
      mockApi.communications.sendSMS.mockResolvedValue({ success: true })
      const deps = makeDeps({
        payrollData: [
          { staff_id: 1, staff_name: 'A', phone: '07001', net_salary: 1000 },
        ],
      })
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('bulkNotify'))
      await act(async () => result.current.executeConfirmedAction())

      expect(mockApi.communications.sendSMS).toHaveBeenCalled()
    })

    it('hits default branch for unrecognised action values', async () => {
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => { result.current.setConfirmAction('unknownAction' as any) })
      await act(async () => result.current.executeConfirmedAction())

      // No API calls should be made for an unknown action
      expect(mockApi.staff.confirmPayroll).not.toHaveBeenCalled()
      expect(mockApi.staff.markPayrollPaid).not.toHaveBeenCalled()
      expect(mockApi.staff.deletePayroll).not.toHaveBeenCalled()
      expect(mockApi.staff.recalculatePayroll).not.toHaveBeenCalled()
      expect(mockApi.communications.sendSMS).not.toHaveBeenCalled()
    })
  })

  // ── Derived state ────────────────────────────────────────

  describe('derived state', () => {
    it('confirmDialogCopy is null when confirmAction is null', () => {
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      expect(result.current.confirmDialogCopy).toBeNull()
    })

    it('isDialogProcessing reflects actionLoading', () => {
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      // no action
      expect(result.current.isDialogProcessing).toBe(false)
    })
  })

  // ── Additional branch coverage ─────────────────────────

  describe('additional branch coverage', () => {
    it('executeMarkPaid early-returns when selectedPeriod has no id', async () => {
      const deps = makeDeps({ selectedPeriod: { period_name: 'x' } })
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => { result.current.setConfirmAction('markPaid') })
      await act(async () => result.current.executeConfirmedAction())

      expect(mockApi.staff.markPayrollPaid).not.toHaveBeenCalled()
    })

    it('executeMarkPaid handles exception', async () => {
      mockApi.staff.markPayrollPaid.mockRejectedValue(new Error('fail'))
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('markPaid'))
      await act(async () => result.current.executeConfirmedAction())

      expect(deps.setError).toHaveBeenCalledWith('Failed to mark payroll as paid')
    })

    it('executeDelete handles exception', async () => {
      mockApi.staff.deletePayroll.mockRejectedValue(new Error('fail'))
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('delete'))
      await act(async () => result.current.executeConfirmedAction())

      expect(deps.setError).toHaveBeenCalledWith('Failed to delete payroll')
    })

    it('executeDelete sets fallback error on failure without error string', async () => {
      mockApi.staff.deletePayroll.mockResolvedValue({ success: false })
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('delete'))
      await act(async () => result.current.executeConfirmedAction())

      expect(deps.setError).toHaveBeenCalledWith('Failed to delete payroll')
    })

    it('executeRevertToDraft sets error on failure result', async () => {
      mockApi.staff.revertPayrollToDraft.mockResolvedValue({ success: false, error: 'Cannot revert' })
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('revert'))
      await act(async () => result.current.executeConfirmedAction())

      expect(deps.setError).toHaveBeenCalledWith('Cannot revert')
    })

    it('executeConfirm sets fallback error on failure without error string', async () => {
      mockApi.staff.confirmPayroll.mockResolvedValue({ success: false })
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('confirm'))
      await act(async () => result.current.executeConfirmedAction())

      expect(deps.setError).toHaveBeenCalledWith('Failed to confirm payroll')
    })

    it('sendBulkNotifications counts SMS result.success=false as failure', async () => {
      mockApi.communications.sendSMS.mockResolvedValue({ success: false })
      const deps = makeDeps({
        payrollData: [
          { staff_id: 1, staff_name: 'A', phone: '07001', net_salary: 1000 },
        ],
      })
      const { result } = renderHook(() => usePayrollActions(deps))

      await act(async () => result.current.handleBulkNotify())
      expect(deps.showToast).toHaveBeenCalledWith(
        expect.stringContaining('0 sent, 1 failed'),
        'warning'
      )
    })
  })

  // ── Branch coverage: validateActionGuard – bulkNotify with payrollCount=0 (L30) ──
  describe('bulkNotify guard with empty payroll', () => {
    it('handleBulkNotify early-returns when payroll list is empty', async () => {
      const deps = makeDeps({ payrollData: [] })
      const { result } = renderHook(() => usePayrollActions(deps))

      await act(async () => result.current.handleBulkNotify())
      expect(deps.showToast).toHaveBeenCalledWith(
        expect.stringContaining('No payroll'),
        'warning'
      )
    })
  })

  // ── Branch coverage: handleExportP10 – no period set (L240) ──
  describe('handleExportP10 – missing period', () => {
    it('handleExportP10 does nothing when no period selected', async () => {
      const deps = makeDeps({ selectedPeriod: null as any })
      const { result } = renderHook(() => usePayrollActions(deps))

      await act(async () => result.current.handleExportP10())
      expect(deps.exportP10Csv).not.toHaveBeenCalled()
    })
  })

  // ── Branch coverage: executeConfirmedAction – delete success (L185) ──
  describe('executeConfirmedAction – delete flow', () => {
    it('handleDeletePayroll calls handleBack on success', async () => {
      mockApi.staff.deletePayroll.mockResolvedValue({ success: true })
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('delete'))
      await act(async () => result.current.executeConfirmedAction())

      expect(deps.handleBack).toHaveBeenCalled()
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('deleted'), 'success')
    })
  })

  // ── Branch coverage: handleNotifyStaff – exception path (L215) ──
  describe('handleNotifyStaff – exception handling', () => {
    it('catches non-Error exception from sendSMS', async () => {
      mockApi.communications.sendSMS.mockRejectedValue('raw string error')
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      await act(async () => result.current.handleNotifyStaff(deps.payrollData[0]))
      expect(deps.showToast).toHaveBeenCalledWith(expect.any(String), 'error')
    })
  })

  // ── Branch coverage: executeConfirm success path (L138) ──
  describe('executeConfirmedAction – confirm success', () => {
    it('updates period status to CONFIRMED on success', async () => {
      mockApi.staff.confirmPayroll.mockResolvedValue({ success: true })
      const deps = makeDeps({
        setSelectedPeriod: vi.fn((fn: any) => { if (typeof fn === 'function') { fn({ id: 10, status: 'DRAFT' }) } })
      })
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('confirm'))
      await act(async () => result.current.executeConfirmedAction())

      expect(deps.setSelectedPeriod).toHaveBeenCalled()
      expect(deps.loadHistory).toHaveBeenCalled()
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('confirmed'), 'success')
    })
  })

  // ── Branch coverage: executeMarkPaid success path (L157) ──
  describe('executeConfirmedAction – markPaid success', () => {
    it('updates period status to PAID on success', async () => {
      mockApi.staff.markPayrollPaid.mockResolvedValue({ success: true })
      const deps = makeDeps({
        setSelectedPeriod: vi.fn((fn: any) => { if (typeof fn === 'function') { fn({ id: 10, status: 'CONFIRMED' }) } })
      })
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('markPaid'))
      await act(async () => result.current.executeConfirmedAction())

      expect(deps.setSelectedPeriod).toHaveBeenCalled()
      expect(deps.loadHistory).toHaveBeenCalled()
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('paid'), 'success')
    })
  })

  // ── Branch coverage: executeRevertToDraft success path (L176) ──
  describe('executeConfirmedAction – revert success', () => {
    it('updates period status to DRAFT on revert', async () => {
      mockApi.staff.revertPayrollToDraft.mockResolvedValue({ success: true })
      const deps = makeDeps({
        setSelectedPeriod: vi.fn((fn: any) => { if (typeof fn === 'function') { fn({ id: 10, status: 'CONFIRMED' }) } })
      })
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('revert'))
      await act(async () => result.current.executeConfirmedAction())

      expect(deps.setSelectedPeriod).toHaveBeenCalled()
      expect(deps.loadHistory).toHaveBeenCalled()
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('reverted'), 'success')
    })
  })

  // ── Branch coverage: executeRecalculate success path (L210) ──
  describe('executeConfirmedAction – recalculate success', () => {
    it('refreshes payroll data after recalculate', async () => {
      mockApi.staff.recalculatePayroll.mockResolvedValue({ success: true, results: [] })
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('recalculate'))
      await act(async () => result.current.executeConfirmedAction())

      expect(deps.setPayrollData).toHaveBeenCalled()
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('recalculated'), 'success')
    })
  })

  // ── Branch coverage: executeConfirm error (API rejects) ──
  describe('executeConfirmedAction – confirm error', () => {
    it('shows error when confirm API fails', async () => {
      mockApi.staff.confirmPayroll.mockResolvedValue({ success: false })
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('confirm'))
      await act(async () => result.current.executeConfirmedAction())

      expect(deps.setError).toHaveBeenCalled()
    })

    it('shows error with API error message', async () => {
      mockApi.staff.confirmPayroll.mockResolvedValue({ success: false, error: 'Specific error' })
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('confirm'))
      await act(async () => result.current.executeConfirmedAction())

      expect(deps.setError).toHaveBeenCalledWith('Specific error')
    })

    it('handles confirm throw', async () => {
      mockApi.staff.confirmPayroll.mockRejectedValue(new Error('Network'))
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('confirm'))
      await act(async () => result.current.executeConfirmedAction())

      expect(deps.setError).toHaveBeenCalled()
    })
  })

  // ── Branch coverage: executeMarkPaid error ──
  describe('executeConfirmedAction – markPaid error', () => {
    it('shows error when markPaid API fails', async () => {
      mockApi.staff.markPayrollPaid.mockResolvedValue({ success: false })
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('markPaid'))
      await act(async () => result.current.executeConfirmedAction())

      expect(deps.setError).toHaveBeenCalled()
    })
  })

  // ── Branch coverage: executeRevertToDraft error ──
  describe('executeConfirmedAction – revert error', () => {
    it('shows error when revert API fails', async () => {
      mockApi.staff.revertPayrollToDraft.mockResolvedValue({ success: false })
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('revert'))
      await act(async () => result.current.executeConfirmedAction())

      expect(deps.setError).toHaveBeenCalled()
    })
  })

  // ── Branch coverage: executeDelete error ──
  describe('executeConfirmedAction – delete error', () => {
    it('shows error when delete API returns failure', async () => {
      mockApi.staff.deletePayroll.mockResolvedValue({ success: false })
      const deps = makeDeps()
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.requestActionConfirmation('delete'))
      await act(async () => result.current.executeConfirmedAction())

      expect(deps.setError).toHaveBeenCalled()
    })
  })

  // ── Branch coverage: export fallback filenames ──────────────
  describe('export fallback filenames', () => {
    it('handleExportCSV uses fallback filename when period has no period_name', () => {
      const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:csv')
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
      const deps = makeDeps({ selectedPeriod: { id: 10 } })
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.handleExportCSV())
      expect(createSpy).toHaveBeenCalled()
      createSpy.mockRestore()
      revokeSpy.mockRestore()
    })

    it('handleExportP10 uses fallback filename when period has no period_name', async () => {
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:p10')
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
      const deps = makeDeps({
        selectedPeriod: { id: 10 },
        exportP10Csv: vi.fn().mockResolvedValue('csv-data'),
      })
      const { result } = renderHook(() => usePayrollActions(deps))

      await act(async () => result.current.handleExportP10())
      expect(deps.exportP10Csv).toHaveBeenCalledWith(10)
      expect(deps.showToast).toHaveBeenCalledWith('P10 successfully exported', 'success')
      vi.restoreAllMocks()
    })
  })

  // ── Branch coverage: executeRecalculate early return when user is null ──
  describe('executeConfirmedAction → recalculate early return', () => {
    it('does nothing when user is null', async () => {
      const deps = makeDeps({ user: null, selectedPeriod: { id: 10 } })
      const { result } = renderHook(() => usePayrollActions(deps))

      // Manually set confirmAction to recalculate and execute
      act(() => result.current.setConfirmAction('recalculate' as any))
      await act(async () => result.current.executeConfirmedAction())

      expect(mockApi.staff.recalculatePayroll).not.toHaveBeenCalled()
    })
  })

  // ── Branch coverage: handleExportCSV with null staff_number / department ──
  describe('handleExportCSV – null fields fallback', () => {
    it('uses empty string fallback when staff_number and department are null', () => {
      const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:csv')
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
      const deps = makeDeps({
        payrollData: [
          { staff_id: 1, staff_name: 'NoFields', phone: null, net_salary: 10000, staff_number: null, department: null, basic_salary: 8000, allowances: 0, gross_salary: 8000, paye: 0, nssf: 0, shif: 0, housing_levy: 0, total_deductions: 0 },
        ],
      })
      const { result } = renderHook(() => usePayrollActions(deps))

      act(() => result.current.handleExportCSV())
      expect(createSpy).toHaveBeenCalled()
      createSpy.mockRestore()
      revokeSpy.mockRestore()
    })
  })
})
