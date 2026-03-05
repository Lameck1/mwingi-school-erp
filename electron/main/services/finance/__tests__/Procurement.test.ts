import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../database', () => ({
  getDatabase: () => { throw new Error('Must inject db') }
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

import { ProcurementService } from '../ProcurementService'

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL, role TEXT NOT NULL
    );

    CREATE TABLE supplier (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_name TEXT NOT NULL, contact_name TEXT, phone TEXT, email TEXT,
      address TEXT, is_active BOOLEAN DEFAULT 1
    );

    CREATE TABLE inventory_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_name TEXT NOT NULL, item_code TEXT, category TEXT,
      quantity_on_hand INTEGER DEFAULT 0
    );

    CREATE TABLE purchase_requisition (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requisition_number TEXT NOT NULL UNIQUE,
      requested_by_user_id INTEGER NOT NULL,
      department TEXT NOT NULL, description TEXT NOT NULL,
      justification TEXT, total_amount INTEGER NOT NULL CHECK (total_amount > 0),
      status TEXT NOT NULL DEFAULT 'DRAFT',
      jss_account_type TEXT,
      budget_line_id INTEGER,
      approved_by_user_id INTEGER, approved_at DATETIME,
      rejection_reason TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (requested_by_user_id) REFERENCES user(id)
    );

    CREATE TABLE requisition_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requisition_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL, unit_of_measure TEXT NOT NULL DEFAULT 'pcs',
      estimated_unit_cost INTEGER NOT NULL, total_cost INTEGER NOT NULL,
      inventory_item_id INTEGER,
      FOREIGN KEY (requisition_id) REFERENCES purchase_requisition(id) ON DELETE CASCADE
    );

    CREATE TABLE budget_commitment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requisition_id INTEGER NOT NULL UNIQUE,
      budget_line_id INTEGER,
      committed_amount INTEGER NOT NULL,
      utilized_amount INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      committed_by_user_id INTEGER NOT NULL,
      committed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE purchase_order (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_number TEXT NOT NULL UNIQUE,
      requisition_id INTEGER NOT NULL,
      supplier_id INTEGER NOT NULL,
      order_date DATE NOT NULL,
      expected_delivery_date DATE,
      total_amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'ISSUED',
      notes TEXT,
      issued_by_user_id INTEGER NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE purchase_order_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_order_id INTEGER NOT NULL,
      requisition_item_id INTEGER,
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL, unit_of_measure TEXT NOT NULL DEFAULT 'pcs',
      unit_cost INTEGER NOT NULL, total_cost INTEGER NOT NULL,
      received_quantity INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_order(id) ON DELETE CASCADE
    );

    CREATE TABLE goods_received_note (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grn_number TEXT NOT NULL UNIQUE,
      purchase_order_id INTEGER NOT NULL,
      received_date DATE NOT NULL,
      received_by_user_id INTEGER NOT NULL,
      inspected_by TEXT, inspection_notes TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING_INSPECTION',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE grn_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grn_id INTEGER NOT NULL,
      po_item_id INTEGER NOT NULL,
      quantity_received INTEGER NOT NULL,
      quantity_accepted INTEGER NOT NULL DEFAULT 0,
      quantity_rejected INTEGER NOT NULL DEFAULT 0,
      rejection_reason TEXT,
      FOREIGN KEY (grn_id) REFERENCES goods_received_note(id) ON DELETE CASCADE
    );

    CREATE TABLE payment_voucher (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voucher_number TEXT NOT NULL UNIQUE,
      purchase_order_id INTEGER NOT NULL,
      grn_id INTEGER, supplier_id INTEGER NOT NULL,
      amount INTEGER NOT NULL CHECK (amount > 0),
      payment_method TEXT, payment_reference TEXT,
      payment_date DATE,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      prepared_by_user_id INTEGER NOT NULL,
      approved_by_user_id INTEGER,
      approved_at DATETIME,
      journal_entry_id INTEGER,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER, action_type TEXT, table_name TEXT,
      record_id INTEGER, old_values TEXT, new_values TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  db.exec(`
    INSERT INTO user (username, password_hash, full_name, role) VALUES ('clerk', 'h', 'Clerk', 'ACCOUNTS_CLERK');
    INSERT INTO user (username, password_hash, full_name, role) VALUES ('principal', 'h', 'Principal', 'PRINCIPAL');
    INSERT INTO supplier (supplier_name, contact_name, phone) VALUES ('ABC Supplies', 'John', '0712345678');
  `)

  return db
}

describe('ProcurementService', () => {
  let db: Database.Database
  let service: ProcurementService

  beforeEach(() => {
    db = createTestDb()
    service = new ProcurementService(db)
  })

  afterEach(() => {
    db.close()
  })

  it('creates a requisition with line items', () => {
    const result = service.createRequisition({
      department: 'Science',
      description: 'Lab chemicals restock',
      jss_account_type: 'OPERATIONS',
      items: [
        { description: 'Sodium Chloride 500g', quantity: 10, estimated_unit_cost: 500 },
        { description: 'Beakers 250ml', quantity: 5, estimated_unit_cost: 1200 },
      ]
    }, 1)

    expect(result.success).toBe(true)
    const req = service.getRequisition(result.id as number)
    expect(req?.total_amount).toBe(10 * 500 + 5 * 1200) // 11,000
    expect(req?.status).toBe('DRAFT')
    expect(req?.jss_account_type).toBe('OPERATIONS')
  })

  it('enforces full lifecycle: Draft → Submit → Approve → Commit → PO', () => {
    const { id: reqId } = service.createRequisition({
      department: 'Admin',
      description: 'Office supplies',
      items: [{ description: 'Paper A4', quantity: 20, estimated_unit_cost: 600 }]
    }, 1) as { id: number }

    expect(service.submitRequisition(reqId, 1).success).toBe(true)
    expect(service.getRequisition(reqId)?.status).toBe('SUBMITTED')

    expect(service.approveRequisition(reqId, 2).success).toBe(true)
    expect(service.getRequisition(reqId)?.status).toBe('APPROVED')

    expect(service.commitBudget(reqId, 2).success).toBe(true)
    expect(service.getRequisition(reqId)?.status).toBe('COMMITTED')
    expect(service.getCommitment(reqId)?.committed_amount).toBe(12000)

    const poResult = service.createPurchaseOrder({ requisition_id: reqId, supplier_id: 1 }, 1)
    expect(poResult.success).toBe(true)
    expect(service.getPurchaseOrder(poResult.id as number)?.status).toBe('ISSUED')
  })

  it('blocks PO creation without prior budget commitment', () => {
    const { id: reqId } = service.createRequisition({
      department: 'Admin',
      description: 'Test',
      items: [{ description: 'Item', quantity: 1, estimated_unit_cost: 100 }]
    }, 1) as { id: number }

    service.submitRequisition(reqId, 1)
    service.approveRequisition(reqId, 2)
    // Skip commitment

    const poResult = service.createPurchaseOrder({ requisition_id: reqId, supplier_id: 1 }, 1)
    expect(poResult.success).toBe(false)
    expect(poResult.error).toContain('COMMITTED')
  })

  it('processes GRN and updates PO status', () => {
    // Full setup: Req → Submit → Approve → Commit → PO
    const { id: reqId } = service.createRequisition({
      department: 'Kitchen',
      description: 'Foodstuffs',
      items: [{ description: 'Rice 50kg', quantity: 10, estimated_unit_cost: 5000 }]
    }, 1) as { id: number }
    service.submitRequisition(reqId, 1)
    service.approveRequisition(reqId, 2)
    service.commitBudget(reqId, 2)
    const { id: poId } = service.createPurchaseOrder({ requisition_id: reqId, supplier_id: 1 }, 1) as { id: number }

    // Get the PO item
    const poItems = db.prepare('SELECT id, quantity FROM purchase_order_item WHERE purchase_order_id = ?').all(poId) as Array<{ id: number; quantity: number }>

    // Receive all goods
    const grnResult = service.createGrn({
      purchase_order_id: poId,
      received_date: '2026-02-25',
      items: [{ po_item_id: poItems[0]!.id, quantity_received: 10, quantity_accepted: 10 }]
    }, 1)

    expect(grnResult.success).toBe(true)
    expect(service.getPurchaseOrder(poId)?.status).toBe('FULLY_RECEIVED')
  })

  it('creates and approves payment voucher', () => {
    const { id: reqId } = service.createRequisition({
      department: 'Admin',
      description: 'Stationery',
      items: [{ description: 'Pens', quantity: 100, estimated_unit_cost: 20 }]
    }, 1) as { id: number }
    service.submitRequisition(reqId, 1)
    service.approveRequisition(reqId, 2)
    service.commitBudget(reqId, 2)
    const { id: poId } = service.createPurchaseOrder({ requisition_id: reqId, supplier_id: 1 }, 1) as { id: number }

    const poItems = db.prepare('SELECT id, quantity FROM purchase_order_item WHERE purchase_order_id = ?').all(poId) as Array<{ id: number; quantity: number }>

    const grnResult = service.createGrn({
      purchase_order_id: poId,
      received_date: '2026-02-25',
      items: [{ po_item_id: poItems[0]!.id, quantity_received: 100, quantity_accepted: 100 }]
    }, 1)

    const voucherResult = service.createPaymentVoucher({
      purchase_order_id: poId, supplier_id: 1, amount: 2000,
      payment_method: 'BANK_TRANSFER', grn_id: grnResult.id as number
    }, 1)
    expect(voucherResult.success).toBe(true)

    const approveResult = service.approvePaymentVoucher(voucherResult.id as number, 2)
    expect(approveResult.success).toBe(true)
  })

  it('rejects requisition with reason', () => {
    const { id: reqId } = service.createRequisition({
      department: 'Sports',
      description: 'Balls',
      items: [{ description: 'Footballs', quantity: 5, estimated_unit_cost: 3000 }]
    }, 1) as { id: number }

    service.submitRequisition(reqId, 1)
    const rejectResult = service.rejectRequisition(reqId, 'Budget constraints', 2)
    expect(rejectResult.success).toBe(true)
    expect(service.getRequisition(reqId)?.status).toBe('REJECTED')
  })

  it('rejects requisition with empty items', () => {
    const result = service.createRequisition({
      department: 'Admin',
      description: 'No items',
      items: []
    }, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('At least one item')
  })

  it('returns undefined for non-existent requisition', () => {
    expect(service.getRequisition(9999)).toBeUndefined()
  })

  it('getRequisitionsByStatus returns matching requisitions', () => {
    service.createRequisition({
      department: 'Admin', description: 'A',
      items: [{ description: 'X', quantity: 1, estimated_unit_cost: 100 }]
    }, 1)
    service.createRequisition({
      department: 'Admin', description: 'B',
      items: [{ description: 'Y', quantity: 1, estimated_unit_cost: 200 }]
    }, 1)
    const drafts = service.getRequisitionsByStatus('DRAFT')
    expect(drafts.length).toBe(2)
  })

  it('rejectRequisition fails for non-SUBMITTED requisition', () => {
    const { id: reqId } = service.createRequisition({
      department: 'Admin', description: 'A',
      items: [{ description: 'X', quantity: 1, estimated_unit_cost: 100 }]
    }, 1) as { id: number }
    const result = service.rejectRequisition(reqId, 'reason', 2)
    expect(result.success).toBe(false)
    expect(result.error).toContain('SUBMITTED')
  })

  it('rejectRequisition fails for non-existent requisition', () => {
    const result = service.rejectRequisition(999, 'reason', 2)
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('commitBudget fails for non-existent requisition', () => {
    const result = service.commitBudget(999, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('commitBudget fails for non-APPROVED requisition', () => {
    const { id: reqId } = service.createRequisition({
      department: 'Admin', description: 'A',
      items: [{ description: 'X', quantity: 1, estimated_unit_cost: 100 }]
    }, 1) as { id: number }
    const result = service.commitBudget(reqId, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('APPROVED')
  })

  it('commitBudget fails if already committed', () => {
    const { id: reqId } = service.createRequisition({
      department: 'Admin', description: 'A',
      items: [{ description: 'X', quantity: 1, estimated_unit_cost: 100 }]
    }, 1) as { id: number }
    service.submitRequisition(reqId, 1)
    service.approveRequisition(reqId, 2)
    service.commitBudget(reqId, 2)
    const result = service.commitBudget(reqId, 2)
    expect(result.success).toBe(false)
    expect(result.error).toContain('APPROVED')
  })

  it('createPurchaseOrder fails for non-existent requisition', () => {
    const result = service.createPurchaseOrder({ requisition_id: 9999, supplier_id: 1 }, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('getPurchaseOrder returns undefined for non-existent PO', () => {
    expect(service.getPurchaseOrder(9999)).toBeUndefined()
  })

  it('getPurchaseOrderByRequisition returns PO for valid requisition', () => {
    const { id: reqId } = service.createRequisition({
      department: 'Admin', description: 'Office',
      items: [{ description: 'Paper', quantity: 10, estimated_unit_cost: 500 }]
    }, 1) as { id: number }
    service.submitRequisition(reqId, 1)
    service.approveRequisition(reqId, 2)
    service.commitBudget(reqId, 2)
    const { id: poId } = service.createPurchaseOrder({ requisition_id: reqId, supplier_id: 1 }, 1) as { id: number }
    const po = service.getPurchaseOrderByRequisition(reqId)
    expect(po).toBeDefined()
    expect(po!.id).toBe(poId)
  })

  it('getPoSummary returns PO with items and outstanding quantities', () => {
    const { id: reqId } = service.createRequisition({
      department: 'Admin', description: 'Items',
      items: [{ description: 'Pens', quantity: 50, estimated_unit_cost: 20 }]
    }, 1) as { id: number }
    service.submitRequisition(reqId, 1)
    service.approveRequisition(reqId, 2)
    service.commitBudget(reqId, 2)
    const { id: poId } = service.createPurchaseOrder({ requisition_id: reqId, supplier_id: 1 }, 1) as { id: number }
    const summary = service.getPoSummary(poId)
    expect(summary).toBeDefined()
    expect(summary!.po.id).toBe(poId)
    expect(summary!.items.length).toBe(1)
    expect(summary!.items[0].outstanding).toBe(50)
  })

  it('getPoSummary returns undefined for non-existent PO', () => {
    expect(service.getPoSummary(9999)).toBeUndefined()
  })

  it('createGrn rejects for cancelled PO', () => {
    const { id: reqId } = service.createRequisition({
      department: 'Admin', description: 'C',
      items: [{ description: 'X', quantity: 1, estimated_unit_cost: 100 }]
    }, 1) as { id: number }
    service.submitRequisition(reqId, 1)
    service.approveRequisition(reqId, 2)
    service.commitBudget(reqId, 2)
    const { id: poId } = service.createPurchaseOrder({ requisition_id: reqId, supplier_id: 1 }, 1) as { id: number }
    db.prepare("UPDATE purchase_order SET status = 'CANCELLED' WHERE id = ?").run(poId)
    const result = service.createGrn({ purchase_order_id: poId, received_date: '2026-03-01', items: [] }, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('cancelled')
  })

  it('createGrn rejects for non-existent PO', () => {
    const result = service.createGrn({ purchase_order_id: 9999, received_date: '2026-03-01', items: [] }, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('createGrn rejects when accepted quantity exceeds received', () => {
    const { id: reqId } = service.createRequisition({
      department: 'Admin', description: 'D',
      items: [{ description: 'X', quantity: 10, estimated_unit_cost: 100 }]
    }, 1) as { id: number }
    service.submitRequisition(reqId, 1)
    service.approveRequisition(reqId, 2)
    service.commitBudget(reqId, 2)
    const { id: poId } = service.createPurchaseOrder({ requisition_id: reqId, supplier_id: 1 }, 1) as { id: number }
    const poItems = db.prepare('SELECT id FROM purchase_order_item WHERE purchase_order_id = ?').all(poId) as Array<{ id: number }>
    const result = service.createGrn({
      purchase_order_id: poId, received_date: '2026-03-01',
      items: [{ po_item_id: poItems[0]!.id, quantity_received: 3, quantity_accepted: 5 }]
    }, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('exceed')
  })

  it('createGrn with partially rejected items sets PARTIALLY_ACCEPTED status', () => {
    const { id: reqId } = service.createRequisition({
      department: 'Store', description: 'Mixed',
      items: [{ description: 'Bulbs', quantity: 20, estimated_unit_cost: 150 }]
    }, 1) as { id: number }
    service.submitRequisition(reqId, 1)
    service.approveRequisition(reqId, 2)
    service.commitBudget(reqId, 2)
    const { id: poId } = service.createPurchaseOrder({ requisition_id: reqId, supplier_id: 1 }, 1) as { id: number }
    const poItems = db.prepare('SELECT id FROM purchase_order_item WHERE purchase_order_id = ?').all(poId) as Array<{ id: number }>
    const grnResult = service.createGrn({
      purchase_order_id: poId, received_date: '2026-03-01',
      items: [{ po_item_id: poItems[0]!.id, quantity_received: 20, quantity_accepted: 15, quantity_rejected: 5, rejection_reason: 'Broken' }]
    }, 1)
    expect(grnResult.success).toBe(true)
    const grn = db.prepare('SELECT status FROM goods_received_note WHERE id = ?').get(grnResult.id!) as { status: string }
    expect(grn.status).toBe('PARTIALLY_ACCEPTED')
  })

  it('createPaymentVoucher rejects zero/negative amount', () => {
    const { id: reqId } = service.createRequisition({
      department: 'Admin', description: 'Zero',
      items: [{ description: 'X', quantity: 1, estimated_unit_cost: 100 }]
    }, 1) as { id: number }
    service.submitRequisition(reqId, 1)
    service.approveRequisition(reqId, 2)
    service.commitBudget(reqId, 2)
    const { id: poId } = service.createPurchaseOrder({ requisition_id: reqId, supplier_id: 1 }, 1) as { id: number }
    const result = service.createPaymentVoucher({
      purchase_order_id: poId, supplier_id: 1, amount: 0
    }, 1)
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('createPaymentVoucher requires GRN', () => {
    const { id: reqId } = service.createRequisition({
      department: 'Admin', description: 'V',
      items: [{ description: 'X', quantity: 1, estimated_unit_cost: 100 }]
    }, 1) as { id: number }
    service.submitRequisition(reqId, 1)
    service.approveRequisition(reqId, 2)
    service.commitBudget(reqId, 2)
    const { id: poId } = service.createPurchaseOrder({ requisition_id: reqId, supplier_id: 1 }, 1) as { id: number }
    const result = service.createPaymentVoucher({
      purchase_order_id: poId, supplier_id: 1, amount: 100
    }, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('GRN is required')
  })

  it('createPaymentVoucher rejects GRN not belonging to PO', () => {
    const { id: reqId } = service.createRequisition({
      department: 'Admin', description: 'V',
      items: [{ description: 'X', quantity: 10, estimated_unit_cost: 100 }]
    }, 1) as { id: number }
    service.submitRequisition(reqId, 1)
    service.approveRequisition(reqId, 2)
    service.commitBudget(reqId, 2)
    const { id: poId } = service.createPurchaseOrder({ requisition_id: reqId, supplier_id: 1 }, 1) as { id: number }
    const poItems = db.prepare('SELECT id FROM purchase_order_item WHERE purchase_order_id = ?').all(poId) as Array<{ id: number }>
    const grn = service.createGrn({
      purchase_order_id: poId, received_date: '2026-03-01',
      items: [{ po_item_id: poItems[0]!.id, quantity_received: 10, quantity_accepted: 10 }]
    }, 1)
    // Create a second PO to test cross-PO validation
    const { id: reqId2 } = service.createRequisition({
      department: 'Admin', description: 'V2',
      items: [{ description: 'Y', quantity: 5, estimated_unit_cost: 200 }]
    }, 1) as { id: number }
    service.submitRequisition(reqId2, 1)
    service.approveRequisition(reqId2, 2)
    service.commitBudget(reqId2, 2)
    const { id: poId2 } = service.createPurchaseOrder({ requisition_id: reqId2, supplier_id: 1 }, 1) as { id: number }
    const result = service.createPaymentVoucher({
      purchase_order_id: poId2, supplier_id: 1, amount: 100, grn_id: grn.id as number
    }, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('does not belong')
  })

  it('approvePaymentVoucher rejects non-existent voucher', () => {
    const result = service.approvePaymentVoucher(9999, 2)
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('approvePaymentVoucher rejects already approved voucher', () => {
    const { id: reqId } = service.createRequisition({
      department: 'Admin', description: 'AV',
      items: [{ description: 'Pens', quantity: 10, estimated_unit_cost: 20 }]
    }, 1) as { id: number }
    service.submitRequisition(reqId, 1)
    service.approveRequisition(reqId, 2)
    service.commitBudget(reqId, 2)
    const { id: poId } = service.createPurchaseOrder({ requisition_id: reqId, supplier_id: 1 }, 1) as { id: number }
    const poItems = db.prepare('SELECT id FROM purchase_order_item WHERE purchase_order_id = ?').all(poId) as Array<{ id: number }>
    const grn = service.createGrn({
      purchase_order_id: poId, received_date: '2026-03-01',
      items: [{ po_item_id: poItems[0]!.id, quantity_received: 10, quantity_accepted: 10 }]
    }, 1)
    const v = service.createPaymentVoucher({
      purchase_order_id: poId, supplier_id: 1, amount: 200, grn_id: grn.id as number
    }, 1)
    service.approvePaymentVoucher(v.id as number, 2)
    const result = service.approvePaymentVoucher(v.id as number, 2)
    expect(result.success).toBe(false)
    expect(result.error).toContain('DRAFT or SUBMITTED')
  })

  it('submitRequisition fails for non-DRAFT requisition', () => {
    const { id: reqId } = service.createRequisition({
      department: 'Admin', description: 'S',
      items: [{ description: 'X', quantity: 1, estimated_unit_cost: 100 }]
    }, 1) as { id: number }
    service.submitRequisition(reqId, 1)
    const result = service.submitRequisition(reqId, 1)
    expect(result.success).toBe(false)
  })

  it('getCommitment returns undefined for non-committed requisition', () => {
    expect(service.getCommitment(9999)).toBeUndefined()
  })

  // ─── Additional branch coverage ────────────────────────────────────

  it('createGrn with partial receipt sets PARTIALLY_RECEIVED status', () => {
    const { id: reqId } = service.createRequisition({
      department: 'IT', description: 'Computers',
      items: [
        { description: 'Laptop', quantity: 10, estimated_unit_cost: 50000 },
        { description: 'Mouse', quantity: 20, estimated_unit_cost: 500 }
      ]
    }, 1) as { id: number }
    service.submitRequisition(reqId, 1)
    service.approveRequisition(reqId, 2)
    service.commitBudget(reqId, 2)
    const { id: poId } = service.createPurchaseOrder({ requisition_id: reqId, supplier_id: 1 }, 1) as { id: number }
    const poItems = db.prepare('SELECT id, quantity FROM purchase_order_item WHERE purchase_order_id = ? ORDER BY id').all(poId) as Array<{ id: number; quantity: number }>
    // Only receive partial qty of first item
    const grnResult = service.createGrn({
      purchase_order_id: poId, received_date: '2026-04-01',
      items: [{ po_item_id: poItems[0].id, quantity_received: 5, quantity_accepted: 5 }]
    }, 1)
    expect(grnResult.success).toBe(true)
    expect(service.getPurchaseOrder(poId)?.status).toBe('PARTIALLY_RECEIVED')
  })

  it('createGrn with rejection_reason populates grn_item', () => {
    const { id: reqId } = service.createRequisition({
      department: 'Store', description: 'Supplies',
      items: [{ description: 'Pens', quantity: 100, estimated_unit_cost: 20 }]
    }, 1) as { id: number }
    service.submitRequisition(reqId, 1)
    service.approveRequisition(reqId, 2)
    service.commitBudget(reqId, 2)
    const { id: poId } = service.createPurchaseOrder({ requisition_id: reqId, supplier_id: 1 }, 1) as { id: number }
    const poItems = db.prepare('SELECT id FROM purchase_order_item WHERE purchase_order_id = ?').all(poId) as Array<{ id: number }>
    const grnResult = service.createGrn({
      purchase_order_id: poId, received_date: '2026-04-01',
      items: [{
        po_item_id: poItems[0].id, quantity_received: 100, quantity_accepted: 80,
        quantity_rejected: 20, rejection_reason: 'Damaged'
      }]
    }, 1)
    expect(grnResult.success).toBe(true)
    const grnItems = db.prepare('SELECT * FROM grn_item WHERE grn_id = ?').all(grnResult.id) as any[]
    expect(grnItems[0].rejection_reason).toBe('Damaged')
    expect(grnItems[0].quantity_rejected).toBe(20)
  })

  it('createPaymentVoucher rejects zero or negative amount', () => {
    const { id: reqId } = service.createRequisition({
      department: 'Admin', description: 'Misc',
      items: [{ description: 'Item', quantity: 1, estimated_unit_cost: 100 }]
    }, 1) as { id: number }
    service.submitRequisition(reqId, 1)
    service.approveRequisition(reqId, 2)
    service.commitBudget(reqId, 2)
    const { id: poId } = service.createPurchaseOrder({ requisition_id: reqId, supplier_id: 1 }, 1) as { id: number }
    const poItems = db.prepare('SELECT id FROM purchase_order_item WHERE purchase_order_id = ?').all(poId) as Array<{ id: number }>
    const grn = service.createGrn({
      purchase_order_id: poId, received_date: '2026-04-01',
      items: [{ po_item_id: poItems[0].id, quantity_received: 1, quantity_accepted: 1 }]
    }, 1)
    const result = service.createPaymentVoucher({
      purchase_order_id: poId, supplier_id: 1, amount: 0, grn_id: grn.id as number
    }, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('positive')
  })

  it('createPaymentVoucher rejects without grn_id', () => {
    const { id: reqId } = service.createRequisition({
      department: 'Admin', description: 'No GRN',
      items: [{ description: 'Item', quantity: 1, estimated_unit_cost: 100 }]
    }, 1) as { id: number }
    service.submitRequisition(reqId, 1)
    service.approveRequisition(reqId, 2)
    service.commitBudget(reqId, 2)
    const { id: poId } = service.createPurchaseOrder({ requisition_id: reqId, supplier_id: 1 }, 1) as { id: number }
    const result = service.createPaymentVoucher({
      purchase_order_id: poId, supplier_id: 1, amount: 100, grn_id: 0
    }, 1)
    expect(result.success).toBe(false)
    expect(result.error).toContain('GRN')
  })

  it('rejectRequisition fails for non-SUBMITTED requisition', () => {
    const { id: reqId } = service.createRequisition({
      department: 'Admin', description: 'Reject test',
      items: [{ description: 'Item', quantity: 1, estimated_unit_cost: 100 }]
    }, 1) as { id: number }
    // Still in DRAFT, cannot reject
    const result = service.rejectRequisition(reqId, 2, 'Not needed')
    expect(result.success).toBe(false)
  })
})
