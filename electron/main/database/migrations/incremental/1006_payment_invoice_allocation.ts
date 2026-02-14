import type Database from 'better-sqlite3'

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_invoice_allocation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      invoice_id INTEGER NOT NULL,
      applied_amount INTEGER NOT NULL CHECK (applied_amount > 0),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (transaction_id) REFERENCES ledger_transaction(id) ON DELETE CASCADE,
      FOREIGN KEY (invoice_id) REFERENCES fee_invoice(id) ON DELETE CASCADE
    );
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_payment_allocation_transaction
    ON payment_invoice_allocation(transaction_id);
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_payment_allocation_invoice
    ON payment_invoice_allocation(invoice_id);
  `)
}
