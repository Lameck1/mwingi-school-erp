import type Database from 'better-sqlite3'

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS budget_allocation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gl_account_code TEXT NOT NULL,
      fiscal_year INTEGER NOT NULL,
      allocated_amount INTEGER NOT NULL CHECK (allocated_amount >= 0),
      department TEXT,
      is_active BOOLEAN NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (gl_account_code) REFERENCES gl_account(account_code)
    );
  `)

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_allocation_unique
    ON budget_allocation(gl_account_code, fiscal_year, COALESCE(department, 'ALL_DEPARTMENTS'));
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_budget_allocation_fiscal_year
    ON budget_allocation(fiscal_year);
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_budget_allocation_active
    ON budget_allocation(is_active);
  `)
}

