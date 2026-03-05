/**
 * Tests for ProcurementService – P2P workflow orchestration.
 *
 * Uses in-memory SQLite with inline DDL. BudgetService and FixedAssetService
 * are mocked so we only test procurement orchestration logic.
 */
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/* ── Mocks ────────────────────────────────────────────────────────── */
const mockCommitFunds = vi.fn().mockReturnValue({ success: true })
const mockUtilizeFunds = vi.fn().mockReturnValue({ success: true })
const mockCreateSync = vi.fn().mockReturnValue({ success: true, id: 1 })

vi.mock('../BudgetService', () => ({
  BudgetService: vi.fn().mockImplementation(function (this: any) {
    this.commitFunds = mockCommitFunds
    this.utilizeFunds = mockUtilizeFunds
  }),
}))

vi.mock('../FixedAssetService', () => ({
  FixedAssetService: vi.fn().mockImplementation(function (this: any) {
    this.createSync = mockCreateSync
    this.create = mockCreateSync
  }),
}))

vi.mock('../../../database', () => ({
  getDatabase: () => { throw new Error('Use constructor injection') },
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn(),
}))

import { ProcurementService } from '../ProcurementService'

/* ── Schema ───────────────────────────────────────────────────────── */
const SCHEMA = `
  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, action_type TEXT,
    table_name TEXT, record_id INTEGER, old_values TEXT, new_values TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE purchase_requisition (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requisition_number TEXT NOT NULL UNIQUE,
    requested_by_user_id INTEGER NOT NULL,
    department TEXT NOT NULL,
    description TEXT NOT NULL,
    justification TEXT,
    total_amount INTEGER NOT NULL DEFAULT 0,
    jss_account_type TEXT,
    budget_line_id INTEGER,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    rejection_reason TEXT,
    approved_by_user_id INTEGER,
    approved_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE requisition_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requisition_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_of_measure TEXT DEFAULT 'pcs',
    estimated_unit_cost INTEGER NOT NULL,
    total_cost INTEGER NOT NULL,
    inventory_item_id INTEGER,
    is_capital_asset BOOLEAN DEFAULT 0,
    asset_category_id INTEGER,
    FOREIGN KEY (requisition_id) REFERENCES purchase_requisition(id)
  );
  CREATE TABLE budget_commitment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requisition_id INTEGER NOT NULL UNIQUE,
    committed_amount INTEGER NOT NULL,
    utilized_amount INTEGER DEFAULT 0,
    status TEXT DEFAULT 'ACTIVE',
    committed_by_user_id INTEGER,
    FOREIGN KEY (requisition_id) REFERENCES purchase_requisition(id)
  );
  CREATE TABLE purchase_order (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT NOT NULL UNIQUE,
    requisition_id INTEGER NOT NULL,
    supplier_id INTEGER NOT NULL,
    order_date DATE,
    expected_delivery_date DATE,
    total_amount INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ISSUED',
    issued_by_user_id INTEGER,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (requisition_id) REFERENCES purchase_requisition(id)
  );
  CREATE TABLE purchase_order_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_order_id INTEGER NOT NULL,
    requisition_item_id INTEGER,
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_of_measure TEXT DEFAULT 'pcs',
    unit_cost INTEGER NOT NULL,
    total_cost INTEGER NOT NULL,
    received_quantity INTEGER DEFAULT 0,
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_order(id)
  );
  CREATE TABLE goods_received_note (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grn_number TEXT NOT NULL UNIQUE,
    purchase_order_id INTEGER NOT NULL,
    received_date DATE NOT NULL,
    received_by_user_id INTEGER,
    inspected_by TEXT,
    inspection_notes TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING_INSPECTION',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_order(id)
  );
  CREATE TABLE grn_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grn_id INTEGER NOT NULL,
    po_item_id INTEGER NOT NULL,
    quantity_received INTEGER NOT NULL,
    quantity_accepted INTEGER NOT NULL,
    quantity_rejected INTEGER DEFAULT 0,
    rejection_reason TEXT,
    FOREIGN KEY (grn_id) REFERENCES goods_received_note(id),
    FOREIGN KEY (po_item_id) REFERENCES purchase_order_item(id)
  );
  CREATE TABLE payment_voucher (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voucher_number TEXT NOT NULL UNIQUE,
    purchase_order_id INTEGER NOT NULL,
    grn_id INTEGER,
    supplier_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    payment_method TEXT,
    payment_reference TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    prepared_by_user_id INTEGER,
    approved_by_user_id INTEGER,
    approved_at DATETIME,
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_order(id)
  );
`

/* ── Helpers ──────────────────────────────────────────────────────── */
let db: Database.Database
let svc: ProcurementService

/** Creates requisition → submit → approve → commit → PO pipeline and returns IDs. */
function fullPipeline() {
  const reqResult = svc.createRequisition({
    department: 'Admin',
    description: 'Office supplies',
    items: [{ description: 'Pens', quantity: 10, estimated_unit_cost: 50 }],
  }, 1)
  const reqId = reqResult.id!
  svc.submitRequisition(reqId, 1)
  svc.approveRequisition(reqId, 1)
  svc.commitBudget(reqId, 1)
  const poResult = svc.createPurchaseOrder({ requisition_id: reqId, supplier_id: 1 }, 1)
  const poId = poResult.id!
  const poItemId = (db.prepare('SELECT id FROM purchase_order_item WHERE purchase_order_id = ?').get(poId) as { id: number }).id
  return { reqId, poId, poItemId }
}

/** Creates full pipeline + GRN and returns IDs. */
function fullPipelineWithGrn() {
  const { poId, poItemId, reqId } = fullPipeline()
  const grnResult = svc.createGrn({
    purchase_order_id: poId,
    received_date: '2026-03-01',
    items: [{ po_item_id: poItemId, quantity_received: 10, quantity_accepted: 10 }],
  }, 1)
  return { poId, poItemId, reqId, grnId: grnResult.id! }
}

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  svc = new ProcurementService(db)
  vi.clearAllMocks()
})

afterEach(() => { db.close() })

/* ==================================================================
 *  createRequisition
 * ================================================================== */
describe('createRequisition', () => {
  it('rejects empty items array', () => {
    const result = svc.createRequisition({
      department: 'Admin',
      description: 'Empty',
      items: [],
    }, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('At least one item')
  })

  it('creates requisition with multiple items', () => {
    const result = svc.createRequisition({
      department: 'Teaching',
      description: 'Classroom supplies',
      justification: 'Urgent need',
      jss_account_type: 'TUITION',
      items: [
        { description: 'Chalk', quantity: 100, estimated_unit_cost: 10 },
        { description: 'Markers', quantity: 50, estimated_unit_cost: 30, unit_of_measure: 'boxes' },
      ],
    }, 1)
    expect(result.success).toBe(true)
    expect(result.id).toBeGreaterThan(0)

    const req = db.prepare('SELECT * FROM purchase_requisition WHERE id = ?').get(result.id) as {
      total_amount: number; department: string; status: string
    }
    expect(req.total_amount).toBe(100 * 10 + 50 * 30) // 2500
    expect(req.status).toBe('DRAFT')
  })
})

/* ==================================================================
 *  Requisition lifecycle
 * ================================================================== */
describe('requisition lifecycle', () => {
  it('submitRequisition transitions DRAFT → SUBMITTED', () => {
    const r = svc.createRequisition({
      department: 'Admin', description: 'Test', items: [{ description: 'Item', quantity: 1, estimated_unit_cost: 100 }],
    }, 1)
    const result = svc.submitRequisition(r.id!, 1)
    expect(result.success).toBe(true)
    expect(svc.getRequisition(r.id!)?.status).toBe('SUBMITTED')
  })

  it('submitRequisition rejects non-DRAFT requisition', () => {
    const r = svc.createRequisition({
      department: 'Admin', description: 'Test', items: [{ description: 'Item', quantity: 1, estimated_unit_cost: 100 }],
    }, 1)
    svc.submitRequisition(r.id!, 1)
    const result = svc.submitRequisition(r.id!, 1) // already SUBMITTED
    expect(result.success).toBe(false)
  })

  it('approveRequisition transitions SUBMITTED → APPROVED', () => {
    const r = svc.createRequisition({
      department: 'Admin', description: 'Test', items: [{ description: 'Item', quantity: 1, estimated_unit_cost: 100 }],
    }, 1)
    svc.submitRequisition(r.id!, 1)
    const result = svc.approveRequisition(r.id!, 2)
    expect(result.success).toBe(true)
    expect(svc.getRequisition(r.id!)?.status).toBe('APPROVED')
  })

  it('rejectRequisition rejects non-SUBMITTED requisition', () => {
    const r = svc.createRequisition({
      department: 'Admin', description: 'No', items: [{ description: 'X', quantity: 1, estimated_unit_cost: 1 }],
    }, 1)
    const result = svc.rejectRequisition(r.id!, 'Too expensive', 2)
    expect(result.success).toBe(false)
    expect(result.error).toContain('SUBMITTED')
  })

  it('rejectRequisition succeeds from SUBMITTED', () => {
    const r = svc.createRequisition({
      department: 'Admin', description: 'To reject', items: [{ description: 'X', quantity: 1, estimated_unit_cost: 1 }],
    }, 1)
    svc.submitRequisition(r.id!, 1)
    const result = svc.rejectRequisition(r.id!, 'Budget exceeded', 2)
    expect(result.success).toBe(true)
    expect(svc.getRequisition(r.id!)?.status).toBe('REJECTED')
  })

  it('rejectRequisition returns error for missing requisition', () => {
    const result = svc.rejectRequisition(999, 'Reason', 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })
})

/* ==================================================================
 *  Budget commitment
 * ================================================================== */
describe('commitBudget', () => {
  it('rejects non-APPROVED requisition', () => {
    const r = svc.createRequisition({
      department: 'Admin', description: 'Test', items: [{ description: 'X', quantity: 1, estimated_unit_cost: 100 }],
    }, 1)
    const result = svc.commitBudget(r.id!, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('APPROVED')
  })

  it('commits budget without budget_line_id', () => {
    const r = svc.createRequisition({
      department: 'Admin', description: 'No budget line', items: [{ description: 'X', quantity: 1, estimated_unit_cost: 500 }],
    }, 1)
    svc.submitRequisition(r.id!, 1)
    svc.approveRequisition(r.id!, 2)
    const result = svc.commitBudget(r.id!, 1)
    expect(result.success).toBe(true)
    expect(mockCommitFunds).not.toHaveBeenCalled()
    expect(svc.getRequisition(r.id!)?.status).toBe('COMMITTED')
  })

  it('commits budget with budget_line_id and calls BudgetService', () => {
    const r = svc.createRequisition({
      department: 'Admin', description: 'With budget line',
      budget_line_id: 42,
      items: [{ description: 'X', quantity: 1, estimated_unit_cost: 1000 }],
    }, 1)
    // Manually set budget_line_id since createRequisition doesn't seem to store it; let's check:
    // Actually looking at the SQL, it stores jss_account_type but not budget_line_id directly.
    // Let me set it via DB:
    db.prepare('UPDATE purchase_requisition SET budget_line_id = 42 WHERE id = ?').run(r.id)
    svc.submitRequisition(r.id!, 1)
    svc.approveRequisition(r.id!, 2)
    const result = svc.commitBudget(r.id!, 1)
    expect(result.success).toBe(true)
    expect(mockCommitFunds).toHaveBeenCalledWith(42, 1000)
  })

  it('rejects duplicate budget commitment', () => {
    const r = svc.createRequisition({
      department: 'Admin', description: 'Dup', items: [{ description: 'X', quantity: 1, estimated_unit_cost: 100 }],
    }, 1)
    svc.submitRequisition(r.id!, 1)
    svc.approveRequisition(r.id!, 2)
    svc.commitBudget(r.id!, 1)

    // Now try to commit again — status is already COMMITTED so this should fail
    const result = svc.commitBudget(r.id!, 1)
    expect(result.success).toBe(false)
  })

  it('returns error when requisition not found', () => {
    const result = svc.commitBudget(999, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })
})

/* ==================================================================
 *  Purchase order
 * ================================================================== */
describe('createPurchaseOrder', () => {
  it('creates PO from committed requisition', () => {
    const r = svc.createRequisition({
      department: 'Admin', description: 'PO test',
      items: [{ description: 'Paper', quantity: 5, estimated_unit_cost: 200, unit_of_measure: 'reams' }],
    }, 1)
    svc.submitRequisition(r.id!, 1)
    svc.approveRequisition(r.id!, 2)
    svc.commitBudget(r.id!, 1)

    const result = svc.createPurchaseOrder({ requisition_id: r.id!, supplier_id: 1 }, 1)
    expect(result.success).toBe(true)
    expect(result.id).toBeGreaterThan(0)

    const po = svc.getPurchaseOrder(result.id!)!
    expect(po.status).toBe('ISSUED')
    expect(po.total_amount).toBe(1000)
  })

  it('rejects if requisition not COMMITTED', () => {
    const r = svc.createRequisition({
      department: 'Admin', description: 'Not committed',
      items: [{ description: 'X', quantity: 1, estimated_unit_cost: 100 }],
    }, 1)
    svc.submitRequisition(r.id!, 1)
    svc.approveRequisition(r.id!, 2)
    // Not committed yet
    const result = svc.createPurchaseOrder({ requisition_id: r.id!, supplier_id: 1 }, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('COMMITTED')
  })

  it('rejects if no budget commitment found', () => {
    const r = svc.createRequisition({
      department: 'Admin', description: 'No commitment',
      items: [{ description: 'X', quantity: 1, estimated_unit_cost: 100 }],
    }, 1)
    svc.submitRequisition(r.id!, 1)
    svc.approveRequisition(r.id!, 2)
    // Set status manually without creating commitment
    db.prepare("UPDATE purchase_requisition SET status = 'COMMITTED' WHERE id = ?").run(r.id)
    const result = svc.createPurchaseOrder({ requisition_id: r.id!, supplier_id: 1 }, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('budget commitment')
  })

  it('rejects if requisition not found', () => {
    const result = svc.createPurchaseOrder({ requisition_id: 999, supplier_id: 1 }, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })
})

/* ==================================================================
 *  Goods Received Note
 * ================================================================== */
describe('createGrn', () => {
  it('creates GRN and updates PO item received quantities', () => {
    const { poId, poItemId } = fullPipeline()
    const result = svc.createGrn({
      purchase_order_id: poId,
      received_date: '2026-03-01',
      inspected_by: 'Inspector',
      items: [{ po_item_id: poItemId, quantity_received: 10, quantity_accepted: 10 }],
    }, 1)
    expect(result.success).toBe(true)

    const poItem = db.prepare('SELECT received_quantity FROM purchase_order_item WHERE id = ?').get(poItemId) as { received_quantity: number }
    expect(poItem.received_quantity).toBe(10)

    const po = svc.getPurchaseOrder(poId)!
    expect(po.status).toBe('FULLY_RECEIVED')
  })

  it('sets PO to PARTIALLY_RECEIVED when not all items received', () => {
    const { poId, poItemId } = fullPipeline()
    const result = svc.createGrn({
      purchase_order_id: poId,
      received_date: '2026-03-01',
      items: [{ po_item_id: poItemId, quantity_received: 5, quantity_accepted: 5 }],
    }, 1)
    expect(result.success).toBe(true)
    expect(svc.getPurchaseOrder(poId)!.status).toBe('PARTIALLY_RECEIVED')
  })

  it('rejects cancelled PO', () => {
    const { poId, poItemId } = fullPipeline()
    db.prepare("UPDATE purchase_order SET status = 'CANCELLED' WHERE id = ?").run(poId)
    const result = svc.createGrn({
      purchase_order_id: poId,
      received_date: '2026-03-01',
      items: [{ po_item_id: poItemId, quantity_received: 10, quantity_accepted: 10 }],
    }, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('cancelled')
  })

  it('rejects when PO not found', () => {
    const result = svc.createGrn({
      purchase_order_id: 999,
      received_date: '2026-03-01',
      items: [{ po_item_id: 1, quantity_received: 1, quantity_accepted: 1 }],
    }, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('rejects when accepted > received', () => {
    const { poId, poItemId } = fullPipeline()
    const result = svc.createGrn({
      purchase_order_id: poId,
      received_date: '2026-03-01',
      items: [{ po_item_id: poItemId, quantity_received: 3, quantity_accepted: 5 }],
    }, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('exceed')
  })

  it('rejects when accepted exceeds outstanding ordered quantity', () => {
    const { poId, poItemId } = fullPipeline()
    const result = svc.createGrn({
      purchase_order_id: poId,
      received_date: '2026-03-01',
      items: [{ po_item_id: poItemId, quantity_received: 20, quantity_accepted: 20 }], // ordered 10
    }, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('outstanding')
  })

  it('rejects when PO item not found', () => {
    const { poId } = fullPipeline()
    const result = svc.createGrn({
      purchase_order_id: poId,
      received_date: '2026-03-01',
      items: [{ po_item_id: 9999, quantity_received: 1, quantity_accepted: 1 }],
    }, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('sets GRN status to PARTIALLY_ACCEPTED when some items rejected', () => {
    const { poId, poItemId } = fullPipeline()
    const result = svc.createGrn({
      purchase_order_id: poId,
      received_date: '2026-03-01',
      items: [{ po_item_id: poItemId, quantity_received: 10, quantity_accepted: 8, quantity_rejected: 2, rejection_reason: 'Damaged' }],
    }, 1)
    expect(result.success).toBe(true)
    const grn = db.prepare('SELECT status FROM goods_received_note WHERE id = ?').get(result.id) as { status: string }
    expect(grn.status).toBe('PARTIALLY_ACCEPTED')
  })
})

/* ==================================================================
 *  Payment voucher
 * ================================================================== */
describe('createPaymentVoucher', () => {
  it('creates payment voucher with valid GRN', () => {
    const { poId, grnId } = fullPipelineWithGrn()
    const result = svc.createPaymentVoucher({
      purchase_order_id: poId,
      grn_id: grnId,
      supplier_id: 1,
      amount: 500,
    }, 1)
    expect(result.success).toBe(true)
    expect(result.id).toBeGreaterThan(0)
  })

  it('rejects when PO not found', () => {
    const result = svc.createPaymentVoucher({
      purchase_order_id: 999,
      grn_id: 1,
      supplier_id: 1,
      amount: 500,
    }, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('rejects zero/negative amount', () => {
    const { poId, grnId } = fullPipelineWithGrn()
    const result = svc.createPaymentVoucher({
      purchase_order_id: poId,
      grn_id: grnId,
      supplier_id: 1,
      amount: 0,
    }, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('positive')
  })

  it('rejects when no GRN provided', () => {
    const { poId } = fullPipelineWithGrn()
    const result = svc.createPaymentVoucher({
      purchase_order_id: poId,
      supplier_id: 1,
      amount: 500,
    }, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('GRN is required')
  })

  it('rejects when GRN does not belong to PO', () => {
    const { grnId } = fullPipelineWithGrn()
    // Create a second PO
    const r2 = svc.createRequisition({
      department: 'X', description: 'Other',
      items: [{ description: 'Y', quantity: 1, estimated_unit_cost: 50 }],
    }, 1)
    svc.submitRequisition(r2.id!, 1)
    svc.approveRequisition(r2.id!, 2)
    svc.commitBudget(r2.id!, 1)
    const po2 = svc.createPurchaseOrder({ requisition_id: r2.id!, supplier_id: 1 }, 1)

    const result = svc.createPaymentVoucher({
      purchase_order_id: po2.id!,
      grn_id: grnId,
      supplier_id: 1,
      amount: 50,
    }, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('does not belong')
  })

  it('utilizes budget funds when budget_line_id present', () => {
    const { poId, grnId, reqId } = fullPipelineWithGrn()
    db.prepare('UPDATE purchase_requisition SET budget_line_id = 42 WHERE id = ?').run(reqId)
    const result = svc.createPaymentVoucher({
      purchase_order_id: poId,
      grn_id: grnId,
      supplier_id: 1,
      amount: 300,
    }, 1)
    expect(result.success).toBe(true)
    expect(mockUtilizeFunds).toHaveBeenCalledWith(42, 300)
  })
})

/* ==================================================================
 *  Approve payment voucher
 * ================================================================== */
describe('approvePaymentVoucher', () => {
  it('approves DRAFT voucher', () => {
    const { poId, poItemId } = fullPipeline()
    svc.createGrn({
      purchase_order_id: poId,
      received_date: '2026-03-01',
      items: [{ po_item_id: poItemId, quantity_received: 10, quantity_accepted: 10 }],
    }, 1)
    const grnId = (db.prepare('SELECT id FROM goods_received_note WHERE purchase_order_id = ?').get(poId) as { id: number }).id
    const pv = svc.createPaymentVoucher({
      purchase_order_id: poId, grn_id: grnId, supplier_id: 1, amount: 200,
    }, 1)

    const result = svc.approvePaymentVoucher(pv.id!, 2)
    expect(result.success).toBe(true)
    const voucher = db.prepare('SELECT status FROM payment_voucher WHERE id = ?').get(pv.id) as { status: string }
    expect(voucher.status).toBe('APPROVED')
  })

  it('rejects non-existent voucher', () => {
    expect(svc.approvePaymentVoucher(999, 1).success).toBe(false)
  })

  it('rejects already-APPROVED voucher', () => {
    const { poId, poItemId } = fullPipeline()
    svc.createGrn({
      purchase_order_id: poId, received_date: '2026-03-01',
      items: [{ po_item_id: poItemId, quantity_received: 10, quantity_accepted: 10 }],
    }, 1)
    const grnId = (db.prepare('SELECT id FROM goods_received_note WHERE purchase_order_id = ?').get(poId) as { id: number }).id
    const pv = svc.createPaymentVoucher({
      purchase_order_id: poId, grn_id: grnId, supplier_id: 1, amount: 200,
    }, 1)
    svc.approvePaymentVoucher(pv.id!, 2)
    const result = svc.approvePaymentVoucher(pv.id!, 2) // already approved
    expect(result.success).toBe(false)
    expect(result.error).toContain('DRAFT or SUBMITTED')
  })
})

/* ==================================================================
 *  Query helpers
 * ================================================================== */
describe('query helpers', () => {
  it('getRequisitionsByStatus returns filtered list', () => {
    svc.createRequisition({
      department: 'Admin', description: 'R1', items: [{ description: 'X', quantity: 1, estimated_unit_cost: 100 }],
    }, 1)
    svc.createRequisition({
      department: 'Admin', description: 'R2', items: [{ description: 'Y', quantity: 1, estimated_unit_cost: 200 }],
    }, 1)
    const drafts = svc.getRequisitionsByStatus('DRAFT')
    expect(drafts.length).toBe(2)
    expect(drafts.every(r => r.status === 'DRAFT')).toBe(true)
  })

  it('getPoSummary returns undefined for non-existent PO', () => {
    expect(svc.getPoSummary(999)).toBeUndefined()
  })

  it('getPoSummary returns items with outstanding calculation', () => {
    const { poId, poItemId } = fullPipeline()
    // Receive 3 of 10
    svc.createGrn({
      purchase_order_id: poId, received_date: '2026-03-01',
      items: [{ po_item_id: poItemId, quantity_received: 3, quantity_accepted: 3 }],
    }, 1)

    const summary = svc.getPoSummary(poId)!
    expect(summary.po.id).toBe(poId)
    expect(summary.items[0].outstanding).toBe(7)
    expect(summary.latest_grn).not.toBeNull()
  })

  it('getPurchaseOrderByRequisition returns PO for valid requisition', () => {
    const { reqId, poId } = fullPipeline()
    const po = svc.getPurchaseOrderByRequisition(reqId)
    expect(po).toBeDefined()
    expect(po!.id).toBe(poId)
  })
})

/* ==================================================================
 *  Branch coverage: capital asset provisioning
 * ================================================================== */
describe('createGrn - capital asset provisioning', () => {
  it('provisions fixed assets for capital items on GRN acceptance', () => {
    const reqResult = svc.createRequisition({
      department: 'ICT',
      description: 'Computers',
      items: [{ description: 'Laptop', quantity: 2, estimated_unit_cost: 50000, is_capital_asset: true, asset_category_id: 1 }],
    }, 1)
    const reqId = reqResult.id!
    // Mark item as capital asset in DB (createRequisition inserts it)
    const riId = (db.prepare('SELECT id FROM requisition_item WHERE requisition_id = ?').get(reqId) as { id: number }).id
    db.prepare('UPDATE requisition_item SET is_capital_asset = 1, asset_category_id = 1 WHERE id = ?').run(riId)

    svc.submitRequisition(reqId, 1)
    svc.approveRequisition(reqId, 2)
    svc.commitBudget(reqId, 1)
    const poResult = svc.createPurchaseOrder({ requisition_id: reqId, supplier_id: 1 }, 1)
    const poId = poResult.id!
    const poItemId = (db.prepare('SELECT id FROM purchase_order_item WHERE purchase_order_id = ?').get(poId) as { id: number }).id

    const result = svc.createGrn({
      purchase_order_id: poId,
      received_date: '2026-03-01',
      items: [{ po_item_id: poItemId, quantity_received: 2, quantity_accepted: 2 }],
    }, 1)
    expect(result.success).toBe(true)
    // createSync should be called twice (once per accepted unit)
    expect(mockCreateSync).toHaveBeenCalledTimes(2)
  })

  it('skips asset provisioning for non-capital items', () => {
    mockCreateSync.mockClear()
    const { poId, poItemId } = fullPipeline()
    const result = svc.createGrn({
      purchase_order_id: poId,
      received_date: '2026-03-01',
      items: [{ po_item_id: poItemId, quantity_received: 10, quantity_accepted: 10 }],
    }, 1)
    expect(result.success).toBe(true)
    expect(mockCreateSync).not.toHaveBeenCalled()
  })

  it('throws when fixed asset provisioning fails', () => {
    mockCreateSync.mockReturnValueOnce({ success: false, errors: ['DB error'] })
    const reqResult = svc.createRequisition({
      department: 'ICT',
      description: 'Printers',
      items: [{ description: 'Printer', quantity: 1, estimated_unit_cost: 20000, is_capital_asset: true, asset_category_id: 2 }],
    }, 1)
    const reqId = reqResult.id!
    const riId = (db.prepare('SELECT id FROM requisition_item WHERE requisition_id = ?').get(reqId) as { id: number }).id
    db.prepare('UPDATE requisition_item SET is_capital_asset = 1, asset_category_id = 2 WHERE id = ?').run(riId)
    svc.submitRequisition(reqId, 1)
    svc.approveRequisition(reqId, 2)
    svc.commitBudget(reqId, 1)
    const poResult = svc.createPurchaseOrder({ requisition_id: reqId, supplier_id: 1 }, 1)
    const poId = poResult.id!
    const poItemId = (db.prepare('SELECT id FROM purchase_order_item WHERE purchase_order_id = ?').get(poId) as { id: number }).id

    expect(() => svc.createGrn({
      purchase_order_id: poId,
      received_date: '2026-03-01',
      items: [{ po_item_id: poItemId, quantity_received: 1, quantity_accepted: 1 }],
    }, 1)).toThrow('Fixed asset provisioning failed')
  })
})

/* ==================================================================
 *  Branch coverage: payment voucher GRN status validation
 * ================================================================== */
describe('createPaymentVoucher - GRN status validation', () => {
  it('rejects voucher when GRN status is REJECTED', () => {
    const { poId, grnId } = fullPipelineWithGrn()
    db.prepare("UPDATE goods_received_note SET status = 'REJECTED' WHERE id = ?").run(grnId)
    const result = svc.createPaymentVoucher({
      purchase_order_id: poId,
      grn_id: grnId,
      supplier_id: 1,
      amount: 500,
    }, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('must be accepted')
  })

  it('rejects voucher when GRN status is PENDING_INSPECTION', () => {
    const { poId, grnId } = fullPipelineWithGrn()
    db.prepare("UPDATE goods_received_note SET status = 'PENDING_INSPECTION' WHERE id = ?").run(grnId)
    const result = svc.createPaymentVoucher({
      purchase_order_id: poId,
      grn_id: grnId,
      supplier_id: 1,
      amount: 500,
    }, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('must be accepted')
  })
})

/* ==================================================================
 *  Branch coverage: budget operation failures
 * ================================================================== */
describe('budget operation failures', () => {
  it('commitBudget fails when BudgetService.commitFunds returns failure', () => {
    mockCommitFunds.mockReturnValueOnce({ success: false, error: 'Insufficient budget' })
    const r = svc.createRequisition({
      department: 'Admin', description: 'Budget fail test',
      items: [{ description: 'Item', quantity: 1, estimated_unit_cost: 1000 }],
    }, 1)
    db.prepare('UPDATE purchase_requisition SET budget_line_id = 99 WHERE id = ?').run(r.id)
    svc.submitRequisition(r.id!, 1)
    svc.approveRequisition(r.id!, 2)
    expect(() => svc.commitBudget(r.id!, 1)).toThrow('Insufficient budget')
  })

  it('createPaymentVoucher fails when utilizeFunds returns failure', () => {
    mockUtilizeFunds.mockReturnValueOnce({ success: false, error: 'Over budget limit' })
    const { poId, poItemId, reqId } = fullPipeline()
    const grnResult = svc.createGrn({
      purchase_order_id: poId, received_date: '2026-03-01',
      items: [{ po_item_id: poItemId, quantity_received: 10, quantity_accepted: 10 }],
    }, 1)
    db.prepare('UPDATE purchase_requisition SET budget_line_id = 42 WHERE id = ?').run(reqId)
    expect(() => svc.createPaymentVoucher({
      purchase_order_id: poId,
      grn_id: grnResult.id!,
      supplier_id: 1,
      amount: 500,
    }, 1)).toThrow('Over budget limit')
  })
})

/* ==================================================================
 *  Branch coverage: utilizeFunds empty error fallback (L498)
 * ================================================================== */
describe('branch coverage: utilizeFunds empty error fallback', () => {
  it('throws default message when utilizeFunds returns failure without error field', () => {
    mockUtilizeFunds.mockReturnValueOnce({ success: false })
    const { poId, poItemId, reqId } = fullPipeline()
    const grnResult = svc.createGrn({
      purchase_order_id: poId, received_date: '2026-03-01',
      items: [{ po_item_id: poItemId, quantity_received: 10, quantity_accepted: 10 }],
    }, 1)
    db.prepare('UPDATE purchase_requisition SET budget_line_id = 42 WHERE id = ?').run(reqId)
    expect(() => svc.createPaymentVoucher({
      purchase_order_id: poId,
      grn_id: grnResult.id!,
      supplier_id: 1,
      amount: 500,
    }, 1)).toThrow('Failed to utilize budget funds')
  })
})

/* ==================================================================
 *  Branch coverage: voucher with payment_method and payment_reference (L481-483)
 * ================================================================== */
describe('branch coverage: voucher optional fields', () => {
  it('passes payment_method and payment_reference to insert', () => {
    const { poId, poItemId } = fullPipeline()
    const grnResult = svc.createGrn({
      purchase_order_id: poId, received_date: '2026-03-01',
      items: [{ po_item_id: poItemId, quantity_received: 10, quantity_accepted: 10 }],
    }, 1)
    const result = svc.createPaymentVoucher({
      purchase_order_id: poId, grn_id: grnResult.id!, supplier_id: 1, amount: 200,
      payment_method: 'CHEQUE', payment_reference: 'CHK-123',
    }, 1)
    expect(result.success).toBe(true)
    const voucher = db.prepare('SELECT payment_method, payment_reference FROM payment_voucher WHERE id = ?').get(result.id) as any
    expect(voucher.payment_method).toBe('CHEQUE')
    expect(voucher.payment_reference).toBe('CHK-123')
  })
})

/* ==================================================================
 *  Branch coverage: approveRequisition wrong status (L539)
 * ================================================================== */
describe('branch coverage: approveRequisition wrong status', () => {
  it('rejects approval of DRAFT requisition (not SUBMITTED)', () => {
    const r = svc.createRequisition({
      department: 'Admin', description: 'Not submitted yet',
      items: [{ description: 'Item', quantity: 1, estimated_unit_cost: 100 }],
    }, 1)
    const result = svc.approveRequisition(r.id!, 2)
    expect(result.success).toBe(false)
    expect(result.error).toContain('SUBMITTED')
  })
})
