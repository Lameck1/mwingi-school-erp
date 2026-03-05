import Database from 'better-sqlite3'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MigrationRunner } from '../migration-runner'

let testDb: Database.Database

const mocks = vi.hoisted(() => ({
  getDatabase: vi.fn(),
}))

vi.mock('../../index', () => ({
  getDatabase: () => mocks.getDatabase(),
}))

describe('MigrationRunner – extended coverage', () => {
  let tempDir: string
  let MigrationRunnerClass: typeof MigrationRunner

  beforeEach(async () => {
    vi.resetModules()
    testDb = new Database(':memory:')
    mocks.getDatabase.mockReturnValue(testDb)
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mwingi-migration-ext-'))

    const mod = await import('../migration-runner')
    MigrationRunnerClass = mod.MigrationRunner
  })

  afterEach(() => {
    testDb.close()
    fs.rmSync(tempDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  /* --- rollbackLastMigration --- */
  it('rollbackLastMigration returns failure when no migrations exist', () => {
    const runner = new MigrationRunnerClass(tempDir)
    const result = runner.rollbackLastMigration()
    expect(result.success).toBe(false)
    expect(result.rolled_back).toBeNull()
    expect(result.message).toContain('No migrations')
  })

  it('rollbackLastMigration removes last migration record', () => {
    fs.writeFileSync(
      path.join(tempDir, '0001_init.sql'),
      'CREATE TABLE t1 (id INTEGER PRIMARY KEY)'
    )

    const runner = new MigrationRunnerClass(tempDir)
    runner.runPendingMigrations()

    const status1 = runner.getStatus()
    expect(status1.executed_migrations).toBe(1)

    const result = runner.rollbackLastMigration()
    expect(result.success).toBe(true)
    expect(result.rolled_back).toBe('0001_init.sql')

    const status2 = runner.getStatus()
    expect(status2.executed_migrations).toBe(0)
  })

  /* --- markAsExecuted --- */
  it('markAsExecuted marks a migration without running it', () => {
    const runner = new MigrationRunnerClass(tempDir)
    const result = runner.markAsExecuted('0099_manual.sql')
    expect(result.success).toBe(true)
    expect(result.message).toContain('marked as executed')
  })

  it('markAsExecuted fails if migration already marked', () => {
    const runner = new MigrationRunnerClass(tempDir)
    runner.markAsExecuted('0099_manual.sql')
    const result = runner.markAsExecuted('0099_manual.sql')
    expect(result.success).toBe(false)
    expect(result.message).toContain('already marked')
  })

  /* --- getStatus edge cases --- */
  it('getStatus shows last_migration as null when nothing executed', () => {
    const runner = new MigrationRunnerClass(tempDir)
    const status = runner.getStatus()
    expect(status.last_migration).toBeNull()
    expect(status.executed_migrations).toBe(0)
  })

  /* --- executeMigration splits on semicolons and skips comments --- */
  it('handles multi-statement SQL files with comments', () => {
    const sql = [
      '-- Create users table',
      'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);',
      '/* Add roles */',
      'CREATE TABLE roles (id INTEGER PRIMARY KEY, role TEXT);',
    ].join('\n')

    fs.writeFileSync(path.join(tempDir, '0001_multi.sql'), sql)

    const runner = new MigrationRunnerClass(tempDir)
    const result = runner.runPendingMigrations()
    expect(result.success).toBe(true)
    expect(result.executed).toEqual(['0001_multi.sql'])
  })

  /* --- partial failure stops further migrations --- */
  it('stops on first failed migration and reports partial progress', () => {
    fs.writeFileSync(
      path.join(tempDir, '0001_good.sql'),
      'CREATE TABLE good_table (id INTEGER PRIMARY KEY)'
    )
    fs.writeFileSync(
      path.join(tempDir, '0002_bad.sql'),
      'THIS IS NOT VALID SQL'
    )
    fs.writeFileSync(
      path.join(tempDir, '0003_never.sql'),
      'CREATE TABLE never_table (id INTEGER PRIMARY KEY)'
    )

    const runner = new MigrationRunnerClass(tempDir)
    const result = runner.runPendingMigrations()

    expect(result.success).toBe(false)
    expect(result.executed).toEqual(['0001_good.sql'])
    expect(result.message).toContain('0002_bad.sql')
  })

  /* --- only .sql files are picked up --- */
  it('ignores non-sql files in migrations directory', () => {
    fs.writeFileSync(path.join(tempDir, '0001_init.sql'), 'CREATE TABLE t1 (id INTEGER PRIMARY KEY)')
    fs.writeFileSync(path.join(tempDir, 'README.md'), '# Migrations')

    const runner = new MigrationRunnerClass(tempDir)
    const result = runner.runPendingMigrations()
    expect(result.executed).toEqual(['0001_init.sql'])
  })

  /* --- total_migrations in getStatus --- */
  it('getStatus returns correct total_migrations count', () => {
    fs.writeFileSync(path.join(tempDir, '0001_a.sql'), 'CREATE TABLE a (id INTEGER PRIMARY KEY)')
    fs.writeFileSync(path.join(tempDir, '0002_b.sql'), 'CREATE TABLE b (id INTEGER PRIMARY KEY)')

    const runner = new MigrationRunnerClass(tempDir)
    const statusBefore = runner.getStatus()
    expect(statusBefore.total_migrations).toBe(2)
    expect(statusBefore.pending_migrations).toBe(2)

    runner.runPendingMigrations()
    const statusAfter = runner.getStatus()
    expect(statusAfter.total_migrations).toBe(2)
    expect(statusAfter.pending_migrations).toBe(0)
  })

  // ── Branch coverage: error instanceof Error === false branches ──

  it('rollbackLastMigration returns "Unknown error during rollback" for non-Error thrown', () => {
    const runner = new MigrationRunnerClass(tempDir)
    const origPrepare = testDb.prepare.bind(testDb)
    vi.spyOn(testDb, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('ORDER BY id DESC LIMIT 1')) {
        throw 'non-error string' // NOSONAR
      }
      return origPrepare(sql)
    })

    const result = runner.rollbackLastMigration()
    expect(result.success).toBe(false)
    expect(result.message).toBe('Unknown error during rollback')
    expect(result.rolled_back).toBeNull()
  })

  it('markAsExecuted returns "Unknown error" for non-Error thrown', () => {
    const runner = new MigrationRunnerClass(tempDir)
    const origPrepare = testDb.prepare.bind(testDb)
    vi.spyOn(testDb, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('SELECT COUNT(*)')) {
        throw 42 // NOSONAR
      }
      return origPrepare(sql)
    })

    const result = runner.markAsExecuted('test.sql')
    expect(result.success).toBe(false)
    expect(result.message).toBe('Unknown error')
  })

  it('runPendingMigrations inner catch uses "Unknown error" for non-Error thrown by migration', () => {
    fs.writeFileSync(path.join(tempDir, '0001_will_fail.sql'), 'SELECT 1')
    const runner = new MigrationRunnerClass(tempDir)

    // Spy on db.exec to throw a non-Error when executing migration SQL
    const origExec = testDb.exec.bind(testDb)
    vi.spyOn(testDb, 'exec').mockImplementation((sql: string) => {
      if (sql.trim() === 'SELECT 1') {
        throw 'string-error-from-exec' // NOSONAR
      }
      return origExec(sql)
    })

    const result = runner.runPendingMigrations()
    expect(result.success).toBe(false)
    expect(result.message).toContain('Unknown error')
    expect(result.message).toContain('0001_will_fail.sql')
  })

  it('runPendingMigrations outer catch uses "Unknown error during migration" for non-Error thrown', () => {
    const runner = new MigrationRunnerClass(tempDir)
    // Make db.prepare throw a non-Error when getExecutedMigrations queries _migrations
    const origPrepare = testDb.prepare.bind(testDb)
    vi.spyOn(testDb, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('SELECT migration_name FROM _migrations')) {
        throw 'non-error in getExecutedMigrations' // NOSONAR
      }
      return origPrepare(sql)
    })

    const result = runner.runPendingMigrations()
    expect(result.success).toBe(false)
    expect(result.message).toBe('Unknown error during migration')
    expect(result.executed).toEqual([])
  })

  // ── Branch: rollbackLastMigration catch with actual Error (instanceof Error = true) ──
  it('rollbackLastMigration returns Error.message when an Error is thrown', () => {
    const runner = new MigrationRunnerClass(tempDir)
    const origPrepare = testDb.prepare.bind(testDb)
    vi.spyOn(testDb, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('ORDER BY id DESC LIMIT 1')) {
        throw new Error('database is locked')
      }
      return origPrepare(sql)
    })

    const result = runner.rollbackLastMigration()
    expect(result.success).toBe(false)
    expect(result.message).toBe('database is locked')
    expect(result.rolled_back).toBeNull()
  })

  // ── Branch: markAsExecuted catch with actual Error (instanceof Error = true) ──
  it('markAsExecuted returns Error.message when an Error is thrown', () => {
    const runner = new MigrationRunnerClass(tempDir)
    const origPrepare = testDb.prepare.bind(testDb)
    vi.spyOn(testDb, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('SELECT COUNT(*)')) {
        throw new Error('table not found')
      }
      return origPrepare(sql)
    })

    const result = runner.markAsExecuted('test.sql')
    expect(result.success).toBe(false)
    expect(result.message).toBe('table not found')
  })

  // ── Branch: runPendingMigrations outer catch with actual Error (instanceof Error = true) ──
  it('runPendingMigrations outer catch returns Error.message for Error thrown', () => {
    const runner = new MigrationRunnerClass(tempDir)
    const origPrepare = testDb.prepare.bind(testDb)
    vi.spyOn(testDb, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('SELECT migration_name FROM _migrations')) {
        throw new Error('table locked')
      }
      return origPrepare(sql)
    })

    const result = runner.runPendingMigrations()
    expect(result.success).toBe(false)
    expect(result.message).toBe('table locked')
    expect(result.executed).toEqual([])
  })

  // ── Branch: constructor uses default migrations path when none provided ──
  it('constructor uses default migrations path when no argument is provided', () => {
    const runner = new MigrationRunnerClass()
    const status = runner.getStatus()
    // Default path may or may not have migration files; should not throw
    expect(status.executed_migrations).toBe(0)
  })
})
