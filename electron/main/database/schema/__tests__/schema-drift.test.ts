/**
 * Schema-drift detection test.
 *
 * Ensures the shared test helper DDL (used by all service tests) stays
 * in sync with the production schema produced by running all migrations.
 *
 * If this test fails, either:
 *   1. A migration changed a column but the helper DDL wasn't updated, OR
 *   2. The helper DDL has a typo / wrong default / missing column.
 *
 * Fix: update `electron/main/services/__tests__/helpers/schema.ts`.
 */
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

import { runMigrations } from '../../migrations/index.js'
import { applySchema, TABLE_ORDER } from '../../../services/__tests__/helpers/schema.js'

interface ColumnInfo {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

/** Tables that the test helper intentionally omits (created only by migrations, not needed in tests). */
const HELPER_SKIP_TABLES = new Set([
  'migrations',        // internal migration tracking
  'sqlite_sequence',   // auto-created by SQLite for AUTOINCREMENT
])

/** Columns where default-value drift is acceptable (e.g. migration backfills differ from fresh DDL). */
const _KNOWN_DEFAULT_DIFFS: Record<string, Set<string>> = {
  // Migration 1013 adds status with DEFAULT 'OPEN' but also backfills from is_locked
  financial_period: new Set(['status']),
}

function collectMissingColumns(
  mismatches: string[],
  table: string,
  prodColMap: Map<string, ColumnInfo>,
  testColMap: Map<string, ColumnInfo>,
): void {
  for (const [colName] of prodColMap) {
    if (!testColMap.has(colName)) {
      mismatches.push(`${table}: column "${colName}" exists in production but missing from test helper`)
    }
  }
  for (const [colName] of testColMap) {
    if (!prodColMap.has(colName)) {
      mismatches.push(`${table}: column "${colName}" exists in test helper but NOT in production`)
    }
  }
}

function collectTypeMismatches(
  mismatches: string[],
  table: string,
  prodColMap: Map<string, ColumnInfo>,
  testColMap: Map<string, ColumnInfo>,
): void {
  for (const [colName, prodCol] of prodColMap) {
    const testCol = testColMap.get(colName)
    if (!testCol) { continue }

    const prodType = (prodCol.type || '').toUpperCase().replaceAll(/\s+/g, '')
    const testType = (testCol.type || '').toUpperCase().replaceAll(/\s+/g, '')

    if (prodType !== testType) {
      mismatches.push(
        `${table}.${colName}: type mismatch — production="${prodType}" vs test="${testType}"`,
      )
    }
    if (prodCol.notnull !== testCol.notnull) {
      mismatches.push(
        `${table}.${colName}: NOT NULL mismatch — production=${prodCol.notnull} vs test=${testCol.notnull}`,
      )
    }
  }
}

describe('Schema Drift Detection', () => {
  it('test helper DDL columns match production schema for every shared table', () => {
    // 1. Build production DB via migrations
    const prodDb = new Database(':memory:')
    runMigrations(prodDb)

    // 2. Build test-helper DB
    const testDb = new Database(':memory:')
    applySchema(testDb, [...TABLE_ORDER])

    // 3. Get production tables
    const prodTables = (prodDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all() as { name: string }[]).map(r => r.name)

    const helperTables = new Set(TABLE_ORDER)
    const mismatches: string[] = []

    // 4. Compare columns for every table that exists in BOTH
    for (const table of prodTables) {
      if (HELPER_SKIP_TABLES.has(table)) { continue }
      if (!helperTables.has(table)) { continue }

      const prodCols = prodDb.pragma(`table_info(${table})`) as ColumnInfo[]
      const testCols = testDb.pragma(`table_info(${table})`) as ColumnInfo[]

      const prodColMap = new Map(prodCols.map(c => [c.name, c]))
      const testColMap = new Map(testCols.map(c => [c.name, c]))

      collectMissingColumns(mismatches, table, prodColMap, testColMap)
      collectTypeMismatches(mismatches, table, prodColMap, testColMap)
    }

    expect(mismatches, `Schema drift detected (${mismatches.length} issues)`).toEqual([])
  })

  it('test helper covers all critical financial tables', () => {
    const helperTables = new Set(TABLE_ORDER)
    const criticalTables = [
      'user', 'student', 'fee_invoice', 'ledger_transaction',
      'audit_log', 'gl_account', 'journal_entry', 'journal_entry_line',
      'receipt', 'budget', 'fixed_asset', 'financial_period',
    ]

    const missing = criticalTables.filter(t => !helperTables.has(t))
    expect(missing, 'Critical tables missing from test helper').toEqual([])
  })
})
