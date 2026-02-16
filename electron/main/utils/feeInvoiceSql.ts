import { OUTSTANDING_INVOICE_STATUSES, asSqlInList } from './financeTransactionTypes'

import type Database from 'better-sqlite3'

const IDENTIFIER_PATTERN = /^[A-Za-z_]\w*$/
const schemaCacheByDb = new WeakMap<Database.Database, Map<string, boolean>>()

function getSchemaCache(db: Database.Database): Map<string, boolean> {
  let cache = schemaCacheByDb.get(db)
  if (!cache) {
    cache = new Map<string, boolean>()
    schemaCacheByDb.set(db, cache)
  }
  return cache
}

function isSafeIdentifier(value: string): boolean {
  return IDENTIFIER_PATTERN.test(value)
}

function tableExists(db: Database.Database, tableName: string): boolean {
  if (!isSafeIdentifier(tableName)) {
    return false
  }

  const cache = getSchemaCache(db)
  const cacheKey = `table:${tableName}`
  const cached = cache.get(cacheKey)
  if (cached !== undefined) {
    return cached
  }

  const exists = Boolean(
    db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`).get(tableName)
  )
  cache.set(cacheKey, exists)
  return exists
}

function columnExists(db: Database.Database, tableName: string, columnName: string): boolean {
  if (!isSafeIdentifier(tableName) || !isSafeIdentifier(columnName)) {
    return false
  }

  const cache = getSchemaCache(db)
  const cacheKey = `column:${tableName}.${columnName}`
  const cached = cache.get(cacheKey)
  if (cached !== undefined) {
    return cached
  }

  if (!tableExists(db, tableName)) {
    cache.set(cacheKey, false)
    return false
  }

  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
  const exists = columns.some((column) => column.name === columnName)
  cache.set(cacheKey, exists)
  return exists
}

function buildAmountCandidates(alias: string, columns: readonly string[]): string[] {
  const nullableCandidates = columns.map((column) => `NULLIF(${alias}.${column}, 0)`)
  const rawCandidates = columns.map((column) => `${alias}.${column}`)
  return [...nullableCandidates, ...rawCandidates]
}

export function buildFeeInvoiceAmountSql(db: Database.Database, alias: string = 'fi'): string {
  const amountColumns = ['total_amount', 'amount_due', 'amount'].filter((column) =>
    columnExists(db, 'fee_invoice', column)
  )
  if (amountColumns.length === 0) {
    return '0'
  }

  return `COALESCE(${buildAmountCandidates(alias, amountColumns).join(', ')}, 0)`
}

export function buildFeeInvoicePaidAmountSql(db: Database.Database, alias: string = 'fi'): string {
  if (!columnExists(db, 'fee_invoice', 'amount_paid')) {
    return '0'
  }

  return `COALESCE(${alias}.amount_paid, 0)`
}

export function buildFeeInvoiceOutstandingBalanceSql(db: Database.Database, alias: string = 'fi'): string {
  const amountSql = buildFeeInvoiceAmountSql(db, alias)
  const paidAmountSql = buildFeeInvoicePaidAmountSql(db, alias)
  return `((${amountSql}) - (${paidAmountSql}))`
}

export function buildFeeInvoiceDateSql(db: Database.Database, alias: string = 'fi'): string {
  const dateCandidates: string[] = []

  if (columnExists(db, 'fee_invoice', 'invoice_date')) {
    dateCandidates.push(`${alias}.invoice_date`)
  }
  if (columnExists(db, 'fee_invoice', 'created_at')) {
    dateCandidates.push(`substr(${alias}.created_at, 1, 10)`)
  }
  if (columnExists(db, 'fee_invoice', 'due_date')) {
    dateCandidates.push(`${alias}.due_date`)
  }

  if (dateCandidates.length === 0) {
    return `DATE('now')`
  }

  return `COALESCE(${dateCandidates.join(', ')}, DATE('now'))`
}

export function buildFeeInvoiceActiveStatusPredicate(db: Database.Database, alias: string = 'fi'): string {
  if (!columnExists(db, 'fee_invoice', 'status')) {
    return '1=1'
  }

  return `UPPER(COALESCE(${alias}.status, 'PENDING')) NOT IN ('CANCELLED', 'VOIDED')`
}

export function buildFeeInvoiceOutstandingStatusPredicate(db: Database.Database, alias: string = 'fi'): string {
  if (!columnExists(db, 'fee_invoice', 'status')) {
    return '1=1'
  }

  return `UPPER(COALESCE(${alias}.status, 'PENDING')) IN (${asSqlInList(OUTSTANDING_INVOICE_STATUSES)})`
}

export function buildFeeInvoiceStatusSql(
  db: Database.Database,
  alias: string = 'fi',
  fallbackStatus: string = 'PENDING'
): string {
  const escapedFallback = fallbackStatus.replace(/'/g, "''")
  if (!columnExists(db, 'fee_invoice', 'status')) {
    return `'${escapedFallback}'`
  }

  return `COALESCE(${alias}.status, '${escapedFallback}')`
}
