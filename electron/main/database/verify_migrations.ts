import { getDatabase } from './index'
import log from '../utils/logger'

export function verifyMigrations() {
  log.info('Verifying database migrations...')

  try {
    // When running inside the app, getDatabase() returns the already initialized (and potentially decrypted) DB instance
    const db = getDatabase()

    // 1. Check migrations table
    try {
      const migrations = db.prepare('SELECT * FROM migrations ORDER BY id').all() as { id: number, name: string, applied_at: string }[]
      log.info('Applied Migrations:')
      if (migrations.length === 0) {
        log.warn('  No migrations found.')
      } else {
        migrations.forEach(m => log.info(`  [${m.id}] ${m.name} (Applied at: ${m.applied_at})`))
      }
    } catch {
      log.warn('  [FAIL] Could not read migrations table (might not exist).')
    }

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
    }

  } catch (error) {
    log.error('Migration verification failed with error:', error)
  }
}
