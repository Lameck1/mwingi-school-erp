import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

import { RetentionService } from '../RetentionService'

describe('RetentionService', () => {
  it('purges records older than retention horizon and updates last_purge_at', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE data_retention_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL UNIQUE,
        retention_days INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_purge_at DATETIME,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE sms_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_body TEXT NOT NULL,
        created_at DATETIME NOT NULL
      );
    `)

    db.prepare(`
      INSERT INTO data_retention_config (table_name, retention_days, is_active)
      VALUES ('sms_log', 30, 1)
    `).run()

    db.prepare(`INSERT INTO sms_log (message_body, created_at) VALUES (?, ?)`)
      .run('old', '2025-12-01 00:00:00')
    db.prepare(`INSERT INTO sms_log (message_body, created_at) VALUES (?, ?)`)
      .run('new', '2026-02-20 00:00:00')

    const service = new RetentionService(db, () => new Date('2026-02-23T12:00:00Z'))
    const summary = service.purgeExpiredRecords()

    const remaining = db.prepare('SELECT COUNT(*) as count FROM sms_log').get() as { count: number }
    const config = db.prepare(`
      SELECT last_purge_at
      FROM data_retention_config
      WHERE table_name = 'sms_log'
    `).get() as { last_purge_at: string | null }

    expect(summary.totalDeleted).toBe(1)
    expect(remaining.count).toBe(1)
    expect(config.last_purge_at).not.toBeNull()
  })

  it('respects is_active and does not purge disabled table policies', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE data_retention_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL UNIQUE,
        retention_days INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_purge_at DATETIME,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action_type TEXT NOT NULL,
        created_at DATETIME NOT NULL
      );
    `)

    db.prepare(`
      INSERT INTO data_retention_config (table_name, retention_days, is_active)
      VALUES ('audit_log', 1, 0)
    `).run()
    db.prepare(`INSERT INTO audit_log (action_type, created_at) VALUES (?, ?)`)
      .run('LOGIN', '2025-01-01 00:00:00')

    const service = new RetentionService(db, () => new Date('2026-02-23T12:00:00Z'))
    const summary = service.purgeExpiredRecords()
    const remaining = db.prepare('SELECT COUNT(*) as count FROM audit_log').get() as { count: number }

    expect(summary.totalDeleted).toBe(0)
    expect(summary.processedTables).toBe(0)
    expect(remaining.count).toBe(1)
  })

  it('skips unsafe and missing table targets without failing the purge run', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE data_retention_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL UNIQUE,
        retention_days INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_purge_at DATETIME,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)

    db.prepare(`
      INSERT INTO data_retention_config (table_name, retention_days, is_active)
      VALUES ('bad-name', 30, 1), ('ghost_table', 30, 1)
    `).run()

    const service = new RetentionService(db, () => new Date('2026-02-23T12:00:00Z'))
    const summary = service.purgeExpiredRecords()

    expect(summary.totalDeleted).toBe(0)
    expect(summary.processedTables).toBe(2)
    expect(summary.results).toEqual([
      { table: 'bad-name', deleted: 0, skipped: true, reason: 'Unsafe table name' },
      { table: 'ghost_table', deleted: 0, skipped: true, reason: 'Table not in purge allowlist' }
    ])
  })

  it('supports timestamp fallback column and skips tables without supported timestamp fields', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE data_retention_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL UNIQUE,
        retention_days INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_purge_at DATETIME,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE email_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        details TEXT NOT NULL,
        timestamp DATETIME NOT NULL
      );

      CREATE TABLE login_attempt (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        details TEXT NOT NULL
      );
    `)

    db.prepare(`
      INSERT INTO data_retention_config (table_name, retention_days, is_active)
      VALUES ('email_log', 30, 1), ('login_attempt', 30, 1)
    `).run()

    db.prepare(`INSERT INTO email_log (details, timestamp) VALUES (?, ?)`)
      .run('old-event', '2025-12-01 00:00:00')
    db.prepare(`INSERT INTO email_log (details, timestamp) VALUES (?, ?)`)
      .run('new-event', '2026-02-20 00:00:00')

    const service = new RetentionService(db, () => new Date('2026-02-23T12:00:00Z'))
    const summary = service.purgeExpiredRecords()
    const remaining = db.prepare('SELECT COUNT(*) as count FROM email_log').get() as { count: number }

    expect(remaining.count).toBe(1)
    expect(summary.totalDeleted).toBe(1)
    expect(summary.results).toEqual([
      { table: 'email_log', deleted: 1, skipped: false },
      { table: 'login_attempt', deleted: 0, skipped: true, reason: 'No supported timestamp column' }
    ])
  })

  it('initialize() delegates to purgeExpiredRecords', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE data_retention_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL UNIQUE,
        retention_days INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_purge_at DATETIME,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE sms_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_body TEXT NOT NULL,
        created_at DATETIME NOT NULL
      );
    `)

    db.prepare(`
      INSERT INTO data_retention_config (table_name, retention_days, is_active)
      VALUES ('sms_log', 30, 1)
    `).run()
    db.prepare(`INSERT INTO sms_log (message_body, created_at) VALUES (?, ?)`)
      .run('old', '2025-12-01 00:00:00')

    const service = new RetentionService(db, () => new Date('2026-02-23T12:00:00Z'))
    const summary = service.initialize()

    expect(summary.totalDeleted).toBe(1)
    expect(summary.processedTables).toBe(1)
  })

  it('uses default nowProvider when none supplied', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE data_retention_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL UNIQUE,
        retention_days INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_purge_at DATETIME,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // No configs → should run without error using default now
    const service = new RetentionService(db)
    const summary = service.purgeExpiredRecords()
    expect(summary.totalDeleted).toBe(0)
    expect(summary.processedTables).toBe(0)
  })

  it('skips when active config references a table that exists but not in purge allowlist', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE data_retention_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL UNIQUE,
        retention_days INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_purge_at DATETIME,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE sms_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_body TEXT NOT NULL,
        created_at DATETIME NOT NULL
      );
    `)

    db.prepare(`
      INSERT INTO data_retention_config (table_name, retention_days, is_active)
      VALUES ('sms_log', 30, 1)
    `).run()
    db.prepare(`INSERT INTO sms_log (message_body, created_at) VALUES (?, ?)`)
      .run('old', '2025-12-01 00:00:00')

    const service = new RetentionService(db, () => new Date('2026-02-23T12:00:00Z'))
    const summary = service.purgeExpiredRecords()

    // sms_log IS in the purge allowlist, so it should work
    expect(summary.totalDeleted).toBe(1)
  })

  // ── Function coverage: initialize() delegates to purgeExpiredRecords ──
  it('initialize delegates to purgeExpiredRecords', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE data_retention_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL UNIQUE,
        retention_days INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_purge_at DATETIME,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)
    const service = new RetentionService(db)
    const result = service.initialize()
    expect(result.totalDeleted).toBe(0)
    expect(result.processedTables).toBe(0)
  })

  // ── Function coverage: resolveDateColumn returns 'timestamp' column ──
  it('resolveDateColumn returns timestamp when table has timestamp column', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE data_retention_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL UNIQUE,
        retention_days INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_purge_at DATETIME,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE login_attempt (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME NOT NULL,
        ip_address TEXT
      );
    `)
    db.prepare(`INSERT INTO data_retention_config (table_name, retention_days, is_active) VALUES ('login_attempt', 30, 1)`).run()
    db.prepare(`INSERT INTO login_attempt (timestamp, ip_address) VALUES (?, ?)`).run('2025-01-01 00:00:00', '127.0.0.1')

    const service = new RetentionService(db, () => new Date('2026-03-01T12:00:00Z'))
    const summary = service.purgeExpiredRecords()
    expect(summary.totalDeleted).toBe(1)
  })

  // ── Statement coverage: resolveDateColumn returns null for table without supported columns ──
  it('skips table with no supported timestamp column', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE data_retention_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL UNIQUE,
        retention_days INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_purge_at DATETIME,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL
      );
    `)
    db.prepare(`INSERT INTO data_retention_config (table_name, retention_days, is_active) VALUES ('audit_log', 30, 1)`).run()

    const service = new RetentionService(db)
    const summary = service.purgeExpiredRecords()
    expect(summary.results[0]?.reason).toBe('No supported timestamp column')
  })

  // ── Statement coverage: tableExists returns false for missing table ──
  it('skips when table does not exist', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE data_retention_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL UNIQUE,
        retention_days INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_purge_at DATETIME,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)
    db.prepare(`INSERT INTO data_retention_config (table_name, retention_days, is_active) VALUES ('notification', 30, 1)`).run()

    const service = new RetentionService(db)
    const summary = service.purgeExpiredRecords()
    expect(summary.results[0]?.reason).toBe('Table missing')
  })
})
