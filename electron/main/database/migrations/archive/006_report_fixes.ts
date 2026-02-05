export function getReportFixesSchema(): string {
  return `
    -- Disable foreign keys to allow dropping and recreating tables with references
    PRAGMA foreign_keys = OFF;

    -- Dropping if exists handles failed retries
    DROP TABLE IF EXISTS ledger_transaction_new;

    -- Recreate ledger_transaction to update transaction_type CHECK constraint and add missing columns
    CREATE TABLE ledger_transaction_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      transaction_ref TEXT NOT NULL UNIQUE,
      transaction_date DATE NOT NULL,
      transaction_type TEXT NOT NULL CHECK(transaction_type IN ('INCOME', 'FEE_PAYMENT', 'DONATION', 'GRANT', 'EXPENSE', 'SALARY_PAYMENT', 'REFUND', 'OPENING_BALANCE', 'ADJUSTMENT')),
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
      deleted_at DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES transaction_category(id),
      FOREIGN KEY (student_id) REFERENCES student(id),
      FOREIGN KEY (recorded_by_user_id) REFERENCES user(id),
      FOREIGN KEY (invoice_id) REFERENCES fee_invoice(id)
    );

    -- Copy existing data. Ensure we only copy columns that exist.
    -- We assume id is present as it's the PK.
    INSERT INTO ledger_transaction_new (
        id, transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
        student_id, staff_id, payment_method, payment_reference, description, term_id,
        recorded_by_user_id, is_voided, voided_reason, voided_by_user_id, voided_at, deleted_at, created_at
    )
    SELECT id, transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit,
           student_id, staff_id, payment_method, payment_reference, description, term_id,
           recorded_by_user_id, is_voided, voided_reason, voided_by_user_id, voided_at, deleted_at, created_at
    FROM ledger_transaction;

    DROP TABLE ledger_transaction;
    ALTER TABLE ledger_transaction_new RENAME TO ledger_transaction;

    -- Recreate indexes
    CREATE INDEX IF NOT EXISTS idx_ledger_date ON ledger_transaction(transaction_date);
    CREATE INDEX IF NOT EXISTS idx_ledger_student ON ledger_transaction(student_id);
    CREATE INDEX IF NOT EXISTS idx_transaction_period ON ledger_transaction(term_id, transaction_date);

    -- Re-enable foreign keys
    PRAGMA foreign_keys = ON;
    `;
}
