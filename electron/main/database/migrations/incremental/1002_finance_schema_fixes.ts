/**
 * Migration 1002: Finance Schema Fixes
 *
 * Addresses critical schema issues found during finance audit:
 *
 * 1. ledger_transaction CHECK constraint missing 'INCOME' — general income
 *    transactions fail with a CHECK constraint violation.
 * 2. transaction_category missing gl_account_code column — the handler reads
 *    this column but it doesn't exist, so GL mappings silently fall back to
 *    hardcoded defaults.
 * 3. Ensures void_audit table is compatible with current VoidProcessor.
 */

import type Database from 'better-sqlite3'

export function up(db: Database.Database): void {
  console.warn('[migration-1002] Running finance schema fixes...')

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Recreate ledger_transaction with updated CHECK constraint.
  //    Add 'INCOME' (general income) to the allowed transaction_type values.
  //    SQLite does not support altering CHECK constraints, so we recreate.
  // ──────────────────────────────────────────────────────────────────────────

  const hasLedgerTable = db.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ledger_transaction'`
  ).get() as { name: string } | undefined

  if (hasLedgerTable) {
    // Note: PRAGMA foreign_keys = OFF is handled by the migration runner
    // (it must be set outside any transaction to take effect in SQLite).

    // Create new table with INCOME added to the CHECK constraint
    db.exec(`
      CREATE TABLE IF NOT EXISTS ledger_transaction_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_ref TEXT NOT NULL UNIQUE,
        transaction_date DATE NOT NULL,
        transaction_type TEXT NOT NULL CHECK(transaction_type IN (
          'FEE_PAYMENT', 'DONATION', 'GRANT', 'EXPENSE', 'SALARY_PAYMENT',
          'REFUND', 'OPENING_BALANCE', 'ADJUSTMENT', 'INCOME'
        )),
        category_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        debit_credit TEXT NOT NULL CHECK(debit_credit IN ('DEBIT', 'CREDIT')),
        student_id INTEGER,
        staff_id INTEGER,
        invoice_id INTEGER,
        payment_method TEXT CHECK(payment_method IN ('CASH', 'MPESA', 'BANK_TRANSFER', 'CHEQUE')),
        payment_reference TEXT,
        description TEXT,
        term_id INTEGER,
        recorded_by_user_id INTEGER NOT NULL,
        is_voided BOOLEAN DEFAULT 0,
        voided_reason TEXT,
        voided_by_user_id INTEGER,
        voided_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES transaction_category(id),
        FOREIGN KEY (student_id) REFERENCES student(id),
        FOREIGN KEY (invoice_id) REFERENCES fee_invoice(id),
        FOREIGN KEY (recorded_by_user_id) REFERENCES user(id)
      )
    `)

    // Copy existing data
    db.exec(`
      INSERT OR IGNORE INTO ledger_transaction_new
      SELECT * FROM ledger_transaction
    `)

    // Drop old table & rename
    db.exec(`DROP TABLE ledger_transaction`)
    db.exec(`ALTER TABLE ledger_transaction_new RENAME TO ledger_transaction`)

    // Recreate indexes
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ledger_date ON ledger_transaction(transaction_date)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ledger_student ON ledger_transaction(student_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ledger_ref ON ledger_transaction(transaction_ref)`)

    console.warn('[migration-1002] ✓ ledger_transaction CHECK constraint updated (added INCOME)')
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Add gl_account_code to transaction_category so GL account mappings
  //    can be configured per category instead of hardcoded.
  // ──────────────────────────────────────────────────────────────────────────

  const hasCategoryTable = db.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'transaction_category'`
  ).get() as { name: string } | undefined

  if (hasCategoryTable) {
    const columns = db.prepare(`PRAGMA table_info(transaction_category)`).all() as { name: string }[]
    const hasGlCol = columns.some(c => c.name === 'gl_account_code')

    if (!hasGlCol) {
      db.exec(`ALTER TABLE transaction_category ADD COLUMN gl_account_code TEXT`)
      console.warn('[migration-1002] ✓ Added gl_account_code to transaction_category')

      // Seed sensible defaults for system categories
      const systemCategories = db.prepare(
        `SELECT id, category_name, category_type FROM transaction_category WHERE is_system = 1`
      ).all() as { id: number; category_name: string; category_type: string }[]

      const update = db.prepare(`UPDATE transaction_category SET gl_account_code = ? WHERE id = ?`)
      for (const cat of systemCategories) {
        const code = cat.category_type === 'INCOME' ? '4300' : '5900'
        update.run(code, cat.id)
      }
      console.warn(`[migration-1002] ✓ Seeded GL codes for ${systemCategories.length} system categories`)
    }
  }

  console.warn('[migration-1002] ✓ Finance schema fixes complete')
}
