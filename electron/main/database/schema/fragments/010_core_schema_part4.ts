export const CORE_SCHEMA_PART4 = [
  `

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
  `,
  `

    CREATE TABLE IF NOT EXISTS approval_workflow (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_name TEXT NOT NULL UNIQUE,
      entity_type TEXT NOT NULL UNIQUE,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS approval_request (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_id INTEGER NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      current_step INTEGER DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
      requested_by_user_id INTEGER NOT NULL,
      final_approver_user_id INTEGER,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workflow_id) REFERENCES approval_workflow(id),
      FOREIGN KEY (requested_by_user_id) REFERENCES user(id),
      FOREIGN KEY (final_approver_user_id) REFERENCES user(id)
    );

    CREATE TABLE IF NOT EXISTS approval_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      approval_request_id INTEGER NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('REQUESTED','APPROVED','REJECTED','CANCELLED')),
      action_by INTEGER NOT NULL,
      action_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      previous_status TEXT,
      new_status TEXT,
      notes TEXT,
      FOREIGN KEY (approval_request_id) REFERENCES approval_request(id) ON DELETE CASCADE,
      FOREIGN KEY (action_by) REFERENCES user(id)
    );
  `,
  `

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      stream_id INTEGER NOT NULL,
      academic_year_id INTEGER NOT NULL,
      term_id INTEGER NOT NULL,
      attendance_date DATE NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED')),
      notes TEXT,
      marked_by_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES student(id),
      FOREIGN KEY (stream_id) REFERENCES stream(id),
      FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
      FOREIGN KEY (term_id) REFERENCES term(id),
      FOREIGN KEY (marked_by_user_id) REFERENCES user(id)
    );

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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES asset_category(id)
    );

    CREATE TABLE IF NOT EXISTS staff_allowance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id INTEGER NOT NULL,
      allowance_name TEXT NOT NULL,
      amount INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (staff_id) REFERENCES staff(id)
    );
  `,
] as const
