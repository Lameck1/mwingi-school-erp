import * as crypto from 'node:crypto'
import * as fsp from 'node:fs/promises'
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
    // Keep all backups from the last N days, plus the newest backup for each older month.
    // This limits ransomware blast radius while preserving monthly restore points.
    private static readonly DAILY_RETENTION_DAYS = 7
    private static schedulerInterval: ReturnType<typeof setInterval> | null = null

    private static createTempPath(targetPath: string): string {
        const dir = path.dirname(targetPath)
        const base = path.basename(targetPath)
        return path.join(dir, `.${base}.tmp-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`)
    }

    private static async replaceFileAtomically(tempPath: string, targetPath: string): Promise<void> {
        const previousPath = `${targetPath}.previous-${Date.now()}`
        let movedPrevious = false

        try {
            try {
                await fsp.access(targetPath)
                await fsp.rename(targetPath, previousPath)
                movedPrevious = true
            } catch { /* targetPath doesn't exist, nothing to move */ }

            await fsp.rename(tempPath, targetPath)

            if (movedPrevious) {
                try { await fsp.unlink(previousPath) } catch { /* ignore cleanup */ }
            }
        } catch (error) {
            if (movedPrevious) {
                try { await fsp.unlink(targetPath) } catch { /* ignore restore cleanup errors */ }
                try { await fsp.rename(previousPath, targetPath) } catch { /* ignore restore rollback errors */ }
            }
            throw error
        } finally {
            try { await fsp.unlink(tempPath) } catch { /* ignore temp cleanup errors */ }
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
        await fsp.mkdir(this.BACKUP_DIR, { recursive: true })

        // Start Auto-Backup Scheduler
        this.startScheduler()
    }

    static stopScheduler() {
        if (this.schedulerInterval) {
            clearInterval(this.schedulerInterval)
            this.schedulerInterval = null
        }
    }

    private static startScheduler() {
        if (this.schedulerInterval) { return }
        // Check every hour
        this.schedulerInterval = setInterval(() => {
            void (async () => {
            const backups = await this.listBackups()
            if (backups.length === 0) {
                log.info('No backups found. Creating initial auto-backup...')
                await this.createBackup('auto')
                return
            }

            const lastBackup = backups[0] // list is sorted desc
            if (!lastBackup) { return }
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
            if (!(await this.verifyBackupIntegrity(tempPath))) {
                throw new Error('Created backup failed integrity validation')
            }
            await this.replaceFileAtomically(tempPath, backupPath)
            log.info('Backup completed.')

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

        // Validate path to prevent path traversal (F08)
        const resolved = path.resolve(targetPath)
        if (resolved.includes('..') || targetPath.includes('..')) {
            return { success: false, error: 'Invalid backup path: path traversal detected' }
        }
        const userDataDir = path.resolve(app.getPath('userData'))
        const desktopDir = path.resolve(app.getPath('desktop'))
        const documentsDir = path.resolve(app.getPath('documents'))
        const downloadsDir = path.resolve(app.getPath('downloads'))
        const allowedPrefixes = [userDataDir, desktopDir, documentsDir, downloadsDir]
        if (!allowedPrefixes.some(prefix => resolved.startsWith(prefix + path.sep) || resolved === prefix)) {
            return { success: false, error: 'Invalid backup path: must be within user data, desktop, documents, or downloads directory' }
        }

        try {
            const dir = path.dirname(resolved)
            await fsp.mkdir(dir, { recursive: true })
            const tempPath = this.createTempPath(targetPath)

            log.info(`Starting backup to ${targetPath}...`)
            await backupDatabase(tempPath)
            if (!(await this.verifyBackupIntegrity(tempPath))) {
                throw new Error('Created backup failed integrity validation')
            }
            await this.replaceFileAtomically(tempPath, targetPath)
            log.info('Backup completed.')

            return { success: true, path: targetPath }
        } catch (error) {
            log.error('Backup failed:', error)
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
        }
    }

    static async listBackups(): Promise<BackupInfo[]> {
        try {
            await fsp.access(this.BACKUP_DIR)
        } catch {
            return []
        }

        try {
            const entries = await fsp.readdir(this.BACKUP_DIR)
            const sqliteFiles = entries.filter(f => f.endsWith('.sqlite'))
            const files: BackupInfo[] = await Promise.all(
                sqliteFiles.map(async (f) => {
                    const stats = await fsp.stat(path.join(this.BACKUP_DIR, f))
                    return { filename: f, size: stats.size, created_at: stats.mtime }
                })
            )
            files.sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
            return files
        } catch (e) {
            log.error('Failed to list backups', e)
            return []
        }
    }

    private static async cleanupOldBackups() {
        const backups = await this.listBackups()
        if (backups.length === 0) {
            return
        }

        const now = new Date()
        const dailyCutoff = new Date(now)
        dailyCutoff.setDate(dailyCutoff.getDate() - this.DAILY_RETENTION_DAYS)

        const keep = new Set<string>()
        const monthlySnapshots = new Map<string, BackupInfo>()

        for (const backup of backups) {
            if (backup.created_at >= dailyCutoff) {
                keep.add(backup.filename)
                continue
            }

            const monthKey = `${backup.created_at.getUTCFullYear()}-${String(backup.created_at.getUTCMonth() + 1).padStart(2, '0')}`
            if (!monthlySnapshots.has(monthKey)) {
                monthlySnapshots.set(monthKey, backup)
            }
        }

        for (const snapshot of monthlySnapshots.values()) {
            keep.add(snapshot.filename)
        }

        for (const backup of backups) {
            if (keep.has(backup.filename)) {
                continue
            }
            try {
                await fsp.unlink(path.join(this.BACKUP_DIR, backup.filename))
                log.info(`Deleted old backup: ${backup.filename}`)
            } catch (e) {
                log.error(`Failed to delete old backup ${backup.filename}`, e)
            }
        }
    }

    private static async loadSqliteDriver() {
        try {
            const cipherModule = await import('better-sqlite3-multiple-ciphers')
            return cipherModule.default || cipherModule
        } catch {
            const fallback = await import('better-sqlite3')
            return fallback.default || fallback
        }
    }

    private static async tryIntegrityCheck(backupPath: string, key?: string): Promise<boolean> {
        const DatabaseDriver = await this.loadSqliteDriver()
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

    private static async verifyBackupIntegrity(backupPath: string): Promise<boolean> {
        try {
            const key = getEncryptionKey()
            if (await this.tryIntegrityCheck(backupPath, key)) {
                return true
            }
            if (await this.tryIntegrityCheck(backupPath)) {
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

        try { await fsp.access(backupPath) } catch { throw new Error('Backup file not found') }

        // Integrity check before restore
        if (!(await this.verifyBackupIntegrity(backupPath))) {
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
            await fsp.copyFile(backupPath, tempRestorePath)
            await this.replaceFileAtomically(tempRestorePath, dbPath)

            // Also copy WAL/SHM sidecar files from backup if they exist
            await this.restoreSidecarFiles(backupPath, dbPath)

            // Relaunch app to re-init DB with restored data
            app.relaunch()
            app.exit(0)

            return true
        } catch (e) {
            log.error('Restore failed:', e)
            try { await fsp.unlink(tempRestorePath) } catch { /* ignore cleanup errors */ }
            return false
        }
    }

    private static async restoreSidecarFiles(backupPath: string, dbPath: string): Promise<void> {
        for (const ext of ['-wal', '-shm']) {
            const src = `${backupPath}${ext}`
            const dest = `${dbPath}${ext}`
            try { await fsp.access(src); await fsp.copyFile(src, dest) } catch {
                try { await fsp.unlink(dest) } catch { /* no sidecar to clean */ }
            }
        }
    }
}
