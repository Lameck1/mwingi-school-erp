import type Database from 'better-sqlite3'

/**
 * Migration 1027: JSS 3-Account Architecture
 *
 * Kenyan Junior Secondary Schools (JSS) must maintain three segregated accounts:
 * 1. Tuition Account — fees for instruction
 * 2. Operations Account — day-to-day running costs (lunch, transport, utilities)
 * 3. Infrastructure Account — development, construction, ICT
 *
 * This migration:
 * 1. Adds `jss_account_type` to `fee_category` to classify each fee into an account
 * 2. Creates `jss_virement_request` for audit-logged cross-account transfer requests
 * 3. Seeds sensible defaults for common fee categories
 */
export function up(db: Database.Database): void {
    // 1. Classify fee categories into JSS accounts
    const columns = db.prepare('PRAGMA table_info(fee_category)').all() as Array<{ name: string }>
    if (!columns.some(col => col.name === 'jss_account_type')) {
        db.exec(
            "ALTER TABLE fee_category ADD COLUMN jss_account_type TEXT CHECK(jss_account_type IN ('TUITION', 'OPERATIONS', 'INFRASTRUCTURE'))"
        )
    }

    // Seed account type defaults based on category names
    const updateAccountType = db.prepare(
        'UPDATE fee_category SET jss_account_type = ? WHERE LOWER(category_name) LIKE ? AND jss_account_type IS NULL'
    )
    const accountDefaults: ReadonlyArray<[string, string]> = [
        ['TUITION', '%tuition%'],
        ['TUITION', '%exam%'],
        ['TUITION', '%library%'],
        ['OPERATIONS', '%lunch%'],
        ['OPERATIONS', '%boarding%'],
        ['OPERATIONS', '%transport%'],
        ['OPERATIONS', '%uniform%'],
        ['OPERATIONS', '%activity%'],
        ['INFRASTRUCTURE', '%development%'],
        ['INFRASTRUCTURE', '%ict%'],
        ['INFRASTRUCTURE', '%construction%'],
        ['INFRASTRUCTURE', '%infrastructure%'],
    ]
    for (const [accountType, pattern] of accountDefaults) {
        updateAccountType.run(accountType, pattern)
    }

    // 2. Virement request table — tracks any cross-account transfer attempts
    db.exec(`
    CREATE TABLE IF NOT EXISTS jss_virement_request (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_account_type TEXT NOT NULL CHECK(from_account_type IN ('TUITION', 'OPERATIONS', 'INFRASTRUCTURE')),
      to_account_type TEXT NOT NULL CHECK(to_account_type IN ('TUITION', 'OPERATIONS', 'INFRASTRUCTURE')),
      amount INTEGER NOT NULL CHECK (amount > 0),
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
      requested_by_user_id INTEGER NOT NULL,
      reviewed_by_user_id INTEGER,
      reviewed_at DATETIME,
      review_notes TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (requested_by_user_id) REFERENCES user(id),
      FOREIGN KEY (reviewed_by_user_id) REFERENCES user(id),
      CHECK (from_account_type != to_account_type)
    );
    CREATE INDEX IF NOT EXISTS idx_virement_status ON jss_virement_request(status);
  `)
}
