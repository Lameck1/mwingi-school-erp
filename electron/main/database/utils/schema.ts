import type Database from 'better-sqlite3'

export class SchemaHelper {
  private readonly db: Database.Database
  private columnCache: Map<string, Set<string>> = new Map()
  private tableCache: Set<string> | null = null

  constructor(db: Database.Database) {
    this.db = db
  }

  tableExists(tableName: string): boolean {
    if (this.tableCache) {
      return this.tableCache.has(tableName)
    }

    // Fallback or initial check without full cache population
    const row = this.db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = ?
    `).get(tableName) as { name: string } | undefined
    return Boolean(row?.name)
  }

  columnExists(tableName: string, columnName: string): boolean {
    if (!this.tableExists(tableName)) {
      return false
    }

    let columns = this.columnCache.get(tableName)
    if (!columns) {
      const result = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
      columns = new Set(result.map(c => c.name))
      this.columnCache.set(tableName, columns)
    }

    return columns.has(columnName)
  }

  clearCache(): void {
    this.columnCache.clear()
    this.tableCache = null
  }
}
