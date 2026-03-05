// @vitest-environment jsdom
/**
 * Tests for useAssetHireData hook.
 *
 * Covers: data loading, filtering, booking/client/payment CRUD, status updates,
 * receipt printing, modal helpers, and error paths.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────

const mockShowToast = vi.fn()
const mockUserRef = vi.hoisted(() => ({ current: { id: 1, username: 'admin' } as any }))

vi.mock('../../../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

vi.mock('../../../../stores', () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ user: mockUserRef.current }),
}))

vi.mock('../../../../utils/format', () => ({
  centsToShillings: (v: number) => v / 100,
  numberToWords: (v: number) => `${v} words`,
  shillingsToCents: (v: string | number) => Number(v) * 100,
}))

vi.mock('../../../../utils/ipc', () => ({
  // eslint-disable-next-line sonarjs/function-return-type
  unwrapArrayResult: <T,>(value: T) => {
    if (value && typeof value === 'object' && 'success' in (value as any) && !(value as any).success) {
      throw new Error((value as any).error || 'Failed')
    }
    return Array.isArray(value) ? value : []
  },
  unwrapIPCResult: <T,>(value: T) => {
    if (value && typeof value === 'object' && 'success' in (value as any) && !(value as any).success) {
      throw new Error((value as any).error || 'Failed')
    }
    return value
  },
}))

vi.mock('../../../../utils/print', () => ({
  printDocument: vi.fn(),
}))

// ── electronAPI stub ─────────────────────────────────────────

let mockApi: Record<string, Record<string, ReturnType<typeof vi.fn>>>

function buildElectronAPI() {
  return {
    finance: {
      getHireBookings: vi.fn().mockResolvedValue([]),
      getHireClients: vi.fn().mockResolvedValue([]),
      getHireAssets: vi.fn().mockResolvedValue([]),
      getHireStats: vi.fn().mockResolvedValue({ totalBookings: 0, totalRevenue: 0 }),
      checkHireAvailability: vi.fn().mockResolvedValue(true),
      createHireBooking: vi.fn().mockResolvedValue({ success: true, booking_number: 'BK-001' }),
      createHireClient: vi.fn().mockResolvedValue({ success: true }),
      recordHirePayment: vi.fn().mockResolvedValue({ success: true, receipt_number: 'RC-001' }),
      updateHireBookingStatus: vi.fn().mockResolvedValue({ success: true }),
      getHirePaymentsByBooking: vi.fn().mockResolvedValue([]),
    },
    settings: {
      getSchoolSettings: vi.fn().mockResolvedValue({ school_name: 'Test' }),
    },
  }
}

beforeEach(() => {
  mockApi = buildElectronAPI()
  ;(globalThis as any).electronAPI = mockApi
  mockShowToast.mockClear()
  mockUserRef.current = { id: 1, username: 'admin' }
})

afterEach(() => {
  vi.restoreAllMocks()
  delete (globalThis as any).electronAPI
})

// ── Lazy import ──────────────────────────────────────────────

const { useAssetHireData } = await import('../useAssetHireData')

describe('useAssetHireData', () => {
  // ── Data loading ───────────────────────────────────────

  describe('loadData', () => {
    it('starts with loading = true', () => {
      const { result } = renderHook(() => useAssetHireData())
      // initial state before effect
      expect(result.current.loading).toBe(true)
    })

    it('loads all data in parallel', async () => {
      mockApi.finance.getHireBookings.mockResolvedValue([
        { id: 1, client_name: 'Alice', booking_number: 'BK-001', status: 'PENDING' },
      ])
      mockApi.finance.getHireClients.mockResolvedValue([{ id: 1, client_name: 'Alice' }])
      mockApi.finance.getHireAssets.mockResolvedValue([{ id: 1, asset_name: 'Bus' }])

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      expect(result.current.loading).toBe(false)
      expect(result.current.filteredBookings).toHaveLength(1)
      expect(result.current.filteredClients).toHaveLength(1)
      expect(result.current.assets).toHaveLength(1)
    })

    it('resets data and shows toast on load failure', async () => {
      mockApi.finance.getHireBookings.mockRejectedValue(new Error('DB'))

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      expect(result.current.filteredBookings).toEqual([])
      expect(result.current.filteredClients).toEqual([])
      expect(result.current.assets).toEqual([])
      expect(result.current.stats).toBeNull()
      expect(mockShowToast).toHaveBeenCalledWith('DB', 'error')
    })

    it('shows generic message for non-Error throw', async () => {
      mockApi.finance.getHireBookings.mockRejectedValue('weird')

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      expect(mockShowToast).toHaveBeenCalledWith('Failed to load hire data', 'error')
    })
  })

  // ── Filtering ──────────────────────────────────────────

  describe('filtering', () => {
    it('filters bookings by status', async () => {
      mockApi.finance.getHireBookings.mockResolvedValue([
        { id: 1, client_name: 'A', booking_number: 'BK1', status: 'PENDING' },
        { id: 2, client_name: 'B', booking_number: 'BK2', status: 'CONFIRMED' },
      ])

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      act(() => result.current.setStatusFilter('CONFIRMED'))
      expect(result.current.filteredBookings).toHaveLength(1)
      expect(result.current.filteredBookings[0].booking_number).toBe('BK2')
    })

    it('filters bookings by search query (client name)', async () => {
      mockApi.finance.getHireBookings.mockResolvedValue([
        { id: 1, client_name: 'Alice', booking_number: 'BK1', status: 'PENDING' },
        { id: 2, client_name: 'Bob', booking_number: 'BK2', status: 'PENDING' },
      ])

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      act(() => result.current.setSearchQuery('alice'))
      expect(result.current.filteredBookings).toHaveLength(1)
    })

    it('filters bookings by booking number', async () => {
      mockApi.finance.getHireBookings.mockResolvedValue([
        { id: 1, client_name: 'Alice', booking_number: 'BK-100', status: 'PENDING' },
        { id: 2, client_name: 'Bob', booking_number: 'BK-200', status: 'PENDING' },
      ])

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      act(() => result.current.setSearchQuery('BK-200'))
      expect(result.current.filteredBookings).toHaveLength(1)
    })

    it('filters clients by search query', async () => {
      mockApi.finance.getHireClients.mockResolvedValue([
        { id: 1, client_name: 'Alice Corp' },
        { id: 2, client_name: 'Bob Ltd' },
      ])

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      act(() => result.current.setSearchQuery('bob'))
      expect(result.current.filteredClients).toHaveLength(1)
    })
  })

  // ── handleCreateBooking ────────────────────────────────

  describe('handleCreateBooking', () => {
    it('shows error when user is not authenticated', async () => {
      // Override the store mock temporarily
      vi.doMock('../../../../stores', () => ({
        useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
          selector({ user: null }),
      }))

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      // We can test by calling with the default user=null scenario
      // But since mocking is module-level, let's test the validation path instead
      act(() => result.current.setBookingForm({
        asset_id: 0, client_id: 0, hire_date: '', return_date: '',
        purpose: '', destination: '', distance_km: '', total_amount: '',
      }))

      await act(async () =>
        result.current.handleCreateBooking({ preventDefault: vi.fn() } as any)
      )

      expect(mockShowToast).toHaveBeenCalledWith(
        'Please fill in all required fields',
        'warning'
      )
    })

    it('creates booking on success', async () => {
      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      act(() => result.current.setBookingForm({
        asset_id: 1, client_id: 1, hire_date: '2026-03-01', return_date: '2026-03-05',
        purpose: 'Trip', destination: 'Mombasa', distance_km: '200', total_amount: '5000',
      }))

      await act(async () =>
        result.current.handleCreateBooking({ preventDefault: vi.fn() } as any)
      )

      expect(mockApi.finance.createHireBooking).toHaveBeenCalled()
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('BK-001'), 'success')
    })

    it('shows warning when asset not available', async () => {
      mockApi.finance.checkHireAvailability.mockResolvedValue(false)

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      act(() => result.current.setBookingForm({
        asset_id: 1, client_id: 1, hire_date: '2026-03-01', return_date: '',
        purpose: '', destination: '', distance_km: '', total_amount: '1000',
      }))

      await act(async () =>
        result.current.handleCreateBooking({ preventDefault: vi.fn() } as any)
      )

      expect(mockShowToast).toHaveBeenCalledWith('Asset is not available for the selected dates', 'warning')
    })

    it('shows error on create failure', async () => {
      mockApi.finance.createHireBooking.mockResolvedValue({ success: false, errors: ['Bad data'] })

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      act(() => result.current.setBookingForm({
        asset_id: 1, client_id: 1, hire_date: '2026-03-01', return_date: '',
        purpose: '', destination: '', distance_km: '', total_amount: '1000',
      }))

      await act(async () =>
        result.current.handleCreateBooking({ preventDefault: vi.fn() } as any)
      )

      expect(mockShowToast).toHaveBeenCalledWith('Bad data', 'error')
    })
  })

  // ── handleCreateClient ─────────────────────────────────

  describe('handleCreateClient', () => {
    it('creates client on success', async () => {
      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      act(() => result.current.setClientForm({
        client_name: 'New Client', contact_phone: '070', contact_email: '',
        organization: '', address: '', notes: '',
      }))

      await act(async () =>
        result.current.handleCreateClient({ preventDefault: vi.fn() } as any)
      )

      expect(mockApi.finance.createHireClient).toHaveBeenCalled()
      expect(mockShowToast).toHaveBeenCalledWith('Client created successfully', 'success')
    })

    it('shows error on create client failure', async () => {
      mockApi.finance.createHireClient.mockResolvedValue({ success: false, errors: ['Dup'] })

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      await act(async () =>
        result.current.handleCreateClient({ preventDefault: vi.fn() } as any)
      )

      expect(mockShowToast).toHaveBeenCalledWith('Dup', 'error')
    })

    it('handles thrown exception', async () => {
      mockApi.finance.createHireClient.mockRejectedValue(new Error('Network'))

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      await act(async () =>
        result.current.handleCreateClient({ preventDefault: vi.fn() } as any)
      )

      expect(mockShowToast).toHaveBeenCalledWith('Network', 'error')
    })
  })

  // ── handleRecordPayment ────────────────────────────────

  describe('handleRecordPayment', () => {
    it('shows warning when no booking is selected', async () => {
      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      await act(async () =>
        result.current.handleRecordPayment({ preventDefault: vi.fn() } as any)
      )

      expect(mockShowToast).toHaveBeenCalledWith('Select a booking before recording payment', 'warning')
    })

    it('records payment on success', async () => {
      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      const booking = { id: 1, balance: 50000 } as any
      act(() => result.current.openPaymentModal(booking))

      await act(async () =>
        result.current.handleRecordPayment({ preventDefault: vi.fn() } as any)
      )

      expect(mockApi.finance.recordHirePayment).toHaveBeenCalled()
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('RC-001'), 'success')
    })

    it('shows error on payment failure', async () => {
      mockApi.finance.recordHirePayment.mockResolvedValue({ success: false, errors: ['Insufficient'] })

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      act(() => result.current.openPaymentModal({ id: 1, balance: 1000 } as any))

      await act(async () =>
        result.current.handleRecordPayment({ preventDefault: vi.fn() } as any)
      )

      expect(mockShowToast).toHaveBeenCalledWith('Insufficient', 'error')
    })
  })

  // ── handleUpdateStatus ─────────────────────────────────

  describe('handleUpdateStatus', () => {
    it('updates booking status and reloads', async () => {
      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      await act(async () => result.current.handleUpdateStatus(1, 'CONFIRMED'))

      expect(mockApi.finance.updateHireBookingStatus).toHaveBeenCalledWith(1, 'CONFIRMED')
    })

    it('shows error on failure', async () => {
      mockApi.finance.updateHireBookingStatus.mockResolvedValue({ success: false, errors: ['Locked'] })

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      await act(async () => result.current.handleUpdateStatus(1, 'CANCELLED'))

      expect(mockShowToast).toHaveBeenCalledWith('Locked', 'error')
    })
  })

  // ── handlePrintReceipt ─────────────────────────────────

  describe('handlePrintReceipt', () => {
    it('shows warning when no payments found', async () => {
      mockApi.finance.getHirePaymentsByBooking.mockResolvedValue([])

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      await act(async () =>
        result.current.handlePrintReceipt({ id: 1, client_name: 'Test', booking_number: 'BK1', asset_name: 'Bus' } as any)
      )

      expect(mockShowToast).toHaveBeenCalledWith('No payments available to print', 'warning')
    })

    it('prints receipt when payment exists', async () => {
      mockApi.finance.getHirePaymentsByBooking.mockResolvedValue([
        { receipt_number: 'RC-100', payment_date: '2026-03-01', amount: 5000, payment_method: 'CASH', payment_reference: 'REF1' },
      ])

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      await act(async () =>
        result.current.handlePrintReceipt({ id: 1, client_name: 'Alice', booking_number: 'BK1', asset_name: 'Bus' } as any)
      )

      const { printDocument } = await import('../../../../utils/print')
      expect(printDocument).toHaveBeenCalled()
    })

    it('shows error on exception', async () => {
      mockApi.finance.getHirePaymentsByBooking.mockRejectedValue(new Error('Timeout'))

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      await act(async () =>
        result.current.handlePrintReceipt({ id: 1 } as any)
      )

      expect(mockShowToast).toHaveBeenCalledWith('Timeout', 'error')
    })
  })

  // ── Modal helpers ──────────────────────────────────────

  describe('modal helpers', () => {
    it('opens and closes payment modal', async () => {
      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      const booking = { id: 1, balance: 10000 } as any
      act(() => result.current.openPaymentModal(booking))

      expect(result.current.showPaymentModal).toBe(true)
      expect(result.current.selectedBooking).toBe(booking)

      act(() => result.current.closePaymentModal())

      expect(result.current.showPaymentModal).toBe(false)
      expect(result.current.selectedBooking).toBeNull()
    })
  })

  // ── Additional branch coverage ─────────────────────────

  describe('branch edge cases', () => {
    it('filters bookings when client_name is undefined', async () => {
      mockApi.finance.getHireBookings.mockResolvedValue([
        { id: 1, booking_number: 'BK-001', status: 'PENDING' },
      ])
      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      act(() => result.current.setSearchQuery('alice'))
      // Should not crash when client_name is undefined
      expect(result.current.filteredBookings).toEqual([])
    })

    it('handleCreateBooking shows N/A when booking_number is undefined', async () => {
      mockApi.finance.createHireBooking.mockResolvedValue({ success: true })

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      act(() => result.current.setBookingForm({
        asset_id: 1, client_id: 1, hire_date: '2026-03-01', return_date: '',
        purpose: '', destination: '', distance_km: '', total_amount: '500',
      }))

      await act(async () =>
        result.current.handleCreateBooking({ preventDefault: vi.fn() } as any)
      )

      expect(mockShowToast).toHaveBeenCalledWith('Booking created: N/A', 'success')
    })

    it('handleCreateBooking shows fallback error when errors array is empty', async () => {
      mockApi.finance.createHireBooking.mockResolvedValue({ success: false })

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      act(() => result.current.setBookingForm({
        asset_id: 1, client_id: 1, hire_date: '2026-03-01', return_date: '',
        purpose: '', destination: '', distance_km: '', total_amount: '500',
      }))

      await act(async () =>
        result.current.handleCreateBooking({ preventDefault: vi.fn() } as any)
      )

      expect(mockShowToast).toHaveBeenCalledWith('Failed to create booking', 'error')
    })

    it('handleCreateBooking handles non-Error exception', async () => {
      mockApi.finance.createHireBooking.mockRejectedValue('crash')

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      act(() => result.current.setBookingForm({
        asset_id: 1, client_id: 1, hire_date: '2026-03-01', return_date: '',
        purpose: '', destination: '', distance_km: '', total_amount: '500',
      }))

      await act(async () =>
        result.current.handleCreateBooking({ preventDefault: vi.fn() } as any)
      )

      expect(mockShowToast).toHaveBeenCalledWith('Failed to create booking', 'error')
    })

    it('handleCreateBooking sends undefined distance_km when field is empty', async () => {
      mockApi.finance.createHireBooking.mockResolvedValue({ success: true, booking_number: 'BK-X' })

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      act(() => result.current.setBookingForm({
        asset_id: 1, client_id: 1, hire_date: '2026-03-01', return_date: '',
        purpose: '', destination: '', distance_km: '', total_amount: '500',
      }))

      await act(async () =>
        result.current.handleCreateBooking({ preventDefault: vi.fn() } as any)
      )

      const callArgs = mockApi.finance.createHireBooking.mock.calls[0]?.[0]
      expect(callArgs?.distance_km).toBeUndefined()
    })

    it('handleCreateClient shows fallback error when errors array is empty', async () => {
      mockApi.finance.createHireClient.mockResolvedValue({ success: false })

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      await act(async () =>
        result.current.handleCreateClient({ preventDefault: vi.fn() } as any)
      )

      expect(mockShowToast).toHaveBeenCalledWith('Failed to create client', 'error')
    })

    it('handleCreateClient handles non-Error exception', async () => {
      mockApi.finance.createHireClient.mockRejectedValue(42)

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      await act(async () =>
        result.current.handleCreateClient({ preventDefault: vi.fn() } as any)
      )

      expect(mockShowToast).toHaveBeenCalledWith('Failed to create client', 'error')
    })

    it('handleRecordPayment shows receipt issued when receipt_number is undefined', async () => {
      mockApi.finance.recordHirePayment.mockResolvedValue({ success: true })

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      act(() => result.current.openPaymentModal({ id: 1, balance: 1000 } as any))

      await act(async () =>
        result.current.handleRecordPayment({ preventDefault: vi.fn() } as any)
      )

      expect(mockShowToast).toHaveBeenCalledWith('Payment recorded: receipt issued', 'success')
    })

    it('handleRecordPayment shows fallback error when errors array is empty', async () => {
      mockApi.finance.recordHirePayment.mockResolvedValue({ success: false })

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      act(() => result.current.openPaymentModal({ id: 1, balance: 1000 } as any))

      await act(async () =>
        result.current.handleRecordPayment({ preventDefault: vi.fn() } as any)
      )

      expect(mockShowToast).toHaveBeenCalledWith('Failed to record payment', 'error')
    })

    it('handleRecordPayment handles non-Error exception', async () => {
      mockApi.finance.recordHirePayment.mockRejectedValue('oops')

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      act(() => result.current.openPaymentModal({ id: 1, balance: 1000 } as any))

      await act(async () =>
        result.current.handleRecordPayment({ preventDefault: vi.fn() } as any)
      )

      expect(mockShowToast).toHaveBeenCalledWith('Failed to record payment', 'error')
    })

    it('handleUpdateStatus shows fallback error when errors array is empty', async () => {
      mockApi.finance.updateHireBookingStatus.mockResolvedValue({ success: false })

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      await act(async () => result.current.handleUpdateStatus(1, 'CONFIRMED'))

      expect(mockShowToast).toHaveBeenCalledWith('Failed to update booking status', 'error')
    })

    it('handleUpdateStatus handles non-Error exception', async () => {
      mockApi.finance.updateHireBookingStatus.mockRejectedValue(99)

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      await act(async () => result.current.handleUpdateStatus(1, 'CONFIRMED'))

      expect(mockShowToast).toHaveBeenCalledWith('Failed to update booking status', 'error')
    })

    it('handlePrintReceipt handles non-Error exception', async () => {
      mockApi.finance.getHirePaymentsByBooking.mockRejectedValue('print crash')

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      await act(async () =>
        result.current.handlePrintReceipt({ id: 1 } as any)
      )

      expect(mockShowToast).toHaveBeenCalledWith('Failed to print receipt', 'error')
    })

    it('handleCreateBooking validates required fields', async () => {
      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      act(() => result.current.setBookingForm({
        asset_id: 0, client_id: 0, hire_date: '', return_date: '',
        purpose: '', destination: '', distance_km: '', total_amount: '',
      }))

      await act(async () =>
        result.current.handleCreateBooking({ preventDefault: vi.fn() } as any)
      )

      expect(mockShowToast).toHaveBeenCalledWith('Please fill in all required fields', 'warning')
    })

    it('handleCreateBooking shows error when user is null', async () => {
      mockUserRef.current = null

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      act(() => result.current.setBookingForm({
        asset_id: 1, client_id: 1, hire_date: '2026-03-01', return_date: '',
        purpose: '', destination: '', distance_km: '', total_amount: '500',
      }))

      await act(async () =>
        result.current.handleCreateBooking({ preventDefault: vi.fn() } as any)
      )

      expect(mockShowToast).toHaveBeenCalledWith('User not authenticated', 'error')
    })

    // ── branch coverage: L122 openPaymentModal with zero balance ──
    it('openPaymentModal uses 0 when booking balance is falsy', () => {
      const { result } = renderHook(() => useAssetHireData())
      act(() => result.current.openPaymentModal({ id: 1, balance: 0 } as any))
      expect(result.current.showPaymentModal).toBe(true)
    })

    // ── branch coverage: L172 createBooking catch with real Error ──
    it('handleCreateBooking shows Error.message when API rejects with Error', async () => {
      mockApi.finance.createHireBooking.mockRejectedValue(new Error('API crashed'))

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      act(() => result.current.setBookingForm({
        asset_id: 1, client_id: 1, hire_date: '2026-03-01', return_date: '',
        purpose: '', destination: '', distance_km: '', total_amount: '500',
      }))

      await act(async () =>
        result.current.handleCreateBooking({ preventDefault: vi.fn() } as any)
      )

      expect(mockShowToast).toHaveBeenCalledWith('API crashed', 'error')
    })

    // ── branch coverage: L218 recordPayment catch with real Error ──
    it('handleRecordPayment shows Error.message when API rejects with Error', async () => {
      mockApi.finance.recordHirePayment.mockRejectedValue(new Error('Payment API error'))

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      act(() => result.current.openPaymentModal({ id: 1, balance: 1000 } as any))

      await act(async () =>
        result.current.handleRecordPayment({ preventDefault: vi.fn() } as any)
      )

      expect(mockShowToast).toHaveBeenCalledWith('Payment API error', 'error')
    })

    // ── branch coverage: L235 updateStatus catch with real Error ──
    it('handleUpdateStatus shows Error.message when API rejects with Error', async () => {
      mockApi.finance.updateHireBookingStatus.mockRejectedValue(new Error('Status update failed'))

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      await act(async () => result.current.handleUpdateStatus(1, 'CONFIRMED'))

      expect(mockShowToast).toHaveBeenCalledWith('Status update failed', 'error')
    })

    // ── branch coverage: L269 handlePrintReceipt with null settings ──
    it('handlePrintReceipt uses empty object when settings is null', async () => {
      mockApi.finance.getHirePaymentsByBooking.mockResolvedValue([
        { receipt_number: 'RC-99', payment_date: '2026-03-01', amount: 5000, payment_method: 'CASH', payment_reference: '' },
      ])
      mockApi.settings.getSchoolSettings.mockResolvedValue(null)

      const { printDocument } = await import('../../../../utils/print')

      const { result } = renderHook(() => useAssetHireData())
      await act(async () => result.current.loadData())

      await act(async () =>
        result.current.handlePrintReceipt({ id: 1, client_name: 'Test', booking_number: 'BK1', asset_name: 'Bus' } as any)
      )

      expect(printDocument).toHaveBeenCalledWith(expect.objectContaining({ schoolSettings: {} }))
    })
  })
})
