import type Database from 'better-sqlite3'

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName) as { name: string } | undefined
  return Boolean(row?.name)
}

function hasColumn(db: Database.Database, tableName: string, columnName: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
  return columns.some(col => col.name === columnName)
}

export function up(db: Database.Database): void {
  if (!tableExists(db, 'government_grant')) {
    return
  }

  if (!hasColumn(db, 'government_grant', 'expiry_date')) {
    db.exec(`ALTER TABLE government_grant ADD COLUMN expiry_date DATE`)
  }

  db.exec(`
    UPDATE government_grant
    SET expiry_date = printf('%04d-12-31', fiscal_year)
    WHERE expiry_date IS NULL
      AND fiscal_year IS NOT NULL
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_government_grant_expiry_date
    ON government_grant(expiry_date)
  `)
}
