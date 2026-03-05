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

describe('MigrationRunner', () => {
  let tempDir: string
  let MigrationRunnerClass: typeof MigrationRunner

  beforeEach(async () => {
    vi.resetModules()
    testDb = new Database(':memory:')
    mocks.getDatabase.mockReturnValue(testDb)
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mwingi-migration-test-'))

    const mod = await import('../migration-runner')
    MigrationRunnerClass = mod.MigrationRunner
  })

  afterEach(() => {
    testDb.close()
    fs.rmSync(tempDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('creates _migrations table on construction', () => {
    const _runner = new MigrationRunnerClass(tempDir)
    const tables = testDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'")
      .all()
    expect(tables).toHaveLength(1)
  })

  it('runs pending migration files in sorted order', () => {
    fs.writeFileSync(
      path.join(tempDir, '0001_create_users.sql'),
      'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)'
    )
    fs.writeFileSync(
      path.join(tempDir, '0002_create_roles.sql'),
      'CREATE TABLE roles (id INTEGER PRIMARY KEY, role TEXT)'
    )

    const runner = new MigrationRunnerClass(tempDir)
    const result = runner.runPendingMigrations()

    expect(result.success).toBe(true)
    expect(result.executed).toEqual(['0001_create_users.sql', '0002_create_roles.sql'])

    // Verify tables were actually created
    const tables = testDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'roles')")
      .all()
    expect(tables).toHaveLength(2)
  })

  it('skips already-executed migrations (idempotency)', () => {
    fs.writeFileSync(
      path.join(tempDir, '0001_init.sql'),
      'CREATE TABLE t1 (id INTEGER PRIMARY KEY)'
    )

    const runner = new MigrationRunnerClass(tempDir)
    const first = runner.runPendingMigrations()
    expect(first.executed).toHaveLength(1)

    const second = runner.runPendingMigrations()
    expect(second.executed).toHaveLength(0)
    expect(second.message).toBe('No pending migrations')
  })

  it('returns failure when migration SQL is invalid', () => {
    fs.writeFileSync(
      path.join(tempDir, '0001_bad.sql'),
      'INVALID SQL QUERY SYNTAX HERE'
    )

    const runner = new MigrationRunnerClass(tempDir)
    const result = runner.runPendingMigrations()

    expect(result.success).toBe(false)
    expect(result.message).toContain('0001_bad.sql')
  })

  it('tracks migration versions correctly via getStatus', () => {
    fs.writeFileSync(
      path.join(tempDir, '0001_first.sql'),
      'CREATE TABLE first (id INTEGER PRIMARY KEY)'
    )

    const runner = new MigrationRunnerClass(tempDir)
    runner.runPendingMigrations()

    const status = runner.getStatus()
    expect(status.executed_migrations).toBe(1)
    expect(status.pending_migrations).toBe(0)
    expect(status.last_migration).toBe('0001_first.sql')
  })

  it('reports pending count before execution', () => {
    fs.writeFileSync(path.join(tempDir, '0001_a.sql'), 'CREATE TABLE a (id INTEGER PRIMARY KEY)')
    fs.writeFileSync(path.join(tempDir, '0002_b.sql'), 'CREATE TABLE b (id INTEGER PRIMARY KEY)')

    const runner = new MigrationRunnerClass(tempDir)
    const status = runner.getStatus()

    expect(status.pending_migrations).toBe(2)
    expect(status.executed_migrations).toBe(0)
  })

  it('handles empty migrations directory gracefully', () => {
    const runner = new MigrationRunnerClass(tempDir)
    const result = runner.runPendingMigrations()

    expect(result.success).toBe(true)
    expect(result.executed).toEqual([])
    expect(result.message).toBe('No pending migrations')
  })

  it('handles non-existent migrations directory gracefully', () => {
    const runner = new MigrationRunnerClass(path.join(tempDir, 'nonexistent'))
    const result = runner.runPendingMigrations()

    expect(result.success).toBe(true)
    expect(result.executed).toEqual([])
  })

  // ── rollbackLastMigration ────────────────────────────────────
  it('rollbackLastMigration succeeds when a migration exists', () => {
    fs.writeFileSync(
      path.join(tempDir, '0001_init.sql'),
      'CREATE TABLE rollback_test (id INTEGER PRIMARY KEY)'
    )
    const runner = new MigrationRunnerClass(tempDir)
    runner.runPendingMigrations()

    const result = runner.rollbackLastMigration()
    expect(result.success).toBe(true)
    expect(result.rolled_back).toBe('0001_init.sql')
    expect(result.message).toContain('Rollback record removed')
  })

  it('rollbackLastMigration returns failure when no migrations exist', () => {
    const runner = new MigrationRunnerClass(tempDir)
    const result = runner.rollbackLastMigration()
    expect(result.success).toBe(false)
    expect(result.message).toBe('No migrations to rollback')
    expect(result.rolled_back).toBeNull()
  })

  // ── markAsExecuted ───────────────────────────────────────────
  it('markAsExecuted records a new migration', () => {
    const runner = new MigrationRunnerClass(tempDir)
    const result = runner.markAsExecuted('0099_manual.sql')
    expect(result.success).toBe(true)
    expect(result.message).toContain('marked as executed')
  })

  it('markAsExecuted returns failure for already-executed migration', () => {
    fs.writeFileSync(
      path.join(tempDir, '0001_init.sql'),
      'CREATE TABLE mark_test (id INTEGER PRIMARY KEY)'
    )
    const runner = new MigrationRunnerClass(tempDir)
    runner.runPendingMigrations()

    const result = runner.markAsExecuted('0001_init.sql')
    expect(result.success).toBe(false)
    expect(result.message).toContain('already marked as executed')
  })

  // ── SQL comment / blank filtering ────────────────────────────
  it('executeMigration filters out SQL comments and blank lines', () => {
    fs.writeFileSync(
      path.join(tempDir, '0001_comments.sql'),
      '-- This is a comment;\n' +
      '/* Block comment */;\n' +
      '\n' +
      'CREATE TABLE comments_test (id INTEGER PRIMARY KEY);\n' +
      '-- trailing comment\n'
    )

    const runner = new MigrationRunnerClass(tempDir)
    const result = runner.runPendingMigrations()

    expect(result.success).toBe(true)
    expect(result.executed).toEqual(['0001_comments.sql'])
    // Verify table was created
    const tables = testDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='comments_test'")
      .all()
    expect(tables).toHaveLength(1)
  })

  // ── getStatus last_migration null ────────────────────────────
  it('getStatus returns null last_migration when nothing executed', () => {
    const runner = new MigrationRunnerClass(tempDir)
    const status = runner.getStatus()
    expect(status.last_migration).toBeNull()
    expect(status.executed_migrations).toBe(0)
  })

  // ── runPendingMigrations partial execution on mid-batch failure ──
  it('returns partial executed list when a migration fails mid-batch', () => {
    fs.writeFileSync(
      path.join(tempDir, '0001_ok.sql'),
      'CREATE TABLE partial_ok (id INTEGER PRIMARY KEY)'
    )
    fs.writeFileSync(
      path.join(tempDir, '0002_bad.sql'),
      'INVALID SQL THAT WILL FAIL'
    )
    fs.writeFileSync(
      path.join(tempDir, '0003_never.sql'),
      'CREATE TABLE never_reached (id INTEGER PRIMARY KEY)'
    )

    const runner = new MigrationRunnerClass(tempDir)
    const result = runner.runPendingMigrations()

    expect(result.success).toBe(false)
    expect(result.executed).toEqual(['0001_ok.sql'])
    expect(result.message).toContain('0002_bad.sql')
  })
})
