// @vitest-environment jsdom
/**
 * Tests for useFinancialKPIs hook.
 *
 * Mocks globalThis.electronAPI (and window.electronAPI) to verify
 * loading/error state management and data return.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { useFinancialKPIs } from '../useFinancialKPIs'

const mockDashboard = {
  generated_at: '2025-01-01T00:00:00Z',
  metrics: [{ name: 'revenue', value: 100000, label: 'Revenue', unit: 'KES' }],
}

const mockNetAssets = {
  report_date: '2025-01-01',
  period_start: '2024-01-01',
  period_end: '2024-12-31',
  opening_net_assets: 500000,
  surplus_deficit: 50000,
  asset_changes: [],
  liability_changes: [],
  closing_net_assets: 550000,
}

let mockApi: {
  reports: {
    getKpiDashboard: ReturnType<typeof vi.fn>
    getChangesInNetAssets: ReturnType<typeof vi.fn>
  }
}

beforeEach(() => {
  mockApi = {
    reports: {
      getKpiDashboard: vi.fn(),
      getChangesInNetAssets: vi.fn(),
    },
  }
  ;(globalThis as unknown as Record<string, unknown>).electronAPI = mockApi
})

afterEach(() => {
  delete (globalThis as unknown as Record<string, unknown>).electronAPI
})

describe('useFinancialKPIs', () => {
  /* ---- fetchKpiDashboard ---- */
  describe('fetchKpiDashboard', () => {
    it('returns data on success', async () => {
      mockApi.reports.getKpiDashboard.mockResolvedValue({ success: true, data: mockDashboard })
      const { result } = renderHook(() => useFinancialKPIs())

      let data: unknown
      await act(async () => {
        data = await result.current.fetchKpiDashboard()
      })

      expect(data).toEqual(mockDashboard)
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBeNull()
    })

    it('sets error on API failure response', async () => {
      mockApi.reports.getKpiDashboard.mockResolvedValue({ success: false, error: 'No data' })
      const { result } = renderHook(() => useFinancialKPIs())

      let data: unknown
      await act(async () => {
        data = await result.current.fetchKpiDashboard()
      })

      expect(data).toBeNull()
      expect(result.current.error).toBe('No data')
    })

    it('uses fallback error when API returns failure without error string', async () => {
      mockApi.reports.getKpiDashboard.mockResolvedValue({ success: false })
      const { result } = renderHook(() => useFinancialKPIs())

      await act(async () => {
        await result.current.fetchKpiDashboard()
      })

      expect(result.current.error).toBe('Failed to fetch KPIs')
    })

    it('sets error on thrown exception', async () => {
      mockApi.reports.getKpiDashboard.mockRejectedValue(new Error('Network'))
      const { result } = renderHook(() => useFinancialKPIs())

      await act(async () => {
        await result.current.fetchKpiDashboard()
      })

      expect(result.current.error).toBe('Network')
    })

    it('sets fallback error for non-Error throw', async () => {
      mockApi.reports.getKpiDashboard.mockRejectedValue('string-error')
      const { result } = renderHook(() => useFinancialKPIs())

      await act(async () => {
        await result.current.fetchKpiDashboard()
      })

      expect(result.current.error).toBe('Failed to fetch KPIs')
    })

    it('manages isLoading state', async () => {
      let resolvePromise!: (v: unknown) => void
      mockApi.reports.getKpiDashboard.mockReturnValue(
        new Promise(resolve => { resolvePromise = resolve }),
      )
      const { result } = renderHook(() => useFinancialKPIs())

      const promise = act(async () => {
        result.current.fetchKpiDashboard()
      })

      // While pending, isLoading should be true (checked inside act)
      await act(async () => {
        resolvePromise({ success: true, data: mockDashboard })
      })
      await promise

      expect(result.current.isLoading).toBe(false)
    })
  })

  /* ---- fetchChangesInNetAssets ---- */
  describe('fetchChangesInNetAssets', () => {
    it('returns report data on success', async () => {
      mockApi.reports.getChangesInNetAssets.mockResolvedValue({ success: true, data: mockNetAssets })
      const { result } = renderHook(() => useFinancialKPIs())

      let data: unknown
      await act(async () => {
        data = await result.current.fetchChangesInNetAssets('2024-01-01', '2024-12-31')
      })

      expect(data).toEqual(mockNetAssets)
      expect(mockApi.reports.getChangesInNetAssets).toHaveBeenCalledWith('2024-01-01', '2024-12-31')
    })

    it('sets error on failure', async () => {
      mockApi.reports.getChangesInNetAssets.mockResolvedValue({ success: false })
      const { result } = renderHook(() => useFinancialKPIs())

      await act(async () => {
        await result.current.fetchChangesInNetAssets('2024-01-01', '2024-12-31')
      })

      expect(result.current.error).toBe('Failed to fetch Changes in Net Assets')
    })

    it('sets error on thrown Error exception', async () => {
      mockApi.reports.getChangesInNetAssets.mockRejectedValue(new Error('Timeout'))
      const { result } = renderHook(() => useFinancialKPIs())

      await act(async () => {
        await result.current.fetchChangesInNetAssets('2024-01-01', '2024-12-31')
      })

      expect(result.current.error).toBe('Timeout')
      expect(result.current.isLoading).toBe(false)
    })

    it('sets fallback error for non-Error thrown exception', async () => {
      mockApi.reports.getChangesInNetAssets.mockRejectedValue(42)
      const { result } = renderHook(() => useFinancialKPIs())

      await act(async () => {
        await result.current.fetchChangesInNetAssets('2024-01-01', '2024-12-31')
      })

      expect(result.current.error).toBe('Failed to fetch Changes in Net Assets')
    })
  })
})
