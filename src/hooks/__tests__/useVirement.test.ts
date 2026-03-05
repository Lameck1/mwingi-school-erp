// @vitest-environment jsdom
/**
 * Tests for useVirement hook.
 *
 * Verifies JSS account virement operations: validation, request,
 * review, pending list, account summaries, and loading/error state.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { useVirement } from '../useVirement'

let mockApi: {
  finance: {
    validateExpenditure: ReturnType<typeof vi.fn>
    requestVirement: ReturnType<typeof vi.fn>
    reviewVirement: ReturnType<typeof vi.fn>
    getPendingRequests: ReturnType<typeof vi.fn>
    getAccountSummaries: ReturnType<typeof vi.fn>
  }
}

beforeEach(() => {
  mockApi = {
    finance: {
      validateExpenditure: vi.fn(),
      requestVirement: vi.fn(),
      reviewVirement: vi.fn(),
      getPendingRequests: vi.fn(),
      getAccountSummaries: vi.fn(),
    },
  }
  ;(globalThis as Record<string, unknown>).electronAPI = mockApi
})

afterEach(() => {
  delete (globalThis as Record<string, unknown>).electronAPI
})

describe('useVirement', () => {
  it('starts with isLoading=false and error=null', () => {
    const { result } = renderHook(() => useVirement())
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  /* ---- validateExpenditure ---- */
  describe('validateExpenditure', () => {
    it('returns validation result on success', async () => {
      const validResult = { allowed: true, from_account: 'TUITION', to_account: 'OPERATIONS' }
      mockApi.finance.validateExpenditure.mockResolvedValue({ success: true, data: validResult })
      const { result } = renderHook(() => useVirement())

      let data: unknown
      await act(async () => {
        data = await result.current.validateExpenditure('OPERATIONS', 1)
      })

      expect(data).toEqual(validResult)
    })

    it('sets error on failure', async () => {
      mockApi.finance.validateExpenditure.mockResolvedValue({ success: false, error: 'Not allowed' })
      const { result } = renderHook(() => useVirement())

      await act(async () => {
        await result.current.validateExpenditure('TUITION', 1)
      })

      expect(result.current.error).toBe('Not allowed')
    })
  })

  /* ---- requestVirement ---- */
  describe('requestVirement', () => {
    it('returns request id on success', async () => {
      mockApi.finance.requestVirement.mockResolvedValue({ success: true, id: 42 })
      const { result } = renderHook(() => useVirement())

      let id: unknown
      await act(async () => {
        id = await result.current.requestVirement('TUITION', 'OPERATIONS', 10000, 'Emergency')
      })

      expect(id).toBe(42)
    })
  })

  /* ---- reviewVirement ---- */
  describe('reviewVirement', () => {
    it('returns true on approval', async () => {
      mockApi.finance.reviewVirement.mockResolvedValue({ success: true, data: true })
      const { result } = renderHook(() => useVirement())

      let ok: unknown
      await act(async () => {
        ok = await result.current.reviewVirement(1, 'APPROVED', 'Approved by finance')
      })

      expect(ok).toBe(true)
    })
  })

  /* ---- getPendingRequests ---- */
  describe('getPendingRequests', () => {
    it('returns list of pending requests', async () => {
      const reqs = [{ id: 1, status: 'PENDING', amount: 5000 }]
      mockApi.finance.getPendingRequests.mockResolvedValue({ success: true, data: reqs })
      const { result } = renderHook(() => useVirement())

      let data: unknown
      await act(async () => {
        data = await result.current.getPendingRequests()
      })

      expect(data).toEqual(reqs)
    })
  })

  /* ---- getAccountSummaries ---- */
  describe('getAccountSummaries', () => {
    it('returns summaries', async () => {
      const summaries = [{ account_type: 'TUITION', balance: 100000 }]
      mockApi.finance.getAccountSummaries.mockResolvedValue({ success: true, data: summaries })
      const { result } = renderHook(() => useVirement())

      let data: unknown
      await act(async () => {
        data = await result.current.getAccountSummaries()
      })

      expect(data).toEqual(summaries)
    })
  })

  /* ---- error handling ---- */
  describe('error handling', () => {
    it('catches thrown Error objects', async () => {
      mockApi.finance.validateExpenditure.mockRejectedValue(new Error('Crash'))
      const { result } = renderHook(() => useVirement())

      await act(async () => {
        await result.current.validateExpenditure('TUITION', 1)
      })

      expect(result.current.error).toBe('Crash')
    })

    it('falls back to generic message for non-Error throws', async () => {
      mockApi.finance.validateExpenditure.mockRejectedValue(null)
      const { result } = renderHook(() => useVirement())

      await act(async () => {
        await result.current.validateExpenditure('TUITION', 1)
      })

      expect(result.current.error).toBe('An error occurred')
    })

    it('returns true when success has no data and no id', async () => {
      mockApi.finance.validateExpenditure.mockResolvedValue({ success: true })
      const { result } = renderHook(() => useVirement())

      let data: unknown
      await act(async () => {
        data = await result.current.validateExpenditure('OPERATIONS', 1)
      })

      expect(data).toBe(true)
    })

    it('falls back to "Operation failed" when error is empty', async () => {
      mockApi.finance.validateExpenditure.mockResolvedValue({ success: false, error: '' })
      const { result } = renderHook(() => useVirement())

      await act(async () => {
        await result.current.validateExpenditure('TUITION', 1)
      })

      expect(result.current.error).toBe('Operation failed')
    })
  })
})
