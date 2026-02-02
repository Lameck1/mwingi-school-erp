import Database from 'better-sqlite3-multiple-ciphers'

export function up(db: Database.Database): void {
  db.exec(`
    -- Approval workflow configurations (amount-based thresholds)
    CREATE TABLE IF NOT EXISTS approval_workflow (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_type TEXT NOT NULL UNIQUE,
      description TEXT,
      level_1_threshold INTEGER NOT NULL DEFAULT 100000,
      level_1_approver_role TEXT NOT NULL DEFAULT 'ACCOUNTS_BURSAR',
      level_2_threshold INTEGER NOT NULL DEFAULT 500000,
      level_2_approver_role TEXT NOT NULL DEFAULT 'PRINCIPAL',
      requires_dual_approval BOOLEAN DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      is_active BOOLEAN DEFAULT 1,
      CHECK (level_1_threshold < level_2_threshold)
    );

    -- Approval requests (pending approvals)
    CREATE TABLE IF NOT EXISTS approval_request (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_type TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      requested_by INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      approval_level INTEGER DEFAULT 1,
      current_approver_id INTEGER,
      current_approver_role TEXT,
      approval_1_by INTEGER,
      approval_1_at TEXT,
      approval_1_notes TEXT,
      approval_2_by INTEGER,
      approval_2_at TEXT,
      approval_2_notes TEXT,
      rejection_by INTEGER,
      rejection_at TEXT,
      rejection_reason TEXT,
      requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      due_by TEXT,
      completed_at TEXT,
      supporting_documents TEXT,
      FOREIGN KEY (requested_by) REFERENCES user(id),
      FOREIGN KEY (approval_1_by) REFERENCES user(id),
      FOREIGN KEY (approval_2_by) REFERENCES user(id),
      FOREIGN KEY (rejection_by) REFERENCES user(id),
      FOREIGN KEY (current_approver_id) REFERENCES user(id),
      CHECK (status IN ('PENDING', 'APPROVED_LEVEL_1', 'APPROVED_LEVEL_2', 'APPROVED', 'REJECTED', 'CANCELLED'))
    );

    -- Approval history (audit trail)
    CREATE TABLE IF NOT EXISTS approval_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      approval_request_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      action_by INTEGER NOT NULL,
      action_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      previous_status TEXT,
      new_status TEXT,
      notes TEXT,
      ip_address TEXT,
      FOREIGN KEY (approval_request_id) REFERENCES approval_request(id),
      FOREIGN KEY (action_by) REFERENCES user(id),
      CHECK (action IN ('REQUESTED', 'APPROVED', 'REJECTED', 'RECALLED', 'ESCALATED'))
    );

    -- Void audit trail (separate from ledger transactions)
    CREATE TABLE IF NOT EXISTS void_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      transaction_type TEXT NOT NULL,
      original_amount REAL NOT NULL,
      student_id INTEGER,
      description TEXT,
      void_reason TEXT NOT NULL,
      voided_by INTEGER NOT NULL,
      voided_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      approval_request_id INTEGER,
      recovered_amount REAL,
      recovered_method TEXT,
      recovered_at TEXT,
      recovered_by INTEGER,
      notes TEXT,
      FOREIGN KEY (voided_by) REFERENCES user(id),
      FOREIGN KEY (recovered_by) REFERENCES user(id),
      FOREIGN KEY (student_id) REFERENCES student(id),
      FOREIGN KEY (approval_request_id) REFERENCES approval_request(id)
    );

    -- Financial periods (for period locking)
    CREATE TABLE IF NOT EXISTS financial_period (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_name TEXT NOT NULL,
      period_type TEXT NOT NULL,
      academic_year TEXT,
      term_id INTEGER,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      locked_at TEXT,
      locked_by INTEGER,
      lock_reason TEXT,
      unlocked_at TEXT,
      unlocked_by INTEGER,
      unlock_reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      fiscal_year TEXT,
      FOREIGN KEY (term_id) REFERENCES term(id),
      FOREIGN KEY (locked_by) REFERENCES user(id),
      FOREIGN KEY (unlocked_by) REFERENCES user(id),
      CHECK (status IN ('OPEN', 'LOCKED', 'CLOSED')),
      UNIQUE (period_name, academic_year)
    );

    -- Period lock audit trail
    CREATE TABLE IF NOT EXISTS period_lock_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      action_by INTEGER NOT NULL,
      action_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reason TEXT,
      previous_status TEXT,
      new_status TEXT,
      FOREIGN KEY (period_id) REFERENCES financial_period(id),
      FOREIGN KEY (action_by) REFERENCES user(id),
      CHECK (action IN ('LOCKED', 'UNLOCKED', 'EXTENDED', 'RESET'))
    );

    -- Authorization levels configuration
    CREATE TABLE IF NOT EXISTS authorization_level (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      min_amount INTEGER NOT NULL DEFAULT 0,
      max_amount INTEGER NOT NULL DEFAULT 999999999,
      can_approve BOOLEAN DEFAULT 1,
      can_reject BOOLEAN DEFAULT 1,
      can_override BOOLEAN DEFAULT 0,
      requires_2fa BOOLEAN DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      is_active BOOLEAN DEFAULT 1,
      UNIQUE (role, min_amount, max_amount)
    );

    -- Insert default approval workflows
    INSERT INTO approval_workflow (transaction_type, description, level_1_threshold, level_1_approver_role, level_2_threshold, level_2_approver_role, requires_dual_approval)
    VALUES
      ('PAYMENT', 'Student payment recording', 100000, 'ACCOUNTS_BURSAR', 500000, 'PRINCIPAL', 0),
      ('EXPENSE', 'General expense recording', 50000, 'ACCOUNTS_BURSAR', 300000, 'PRINCIPAL', 0),
      ('REFUND', 'Student refund processing', 10000, 'ACCOUNTS_CLERK', 100000, 'ACCOUNTS_BURSAR', 1),
      ('SALARY', 'Salary disbursement', 0, 'PAYROLL_OFFICER', 0, 'PRINCIPAL', 1),
      ('CAPITAL_EXPENDITURE', 'Fixed asset acquisition', 100000, 'PRINCIPAL', 500000, 'BOARD_CHAIRMAN', 1);

    -- Insert default authorization levels
    INSERT INTO authorization_level (role, min_amount, max_amount, can_approve, can_reject, can_override, requires_2fa)
    VALUES
      ('ACCOUNTS_CLERK', 0, 50000, 1, 0, 0, 0),
      ('ACCOUNTS_BURSAR', 0, 500000, 1, 1, 0, 1),
      ('PRINCIPAL', 0, 999999999, 1, 1, 1, 1),
      ('BOARD_CHAIRMAN', 0, 999999999, 1, 1, 1, 1);

    -- Create indexes for performance
    CREATE INDEX IF NOT EXISTS idx_approval_request_status ON approval_request(status);
    CREATE INDEX IF NOT EXISTS idx_approval_request_transaction ON approval_request(transaction_type, reference_id);
    CREATE INDEX IF NOT EXISTS idx_approval_request_approver ON approval_request(current_approver_id, status);
    CREATE INDEX IF NOT EXISTS idx_void_audit_transaction ON void_audit(transaction_id, transaction_type);
    CREATE INDEX IF NOT EXISTS idx_void_audit_user ON void_audit(voided_by, voided_at);
    CREATE INDEX IF NOT EXISTS idx_period_lock_status ON financial_period(status, start_date, end_date);
    CREATE INDEX IF NOT EXISTS idx_period_lock_audit_period ON period_lock_audit(period_id, action_at);
  `);
}

export function down(db: Database.Database): void {
  db.exec(`
    DROP INDEX IF EXISTS idx_period_lock_audit_period;
    DROP INDEX IF EXISTS idx_period_lock_status;
    DROP INDEX IF EXISTS idx_void_audit_user;
    DROP INDEX IF EXISTS idx_void_audit_transaction;
    DROP INDEX IF EXISTS idx_approval_request_approver;
    DROP INDEX IF EXISTS idx_approval_request_transaction;
    DROP INDEX IF EXISTS idx_approval_request_status;
    DROP TABLE IF EXISTS authorization_level;
    DROP TABLE IF EXISTS period_lock_audit;
    DROP TABLE IF EXISTS financial_period;
    DROP TABLE IF EXISTS void_audit;
    DROP TABLE IF EXISTS approval_history;
    DROP TABLE IF EXISTS approval_request;
    DROP TABLE IF EXISTS approval_workflow;
  `);
}
