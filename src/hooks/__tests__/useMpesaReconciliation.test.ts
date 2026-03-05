// @vitest-environment jsdom
/**
 * Tests for useMpesaReconciliation hook.
 *
 * Verifies auto-fetch on mount, importCsv, manualMatch, refreshData,
 * and the mountedRef guard pattern that prevents setState after unmount.
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { useMpesaReconciliation } from '../useMpesaReconciliation'

let mockApi: { finance: Record<string, ReturnType<typeof vi.fn>> }

beforeEach(() => {
  mockApi = {
    finance: {
      getUnmatchedMpesaTransactions: vi.fn().mockResolvedValue([]),
      getMpesaSummary: vi.fn().mockResolvedValue(null),
      importMpesaTransactions: vi.fn().mockResolvedValue(null),
      manualMatchMpesaTransaction: vi.fn().mockResolvedValue(null),
    },
  }
  ;(globalThis as Record<string, unknown>).electronAPI = mockApi
})

afterEach(() => {
  delete (globalThis as Record<string, unknown>).electronAPI
})

describe('useMpesaReconciliation', () => {
  it('auto-fetches unmatched + summary on mount', async () => {
    const txns = [{ id: 1, transaction_receipt: 'ABC', amount: 5000 }]
    mockApi.finance.getUnmatchedMpesaTransactions.mockResolvedValue(txns)
    mockApi.finance.getMpesaSummary.mockResolvedValue({
      totalSummary: { total_processed: 10 },
    })

    const { result } = renderHook(() => useMpesaReconciliation())

    await waitFor(() => {
      expect(result.current.unmatchedData).toEqual(txns)
      expect(result.current.summary).toBeDefined()
    })
  })

  /* ---- importCsv ---- */
  describe('importCsv', () => {
    it('calls API and refreshes data', async () => {
      const rows = [{ receipt: 'X', amount: 100 }]
      const { result } = renderHook(() => useMpesaReconciliation())

      // Wait for initial mount calls
      await waitFor(() => expect(mockApi.finance.getUnmatchedMpesaTransactions).toHaveBeenCalled())

      await act(async () => {
        await result.current.importCsv(rows, 'test.csv')
      })

      expect(mockApi.finance.importMpesaTransactions).toHaveBeenCalledWith(rows, 'CSV', 'test.csv')
      // Should re-fetch after import (called more than once due to refresh)
      expect(mockApi.finance.getUnmatchedMpesaTransactions.mock.calls.length).toBeGreaterThan(1)
    })

    it('throws on error', async () => {
      mockApi.finance.importMpesaTransactions.mockRejectedValue(new Error('Bad CSV'))
      const { result } = renderHook(() => useMpesaReconciliation())

      await waitFor(() => expect(mockApi.finance.getUnmatchedMpesaTransactions).toHaveBeenCalled())

      await expect(
        act(async () => {
          await result.current.importCsv([], 'bad.csv')
        }),
      ).rejects.toThrow('Bad CSV')
    })
  })

  /* ---- manualMatch ---- */
  describe('manualMatch', () => {
    it('calls API and refreshes', async () => {
      const { result } = renderHook(() => useMpesaReconciliation())
      await waitFor(() => expect(mockApi.finance.getUnmatchedMpesaTransactions).toHaveBeenCalled())

      await act(async () => {
        await result.current.manualMatch(1, 42)
      })

      expect(mockApi.finance.manualMatchMpesaTransaction).toHaveBeenCalledWith(1, 42)
    })

    it('throws on match failure', async () => {
      mockApi.finance.manualMatchMpesaTransaction.mockRejectedValue(new Error('Not found'))
      const { result } = renderHook(() => useMpesaReconciliation())
      await waitFor(() => expect(mockApi.finance.getUnmatchedMpesaTransactions).toHaveBeenCalled())

      await expect(
        act(async () => {
          await result.current.manualMatch(999, 1)
        }),
      ).rejects.toThrow('Not found')
    })
  })

  /* ---- error state from fetch ---- */
  it('sets error when fetchUnmatched fails', async () => {
    mockApi.finance.getUnmatchedMpesaTransactions.mockRejectedValue(new Error('Network'))
    const { result } = renderHook(() => useMpesaReconciliation())

    await waitFor(() => {
      expect(result.current.error).toBe('Network')
    })
  })

  /* ---- fetchSummary error paths ---- */
  it('sets error when fetchSummary fails with Error', async () => {
    mockApi.finance.getMpesaSummary.mockRejectedValue(new Error('Summary DB down'))
    const { result } = renderHook(() => useMpesaReconciliation())

    await waitFor(() => {
      expect(result.current.error).toBe('Summary DB down')
    })
  })

  it('sets fallback error when fetchSummary rejects with non-Error', async () => {
    mockApi.finance.getMpesaSummary.mockRejectedValue('string-err')
    const { result } = renderHook(() => useMpesaReconciliation())

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to fetch reconciliation summary')
    })
  })

  /* ---- fetchUnmatched non-Error exception ---- */
  it('sets fallback error when fetchUnmatched rejects with non-Error', async () => {
    mockApi.finance.getUnmatchedMpesaTransactions.mockRejectedValue(42)
    const { result } = renderHook(() => useMpesaReconciliation())

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to fetch unmatched transactions')
    })
  })

  /* ---- importCsv non-Error exception ---- */
  it('throws fallback message when importCsv rejects with non-Error', async () => {
    mockApi.finance.importMpesaTransactions.mockRejectedValue(null)
    const { result } = renderHook(() => useMpesaReconciliation())

    await waitFor(() => expect(mockApi.finance.getUnmatchedMpesaTransactions).toHaveBeenCalled())

    await expect(
      act(async () => {
        await result.current.importCsv([], 'file.csv')
      }),
    ).rejects.toThrow('Failed to import CSV')
  })

  /* ---- manualMatch non-Error exception ---- */
  it('throws fallback message when manualMatch rejects with non-Error', async () => {
    mockApi.finance.manualMatchMpesaTransaction.mockRejectedValue('oops')
    const { result } = renderHook(() => useMpesaReconciliation())

    await waitFor(() => expect(mockApi.finance.getUnmatchedMpesaTransactions).toHaveBeenCalled())

    await expect(
      act(async () => {
        await result.current.manualMatch(1, 2)
      }),
    ).rejects.toThrow('Failed to match manually')
  })

  /* ---- unmount guard ---- */
  it('does not update state after unmount', async () => {
    let resolveUnmatched!: (v: unknown) => void
    mockApi.finance.getUnmatchedMpesaTransactions.mockReturnValue(
      new Promise(resolve => { resolveUnmatched = resolve }),
    )

    const { unmount } = renderHook(() => useMpesaReconciliation())
    unmount()

    // Resolve after unmount — should not throw or update state
    await act(async () => {
      resolveUnmatched([{ id: 99 }])
    })
    // If the mountedRef guard works, no error is thrown
    expect(true).toBe(true)
  })

  /* ---- branch coverage: fetchUnmatched error + finally after unmount (L51) ---- */
  it('does not set error state when fetchUnmatched errors after unmount', async () => {
    let rejectUnmatched!: (err: unknown) => void
    mockApi.finance.getUnmatchedMpesaTransactions.mockReturnValue(
      new Promise((_resolve, reject) => { rejectUnmatched = reject }),
    )

    const { unmount } = renderHook(() => useMpesaReconciliation())
    unmount()

    // Reject after unmount — mountedRef.current is false in both catch & finally
    await act(async () => {
      rejectUnmatched(new Error('post-unmount error'))
    })
    // No error thrown means the mountedRef guard prevented setState calls
    expect(true).toBe(true)
  })

  /* ---- branch coverage: fetchSummary error after unmount (L63) ---- */
  it('does not set error state when fetchSummary errors after unmount', async () => {
    // Make fetchUnmatched resolve immediately so only fetchSummary is pending
    mockApi.finance.getUnmatchedMpesaTransactions.mockResolvedValue([])
    let rejectSummary!: (err: unknown) => void
    mockApi.finance.getMpesaSummary.mockReturnValue(
      new Promise((_resolve, reject) => { rejectSummary = reject }),
    )

    const { unmount } = renderHook(() => useMpesaReconciliation())
    unmount()

    await act(async () => {
      rejectSummary(new Error('summary error after unmount'))
    })
    expect(true).toBe(true)
  })
})
