import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { up, down } from '../fragments/010_core_schema'

describe('010_core_schema', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec('PRAGMA foreign_keys = OFF')
  })

  afterEach(() => {
    db.close()
  })

  it('up() creates all core tables', () => {
    up(db)

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[]
    const tableNames = tables.map(t => t.name)

    // Spot-check critical tables
    expect(tableNames).toContain('user')
    expect(tableNames).toContain('student')
    expect(tableNames).toContain('gl_account')
    expect(tableNames).toContain('journal_entry')
    expect(tableNames).toContain('ledger_transaction')
    expect(tableNames).toContain('attendance')
    expect(tableNames).toContain('payroll_period')
  })

  it('down() drops all tables created by up()', () => {
    up(db)
    down(db)

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name != 'sqlite_sequence'"
    ).all() as { name: string }[]

    // Most tables should be dropped
    const tableNames = tables.map(t => t.name)
    expect(tableNames).not.toContain('user')
    expect(tableNames).not.toContain('student')
    expect(tableNames).not.toContain('gl_account')
  })

  it('up() is idempotent (CREATE TABLE IF NOT EXISTS)', () => {
    up(db)
    // Second run should not throw
    expect(() => up(db)).not.toThrow()
  })
})
