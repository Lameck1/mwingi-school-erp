 
import fs from 'node:fs'
import path from 'node:path'

import { backupDatabase } from './database'
import { app } from './electron-env'

export class BackupService {
    private static readonly BACKUP_DIR_NAME = 'backups'
    private static readonly AUTO_BACKUP_DIR_NAME = 'auto'
    private static readonly RETENTION_DAYS = 7

    static async init() {
        // Run initial backup check after a short delay to ensure app is fully ready
        setTimeout(() => {
            void this.performAutoBackup().catch((error) => {
                console.error('Auto backup failed:', error)
            })
        }, 5000)
    }

    private static getBackupDir(): string {
        return path.join(app.getPath('userData'), this.BACKUP_DIR_NAME, this.AUTO_BACKUP_DIR_NAME)
    }

    private static async performAutoBackup() {
        const backupDir = this.getBackupDir()

        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true })
        }

        const today = new Date().toISOString().slice(0, 10)
        const backupFileName = `auto-backup-${today}.db`
        const backupPath = path.join(backupDir, backupFileName)

        // Check if backup for today already exists
        if (fs.existsSync(backupPath)) {
            // Auto backup for today already exists
            return
        }

        await backupDatabase(backupPath)

        // Cleanup old backups
        this.cleanupOldBackups(backupDir)
    }

    private static cleanupOldBackups(backupDir: string) {
        try {
            const files = fs.readdirSync(backupDir)
            const now = Date.now()
            const retentionMs = this.RETENTION_DAYS * 24 * 60 * 60 * 1000

            files.forEach(file => {
                if (!file.endsWith('.db')) {return}

                const filePath = path.join(backupDir, file)
                const stats = fs.statSync(filePath)

                if (now - stats.mtimeMs > retentionMs) {
                    fs.unlinkSync(filePath)
                }
            })
        } catch (error) {
            console.error('Cleanup old backups failed:', error)
        }
    }
}
