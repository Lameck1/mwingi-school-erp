import type Database from 'better-sqlite3'

/**
 * Migration 1029: M-Pesa Transaction & Reconciliation
 *
 * Desktop app constraint: No webhook/C2B callback. Instead:
 * 1. Import M-Pesa transactions (from downloaded statement CSV or pull API)
 * 2. Auto-match to students by phone number or admission number in account ref
 * 3. Manual reconciliation for unmatched transactions
 */
export function up(db: Database.Database): void {
    // 1. M-Pesa raw transaction import
    db.exec(`
    CREATE TABLE IF NOT EXISTS mpesa_transaction (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mpesa_receipt_number TEXT NOT NULL UNIQUE,
      transaction_date DATETIME NOT NULL,
      phone_number TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK (amount > 0),
      account_reference TEXT,
      payer_name TEXT,
      transaction_type TEXT NOT NULL DEFAULT 'C2B' CHECK(transaction_type IN ('C2B', 'B2C', 'B2B')),
      status TEXT NOT NULL DEFAULT 'UNMATCHED' CHECK(status IN ('UNMATCHED', 'MATCHED', 'RECONCILED', 'DISPUTED', 'IGNORED')),
      matched_student_id INTEGER,
      matched_payment_id INTEGER,
      match_method TEXT CHECK(match_method IN ('AUTO_PHONE', 'AUTO_ADMISSION', 'MANUAL')),
      match_confidence REAL,
      imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      imported_by_user_id INTEGER NOT NULL,
      reconciled_at DATETIME,
      reconciled_by_user_id INTEGER,
      notes TEXT,
      FOREIGN KEY (matched_student_id) REFERENCES student(id),
      FOREIGN KEY (matched_payment_id) REFERENCES ledger_transaction(id),
      FOREIGN KEY (imported_by_user_id) REFERENCES user(id),
      FOREIGN KEY (reconciled_by_user_id) REFERENCES user(id)
    );
    CREATE INDEX IF NOT EXISTS idx_mpesa_receipt ON mpesa_transaction(mpesa_receipt_number);
    CREATE INDEX IF NOT EXISTS idx_mpesa_phone ON mpesa_transaction(phone_number);
    CREATE INDEX IF NOT EXISTS idx_mpesa_status ON mpesa_transaction(status);
    CREATE INDEX IF NOT EXISTS idx_mpesa_date ON mpesa_transaction(transaction_date);
  `)

    // 2. Reconciliation batch log
    db.exec(`
    CREATE TABLE IF NOT EXISTS mpesa_reconciliation_batch (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      total_imported INTEGER NOT NULL DEFAULT 0,
      total_matched INTEGER NOT NULL DEFAULT 0,
      total_unmatched INTEGER NOT NULL DEFAULT 0,
      total_amount INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'CSV' CHECK(source IN ('CSV', 'API', 'MANUAL')),
      file_name TEXT,
      imported_by_user_id INTEGER NOT NULL,
      FOREIGN KEY (imported_by_user_id) REFERENCES user(id)
    );
  `)
}
