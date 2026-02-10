import * as fs from 'fs'
import * as path from 'path'

import { app } from '../electron-env'

import type Database from 'better-sqlite3'

export let db: Database.Database | null = null

export function getDatabase(): Database.Database {
    if (!db) {throw new Error('Database not initialized')}
    return db
}

export function getDatabasePath(): string {
    const userDataPath = app.getPath('userData')
    const dbDir = path.join(userDataPath, 'data')
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true })
    }
    return path.join(dbDir, 'school_erp_clean_v3.db')
}

async function loadDatabaseClass(): Promise<typeof Database> {
    try {
        const cipherModule = await import('better-sqlite3-multiple-ciphers')
        const DatabaseClass = cipherModule.default
        new DatabaseClass(':memory:').close()
        return DatabaseClass
    } catch (error) {
        console.warn('Native cipher module failed to load or bind. Falling back to standard better-sqlite3.', error)
        const standardModule = await import('better-sqlite3')
        return standardModule.default
    }
}

function applyKeyPragma(database: Database.Database, key: string, pragmaName: 'key' | 'rekey'): void {
    try {
        database.pragma(`${pragmaName}="x'${key}'"`)
    } catch (error) {
        console.warn(`Failed to set ${pragmaName} pragma (driver might not support it):`, error)
    }
}

function openAndTest(DatabaseClass: typeof Database, dbPath: string, key?: string): Database.Database {
    const database = new DatabaseClass(dbPath)
    if (key) {
        applyKeyPragma(database, key, 'key')
    }
    database.prepare('SELECT count(*) FROM sqlite_master').get()
    return database
}

function closeSilently(database: Database.Database | null): void {
    if (!database) {
        return
    }
    try {
        database.close()
    } catch {
        // Ignore close errors during recovery.
    }
}

function prepareUnencryptedDatabase(DatabaseClass: typeof Database, dbPath: string, key: string): Database.Database {
    const database = new DatabaseClass(dbPath)
    database.prepare('SELECT count(*) FROM sqlite_master').get()

    const modeBefore = database.pragma('journal_mode', { simple: true })
    console.error(`Current journal_mode: ${modeBefore}`)
    database.pragma('journal_mode = DELETE')

    const modeAfter = database.pragma('journal_mode', { simple: true })
    console.error(`New journal_mode: ${modeAfter}`)
    if (modeAfter !== 'delete') {
        throw new Error(`Failed to switch to DELETE mode. Current mode: ${modeAfter}`)
    }

    if (key) {
        console.error('Database is unencrypted. Encrypting now...')
        applyKeyPragma(database, key, 'rekey')
        console.error('Encryption complete. Verifying...')
    }

    return database
}

function recoverDatabaseFile(DatabaseClass: typeof Database, dbPath: string, key: string): Database.Database {
    if (fs.existsSync(dbPath)) {
        const corruptPath = `${dbPath}.corrupt.${Date.now()}`
        console.warn(`Database file seems incompatible or corrupt. Renaming to ${corruptPath} and creating a new one.`)
        fs.renameSync(dbPath, corruptPath)
    }

    const database = new DatabaseClass(dbPath)
    if (key) {
        applyKeyPragma(database, key, 'key')
    }
    return database
}

async function openOrRecoverDatabase(DatabaseClass: typeof Database, dbPath: string, key: string): Promise<Database.Database> {
    try {
        console.error('Attempting to open database...')
        return openAndTest(DatabaseClass, dbPath, key)
    } catch {
        console.error('Failed to open with key. Assuming unencrypted or corrupted. Attempting migration/reset...')
    }

    closeSilently(db)
    db = null

    try {
        return prepareUnencryptedDatabase(DatabaseClass, dbPath, key)
    } catch (migrationError: unknown) {
        console.error('Migration/Recovery failed:', migrationError)
        console.error('Migration/Recovery stack:', (migrationError as Error).stack)
    }

    closeSilently(db)
    db = null

    try {
        return recoverDatabaseFile(DatabaseClass, dbPath, key)
    } catch (criticalError) {
        console.error('Critical Database Failure: Could not reset database.', criticalError)
        throw criticalError
    }
}

export async function initializeDatabase(): Promise<void> {
    const dbPath = getDatabasePath()
    const DatabaseClass = await loadDatabaseClass()
    const { getEncryptionKey } = await import('./security')
    const key = getEncryptionKey()
    db = await openOrRecoverDatabase(DatabaseClass, dbPath, key)
    db.pragma('foreign_keys = ON')
    db.pragma('journal_mode = WAL')

    // Run migrations
    const migrations = await import('./migrations/index.js')
    migrations.runMigrations(db)
}

export function closeDatabase(): void {
    if (db) { db.close(); db = null; }
}

function isEncryptedConnection(database: Database.Database): boolean {
    try {
        const cipherVersion = database.pragma('cipher_version', { simple: true })
        return typeof cipherVersion === 'string' && cipherVersion.length > 0
    } catch {
        return false
    }
}

function checkpointWal(database: Database.Database): void {
    try {
        database.pragma('wal_checkpoint(TRUNCATE)')
    } catch (error) {
        console.warn('WAL checkpoint failed during backup:', error)
    }
}

function copyDatabaseFiles(sourceDbPath: string, targetDbPath: string): void {
    fs.copyFileSync(sourceDbPath, targetDbPath)

    const sourceWalPath = `${sourceDbPath}-wal`
    const sourceShmPath = `${sourceDbPath}-shm`
    const targetWalPath = `${targetDbPath}-wal`
    const targetShmPath = `${targetDbPath}-shm`

    if (fs.existsSync(sourceWalPath)) {
        fs.copyFileSync(sourceWalPath, targetWalPath)
    }
    if (fs.existsSync(sourceShmPath)) {
        fs.copyFileSync(sourceShmPath, targetShmPath)
    }
}

export async function backupDatabase(backupPath: string): Promise<void> {
    if (!db) {throw new Error('Database not initialized')}
    const dir = path.dirname(backupPath)
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
    if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath)
    }
    const dbPath = getDatabasePath()
    const encryptedConnection = isEncryptedConnection(db)

    if (!encryptedConnection) {
        try {
            await db.backup(backupPath)
            return
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            console.warn(`Native backup failed (${message}). Falling back to file-copy backup.`)
        }
    } else {
        console.warn('Encrypted SQLite connection detected. Using file-copy backup strategy.')
    }

    try {
        checkpointWal(db)
        copyDatabaseFiles(dbPath, backupPath)
    } catch (fallbackError) {
        console.error('Fallback backup failed:', fallbackError)
        throw fallbackError
    }
}


