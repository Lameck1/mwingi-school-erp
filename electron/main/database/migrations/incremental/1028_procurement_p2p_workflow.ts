import type Database from 'better-sqlite3'

/**
 * Migration 1028: Procurement / Procure-to-Pay (P2P) Workflow
 *
 * Implements the full P2P chain:
 *   Requisition → Commitment → LPO → GRN → Payment Voucher
 *
 * Budget enforcement is integrated via the existing BudgetEnforcementService
 * with a new commitment stage: Available = Appropriation - Commitments - Actuals.
 */
export function up(db: Database.Database): void {
    // 1. Purchase Requisition
    db.exec(`
    CREATE TABLE IF NOT EXISTS purchase_requisition (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requisition_number TEXT NOT NULL UNIQUE,
      requested_by_user_id INTEGER NOT NULL,
      department TEXT NOT NULL,
      description TEXT NOT NULL,
      justification TEXT,
      total_amount INTEGER NOT NULL CHECK (total_amount > 0),
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'COMMITTED', 'CANCELLED')),
      jss_account_type TEXT CHECK(jss_account_type IN ('TUITION', 'OPERATIONS', 'INFRASTRUCTURE')),
      budget_line_id INTEGER,
      approved_by_user_id INTEGER,
      approved_at DATETIME,
      rejection_reason TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (requested_by_user_id) REFERENCES user(id),
      FOREIGN KEY (approved_by_user_id) REFERENCES user(id)
    );
    CREATE INDEX IF NOT EXISTS idx_requisition_status ON purchase_requisition(status);
  `)

    // 2. Requisition Line Items
    db.exec(`
    CREATE TABLE IF NOT EXISTS requisition_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requisition_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_of_measure TEXT NOT NULL DEFAULT 'pcs',
      estimated_unit_cost INTEGER NOT NULL CHECK (estimated_unit_cost > 0),
      total_cost INTEGER NOT NULL,
      inventory_item_id INTEGER,
      FOREIGN KEY (requisition_id) REFERENCES purchase_requisition(id) ON DELETE CASCADE,
      FOREIGN KEY (inventory_item_id) REFERENCES inventory_item(id)
    );
    CREATE INDEX IF NOT EXISTS idx_requisition_item_req ON requisition_item(requisition_id);
  `)

    // 3. Budget Commitment (encumbrance)
    db.exec(`
    CREATE TABLE IF NOT EXISTS budget_commitment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requisition_id INTEGER NOT NULL UNIQUE,
      budget_line_id INTEGER,
      committed_amount INTEGER NOT NULL CHECK (committed_amount > 0),
      utilized_amount INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'PARTIALLY_UTILIZED', 'FULLY_UTILIZED', 'RELEASED')),
      committed_by_user_id INTEGER NOT NULL,
      committed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (requisition_id) REFERENCES purchase_requisition(id) ON DELETE CASCADE,
      FOREIGN KEY (committed_by_user_id) REFERENCES user(id)
    );
    CREATE INDEX IF NOT EXISTS idx_commitment_status ON budget_commitment(status);
  `)

    // 4. Local Purchase Order (LPO)
    db.exec(`
    CREATE TABLE IF NOT EXISTS purchase_order (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_number TEXT NOT NULL UNIQUE,
      requisition_id INTEGER NOT NULL,
      supplier_id INTEGER NOT NULL,
      order_date DATE NOT NULL,
      expected_delivery_date DATE,
      total_amount INTEGER NOT NULL CHECK (total_amount > 0),
      status TEXT NOT NULL DEFAULT 'ISSUED' CHECK(status IN ('ISSUED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CANCELLED')),
      notes TEXT,
      issued_by_user_id INTEGER NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (requisition_id) REFERENCES purchase_requisition(id),
      FOREIGN KEY (supplier_id) REFERENCES supplier(id),
      FOREIGN KEY (issued_by_user_id) REFERENCES user(id)
    );
    CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_order(status);
    CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_order(supplier_id);
  `)

    // 5. Purchase Order Line Items
    db.exec(`
    CREATE TABLE IF NOT EXISTS purchase_order_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_order_id INTEGER NOT NULL,
      requisition_item_id INTEGER,
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_of_measure TEXT NOT NULL DEFAULT 'pcs',
      unit_cost INTEGER NOT NULL CHECK (unit_cost > 0),
      total_cost INTEGER NOT NULL,
      received_quantity INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_order(id) ON DELETE CASCADE,
      FOREIGN KEY (requisition_item_id) REFERENCES requisition_item(id)
    );
    CREATE INDEX IF NOT EXISTS idx_po_item_po ON purchase_order_item(purchase_order_id);
  `)

    // 6. Goods Received Note (GRN)
    db.exec(`
    CREATE TABLE IF NOT EXISTS goods_received_note (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grn_number TEXT NOT NULL UNIQUE,
      purchase_order_id INTEGER NOT NULL,
      received_date DATE NOT NULL,
      received_by_user_id INTEGER NOT NULL,
      inspected_by TEXT,
      inspection_notes TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING_INSPECTION' CHECK(status IN ('PENDING_INSPECTION', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED')),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_order(id),
      FOREIGN KEY (received_by_user_id) REFERENCES user(id)
    );
    CREATE INDEX IF NOT EXISTS idx_grn_po ON goods_received_note(purchase_order_id);
  `)

    // 7. GRN Line Items
    db.exec(`
    CREATE TABLE IF NOT EXISTS grn_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grn_id INTEGER NOT NULL,
      po_item_id INTEGER NOT NULL,
      quantity_received INTEGER NOT NULL CHECK (quantity_received >= 0),
      quantity_accepted INTEGER NOT NULL DEFAULT 0,
      quantity_rejected INTEGER NOT NULL DEFAULT 0,
      rejection_reason TEXT,
      FOREIGN KEY (grn_id) REFERENCES goods_received_note(id) ON DELETE CASCADE,
      FOREIGN KEY (po_item_id) REFERENCES purchase_order_item(id)
    );
    CREATE INDEX IF NOT EXISTS idx_grn_item_grn ON grn_item(grn_id);
  `)

    // 8. Payment Voucher
    db.exec(`
    CREATE TABLE IF NOT EXISTS payment_voucher (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voucher_number TEXT NOT NULL UNIQUE,
      purchase_order_id INTEGER NOT NULL,
      grn_id INTEGER,
      supplier_id INTEGER NOT NULL,
      amount INTEGER NOT NULL CHECK (amount > 0),
      payment_method TEXT CHECK(payment_method IN ('CASH', 'MPESA', 'BANK_TRANSFER', 'CHEQUE')),
      payment_reference TEXT,
      payment_date DATE,
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'PAID', 'REJECTED')),
      prepared_by_user_id INTEGER NOT NULL,
      approved_by_user_id INTEGER,
      approved_at DATETIME,
      journal_entry_id INTEGER,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_order(id),
      FOREIGN KEY (grn_id) REFERENCES goods_received_note(id),
      FOREIGN KEY (supplier_id) REFERENCES supplier(id),
      FOREIGN KEY (prepared_by_user_id) REFERENCES user(id),
      FOREIGN KEY (approved_by_user_id) REFERENCES user(id),
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entry(id)
    );
    CREATE INDEX IF NOT EXISTS idx_voucher_status ON payment_voucher(status);
    CREATE INDEX IF NOT EXISTS idx_voucher_supplier ON payment_voucher(supplier_id);
  `)
}
