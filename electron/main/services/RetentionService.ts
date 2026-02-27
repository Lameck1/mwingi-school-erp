import { getDatabase } from '../database'

import type Database from 'better-sqlite3'

interface RetentionConfigRow {
  id: number
  table_name: string
  retention_days: number
  is_active: number
  last_purge_at: string | null
}

export interface RetentionTableResult {
  table: string
  deleted: number
  skipped: boolean
  reason?: string
}

export interface RetentionPurgeSummary {
  totalDeleted: number
  processedTables: number
  results: RetentionTableResult[]
}

const SAFE_IDENTIFIER = /^[A-Za-z_]\w*$/
const SECONDS_PER_DAY = 24 * 60 * 60

const PURGEABLE_TABLES = new Set<string>([
  'audit_log',
  'notification',
  'sms_log',
  'email_log',
  'login_attempt',
  'report_schedule_log',
  'attendance',
  'backup_log',
])

export class RetentionService {
  private readonly db: Database.Database
  private readonly nowProvider: () => Date

  constructor(db?: Database.Database, nowProvider?: () => Date) {
    this.db = db || getDatabase()
    this.nowProvider = nowProvider ?? (() => new Date())
  }

  initialize(): RetentionPurgeSummary {
    return this.purgeExpiredRecords()
  }

  purgeExpiredRecords(): RetentionPurgeSummary {
    const configs = this.db.prepare(`
      SELECT id, table_name, retention_days, is_active, last_purge_at
      FROM data_retention_config
      WHERE is_active = 1
      ORDER BY table_name ASC
    `).all() as RetentionConfigRow[]

    const results: RetentionTableResult[] = []
    let totalDeleted = 0

    for (const config of configs) {
      const result = this.purgeTable(config)
      results.push(result)
      if (!result.skipped) {
        totalDeleted += result.deleted
      }
    }

    return {
      totalDeleted,
      processedTables: results.length,
      results
    }
  }

  private purgeTable(config: RetentionConfigRow): RetentionTableResult {
    const tableName = config.table_name
    if (!SAFE_IDENTIFIER.test(tableName)) {
      return { table: tableName, deleted: 0, skipped: true, reason: 'Unsafe table name' }
    }
    if (!PURGEABLE_TABLES.has(tableName)) {
      return { table: tableName, deleted: 0, skipped: true, reason: 'Table not in purge allowlist' }
    }

    if (!this.tableExists(tableName)) {
      return { table: tableName, deleted: 0, skipped: true, reason: 'Table missing' }
    }

    const dateColumn = this.resolveDateColumn(tableName)
    if (!dateColumn) {
      return { table: tableName, deleted: 0, skipped: true, reason: 'No supported timestamp column' }
    }

    const cutoffUnix = Math.floor(this.nowProvider().getTime() / 1000) - (config.retention_days * SECONDS_PER_DAY)
    const purgeSql = `
      DELETE FROM "${tableName}"
      WHERE "${dateColumn}" IS NOT NULL
        AND datetime("${dateColumn}") < datetime(?, 'unixepoch')
    `
    const deleted = this.db.prepare(purgeSql).run(cutoffUnix).changes

    this.db.prepare(`
      UPDATE data_retention_config
      SET last_purge_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(config.id)

    return { table: tableName, deleted, skipped: false }
  }

  private tableExists(tableName: string): boolean {
    const row = this.db.prepare(`
      SELECT 1 as found
      FROM sqlite_master
      WHERE type = 'table' AND name = ?
      LIMIT 1
    `).get(tableName) as { found?: number } | undefined

    return row?.found === 1
  }

  private resolveDateColumn(tableName: string): string | null {
    const columns = this.db.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{ name: string }>
    const names = new Set(columns.map((column) => column.name))
    if (names.has('created_at')) {
      return 'created_at'
    }
    if (names.has('timestamp')) {
      return 'timestamp'
    }
    return null
  }
}
