// @vitest-environment jsdom
/**
 * Tests for usePayrollExports hook.
 *
 * Verifies P10 CSV export, payroll ID retrieval, payslip generation,
 * and loading/error state management.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { usePayrollExports } from '../usePayrollExports'

let mockApi: {
  staff: {
    generateP10Csv: ReturnType<typeof vi.fn>
    getPayrollIdsForPeriod: ReturnType<typeof vi.fn>
    generatePayslip: ReturnType<typeof vi.fn>
  }
}

beforeEach(() => {
  mockApi = {
    staff: {
      generateP10Csv: vi.fn(),
      getPayrollIdsForPeriod: vi.fn(),
      generatePayslip: vi.fn(),
    },
  }
  ;(globalThis as Record<string, unknown>).electronAPI = mockApi
})

afterEach(() => {
  delete (globalThis as Record<string, unknown>).electronAPI
})

describe('usePayrollExports', () => {
  /* ---- exportP10Csv ---- */
  describe('exportP10Csv', () => {
    it('returns CSV data on success', async () => {
      mockApi.staff.generateP10Csv.mockResolvedValue({ success: true, data: 'csv-content' })
      const { result } = renderHook(() => usePayrollExports())

      let csv: string | null = null
      await act(async () => {
        csv = await result.current.exportP10Csv(1)
      })

      expect(csv).toBe('csv-content')
      expect(result.current.isExportingP10).toBe(false)
    })

    it('returns null and sets error on failure', async () => {
      mockApi.staff.generateP10Csv.mockResolvedValue({ success: false, error: 'No period' })
      const { result } = renderHook(() => usePayrollExports())

      let csv: string | null = null
      await act(async () => {
        csv = await result.current.exportP10Csv(999)
      })

      expect(csv).toBeNull()
      expect(result.current.error).toBe('No period')
    })

    it('uses fallback error when API returns failure without error string', async () => {
      mockApi.staff.generateP10Csv.mockResolvedValue({ success: false })
      const { result } = renderHook(() => usePayrollExports())

      await act(async () => {
        await result.current.exportP10Csv(1)
      })

      expect(result.current.error).toBe('Failed to generate P10 CSV')
    })

    it('handles thrown exception', async () => {
      mockApi.staff.generateP10Csv.mockRejectedValue(new Error('Boom'))
      const { result } = renderHook(() => usePayrollExports())

      await act(async () => {
        await result.current.exportP10Csv(1)
      })

      expect(result.current.error).toBe('Boom')
    })

    it('uses fallback message for non-Error throw', async () => {
      mockApi.staff.generateP10Csv.mockRejectedValue(42)
      const { result } = renderHook(() => usePayrollExports())

      await act(async () => {
        await result.current.exportP10Csv(1)
      })

      expect(result.current.error).toBe('An unknown error occurred')
    })
  })

  /* ---- getPayrollIds ---- */
  describe('getPayrollIds', () => {
    it('returns array of IDs', async () => {
      mockApi.staff.getPayrollIdsForPeriod.mockResolvedValue({ success: true, data: [10, 20, 30] })
      const { result } = renderHook(() => usePayrollExports())

      let ids: number[] | null = null
      await act(async () => {
        ids = await result.current.getPayrollIds(5)
      })

      expect(ids).toEqual([10, 20, 30])
    })

    it('sets error on failure', async () => {
      mockApi.staff.getPayrollIdsForPeriod.mockResolvedValue({ success: false })
      const { result } = renderHook(() => usePayrollExports())

      await act(async () => {
        await result.current.getPayrollIds(5)
      })

      expect(result.current.error).toBe('Failed to retrieve payroll IDs')
    })

    it('handles thrown Error exception', async () => {
      mockApi.staff.getPayrollIdsForPeriod.mockRejectedValue(new Error('DB timeout'))
      const { result } = renderHook(() => usePayrollExports())

      await act(async () => {
        await result.current.getPayrollIds(5)
      })

      expect(result.current.error).toBe('DB timeout')
    })

    it('uses unknown error message for non-Error exception', async () => {
      mockApi.staff.getPayrollIdsForPeriod.mockRejectedValue('string-err')
      const { result } = renderHook(() => usePayrollExports())

      await act(async () => {
        await result.current.getPayrollIds(5)
      })

      expect(result.current.error).toBe('An unknown error occurred')
    })
  })

  /* ---- generatePayslip ---- */
  describe('generatePayslip', () => {
    it('returns payslip data', async () => {
      const slip = { payslip_id: 'PS-001', net_pay: 50000 }
      mockApi.staff.generatePayslip.mockResolvedValue({ success: true, data: slip })
      const { result } = renderHook(() => usePayrollExports())

      let data: unknown
      await act(async () => {
        data = await result.current.generatePayslip(10)
      })

      expect(data).toEqual(slip)
    })

    it('returns null and sets error on failure response', async () => {
      mockApi.staff.generatePayslip.mockResolvedValue({ success: false, error: 'Record not found' })
      const { result } = renderHook(() => usePayrollExports())

      let data: unknown
      await act(async () => {
        data = await result.current.generatePayslip(10)
      })

      expect(data).toBeNull()
      expect(result.current.error).toBe('Record not found')
    })

    it('uses fallback error message when API returns no error string', async () => {
      mockApi.staff.generatePayslip.mockResolvedValue({ success: false })
      const { result } = renderHook(() => usePayrollExports())

      await act(async () => {
        await result.current.generatePayslip(99)
      })

      expect(result.current.error).toBe('Failed to generate payslip for payroll 99')
    })

    it('handles thrown Error exception', async () => {
      mockApi.staff.generatePayslip.mockRejectedValue(new Error('Crash'))
      const { result } = renderHook(() => usePayrollExports())

      await act(async () => {
        await result.current.generatePayslip(10)
      })

      expect(result.current.error).toBe('Crash')
    })

    it('uses unknown error message for non-Error exception', async () => {
      mockApi.staff.generatePayslip.mockRejectedValue(null)
      const { result } = renderHook(() => usePayrollExports())

      await act(async () => {
        await result.current.generatePayslip(10)
      })

      expect(result.current.error).toBe('An unknown error occurred')
    })
  })
})
