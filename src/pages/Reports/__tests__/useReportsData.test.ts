// @vitest-environment jsdom
/**
 * Tests for useReportsData hook.
 *
 * Covers: data loading, error paths, SMS handlers, tab navigation from URL, and date range state.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────

const mockShowToast = vi.fn()
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

vi.mock('../../../hooks/useScrollableTabNav', () => ({
  useScrollableTabNav: (setTab: (t: string) => void) => ({
    navRef: { current: null },
    handleTabClick: (t: string) => setTab(t),
  }),
}))

const mockLocation = { search: '', pathname: '/reports' }
vi.mock('react-router-dom', () => ({
  useLocation: () => mockLocation,
}))

let mockUser: Record<string, unknown> | null = { id: 1, username: 'admin' }

vi.mock('../../../stores', () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ user: mockUser }),
}))

vi.mock('../../../utils/format', () => ({
  formatCurrencyFromCents: (v: number) => `KSh ${(v / 100).toFixed(2)}`,
}))

vi.mock('../../../utils/ipc', () => ({
  unwrapIPCResult: <T,>(value: T) => {
    if (value && typeof value === 'object' && 'success' in (value as any) && !(value as any).success) {
      throw new Error((value as any).error || 'Failed')
    }
    return value
  },
  // eslint-disable-next-line sonarjs/function-return-type
  unwrapArrayResult: <T,>(value: T) => {
    if (value && typeof value === 'object' && 'success' in (value as any) && !(value as any).success) {
      throw new Error((value as any).error || 'Failed')
    }
    return Array.isArray(value) ? value : []
  },
}))

// ── electronAPI stub ─────────────────────────────────────────

let mockApi: Record<string, Record<string, ReturnType<typeof vi.fn>>>

function buildElectronAPI() {
  return {
    students: {
      getStudents: vi.fn().mockResolvedValue({ rows: [], totalCount: 0 }),
    },
    finance: {
      getTransactionSummary: vi.fn().mockResolvedValue({ totalIncome: 100, totalExpense: 50, netBalance: 50 }),
    },
    reports: {
      getFeeCollectionReport: vi.fn().mockResolvedValue([]),
      getDefaulters: vi.fn().mockResolvedValue([]),
      getDailyCollection: vi.fn().mockResolvedValue([]),
    },
    communications: {
      sendSMS: vi.fn(),
    },
  }
}

beforeEach(() => {
  mockApi = buildElectronAPI()
  ;(globalThis as any).electronAPI = mockApi
  mockShowToast.mockClear()
  mockLocation.search = ''
  mockUser = { id: 1, username: 'admin' }
})

afterEach(() => {
  vi.restoreAllMocks()
  delete (globalThis as any).electronAPI
})

// ── Lazy import (after mocks) ────────────────────────────────

const { useReportsData } = await import('../useReportsData')

describe('useReportsData', () => {
  // ── Loading state ──────────────────────────────────────

  describe('data loading', () => {
    it('starts with loading = true then becomes false', async () => {
      const { result } = renderHook(() => useReportsData())

      // effect runs async — wait for it to settle
      await act(async () => {})

      expect(result.current.loading).toBe(false)
    })

    it('sets studentStats with day scholars and boarders', async () => {
      mockApi.students.getStudents.mockResolvedValue({
        rows: [
          { student_type: 'DAY_SCHOLAR' },
          { student_type: 'DAY_SCHOLAR' },
          { student_type: 'BOARDER' },
        ],
        totalCount: 3,
      })

      const { result } = renderHook(() => useReportsData())
      await act(async () => {})

      expect(result.current.studentStats).toEqual({
        totalStudents: 3,
        dayScholars: 2,
        boarders: 1,
      })
    })

    it('sets financialSummary from API', async () => {
      const { result } = renderHook(() => useReportsData())
      await act(async () => {})

      expect(result.current.financialSummary).toEqual({
        totalIncome: 100,
        totalExpense: 50,
        netBalance: 50,
      })
    })

    it('processes feeCollectionData into monthly buckets', async () => {
      mockApi.reports.getFeeCollectionReport.mockResolvedValue([
        { payment_date: '2026-01-15', amount: 1000, payment_method: 'CASH' },
        { payment_date: '2026-01-20', amount: 2000, payment_method: 'MPESA' },
        { payment_date: '2026-02-10', amount: 500, payment_method: 'CASH' },
      ])

      const { result } = renderHook(() => useReportsData())
      await act(async () => {})

      expect(result.current.feeCollectionData.length).toBeGreaterThanOrEqual(1)
    })

    it('handles fee items with null payment_date gracefully', async () => {
      mockApi.reports.getFeeCollectionReport.mockResolvedValue([
        { payment_date: null, amount: 1000, payment_method: 'CASH' },
      ])

      const { result } = renderHook(() => useReportsData())
      await act(async () => {})

      expect(result.current.feeCollectionData).toEqual([])
    })

    it('handles fee items with invalid date gracefully', async () => {
      mockApi.reports.getFeeCollectionReport.mockResolvedValue([
        { payment_date: 'not-a-date', amount: 1000, payment_method: 'CASH' },
      ])

      const { result } = renderHook(() => useReportsData())
      await act(async () => {})

      expect(result.current.feeCollectionData).toEqual([])
    })

    it('computes paymentMethodData percentages', async () => {
      mockApi.reports.getFeeCollectionReport.mockResolvedValue([
        { payment_date: '2026-01-15', amount: 3000, payment_method: 'CASH' },
        { payment_date: '2026-01-16', amount: 7000, payment_method: 'MPESA' },
      ])

      const { result } = renderHook(() => useReportsData())
      await act(async () => {})

      const methodData = result.current.paymentMethodData
      expect(methodData.length).toBe(2)
      const cash = methodData.find(m => m.name === 'CASH')
      const mpesa = methodData.find(m => m.name === 'MPESA')
      expect(cash?.value).toBe(30)
      expect(mpesa?.value).toBe(70)
    })

    it('sets empty arrays when no payment data', async () => {
      mockApi.reports.getFeeCollectionReport.mockResolvedValue([])

      const { result } = renderHook(() => useReportsData())
      await act(async () => {})

      expect(result.current.feeCollectionData).toEqual([])
      expect(result.current.paymentMethodData).toEqual([])
    })
  })

  // ── Error paths ────────────────────────────────────────

  describe('error handling', () => {
    it('resets all data and shows toast on load failure', async () => {
      mockApi.students.getStudents.mockRejectedValue(new Error('DB down'))

      const { result } = renderHook(() => useReportsData())
      await act(async () => {})

      expect(result.current.studentStats).toBeNull()
      expect(result.current.financialSummary).toBeNull()
      expect(result.current.feeCollectionData).toEqual([])
      expect(result.current.defaulters).toEqual([])
      expect(mockShowToast).toHaveBeenCalledWith('DB down', 'error')
    })

    it('shows generic message for non-Error throws', async () => {
      mockApi.students.getStudents.mockRejectedValue('weird')

      const { result: _result } = renderHook(() => useReportsData())
      await act(async () => {})

      expect(mockShowToast).toHaveBeenCalledWith('Failed to load report data', 'error')
    })
  })

  // ── Tab from URL ───────────────────────────────────────

  describe('tab from URL', () => {
    it('picks up tab from location search', async () => {
      mockLocation.search = '?tab=defaulters'

      const { result } = renderHook(() => useReportsData())
      await act(async () => {})

      expect(result.current.activeTab).toBe('defaulters')
    })

    it('ignores unknown tab values', async () => {
      mockLocation.search = '?tab=unknown'

      const { result } = renderHook(() => useReportsData())
      await act(async () => {})

      expect(result.current.activeTab).toBe('fee-collection')
    })
  })

  // ── SMS: handleSendReminder ────────────────────────────

  describe('handleSendReminder', () => {
    const defaulter = {
      id: 1,
      admission_number: 'A001',
      first_name: 'Jane',
      last_name: 'Doe',
      balance: 50000,
      total_amount: 100000,
      amount_paid: 50000,
      guardian_phone: '0712345678',
    }

    it('warns if guardian_phone is missing', async () => {
      const { result } = renderHook(() => useReportsData())
      await act(async () => {})

      await act(async () => result.current.handleSendReminder({ ...defaulter, guardian_phone: undefined }))
      expect(mockShowToast).toHaveBeenCalledWith('Guardian phone number missing', 'warning')
    })

    it('sends SMS on success', async () => {
      mockApi.communications.sendSMS.mockResolvedValue({ success: true })

      const { result } = renderHook(() => useReportsData())
      await act(async () => {})

      await act(async () => result.current.handleSendReminder(defaulter))
      expect(mockApi.communications.sendSMS).toHaveBeenCalled()
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining("Jane's guardian"), 'success')
    })

    it('shows error when SMS result is unsuccessful', async () => {
      mockApi.communications.sendSMS.mockResolvedValue({ success: false, error: 'No credit' })

      const { result } = renderHook(() => useReportsData())
      await act(async () => {})

      await act(async () => result.current.handleSendReminder(defaulter))
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('No credit'), 'error')
    })

    it('handles thrown exception', async () => {
      mockApi.communications.sendSMS.mockRejectedValue(new Error('Timeout'))

      const { result } = renderHook(() => useReportsData())
      await act(async () => {})

      await act(async () => result.current.handleSendReminder(defaulter))
      expect(mockShowToast).toHaveBeenCalledWith('Timeout', 'error')
    })

    it('shows error when user is not signed in', async () => {
      mockUser = null

      const { result } = renderHook(() => useReportsData())
      await act(async () => {})

      await act(async () => result.current.handleSendReminder(defaulter))
      expect(mockShowToast).toHaveBeenCalledWith('You must be signed in to send reminders', 'error')
    })
  })

  // ── SMS: handleBulkReminders ───────────────────────────

  describe('handleBulkReminders', () => {
    beforeEach(() => {
      vi.stubGlobal('confirm', vi.fn(() => true))
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('aborts when user declines confirmation', async () => {
      vi.stubGlobal('confirm', vi.fn(() => false))

      mockApi.reports.getDefaulters.mockResolvedValue([
        { id: 1, first_name: 'A', last_name: 'B', guardian_phone: '07', balance: 100, admission_number: 'X', total_amount: 200, amount_paid: 100 },
      ])
      const { result } = renderHook(() => useReportsData())
      await act(async () => {})

      await act(async () => result.current.handleBulkReminders())
      expect(mockApi.communications.sendSMS).not.toHaveBeenCalled()
    })

    it('counts sent and failed correctly', async () => {
      mockApi.reports.getDefaulters.mockResolvedValue([
        { id: 1, first_name: 'A', last_name: 'B', guardian_phone: '07001', balance: 100, admission_number: 'X', total_amount: 200, amount_paid: 100 },
        { id: 2, first_name: 'C', last_name: 'D', guardian_phone: null, balance: 200, admission_number: 'Y', total_amount: 300, amount_paid: 100 },
      ])
      mockApi.communications.sendSMS.mockResolvedValue({ success: true })

      const { result } = renderHook(() => useReportsData())
      await act(async () => {})

      await act(async () => result.current.handleBulkReminders())
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('1 sent, 1 failed'),
        'warning'
      )
    })

    it('reports failed when SMS returns unsuccessful result', async () => {
      mockApi.reports.getDefaulters.mockResolvedValue([
        { id: 1, first_name: 'A', last_name: 'B', guardian_phone: '07001', balance: 100, admission_number: 'X', total_amount: 200, amount_paid: 100 },
        { id: 2, first_name: 'C', last_name: 'D', guardian_phone: '07002', balance: 200, admission_number: 'Y', total_amount: 300, amount_paid: 100 },
      ])
      mockApi.communications.sendSMS
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false, error: 'No credit' })

      const { result } = renderHook(() => useReportsData())
      await act(async () => {})

      await act(async () => result.current.handleBulkReminders())
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('1 sent, 1 failed'),
        'warning'
      )
    })

    it('shows error when user is not signed in for bulk', async () => {
      mockUser = null
      mockApi.reports.getDefaulters.mockResolvedValue([
        { id: 1, first_name: 'A', last_name: 'B', guardian_phone: '07001', balance: 100, admission_number: 'X', total_amount: 200, amount_paid: 100 },
      ])

      const { result } = renderHook(() => useReportsData())
      await act(async () => {})

      await act(async () => result.current.handleBulkReminders())
      expect(mockShowToast).toHaveBeenCalledWith('You must be signed in to send reminders', 'error')
    })
  })

  // ── Date range state ───────────────────────────────────

  describe('date range', () => {
    it('provides setDateRange to update range', async () => {
      const { result } = renderHook(() => useReportsData())
      await act(async () => {})

      act(() => result.current.setDateRange({ start: '2026-01-01', end: '2026-06-30' }))
      expect(result.current.dateRange).toEqual({ start: '2026-01-01', end: '2026-06-30' })
    })
  })

  // ── Additional branch coverage ─────────────────────────

  describe('branch edge cases', () => {
    it('throws when financialSummary fails isFinancialSummary check', async () => {
      mockApi.finance.getTransactionSummary.mockResolvedValue('not-an-object')

      const { result } = renderHook(() => useReportsData())
      await act(async () => {})

      expect(result.current.financialSummary).toBeNull()
      expect(mockShowToast).toHaveBeenCalledWith('Invalid financial summary payload', 'error')
    })

    it('uses "Other" for items with falsy payment_method', async () => {
      mockApi.reports.getFeeCollectionReport.mockResolvedValue([
        { payment_date: '2026-03-01', amount: 1000, payment_method: null },
        { payment_date: '2026-03-02', amount: 2000, payment_method: '' },
      ])

      const { result } = renderHook(() => useReportsData())
      await act(async () => {})

      const other = result.current.paymentMethodData.find(m => m.name === 'Other')
      expect(other).toBeDefined()
      expect(other!.value).toBe(100)
    })

    it('handleSendReminder shows "Unknown SMS error" when result.error is falsy', async () => {
      mockApi.communications.sendSMS.mockResolvedValue({ success: false })

      const { result } = renderHook(() => useReportsData())
      await act(async () => {})

      await act(async () => result.current.handleSendReminder({
        id: 1, first_name: 'A', last_name: 'B', guardian_phone: '07',
        balance: 100, admission_number: 'X', total_amount: 200, amount_paid: 100,
      }))

      expect(mockShowToast).toHaveBeenCalledWith('Failed to send: Unknown SMS error', 'error')
    })

    it('handleSendReminder handles non-Error exception', async () => {
      mockApi.communications.sendSMS.mockRejectedValue(42)

      const { result } = renderHook(() => useReportsData())
      await act(async () => {})

      await act(async () => result.current.handleSendReminder({
        id: 1, first_name: 'A', last_name: 'B', guardian_phone: '07',
        balance: 100, admission_number: 'X', total_amount: 200, amount_paid: 100,
      }))

      expect(mockShowToast).toHaveBeenCalledWith('Error sending reminder', 'error')
    })

    it('handleBulkReminders increments failedCount on SMS exception', async () => {
      vi.stubGlobal('confirm', vi.fn(() => true))

      mockApi.reports.getDefaulters.mockResolvedValue([
        { id: 1, first_name: 'A', last_name: 'B', guardian_phone: '07001', balance: 100, admission_number: 'X', total_amount: 200, amount_paid: 100 },
      ])
      mockApi.communications.sendSMS.mockRejectedValue(new Error('Network'))

      const { result } = renderHook(() => useReportsData())
      await act(async () => {})

      await act(async () => result.current.handleBulkReminders())

      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('0 sent, 1 failed'),
        'warning'
      )

      vi.unstubAllGlobals()
    })

    it('handleBulkReminders shows success when all sent', async () => {
      vi.stubGlobal('confirm', vi.fn(() => true))

      mockApi.reports.getDefaulters.mockResolvedValue([
        { id: 1, first_name: 'A', last_name: 'B', guardian_phone: '07001', balance: 100, admission_number: 'X', total_amount: 200, amount_paid: 100 },
      ])
      mockApi.communications.sendSMS.mockResolvedValue({ success: true })

      const { result } = renderHook(() => useReportsData())
      await act(async () => {})

      await act(async () => result.current.handleBulkReminders())

      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('1 sent, 0 failed'),
        'success'
      )

      vi.unstubAllGlobals()
    })

    it('picks up each valid tab parameter from URL', async () => {
      for (const tab of ['daily-collection', 'students', 'financial', 'scheduled'] as const) {
        mockLocation.search = `?tab=${tab}`
        const { result, unmount } = renderHook(() => useReportsData())
        await act(async () => {})
        expect(result.current.activeTab).toBe(tab)
        unmount()
      }
    })
  })
})
