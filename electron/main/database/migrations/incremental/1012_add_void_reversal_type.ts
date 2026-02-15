import type Database from 'better-sqlite3'

export function up(db: Database.Database): void {
    const hasJournalEntry = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = 'journal_entry'
  `).get() as { name: string } | undefined

    if (!hasJournalEntry) {
        return
    }

    // Check if we need to run this migration (if VOID_REVERSAL already exists in check constraint, we might skip, 
    // but parsing check constraint SQL is hard. Hard to be idempotent without complex parsing.
    // We will just run it given the incremental nature).

    db.exec(`
    CREATE TABLE IF NOT EXISTS journal_entry_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_ref TEXT NOT NULL UNIQUE,
      entry_date DATE NOT NULL,
      entry_type TEXT NOT NULL CHECK(entry_type IN (
        'FEE_PAYMENT', 'FEE_INVOICE', 'EXPENSE', 'INCOME', 'SALARY', 'REFUND',
        'OPENING_BALANCE', 'ADJUSTMENT', 'ASSET_PURCHASE', 'ASSET_DISPOSAL',
        'LOAN_DISBURSEMENT', 'LOAN_REPAYMENT', 'DONATION', 'GRANT', 'VOID_REVERSAL'
      )),
      description TEXT NOT NULL,
      student_id INTEGER,
      staff_id INTEGER,
      term_id INTEGER,
      is_posted BOOLEAN DEFAULT 0,
      posted_by_user_id INTEGER,
      posted_at DATETIME,
      is_voided BOOLEAN DEFAULT 0,
      voided_reason TEXT,
      voided_by_user_id INTEGER,
      voided_at DATETIME,
      requires_approval BOOLEAN DEFAULT 0,
      approval_status TEXT DEFAULT 'PENDING' CHECK(approval_status IN ('PENDING', 'APPROVED', 'REJECTED')),
      approved_by_user_id INTEGER,
      approved_at DATETIME,
      created_by_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      source_ledger_txn_id INTEGER,
      FOREIGN KEY (student_id) REFERENCES student(id),
      FOREIGN KEY (staff_id) REFERENCES staff(id),
      FOREIGN KEY (term_id) REFERENCES term(id),
      FOREIGN KEY (created_by_user_id) REFERENCES user(id)
    );
  `)

    // Copy data
    const sourceColumns = (db.prepare('PRAGMA table_info(journal_entry)').all() as Array<{ name: string }>)
        .map(col => col.name)
    const targetColumns = (db.prepare('PRAGMA table_info(journal_entry_new)').all() as Array<{ name: string }>)
        .map(col => col.name)

    // Intersect columns to blindly copy whatever exists
    const columnsToCopy = targetColumns.filter(col => sourceColumns.includes(col))

    if (columnsToCopy.length > 0) {
        const columnList = columnsToCopy.join(', ')
        db.exec(`
      INSERT INTO journal_entry_new (${columnList})
      SELECT ${columnList}
      FROM journal_entry
    `)
    }

    // Swap tables
    // Note: We need to turn off foreign keys to drop the referenced table if they are on.
    const fkState = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }
    if (fkState.foreign_keys) {
        db.pragma('foreign_keys = OFF')
    }

    db.exec(`DROP TABLE journal_entry`)
    db.exec(`ALTER TABLE journal_entry_new RENAME TO journal_entry`)

    // Recreate Indices
    db.exec(`CREATE INDEX IF NOT EXISTS idx_journal_entry_ref ON journal_entry(entry_ref)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_journal_entry_source ON journal_entry(source_ledger_txn_id)`)

    // Restore FK state
    if (fkState.foreign_keys) {
        db.pragma('foreign_keys = ON')
    }
}
