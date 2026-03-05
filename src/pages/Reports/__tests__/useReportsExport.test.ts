// @vitest-environment jsdom
/**
 * Tests for useReportsExport hook.
 *
 * Covers: PDF & CSV export for each active tab branch, and no-data fallback toasts.
 */
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────

const mockShowToast = vi.fn()
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

// eslint-disable-next-line unicorn/no-useless-undefined
const mockExportToPDF = vi.fn().mockResolvedValue(undefined)
const mockDownloadCSV = vi.fn()
vi.mock('../../../utils/exporters', () => ({
  exportToPDF: (...args: unknown[]) => mockExportToPDF(...args),
  downloadCSV: (...args: unknown[]) => mockDownloadCSV(...args),
}))

beforeEach(() => {
  mockShowToast.mockClear()
  mockExportToPDF.mockClear()
  mockDownloadCSV.mockClear()
})

// ── Lazy import (after mocks) ────────────────────────────────

const { useReportsExport } = await import('../useReportsExport')

// ── Data factories ───────────────────────────────────────────

function makeDefaulter(overrides = {}) {
  return {
    id: 1, admission_number: 'A001', first_name: 'Jane', last_name: 'Doe',
    stream_name: 'Grade 5', total_amount: 10000, amount_paid: 5000, balance: 5000,
    ...overrides,
  }
}

function makeData(overrides: Record<string, unknown> = {}): any {
  return {
    activeTab: 'defaulters',
    defaulters: [makeDefaulter()],
    financialSummary: { totalIncome: 100, totalExpense: 50, netBalance: 50 },
    dailyCollections: [
      { admission_number: 'A001', student_name: 'Jane', stream_name: 'G5', amount: 1000, payment_method: 'CASH' },
    ],
    dateRange: { start: '2026-01-01', end: '2026-06-30' },
    selectedDate: '2026-03-01',
    feeCollectionData: [],
    paymentMethodData: [],
    studentStats: null,
    loading: false,
    sendingBulk: false,
    navRef: { current: null },
    handleTabClick: vi.fn(),
    setDateRange: vi.fn(),
    setSelectedDate: vi.fn(),
    loadReportData: vi.fn(),
    handleSendReminder: vi.fn(),
    handleBulkReminders: vi.fn(),
    ...overrides,
  }
}

// ══════════════════════════════════════════════════════════════

describe('useReportsExport', () => {
  // ── PDF Export ─────────────────────────────────────────

  describe('handleExportPDF', () => {
    it('exports defaulters PDF when activeTab is defaulters with data', async () => {
      const data = makeData({ activeTab: 'defaulters' })
      const { result } = renderHook(() => useReportsExport(data))

      await result.current.handleExportPDF()

      expect(mockExportToPDF).toHaveBeenCalledTimes(1)
      expect(mockExportToPDF).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Fee Defaulters Report' })
      )
    })

    it('exports financial summary PDF', async () => {
      const data = makeData({ activeTab: 'financial' })
      const { result } = renderHook(() => useReportsExport(data))

      await result.current.handleExportPDF()

      expect(mockExportToPDF).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Financial Summary Report' })
      )
    })

    it('exports daily-collection PDF', async () => {
      const data = makeData({ activeTab: 'daily-collection' })
      const { result } = renderHook(() => useReportsExport(data))

      await result.current.handleExportPDF()

      expect(mockExportToPDF).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Daily Collection Report' })
      )
    })

    it('shows warning toast when no data for active tab', async () => {
      const data = makeData({ activeTab: 'students' })
      const { result } = renderHook(() => useReportsExport(data))

      await result.current.handleExportPDF()

      expect(mockExportToPDF).not.toHaveBeenCalled()
      expect(mockShowToast).toHaveBeenCalledWith('Please select a report with data to export', 'warning')
    })

    it('shows warning when defaulters tab but empty', async () => {
      const data = makeData({ activeTab: 'defaulters', defaulters: [] })
      const { result } = renderHook(() => useReportsExport(data))

      await result.current.handleExportPDF()

      expect(mockExportToPDF).not.toHaveBeenCalled()
      expect(mockShowToast).toHaveBeenCalledWith('Please select a report with data to export', 'warning')
    })

    it('shows warning when financial tab but no summary', async () => {
      const data = makeData({ activeTab: 'financial', financialSummary: null })
      const { result } = renderHook(() => useReportsExport(data))

      await result.current.handleExportPDF()

      expect(mockExportToPDF).not.toHaveBeenCalled()
    })

    it('shows warning when daily-collection tab is empty', async () => {
      const data = makeData({ activeTab: 'daily-collection', dailyCollections: [] })
      const { result } = renderHook(() => useReportsExport(data))

      await result.current.handleExportPDF()

      expect(mockExportToPDF).not.toHaveBeenCalled()
    })

    it('maps defaulter data with student_name concatenation', async () => {
      const data = makeData({ activeTab: 'defaulters' })
      const { result } = renderHook(() => useReportsExport(data))

      await result.current.handleExportPDF()

      const callArgs = mockExportToPDF.mock.calls[0][0]
      expect(callArgs.data[0].student_name).toBe('Jane Doe')
    })
  })

  // ── CSV Export ─────────────────────────────────────────

  describe('handleExportCSV', () => {
    it('downloads defaulters CSV', () => {
      const data = makeData({ activeTab: 'defaulters' })
      const { result } = renderHook(() => useReportsExport(data))

      result.current.handleExportCSV()

      expect(mockDownloadCSV).toHaveBeenCalledTimes(1)
      expect(mockDownloadCSV).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Fee Defaulters Report' })
      )
    })

    it('downloads financial summary CSV', () => {
      const data = makeData({ activeTab: 'financial' })
      const { result } = renderHook(() => useReportsExport(data))

      result.current.handleExportCSV()

      expect(mockDownloadCSV).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Financial Summary Report' })
      )
    })

    it('downloads daily-collection CSV', () => {
      const data = makeData({ activeTab: 'daily-collection' })
      const { result } = renderHook(() => useReportsExport(data))

      result.current.handleExportCSV()

      expect(mockDownloadCSV).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Daily Collection Report' })
      )
    })

    it('shows warning when no CSV data available', () => {
      const data = makeData({ activeTab: 'students' })
      const { result } = renderHook(() => useReportsExport(data))

      result.current.handleExportCSV()

      expect(mockDownloadCSV).not.toHaveBeenCalled()
      expect(mockShowToast).toHaveBeenCalledWith('Please select a report with data to export', 'warning')
    })

    it('shows warning when defaulters CSV but empty', () => {
      const data = makeData({ activeTab: 'defaulters', defaulters: [] })
      const { result } = renderHook(() => useReportsExport(data))

      result.current.handleExportCSV()

      expect(mockDownloadCSV).not.toHaveBeenCalled()
    })

    it('shows warning when financial CSV but no summary', () => {
      const data = makeData({ activeTab: 'financial', financialSummary: null })
      const { result } = renderHook(() => useReportsExport(data))

      result.current.handleExportCSV()

      expect(mockDownloadCSV).not.toHaveBeenCalled()
    })

    it('maps defaulter CSV data with student_name concatenation', () => {
      const data = makeData({ activeTab: 'defaulters' })
      const { result } = renderHook(() => useReportsExport(data))

      result.current.handleExportCSV()

      const callArgs = mockDownloadCSV.mock.calls[0][0]
      expect(callArgs.data[0].student_name).toBe('Jane Doe')
    })
  })

  // ── daily-collection student_name fallback ─────────────

  describe('daily-collection student_name fallback', () => {
    it('uses N/A for null student_name in daily-collection PDF', async () => {
      const data = makeData({
        activeTab: 'daily-collection',
        dailyCollections: [
          { admission_number: 'A001', student_name: null, stream_name: 'G5', amount: 1000, payment_method: 'CASH' },
        ],
      })
      const { result } = renderHook(() => useReportsExport(data))

      await result.current.handleExportPDF()

      const callArgs = mockExportToPDF.mock.calls[0][0]
      expect(callArgs.data[0].student_name).toBe('N/A')
    })

    it('uses N/A for empty student_name in daily-collection PDF', async () => {
      const data = makeData({
        activeTab: 'daily-collection',
        dailyCollections: [
          { admission_number: 'A001', student_name: '', stream_name: 'G5', amount: 1000, payment_method: 'CASH' },
        ],
      })
      const { result } = renderHook(() => useReportsExport(data))

      await result.current.handleExportPDF()

      const callArgs = mockExportToPDF.mock.calls[0][0]
      expect(callArgs.data[0].student_name).toBe('N/A')
    })
  })
})
