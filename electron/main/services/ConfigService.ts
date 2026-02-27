import { getDatabase } from '../database'
import { safeStorage } from '../electron-env'

const LEGACY_TO_CANONICAL_KEYS: Record<string, string> = {
    'sms.api_key': 'sms_api_key',
    'sms.api_secret': 'sms_api_secret',
    'sms.username': 'sms_username',
    'sms.sender_id': 'sms_sender_id',
    'sms.provider': 'sms_provider',
    'smtp.host': 'smtp_host',
    'smtp.port': 'smtp_port',
    'smtp.user': 'smtp_user',
    'smtp.pass': 'smtp_pass',
}

const CANONICAL_TO_LEGACY_KEYS: Record<string, string[]> = {
    sms_api_key: ['sms.api_key'],
    sms_api_secret: ['sms.api_secret'],
    sms_username: ['sms.username'],
    sms_sender_id: ['sms.sender_id'],
    sms_provider: ['sms.provider'],
    smtp_host: ['smtp.host'],
    smtp_port: ['smtp.port'],
    smtp_user: ['smtp.user'],
    smtp_pass: ['smtp.pass'],
}

const SENSITIVE_CANONICAL_KEYS = new Set<string>([
    'sms_api_key',
    'sms_api_secret',
    'smtp_pass',
])

function toCanonicalConfigKey(key: string): string {
    return LEGACY_TO_CANONICAL_KEYS[key] ?? key
}

function shouldEncryptAtRest(key: string): boolean {
    return SENSITIVE_CANONICAL_KEYS.has(key)
}

export class ConfigService {
    private static cache = new Map<string, string | null>()

    static clearCache(): void {
        this.cache.clear()
    }

    // Save configuration (encrypt if needed)
    static saveConfig(key: string, value: string, isEncrypted: boolean = false): boolean {
        const db = getDatabase()
        const canonicalKey = toCanonicalConfigKey(key)

        let storedValue = value
        if (isEncrypted && safeStorage.isEncryptionAvailable()) {
            storedValue = safeStorage.encryptString(value).toString('base64')
        } else if (isEncrypted) {
            throw new Error('SafeStorage unavailable. Cannot store encrypted configuration securely.')
        }

        const stmt = db.prepare(`
            INSERT INTO system_config (key, value, is_encrypted, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            is_encrypted = excluded.is_encrypted,
            updated_at = excluded.updated_at
        `)

        stmt.run(canonicalKey, storedValue, isEncrypted ? 1 : 0)
        this.cache.set(canonicalKey, value)
        return true
    }

    // Get configuration
    static getConfig(key: string): string | null {
        const canonicalKey = toCanonicalConfigKey(key)
        if (this.cache.has(canonicalKey)) {
            return this.cache.get(canonicalKey) ?? null
        }

        const db = getDatabase()
        const lookupKeys = [canonicalKey, ...(CANONICAL_TO_LEGACY_KEYS[canonicalKey] ?? [])]

        const placeholders = lookupKeys.map(() => '?').join(', ')
        const rows = db.prepare(`SELECT key, value, is_encrypted FROM system_config WHERE key IN (${placeholders})`).all(...lookupKeys) as { key: string, value: string, is_encrypted: number }[]
        const rowMap = new Map(rows.map(r => [r.key, r]))
        let row: { key: string, value: string, is_encrypted: number } | undefined
        for (const lookupKey of lookupKeys) {
            row = rowMap.get(lookupKey)
            if (row) { break }
        }

        if (!row) {
            this.cache.set(canonicalKey, null)
            return null
        }

        if (row.is_encrypted) {
            if (safeStorage.isEncryptionAvailable()) {
                try {
                    const decrypted = safeStorage.decryptString(Buffer.from(row.value, 'base64'))
                    this.cache.set(canonicalKey, decrypted)
                    return decrypted
                } catch (e) {
                    console.error(`Failed to decrypt config for ${key}:`, e)
                    return null
                }
            } else {
                console.warn(`SafeStorage unavailable, cannot decrypt ${key}`)
                return null
            }
        }

        if (shouldEncryptAtRest(canonicalKey) && safeStorage.isEncryptionAvailable()) {
            try {
                ConfigService.saveConfig(canonicalKey, row.value, true)
            } catch (error) {
                console.warn(`Failed to opportunistically encrypt config for ${canonicalKey}:`, error)
            }
        }

        this.cache.set(canonicalKey, row.value)
        return row.value
    }

    // Get all public configs (non-sensitive or filtered)
    static getAllConfigs(): Record<string, string> {
        const db = getDatabase()
        // Only select non-encrypted or safe to show configs if needed
        const rows = db.prepare('SELECT key, value, is_encrypted FROM system_config').all() as { key: string, value: string, is_encrypted: number }[]

        const config: Record<string, string> = {}
        for (const row of rows) {
            const canonicalKey = toCanonicalConfigKey(row.key)
            const normalizedValue = row.is_encrypted ? '******' : row.value
            // For UI, we might not want to send back encrypted values at all, or send mask
            if (!(canonicalKey in config) || (config[canonicalKey] === '******' && !row.is_encrypted)) {
                config[canonicalKey] = normalizedValue
            }
        }
        return config
    }
}
