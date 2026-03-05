import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { computeMigrationDriftFromSets } from '../verify_migrations'

/* ------------------------------------------------------------------ */
/* Hoisted mocks                                                       */
/* ------------------------------------------------------------------ */
const mocks = vi.hoisted(() => ({
  getDatabase: vi.fn(),
  getRegisteredMigrationNames: vi.fn(() => [
    '0001_initial_schema',
    '1001_alpha',
    '1002_beta',
  ]),
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  fspAccess: vi.fn(),
  fspReaddir: vi.fn(),
}))

vi.mock('../index', () => ({
  getDatabase: mocks.getDatabase,
}))

vi.mock('../migrations', () => ({
  getRegisteredMigrationNames: mocks.getRegisteredMigrationNames,
}))

vi.mock('../../utils/logger', () => ({
  default: mocks.log,
}))

vi.mock('node:fs/promises', () => ({
  default: {
    access: mocks.fspAccess,
    readdir: mocks.fspReaddir,
  },
}))

/* ------------------------------------------------------------------ */
/* Unit tests for computeMigrationDriftFromSets (pure function)       */
/* ------------------------------------------------------------------ */
describe('computeMigrationDriftFromSets', () => {
  it('returns no drift when file, registry, and applied sets align', () => {
    const result = computeMigrationDriftFromSets(
      ['1001_alpha', '1002_beta'],
      ['1001_alpha', '1002_beta'],
      ['1001_alpha', '1002_beta']
    )

    expect(result).toEqual({
      fileOnly: [],
      registryOnly: [],
      appliedButUnregistered: []
    })
  })

  it('detects file-only, registry-only, and applied-but-unregistered drift', () => {
    const result = computeMigrationDriftFromSets(
      ['1001_alpha', '1003_gamma'],
      ['1001_alpha', '1002_beta'],
      ['1001_alpha', '1004_delta']
    )

    expect(result.fileOnly).toEqual(['1002_beta'])
    expect(result.registryOnly).toEqual(['1004_delta'])
    expect(result.appliedButUnregistered).toEqual(['1003_gamma'])
  })

  it('ignores non-incremental migration names when checking applied-but-unregistered drift', () => {
    const result = computeMigrationDriftFromSets(
      ['0001_initial_schema', '1003_gamma'],
      ['1001_alpha', '1002_beta'],
      ['1001_alpha', '1002_beta']
    )

    expect(result.appliedButUnregistered).toEqual(['1003_gamma'])
  })

  it('returns empty arrays when all inputs are empty', () => {
    const result = computeMigrationDriftFromSets([], [], [])
    expect(result).toEqual({
      fileOnly: [],
      registryOnly: [],
      appliedButUnregistered: []
    })
  })

  it('does not flag applied names below 1000 prefix as drift', () => {
    const result = computeMigrationDriftFromSets(
      ['0001_schema', '0020_seed'],
      ['1001_alpha'],
      ['1001_alpha']
    )
    // 0001_schema and 0020_seed have numeric prefix < 1000, so they're not incremental
    expect(result.appliedButUnregistered).toEqual([])
  })

  it('flags applied names with prefix >= 1000 not in registry', () => {
    const result = computeMigrationDriftFromSets(
      ['1001_alpha', '1099_phantom'],
      ['1001_alpha'],
      ['1001_alpha']
    )
    expect(result.appliedButUnregistered).toEqual(['1099_phantom'])
  })
})

/* ------------------------------------------------------------------ */
/* Integration tests for verifyMigrations                              */
/* ------------------------------------------------------------------ */
async function loadVerifyMigrations() {
  return await import('../verify_migrations')
}

describe('verifyMigrations', () => {
  let testDb: Database.Database

  beforeEach(() => {
    vi.resetModules()
    testDb = new Database(':memory:')
    mocks.getDatabase.mockReturnValue(testDb)
    mocks.log.info.mockReset()
    mocks.log.warn.mockReset()
    mocks.log.error.mockReset()
    // By default, make fs mock resolve (directory found) and return matching filenames
    // eslint-disable-next-line unicorn/no-useless-undefined
    mocks.fspAccess.mockResolvedValue(undefined)
    mocks.fspReaddir.mockResolvedValue(['1001_alpha.ts', '1002_beta.ts'])
  })

  afterEach(() => {
    testDb.close()
    vi.restoreAllMocks()
  })

  it('throws when migrations table is missing', async () => {
    const { verifyMigrations } = await loadVerifyMigrations()
    await expect(verifyMigrations()).rejects.toThrow()
  })

  it('throws when critical tables are missing', async () => {
    // Create migrations table with all registered names applied
    testDb.exec(`CREATE TABLE migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
    const registeredNames = mocks.getRegisteredMigrationNames()
    for (const name of registeredNames) {
      testDb.prepare('INSERT INTO migrations (name) VALUES (?)').run(name)
    }
    // No critical tables exist

    const { verifyMigrations } = await loadVerifyMigrations()
    await expect(verifyMigrations()).rejects.toThrow()
  })

  it('passes when migrations and critical tables are present', async () => {
    // Register names that match what the mock returns
    mocks.getRegisteredMigrationNames.mockReturnValue([
      '0001_initial_schema', '1001_alpha', '1002_beta'
    ])

    testDb.exec(`CREATE TABLE migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
    for (const name of ['0001_initial_schema', '1001_alpha', '1002_beta']) {
      testDb.prepare('INSERT INTO migrations (name) VALUES (?)').run(name)
    }

    // Create all critical tables
    for (const table of [
      'attendance', 'payroll_period', 'inventory_item', 'subject', 'student',
      'user', 'stream', 'academic_exam', 'student_award', 'merit_list'
    ]) {
      testDb.exec(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY)`)
    }

    const { verifyMigrations } = await loadVerifyMigrations()
    await expect(verifyMigrations()).resolves.toBeUndefined()
  })

  it('warns when no migrations found', async () => {
    testDb.exec(`CREATE TABLE migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
    // No migrations inserted → 0 rows
    mocks.getRegisteredMigrationNames.mockReturnValue([])
    mocks.fspReaddir.mockResolvedValue([])

    // Create critical tables
    for (const table of [
      'attendance', 'payroll_period', 'inventory_item', 'subject', 'student',
      'user', 'stream', 'academic_exam', 'student_award', 'merit_list'
    ]) {
      testDb.exec(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY)`)
    }

    const { verifyMigrations } = await loadVerifyMigrations()
    await expect(verifyMigrations()).resolves.toBeUndefined()
    expect(mocks.log.warn).toHaveBeenCalledWith(expect.stringContaining('No migrations'))
  })

  it('logs applied migration info', async () => {
    mocks.getRegisteredMigrationNames.mockReturnValue(['0001_initial_schema'])
    mocks.fspReaddir.mockResolvedValue([])

    testDb.exec(`CREATE TABLE migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
    testDb.prepare('INSERT INTO migrations (name) VALUES (?)').run('0001_initial_schema')

    for (const table of [
      'attendance', 'payroll_period', 'inventory_item', 'subject', 'student',
      'user', 'stream', 'academic_exam', 'student_award', 'merit_list'
    ]) {
      testDb.exec(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY)`)
    }

    const { verifyMigrations } = await loadVerifyMigrations()
    await expect(verifyMigrations()).resolves.toBeUndefined()
    expect(mocks.log.info).toHaveBeenCalledWith(expect.stringContaining('Applied Migrations'))
  })

  it('throws on migration drift when applied migration is absent from registry', async () => {
    mocks.getRegisteredMigrationNames.mockReturnValue(['0001_initial_schema', '1001_alpha'])
    mocks.fspReaddir.mockResolvedValue(['1001_alpha.ts'])

    testDb.exec(`CREATE TABLE migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
    // Apply a migration not in the registry
    for (const name of ['0001_initial_schema', '1001_alpha', '1099_phantom']) {
      testDb.prepare('INSERT INTO migrations (name) VALUES (?)').run(name)
    }

    for (const table of [
      'attendance', 'payroll_period', 'inventory_item', 'subject', 'student',
      'user', 'stream', 'academic_exam', 'student_award', 'merit_list'
    ]) {
      testDb.exec(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY)`)
    }

    const { verifyMigrations } = await loadVerifyMigrations()
    await expect(verifyMigrations()).rejects.toThrow('drift')
    expect(mocks.log.error).toHaveBeenCalledWith(expect.stringContaining('1099_phantom'))
  })

  it('handles incremental path not found (no migration files on disk)', async () => {
    mocks.fspAccess.mockRejectedValue(new Error('ENOENT'))
    mocks.getRegisteredMigrationNames.mockReturnValue(['0001_initial_schema', '1001_alpha'])

    testDb.exec(`CREATE TABLE migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
    for (const name of ['0001_initial_schema', '1001_alpha']) {
      testDb.prepare('INSERT INTO migrations (name) VALUES (?)').run(name)
    }

    for (const table of [
      'attendance', 'payroll_period', 'inventory_item', 'subject', 'student',
      'user', 'stream', 'academic_exam', 'student_award', 'merit_list'
    ]) {
      testDb.exec(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY)`)
    }

    const { verifyMigrations } = await loadVerifyMigrations()
    await expect(verifyMigrations()).resolves.toBeUndefined()
    expect(mocks.log.warn).toHaveBeenCalledWith(expect.stringContaining('incremental migration directory is unavailable'))
  })

  it('reports registry-only drift (registry has migration but no corresponding file)', async () => {
    mocks.getRegisteredMigrationNames.mockReturnValue(['0001_initial_schema', '1001_alpha', '1002_beta', '1003_gamma'])
    mocks.fspReaddir.mockResolvedValue(['1001_alpha.ts', '1002_beta.ts'])
    // 1003_gamma is in registry but not on disk

    testDb.exec(`CREATE TABLE migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
    for (const name of ['0001_initial_schema', '1001_alpha', '1002_beta', '1003_gamma']) {
      testDb.prepare('INSERT INTO migrations (name) VALUES (?)').run(name)
    }

    for (const table of [
      'attendance', 'payroll_period', 'inventory_item', 'subject', 'student',
      'user', 'stream', 'academic_exam', 'student_award', 'merit_list'
    ]) {
      testDb.exec(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY)`)
    }

    const { verifyMigrations } = await loadVerifyMigrations()
    await expect(verifyMigrations()).rejects.toThrow('drift')
    expect(mocks.log.error).toHaveBeenCalledWith(expect.stringContaining('Registry migrations missing files'))
  })

  it('reports file-only drift (file on disk but not in registry)', async () => {
    mocks.getRegisteredMigrationNames.mockReturnValue(['0001_initial_schema', '1001_alpha'])
    mocks.fspReaddir.mockResolvedValue(['1001_alpha.ts', '1002_beta.ts', '1003_new.ts'])
    // 1002_beta and 1003_new are on disk but not in registry

    testDb.exec(`CREATE TABLE migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
    for (const name of ['0001_initial_schema', '1001_alpha']) {
      testDb.prepare('INSERT INTO migrations (name) VALUES (?)').run(name)
    }

    for (const table of [
      'attendance', 'payroll_period', 'inventory_item', 'subject', 'student',
      'user', 'stream', 'academic_exam', 'student_award', 'merit_list'
    ]) {
      testDb.exec(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY)`)
    }

    const { verifyMigrations } = await loadVerifyMigrations()
    await expect(verifyMigrations()).rejects.toThrow('drift')
    expect(mocks.log.error).toHaveBeenCalledWith(expect.stringContaining('not registered'))
  })
})
