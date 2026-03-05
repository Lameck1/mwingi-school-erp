// @vitest-environment jsdom
/**
 * Tests for useProcurement hook.
 *
 * Verifies requisition lifecycle (create → submit → approve/reject),
 * purchase orders, GRN, payment vouchers, and error propagation via throw.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { useProcurement } from '../useProcurement'

let mockApi: { finance: Record<string, ReturnType<typeof vi.fn>> }

beforeEach(() => {
  mockApi = {
    finance: {
      createRequisition: vi.fn(),
      submitRequisition: vi.fn(),
      approveRequisition: vi.fn(),
      rejectRequisition: vi.fn(),
      getRequisitionsByStatus: vi.fn(),
      commitBudget: vi.fn(),
      createPurchaseOrder: vi.fn(),
      createGrn: vi.fn(),
      createPaymentVoucher: vi.fn(),
      approvePaymentVoucher: vi.fn(),
    },
  }
  ;(globalThis as unknown as Record<string, unknown>).electronAPI = mockApi
})

afterEach(() => {
  delete (globalThis as unknown as Record<string, unknown>).electronAPI
})

describe('useProcurement', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useProcurement())
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  /* ---- Requisition flow ---- */
  describe('createRequisition', () => {
    it('delegates to the API', async () => {
      const reqData = { department: 'Admin', description: 'Office supplies', items: [] }
      mockApi.finance.createRequisition.mockResolvedValue({ success: true, id: 5 })
      const { result } = renderHook(() => useProcurement())

      await act(async () => {
        await result.current.createRequisition(reqData)
      })

      expect(mockApi.finance.createRequisition).toHaveBeenCalledWith(reqData)
    })
  })

  describe('submitRequisition', () => {
    it('delegates to the API', async () => {
      mockApi.finance.submitRequisition.mockResolvedValue({ success: true })
      const { result } = renderHook(() => useProcurement())

      await act(async () => {
        await result.current.submitRequisition(1)
      })

      expect(mockApi.finance.submitRequisition).toHaveBeenCalledWith(1)
    })
  })

  describe('getRequisitionsByStatus', () => {
    it('returns filtered list', async () => {
      const list = [{ id: 1, status: 'DRAFT' }]
      mockApi.finance.getRequisitionsByStatus.mockResolvedValue(list)
      const { result } = renderHook(() => useProcurement())

      let data: unknown
      await act(async () => {
        data = await result.current.getRequisitionsByStatus('DRAFT')
      })

      expect(data).toEqual(list)
    })
  })

  /* ---- Error handling (throws instead of returning null) ---- */
  describe('error handling', () => {
    it('sets error and re-throws on Error', async () => {
      mockApi.finance.createRequisition.mockRejectedValue(new Error('DB down'))
      const { result } = renderHook(() => useProcurement())

      let thrownError: Error | undefined
      await act(async () => {
        try {
          await result.current.createRequisition({
            department: 'IT', description: 'Servers', items: [],
          })
        } catch (e) {
          thrownError = e as Error
        }
      })

      expect(thrownError?.message).toBe('DB down')
      expect(result.current.error).toBe('DB down')
    })

    it('uses generic message for non-Error throws', async () => {
      mockApi.finance.submitRequisition.mockRejectedValue(42)
      const { result } = renderHook(() => useProcurement())

      let thrownError: Error | undefined
      await act(async () => {
        try {
          await result.current.submitRequisition(1)
        } catch (e) {
          thrownError = e as Error
        }
      })

      expect(thrownError?.message).toBe('An error occurred')
      expect(result.current.error).toBe('An error occurred')
    })
  })

  /* ---- Remaining API delegates ---- */
  describe('approveRequisition', () => {
    it('delegates to the API', async () => {
      mockApi.finance.approveRequisition.mockResolvedValue({ success: true })
      const { result } = renderHook(() => useProcurement())
      await act(async () => { await result.current.approveRequisition(5) })
      expect(mockApi.finance.approveRequisition).toHaveBeenCalledWith(5)
    })
  })

  describe('rejectRequisition', () => {
    it('delegates to the API with reason', async () => {
      mockApi.finance.rejectRequisition.mockResolvedValue({ success: true })
      const { result } = renderHook(() => useProcurement())
      await act(async () => { await result.current.rejectRequisition(3, 'Budget exceeded') })
      expect(mockApi.finance.rejectRequisition).toHaveBeenCalledWith(3, 'Budget exceeded')
    })
  })

  describe('commitBudget', () => {
    it('delegates to the API', async () => {
      mockApi.finance.commitBudget.mockResolvedValue({ success: true })
      const { result } = renderHook(() => useProcurement())
      await act(async () => { await result.current.commitBudget(7) })
      expect(mockApi.finance.commitBudget).toHaveBeenCalledWith(7)
    })
  })

  describe('createPurchaseOrder', () => {
    it('delegates to the API', async () => {
      const poData = { requisition_id: 1, supplier_id: 2 }
      mockApi.finance.createPurchaseOrder.mockResolvedValue({ success: true, id: 10 })
      const { result } = renderHook(() => useProcurement())
      await act(async () => { await result.current.createPurchaseOrder(poData) })
      expect(mockApi.finance.createPurchaseOrder).toHaveBeenCalledWith(poData)
    })
  })

  describe('createGrn', () => {
    it('delegates to the API', async () => {
      const grnData = { purchase_order_id: 10, received_date: '2026-03-01', items: [] }
      mockApi.finance.createGrn.mockResolvedValue({ success: true })
      const { result } = renderHook(() => useProcurement())
      await act(async () => { await result.current.createGrn(grnData as any) })
      expect(mockApi.finance.createGrn).toHaveBeenCalledWith(grnData)
    })
  })

  describe('createPaymentVoucher', () => {
    it('delegates to the API', async () => {
      const voucherData = { purchase_order_id: 10, supplier_id: 2, amount: 5000 }
      mockApi.finance.createPaymentVoucher.mockResolvedValue({ success: true })
      const { result } = renderHook(() => useProcurement())
      await act(async () => { await result.current.createPaymentVoucher(voucherData as any) })
      expect(mockApi.finance.createPaymentVoucher).toHaveBeenCalledWith(voucherData)
    })
  })

  describe('approvePaymentVoucher', () => {
    it('delegates to the API', async () => {
      mockApi.finance.approvePaymentVoucher.mockResolvedValue({ success: true })
      const { result } = renderHook(() => useProcurement())
      await act(async () => { await result.current.approvePaymentVoucher(15) })
      expect(mockApi.finance.approvePaymentVoucher).toHaveBeenCalledWith(15)
    })
  })
})
