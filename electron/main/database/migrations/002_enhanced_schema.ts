/**
 * Migration: Enhanced Schema for Production Readiness
 * - Adds soft delete columns
 * - Adds period locking
 * - Adds budget tables
 * - Adds bank reconciliation tables
 * - Adds approval workflow tables
 * - Creates proper indexes
 */

export function getEnhancedSchema(): string {
    return `
    -- ================================================
    -- SOFT DELETE SUPPORT
    -- ================================================
    
    -- Add deleted_at columns to existing tables
    ALTER TABLE student ADD COLUMN deleted_at DATETIME DEFAULT NULL;
    ALTER TABLE staff ADD COLUMN deleted_at DATETIME DEFAULT NULL;
    ALTER TABLE fee_invoice ADD COLUMN deleted_at DATETIME DEFAULT NULL;
    ALTER TABLE ledger_transaction ADD COLUMN deleted_at DATETIME DEFAULT NULL;

    -- ================================================
    -- PERIOD LOCKING (Financial Period Closure)
    -- ================================================

    CREATE TABLE IF NOT EXISTS financial_period (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_name TEXT NOT NULL,
      period_type TEXT NOT NULL CHECK(period_type IN ('MONTHLY', 'QUARTERLY', 'YEARLY')),
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      academic_year_id INTEGER,
      term_id INTEGER,
      is_locked BOOLEAN DEFAULT 0,
      locked_at DATETIME,
      locked_by_user_id INTEGER,
      unlock_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
      FOREIGN KEY (term_id) REFERENCES term(id),
      FOREIGN KEY (locked_by_user_id) REFERENCES user(id)
    );

    -- ================================================
    -- BUDGETING MODULE
    -- ================================================

    CREATE TABLE IF NOT EXISTS budget (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      budget_name TEXT NOT NULL,
      academic_year_id INTEGER NOT NULL,
      term_id INTEGER,
      status TEXT DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ACTIVE', 'CLOSED')),
      total_amount INTEGER DEFAULT 0,
      notes TEXT,
      created_by_user_id INTEGER NOT NULL,
      approved_by_user_id INTEGER,
      approved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME DEFAULT NULL,
      FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
      FOREIGN KEY (term_id) REFERENCES term(id),
      FOREIGN KEY (created_by_user_id) REFERENCES user(id),
      FOREIGN KEY (approved_by_user_id) REFERENCES user(id)
    );

    CREATE TABLE IF NOT EXISTS budget_line_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      budget_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      budgeted_amount INTEGER NOT NULL DEFAULT 0,
      actual_amount INTEGER DEFAULT 0,
      variance INTEGER GENERATED ALWAYS AS (budgeted_amount - actual_amount) STORED,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (budget_id) REFERENCES budget(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES transaction_category(id)
    );

    CREATE TABLE IF NOT EXISTS budget_revision (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      budget_id INTEGER NOT NULL,
      revision_number INTEGER NOT NULL,
      previous_amount INTEGER NOT NULL,
      new_amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      revised_by_user_id INTEGER NOT NULL,
      approved_by_user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (budget_id) REFERENCES budget(id),
      FOREIGN KEY (revised_by_user_id) REFERENCES user(id),
      FOREIGN KEY (approved_by_user_id) REFERENCES user(id)
    );

    -- ================================================
    -- BANK RECONCILIATION
    -- ================================================

    CREATE TABLE IF NOT EXISTS bank_account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_name TEXT NOT NULL,
      account_number TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      branch TEXT,
      swift_code TEXT,
      currency TEXT DEFAULT 'KES',
      opening_balance INTEGER DEFAULT 0,
      current_balance INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bank_statement (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_account_id INTEGER NOT NULL,
      statement_date DATE NOT NULL,
      opening_balance INTEGER NOT NULL,
      closing_balance INTEGER NOT NULL,
      statement_reference TEXT,
      file_path TEXT,
      status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'RECONCILED', 'PARTIAL')),
      reconciled_by_user_id INTEGER,
      reconciled_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bank_account_id) REFERENCES bank_account(id),
      FOREIGN KEY (reconciled_by_user_id) REFERENCES user(id)
    );

    CREATE TABLE IF NOT EXISTS bank_statement_line (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_statement_id INTEGER NOT NULL,
      transaction_date DATE NOT NULL,
      description TEXT NOT NULL,
      reference TEXT,
      debit_amount INTEGER DEFAULT 0,
      credit_amount INTEGER DEFAULT 0,
      running_balance INTEGER,
      is_matched BOOLEAN DEFAULT 0,
      matched_transaction_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bank_statement_id) REFERENCES bank_statement(id) ON DELETE CASCADE,
      FOREIGN KEY (matched_transaction_id) REFERENCES ledger_transaction(id)
    );

    CREATE TABLE IF NOT EXISTS reconciliation_adjustment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_statement_id INTEGER NOT NULL,
      adjustment_type TEXT NOT NULL CHECK(adjustment_type IN ('BANK_CHARGE', 'INTEREST', 'ERROR', 'TIMING', 'OTHER')),
      amount INTEGER NOT NULL,
      description TEXT NOT NULL,
      created_by_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bank_statement_id) REFERENCES bank_statement(id),
      FOREIGN KEY (created_by_user_id) REFERENCES user(id)
    );

    -- ================================================
    -- APPROVAL WORKFLOWS
    -- ================================================

    CREATE TABLE IF NOT EXISTS approval_workflow (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_name TEXT NOT NULL UNIQUE,
      entity_type TEXT NOT NULL, -- 'EXPENSE', 'BUDGET', 'INVOICE_VOID', 'REFUND'
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS approval_step (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_id INTEGER NOT NULL,
      step_order INTEGER NOT NULL,
      approver_role TEXT NOT NULL,
      min_amount INTEGER DEFAULT 0,
      max_amount INTEGER,
      is_mandatory BOOLEAN DEFAULT 1,
      FOREIGN KEY (workflow_id) REFERENCES approval_workflow(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS approval_request (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_id INTEGER NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      current_step INTEGER DEFAULT 1,
      status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
      requested_by_user_id INTEGER NOT NULL,
      final_approver_user_id INTEGER,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workflow_id) REFERENCES approval_workflow(id),
      FOREIGN KEY (requested_by_user_id) REFERENCES user(id),
      FOREIGN KEY (final_approver_user_id) REFERENCES user(id)
    );

    -- ================================================
    -- FIXED ASSETS REGISTER
    -- ================================================

    CREATE TABLE IF NOT EXISTS asset_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_name TEXT NOT NULL UNIQUE,
      depreciation_method TEXT DEFAULT 'STRAIGHT_LINE' CHECK(depreciation_method IN ('STRAIGHT_LINE', 'DECLINING_BALANCE', 'NONE')),
      useful_life_years INTEGER DEFAULT 5,
      depreciation_rate DECIMAL(5,2),
      is_active BOOLEAN DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS fixed_asset (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_code TEXT NOT NULL UNIQUE,
      asset_name TEXT NOT NULL,
      category_id INTEGER NOT NULL,
      description TEXT,
      serial_number TEXT,
      location TEXT,
      acquisition_date DATE NOT NULL,
      acquisition_cost INTEGER NOT NULL,
      current_value INTEGER NOT NULL,
      accumulated_depreciation INTEGER DEFAULT 0,
      status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'DISPOSED', 'WRITTEN_OFF', 'TRANSFERRED')),
      disposed_date DATE,
      disposed_value INTEGER,
      disposal_reason TEXT,
      supplier_id INTEGER,
      warranty_expiry DATE,
      last_depreciation_date DATE,
      created_by_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME DEFAULT NULL,
      FOREIGN KEY (category_id) REFERENCES asset_category(id),
      FOREIGN KEY (supplier_id) REFERENCES supplier(id),
      FOREIGN KEY (created_by_user_id) REFERENCES user(id)
    );

    -- ================================================
    -- COMPREHENSIVE INDEXES
    -- ================================================

    CREATE INDEX IF NOT EXISTS idx_student_active ON student(is_active) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_transaction_period ON ledger_transaction(term_id, transaction_date);
    CREATE INDEX IF NOT EXISTS idx_invoice_status ON fee_invoice(status);
    CREATE INDEX IF NOT EXISTS idx_budget_status ON budget(status);
    CREATE INDEX IF NOT EXISTS idx_audit_table ON audit_log(table_name, record_id);
  `;
}
