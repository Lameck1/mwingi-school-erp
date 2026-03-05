import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { up as schemaUp } from '../../schema/fragments/010_core_schema'
import { up as academicUp } from '../../schema/fragments/020_academic_updates'
import { up as productionUp } from '../../schema/fragments/030_production_alignment'
import { up as archiveUp } from '../../schema/fragments/040_archive_restorations'
import { up as coreSeedUp, down as coreSeedDown } from '../core_seed'

describe('core_seed', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec('PRAGMA foreign_keys = OFF')
    // Build the schema
    schemaUp(db)
    academicUp(db)
    productionUp(db)
    archiveUp(db)
  })

  afterEach(() => {
    db.close()
    vi.restoreAllMocks()
  })

  it('seeds school_settings with default data', () => {
    coreSeedUp(db)
    const settings = db.prepare('SELECT school_name FROM school_settings WHERE id = 1').get() as { school_name: string } | undefined
    expect(settings?.school_name).toContain('Mwingi')
  })

  it('seeds GL accounts', () => {
    coreSeedUp(db)
    const accounts = db.prepare('SELECT COUNT(*) as cnt FROM gl_account').get() as { cnt: number }
    expect(accounts.cnt).toBeGreaterThan(0)
  })

  it('seeds academic structure (year, terms, streams)', () => {
    coreSeedUp(db)
    const years = db.prepare('SELECT COUNT(*) as cnt FROM academic_year').get() as { cnt: number }
    expect(years.cnt).toBeGreaterThanOrEqual(1)

    const terms = db.prepare('SELECT COUNT(*) as cnt FROM term').get() as { cnt: number }
    expect(terms.cnt).toBeGreaterThanOrEqual(3)

    const streams = db.prepare('SELECT COUNT(*) as cnt FROM stream').get() as { cnt: number }
    expect(streams.cnt).toBeGreaterThanOrEqual(12)
  })

  it('seeds fee categories with GL mappings', () => {
    coreSeedUp(db)
    const categories = db.prepare('SELECT COUNT(*) as cnt FROM fee_category').get() as { cnt: number }
    expect(categories.cnt).toBeGreaterThan(0)
  })

  it('seeds approval rules', () => {
    coreSeedUp(db)
    const rules = db.prepare('SELECT COUNT(*) as cnt FROM approval_rule').get() as { cnt: number }
    expect(rules.cnt).toBeGreaterThan(0)
  })

  it('seeds statutory rates', () => {
    coreSeedUp(db)
    const rates = db.prepare('SELECT COUNT(*) as cnt FROM statutory_rates').get() as { cnt: number }
    expect(rates.cnt).toBeGreaterThan(0)
  })

  it('seeds award categories', () => {
    coreSeedUp(db)
    const awards = db.prepare('SELECT COUNT(*) as cnt FROM award_category').get() as { cnt: number }
    expect(awards.cnt).toBeGreaterThan(0)
  })

  it('skips admin user seeding by default (SEED_DEFAULT_ADMIN not set)', () => {
    // No env var set → should not create an admin user but should not throw
    coreSeedUp(db)
    const users = db.prepare("SELECT COUNT(*) as cnt FROM user WHERE username = 'admin'").get() as { cnt: number }
    expect(users.cnt).toBe(0)
  })

  it('seeds admin user when SEED_DEFAULT_ADMIN and hash are set', () => {
    process.env['SEED_DEFAULT_ADMIN'] = 'true'
    process.env['SEED_DEFAULT_ADMIN_PASSWORD_HASH'] = '$2b$10$fakehash'
    try {
      coreSeedUp(db)
      const users = db.prepare("SELECT COUNT(*) as cnt FROM user WHERE username = 'admin'").get() as { cnt: number }
      expect(users.cnt).toBe(1)
    } finally {
      delete process.env['SEED_DEFAULT_ADMIN']
      delete process.env['SEED_DEFAULT_ADMIN_PASSWORD_HASH']
    }
  })

  it('throws when SEED_DEFAULT_ADMIN is set but no password hash', () => {
    process.env['SEED_DEFAULT_ADMIN'] = 'true'
    delete process.env['SEED_DEFAULT_ADMIN_PASSWORD_HASH']
    try {
      expect(() => coreSeedUp(db)).toThrow('SEED_DEFAULT_ADMIN_PASSWORD_HASH')
    } finally {
      delete process.env['SEED_DEFAULT_ADMIN']
    }
  })

  it('is idempotent — calling twice does not error', () => {
    coreSeedUp(db)
    expect(() => coreSeedUp(db)).not.toThrow()
  })

  it('down() does not throw', () => {
    expect(() => coreSeedDown()).not.toThrow()
  })

  // ── Branch coverage: SEED_DEFAULT_ADMIN = '1' alternative ──
  it('seeds admin user when SEED_DEFAULT_ADMIN is "1"', () => {
    process.env['SEED_DEFAULT_ADMIN'] = '1'
    process.env['SEED_DEFAULT_ADMIN_PASSWORD_HASH'] = '$2b$10$fakehash'
    try {
      coreSeedUp(db)
      const users = db.prepare("SELECT COUNT(*) as cnt FROM user WHERE username = 'admin'").get() as { cnt: number }
      expect(users.cnt).toBe(1)
    } finally {
      delete process.env['SEED_DEFAULT_ADMIN']
      delete process.env['SEED_DEFAULT_ADMIN_PASSWORD_HASH']
    }
  })

  // ── Branch coverage: fee categories when gl_account rows are missing ──
  it('seeds fee categories with null gl_account_id when GL accounts are absent', () => {
    const origPrepare = db.prepare.bind(db)
    vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      // Intercept GL account lookups to return undefined → forces null branch
      if (sql.includes('SELECT id FROM gl_account WHERE account_code')) {
        // eslint-disable-next-line unicorn/no-useless-undefined
        return { get: () => undefined, run: () => ({}) } as any
      }
      return origPrepare(sql)
    })

    coreSeedUp(db)
    vi.restoreAllMocks()

    const nullGl = db.prepare('SELECT COUNT(*) as cnt FROM fee_category WHERE gl_account_id IS NULL').get() as { cnt: number }
    expect(nullGl.cnt).toBeGreaterThan(0)
  })

  // ── Branch coverage: year2026 null (academic_year missing) ──
  it('skips term seeding when year2026 lookup returns null', () => {
    const origPrepare = db.prepare.bind(db)
    vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      // Intercept the year2026 SELECT to return undefined → forces if(year2026) false branch
      if (sql.includes("SELECT id FROM academic_year WHERE year_name = '2026'")) {
        // eslint-disable-next-line unicorn/no-useless-undefined
        return { get: () => undefined } as any
      }
      return origPrepare(sql)
    })

    coreSeedUp(db)
    vi.restoreAllMocks()

    // year2026 was null → no terms should have been inserted
    const terms = db.prepare('SELECT COUNT(*) as cnt FROM term').get() as { cnt: number }
    expect(terms.cnt).toBe(0)
  })
})
