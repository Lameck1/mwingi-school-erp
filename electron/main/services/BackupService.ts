import * as fs from 'fs'
import * as path from 'path'

import { db, getDatabasePath, backupDatabase } from '../database'
import { app } from '../electron-env'

export interface BackupInfo {
    filename: string
    size: number
    created_at: Date
}

export class BackupService {
    private static get BACKUP_DIR() { return path.join(app.getPath('userData'), 'backups') }
    // Keep last 7 days + 1 monthly (not implemented strictly yet, just count based rotation)
    private static MAX_BACKUPS = 7

    static async init() {
        if (!fs.existsSync(this.BACKUP_DIR)) {
            fs.mkdirSync(this.BACKUP_DIR, { recursive: true })
        }

        // Start Auto-Backup Scheduler
        this.startScheduler()
    }

    private static startScheduler() {
        // Check every hour
        setInterval(() => {
            void (async () => {
            const backups = this.listBackups()
            if (backups.length === 0) {
                console.error('No backups found. Creating initial auto-backup...')
                await this.createBackup('auto')
                return
            }

            const lastBackup = backups[0] // list is sorted desc
            const hoursSinceLast = (new Date().getTime() - lastBackup.created_at.getTime()) / (1000 * 60 * 60)

            if (hoursSinceLast >= 24) {
                console.error(`Last backup was ${hoursSinceLast.toFixed(1)}h ago. Creating auto-backup...`)
                await this.createBackup('auto')
            }
            })()
        }, 1000 * 60 * 60) // 1 hour
    }

    static async createBackup(prefix: string = 'manual'): Promise<{ success: boolean; path?: string; error?: string }> {
        if (!db) {return { success: false, error: 'Database not initialized' }}

        try {
            await this.init()
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
            const filename = `backup-${prefix}-${timestamp}.sqlite`
            const backupPath = path.join(this.BACKUP_DIR, filename)

            console.error(`Starting backup to ${backupPath}...`)
            if (fs.existsSync(backupPath)) {
                fs.unlinkSync(backupPath)
            }
            await backupDatabase(backupPath)
            console.error('Backup completed.')

            // Validate encryption? 
            // The backup uses the same key as the source DB automatically with better-sqlite3 backup API?
            // "If the destination database does not exist, it is created with the same page size and encryption settings as the source database."
            // So yes, it is encrypted.

            await this.cleanupOldBackups()

            return { success: true, path: backupPath }
        } catch (error) {
            console.error('Backup failed:', error)
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
        }
    }

    static async createBackupToPath(targetPath: string): Promise<{ success: boolean; path?: string; error?: string }> {
        if (!db) {return { success: false, error: 'Database not initialized' }}
        if (!targetPath) {return { success: false, error: 'Backup path is required' }}

        try {
            const dir = path.dirname(targetPath)
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true })
            }

            console.error(`Starting backup to ${targetPath}...`)
            if (fs.existsSync(targetPath)) {
                fs.unlinkSync(targetPath)
            }
            await backupDatabase(targetPath)
            console.error('Backup completed.')

            return { success: true, path: targetPath }
        } catch (error) {
            console.error('Backup failed:', error)
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
            console.error('Failed to list backups', e)
            return []
        }
    }

    private static async cleanupOldBackups() {
        const backups = this.listBackups()
        if (backups.length > this.MAX_BACKUPS) {
            const toDelete = backups.slice(this.MAX_BACKUPS)
            for (const backup of toDelete) {
                try {
                    fs.unlinkSync(path.join(this.BACKUP_DIR, backup.filename))
                    console.error(`Deleted old backup: ${backup.filename}`)
                } catch (e) {
                    console.error(`Failed to delete old backup ${backup.filename}`, e)
                }
            }
        }
    }

    static async restoreBackup(filename: string): Promise<boolean> {
        // Restore is tricky because we can't overwrite the open DB easily.
        // Strategy: 
        // 1. Close current DB
        // 2. Copy backup to main DB location
        // 3. Reopen DB (or restart app)
        // For now, allow "Restore" only to return instructions or handle simple copy if we can close db.
        // Electron usually requires app restart to cleanly swap DBs in use.

        // Implementation:
        // Signal main process to close DB, then copy, then restart.
        const backupPath = path.join(this.BACKUP_DIR, filename)
        const dbPath = getDatabasePath()

        if (!fs.existsSync(backupPath)) {throw new Error('Backup file not found')}

        try {
            // Close DB connection
            db?.close()

            // Copy
            fs.copyFileSync(backupPath, dbPath)

            // Relaunch app to re-init DB
            app.relaunch()
            app.exit(0)

            return true
        } catch (e) {
            console.error('Restore failed:', e)
            // Try to reopen DB so app doesn't crash completely
            // initializeDatabase() - careful, circular dependency if we import it.
            return false
        }
    }
}

