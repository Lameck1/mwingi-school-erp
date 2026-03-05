// @vitest-environment jsdom
/**
 * Tests for useFeePolicies hook.
 *
 * Verifies installment policy CRUD, schedule retrieval, vote head balances,
 * and the generic executeCall loading/error pattern.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { useFeePolicies } from '../useFeePolicies'

let mockApi: {
  finance: {
    createInstallmentPolicy: ReturnType<typeof vi.fn>
    getPoliciesForTerm: ReturnType<typeof vi.fn>
    getInstallmentSchedule: ReturnType<typeof vi.fn>
    deactivatePolicy: ReturnType<typeof vi.fn>
    getVoteHeadBalances: ReturnType<typeof vi.fn>
  }
}

beforeEach(() => {
  mockApi = {
    finance: {
      createInstallmentPolicy: vi.fn(),
      getPoliciesForTerm: vi.fn(),
      getInstallmentSchedule: vi.fn(),
      deactivatePolicy: vi.fn(),
      getVoteHeadBalances: vi.fn(),
    },
  }
  ;(globalThis as Record<string, unknown>).electronAPI = mockApi
})

afterEach(() => {
  delete (globalThis as Record<string, unknown>).electronAPI
})

describe('useFeePolicies', () => {
  it('starts with isLoading=false and error=null', () => {
    const { result } = renderHook(() => useFeePolicies())
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  /* ---- createInstallmentPolicy ---- */
  describe('createInstallmentPolicy', () => {
    it('returns created id on success', async () => {
      mockApi.finance.createInstallmentPolicy.mockResolvedValue({ success: true, id: 7 })
      const { result } = renderHook(() => useFeePolicies())

      let id: unknown
      await act(async () => {
        id = await result.current.createInstallmentPolicy({
          policy_name: 'Term 1',
          academic_year_id: 1,
          student_type: 'ALL',
          schedules: [{ installment_number: 1, percentage: 100, due_date: '2025-01-15' }],
        })
      })

      expect(id).toBe(7)
      expect(result.current.isLoading).toBe(false)
    })

    it('sets error on failure', async () => {
      mockApi.finance.createInstallmentPolicy.mockResolvedValue({
        success: false, error: 'Duplicate policy',
      })
      const { result } = renderHook(() => useFeePolicies())

      let id: unknown
      await act(async () => {
        id = await result.current.createInstallmentPolicy({
          policy_name: 'Term 1',
          academic_year_id: 1,
          student_type: 'ALL',
          schedules: [],
        })
      })

      expect(id).toBeNull()
      expect(result.current.error).toBe('Duplicate policy')
    })
  })

  /* ---- getPoliciesForTerm ---- */
  describe('getPoliciesForTerm', () => {
    it('returns policies array', async () => {
      const policies = [{ id: 1, policy_name: 'T1' }]
      mockApi.finance.getPoliciesForTerm.mockResolvedValue({ success: true, data: policies })
      const { result } = renderHook(() => useFeePolicies())

      let data: unknown
      await act(async () => {
        data = await result.current.getPoliciesForTerm(1)
      })

      expect(data).toEqual(policies)
    })
  })

  /* ---- getInstallmentSchedule ---- */
  describe('getInstallmentSchedule', () => {
    it('returns schedules', async () => {
      const schedules = [{ installment_number: 1, percentage: 50, due_date: '2025-01-15' }]
      mockApi.finance.getInstallmentSchedule.mockResolvedValue({ success: true, data: schedules })
      const { result } = renderHook(() => useFeePolicies())

      let data: unknown
      await act(async () => {
        data = await result.current.getInstallmentSchedule(1)
      })

      expect(data).toEqual(schedules)
    })
  })

  /* ---- deactivatePolicy ---- */
  describe('deactivatePolicy', () => {
    it('returns true on success', async () => {
      mockApi.finance.deactivatePolicy.mockResolvedValue({ success: true })
      const { result } = renderHook(() => useFeePolicies())

      let ok: unknown
      await act(async () => {
        ok = await result.current.deactivatePolicy(1)
      })

      // executeCall: (res.data ?? res.id ?? true) — no data/id → true
      expect(ok).toBe(true)
    })
  })

  /* ---- getVoteHeadBalances ---- */
  describe('getVoteHeadBalances', () => {
    it('returns balances', async () => {
      const balances = [{ fee_category_id: 1, category_name: 'Tuition', outstanding: 5000 }]
      mockApi.finance.getVoteHeadBalances.mockResolvedValue({ success: true, data: balances })
      const { result } = renderHook(() => useFeePolicies())

      let data: unknown
      await act(async () => {
        data = await result.current.getVoteHeadBalances(10)
      })

      expect(data).toEqual(balances)
    })
  })

  /* ---- generic error handling ---- */
  describe('error handling', () => {
    it('catches Error instances', async () => {
      mockApi.finance.getPoliciesForTerm.mockRejectedValue(new Error('DB down'))
      const { result } = renderHook(() => useFeePolicies())

      await act(async () => {
        await result.current.getPoliciesForTerm(1)
      })

      expect(result.current.error).toBe('DB down')
    })

    it('uses generic message for non-Error', async () => {
      mockApi.finance.getPoliciesForTerm.mockRejectedValue(null)
      const { result } = renderHook(() => useFeePolicies())

      await act(async () => {
        await result.current.getPoliciesForTerm(1)
      })

      expect(result.current.error).toBe('An error occurred')
    })

    it('clears error on next successful call', async () => {
      mockApi.finance.getPoliciesForTerm.mockResolvedValueOnce({ success: false, error: 'Fail' })
      mockApi.finance.getPoliciesForTerm.mockResolvedValueOnce({ success: true, data: [] })
      const { result } = renderHook(() => useFeePolicies())

      await act(async () => { await result.current.getPoliciesForTerm(1) })
      expect(result.current.error).toBe('Fail')

      await act(async () => { await result.current.getPoliciesForTerm(1) })
      expect(result.current.error).toBeNull()
    })

    it('uses fallback message when API returns failure without error string', async () => {
      mockApi.finance.getPoliciesForTerm.mockResolvedValueOnce({ success: false })
      const { result } = renderHook(() => useFeePolicies())

      await act(async () => {
        await result.current.getPoliciesForTerm(1)
      })

      expect(result.current.error).toBe('Operation failed')
    })
  })
})
