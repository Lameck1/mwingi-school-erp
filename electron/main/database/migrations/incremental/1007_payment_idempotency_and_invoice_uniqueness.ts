import type Database from 'better-sqlite3'

function hasColumn(db: Database.Database, tableName: string, columnName: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
  return columns.some(col => col.name === columnName)
}

export function up(db: Database.Database): void {
  const hasLedgerTransaction = db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ledger_transaction'
  `).get() as { name: string } | undefined

  if (hasLedgerTransaction && !hasColumn(db, 'ledger_transaction', 'idempotency_key')) {
    db.exec(`ALTER TABLE ledger_transaction ADD COLUMN idempotency_key TEXT`)
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_transaction_idempotency
    ON ledger_transaction(idempotency_key)
    WHERE idempotency_key IS NOT NULL
  `)

  const hasFeeInvoice = db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'fee_invoice'
  `).get() as { name: string } | undefined

  if (hasFeeInvoice) {
    db.exec(`
      UPDATE fee_invoice
      SET status = 'CANCELLED',
          notes = TRIM(COALESCE(notes || ' ', '') || 'Auto-cancelled duplicate active invoice in migration 1007')
      WHERE id IN (
        SELECT id
        FROM (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY student_id, term_id
              ORDER BY COALESCE(created_at, CURRENT_TIMESTAMP) DESC, id DESC
            ) AS rn
          FROM fee_invoice
          WHERE status IS NULL OR status != 'CANCELLED'
        )
        WHERE rn > 1
      )
    `)

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_invoice_active_unique
      ON fee_invoice(student_id, term_id)
      WHERE status IS NULL OR status != 'CANCELLED'
    `)
  }
}
