import { getDatabase } from '../database'
import { safeStorage } from '../electron-env'

export class ConfigService {

    // Save configuration (encrypt if needed)
    static saveConfig(key: string, value: string, isEncrypted: boolean = false): boolean {
        const db = getDatabase()

        let storedValue = value
        if (isEncrypted && safeStorage.isEncryptionAvailable()) {
            storedValue = safeStorage.encryptString(value).toString('base64')
        } else if (isEncrypted) {
            console.warn('SafeStorage unavailable, saving in plaintext (INSECURE)')
        }

        const stmt = db.prepare(`
            INSERT INTO system_config (key, value, is_encrypted, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            is_encrypted = excluded.is_encrypted,
            updated_at = excluded.updated_at
        `)

        stmt.run(key, storedValue, isEncrypted ? 1 : 0)
        return true
    }

    // Get configuration
    static getConfig(key: string): string | null {
        const db = getDatabase()

        const row = db.prepare('SELECT value, is_encrypted FROM system_config WHERE key = ?').get(key) as { value: string, is_encrypted: number } | undefined

        if (!row) {return null}

        if (row.is_encrypted) {
            if (safeStorage.isEncryptionAvailable()) {
                try {
                    return safeStorage.decryptString(Buffer.from(row.value, 'base64'))
                } catch (e) {
                    console.error(`Failed to decrypt config for ${key}:`, e)
                    return null
                }
            } else {
                console.warn(`SafeStorage unavailable, cannot decrypt ${key}`)
                return null
            }
        }

        return row.value
    }

    // Get all public configs (non-sensitive or filtered)
    static getAllConfigs(): Record<string, string> {
        const db = getDatabase()
        // Only select non-encrypted or safe to show configs if needed
        const rows = db.prepare('SELECT key, value, is_encrypted FROM system_config').all() as { key: string, value: string, is_encrypted: number }[]

        const config: Record<string, string> = {}
        for (const row of rows) {
            // For UI, we might not want to send back encrypted values at all, or send mask
            if (row.is_encrypted) {
                config[row.key] = '******'
            } else {
                config[row.key] = row.value
            }
        }
        return config
    }
}
