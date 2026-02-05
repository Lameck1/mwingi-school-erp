import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  console.warn('Running Migration 001: Initial Schema');

  // ============================================================================
  // 1. CORE SYSTEM & SCHOOL SETTINGS
  // ============================================================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS school_settings (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      school_name TEXT NOT NULL DEFAULT 'Mwingi Adventist School',
      school_motto TEXT, address TEXT, phone TEXT, email TEXT, logo_path TEXT,
      mpesa_paybill TEXT, sms_api_key TEXT, sms_api_secret TEXT, sms_sender_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS user (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, full_name TEXT NOT NULL, email TEXT,
      role TEXT NOT NULL CHECK(role IN ('ADMIN', 'ACCOUNTS_CLERK', 'AUDITOR', 'TEACHER', 'PRINCIPAL', 'DEPUTY_PRINCIPAL')),
      is_active BOOLEAN DEFAULT 1, last_login DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
      action_type TEXT NOT NULL, table_name TEXT NOT NULL, record_id INTEGER,
      old_values TEXT, new_values TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES user(id)
    );

    CREATE TABLE IF NOT EXISTS backup_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, backup_path TEXT NOT NULL,
      backup_size INTEGER, backup_type TEXT NOT NULL, status TEXT DEFAULT 'SUCCESS',
      error_message TEXT, created_by_user_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS message_template (
      id INTEGER PRIMARY KEY AUTOINCREMENT, template_name TEXT NOT NULL UNIQUE,
      template_type TEXT NOT NULL CHECK(template_type IN ('SMS', 'EMAIL')),
      category TEXT CHECK(category IN ('FEE_REMINDER', 'PAYMENT_RECEIPT', 'ATTENDANCE', 'GENERAL', 'PAYSLIP')),
      subject TEXT, body TEXT NOT NULL, placeholders TEXT, is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS message_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, template_id INTEGER,
      recipient_type TEXT NOT NULL, recipient_id INTEGER, recipient_contact TEXT NOT NULL,
      message_type TEXT NOT NULL, subject TEXT, message_body TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING', external_id TEXT, error_message TEXT,
      sent_by_user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS system_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        is_encrypted BOOLEAN DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ============================================================================
  // 2. ACADEMIC STRUCTURE (Years, Terms, Streams, Students)
  // ============================================================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS academic_year (
      id INTEGER PRIMARY KEY AUTOINCREMENT, year_name TEXT NOT NULL UNIQUE,
      start_date DATE NOT NULL, end_date DATE NOT NULL, is_current BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS term (
      id INTEGER PRIMARY KEY AUTOINCREMENT, academic_year_id INTEGER NOT NULL,
      term_number INTEGER NOT NULL, term_name TEXT NOT NULL,
      start_date DATE NOT NULL, end_date DATE NOT NULL, is_current BOOLEAN DEFAULT 0,
      status TEXT DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'CLOSED')),
      FOREIGN KEY (academic_year_id) REFERENCES academic_year(id), UNIQUE(academic_year_id, term_number)
    );

    CREATE TABLE IF NOT EXISTS stream (
      id INTEGER PRIMARY KEY AUTOINCREMENT, stream_code TEXT NOT NULL UNIQUE,
      stream_name TEXT NOT NULL, level_order INTEGER NOT NULL,
      is_junior_secondary BOOLEAN DEFAULT 0, is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS student (
      id INTEGER PRIMARY KEY AUTOINCREMENT, admission_number TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL, middle_name TEXT, last_name TEXT NOT NULL,
      date_of_birth DATE, gender TEXT CHECK(gender IN ('M', 'F')),
      student_type TEXT NOT NULL CHECK(student_type IN ('DAY_SCHOLAR', 'BOARDER')),
      admission_date DATE NOT NULL, guardian_name TEXT, guardian_phone TEXT,
      guardian_email TEXT, guardian_relationship TEXT, address TEXT, photo_path TEXT,
      is_active BOOLEAN DEFAULT 1, notes TEXT,
      credit_balance INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_student_admission ON student(admission_number);

    CREATE TABLE IF NOT EXISTS enrollment (
      id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL,
      academic_year_id INTEGER NOT NULL, term_id INTEGER NOT NULL, stream_id INTEGER NOT NULL,
      student_type TEXT NOT NULL CHECK(student_type IN ('DAY_SCHOLAR', 'BOARDER')),
      enrollment_date DATE NOT NULL, status TEXT DEFAULT 'ACTIVE',
      notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES student(id),
      FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
      FOREIGN KEY (stream_id) REFERENCES stream(id)
    );
    
    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT, staff_number TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL, middle_name TEXT, last_name TEXT NOT NULL,
      id_number TEXT, kra_pin TEXT, nhif_number TEXT, nssf_number TEXT,
      phone TEXT, email TEXT, bank_name TEXT, bank_account TEXT,
      department TEXT, job_title TEXT, employment_date DATE,
      basic_salary INTEGER DEFAULT 0, is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ============================================================================
  // 3. FINANCE - CHART OF ACCOUNTS & LEDGER
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
      posted_by_user_id INTEGER, posted_at DATETIME,
      is_voided BOOLEAN DEFAULT 0, voided_reason TEXT, voided_by_user_id INTEGER, voided_at DATETIME,
      requires_approval BOOLEAN DEFAULT 0,
      approval_status TEXT DEFAULT 'PENDING' CHECK(approval_status IN ('PENDING', 'APPROVED', 'REJECTED')),
      approved_by_user_id INTEGER, approved_at DATETIME,
      created_by_user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES student(id),
      FOREIGN KEY (staff_id) REFERENCES staff(id),
      FOREIGN KEY (term_id) REFERENCES term(id),
      FOREIGN KEY (created_by_user_id) REFERENCES user(id)
    );
    CREATE INDEX IF NOT EXISTS idx_journal_entry_ref ON journal_entry(entry_ref);

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
    );
    
    CREATE TABLE IF NOT EXISTS opening_balance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      academic_year_id INTEGER NOT NULL,
      gl_account_id INTEGER,
      student_id INTEGER,
      debit_amount INTEGER DEFAULT 0,
      credit_amount INTEGER DEFAULT 0,
      description TEXT,
      imported_from TEXT, imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      imported_by_user_id INTEGER NOT NULL,
      is_verified BOOLEAN DEFAULT 0, verified_by_user_id INTEGER, verified_at DATETIME,
      FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
      FOREIGN KEY (gl_account_id) REFERENCES gl_account(id),
      FOREIGN KEY (student_id) REFERENCES student(id)
    );

    CREATE TABLE IF NOT EXISTS ledger_reconciliation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reconciliation_date DATE NOT NULL,
      gl_account_id INTEGER NOT NULL,
      opening_balance INTEGER NOT NULL,
      total_debits INTEGER NOT NULL, total_credits INTEGER NOT NULL,
      closing_balance INTEGER NOT NULL, calculated_balance INTEGER NOT NULL,
      variance INTEGER NOT NULL, is_balanced BOOLEAN DEFAULT 0,
      reconciled_by_user_id INTEGER NOT NULL, notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (gl_account_id) REFERENCES gl_account(id),
      FOREIGN KEY (reconciled_by_user_id) REFERENCES user(id)
    );
    
    CREATE TABLE IF NOT EXISTS approval_rule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_name TEXT NOT NULL, transaction_type TEXT NOT NULL,
      min_amount INTEGER, max_amount INTEGER, days_since_transaction INTEGER,
      required_approver_role TEXT NOT NULL, is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS transaction_approval (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      journal_entry_id INTEGER NOT NULL, approval_rule_id INTEGER NOT NULL,
      requested_by_user_id INTEGER NOT NULL, requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
      reviewed_by_user_id INTEGER, reviewed_at DATETIME, review_notes TEXT,
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entry(id),
      FOREIGN KEY (approval_rule_id) REFERENCES approval_rule(id),
      FOREIGN KEY (requested_by_user_id) REFERENCES user(id)
    );
  `);

  // ============================================================================
  // 4. FEES & BILLING
  // ============================================================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS fee_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT, category_name TEXT NOT NULL UNIQUE,
      description TEXT, is_active BOOLEAN DEFAULT 1,
      gl_account_id INTEGER REFERENCES gl_account(id)
    );

    CREATE TABLE IF NOT EXISTS fee_structure (
      id INTEGER PRIMARY KEY AUTOINCREMENT, academic_year_id INTEGER NOT NULL,
      stream_id INTEGER NOT NULL, student_type TEXT NOT NULL CHECK(student_type IN ('DAY_SCHOLAR', 'BOARDER')),
      term_id INTEGER, fee_category_id INTEGER NOT NULL, amount INTEGER NOT NULL,
      description TEXT, 
      condition_type TEXT DEFAULT 'ALL',
      frequency TEXT DEFAULT 'PER_TERM',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
      FOREIGN KEY (stream_id) REFERENCES stream(id),
      FOREIGN KEY (fee_category_id) REFERENCES fee_category(id)
    );

    CREATE TABLE IF NOT EXISTS fee_invoice (
      id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_number TEXT NOT NULL UNIQUE,
      student_id INTEGER NOT NULL, term_id INTEGER NOT NULL,
      invoice_date DATE NOT NULL, due_date DATE NOT NULL,
      total_amount INTEGER NOT NULL, amount_paid INTEGER DEFAULT 0,
      status TEXT DEFAULT 'PENDING', notes TEXT, created_by_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES student(id), FOREIGN KEY (created_by_user_id) REFERENCES user(id)
    );

    CREATE TABLE IF NOT EXISTS invoice_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL,
      fee_category_id INTEGER NOT NULL, description TEXT NOT NULL, amount INTEGER NOT NULL,
      FOREIGN KEY (invoice_id) REFERENCES fee_invoice(id)
    );

    -- Legacy support: ledger_transaction (mapped to Journal Entry ideally, but kept for compatibility)
    CREATE TABLE IF NOT EXISTS transaction_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT, category_name TEXT NOT NULL,
      category_type TEXT NOT NULL CHECK(category_type IN ('INCOME', 'EXPENSE')),
      parent_category_id INTEGER, is_system BOOLEAN DEFAULT 0, is_active BOOLEAN DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS ledger_transaction (
      id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_ref TEXT NOT NULL UNIQUE,
      transaction_date DATE NOT NULL,
      transaction_type TEXT NOT NULL CHECK(transaction_type IN ('FEE_PAYMENT', 'DONATION', 'GRANT', 'EXPENSE', 'SALARY_PAYMENT', 'REFUND', 'OPENING_BALANCE', 'ADJUSTMENT')),
      category_id INTEGER NOT NULL, amount INTEGER NOT NULL,
      debit_credit TEXT NOT NULL CHECK(debit_credit IN ('DEBIT', 'CREDIT')),
      student_id INTEGER, staff_id INTEGER, invoice_id INTEGER,
      payment_method TEXT CHECK(payment_method IN ('CASH', 'MPESA', 'BANK_TRANSFER', 'CHEQUE')),
      payment_reference TEXT, description TEXT, term_id INTEGER,
      recorded_by_user_id INTEGER NOT NULL, is_voided BOOLEAN DEFAULT 0,
      voided_reason TEXT, voided_by_user_id INTEGER, voided_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES transaction_category(id),
      FOREIGN KEY (student_id) REFERENCES student(id),
      FOREIGN KEY (invoice_id) REFERENCES fee_invoice(id),
      FOREIGN KEY (recorded_by_user_id) REFERENCES user(id)
    );
    CREATE INDEX IF NOT EXISTS idx_ledger_date ON ledger_transaction(transaction_date);
    CREATE INDEX IF NOT EXISTS idx_ledger_student ON ledger_transaction(student_id);

    CREATE TABLE IF NOT EXISTS receipt (
      id INTEGER PRIMARY KEY AUTOINCREMENT, receipt_number TEXT NOT NULL UNIQUE,
      transaction_id INTEGER NOT NULL UNIQUE, receipt_date DATE NOT NULL,
      student_id INTEGER NOT NULL, amount INTEGER NOT NULL,
      amount_in_words TEXT, payment_method TEXT NOT NULL, payment_reference TEXT,
      printed_count INTEGER DEFAULT 0, created_by_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (transaction_id) REFERENCES ledger_transaction(id),
      FOREIGN KEY (student_id) REFERENCES student(id)
    );
  `);

  // ============================================================================
  // 5. PAYROLL
  // ============================================================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS payroll_period (
      id INTEGER PRIMARY KEY AUTOINCREMENT, period_name TEXT NOT NULL,
      month INTEGER NOT NULL, year INTEGER NOT NULL,
      start_date DATE NOT NULL, end_date DATE NOT NULL,
      status TEXT DEFAULT 'DRAFT', approved_by_user_id INTEGER, approved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(month, year)
    );

    CREATE TABLE IF NOT EXISTS payroll (
      id INTEGER PRIMARY KEY AUTOINCREMENT, period_id INTEGER NOT NULL, staff_id INTEGER NOT NULL,
      basic_salary INTEGER NOT NULL, gross_salary INTEGER NOT NULL,
      total_deductions INTEGER NOT NULL, net_salary INTEGER NOT NULL,
      payment_status TEXT DEFAULT 'PENDING', payment_date DATE, transaction_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (period_id) REFERENCES payroll_period(id), FOREIGN KEY (staff_id) REFERENCES staff(id),
      UNIQUE(period_id, staff_id)
    );

    CREATE TABLE IF NOT EXISTS payroll_deduction (
      id INTEGER PRIMARY KEY AUTOINCREMENT, payroll_id INTEGER NOT NULL,
      deduction_name TEXT NOT NULL, amount INTEGER NOT NULL,
      FOREIGN KEY (payroll_id) REFERENCES payroll(id)
    );

    CREATE TABLE IF NOT EXISTS payroll_allowance (
      id INTEGER PRIMARY KEY AUTOINCREMENT, payroll_id INTEGER NOT NULL,
      allowance_name TEXT NOT NULL, amount INTEGER NOT NULL,
      FOREIGN KEY (payroll_id) REFERENCES payroll(id)
    );
    
    CREATE TABLE IF NOT EXISTS statutory_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT, rate_type TEXT NOT NULL,
      min_amount DECIMAL(12, 2), max_amount DECIMAL(12, 2),
      rate DECIMAL(6, 4), fixed_amount DECIMAL(12, 2),
      effective_from DATE NOT NULL, effective_to DATE, is_current BOOLEAN DEFAULT 1
    );
  `);

  // ============================================================================
  // 6. INVENTORY
  // ============================================================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT, category_name TEXT NOT NULL UNIQUE,
      description TEXT, is_active BOOLEAN DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS supplier (
      id INTEGER PRIMARY KEY AUTOINCREMENT, supplier_name TEXT NOT NULL,
      contact_person TEXT, phone TEXT, email TEXT, address TEXT,
      is_active BOOLEAN DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS inventory_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT, item_code TEXT NOT NULL UNIQUE,
      item_name TEXT NOT NULL, category_id INTEGER NOT NULL, unit_of_measure TEXT NOT NULL,
      current_stock DECIMAL(12, 2) DEFAULT 0, reorder_level DECIMAL(12, 2) DEFAULT 0,
      unit_cost DECIMAL(12, 2) DEFAULT 0, is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES inventory_category(id)
    );

    CREATE TABLE IF NOT EXISTS stock_movement (
      id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL,
      movement_type TEXT NOT NULL CHECK(movement_type IN ('IN', 'OUT', 'ADJUSTMENT')),
      quantity DECIMAL(12, 2) NOT NULL, unit_cost DECIMAL(12, 2), total_cost DECIMAL(12, 2),
      reference_number TEXT, supplier_id INTEGER, description TEXT, movement_date DATE NOT NULL,
      recorded_by_user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (item_id) REFERENCES inventory_item(id)
    );
  `);

  // ============================================================================
  // 7. ACADEMIC & CBC FEATURES
  // ============================================================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS subject (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, 
      curriculum TEXT NOT NULL CHECK(curriculum IN ('8-4-4', 'CBC', 'ECDE')), 
      is_compulsory BOOLEAN DEFAULT 0, is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS subject_allocation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      academic_year_id INTEGER NOT NULL, term_id INTEGER NOT NULL,
      stream_id INTEGER NOT NULL, subject_id INTEGER NOT NULL, teacher_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (stream_id) REFERENCES stream(id), FOREIGN KEY (teacher_id) REFERENCES staff(id),
      FOREIGN KEY (subject_id) REFERENCES subject(id), UNIQUE(academic_year_id, term_id, stream_id, subject_id)
    );

    CREATE TABLE IF NOT EXISTS grading_scale (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      curriculum TEXT NOT NULL CHECK(curriculum IN ('8-4-4', 'CBC', 'ECDE')),
      grade TEXT NOT NULL, min_score INTEGER NOT NULL, max_score INTEGER NOT NULL,
      points INTEGER, remarks TEXT, is_active BOOLEAN DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS exam (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_name TEXT NOT NULL,
      academic_year_id INTEGER NOT NULL, term_id INTEGER NOT NULL,
      start_date DATE, end_date DATE,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (academic_year_id) REFERENCES academic_year(id)
    );
  `);

  // ============================================================================
  // 8. REPORTING & SCHEDULING
  // ============================================================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_report (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_name TEXT NOT NULL,
      report_type TEXT NOT NULL,
      parameters TEXT, -- JSON configuration
      schedule_type TEXT NOT NULL CHECK(schedule_type IN ('DAILY', 'WEEKLY', 'MONTHLY', 'TERM_END', 'YEAR_END')),
      day_of_week INTEGER, -- 0-6 (Sunday-Saturday)
      day_of_month INTEGER, -- 1-31
      time_of_day TEXT NOT NULL, -- HH:mm
      recipients TEXT NOT NULL, -- JSON array of emails
      export_format TEXT DEFAULT 'PDF' CHECK(export_format IN ('PDF', 'EXCEL', 'CSV')),
      is_active BOOLEAN DEFAULT 1,
      last_run_at DATETIME,
      next_run_at DATETIME,
      created_by_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by_user_id) REFERENCES user(id)
    );

    CREATE TABLE IF NOT EXISTS report_execution_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scheduled_report_id INTEGER NOT NULL,
      execution_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL CHECK(status IN ('SUCCESS', 'FAILED')),
      recipients_notified INTEGER DEFAULT 0,
      error_message TEXT,
      file_path TEXT,
      FOREIGN KEY (scheduled_report_id) REFERENCES scheduled_report(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_scheduled_report_active ON scheduled_report(is_active);
    CREATE INDEX IF NOT EXISTS idx_report_log_report ON report_execution_log(scheduled_report_id);
  `);

  // ============================================================================
  // 9. EXAM RESULTS & CBC FEATURES
  // ============================================================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS exam_result (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL, student_id INTEGER NOT NULL, subject_id INTEGER NOT NULL,
      score DECIMAL(5, 2), competency_level INTEGER, teacher_remarks TEXT,
      entered_by_user_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (exam_id) REFERENCES exam(id), FOREIGN KEY (student_id) REFERENCES student(id),
      FOREIGN KEY (subject_id) REFERENCES subject(id), UNIQUE(exam_id, student_id, subject_id)
    );

    CREATE TABLE IF NOT EXISTS report_card_summary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL, student_id INTEGER NOT NULL,
      total_marks DECIMAL(6, 2), mean_score DECIMAL(5, 2), mean_grade TEXT,
      stream_position INTEGER, class_position INTEGER,
      class_teacher_remarks TEXT, principal_remarks TEXT,
      generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (exam_id) REFERENCES exam(id), FOREIGN KEY (student_id) REFERENCES student(id),
      UNIQUE(exam_id, student_id)
    );
    
    CREATE TABLE IF NOT EXISTS cbc_strand (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL, description TEXT, budget_gl_account_code TEXT,
      is_active BOOLEAN NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS fee_category_strand (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fee_category_id INTEGER NOT NULL, cbc_strand_id INTEGER NOT NULL,
      allocation_percentage REAL NOT NULL DEFAULT 100.0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (fee_category_id) REFERENCES fee_category(id) ON DELETE CASCADE,
      FOREIGN KEY (cbc_strand_id) REFERENCES cbc_strand(id) ON DELETE CASCADE,
      UNIQUE(fee_category_id, cbc_strand_id)
    );

    CREATE TABLE IF NOT EXISTS cbc_strand_expense (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cbc_strand_id INTEGER NOT NULL, gl_account_code TEXT NOT NULL,
      fiscal_year INTEGER NOT NULL, allocated_budget INTEGER NOT NULL DEFAULT 0,
      spent_amount INTEGER NOT NULL DEFAULT 0, description TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cbc_strand_id) REFERENCES cbc_strand(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS student_activity_participation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL, cbc_strand_id INTEGER NOT NULL,
      academic_year INTEGER NOT NULL, term INTEGER NOT NULL CHECK (term IN (1, 2, 3)),
      participation_level TEXT NOT NULL CHECK (participation_level IN ('PRIMARY', 'SECONDARY', 'INTEREST')),
      notes TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES student(id) ON DELETE CASCADE,
      FOREIGN KEY (cbc_strand_id) REFERENCES cbc_strand(id) ON DELETE CASCADE,
      UNIQUE(student_id, cbc_strand_id, academic_year, term)
    );
  `);

  // ============================================================================
  // 10. MERIT LISTS & AWARDS
  // ============================================================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS merit_list (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      academic_year_id INTEGER NOT NULL, term_id INTEGER NOT NULL,
      stream_id INTEGER NOT NULL, exam_id INTEGER,
      list_type TEXT NOT NULL CHECK(list_type IN ('overall', 'subject')),
      subject_id INTEGER, generated_date TEXT NOT NULL, generated_by_user_id INTEGER,
      total_students INTEGER, remarks TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
      FOREIGN KEY (term_id) REFERENCES term(id),
      FOREIGN KEY (stream_id) REFERENCES stream(id),
      FOREIGN KEY (exam_id) REFERENCES exam(id),
      FOREIGN KEY (subject_id) REFERENCES subject(id),
      UNIQUE(academic_year_id, term_id, stream_id, exam_id, list_type)
    );

    CREATE TABLE IF NOT EXISTS merit_list_entry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merit_list_id INTEGER NOT NULL, student_id INTEGER NOT NULL,
      position INTEGER NOT NULL, total_marks REAL NOT NULL,
      average_marks REAL NOT NULL, grade TEXT, percentage REAL NOT NULL,
      class_position INTEGER, stream_position INTEGER, tied_count INTEGER DEFAULT 1,
      remarks TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (merit_list_id) REFERENCES merit_list(id),
      FOREIGN KEY (student_id) REFERENCES student(id),
      UNIQUE(merit_list_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS subject_merit_entry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL, academic_year_id INTEGER NOT NULL,
      term_id INTEGER NOT NULL, exam_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL, stream_id INTEGER NOT NULL,
      position INTEGER NOT NULL, marks REAL NOT NULL, percentage REAL NOT NULL,
      grade TEXT, teacher_id INTEGER, subject_difficulty_index REAL, remarks TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (subject_id) REFERENCES subject(id),
      FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
      FOREIGN KEY (term_id) REFERENCES term(id),
      FOREIGN KEY (exam_id) REFERENCES exam(id),
      FOREIGN KEY (student_id) REFERENCES student(id),
      FOREIGN KEY (stream_id) REFERENCES stream(id),
      UNIQUE(exam_id, student_id, subject_id)
    );

    CREATE TABLE IF NOT EXISTS award_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category_type TEXT NOT NULL CHECK(category_type IN ('academic_excellence', 'improvement', 'discipline', 'sports', 'arts', 'agriculture', 'other')),
      description TEXT, criteria TEXT, minimum_threshold REAL,
      is_automatic BOOLEAN DEFAULT 0, requires_approval BOOLEAN DEFAULT 1,
      is_active BOOLEAN DEFAULT 1, sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS student_award (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL, 
      award_category_id INTEGER NOT NULL,
      academic_year_id INTEGER NOT NULL, 
      term_id INTEGER,
      awarded_date TEXT DEFAULT (datetime('now')), 
      certificate_number TEXT, 
      remarks TEXT,
      approval_status TEXT DEFAULT 'pending' CHECK(approval_status IN ('pending', 'approved', 'rejected')),
      assigned_by_user_id INTEGER,
      approved_by_user_id INTEGER,
      approved_at DATETIME,
      rejection_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES student(id),
      FOREIGN KEY (award_category_id) REFERENCES award_category(id),
      FOREIGN KEY (assigned_by_user_id) REFERENCES user(id),
      FOREIGN KEY (approved_by_user_id) REFERENCES user(id)
    );

    CREATE TABLE IF NOT EXISTS performance_improvement (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL, subject_id INTEGER,
      academic_year_id INTEGER NOT NULL, term_id INTEGER NOT NULL,
      previous_exam_id INTEGER, current_exam_id INTEGER,
      previous_score REAL, current_score REAL, deviation REAL,
      improvement_percentage REAL, is_significant BOOLEAN DEFAULT 0,
      FOREIGN KEY (student_id) REFERENCES student(id),
      FOREIGN KEY (subject_id) REFERENCES subject(id),
      UNIQUE(student_id, current_exam_id, subject_id)
    );
  `);

  // ============================================================================
  // 11. BUDGETING
  // ============================================================================
  db.exec(`
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
  `);

  // ============================================================================
  // 12. BANK RECONCILIATION
  // ============================================================================
  db.exec(`
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
  `);

  // ============================================================================
  // 13. APPROVAL WORKFLOWS
  // ============================================================================
  db.exec(`
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
  `);
  // ============================================================================
  // 14. RECOVERED MISSING TABLES
  // ============================================================================
  db.exec(`
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
  `);
}

export function down(db: Database): void {
  const tables = [
    'attendance', 'financial_period', 'fixed_asset', 'asset_category', 'staff_allowance',
    'performance_improvement', 'student_award', 'award_category', 'subject_merit_entry', 'merit_list_entry', 'merit_list',
    'student_activity_participation', 'cbc_strand_expense', 'fee_category_strand', 'cbc_strand',
    'report_card_summary', 'exam_result', 'exam', 'grading_scale', 'subject_allocation', 'subject',
    'stock_movement', 'inventory_item', 'supplier', 'inventory_category',
    'payroll_allowance', 'payroll_deduction', 'payroll', 'payroll_period', 'statutory_rates',
    'receipt', 'ledger_transaction', 'transaction_category', 'invoice_item', 'fee_invoice', 'fee_structure', 'fee_category',
    'transaction_approval', 'approval_rule', 'ledger_reconciliation', 'opening_balance', 'journal_entry_line', 'journal_entry', 'gl_account',
    'staff', 'enrollment', 'student', 'stream', 'term', 'academic_year',
    'message_log', 'message_template', 'backup_log', 'audit_log', 'user', 'school_settings',
    'budget_revision', 'budget_line_item', 'budget', 'reconciliation_adjustment', 'bank_statement_line', 'bank_statement', 'bank_account',
    'approval_history', 'approval_request', 'approval_workflow'
  ];

  for (const table of tables) {
    db.exec(`DROP TABLE IF EXISTS ${table}`);
  }
}
