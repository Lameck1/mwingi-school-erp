import * as Database from 'better-sqlite3'
import { up as schemaUp } from './001_schema.js'
import { up as seedDataUp } from './002_seed_data.js'
import { up as academicUpdatesUp } from './003_academic_updates.js'

export function runMigrations(db: Database.Database): void {
    db.exec(`CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

    const migrations = [
        { name: '001_schema', fn: schemaUp },
        { name: '002_seed_data', fn: seedDataUp },
        { name: '003_academic_updates', fn: academicUpdatesUp }
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
