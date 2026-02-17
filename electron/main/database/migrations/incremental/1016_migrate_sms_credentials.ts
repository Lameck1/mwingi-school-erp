import type Database from 'better-sqlite3'

/**
 * Migration 1016: Migrate SMS credentials from school_settings to encrypted system_config.
 *
 * Reads sms_api_key and sms_api_secret from school_settings, stores them in
 * the system_config table (which supports encrypted storage via ConfigService),
 * and NULLs out the plaintext columns in school_settings.
 *
 * NOTE: At migration time we cannot use safeStorage (Electron may not be ready),
 * so we store the values as plaintext in system_config with is_encrypted = 0.
 * On next app boot, ConfigService will re-encrypt them when accessed through
 * the settings:update handler.
 */
export function up(db: Database.Database): void {
    // Ensure system_config table exists (it should from initial schema)
    const hasTable = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='system_config'"
    ).get()
    if (!hasTable) {
        db.exec(`CREATE TABLE IF NOT EXISTS system_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT NOT NULL UNIQUE,
            value TEXT NOT NULL,
            is_encrypted INTEGER DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`)
    }

    // Read current SMS credentials from school_settings
    const settings = db.prepare(
        'SELECT sms_api_key, sms_api_secret, sms_sender_id FROM school_settings WHERE id = 1'
    ).get() as { sms_api_key: string | null; sms_api_secret: string | null; sms_sender_id: string | null } | undefined

    if (!settings) { return }

    const upsert = db.prepare(`
        INSERT INTO system_config (key, value, is_encrypted, updated_at)
        VALUES (?, ?, 0, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            is_encrypted = excluded.is_encrypted,
            updated_at = excluded.updated_at
    `)

    // Migrate each credential if it has a value
    if (settings.sms_api_key) {
        upsert.run('sms_api_key', settings.sms_api_key)
    }
    if (settings.sms_api_secret) {
        upsert.run('sms_api_secret', settings.sms_api_secret)
    }
    if (settings.sms_sender_id) {
        upsert.run('sms_sender_id', settings.sms_sender_id)
    }

    // NULL out the plaintext columns in school_settings
    db.prepare(`
        UPDATE school_settings
        SET sms_api_key = NULL,
            sms_api_secret = NULL
        WHERE id = 1
    `).run()

    console.warn('[migration-1016] ✓ SMS credentials migrated to system_config')
}
