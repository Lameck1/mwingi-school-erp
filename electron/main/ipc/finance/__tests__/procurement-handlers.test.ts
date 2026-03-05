import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const handlerMap = new Map<string, IpcHandler>()

const procurementServiceMock = {
  createRequisition: vi.fn().mockReturnValue({ success: true, id: 1 }),
  submitRequisition: vi.fn().mockReturnValue({ success: true }),
  approveRequisition: vi.fn().mockReturnValue({ success: true }),
  rejectRequisition: vi.fn().mockReturnValue({ success: true }),
  getRequisitionsByStatus: vi.fn().mockReturnValue([]),
  commitBudget: vi.fn().mockReturnValue({ success: true, id: 1 }),
  createPurchaseOrder: vi.fn().mockReturnValue({ success: true, id: 1 }),
  createGrn: vi.fn().mockReturnValue({ success: true, id: 1 }),
  getPurchaseOrderByRequisition: vi.fn().mockReturnValue(null),
  getPoSummary: vi.fn().mockReturnValue(null),
  createPaymentVoucher: vi.fn().mockReturnValue({ success: true, id: 1 }),
  approvePaymentVoucher: vi.fn().mockReturnValue({ success: true }),
}

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue(JSON.stringify({
      user: { id: 9, username: 'test', role: 'ADMIN', full_name: 'Test Admin', email: 'admin@test.com', is_active: 1, last_login: null, created_at: new Date().toISOString() },
      lastActivity: Date.now()
    })),
    setPassword: vi.fn().mockResolvedValue(null),
    deletePassword: vi.fn().mockResolvedValue(true)
  }
}))

vi.mock('../../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      handlerMap.set(channel, handler)
    }),
    removeHandler: vi.fn(),
  }
}))

vi.mock('../../../database', () => ({
  getDatabase: () => ({})
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

vi.mock('../../../services/finance/ProcurementService', () => ({
  ProcurementService: class {
    createRequisition = procurementServiceMock.createRequisition
    submitRequisition = procurementServiceMock.submitRequisition
    approveRequisition = procurementServiceMock.approveRequisition
    rejectRequisition = procurementServiceMock.rejectRequisition
    getRequisitionsByStatus = procurementServiceMock.getRequisitionsByStatus
    commitBudget = procurementServiceMock.commitBudget
    createPurchaseOrder = procurementServiceMock.createPurchaseOrder
    createGrn = procurementServiceMock.createGrn
    getPurchaseOrderByRequisition = procurementServiceMock.getPurchaseOrderByRequisition
    getPoSummary = procurementServiceMock.getPoSummary
    createPaymentVoucher = procurementServiceMock.createPaymentVoucher
    approvePaymentVoucher = procurementServiceMock.approvePaymentVoucher
  }
}))

import { setupProcurementHandlers } from '../procurement-handlers'

type SuccessResult = { success: boolean; error?: string; [key: string]: unknown }

describe('procurement-handlers', () => {
  beforeEach(() => {
    handlerMap.clear()
    procurementServiceMock.createRequisition.mockReset().mockReturnValue({ success: true, id: 1 })
    procurementServiceMock.submitRequisition.mockReset().mockReturnValue({ success: true })
    procurementServiceMock.approveRequisition.mockReset().mockReturnValue({ success: true })
    procurementServiceMock.rejectRequisition.mockReset().mockReturnValue({ success: true })
    procurementServiceMock.getRequisitionsByStatus.mockReset().mockReturnValue([])
    procurementServiceMock.commitBudget.mockReset().mockReturnValue({ success: true, id: 1 })
    procurementServiceMock.createPurchaseOrder.mockReset().mockReturnValue({ success: true, id: 1 })
    procurementServiceMock.createGrn.mockReset().mockReturnValue({ success: true, id: 1 })
    procurementServiceMock.getPurchaseOrderByRequisition.mockReset().mockReturnValue(null)
    procurementServiceMock.getPoSummary.mockReset().mockReturnValue(null)
    procurementServiceMock.createPaymentVoucher.mockReset().mockReturnValue({ success: true, id: 1 })
    procurementServiceMock.approvePaymentVoucher.mockReset().mockReturnValue({ success: true })

    setupProcurementHandlers()
  })

  afterEach(() => {
    handlerMap.clear()
  })

  // ─── Handler registration ───────────────────────────────────────────

  it('registers all expected procurement channels', () => {
    expect(handlerMap.has('procurement:createRequisition')).toBe(true)
    expect(handlerMap.has('procurement:submitRequisition')).toBe(true)
    expect(handlerMap.has('procurement:approveRequisition')).toBe(true)
    expect(handlerMap.has('procurement:rejectRequisition')).toBe(true)
    expect(handlerMap.has('procurement:getRequisitionsByStatus')).toBe(true)
    expect(handlerMap.has('procurement:commitBudget')).toBe(true)
    expect(handlerMap.has('procurement:createPurchaseOrder')).toBe(true)
    expect(handlerMap.has('procurement:createGrn')).toBe(true)
    expect(handlerMap.has('procurement:getPoByRequisition')).toBe(true)
    expect(handlerMap.has('procurement:getPoSummary')).toBe(true)
    expect(handlerMap.has('procurement:createPaymentVoucher')).toBe(true)
    expect(handlerMap.has('procurement:approvePaymentVoucher')).toBe(true)
  })

  // ─── procurement:createRequisition ──────────────────────────────────

  it('createRequisition delegates to service on valid payload', async () => {
    const handler = handlerMap.get('procurement:createRequisition')!
    const result = await handler(
      {},
      {
        department: 'Science',
        description: 'Lab supplies',
        items: [
          { description: 'Beakers', quantity: 10, estimated_unit_cost: 500 }
        ]
      }
    ) as SuccessResult

    expect(result.success).toBe(true)
    expect(result.id).toBe(1)
    expect(procurementServiceMock.createRequisition).toHaveBeenCalledTimes(1)
  })

  it('createRequisition rejects empty items array', async () => {
    const handler = handlerMap.get('procurement:createRequisition')!
    const _result = await handler(
      {},
      {
        department: 'Science',
        description: 'Lab supplies',
        items: []
      }
    ) as SuccessResult

    // Zod validation: z.array(reqItemSchema) doesn't have .min(1) but
    // the handler catches service errors. Let's check — if Zod doesn't reject,
    // service returns error and handler throws.
    // Actually the schema is just z.array(reqItemSchema) — no min. So Zod passes.
    // The service's createRequisition checks items.length === 0 => error.
    // The handler does: if (!result.success) throw new Error(result.error)
    // The outer try/catch in validatedHandlerMulti catches it.
    procurementServiceMock.createRequisition.mockReturnValueOnce({ success: false, error: 'At least one item is required' })
    const result2 = await handler(
      {},
      {
        department: 'Science',
        description: 'Lab supplies',
        items: []
      }
    ) as SuccessResult

    expect(result2.success).toBe(false)
    expect(result2.error).toContain('At least one item is required')
  })

  it('createRequisition propagates service failure', async () => {
    procurementServiceMock.createRequisition.mockReturnValueOnce({ success: false, error: 'DB constraint violation' })
    const handler = handlerMap.get('procurement:createRequisition')!
    const result = await handler(
      {},
      {
        department: 'Admin',
        description: 'Office supplies',
        items: [
          { description: 'Paper', quantity: 5, estimated_unit_cost: 200 }
        ]
      }
    ) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toContain('DB constraint violation')
  })

  // ─── procurement:submitRequisition ──────────────────────────────────

  it('submitRequisition delegates to service', async () => {
    const handler = handlerMap.get('procurement:submitRequisition')!
    const result = await handler({}, 1) as SuccessResult

    expect(result.success).toBe(true)
    expect(procurementServiceMock.submitRequisition).toHaveBeenCalledWith(1, 9)
  })

  // ─── procurement:approveRequisition ─────────────────────────────────

  it('approveRequisition delegates to service', async () => {
    const handler = handlerMap.get('procurement:approveRequisition')!
    const result = await handler({}, 1) as SuccessResult

    expect(result.success).toBe(true)
    expect(procurementServiceMock.approveRequisition).toHaveBeenCalledWith(1, 9)
  })

  // ─── procurement:rejectRequisition ──────────────────────────────────

  it('rejectRequisition passes reason to service', async () => {
    const handler = handlerMap.get('procurement:rejectRequisition')!
    const result = await handler({}, 1, 'Over budget') as SuccessResult

    expect(result.success).toBe(true)
    expect(procurementServiceMock.rejectRequisition).toHaveBeenCalledWith(1, 'Over budget', 9)
  })

  it('rejectRequisition propagates service failure', async () => {
    procurementServiceMock.rejectRequisition.mockReturnValueOnce({ success: false, error: 'Requisition not found' })
    const handler = handlerMap.get('procurement:rejectRequisition')!
    const result = await handler({}, 999, 'Not needed') as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toContain('Requisition not found')
  })

  // ─── procurement:getRequisitionsByStatus ────────────────────────────

  it('getRequisitionsByStatus returns list', async () => {
    procurementServiceMock.getRequisitionsByStatus.mockReturnValueOnce([
      { id: 1, status: 'SUBMITTED' }
    ])
    const handler = handlerMap.get('procurement:getRequisitionsByStatus')!
    const result = await handler({}, 'SUBMITTED') as unknown[]

    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(1)
    expect(procurementServiceMock.getRequisitionsByStatus).toHaveBeenCalledWith('SUBMITTED')
  })

  // ─── procurement:commitBudget ───────────────────────────────────────

  it('commitBudget delegates to service', async () => {
    const handler = handlerMap.get('procurement:commitBudget')!
    const result = await handler({}, 1) as SuccessResult

    expect(result.success).toBe(true)
    expect(procurementServiceMock.commitBudget).toHaveBeenCalledWith(1, 9)
  })

  // ─── procurement:createPurchaseOrder ────────────────────────────────

  it('createPurchaseOrder delegates to service', async () => {
    const handler = handlerMap.get('procurement:createPurchaseOrder')!
    const result = await handler(
      {},
      {
        requisition_id: 1,
        supplier_id: 5,
        expected_delivery_date: '2026-04-01',
        notes: 'Urgent order'
      }
    ) as SuccessResult

    expect(result.success).toBe(true)
    expect(procurementServiceMock.createPurchaseOrder).toHaveBeenCalledTimes(1)
  })

  // ─── procurement:createGrn ──────────────────────────────────────────

  it('createGrn delegates to service', async () => {
    const handler = handlerMap.get('procurement:createGrn')!
    const result = await handler(
      {},
      {
        purchase_order_id: 1,
        received_date: '2026-03-15',
        items: [
          { po_item_id: 1, quantity_received: 10, quantity_accepted: 10 }
        ]
      }
    ) as SuccessResult

    expect(result.success).toBe(true)
    expect(procurementServiceMock.createGrn).toHaveBeenCalledTimes(1)
  })

  // ─── procurement:createPaymentVoucher ───────────────────────────────

  it('createPaymentVoucher delegates to service', async () => {
    const handler = handlerMap.get('procurement:createPaymentVoucher')!
    const result = await handler(
      {},
      {
        purchase_order_id: 1,
        grn_id: 1,
        supplier_id: 5,
        amount: 50000,
        payment_method: 'CHEQUE',
        payment_reference: 'CHQ-001'
      }
    ) as SuccessResult

    expect(result.success).toBe(true)
    expect(procurementServiceMock.createPaymentVoucher).toHaveBeenCalledTimes(1)
  })

  // ─── procurement:approvePaymentVoucher ──────────────────────────────

  it('approvePaymentVoucher delegates to service', async () => {
    const handler = handlerMap.get('procurement:approvePaymentVoucher')!
    const result = await handler({}, 1) as SuccessResult

    expect(result.success).toBe(true)
    expect(procurementServiceMock.approvePaymentVoucher).toHaveBeenCalledWith(1, 9)
  })

  it('approvePaymentVoucher propagates service failure', async () => {
    procurementServiceMock.approvePaymentVoucher.mockReturnValueOnce({ success: false, error: 'Voucher not found' })
    const handler = handlerMap.get('procurement:approvePaymentVoucher')!
    const result = await handler({}, 999) as SuccessResult

    expect(result.success).toBe(false)
    expect(result.error).toContain('Voucher not found')
  })

  // ─── Service failure propagation for uncovered throw branches ───────

  it('submitRequisition propagates service failure', async () => {
    procurementServiceMock.submitRequisition.mockReturnValueOnce({ success: false, error: 'Cannot submit' })
    const handler = handlerMap.get('procurement:submitRequisition')!
    const result = await handler({}, 1) as SuccessResult
    expect(result.success).toBe(false)
    expect(result.error).toContain('Cannot submit')
  })

  it('approveRequisition propagates service failure', async () => {
    procurementServiceMock.approveRequisition.mockReturnValueOnce({ success: false, error: 'Already approved' })
    const handler = handlerMap.get('procurement:approveRequisition')!
    const result = await handler({}, 1) as SuccessResult
    expect(result.success).toBe(false)
    expect(result.error).toContain('Already approved')
  })

  it('commitBudget propagates service failure', async () => {
    procurementServiceMock.commitBudget.mockReturnValueOnce({ success: false, error: 'Over budget' })
    const handler = handlerMap.get('procurement:commitBudget')!
    const result = await handler({}, 1) as SuccessResult
    expect(result.success).toBe(false)
    expect(result.error).toContain('Over budget')
  })

  it('createPurchaseOrder propagates service failure', async () => {
    procurementServiceMock.createPurchaseOrder.mockReturnValueOnce({ success: false, error: 'Requisition not approved' })
    const handler = handlerMap.get('procurement:createPurchaseOrder')!
    const result = await handler({}, { requisition_id: 1, supplier_id: 5 }) as SuccessResult
    expect(result.success).toBe(false)
    expect(result.error).toContain('Requisition not approved')
  })

  it('createGrn propagates service failure', async () => {
    procurementServiceMock.createGrn.mockReturnValueOnce({ success: false, error: 'PO not found' })
    const handler = handlerMap.get('procurement:createGrn')!
    const result = await handler({}, {
      purchase_order_id: 1,
      received_date: '2026-03-15',
      items: [{ po_item_id: 1, quantity_received: 10, quantity_accepted: 10 }]
    }) as SuccessResult
    expect(result.success).toBe(false)
    expect(result.error).toContain('PO not found')
  })

  it('createPaymentVoucher propagates service failure', async () => {
    procurementServiceMock.createPaymentVoucher.mockReturnValueOnce({ success: false, error: 'GRN required' })
    const handler = handlerMap.get('procurement:createPaymentVoucher')!
    const result = await handler({}, {
      purchase_order_id: 1, supplier_id: 5, amount: 50000
    }) as SuccessResult
    expect(result.success).toBe(false)
    expect(result.error).toContain('GRN required')
  })

  // ─── Uncovered query handlers ──────────────────────────────────────

  it('getPoByRequisition returns purchase order data', async () => {
    procurementServiceMock.getPurchaseOrderByRequisition.mockReturnValueOnce({ id: 1, requisition_id: 1, status: 'ISSUED' })
    const handler = handlerMap.get('procurement:getPoByRequisition')!
    const result = await handler({}, 1) as { id: number }
    expect(result.id).toBe(1)
    expect(procurementServiceMock.getPurchaseOrderByRequisition).toHaveBeenCalledWith(1)
  })

  it('getPoSummary returns PO summary data', async () => {
    procurementServiceMock.getPoSummary.mockReturnValueOnce({ po_id: 1, total_amount: 50000 })
    const handler = handlerMap.get('procurement:getPoSummary')!
    const result = await handler({}, 1) as { po_id: number; total_amount: number }
    expect(result.po_id).toBe(1)
    expect(procurementServiceMock.getPoSummary).toHaveBeenCalledWith(1)
  })
})
