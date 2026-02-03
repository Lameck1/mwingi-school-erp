/**
 * Migration: Chart of Accounts & Double-Entry Ledger
 * 
 * This migration implements:
 * 1. Chart of Accounts (GL Account Master)
 * 2. True double-entry ledger entries
 * 3. Opening balance support
 * 4. Transaction approval workflow
 */

export function up(db: any): void {
  // ============================================================================
  // 1. CHART OF ACCOUNTS
  // ============================================================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS gl_account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_code TEXT NOT NULL UNIQUE,
      account_name TEXT NOT NULL,
      account_type TEXT NOT NULL CHECK(account_type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
      account_subtype TEXT,
      parent_account_id INTEGER,
      is_system_account BOOLEAN DEFAULT 0,
      is_active BOOLEAN DEFAULT 1,
      requires_subsidiary BOOLEAN DEFAULT 0,
      normal_balance TEXT NOT NULL CHECK(normal_balance IN ('DEBIT', 'CREDIT')),
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_account_id) REFERENCES gl_account(id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_gl_account_code ON gl_account(account_code);
    CREATE INDEX IF NOT EXISTS idx_gl_account_type ON gl_account(account_type);
  `);

  // ============================================================================
  // 2. DOUBLE-ENTRY JOURNAL ENTRIES
  // ============================================================================
  db.exec(`
    -- Journal Entry Header (replaces single ledger_transaction)
    CREATE TABLE IF NOT EXISTS journal_entry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_ref TEXT NOT NULL UNIQUE,
      entry_date DATE NOT NULL,
      entry_type TEXT NOT NULL CHECK(entry_type IN (
        'FEE_PAYMENT', 'EXPENSE', 'SALARY', 'REFUND', 
        'OPENING_BALANCE', 'ADJUSTMENT', 'ASSET_PURCHASE', 
        'ASSET_DISPOSAL', 'LOAN_DISBURSEMENT', 'LOAN_REPAYMENT'
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
      FOREIGN KEY (student_id) REFERENCES student(id),
      FOREIGN KEY (staff_id) REFERENCES staff(id),
      FOREIGN KEY (term_id) REFERENCES term(id),
      FOREIGN KEY (posted_by_user_id) REFERENCES user(id),
      FOREIGN KEY (voided_by_user_id) REFERENCES user(id),
      FOREIGN KEY (approved_by_user_id) REFERENCES user(id),
      FOREIGN KEY (created_by_user_id) REFERENCES user(id)
    );
    
    -- Journal Entry Lines (dual entries for double-entry)
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
      CHECK (debit_amount >= 0 AND credit_amount >= 0),
      CHECK ((debit_amount > 0 AND credit_amount = 0) OR (credit_amount > 0 AND debit_amount = 0))
    );
    
    CREATE INDEX IF NOT EXISTS idx_journal_entry_ref ON journal_entry(entry_ref);
    CREATE INDEX IF NOT EXISTS idx_journal_entry_date ON journal_entry(entry_date);
    CREATE INDEX IF NOT EXISTS idx_journal_entry_student ON journal_entry(student_id);
    CREATE INDEX IF NOT EXISTS idx_journal_entry_line_account ON journal_entry_line(gl_account_id);
  `);

  // ============================================================================
  // 3. OPENING BALANCES
  // ============================================================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS opening_balance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      academic_year_id INTEGER NOT NULL,
      gl_account_id INTEGER,
      student_id INTEGER,
      debit_amount INTEGER DEFAULT 0,
      credit_amount INTEGER DEFAULT 0,
      description TEXT,
      imported_from TEXT,
      imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      imported_by_user_id INTEGER NOT NULL,
      is_verified BOOLEAN DEFAULT 0,
      verified_by_user_id INTEGER,
      verified_at DATETIME,
      FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
      FOREIGN KEY (gl_account_id) REFERENCES gl_account(id),
      FOREIGN KEY (student_id) REFERENCES student(id),
      FOREIGN KEY (imported_by_user_id) REFERENCES user(id),
      FOREIGN KEY (verified_by_user_id) REFERENCES user(id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_opening_balance_student ON opening_balance(student_id);
  `);

  // ============================================================================
  // 4. TRANSACTION APPROVAL WORKFLOW
  // ============================================================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS approval_rule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_name TEXT NOT NULL,
      transaction_type TEXT NOT NULL,
      min_amount INTEGER,
      max_amount INTEGER,
      days_since_transaction INTEGER,
      required_approver_role TEXT NOT NULL,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS transaction_approval (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      journal_entry_id INTEGER NOT NULL,
      approval_rule_id INTEGER NOT NULL,
      requested_by_user_id INTEGER NOT NULL,
      requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
      reviewed_by_user_id INTEGER,
      reviewed_at DATETIME,
      review_notes TEXT,
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entry(id),
      FOREIGN KEY (approval_rule_id) REFERENCES approval_rule(id),
      FOREIGN KEY (requested_by_user_id) REFERENCES user(id),
      FOREIGN KEY (reviewed_by_user_id) REFERENCES user(id)
    );
  `);

  // ============================================================================
  // 5. SEED STANDARD KENYAN SCHOOL CHART OF ACCOUNTS
  // ============================================================================
  const standardAccounts = [
    // ASSETS (1000-1999)
    { code: '1010', name: 'Cash on Hand', type: 'ASSET', balance: 'DEBIT', system: 1 },
    { code: '1020', name: 'Bank Account - KCB', type: 'ASSET', balance: 'DEBIT', system: 1 },
    { code: '1030', name: 'Bank Account - Equity', type: 'ASSET', balance: 'DEBIT', system: 1 },
    { code: '1100', name: 'Accounts Receivable - Students', type: 'ASSET', balance: 'DEBIT', system: 1 },
    { code: '1200', name: 'Inventory - Supplies', type: 'ASSET', balance: 'DEBIT', system: 1 },
    { code: '1300', name: 'Fixed Assets - Buildings', type: 'ASSET', balance: 'DEBIT', system: 1 },
    { code: '1310', name: 'Fixed Assets - Vehicles', type: 'ASSET', balance: 'DEBIT', system: 1 },
    { code: '1320', name: 'Fixed Assets - Furniture', type: 'ASSET', balance: 'DEBIT', system: 1 },
    { code: '1390', name: 'Accumulated Depreciation', type: 'ASSET', balance: 'CREDIT', system: 1 },
    
    // LIABILITIES (2000-2999)
    { code: '2010', name: 'Accounts Payable', type: 'LIABILITY', balance: 'CREDIT', system: 1 },
    { code: '2020', name: 'Student Credit Balances', type: 'LIABILITY', balance: 'CREDIT', system: 1 },
    { code: '2100', name: 'Salary Payable', type: 'LIABILITY', balance: 'CREDIT', system: 1 },
    { code: '2110', name: 'PAYE Payable', type: 'LIABILITY', balance: 'CREDIT', system: 1 },
    { code: '2120', name: 'NSSF Payable', type: 'LIABILITY', balance: 'CREDIT', system: 1 },
    { code: '2130', name: 'NHIF/SHIF Payable', type: 'LIABILITY', balance: 'CREDIT', system: 1 },
    { code: '2140', name: 'Housing Levy Payable', type: 'LIABILITY', balance: 'CREDIT', system: 1 },
    { code: '2200', name: 'Loans Payable', type: 'LIABILITY', balance: 'CREDIT', system: 1 },
    
    // EQUITY (3000-3999)
    { code: '3010', name: 'Capital', type: 'EQUITY', balance: 'CREDIT', system: 1 },
    { code: '3020', name: 'Retained Earnings', type: 'EQUITY', balance: 'CREDIT', system: 1 },
    { code: '3030', name: 'Current Year Surplus/Deficit', type: 'EQUITY', balance: 'CREDIT', system: 1 },
    
    // REVENUE (4000-4999)
    { code: '4010', name: 'Tuition Fees', type: 'REVENUE', balance: 'CREDIT', system: 1 },
    { code: '4020', name: 'Boarding Fees', type: 'REVENUE', balance: 'CREDIT', system: 1 },
    { code: '4030', name: 'Transport Fees', type: 'REVENUE', balance: 'CREDIT', system: 1 },
    { code: '4040', name: 'Activity Fees', type: 'REVENUE', balance: 'CREDIT', system: 1 },
    { code: '4050', name: 'Exam Fees', type: 'REVENUE', balance: 'CREDIT', system: 1 },
    { code: '4100', name: 'Government Grants - Capitation', type: 'REVENUE', balance: 'CREDIT', system: 1 },
    { code: '4200', name: 'Donations', type: 'REVENUE', balance: 'CREDIT', system: 1 },
    { code: '4300', name: 'Other Income', type: 'REVENUE', balance: 'CREDIT', system: 1 },
    
    // EXPENSES (5000-5999)
    { code: '5010', name: 'Salaries - Teaching Staff', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5020', name: 'Salaries - Non-Teaching Staff', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5030', name: 'Statutory Deductions - NSSF', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5040', name: 'Statutory Deductions - NHIF/SHIF', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5050', name: 'Statutory Deductions - Housing Levy', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5100', name: 'Food & Catering - Boarding', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5200', name: 'Transport - Fuel & Maintenance', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5210', name: 'Transport - Driver Salaries', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5300', name: 'Utilities - Electricity', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5310', name: 'Utilities - Water', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5400', name: 'Supplies - Stationery', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5410', name: 'Supplies - Cleaning', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5500', name: 'Repairs & Maintenance', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5600', name: 'Depreciation Expense', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5700', name: 'Bank Charges', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5800', name: 'Professional Fees', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5900', name: 'Miscellaneous Expenses', type: 'EXPENSE', balance: 'DEBIT', system: 1 }
  ];

  const insertStmt = db.prepare(`
    INSERT INTO gl_account (account_code, account_name, account_type, normal_balance, is_system_account, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  for (const account of standardAccounts) {
    insertStmt.run(account.code, account.name, account.type, account.balance, account.system);
  }

  // ============================================================================
  // 6. SEED DEFAULT APPROVAL RULES
  // ============================================================================
  db.exec(`
    -- High-value transaction voids require Finance Manager approval
    INSERT INTO approval_rule (rule_name, transaction_type, min_amount, required_approver_role, is_active)
    VALUES ('High Value Void', 'VOID', 50000, 'FINANCE_MANAGER', 1);
    
    -- Old transaction voids (>7 days) require approval
    INSERT INTO approval_rule (rule_name, transaction_type, days_since_transaction, required_approver_role, is_active)
    VALUES ('Aged Transaction Void', 'VOID', 7, 'FINANCE_MANAGER', 1);
    
    -- Large payments require dual approval
    INSERT INTO approval_rule (rule_name, transaction_type, min_amount, required_approver_role, is_active)
    VALUES ('Large Payment', 'FEE_PAYMENT', 100000, 'FINANCE_MANAGER', 1);
    
    -- Refunds require approval
    INSERT INTO approval_rule (rule_name, transaction_type, required_approver_role, is_active)
    VALUES ('All Refunds', 'REFUND', 'FINANCE_MANAGER', 1);
  `);

  // ============================================================================
  // 7. UPDATE FEE_CATEGORY TO MAP TO GL ACCOUNTS
  // ============================================================================
  db.exec(`
    ALTER TABLE fee_category ADD COLUMN gl_account_id INTEGER REFERENCES gl_account(id);
    
    -- Map fee categories to revenue accounts
    UPDATE fee_category SET gl_account_id = (SELECT id FROM gl_account WHERE account_code = '4010') WHERE category_name = 'Tuition';
    UPDATE fee_category SET gl_account_id = (SELECT id FROM gl_account WHERE account_code = '4020') WHERE category_name LIKE '%Board%';
    UPDATE fee_category SET gl_account_id = (SELECT id FROM gl_account WHERE account_code = '4030') WHERE category_name LIKE '%Transport%';
    UPDATE fee_category SET gl_account_id = (SELECT id FROM gl_account WHERE account_code = '4040') WHERE category_name LIKE '%Activity%' OR category_name LIKE '%Sport%';
    UPDATE fee_category SET gl_account_id = (SELECT id FROM gl_account WHERE account_code = '4050') WHERE category_name LIKE '%Exam%';
  `);

  // ============================================================================
  // 8. ADD RECONCILIATION TRACKING
  // ============================================================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS ledger_reconciliation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reconciliation_date DATE NOT NULL,
      gl_account_id INTEGER NOT NULL,
      opening_balance INTEGER NOT NULL,
      total_debits INTEGER NOT NULL,
      total_credits INTEGER NOT NULL,
      closing_balance INTEGER NOT NULL,
      calculated_balance INTEGER NOT NULL,
      variance INTEGER NOT NULL,
      is_balanced BOOLEAN DEFAULT 0,
      reconciled_by_user_id INTEGER NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (gl_account_id) REFERENCES gl_account(id),
      FOREIGN KEY (reconciled_by_user_id) REFERENCES user(id)
    );
  `);

  console.log('Migration 011: Chart of Accounts & Double-Entry Ledger completed');
}

export function down(db: any): void {
  db.exec(`
    DROP TABLE IF EXISTS ledger_reconciliation;
    DROP TABLE IF EXISTS transaction_approval;
    DROP TABLE IF EXISTS approval_rule;
    DROP TABLE IF EXISTS opening_balance;
    DROP TABLE IF EXISTS journal_entry_line;
    DROP TABLE IF EXISTS journal_entry;
    DROP TABLE IF EXISTS gl_account;
    
    -- Remove GL mapping from fee_category
    ALTER TABLE fee_category DROP COLUMN gl_account_id;
  `);
  
  console.log('Migration 011: Rolled back Chart of Accounts & Double-Entry Ledger');
}
