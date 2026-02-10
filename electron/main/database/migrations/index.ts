
import { up as schemaUp } from './current/0001_initial_schema.js'
import { up as seedCoreUp } from './current/0010_seed_core_data.js'
import { up as seedAcademicUp } from './current/0020_seed_academic_data.js'

import type * as Database from 'better-sqlite3'

export function runMigrations(db: Database.Database): void {
    db.exec(`CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

    const migrations = [
        { name: '0001_initial_schema', fn: schemaUp },
        { name: '0010_seed_core_data', fn: seedCoreUp },
        { name: '0020_seed_academic_data', fn: seedAcademicUp }
    ]

    const applied = db.prepare('SELECT name FROM migrations').all() as { name: string }[]
    const appliedNames = new Set(applied.map(m => m.name))

    for (const m of migrations) {
        if (!appliedNames.has(m.name)) {
            console.warn(`Applying: ${m.name}`)
            m.fn(db)
            db.prepare('INSERT INTO migrations (name) VALUES (?)').run(m.name)
        }
    }
}
