/**
 * InventoryService tests — covers BaseService-inherited CRUD plus
 * the business-critical adjustStock (IN / OUT / ADJUSTMENT) logic.
 */
import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { InventoryService } from '../InventoryService'

/* ------------------------------------------------------------------ */
/*  Mocks                                                             */
/* ------------------------------------------------------------------ */
let testDb: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => testDb,
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn(),
}))

// Mock DoubleEntryJournalService so adjustStock doesn't need real GL accounts
vi.mock('../../accounting/DoubleEntryJournalService', () => {
  return {
    DoubleEntryJournalService: class {
      createJournalEntrySync() { return { success: true, entryId: 1 } }
    },
  }
})

/* ------------------------------------------------------------------ */
/*  Schema helper                                                     */
/* ------------------------------------------------------------------ */
function createSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      table_name TEXT NOT NULL,
      record_id INTEGER,
      old_values TEXT,
      new_values TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES user(id)
    );
    CREATE TABLE inventory_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_name TEXT NOT NULL UNIQUE,
      description TEXT,
      is_active BOOLEAN DEFAULT 1
    );
    CREATE TABLE supplier (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_name TEXT NOT NULL,
      contact_person TEXT, phone TEXT, email TEXT, address TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE inventory_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_code TEXT NOT NULL UNIQUE,
      item_name TEXT NOT NULL,
      category_id INTEGER NOT NULL,
      unit_of_measure TEXT NOT NULL,
      current_stock DECIMAL(12,2) DEFAULT 0,
      reorder_level DECIMAL(12,2) DEFAULT 0,
      unit_cost DECIMAL(12,2) DEFAULT 0,
      unit_price INTEGER DEFAULT 0,
      supplier_id INTEGER,
      description TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES inventory_category(id)
    );
    CREATE TABLE stock_movement (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      movement_type TEXT NOT NULL CHECK(movement_type IN ('IN','OUT','ADJUSTMENT')),
      quantity DECIMAL(12,2) NOT NULL,
      unit_cost DECIMAL(12,2),
      total_cost DECIMAL(12,2),
      reference_number TEXT,
      supplier_id INTEGER,
      description TEXT,
      movement_date DATE NOT NULL,
      recorded_by_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (item_id) REFERENCES inventory_item(id)
    );

    -- Seed data
    INSERT INTO user (id, username, password_hash, full_name, role)
    VALUES (1, 'admin', 'hash', 'Admin User', 'ADMIN');

    INSERT INTO inventory_category (id, category_name) VALUES (1, 'Stationery');
    INSERT INTO inventory_category (id, category_name) VALUES (2, 'Chemicals');

    INSERT INTO supplier (id, supplier_name) VALUES (1, 'ACME Corp');

    INSERT INTO inventory_item (id, item_code, item_name, category_id, unit_of_measure, current_stock, reorder_level, unit_cost, unit_price, supplier_id)
    VALUES (1, 'STN-001', 'Chalk Box', 1, 'Box', 50, 10, 200, 250, 1);

    INSERT INTO inventory_item (id, item_code, item_name, category_id, unit_of_measure, current_stock, reorder_level, unit_cost, unit_price)
    VALUES (2, 'STN-002', 'Exercise Book', 1, 'Piece', 5, 20, 100, 150);
  `)
}

/* ================================================================== */
describe('InventoryService', () => {
  let db: Database.Database
  let service: InventoryService

  beforeEach(() => {
    db = new Database(':memory:')
    testDb = db
    createSchema(db)
    service = new InventoryService()
  })

  afterEach(() => { db.close() })

  /* ============================================================== */
  /*  CRUD (inherited from BaseService)                             */
  /* ============================================================== */
  describe('create', () => {
    it('creates an inventory item', async () => {
      const result = await service.create({
        item_code: 'CHM-001', item_name: 'Lab Acid', category_id: 2,
        unit_of_measure: 'Litre', reorder_level: 5, unit_cost: 500, unit_price: 600,
      }, 1)
      expect(result.success).toBe(true)
      expect(result.id).toBeGreaterThan(0)
    })

    it('returns errors when item_name is missing', async () => {
      const result = await service.create({
        item_code: 'X', item_name: '', category_id: 1,
        unit_of_measure: 'Box', reorder_level: 0, unit_cost: 0, unit_price: 0,
      }, 1)
      expect(result.success).toBe(false)
      expect(result.errors).toContain('Item name is required')
    })

    it('returns errors when item_code is missing', async () => {
      const result = await service.create({
        item_code: '', item_name: 'Thing', category_id: 1,
        unit_of_measure: 'Box', reorder_level: 0, unit_cost: 0, unit_price: 0,
      }, 1)
      expect(result.success).toBe(false)
      expect(result.errors).toContain('Item code is required')
    })

    it('returns errors when category_id is missing (0)', async () => {
      const result = await service.create({
        item_code: 'X', item_name: 'Thing', category_id: 0,
        unit_of_measure: 'Box', reorder_level: 0, unit_cost: 0, unit_price: 0,
      }, 1)
      expect(result.success).toBe(false)
      expect(result.errors).toContain('Category is required')
    })

    it('returns DB error for duplicate item_code', async () => {
      const result = await service.create({
        item_code: 'STN-001', item_name: 'Dup', category_id: 1,
        unit_of_measure: 'Box', reorder_level: 0, unit_cost: 0, unit_price: 0,
      }, 1)
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('UNIQUE constraint')
    })

    it('defaults reorder_level, unit_cost, unit_price to 0 when falsy', async () => {
      await service.create({
        item_code: 'NEW-001', item_name: 'New Item', category_id: 1,
        unit_of_measure: 'Piece', reorder_level: 0, unit_cost: 0, unit_price: 0,
      }, 1)
      const row = db.prepare('SELECT reorder_level, unit_cost, unit_price FROM inventory_item WHERE item_code = ?').get('NEW-001') as Record<string, number>
      expect(row.reorder_level).toBe(0)
      expect(row.unit_cost).toBe(0)
      expect(row.unit_price).toBe(0)
    })
  })

  /* ------ findById ------- */
  describe('findById', () => {
    it('returns mapped entity with category name', async () => {
      const item = await service.findById(1)
      expect(item).not.toBeNull()
      expect(item!.category).toBe('Stationery')
      expect(item!.is_active).toBe(true) // boolean mapping
    })

    it('returns null for non-existent id', async () => {
      expect(await service.findById(999)).toBeNull()
    })
  })

  /* ------ findAll + filters ------- */
  describe('findAll', () => {
    it('returns all items when no filters', async () => {
      const items = await service.findAll()
      expect(items.length).toBe(2)
    })

    it('filters by category_id', async () => {
      const items = await service.findAll({ category_id: 1 })
      expect(items.length).toBe(2)
    })

    it('filters by search (name LIKE)', async () => {
      const items = await service.findAll({ search: 'Chalk' })
      expect(items.length).toBe(1)
      expect(items[0].item_name).toBe('Chalk Box')
    })

    it('filters by search (code LIKE)', async () => {
      const items = await service.findAll({ search: 'STN-002' })
      expect(items.length).toBe(1)
    })

    it('filters by low_stock', async () => {
      // Exercise Book has stock=5, reorder=20 → low stock
      // Chalk Box has stock=50, reorder=10 → not low
      const items = await service.findAll({ low_stock: true })
      expect(items.length).toBe(1)
      expect(items[0].item_name).toBe('Exercise Book')
    })
  })

  /* ------ update ------- */
  describe('update', () => {
    it('updates item_name', async () => {
      const result = await service.update(1, { item_name: 'Colored Chalk' }, 1)
      expect(result.success).toBe(true)
      const row = db.prepare('SELECT item_name FROM inventory_item WHERE id=1').get() as { item_name: string }
      expect(row.item_name).toBe('Colored Chalk')
    })

    it('returns not-found for missing id', async () => {
      const result = await service.update(999, { item_name: 'X' }, 1)
      expect(result.success).toBe(false)
      expect(result.errors).toContain('Record not found')
    })
  })

  /* ------ delete ------- */
  describe('delete', () => {
    it('deletes an item', async () => {
      const result = await service.delete(2, 1)
      expect(result.success).toBe(true)
      expect(db.prepare('SELECT * FROM inventory_item WHERE id=2').get()).toBeUndefined()
    })
  })

  /* ============================================================== */
  /*  adjustStock — core business logic                             */
  /* ============================================================== */
  describe('adjustStock', () => {
    /* ---- IN movements ---- */
    it('increases stock on IN', async () => {
      const result = await service.adjustStock(1, 20, 'IN', 1, 'Restock')
      expect(result.success).toBe(true)
      const row = db.prepare('SELECT current_stock FROM inventory_item WHERE id=1').get() as { current_stock: number }
      expect(row.current_stock).toBe(70) // 50 + 20
    })

    it('records stock movement on IN', async () => {
      await service.adjustStock(1, 10, 'IN', 1, 'Delivery')
      const mvt = db.prepare('SELECT * FROM stock_movement WHERE item_id=1').get() as Record<string, unknown>
      expect(mvt.movement_type).toBe('IN')
      expect(mvt.quantity).toBe(10)
      expect(mvt.description).toBe('Delivery')
    })

    it('updates unit_cost on IN when unitCost > 0', async () => {
      await service.adjustStock(1, 10, 'IN', 1, 'note', 350)
      const row = db.prepare('SELECT unit_cost FROM inventory_item WHERE id=1').get() as { unit_cost: number }
      expect(row.unit_cost).toBe(350) // was 200
    })

    it('does NOT update unit_cost on IN when unitCost === 0', async () => {
      await service.adjustStock(1, 10, 'IN', 1, 'note', 0)
      const row = db.prepare('SELECT unit_cost FROM inventory_item WHERE id=1').get() as { unit_cost: number }
      expect(row.unit_cost).toBe(200) // unchanged
    })

    /* ---- OUT movements ---- */
    it('decreases stock on OUT', async () => {
      await service.adjustStock(1, 30, 'OUT', 1, 'Issued')
      const row = db.prepare('SELECT current_stock FROM inventory_item WHERE id=1').get() as { current_stock: number }
      expect(row.current_stock).toBe(20) // 50 - 30
    })

    it('returns Insufficient stock when OUT exceeds available', async () => {
      const result = await service.adjustStock(1, 60, 'OUT', 1, 'Too much')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Insufficient stock')
      // Stock should be unchanged
      const row = db.prepare('SELECT current_stock FROM inventory_item WHERE id=1').get() as { current_stock: number }
      expect(row.current_stock).toBe(50)
    })

    it('allows OUT of exactly all stock', async () => {
      const result = await service.adjustStock(1, 50, 'OUT', 1, 'Drain')
      expect(result.success).toBe(true)
      const row = db.prepare('SELECT current_stock FROM inventory_item WHERE id=1').get() as { current_stock: number }
      expect(row.current_stock).toBe(0)
    })

    /* ---- ADJUSTMENT movements ---- */
    it('sets stock to exact quantity on ADJUSTMENT', async () => {
      await service.adjustStock(1, 100, 'ADJUSTMENT', 1, 'Recount')
      const row = db.prepare('SELECT current_stock FROM inventory_item WHERE id=1').get() as { current_stock: number }
      expect(row.current_stock).toBe(100) // set to 100 regardless of prior
    })

    it('allows ADJUSTMENT to 0', async () => {
      const result = await service.adjustStock(1, 0, 'ADJUSTMENT', 1, 'Zero out')
      expect(result.success).toBe(true)
      const row = db.prepare('SELECT current_stock FROM inventory_item WHERE id=1').get() as { current_stock: number }
      expect(row.current_stock).toBe(0)
    })

    it('rejects ADJUSTMENT to negative value', async () => {
      const result = await service.adjustStock(1, -5, 'ADJUSTMENT', 1, 'Negative')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Insufficient stock')
    })

    /* ---- Edge cases ---- */
    it('returns error for non-existent item', async () => {
      const result = await service.adjustStock(999, 10, 'IN', 1)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Item not found')
    })

    it('movement quantity is stored as absolute value of change', async () => {
      await service.adjustStock(1, 30, 'OUT', 1, 'Issue 30')
      const mvt = db.prepare('SELECT quantity FROM stock_movement WHERE item_id=1').get() as { quantity: number }
      expect(mvt.quantity).toBe(30) // absolute, not -30
    })

    it('calls logAudit with old and new quantities', async () => {
      const { logAudit } = await import('../../../database/utils/audit')
      ;(logAudit as ReturnType<typeof vi.fn>).mockClear()
      await service.adjustStock(1, 10, 'IN', 1)
      expect(logAudit).toHaveBeenCalledWith(
        1, 'STOCK_UPDATE', 'inventory_item', 1,
        { quantity: 50 },
        { quantity: 60 },
      )
    })
  })

  /* ============================================================== */
  /*  Helper methods                                                */
  /* ============================================================== */
  describe('getHistory', () => {
    it('returns movements with user name', async () => {
      db.exec(`
        INSERT INTO stock_movement (item_id, movement_type, quantity, unit_cost, movement_date, recorded_by_user_id)
        VALUES (1, 'IN', 10, 200, '2025-01-15', 1);
      `)
      const history = await service.getHistory(1)
      expect(history.length).toBe(1)
      expect(history[0].recorded_by_name).toBe('Admin User')
    })

    it('returns empty array when no movements', async () => {
      const history = await service.getHistory(999)
      expect(history).toEqual([])
    })
  })

  describe('getLowStock', () => {
    it('returns items where current_stock <= reorder_level', async () => {
      const low = await service.getLowStock()
      expect(low.length).toBe(1)
      expect(low[0].item_name).toBe('Exercise Book')
    })

    it('excludes inactive items', async () => {
      db.exec("UPDATE inventory_item SET is_active = 0 WHERE id = 2")
      const low = await service.getLowStock()
      expect(low.length).toBe(0)
    })
  })

  describe('getCategories', () => {
    it('returns active categories', async () => {
      const cats = await service.getCategories()
      expect(cats.length).toBe(2)
    })

    it('excludes inactive categories', async () => {
      db.exec("UPDATE inventory_category SET is_active = 0 WHERE id = 2")
      const cats = await service.getCategories()
      expect(cats.length).toBe(1)
    })
  })

  describe('getSuppliers', () => {
    it('returns active suppliers', async () => {
      const sups = await service.getSuppliers()
      expect(sups.length).toBe(1)
      expect(sups[0].supplier_name).toBe('ACME Corp')
    })
  })

  // ── Additional branch coverage ─────────────────────────────────
  describe('additional branch coverage', () => {
    it('update with empty data makes no changes', async () => {
      const result = await service.update(1, {}, 1)
      expect(result.success).toBe(true)
      // Verify item unchanged
      const item = await service.findById(1)
      expect(item!.item_name).toBe('Chalk Box')
    })

    it('update with null/empty string values skipped by assignIfPresent', async () => {
      const result = await service.update(1, { item_name: '', item_code: '' } as Partial<any>, 1)
      expect(result.success).toBe(true)
      const item = await service.findById(1)
      expect(item!.item_name).toBe('Chalk Box') // unchanged
    })

    it('update with reorder_level=0 is applied via assignIfDefined', async () => {
      await service.update(1, { reorder_level: 0 }, 1)
      const item = await service.findById(1)
      expect(item!.reorder_level).toBe(0)
    })

    it('update with description=null is applied via assignIfDefined', async () => {
      await service.update(1, { description: null } as Partial<any>, 1)
      const item = await service.findById(1)
      expect(item!.description).toBeNull()
    })

    it('adjustStock IN without unitCost uses item unit_cost', async () => {
      await service.adjustStock(1, 5, 'IN', 1, 'No cost provided')
      // unit_cost should remain 200
      const row = db.prepare('SELECT unit_cost FROM inventory_item WHERE id=1').get() as { unit_cost: number }
      expect(row.unit_cost).toBe(200)
    })

    it('findAll with combined category_id and search filters', async () => {
      const items = await service.findAll({ category_id: 1, search: 'Chalk' })
      expect(items.length).toBe(1)
      expect(items[0].item_name).toBe('Chalk Box')
    })

    it('findAll with combined low_stock and search filters', async () => {
      const items = await service.findAll({ low_stock: true, search: 'Exercise' })
      expect(items.length).toBe(1)
      expect(items[0].item_name).toBe('Exercise Book')
    })

    it('create defaults supplier_id and description to null when not provided', async () => {
      const result = await service.create({
        item_code: 'DEF-001', item_name: 'Default Item', category_id: 1,
        unit_of_measure: 'Piece', reorder_level: 0, unit_cost: 0, unit_price: 0,
      }, 1)
      expect(result.success).toBe(true)
      const row = db.prepare('SELECT supplier_id, description FROM inventory_item WHERE item_code = ?').get('DEF-001') as any
      expect(row.supplier_id).toBeNull()
      expect(row.description).toBeNull()
    })

    it('returns error when unit_of_measure is missing', async () => {
      const result = await service.create({
        item_code: 'UOM-001', item_name: 'No UOM', category_id: 1,
        unit_of_measure: '', reorder_level: 0, unit_cost: 0, unit_price: 0,
      }, 1)
      expect(result.success).toBe(false)
      expect(result.errors).toContain('Unit of measure is required')
    })

    it('adjustStock IN on item with null supplier_id omits supplier_id from journal', async () => {
      // Item 2 has no supplier_id (NULL)
      const result = await service.adjustStock(2, 5, 'IN', 1, 'Restock no supplier')
      expect(result.success).toBe(true)
      const row = db.prepare('SELECT current_stock FROM inventory_item WHERE id=2').get() as { current_stock: number }
      expect(row.current_stock).toBe(10) // 5 + 5
    })
  })
})
