/**
 * Shared DDL fragments for in-memory test databases.
 *
 * Principle: each test file remains self-contained — it picks only the tables
 * it needs via `applySchema(db, [...tableNames])`.  No global "run everything"
 * approach, so tests stay fast and explicit about their dependencies.
 */

import type Database from 'better-sqlite3'

/* ------------------------------------------------------------------ */
/*  DDL registry – table name → CREATE TABLE statement                */
/* ------------------------------------------------------------------ */

const DDL: Record<string, string> = {
  user: `
    CREATE TABLE IF NOT EXISTS user (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, full_name TEXT NOT NULL, email TEXT,
      role TEXT NOT NULL CHECK(role IN ('ADMIN','ACCOUNTS_CLERK','AUDITOR','TEACHER','PRINCIPAL','DEPUTY_PRINCIPAL')),
      is_active BOOLEAN DEFAULT 1, last_login DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,

  audit_log: `
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
      action_type TEXT NOT NULL, table_name TEXT NOT NULL, record_id INTEGER,
      old_values TEXT, new_values TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES user(id)
    );`,

  academic_year: `
    CREATE TABLE IF NOT EXISTS academic_year (
      id INTEGER PRIMARY KEY AUTOINCREMENT, year_name TEXT NOT NULL UNIQUE,
      start_date DATE NOT NULL, end_date DATE NOT NULL, is_current BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,

  term: `
    CREATE TABLE IF NOT EXISTS term (
      id INTEGER PRIMARY KEY AUTOINCREMENT, academic_year_id INTEGER NOT NULL,
      term_number INTEGER NOT NULL, term_name TEXT NOT NULL,
      start_date DATE NOT NULL, end_date DATE NOT NULL, is_current BOOLEAN DEFAULT 0,
      status TEXT DEFAULT 'OPEN' CHECK(status IN ('OPEN','CLOSED')),
      FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
      UNIQUE(academic_year_id, term_number)
    );`,

  student: `
    CREATE TABLE IF NOT EXISTS student (
      id INTEGER PRIMARY KEY AUTOINCREMENT, admission_number TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL, middle_name TEXT, last_name TEXT NOT NULL,
      date_of_birth DATE, gender TEXT CHECK(gender IN ('M','F')),
      student_type TEXT NOT NULL CHECK(student_type IN ('DAY_SCHOLAR','BOARDER')),
      admission_date DATE NOT NULL, guardian_name TEXT, guardian_phone TEXT,
      guardian_email TEXT, guardian_relationship TEXT, address TEXT, photo_path TEXT,
      is_active BOOLEAN DEFAULT 1, notes TEXT, credit_balance INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,

  gl_account: `
    CREATE TABLE IF NOT EXISTS gl_account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_code TEXT NOT NULL UNIQUE,
      account_name TEXT NOT NULL,
      account_type TEXT NOT NULL CHECK(account_type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
      account_subtype TEXT,
      parent_account_id INTEGER,
      is_system_account BOOLEAN DEFAULT 0,
      is_active BOOLEAN DEFAULT 1,
      requires_subsidiary BOOLEAN DEFAULT 0,
      normal_balance TEXT NOT NULL CHECK(normal_balance IN ('DEBIT','CREDIT')),
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_account_id) REFERENCES gl_account(id)
    );`,

  journal_entry: `
    CREATE TABLE IF NOT EXISTS journal_entry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_ref TEXT NOT NULL UNIQUE,
      entry_date DATE NOT NULL,
      entry_type TEXT NOT NULL CHECK(entry_type IN (
        'FEE_PAYMENT','FEE_INVOICE','EXPENSE','SALARY','SALARY_PAYMENT','REFUND',
        'OPENING_BALANCE','ADJUSTMENT','ASSET_PURCHASE',
        'ASSET_DISPOSAL','LOAN_DISBURSEMENT','LOAN_REPAYMENT','VOID_REVERSAL'
      )),
      description TEXT NOT NULL,
      department TEXT,
      student_id INTEGER, staff_id INTEGER, term_id INTEGER,
      is_posted BOOLEAN DEFAULT 0,
      posted_by_user_id INTEGER, posted_at DATETIME,
      is_voided BOOLEAN DEFAULT 0, voided_reason TEXT,
      voided_by_user_id INTEGER, voided_at DATETIME,
      requires_approval BOOLEAN DEFAULT 0,
      approval_status TEXT DEFAULT 'PENDING' CHECK(approval_status IN ('PENDING','APPROVED','REJECTED')),
      approved_by_user_id INTEGER, approved_at DATETIME,
      created_by_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,

  journal_entry_line: `
    CREATE TABLE IF NOT EXISTS journal_entry_line (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      journal_entry_id INTEGER NOT NULL,
      line_number INTEGER NOT NULL,
      gl_account_id INTEGER NOT NULL,
      debit_amount INTEGER DEFAULT 0,
      credit_amount INTEGER DEFAULT 0,
      description TEXT,
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entry(id) ON DELETE CASCADE,
      FOREIGN KEY (gl_account_id) REFERENCES gl_account(id),
      CHECK (debit_amount >= 0 AND credit_amount >= 0)
    );`,

  fee_category: `
    CREATE TABLE IF NOT EXISTS fee_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT, category_name TEXT NOT NULL UNIQUE,
      description TEXT, is_active BOOLEAN DEFAULT 1,
      gl_account_id INTEGER REFERENCES gl_account(id)
    );`,

  inventory_category: `
    CREATE TABLE IF NOT EXISTS inventory_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT, category_name TEXT NOT NULL UNIQUE,
      description TEXT, is_active BOOLEAN DEFAULT 1
    );`,

  supplier: `
    CREATE TABLE IF NOT EXISTS supplier (
      id INTEGER PRIMARY KEY AUTOINCREMENT, supplier_name TEXT NOT NULL,
      contact_person TEXT, phone TEXT, email TEXT, address TEXT,
      is_active BOOLEAN DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,

  inventory_item: `
    CREATE TABLE IF NOT EXISTS inventory_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT, item_code TEXT NOT NULL UNIQUE,
      item_name TEXT NOT NULL, category_id INTEGER NOT NULL, unit_of_measure TEXT NOT NULL,
      current_stock DECIMAL(12,2) DEFAULT 0, reorder_level DECIMAL(12,2) DEFAULT 0,
      unit_cost DECIMAL(12,2) DEFAULT 0, unit_price INTEGER DEFAULT 0,
      supplier_id INTEGER, description TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES inventory_category(id)
    );`,

  stock_movement: `
    CREATE TABLE IF NOT EXISTS stock_movement (
      id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL,
      movement_type TEXT NOT NULL CHECK(movement_type IN ('IN','OUT','ADJUSTMENT')),
      quantity DECIMAL(12,2) NOT NULL, unit_cost DECIMAL(12,2), total_cost DECIMAL(12,2),
      reference_number TEXT, supplier_id INTEGER, description TEXT, movement_date DATE NOT NULL,
      recorded_by_user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (item_id) REFERENCES inventory_item(id)
    );`,

  fee_exemption: `
    CREATE TABLE IF NOT EXISTS fee_exemption (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES student(id),
      academic_year_id INTEGER NOT NULL REFERENCES academic_year(id),
      term_id INTEGER REFERENCES term(id),
      fee_category_id INTEGER REFERENCES fee_category(id),
      exemption_type TEXT NOT NULL CHECK(exemption_type IN ('FULL','PARTIAL')),
      exemption_percentage REAL NOT NULL CHECK(exemption_percentage > 0 AND exemption_percentage <= 100),
      exemption_reason TEXT NOT NULL,
      supporting_document TEXT, notes TEXT,
      approved_by_user_id INTEGER REFERENCES user(id),
      approved_at DATETIME,
      status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED')),
      revoked_by_user_id INTEGER REFERENCES user(id),
      revoked_at DATETIME, revoke_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,

  approval_rule: `
    CREATE TABLE IF NOT EXISTS approval_rule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_name TEXT NOT NULL, transaction_type TEXT NOT NULL,
      min_amount INTEGER, max_amount INTEGER, days_since_transaction INTEGER,
      required_approver_role TEXT NOT NULL, is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,

  transaction_approval: `
    CREATE TABLE IF NOT EXISTS transaction_approval (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      journal_entry_id INTEGER NOT NULL, approval_rule_id INTEGER NOT NULL,
      requested_by_user_id INTEGER NOT NULL, requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
      reviewed_by_user_id INTEGER, reviewed_at DATETIME, review_notes TEXT,
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entry(id),
      FOREIGN KEY (approval_rule_id) REFERENCES approval_rule(id),
      FOREIGN KEY (requested_by_user_id) REFERENCES user(id)
    );`,

  approval_workflow: `
    CREATE TABLE IF NOT EXISTS approval_workflow (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_name TEXT NOT NULL UNIQUE,
      entity_type TEXT NOT NULL UNIQUE,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,

  approval_request: `
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
      FOREIGN KEY (requested_by_user_id) REFERENCES user(id)
    );`,

  approval_history: `
    CREATE TABLE IF NOT EXISTS approval_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      approval_request_id INTEGER NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('REQUESTED','APPROVED','REJECTED','CANCELLED')),
      action_by INTEGER NOT NULL,
      action_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      previous_status TEXT, new_status TEXT, notes TEXT,
      FOREIGN KEY (approval_request_id) REFERENCES approval_request(id) ON DELETE CASCADE,
      FOREIGN KEY (action_by) REFERENCES user(id)
    );`,

  accounting_period: `
    CREATE TABLE IF NOT EXISTS accounting_period (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_name TEXT NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL,
      status TEXT DEFAULT 'OPEN' CHECK(status IN ('OPEN','CLOSED','LOCKED')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,

  budget_allocation: `
    CREATE TABLE IF NOT EXISTS budget_allocation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gl_account_code TEXT NOT NULL,
      fiscal_year INTEGER NOT NULL,
      allocated_amount INTEGER NOT NULL,
      department TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (gl_account_code) REFERENCES gl_account(account_code)
    );`,

  staff: `
    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_number TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL, last_name TEXT NOT NULL,
      department TEXT, job_title TEXT,
      basic_salary INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,

  payroll_period: `
    CREATE TABLE IF NOT EXISTS payroll_period (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_name TEXT NOT NULL,
      start_date DATE NOT NULL, end_date DATE NOT NULL,
      status TEXT DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PENDING_APPROVAL','APPROVED','POSTED','PAID')),
      gl_posted INTEGER DEFAULT 0,
      payment_status TEXT DEFAULT 'PENDING',
      payment_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,

  payroll: `
    CREATE TABLE IF NOT EXISTS payroll (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_id INTEGER NOT NULL,
      staff_id INTEGER NOT NULL,
      basic_salary INTEGER DEFAULT 0,
      gross_salary INTEGER DEFAULT 0,
      net_salary INTEGER DEFAULT 0,
      payment_status TEXT DEFAULT 'PENDING',
      payment_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (period_id) REFERENCES payroll_period(id),
      FOREIGN KEY (staff_id) REFERENCES staff(id)
    );`,

  payroll_deduction: `
    CREATE TABLE IF NOT EXISTS payroll_deduction (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payroll_id INTEGER NOT NULL,
      deduction_name TEXT NOT NULL,
      amount INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (payroll_id) REFERENCES payroll(id)
    );`,
}

/* ------------------------------------------------------------------ */
/*  API                                                               */
/* ------------------------------------------------------------------ */

/** Topological dependency order so FK constraints are satisfied. */
const TABLE_ORDER = [
  'user', 'audit_log', 'academic_year', 'term', 'student',
  'gl_account', 'journal_entry', 'journal_entry_line',
  'fee_category', 'inventory_category', 'supplier',
  'inventory_item', 'stock_movement', 'fee_exemption',
  'approval_rule', 'transaction_approval',
  'approval_workflow', 'approval_request', 'approval_history',
  'accounting_period', 'budget_allocation',
  'staff', 'payroll_period', 'payroll', 'payroll_deduction',
]

/** FK dependency edges: child → parents. */
const FK_DEPS: Record<string, string[]> = {
  audit_log: ['user'],
  term: ['academic_year'],
  journal_entry_line: ['journal_entry'],
  inventory_item: ['inventory_category'],
  stock_movement: ['inventory_item'],
  fee_exemption: ['student', 'academic_year', 'user'],
  transaction_approval: ['journal_entry', 'approval_rule', 'user'],
  approval_request: ['approval_workflow', 'user'],
  approval_history: ['approval_request'],
  budget_allocation: ['gl_account'],
  payroll: ['payroll_period', 'staff'],
  payroll_deduction: ['payroll'],
}

/** Expands a set of table names with all transitive FK parent dependencies. */
function expandDependencies(requested: Set<string>): void {
  let changed = true
  while (changed) {
    changed = false
    for (const [child, parents] of Object.entries(FK_DEPS)) {
      if (!requested.has(child)) { continue }
      for (const parent of parents) {
        if (requested.has(parent)) { continue }
        requested.add(parent)
        changed = true
      }
    }
  }
}

/**
 * Apply only the requested tables (plus implicit FK dependencies) to an
 * in-memory database.  Tables are created in safe topological order.
 *
 * @example
 *   applySchema(db, ['inventory_item', 'stock_movement'])
 *   // also creates inventory_category (FK dependency of inventory_item)
 */
export function applySchema(db: Database.Database, tables: string[]): void {
  const requested = new Set(tables)
  expandDependencies(requested)

  for (const name of TABLE_ORDER) {
    if (requested.has(name)) {
      const ddl = DDL[name]
      if (!ddl) {
        throw new Error(`Unknown table: ${name}`)
      }
      db.exec(ddl)
    }
  }
}

/**
 * Seed a user row (needed by audit_log FK and services that take userId).
 */
export function seedTestUser(db: Database.Database, id = 1): void {
  db.exec(`
    INSERT OR IGNORE INTO user (id, username, password_hash, full_name, role)
    VALUES (${id}, 'test_user_${id}', 'hashed', 'Test User ${id}', 'ADMIN');
  `)
}
