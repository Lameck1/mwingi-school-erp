import * as fs from 'node:fs'
import type * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/* ------------------------------------------------------------------ */
/* Hoisted mocks                                                       */
/* ------------------------------------------------------------------ */
const mocks = vi.hoisted(() => ({
  app: {
    getPath: vi.fn(() => '/fake/userData'),
    isPackaged: false,
  },
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  getEncryptionKey: vi.fn<() => Promise<string>>(),
  runMigrations: vi.fn(),
}))

vi.mock('../../electron-env', () => ({
  app: mocks.app,
}))

vi.mock('../../utils/logger', () => ({
  default: mocks.log,
}))

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */
async function loadModule() {
  // Provide mocks for dynamic imports used inside initializeDatabase
  vi.doMock('../security', () => ({
    getEncryptionKey: mocks.getEncryptionKey,
  }))
  vi.doMock('../migrations/index.js', () => ({
    runMigrations: mocks.runMigrations,
  }))
  return await import('../index')
}

describe('database/index', () => {
  let tempDir: string

  beforeEach(() => {
    vi.resetModules()
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-index-test-'))
    mocks.app.getPath.mockReturnValue(tempDir)
    mocks.app.isPackaged = false
    mocks.getEncryptionKey.mockResolvedValue('ab'.repeat(32))
    mocks.runMigrations.mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch { /* EPERM on Windows when handles are still open */ }
  })

  /* --- getDatabase / isDatabaseInitialized ---- */
  it('getDatabase throws when database is not initialized', async () => {
    const mod = await loadModule()
    expect(() => mod.getDatabase()).toThrow('Database not initialized')
  })

  it('isDatabaseInitialized returns false before init', async () => {
    const mod = await loadModule()
    expect(mod.isDatabaseInitialized()).toBe(false)
  })

  /* --- getDatabasePath ---- */
  it('getDatabasePath creates data directory and returns path', async () => {
    const mod = await loadModule()
    const dbPath = mod.getDatabasePath()
    expect(dbPath).toContain('school_erp_clean_v3.db')
    expect(fs.existsSync(path.dirname(dbPath))).toBe(true)

    // Second call returns cached value
    const dbPath2 = mod.getDatabasePath()
    expect(dbPath2).toBe(dbPath)
  })

  /* --- initializeDatabase ---- */
  it('initializeDatabase opens db, runs migrations, and marks as initialized', async () => {
    const mod = await loadModule()
    await mod.initializeDatabase()

    expect(mod.isDatabaseInitialized()).toBe(true)
    expect(() => mod.getDatabase()).not.toThrow()
    expect(mocks.runMigrations).toHaveBeenCalled()

    // Clean up
    mod.closeDatabase()
  })

  /* --- closeDatabase ---- */
  it('closeDatabase sets db to null', async () => {
    const mod = await loadModule()
    await mod.initializeDatabase()
    expect(mod.isDatabaseInitialized()).toBe(true)
    mod.closeDatabase()
    expect(mod.isDatabaseInitialized()).toBe(false)
  })

  it('closeDatabase is safe to call when not initialized', async () => {
    const mod = await loadModule()
    expect(() => mod.closeDatabase()).not.toThrow()
  })

  /* --- backupDatabase ---- */
  it('backupDatabase throws when not initialized', async () => {
    const mod = await loadModule()
    await expect(mod.backupDatabase('/fake/path')).rejects.toThrow('Database not initialized')
  })

  it('backupDatabase creates a copy of the database', async () => {
    const mod = await loadModule()
    await mod.initializeDatabase()

    const backupPath = path.join(tempDir, 'backup', 'test_backup.db')
    await mod.backupDatabase(backupPath)

    expect(fs.existsSync(backupPath)).toBe(true)
    mod.closeDatabase()
  })

  it('backupDatabase overwrites existing backup file', async () => {
    const mod = await loadModule()
    await mod.initializeDatabase()

    const backupPath = path.join(tempDir, 'backup', 'test_overwrite.db')
    await mod.backupDatabase(backupPath)
    // Run again to hit the "file exists → unlink" branch
    await mod.backupDatabase(backupPath)

    expect(fs.existsSync(backupPath)).toBe(true)
    mod.closeDatabase()
  })

  /* --- applyKeyPragma with non-hex key ---- */
  it('applyKeyPragma throws for non-hex key', async () => {
    const mod = await loadModule()
    mocks.getEncryptionKey.mockResolvedValue('not-hex-key!!!')
    // The key validation should throw
    await expect(mod.initializeDatabase()).rejects.toThrow('Encryption key must be a hex string')
    // Clean up any partially opened DB handle so afterEach can remove tempDir
    try { mod.closeDatabase() } catch { /* ignore */ }
  })

  /* --- cipher module fallback in dev ---- */
  it('initializeDatabase falls back to better-sqlite3 when cipher fails in dev', async () => {
    mocks.app.isPackaged = false
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // This test uses the default better-sqlite3 since cipher module likely isn't installed
    const mod = await loadModule()
    await mod.initializeDatabase()
    expect(mod.isDatabaseInitialized()).toBe(true)
    mod.closeDatabase()
    warnSpy.mockRestore()
  })

  /* --- copyDatabaseFiles for WAL/SHM ---- */
  it('backupDatabase copies WAL and SHM files when they exist', async () => {
    const mod = await loadModule()
    await mod.initializeDatabase()
    const dbPath = mod.getDatabasePath()

    // Create fake WAL and SHM files
    const walPath = `${dbPath}-wal`
    const shmPath = `${dbPath}-shm`
    fs.writeFileSync(walPath, 'wal-data')
    fs.writeFileSync(shmPath, 'shm-data')

    const backupPath = path.join(tempDir, 'backup', 'wal_test.db')
    await mod.backupDatabase(backupPath)

    expect(fs.existsSync(backupPath)).toBe(true)
    mod.closeDatabase()
  })

  /* --- getDatabasePath creates directory recursively ---- */
  it('getDatabasePath creates nested data directory', async () => {
    const nestedTemp = path.join(tempDir, 'deep', 'nested')
    mocks.app.getPath.mockReturnValue(nestedTemp)
    const mod = await loadModule()
    const dbPath = mod.getDatabasePath()
    expect(dbPath).toContain('school_erp_clean_v3.db')
    expect(fs.existsSync(path.dirname(dbPath))).toBe(true)
  })

  /* ---- Branch-coverage additions ---- */

  it('loadDatabaseClass throws in production when cipher module fails', async () => {
    mocks.app.isPackaged = true
    const mod = await loadModule()
    await expect(mod.initializeDatabase()).rejects.toThrow(
      'Database encryption module failed to load in production'
    )
    try { mod.closeDatabase() } catch { /* ignore */ }
  })

  it('backupDatabase falls back to file-copy when native backup throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mod = await loadModule()
    await mod.initializeDatabase()

    const database = mod.getDatabase()
    ;(database as any).backup = vi.fn().mockRejectedValue(new Error('backup unsupported'))

    const backupPath = path.join(tempDir, 'backup', 'fallback_copy.db')
    await mod.backupDatabase(backupPath)
    expect(fs.existsSync(backupPath)).toBe(true)

    mod.closeDatabase()
    warnSpy.mockRestore()
  })

  it('backupDatabase handles non-Error native backup failure', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mod = await loadModule()
    await mod.initializeDatabase()

    const database = mod.getDatabase()
    ;(database as any).backup = vi.fn().mockRejectedValue('string-rejection')

    const backupPath = path.join(tempDir, 'backup', 'non_error_fallback.db')
    await mod.backupDatabase(backupPath)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('string-rejection'),
    )

    mod.closeDatabase()
    warnSpy.mockRestore()
  })

  it('backupDatabase uses file-copy strategy for encrypted connections', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mod = await loadModule()
    await mod.initializeDatabase()

    const database = mod.getDatabase()
    const origPragma = database.pragma.bind(database)
    ;(database as any).pragma = function (str: string, opts?: Record<string, unknown>) {
      if (typeof str === 'string' && str === 'cipher_version') { return 'v4.5.0' }
      return origPragma(str, opts)
    }

    const backupPath = path.join(tempDir, 'backup', 'encrypted_backup.db')
    await mod.backupDatabase(backupPath)
    expect(fs.existsSync(backupPath)).toBe(true)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Encrypted SQLite'))

    ;(database as any).pragma = origPragma
    mod.closeDatabase()
    warnSpy.mockRestore()
  })

  it('checkpointWal logs warning when WAL checkpoint fails during backup', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mod = await loadModule()
    await mod.initializeDatabase()

    const database = mod.getDatabase()
    const origPragma = database.pragma.bind(database)
    ;(database as any).backup = vi.fn().mockRejectedValue(new Error('nope'))
    ;(database as any).pragma = function (str: string, opts?: Record<string, unknown>) {
      if (typeof str === 'string' && str.includes('wal_checkpoint')) { throw new Error('WAL checkpoint error') }
      return origPragma(str, opts)
    }

    const backupPath = path.join(tempDir, 'backup', 'wal_fail.db')
    await mod.backupDatabase(backupPath)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('WAL checkpoint failed'),
      expect.anything()
    )

    ;(database as any).pragma = origPragma
    mod.closeDatabase()
    warnSpy.mockRestore()
  })

  // ── branch coverage: getDatabasePath returns cached path on repeated calls ──
  it('getDatabasePath returns same cached path on subsequent calls', async () => {
    const mod = await loadModule()
    const path1 = mod.getDatabasePath()
    const path2 = mod.getDatabasePath()
    expect(path1).toBe(path2)
    expect(path1).toContain('school_erp_clean_v3.db')
  })

  // ── branch coverage: closeDatabase is safe to call repeatedly when already closed ──
  it('closeDatabase can be called twice without error', async () => {
    const mod = await loadModule()
    await mod.initializeDatabase()
    mod.closeDatabase()
    expect(() => mod.closeDatabase()).not.toThrow()
    expect(mod.isDatabaseInitialized()).toBe(false)
  })

  // ── branch coverage L24: getDatabasePath skips mkdirSync when data dir already exists ──
  it('getDatabasePath skips mkdirSync when data directory already exists', async () => {
    const mod = await loadModule()
    // Pre-create the data directory so fs.existsSync returns true → skip mkdirSync
    const dataDir = path.join(tempDir, 'data')
    fs.mkdirSync(dataDir, { recursive: true })
    const dbPath = mod.getDatabasePath()
    expect(dbPath).toContain('school_erp_clean_v3.db')
    expect(fs.existsSync(dataDir)).toBe(true)
  })

  // ── branch coverage L179: isEncryptedConnection catch returns false ──
  it('isEncryptedConnection returns false when pragma throws (catch branch)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mod = await loadModule()
    await mod.initializeDatabase()
    const database = mod.getDatabase()
    const origPragma = database.pragma.bind(database)
    ;(database as any).pragma = function (str: string, opts?: Record<string, unknown>) {
      if (typeof str === 'string' && str === 'cipher_version') { throw new Error('no cipher support') }
      return origPragma(str, opts)
    }
    // Also make native backup fail so the function falls through to file-copy
    ;(database as any).backup = vi.fn().mockRejectedValue(new Error('backup unsupported'))

    const backupPath = path.join(tempDir, 'backup', 'cipher_catch.db')
    await mod.backupDatabase(backupPath)
    expect(fs.existsSync(backupPath)).toBe(true)

    ;(database as any).pragma = origPragma
    mod.closeDatabase()
    warnSpy.mockRestore()
  })

  // ── branch coverage L227-228: backupDatabase throws when file-copy fallback also fails ──
  it('backupDatabase throws when file-copy fallback also fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.resetModules()

    vi.doMock('node:fs/promises', async () => {
      const actual = await vi.importActual<typeof fsp>('node:fs/promises')
      return {
        ...actual,
        copyFile: vi.fn().mockRejectedValue(new Error('disk full')),
      }
    })
    vi.doMock('../security', () => ({
      getEncryptionKey: mocks.getEncryptionKey,
    }))
    vi.doMock('../migrations/index.js', () => ({
      runMigrations: mocks.runMigrations,
    }))

    const mod = await import('../index')
    await mod.initializeDatabase()

    const database = mod.getDatabase()
    ;(database as any).backup = vi.fn().mockRejectedValue(new Error('backup unsupported'))

    const backupPath = path.join(tempDir, 'backup', 'fallback_fail.db')
    await expect(mod.backupDatabase(backupPath)).rejects.toThrow('disk full')

    mod.closeDatabase()
    warnSpy.mockRestore()
  })

  // ── branch coverage L124: recoverDatabaseFile with empty key (falsy key branch) ──
  it('recovery path with empty key skips applyKeyPragma in recoverDatabaseFile', async () => {
    mocks.getEncryptionKey.mockResolvedValue('')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mod = await loadModule()
    const dbPath = mod.getDatabasePath()

    // Place a corrupt file so openAndTest and prepareUnencryptedDatabase both fail
    fs.writeFileSync(dbPath, 'this-is-not-a-valid-database')

    await mod.initializeDatabase()
    expect(mod.isDatabaseInitialized()).toBe(true)

    mod.closeDatabase()
    warnSpy.mockRestore()
  })
})
