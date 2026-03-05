/**
 * Dump production DDL (PRAGMA table_info) for 15 drift tables.
 * Run: npx vitest run scripts/dump-production-ddl.ts
 */
import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../migrations/index.js'

const TABLES = [
  'enrollment',
  'fee_category',
  'fee_invoice',
  'invoice_item',
  'transaction_category',
  'payroll_period',
  'payroll',
  'payroll_deduction',
  'inventory_item',
  'stock_movement',
  'ledger_transaction',
  'approval_request',
  'budget_allocation',
  'accounting_period',
  'journal_entry',
]

describe('Production DDL dump', () => {
  it('dumps PRAGMA table_info for all 15 tables', () => {
    const db = new Database(':memory:')
    runMigrations(db)

    const ddlSnapshot: Record<string, { columns: string[]; sql: string }> = {}
    for (const table of TABLES) {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
        cid: number; name: string; type: string; notnull: number; dflt_value: string | null; pk: number
      }[]
      expect(cols.length).toBeGreaterThan(0)

      // Also dump CREATE TABLE SQL
      const sqlRow = db.prepare(
        `SELECT sql FROM sqlite_master WHERE type='table' AND name=?`
      ).get(table) as { sql: string } | undefined
      expect(sqlRow?.sql).toContain('CREATE TABLE')

      ddlSnapshot[table] = {
        columns: cols.map((c) => `${c.name}:${c.type}`),
        sql: sqlRow?.sql ?? '',
      }
    }

    expect(Object.keys(ddlSnapshot)).toHaveLength(TABLES.length)
    db.close()
  })
})
