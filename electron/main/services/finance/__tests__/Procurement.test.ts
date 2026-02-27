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
})
