import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { up } from '../fragments/030_production_alignment'

describe('030_production_alignment', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec('PRAGMA foreign_keys = OFF')
    // Create prerequisite tables that production alignment depends on
    db.exec('CREATE TABLE user (id INTEGER PRIMARY KEY)')
    db.exec('CREATE TABLE student (id INTEGER PRIMARY KEY)')
    db.exec('CREATE TABLE staff (id INTEGER PRIMARY KEY)')
    db.exec('CREATE TABLE stream (id INTEGER PRIMARY KEY)')
    db.exec('CREATE TABLE subject (id INTEGER PRIMARY KEY)')
    db.exec('CREATE TABLE exam (id INTEGER PRIMARY KEY)')
    db.exec('CREATE TABLE fixed_asset (id INTEGER PRIMARY KEY, asset_tag TEXT)')
    db.exec('CREATE TABLE inventory_item (id INTEGER PRIMARY KEY, item_name TEXT)')
    db.exec('CREATE TABLE fee_category_strand (id INTEGER PRIMARY KEY)')
    db.exec('CREATE TABLE cbc_strand_expense (id INTEGER PRIMARY KEY)')
    db.exec('CREATE TABLE student_activity_participation (id INTEGER PRIMARY KEY)')
    db.exec('CREATE TABLE academic_year (id INTEGER PRIMARY KEY)')
    db.exec('CREATE TABLE jss_fee_structure (id INTEGER PRIMARY KEY)')
  })

  afterEach(() => {
    db.close()
  })

  it('up() adds columns to existing tables', () => {
    up(db)

    const fixedAssetCols = db.prepare('PRAGMA table_info(fixed_asset)').all() as Array<{ name: string }>
    expect(fixedAssetCols.some(c => c.name === 'supplier_id')).toBe(true)
    expect(fixedAssetCols.some(c => c.name === 'warranty_expiry')).toBe(true)

    const invCols = db.prepare('PRAGMA table_info(inventory_item)').all() as Array<{ name: string }>
    expect(invCols.some(c => c.name === 'unit_price')).toBe(true)
    expect(invCols.some(c => c.name === 'description')).toBe(true)
  })

  it('up() creates production alignment tables', () => {
    up(db)

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all() as { name: string }[]
    const names = tables.map(t => t.name)

    expect(names).toContain('asset_depreciation')
    expect(names).toContain('grade_transition')
    expect(names).toContain('report_card')
  })

  it('up() is idempotent', () => {
    up(db)
    expect(() => up(db)).not.toThrow()
  })

  it('up() skips columns that already exist', () => {
    // Add a column that would be added by the migration
    db.exec('ALTER TABLE fixed_asset ADD COLUMN supplier_id INTEGER')
    // Should not throw on duplicate column
    expect(() => up(db)).not.toThrow()
  })

  it('up() handles missing prerequisite tables gracefully', () => {
    // Drop a target table - addColumnIfMissing should bail if table doesn't exist
    db.exec('DROP TABLE fixed_asset')
    expect(() => up(db)).not.toThrow()
  })
})
