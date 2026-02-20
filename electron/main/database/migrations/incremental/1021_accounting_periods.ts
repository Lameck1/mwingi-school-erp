import type { Database } from 'better-sqlite3'

/**
 * Migration 1021: Accounting Periods
 * 
 * Creates accounting_period table to support period locking.
 */
export function up(db: Database): void {
    db.exec(`
    CREATE TABLE IF NOT EXISTS accounting_period (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_name TEXT NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'CLOSED', 'LOCKED')),
      closed_by_user_id INTEGER,
      closed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (closed_by_user_id) REFERENCES user(id)
    )
  `)

    // Seed an initial open period for 2026 if none exists
    const periodCount = (db.prepare('SELECT COUNT(*) as cnt FROM accounting_period').get() as { cnt: number }).cnt
    if (periodCount === 0) {
        db.exec(`
      INSERT INTO accounting_period (period_name, start_date, end_date, status)
      VALUES ('Initial Period', '2026-01-01', '2026-12-31', 'OPEN')
    `)
        console.warn('  Created initial open accounting period')
    }
}

export function down(db: Database): void {
    db.exec(`DROP TABLE IF EXISTS accounting_period`)
}
