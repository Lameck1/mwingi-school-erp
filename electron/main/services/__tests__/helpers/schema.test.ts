/**
 * Tests for the shared schema helper used by service tests.
 *
 * Covers:
 *  - applySchema creates requested tables with FK dependencies
 *  - applySchema throws for unknown table names
 *  - expandDependencies resolves transitive FK deps
 *  - seedTestUser inserts a user row
 */
import { describe, it, expect, beforeEach } from 'vitest'
import DatabaseConstructor from 'better-sqlite3'

import { applySchema, seedTestUser } from '../helpers/schema'

describe('schema helper', () => {
  let db: ReturnType<typeof DatabaseConstructor>

  beforeEach(() => {
    db = new DatabaseConstructor(':memory:')
  })

  // ==================== applySchema ====================
  describe('applySchema', () => {
    it('creates a single table with no FK dependencies', () => {
      applySchema(db, ['user'])

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as Array<{ name: string }>

      expect(tables.map(t => t.name)).toContain('user')
    })

    it('creates table with its transitive FK dependencies', () => {
      // stock_movement → inventory_item → inventory_category
      applySchema(db, ['stock_movement'])

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as Array<{ name: string }>

      const names = tables.map(t => t.name)
      expect(names).toContain('stock_movement')
      expect(names).toContain('inventory_item')
      expect(names).toContain('inventory_category')
    })

    it('creates multiple tables and their shared dependencies', () => {
      applySchema(db, ['audit_log', 'term'])

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as Array<{ name: string }>

      const names = tables.map(t => t.name)
      expect(names).toContain('audit_log')
      expect(names).toContain('user')           // FK dep of audit_log
      expect(names).toContain('term')
      expect(names).toContain('academic_year')   // FK dep of term
    })

    it('silently skips unknown table names not in TABLE_ORDER', () => {
      // 'nonexistent_table' is not in TABLE_ORDER so it is skipped
      expect(() => applySchema(db, ['nonexistent_table'])).not.toThrow()

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as Array<{ name: string }>

      expect(tables).toHaveLength(0)
    })

    it('handles deep transitive dependencies (approval_history → approval_request → approval_workflow + user)', () => {
      applySchema(db, ['approval_history'])

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as Array<{ name: string }>

      const names = tables.map(t => t.name)
      expect(names).toContain('approval_history')
      expect(names).toContain('approval_request')
      expect(names).toContain('approval_workflow')
      expect(names).toContain('user')
    })

    it('handles fee_exemption with multiple FK parents', () => {
      applySchema(db, ['fee_exemption'])

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as Array<{ name: string }>

      const names = tables.map(t => t.name)
      expect(names).toContain('fee_exemption')
      expect(names).toContain('student')
      expect(names).toContain('academic_year')
      expect(names).toContain('user')
    })

    it('creates payroll with its dependency chain', () => {
      applySchema(db, ['payroll_deduction'])

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as Array<{ name: string }>

      const names = tables.map(t => t.name)
      expect(names).toContain('payroll_deduction')
      expect(names).toContain('payroll')
      expect(names).toContain('payroll_period')
      expect(names).toContain('staff')
    })

    it('creates budget_allocation with gl_account dependency', () => {
      applySchema(db, ['budget_allocation'])

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as Array<{ name: string }>

      const names = tables.map(t => t.name)
      expect(names).toContain('budget_allocation')
      expect(names).toContain('gl_account')
    })

    it('creates transaction_approval with all FK deps', () => {
      applySchema(db, ['transaction_approval'])

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as Array<{ name: string }>

      const names = tables.map(t => t.name)
      expect(names).toContain('transaction_approval')
      expect(names).toContain('journal_entry')
      expect(names).toContain('approval_rule')
      expect(names).toContain('user')
    })

    it('creates journal_entry_line with journal_entry dependency', () => {
      applySchema(db, ['journal_entry_line'])

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as Array<{ name: string }>

      const names = tables.map(t => t.name)
      expect(names).toContain('journal_entry_line')
      expect(names).toContain('journal_entry')
    })

    it('does not duplicate tables when dependencies overlap', () => {
      // Both audit_log and fee_exemption need 'user' — should only appear once
      applySchema(db, ['audit_log', 'fee_exemption'])

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user'")
        .all()

      expect(tables).toHaveLength(1)
    })
  })

  // ==================== seedTestUser ====================
  describe('seedTestUser', () => {
    it('inserts a test user with default id=1', () => {
      applySchema(db, ['user'])
      seedTestUser(db)

      const row = db.prepare('SELECT * FROM user WHERE id = 1').get() as Record<string, unknown>
      expect(row).toBeTruthy()
      expect(row.username).toBe('test_user_1')
      expect(row.role).toBe('ADMIN')
    })

    it('inserts a test user with custom id', () => {
      applySchema(db, ['user'])
      seedTestUser(db, 42)

      const row = db.prepare('SELECT * FROM user WHERE id = 42').get() as Record<string, unknown>
      expect(row).toBeTruthy()
      expect(row.username).toBe('test_user_42')
    })

    it('does not error when called twice with same id (INSERT OR IGNORE)', () => {
      applySchema(db, ['user'])
      seedTestUser(db, 1)
      seedTestUser(db, 1) // second call should not throw

      const rows = db.prepare('SELECT * FROM user WHERE id = 1').all()
      expect(rows).toHaveLength(1)
    })
  })
})
