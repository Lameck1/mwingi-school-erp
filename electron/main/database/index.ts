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
    return path.join(dbDir, 'school_erp_clean_v2.db')
}

export async function initializeDatabase(): Promise<void> {
    const dbPath = getDatabasePath()

    // Load Database Driver
    let DatabaseClass: typeof Database;
    try {
        // Try native cipher version first
        // @ts-ignore
        const m = await import('better-sqlite3-multiple-ciphers');
        DatabaseClass = m.default;
        
        // Test instantiation to ensure bindings exist
        new DatabaseClass(':memory:').close();
    } catch (e) {
        console.warn('Native cipher module failed to load or bind. Falling back to standard better-sqlite3.', e);
        const m = await import('better-sqlite3');
        DatabaseClass = m.default;
    }

    // Get secure key
    const { getEncryptionKey } = await import('./security')
    const key = getEncryptionKey()

    // Helper to safely set encryption key using hex prefix (avoids SQL injection)
    const applyKey = (d: typeof db, k: string) => {
        try {
            // Use x'' hex literal syntax to avoid string interpolation vulnerabilities
            d!.pragma(`key="x'${k}'"`)
        } catch (e) {
            console.warn('Failed to set encryption key (driver might not support it):', e)
        }
    }

    // Helper to open and test
    const openAndTest = (p: string, k?: string) => {
        const d = new DatabaseClass(p)
        if (k) {
            applyKey(d, k)
        }
        // Test valid access
        d.prepare('SELECT count(*) FROM sqlite_master').get()
        return d
    }

    try {
        console.error('Attempting to open database...')
        db = openAndTest(dbPath, key)
    } catch (error) {
        console.error('Failed to open with key. Assuming unencrypted or corrupted. Attempting migration/reset...')
        // If failed, it might be unencrypted. Try opening without key.
        try {
            // Close previous instance if it was partially created
            if (db) { try { db.close() } catch (e) { /* ignore */ } }

            // Open unencrypted using the same class
            db = new DatabaseClass(dbPath)

            // Check if it really is unencrypted (valid DB)
            db!.prepare('SELECT count(*) FROM sqlite_master').get()

            // Disable WAL mode for rekeying
            const modeBefore = db!.pragma('journal_mode', { simple: true });
            console.error(`Current journal_mode: ${modeBefore}`);

            db!.pragma('journal_mode = DELETE');

            const modeAfter = db!.pragma('journal_mode', { simple: true });
            console.error(`New journal_mode: ${modeAfter}`);

            if (modeAfter !== 'delete') {
                throw new Error(`Failed to switch to DELETE mode. Current mode: ${modeAfter}`);
            }

            if (key) {
                console.error('Database is unencrypted. Encrypting now...')
                // Encrypt using hex prefix to avoid injection
                try {
                    db!.pragma(`rekey="x'${key}'"`)
                    console.error('Encryption complete. Verifying...')
                } catch (e) {
                    console.warn('Rekey failed (driver might not support encryption). Skipping encryption.', e)
                }
            }
        } catch (migrationError: unknown) {
            console.error('Migration/Recovery failed:', migrationError)
            console.error('Migration/Recovery stack:', (migrationError as Error).stack)
            
            // Critical failure: Cannot open as encrypted AND cannot open as unencrypted.
            // Likely the file is encrypted but we are on the fallback driver, OR the file is corrupt.
            // Since this is a "clean slate" scenario or dev environment, we should backup and reset.
            try {
                if (db) { try { db.close() } catch (e) { /* ignore */ } }
                
                if (fs.existsSync(dbPath)) {
                    const corruptPath = `${dbPath}.corrupt.${Date.now()}`;
                    console.warn(`Database file seems incompatible or corrupt. Renaming to ${corruptPath} and creating a new one.`);
                    fs.renameSync(dbPath, corruptPath);
                }
                
                // Try one last time with a fresh file
                db = new DatabaseClass(dbPath);
                
                // Re-apply key if available (and supported)
                if (key) {
                     try {
                        db!.pragma(`key="x'${key}'"`)
                    } catch (e) {
                         // ignore if fallback driver
                    }
                }
            } catch (criticalError) {
                console.error('Critical Database Failure: Could not reset database.', criticalError);
                throw criticalError;
            }
        }
    }

    if (!db) throw new Error('Failed to initialize database')

    db!.pragma('foreign_keys = ON')
    db!.pragma('journal_mode = WAL')

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


