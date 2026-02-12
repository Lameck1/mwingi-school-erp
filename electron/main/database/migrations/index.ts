
import { up as schemaUp } from './current/0001_initial_schema.js'
import { up as seedCoreUp } from './current/0010_seed_core_data.js'
import { up as seedAcademicUp } from './current/0020_seed_academic_data.js'
import { up as journalBridgeUp } from './incremental/1001_journal_entry_bridge.js'
import { up as financeSchemaFixesUp } from './incremental/1002_finance_schema_fixes.js'

import type * as Database from 'better-sqlite3'

/**
 * Migration descriptor.
 *
 * Naming convention:
 *   current/0001_*  – Initial schema & seeds (run once on fresh install)
 *   incremental/1001_*  – Post-deployment changes (run on app updates)
 *
 * Every migration runs inside a SAVEPOINT so a single failing migration
 * does not leave the database in a half-applied state.
 */
interface Migration {
    /** Unique name — stored in `migrations` table once applied. */
    name: string
    /** Forward-only function that mutates the schema / data. */
    fn: (db: Database.Database) => void
}

// ── Registry ────────────────────────────────────────────────────
// Add new migrations here. Order matters: they run sequentially.
const migrations: Migration[] = [
    // Initial schema & seeds
    { name: '0001_initial_schema', fn: schemaUp },
    { name: '0010_seed_core_data', fn: seedCoreUp },
    { name: '0020_seed_academic_data', fn: seedAcademicUp },

    // ── Post-deployment incremental migrations ──────────────────
    // Add entries below as the app evolves after first release.
    { name: '1001_journal_entry_bridge', fn: journalBridgeUp },
    { name: '1002_finance_schema_fixes', fn: financeSchemaFixesUp },
]

/**
 * Run all pending migrations in order.
 *
 * Each migration is wrapped in a SAVEPOINT so a failure rolls back
 * only that migration and the remaining ones are skipped.
 */
export function runMigrations(db: Database.Database): void {
    db.exec(`CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

    const applied = db.prepare('SELECT name FROM migrations').all() as { name: string }[]
    const appliedNames = new Set(applied.map(m => m.name))

    // Disable foreign-key enforcement for the entire migration run.
    // This MUST happen outside any transaction (PRAGMA is a no-op inside one).
    // Migrations that recreate tables (e.g. to alter CHECK constraints) need
    // this so DROP TABLE / INSERT-SELECT cycles aren't blocked by FK refs.
    db.exec('PRAGMA foreign_keys = OFF')

    try {
        for (const m of migrations) {
            if (appliedNames.has(m.name)) { continue }

            console.warn(`Running migration: ${m.name}`)
            const savepointName = `migration_${m.name.replaceAll(/\W/g, '_')}`

            try {
                db.exec(`SAVEPOINT ${savepointName}`)
                m.fn(db)
                db.prepare('INSERT INTO migrations (name) VALUES (?)').run(m.name)
                db.exec(`RELEASE SAVEPOINT ${savepointName}`)
                console.warn(`  ✓ Applied: ${m.name}`)
            } catch (err) {
                db.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`)
                db.exec(`RELEASE SAVEPOINT ${savepointName}`)
                console.error(`  ✗ Migration failed: ${m.name}`, err)
                throw new Error(
                    `Migration "${m.name}" failed. Database rolled back to pre-migration state. ` +
                    `Cause: ${err instanceof Error ? err.message : String(err)}`
                )
            }
        }
    } finally {
        db.exec('PRAGMA foreign_keys = ON')
    }
}
