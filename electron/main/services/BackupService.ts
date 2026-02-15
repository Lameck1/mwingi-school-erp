import * as fs from 'node:fs'
import * as path from 'node:path'

import { isDatabaseInitialized, getDatabasePath, backupDatabase, closeDatabase } from '../database'
import { getEncryptionKey } from '../database/security'
import { app } from '../electron-env'
import log from '../utils/logger'

export interface BackupInfo {
    filename: string
    size: number
    created_at: Date
}

export class BackupService {
    private static get BACKUP_DIR() { return path.join(app.getPath('userData'), 'backups') }
    // Keep last 7 days + 1 monthly (not implemented strictly yet, just count based rotation)
    private static readonly MAX_BACKUPS = 7
    private static readonly RETENTION_DAYS = 30
    private static schedulerInterval: ReturnType<typeof setInterval> | null = null

    private static createTempPath(targetPath: string): string {
        const dir = path.dirname(targetPath)
        const base = path.basename(targetPath)
        return path.join(dir, `.${base}.tmp-${Date.now()}-${Math.floor(Math.random() * 100000)}`)
    }

    private static replaceFileAtomically(tempPath: string, targetPath: string): void {
        const previousPath = `${targetPath}.previous-${Date.now()}`
        let movedPrevious = false

        try {
            if (fs.existsSync(targetPath)) {
                fs.renameSync(targetPath, previousPath)
                movedPrevious = true
            }

            fs.renameSync(tempPath, targetPath)

            if (movedPrevious && fs.existsSync(previousPath)) {
                fs.unlinkSync(previousPath)
            }
        } catch (error) {
            if (movedPrevious && fs.existsSync(previousPath)) {
                if (fs.existsSync(targetPath)) {
                    try { fs.unlinkSync(targetPath) } catch { /* ignore restore cleanup errors */ }
                }
                try { fs.renameSync(previousPath, targetPath) } catch { /* ignore restore rollback errors */ }
            }
            throw error
        } finally {
            if (fs.existsSync(tempPath)) {
                try { fs.unlinkSync(tempPath) } catch { /* ignore temp cleanup errors */ }
            }
        }
    }

    private static resolveRestorePath(filename: string): string | null {
        const trimmed = filename?.trim()
        if (!trimmed) {
            return null
        }

        if (path.basename(trimmed) !== trimmed) {
            return null
        }

        if (!trimmed.endsWith('.sqlite')) {
            return null
        }

        const baseDir = path.resolve(this.BACKUP_DIR)
        const candidate = path.resolve(baseDir, trimmed)
        if (!candidate.startsWith(`${baseDir}${path.sep}`)) {
            return null
        }

        return candidate
    }

    static async init() {
        if (!fs.existsSync(this.BACKUP_DIR)) {
            fs.mkdirSync(this.BACKUP_DIR, { recursive: true })
        }

        // Start Auto-Backup Scheduler
        this.startScheduler()
    }

    private static startScheduler() {
        if (this.schedulerInterval) { return }
        // Check every hour
        this.schedulerInterval = setInterval(() => {
            void (async () => {
            const backups = this.listBackups()
            if (backups.length === 0) {
                log.info('No backups found. Creating initial auto-backup...')
                await this.createBackup('auto')
                return
            }

            const lastBackup = backups[0] // list is sorted desc
            const hoursSinceLast = (Date.now() - lastBackup.created_at.getTime()) / (1000 * 60 * 60)

            if (hoursSinceLast >= 24) {
                log.info(`Last backup was ${hoursSinceLast.toFixed(1)}h ago. Creating auto-backup...`)
                await this.createBackup('auto')
            }
            })()
        }, 1000 * 60 * 60) // 1 hour
    }

    static async createBackup(prefix: string = 'manual'): Promise<{ success: boolean; path?: string; error?: string }> {
        if (!isDatabaseInitialized()) {return { success: false, error: 'Database not initialized' }}

        try {
            await this.init()
            const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-')
            const filename = `backup-${prefix}-${timestamp}.sqlite`
            const backupPath = path.join(this.BACKUP_DIR, filename)
            const tempPath = this.createTempPath(backupPath)

            log.info(`Starting backup to ${backupPath}...`)
            await backupDatabase(tempPath)
            if (!this.verifyBackupIntegrity(tempPath)) {
                throw new Error('Created backup failed integrity validation')
            }
            this.replaceFileAtomically(tempPath, backupPath)
            log.info('Backup completed.')

            // Validate encryption? 
            // The backup uses the same key as the source DB automatically with better-sqlite3 backup API?
            // "If the destination database does not exist, it is created with the same page size and encryption settings as the source database."
            // So yes, it is encrypted.

            await this.cleanupOldBackups()

            return { success: true, path: backupPath }
        } catch (error) {
            log.error('Backup failed:', error)
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
        }
    }

    static async createBackupToPath(targetPath: string): Promise<{ success: boolean; path?: string; error?: string }> {
        if (!isDatabaseInitialized()) {return { success: false, error: 'Database not initialized' }}
        if (!targetPath) {return { success: false, error: 'Backup path is required' }}

        try {
            const dir = path.dirname(targetPath)
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true })
            }
            const tempPath = this.createTempPath(targetPath)

            log.info(`Starting backup to ${targetPath}...`)
            await backupDatabase(tempPath)
            if (!this.verifyBackupIntegrity(tempPath)) {
                throw new Error('Created backup failed integrity validation')
            }
            this.replaceFileAtomically(tempPath, targetPath)
            log.info('Backup completed.')

            return { success: true, path: targetPath }
        } catch (error) {
            log.error('Backup failed:', error)
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
        }
    }

    static listBackups(): BackupInfo[] {
        if (!fs.existsSync(this.BACKUP_DIR)) {return []}

        try {
            const files = fs.readdirSync(this.BACKUP_DIR)
                .filter(f => f.endsWith('.sqlite'))
                .map(f => {
                    const stats = fs.statSync(path.join(this.BACKUP_DIR, f))
                    return {
                        filename: f,
                        size: stats.size,
                        created_at: stats.birthtime
                    }
                })
                .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
            return files
        } catch (e) {
            log.error('Failed to list backups', e)
            return []
        }
    }

    private static async cleanupOldBackups() {
        const backups = this.listBackups()
        const now = new Date()

        // Strict retention policy: delete files older than RETENTION_DAYS
        // UNLESS it's the only backup left.
        const toDelete = backups.filter(backup => {
            const daysOld = (now.getTime() - backup.created_at.getTime()) / (1000 * 60 * 60 * 24)
            return daysOld > this.RETENTION_DAYS
        })

        // Also enforce count limit if we have too many recent ones
        if (backups.length - toDelete.length > this.MAX_BACKUPS) {
            const excess = backups
                .filter(b => !toDelete.includes(b))
                .slice(this.MAX_BACKUPS)
            toDelete.push(...excess)
        }

        // Safety check: never delete ALL backups if we have some.
        // listBackups returns sorted by creation time descending (newest first).
        // If we are about to delete everything, keep the newest one.
        if (toDelete.length === backups.length && backups.length > 0) {
            toDelete.shift() // Keep the newest one
        }

        for (const backup of toDelete) {
            try {
                fs.unlinkSync(path.join(this.BACKUP_DIR, backup.filename))
                log.info(`Deleted old backup (retention policy): ${backup.filename}`)
            } catch (e) {
                log.error(`Failed to delete old backup ${backup.filename}`, e)
            }
        }
    }

    private static loadSqliteDriver() {
        try {
             
            const cipherModule = require('better-sqlite3-multiple-ciphers')
            return cipherModule.default || cipherModule
        } catch {
             
            return require('better-sqlite3')
        }
    }

    private static tryIntegrityCheck(backupPath: string, key?: string): boolean {
        const DatabaseDriver = this.loadSqliteDriver()
        type SqliteHandle = {
            pragma(cmd: string, opts?: { simple: boolean }): unknown
            close(): void
            prepare(sql: string): { get(): unknown }
        }

        let handle: SqliteHandle | null = null
        try {
            handle = new DatabaseDriver(backupPath, { readonly: true }) as SqliteHandle
            if (key) {
                try {
                    handle.pragma(`key="x'${key}'"`)
                } catch {
                    // Driver might not support key pragma; fall through to probe query.
                }
            }

            handle.prepare('SELECT count(*) FROM sqlite_master').get()
            const result = handle.pragma('integrity_check', { simple: true }) as string
            return result === 'ok'
        } catch {
            return false
        } finally {
            try { handle?.close() } catch { /* ignore close errors */ }
        }
    }

    private static verifyBackupIntegrity(backupPath: string): boolean {
        try {
            const key = getEncryptionKey()
            if (this.tryIntegrityCheck(backupPath, key)) {
                return true
            }
            if (this.tryIntegrityCheck(backupPath)) {
                return true
            }
            log.warn(`Backup ${backupPath} failed integrity checks for encrypted and plain modes`)
            return false
        } catch (error) {
            log.error('Backup integrity check failed:', error)
            return false
        }
    }

    static async restoreBackup(filename: string): Promise<boolean> {
        const backupPath = this.resolveRestorePath(filename)
        if (!backupPath) {
            throw new Error('Invalid backup filename')
        }
        const dbPath = getDatabasePath()
        const tempRestorePath = this.createTempPath(dbPath)

        if (!fs.existsSync(backupPath)) {throw new Error('Backup file not found')}

        // Integrity check before restore
        if (!this.verifyBackupIntegrity(backupPath)) {
            log.error('Restore aborted: backup file failed integrity check')
            return false
        }

        try {
            // Create a safety backup of the current DB before restoring
            log.info('Creating safety backup before restore...')
            const safetyBackup = await this.createBackup('pre-restore')
            if (!safetyBackup.success) {
                log.error(`Restore aborted: failed to create pre-restore backup (${safetyBackup.error || 'unknown error'})`)
                return false
            }

            // Close DB connection BEFORE overwriting the file to prevent corruption
            closeDatabase()

            // Restore through temp swap to avoid partial file replacement.
            fs.copyFileSync(backupPath, tempRestorePath)
            this.replaceFileAtomically(tempRestorePath, dbPath)

            // Also copy WAL/SHM sidecar files from backup if they exist
            const walPath = `${backupPath}-wal`
            const shmPath = `${backupPath}-shm`
            const targetWalPath = `${dbPath}-wal`
            const targetShmPath = `${dbPath}-shm`

            if (fs.existsSync(walPath)) {
                fs.copyFileSync(walPath, targetWalPath)
            } else if (fs.existsSync(targetWalPath)) {
                fs.unlinkSync(targetWalPath)
            }
            if (fs.existsSync(shmPath)) {
                fs.copyFileSync(shmPath, targetShmPath)
            } else if (fs.existsSync(targetShmPath)) {
                fs.unlinkSync(targetShmPath)
            }

            // Relaunch app to re-init DB with restored data
            app.relaunch()
            app.exit(0)

            return true
        } catch (e) {
            log.error('Restore failed:', e)
            if (fs.existsSync(tempRestorePath)) {
                try { fs.unlinkSync(tempRestorePath) } catch { /* ignore cleanup errors */ }
            }
            return false
        }
    }
}

