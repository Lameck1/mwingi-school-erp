import type Database from 'better-sqlite3'

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName) as { name: string } | undefined
  return Boolean(row?.name)
}

export function up(db: Database.Database): void {
  if (tableExists(db, 'bank_account')) {
    db.exec(`
      UPDATE bank_account
      SET account_number = TRIM(account_number)
      WHERE account_number IS NOT NULL
    `)

    db.exec(`
      UPDATE bank_account
      SET account_number = account_number || '-DUP-' || id
      WHERE id IN (
        SELECT id
        FROM (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY account_number
              ORDER BY id ASC
            ) AS rn
          FROM bank_account
          WHERE account_number IS NOT NULL
            AND TRIM(account_number) != ''
        )
        WHERE rn > 1
      )
    `)

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_account_account_number_unique
      ON bank_account(account_number)
    `)
  }

  if (tableExists(db, 'bank_statement')) {
    db.exec(`
      UPDATE bank_statement
      SET statement_reference = TRIM(statement_reference)
      WHERE statement_reference IS NOT NULL
    `)

    db.exec(`
      UPDATE bank_statement
      SET statement_reference = CASE
        WHEN statement_reference IS NULL OR TRIM(statement_reference) = '' THEN '#DUP-' || id
        ELSE statement_reference || '-DUP-' || id
      END
      WHERE id IN (
        SELECT id
        FROM (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY bank_account_id, statement_date, COALESCE(NULLIF(TRIM(statement_reference), ''), '')
              ORDER BY id ASC
            ) AS rn
          FROM bank_statement
        )
        WHERE rn > 1
      )
    `)

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_statement_identity_unique
      ON bank_statement(bank_account_id, statement_date, COALESCE(NULLIF(TRIM(statement_reference), ''), ''))
    `)
  }

  if (tableExists(db, 'bank_statement_line')) {
    db.exec(`DROP TRIGGER IF EXISTS trg_bank_statement_line_validate_insert`)
    db.exec(`DROP TRIGGER IF EXISTS trg_bank_statement_line_validate_update`)

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_bank_statement_line_validate_insert
      BEFORE INSERT ON bank_statement_line
      WHEN NEW.description IS NULL
        OR TRIM(NEW.description) = ''
        OR COALESCE(NEW.debit_amount, 0) < 0
        OR COALESCE(NEW.credit_amount, 0) < 0
        OR (
          (COALESCE(NEW.debit_amount, 0) > 0 AND COALESCE(NEW.credit_amount, 0) > 0)
          OR (COALESCE(NEW.debit_amount, 0) = 0 AND COALESCE(NEW.credit_amount, 0) = 0)
        )
        OR NEW.transaction_date IS NULL
        OR LENGTH(NEW.transaction_date) != 10
        OR NEW.transaction_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      BEGIN
        SELECT RAISE(ABORT, 'Invalid bank statement line');
      END
    `)

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_bank_statement_line_validate_update
      BEFORE UPDATE ON bank_statement_line
      WHEN NEW.description IS NULL
        OR TRIM(NEW.description) = ''
        OR COALESCE(NEW.debit_amount, 0) < 0
        OR COALESCE(NEW.credit_amount, 0) < 0
        OR (
          (COALESCE(NEW.debit_amount, 0) > 0 AND COALESCE(NEW.credit_amount, 0) > 0)
          OR (COALESCE(NEW.debit_amount, 0) = 0 AND COALESCE(NEW.credit_amount, 0) = 0)
        )
        OR NEW.transaction_date IS NULL
        OR LENGTH(NEW.transaction_date) != 10
        OR NEW.transaction_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      BEGIN
        SELECT RAISE(ABORT, 'Invalid bank statement line');
      END
    `)
  }
}
