import { getDatabase } from './index'

export function verifyMigrations() {
  console.warn('Verifying database migrations...')

  try {
    // When running inside the app, getDatabase() returns the already initialized (and potentially decrypted) DB instance
    const db = getDatabase()

    // 1. Check migrations table
    try {
      const migrations = db.prepare('SELECT * FROM migrations ORDER BY id').all() as { id: number, name: string, applied_at: string }[]
      console.warn('\nApplied Migrations:')
      if (migrations.length === 0) {
        console.warn('  No migrations found.')
      } else {
        migrations.forEach(m => console.warn(`  [${m.id}] ${m.name} (Applied at: ${m.applied_at})`))
      }
    } catch (e) {
      console.warn('  ❌ Could not read migrations table (might not exist).')
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

    console.warn('\nChecking critical tables:')
    const existingTables = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name IN (${expectedTables.map(() => '?').join(',')})
    `).all(...expectedTables) as { name: string }[]

    const existingTableNames = new Set(existingTables.map(t => t.name))

    let allFound = true
    for (const table of expectedTables) {
      if (existingTableNames.has(table)) {
        console.warn(`  ✅ ${table}`)
      } else {
        console.warn(`  ❌ ${table} (MISSING)`)
        allFound = false
      }
    }

    if (allFound) {
      console.warn('\n✅ All critical tables verified.')
    } else {
      console.error('\n❌ Some tables are missing. Migration verification FAILED.')
    }

  } catch (error) {
    console.error('Migration verification failed with error:', error)
  }
}
