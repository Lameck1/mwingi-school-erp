/* eslint-disable no-console */
import Database from 'better-sqlite3-multiple-ciphers'
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

    // Get secure key
    const { getEncryptionKey } = await import('./security')
    const key = getEncryptionKey()

    // Helper to open and test
    const openAndTest = (p: string, k?: string) => {
        const d = new Database(p, { verbose: console.log })
        if (k) d.pragma(`key='${k}'`)
        // Test valid access
        d.prepare('SELECT count(*) FROM sqlite_master').get()
        return d
    }

    try {
        console.log('Attempting to open database securely...')
        db = openAndTest(dbPath, key)
    } catch (error) {
        console.log('Failed to open with key. Assuming unencrypted. Attempting migration...')
        // If failed, it might be unencrypted. Try opening without key.
        try {
            // Close previous instance if it was partially created (though it threw)
            if (db) { try { db.close() } catch (e) { /* ignore */ } }

            // Open unencrypted
            db = new Database(dbPath)

            // Check if it really is unencrypted (valid DB)
            db.prepare('SELECT count(*) FROM sqlite_master').get()

            // Disable WAL mode for rekeying
            const modeBefore = db.pragma('journal_mode', { simple: true });
            console.log(`Current journal_mode: ${modeBefore}`);

            db.pragma('journal_mode = DELETE');

            const modeAfter = db.pragma('journal_mode', { simple: true });
            console.log(`New journal_mode: ${modeAfter}`);

            if (modeAfter !== 'delete') {
                throw new Error(`Failed to switch to DELETE mode. Current mode: ${modeAfter}`);
            }

            console.log('Database is unencrypted. Encrypting now...')
            // Encrypt it!
            db.pragma(`rekey='${key}'`)

            // Verify
            console.log('Encryption complete. Verifying...')
        } catch (migrationError) {
            console.error('Migration failed:', migrationError)
            throw migrationError
        }
    }

    if (!db) throw new Error('Failed to initialize database')

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

