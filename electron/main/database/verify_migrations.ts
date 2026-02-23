import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getDatabase } from './index'
import { getRegisteredMigrationNames } from './migrations'
import log from '../utils/logger'

interface MigrationDriftResult {
  fileOnly: string[]
  registryOnly: string[]
  appliedButUnregistered: string[]
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url))

function isIncrementalMigrationName(name: string): boolean {
  const match = name.match(/^(\d+)_/)
  if (!match) {
    return false
  }
  return Number(match[1]) >= 1000
}

function resolveIncrementalMigrationPath(): string | null {
  const candidates = [
    path.join(moduleDir, 'migrations', 'incremental'),
    path.join(moduleDir, 'database', 'migrations', 'incremental'),
    path.join(process.cwd(), 'electron', 'main', 'database', 'migrations', 'incremental')
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

function listIncrementalMigrationFiles(): string[] | null {
  const incrementalPath = resolveIncrementalMigrationPath()
  if (!incrementalPath) {
    return null
  }

  const entries = fs.readdirSync(incrementalPath)
  const names = entries
    .filter((name) => /^\d+_.+\.(ts|js)$/.test(name) && !name.endsWith('.d.ts'))
    .map((name) => name.replace(/\.(ts|js)$/, ''))

  return Array.from(new Set(names)).sort((left, right) => left.localeCompare(right))
}

export function computeMigrationDriftFromSets(
  appliedNames: string[],
  fileNames: string[],
  registryNames: string[]
): MigrationDriftResult {
  const fileSet = new Set(fileNames)
  const registrySet = new Set(registryNames)

  const fileOnly = fileNames.filter((name) => !registrySet.has(name))
  const registryOnly = registryNames.filter((name) => !fileSet.has(name))
  const appliedButUnregistered = appliedNames.filter((name) => isIncrementalMigrationName(name) && !registrySet.has(name))

  return { fileOnly, registryOnly, appliedButUnregistered }
}

function computeMigrationDrift(appliedNames: string[]): MigrationDriftResult {
  const registryNames = getRegisteredMigrationNames()
    .filter((name) => isIncrementalMigrationName(name))
    .sort((left, right) => left.localeCompare(right))
  const fileNames = listIncrementalMigrationFiles()

  if (!fileNames) {
    // Bundled runtimes may not carry migration source files on disk.
    // In this context, still validate applied names against registry.
    log.warn('Skipping migration file parity check: incremental migration directory is unavailable in this runtime.')
    return computeMigrationDriftFromSets(appliedNames, registryNames, registryNames)
  }

  return computeMigrationDriftFromSets(appliedNames, fileNames, registryNames)
}

function assertNoMigrationDrift(drift: MigrationDriftResult): void {
  if (drift.fileOnly.length === 0 && drift.registryOnly.length === 0 && drift.appliedButUnregistered.length === 0) {
    log.info('[OK] Migration registry/file parity verified.')
    return
  }

  if (drift.fileOnly.length > 0) {
    log.error(`[DRIFT] Incremental migration files not registered: ${drift.fileOnly.join(', ')}`)
  }
  if (drift.registryOnly.length > 0) {
    log.error(`[DRIFT] Registry migrations missing files: ${drift.registryOnly.join(', ')}`)
  }
  if (drift.appliedButUnregistered.length > 0) {
    log.error(`[DRIFT] Applied migrations absent from registry: ${drift.appliedButUnregistered.join(', ')}`)
  }

  throw new Error('Migration registry/file drift detected. See logs for details.')
}

export function verifyMigrations() {
  log.info('Verifying database migrations...')

  try {
    // When running inside the app, getDatabase() returns the already initialized (and potentially decrypted) DB instance
    const db = getDatabase()

    // 1. Check migrations table
    let migrations: { id: number, name: string, applied_at: string }[]
    try {
      migrations = db.prepare('SELECT * FROM migrations ORDER BY id').all() as { id: number, name: string, applied_at: string }[]
    } catch (error) {
      log.error('  [FAIL] Could not read migrations table (might not exist).', error)
      throw new Error('Migrations table is missing or unreadable.')
    }

    log.info('Applied Migrations:')
    if (migrations.length === 0) {
      log.warn('  No migrations found.')
    } else {
      migrations.forEach(m => log.info(`  [${m.id}] ${m.name} (Applied at: ${m.applied_at})`))
    }

    const drift = computeMigrationDrift(migrations.map((migration) => migration.name))
    assertNoMigrationDrift(drift)

    // 2. Check for critical tables
    const expectedTables = [
      'attendance',
      'payroll_period',
      'inventory_item',
      'subject',
      'student',
      'user',
      'stream',
      'academic_exam',
      'student_award',
      'merit_list'
    ]

    log.info('Checking critical tables:')
    const existingTables = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name IN (${expectedTables.map(() => '?').join(',')})
    `).all(...expectedTables) as { name: string }[]

    const existingTableNames = new Set(existingTables.map(t => t.name))

    let allFound = true
    for (const table of expectedTables) {
      if (existingTableNames.has(table)) {
        log.info(`  [OK] ${table}`)
      } else {
        log.warn(`  [MISSING] ${table}`)
        allFound = false
      }
    }

    if (allFound) {
      log.info('[OK] All critical tables verified.')
    } else {
      log.error('[FAIL] Some tables are missing. Migration verification FAILED.')
      throw new Error('Critical table verification failed.')
    }

  } catch (error) {
    log.error('Migration verification failed with error:', error)
    throw error
  }
}
