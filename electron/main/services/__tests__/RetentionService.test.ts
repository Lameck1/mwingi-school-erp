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

      CREATE TABLE message_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_body TEXT NOT NULL,
        created_at DATETIME NOT NULL
      );
    `)

    db.prepare(`
      INSERT INTO data_retention_config (table_name, retention_days, is_active)
      VALUES ('message_log', 30, 1)
    `).run()

    db.prepare(`INSERT INTO message_log (message_body, created_at) VALUES (?, ?)`)
      .run('old', '2025-12-01 00:00:00')
    db.prepare(`INSERT INTO message_log (message_body, created_at) VALUES (?, ?)`)
      .run('new', '2026-02-20 00:00:00')

    const service = new RetentionService(db, () => new Date('2026-02-23T12:00:00Z'))
    const summary = service.purgeExpiredRecords()

    const remaining = db.prepare('SELECT COUNT(*) as count FROM message_log').get() as { count: number }
    const config = db.prepare(`
      SELECT last_purge_at
      FROM data_retention_config
      WHERE table_name = 'message_log'
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
      { table: 'ghost_table', deleted: 0, skipped: true, reason: 'Table missing' }
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

      CREATE TABLE event_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        details TEXT NOT NULL,
        timestamp DATETIME NOT NULL
      );

      CREATE TABLE no_time_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        details TEXT NOT NULL
      );
    `)

    db.prepare(`
      INSERT INTO data_retention_config (table_name, retention_days, is_active)
      VALUES ('event_log', 30, 1), ('no_time_log', 30, 1)
    `).run()

    db.prepare(`INSERT INTO event_log (details, timestamp) VALUES (?, ?)`)
      .run('old-event', '2025-12-01 00:00:00')
    db.prepare(`INSERT INTO event_log (details, timestamp) VALUES (?, ?)`)
      .run('new-event', '2026-02-20 00:00:00')

    const service = new RetentionService(db, () => new Date('2026-02-23T12:00:00Z'))
    const summary = service.purgeExpiredRecords()
    const remaining = db.prepare('SELECT COUNT(*) as count FROM event_log').get() as { count: number }

    expect(remaining.count).toBe(1)
    expect(summary.totalDeleted).toBe(1)
    expect(summary.results).toEqual([
      { table: 'event_log', deleted: 1, skipped: false },
      { table: 'no_time_log', deleted: 0, skipped: true, reason: 'No supported timestamp column' }
    ])
  })
})
