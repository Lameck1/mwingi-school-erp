/* eslint-disable no-console */
import Database from 'better-sqlite3'
import * as path from 'path'
import { app } from '../electron-env'
import * as fs from 'fs'

export let db: Database.Database | null = null

export function getDatabase(): Database.Database {
    if (!db) throw new Error('Database not initialized')
    return db
}

export function getDatabasePath(): string {
    const userDataPath = app.getPath('userData')
    const dbDir = path.join(userDataPath, 'data')
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true })
    }
    return path.join(dbDir, 'school_erp.db')
}

export async function initializeDatabase(): Promise<void> {
    const dbPath = getDatabasePath()
    db = new Database(dbPath)
    db.pragma('foreign_keys = ON')
    db.pragma('journal_mode = WAL')

    // Run migrations
    await import('./migrations/index.js').then(m => m.runMigrations(db!))
}

export function closeDatabase(): void {
    if (db) { db.close(); db = null; }
}

export async function backupDatabase(backupPath: string): Promise<void> {
    if (!db) throw new Error('Database not initialized')
    await db.backup(backupPath)
}

