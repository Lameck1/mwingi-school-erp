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
        'OPENING_BALANCE','ADJUSTMENT','ASSET_PURCHASE','ASSET_ACQUISITION','DEPRECIATION',
        'ASSET_DISPOSAL','LOAN_DISBURSEMENT','LOAN_REPAYMENT','VOID_REVERSAL',
        'INCOME','DONATION','GRANT'
      )),
      description TEXT NOT NULL,
      student_id INTEGER, staff_id INTEGER, supplier_id INTEGER, term_id INTEGER,
      is_posted BOOLEAN DEFAULT 0,
      posted_by_user_id INTEGER, posted_at DATETIME,
      is_voided BOOLEAN DEFAULT 0, voided_reason TEXT,
      voided_by_user_id INTEGER, voided_at DATETIME,
      requires_approval BOOLEAN DEFAULT 0,
      approval_status TEXT DEFAULT 'PENDING' CHECK(approval_status IN ('PENDING','APPROVED','REJECTED')),
      approved_by_user_id INTEGER, approved_at DATETIME,
      created_by_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      source_ledger_txn_id INTEGER,
      department TEXT,
      FOREIGN KEY (supplier_id) REFERENCES supplier(id)
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
      gl_account_id INTEGER REFERENCES gl_account(id),
      priority INTEGER NOT NULL DEFAULT 99,
      jss_account_type TEXT CHECK(jss_account_type IN ('TUITION','BOARDING','TRANSPORT','ACTIVITY','OTHER'))
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
      approval_rule_id INTEGER,
      legacy_transaction_approval_id INTEGER,
      FOREIGN KEY (workflow_id) REFERENCES approval_workflow(id),
      FOREIGN KEY (requested_by_user_id) REFERENCES user(id),
      FOREIGN KEY (final_approver_user_id) REFERENCES user(id)
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
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CLOSED','LOCKED')),
      closed_by_user_id INTEGER,
      closed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (closed_by_user_id) REFERENCES user(id)
    );`,

  budget_allocation: `
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
    );`,

  staff: `
    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_number TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL, middle_name TEXT, last_name TEXT NOT NULL,
      id_number TEXT, kra_pin TEXT, nhif_number TEXT, nssf_number TEXT,
      phone TEXT, email TEXT, bank_name TEXT, bank_account TEXT,
      department TEXT, job_title TEXT, employment_date DATE,
      basic_salary INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,

  payroll_period: `
    CREATE TABLE IF NOT EXISTS payroll_period (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_name TEXT NOT NULL,
      month INTEGER NOT NULL, year INTEGER NOT NULL,
      start_date DATE NOT NULL, end_date DATE NOT NULL,
      status TEXT DEFAULT 'DRAFT',
      approved_by_user_id INTEGER, approved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(month, year)
    );`,

  payroll: `
    CREATE TABLE IF NOT EXISTS payroll (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_id INTEGER NOT NULL,
      staff_id INTEGER NOT NULL,
      basic_salary INTEGER NOT NULL,
      gross_salary INTEGER NOT NULL,
      total_deductions INTEGER NOT NULL,
      net_salary INTEGER NOT NULL,
      payment_status TEXT DEFAULT 'PENDING',
      payment_date DATE,
      transaction_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (period_id) REFERENCES payroll_period(id),
      FOREIGN KEY (staff_id) REFERENCES staff(id),
      UNIQUE(period_id, staff_id)
    );`,

  payroll_deduction: `
    CREATE TABLE IF NOT EXISTS payroll_deduction (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payroll_id INTEGER NOT NULL,
      deduction_name TEXT NOT NULL,
      amount INTEGER NOT NULL,
      FOREIGN KEY (payroll_id) REFERENCES payroll(id)
    );`,

  school_settings: `
    CREATE TABLE IF NOT EXISTS school_settings (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      school_name TEXT NOT NULL DEFAULT 'Mwingi Adventist School',
      school_motto TEXT, address TEXT, phone TEXT, email TEXT, logo_path TEXT,
      mpesa_paybill TEXT, sms_api_key TEXT, sms_api_secret TEXT, sms_sender_id TEXT,
      school_type TEXT NOT NULL DEFAULT 'PUBLIC' CHECK(school_type IN ('PUBLIC', 'PRIVATE')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,

  stream: `
    CREATE TABLE IF NOT EXISTS stream (
      id INTEGER PRIMARY KEY AUTOINCREMENT, stream_code TEXT NOT NULL UNIQUE,
      stream_name TEXT NOT NULL, level_order INTEGER NOT NULL,
      is_junior_secondary BOOLEAN DEFAULT 0, is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,

  subject: `
    CREATE TABLE IF NOT EXISTS subject (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      curriculum TEXT NOT NULL CHECK(curriculum IN ('8-4-4', 'CBC', 'ECDE')),
      is_compulsory BOOLEAN DEFAULT 0, is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,

  enrollment: `
    CREATE TABLE IF NOT EXISTS enrollment (
      id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL,
      academic_year_id INTEGER NOT NULL, term_id INTEGER NOT NULL, stream_id INTEGER NOT NULL,
      student_type TEXT NOT NULL CHECK(student_type IN ('DAY_SCHOLAR', 'BOARDER')),
      enrollment_date DATE NOT NULL, status TEXT DEFAULT 'ACTIVE',
      notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      academic_term_id INTEGER,
      FOREIGN KEY (student_id) REFERENCES student(id),
      FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
      FOREIGN KEY (stream_id) REFERENCES stream(id)
    );`,

  grading_scale: `
    CREATE TABLE IF NOT EXISTS grading_scale (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      curriculum TEXT NOT NULL CHECK(curriculum IN ('8-4-4', 'CBC', 'ECDE')),
      grade TEXT NOT NULL, min_score INTEGER NOT NULL, max_score INTEGER NOT NULL,
      points INTEGER, remarks TEXT, is_active BOOLEAN DEFAULT 1
    );`,

  exam: `
    CREATE TABLE IF NOT EXISTS exam (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_name TEXT NOT NULL,
      academic_year_id INTEGER NOT NULL, term_id INTEGER NOT NULL,
      start_date DATE, end_date DATE,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (academic_year_id) REFERENCES academic_year(id)
    );`,

  exam_result: `
    CREATE TABLE IF NOT EXISTS exam_result (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL, student_id INTEGER NOT NULL, subject_id INTEGER NOT NULL,
      score DECIMAL(5,2), competency_level INTEGER, teacher_remarks TEXT,
      entered_by_user_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (exam_id) REFERENCES exam(id), FOREIGN KEY (student_id) REFERENCES student(id),
      FOREIGN KEY (subject_id) REFERENCES subject(id), UNIQUE(exam_id, student_id, subject_id)
    );`,

  exam_timetable: `
    CREATE TABLE IF NOT EXISTS exam_timetable (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      academic_year_id INTEGER,
      term_id INTEGER,
      exam_id INTEGER NOT NULL,
      exam_date TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      subject_id INTEGER NOT NULL,
      stream_id INTEGER,
      duration_minutes INTEGER,
      venue_id INTEGER,
      venue_name TEXT,
      capacity INTEGER,
      invigilators_count INTEGER,
      max_capacity INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
      FOREIGN KEY (term_id) REFERENCES term(id),
      FOREIGN KEY (exam_id) REFERENCES exam(id),
      FOREIGN KEY (subject_id) REFERENCES subject(id),
      FOREIGN KEY (stream_id) REFERENCES stream(id)
    );`,

  exam_invigilator: `
    CREATE TABLE IF NOT EXISTS exam_invigilator (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER,
      slot_id INTEGER NOT NULL,
      staff_id INTEGER NOT NULL,
      role TEXT CHECK(role IN ('chief', 'assistant', 'relief')),
      assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (exam_id) REFERENCES exam(id),
      FOREIGN KEY (slot_id) REFERENCES exam_timetable(id),
      FOREIGN KEY (staff_id) REFERENCES staff(id),
      UNIQUE(slot_id, staff_id)
    );`,

  report_card: `
    CREATE TABLE IF NOT EXISTS report_card (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      stream_id INTEGER NOT NULL,
      generated_by_user_id INTEGER NOT NULL,
      overall_grade TEXT,
      total_marks INTEGER,
      average_marks REAL,
      position_in_class INTEGER,
      position_in_stream INTEGER,
      attendance_days_present INTEGER,
      attendance_days_absent INTEGER,
      attendance_percentage REAL,
      class_teacher_remarks TEXT,
      principal_remarks TEXT,
      qr_code_token TEXT,
      generated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      email_sent_at DATETIME,
      FOREIGN KEY (exam_id) REFERENCES exam(id),
      FOREIGN KEY (student_id) REFERENCES student(id),
      FOREIGN KEY (stream_id) REFERENCES stream(id),
      FOREIGN KEY (generated_by_user_id) REFERENCES user(id)
    );`,

  report_card_subject: `
    CREATE TABLE IF NOT EXISTS report_card_subject (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_card_id INTEGER NOT NULL,
      subject_id INTEGER NOT NULL,
      marks REAL,
      grade TEXT,
      percentage REAL,
      teacher_comment TEXT,
      competency_level TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_card_id) REFERENCES report_card(id) ON DELETE CASCADE,
      FOREIGN KEY (subject_id) REFERENCES subject(id),
      UNIQUE(report_card_id, subject_id)
    );`,

  report_card_summary: `
    CREATE TABLE IF NOT EXISTS report_card_summary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL, student_id INTEGER NOT NULL,
      total_marks DECIMAL(6,2), mean_score DECIMAL(5,2), mean_grade TEXT,
      stream_position INTEGER, class_position INTEGER,
      class_teacher_remarks TEXT, principal_remarks TEXT,
      generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (exam_id) REFERENCES exam(id), FOREIGN KEY (student_id) REFERENCES student(id),
      UNIQUE(exam_id, student_id)
    );`,

  budget: `
    CREATE TABLE IF NOT EXISTS budget (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      budget_name TEXT NOT NULL,
      academic_year_id INTEGER NOT NULL,
      term_id INTEGER,
      status TEXT DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','ACTIVE','CLOSED')),
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
    );`,

  asset_category: `
    CREATE TABLE IF NOT EXISTS asset_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_name TEXT NOT NULL UNIQUE,
      depreciation_method TEXT DEFAULT 'STRAIGHT_LINE' CHECK(depreciation_method IN ('STRAIGHT_LINE','DECLINING_BALANCE','NONE')),
      useful_life_years INTEGER DEFAULT 5,
      depreciation_rate DECIMAL(5,2),
      is_active BOOLEAN DEFAULT 1
    );`,

  fixed_asset: `
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
      status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','DISPOSED','WRITTEN_OFF','TRANSFERRED')),
      disposed_date DATE,
      disposed_value INTEGER,
      disposal_reason TEXT,
      supplier_id INTEGER,
      warranty_expiry DATE,
      created_by_user_id INTEGER,
      deleted_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES asset_category(id)
    );`,

  merit_list: `
    CREATE TABLE IF NOT EXISTS merit_list (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      academic_year_id INTEGER NOT NULL, term_id INTEGER NOT NULL,
      stream_id INTEGER NOT NULL, exam_id INTEGER,
      list_type TEXT NOT NULL CHECK(list_type IN ('overall','subject')),
      subject_id INTEGER, generated_date TEXT NOT NULL, generated_by_user_id INTEGER,
      total_students INTEGER, remarks TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
      FOREIGN KEY (term_id) REFERENCES term(id),
      FOREIGN KEY (stream_id) REFERENCES stream(id),
      FOREIGN KEY (exam_id) REFERENCES exam(id),
      FOREIGN KEY (subject_id) REFERENCES subject(id),
      UNIQUE(academic_year_id, term_id, stream_id, exam_id, list_type)
    );`,

  merit_list_entry: `
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
    );`,

  subject_allocation: `
    CREATE TABLE IF NOT EXISTS subject_allocation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      academic_year_id INTEGER NOT NULL, term_id INTEGER NOT NULL,
      stream_id INTEGER NOT NULL, subject_id INTEGER NOT NULL, teacher_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (stream_id) REFERENCES stream(id), FOREIGN KEY (teacher_id) REFERENCES staff(id),
      FOREIGN KEY (subject_id) REFERENCES subject(id), UNIQUE(academic_year_id, term_id, stream_id, subject_id)
    );`,

  attendance: `
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL, stream_id INTEGER NOT NULL,
      academic_year_id INTEGER NOT NULL, term_id INTEGER NOT NULL,
      attendance_date DATE NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('PRESENT','ABSENT','LATE','EXCUSED')),
      notes TEXT, marked_by_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES student(id),
      FOREIGN KEY (stream_id) REFERENCES stream(id),
      FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
      FOREIGN KEY (term_id) REFERENCES term(id),
      FOREIGN KEY (marked_by_user_id) REFERENCES user(id)
    );`,

  system_config: `
    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      is_encrypted BOOLEAN DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,

  fee_structure: `
    CREATE TABLE IF NOT EXISTS fee_structure (
      id INTEGER PRIMARY KEY AUTOINCREMENT, academic_year_id INTEGER NOT NULL,
      stream_id INTEGER NOT NULL, student_type TEXT NOT NULL CHECK(student_type IN ('DAY_SCHOLAR','BOARDER')),
      term_id INTEGER, fee_category_id INTEGER NOT NULL, amount INTEGER NOT NULL,
      description TEXT, condition_type TEXT DEFAULT 'ALL', frequency TEXT DEFAULT 'PER_TERM',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
      FOREIGN KEY (stream_id) REFERENCES stream(id),
      FOREIGN KEY (fee_category_id) REFERENCES fee_category(id)
    );`,

  fee_invoice: `
    CREATE TABLE IF NOT EXISTS fee_invoice (
      id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_number TEXT NOT NULL UNIQUE,
      student_id INTEGER NOT NULL, term_id INTEGER NOT NULL,
      invoice_date DATE NOT NULL, due_date DATE NOT NULL,
      total_amount INTEGER NOT NULL, amount_paid INTEGER DEFAULT 0,
      status TEXT DEFAULT 'PENDING', notes TEXT, created_by_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      academic_term_id INTEGER, amount INTEGER, amount_due INTEGER,
      original_amount INTEGER, is_prorated INTEGER DEFAULT 0, proration_percentage REAL,
      invoice_type TEXT, class_id INTEGER, fee_type TEXT,
      description TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_voided INTEGER DEFAULT 0,
      FOREIGN KEY (student_id) REFERENCES student(id),
      FOREIGN KEY (created_by_user_id) REFERENCES user(id)
    );`,

  invoice_item: `
    CREATE TABLE IF NOT EXISTS invoice_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL,
      fee_category_id INTEGER NOT NULL, description TEXT NOT NULL, amount INTEGER NOT NULL,
      exemption_id INTEGER, original_amount INTEGER, exemption_amount INTEGER DEFAULT 0,
      FOREIGN KEY (invoice_id) REFERENCES fee_invoice(id)
    );`,

  transaction_category: `
    CREATE TABLE IF NOT EXISTS transaction_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT, category_name TEXT NOT NULL,
      category_type TEXT NOT NULL CHECK(category_type IN ('INCOME','EXPENSE')),
      parent_category_id INTEGER, is_system BOOLEAN DEFAULT 0, is_active BOOLEAN DEFAULT 1,
      gl_account_code TEXT
    );`,

  ledger_transaction: `
    CREATE TABLE IF NOT EXISTS ledger_transaction (
      id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_ref TEXT NOT NULL UNIQUE,
      transaction_date DATE NOT NULL,
      transaction_type TEXT NOT NULL CHECK(transaction_type IN (
        'FEE_PAYMENT','DONATION','GRANT','EXPENSE','SALARY_PAYMENT','REFUND','OPENING_BALANCE','ADJUSTMENT'
      )),
      category_id INTEGER NOT NULL, amount INTEGER NOT NULL,
      debit_credit TEXT NOT NULL CHECK(debit_credit IN ('DEBIT','CREDIT')),
      student_id INTEGER, staff_id INTEGER, invoice_id INTEGER,
      payment_method TEXT CHECK(payment_method IN ('CASH','MPESA','BANK_TRANSFER','CHEQUE')),
      payment_reference TEXT, description TEXT, term_id INTEGER,
      recorded_by_user_id INTEGER NOT NULL, is_voided BOOLEAN DEFAULT 0,
      voided_reason TEXT, voided_by_user_id INTEGER, voided_at DATETIME,
      idempotency_key TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES transaction_category(id),
      FOREIGN KEY (student_id) REFERENCES student(id),
      FOREIGN KEY (invoice_id) REFERENCES fee_invoice(id),
      FOREIGN KEY (recorded_by_user_id) REFERENCES user(id)
    );`,

  receipt: `
    CREATE TABLE IF NOT EXISTS receipt (
      id INTEGER PRIMARY KEY AUTOINCREMENT, receipt_number TEXT NOT NULL UNIQUE,
      transaction_id INTEGER NOT NULL UNIQUE, receipt_date DATE NOT NULL,
      student_id INTEGER NOT NULL, amount INTEGER NOT NULL,
      amount_in_words TEXT, payment_method TEXT NOT NULL, payment_reference TEXT,
      printed_count INTEGER DEFAULT 0, created_by_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (transaction_id) REFERENCES ledger_transaction(id),
      FOREIGN KEY (student_id) REFERENCES student(id)
    );`,

  financial_period: `
    CREATE TABLE IF NOT EXISTS financial_period (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_name TEXT NOT NULL,
      period_type TEXT NOT NULL CHECK(period_type IN ('MONTHLY','QUARTERLY','YEARLY')),
      start_date DATE NOT NULL, end_date DATE NOT NULL,
      academic_year_id INTEGER, term_id INTEGER,
      is_locked BOOLEAN DEFAULT 0, locked_at DATETIME, locked_by_user_id INTEGER,
      unlock_reason TEXT,
      status TEXT DEFAULT 'OPEN',
      locked_by INTEGER, closed_by INTEGER, closed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
      FOREIGN KEY (term_id) REFERENCES term(id),
      FOREIGN KEY (locked_by_user_id) REFERENCES user(id)
    );`,

  scheduled_report: `
    CREATE TABLE IF NOT EXISTS scheduled_report (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_name TEXT NOT NULL, report_type TEXT NOT NULL, parameters TEXT,
      schedule_type TEXT NOT NULL CHECK(schedule_type IN ('DAILY','WEEKLY','MONTHLY','TERM_END','YEAR_END')),
      day_of_week INTEGER, day_of_month INTEGER,
      time_of_day TEXT NOT NULL, recipients TEXT NOT NULL,
      export_format TEXT DEFAULT 'PDF' CHECK(export_format IN ('PDF','EXCEL','CSV')),
      is_active BOOLEAN DEFAULT 1, last_run_at DATETIME, next_run_at DATETIME,
      created_by_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by_user_id) REFERENCES user(id)
    );`,

  report_execution_log: `
    CREATE TABLE IF NOT EXISTS report_execution_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scheduled_report_id INTEGER NOT NULL,
      execution_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL CHECK(status IN ('SUCCESS','FAILED')),
      recipients_notified INTEGER DEFAULT 0, error_message TEXT, file_path TEXT,
      FOREIGN KEY (scheduled_report_id) REFERENCES scheduled_report(id) ON DELETE CASCADE
    );`,
}

/* ------------------------------------------------------------------ */
/*  API                                                               */
/* ------------------------------------------------------------------ */

/** Topological dependency order so FK constraints are satisfied. */
export const TABLE_ORDER = [
  'user', 'audit_log', 'school_settings', 'system_config',
  'academic_year', 'term', 'stream', 'student',
  'enrollment', 'staff', 'subject', 'grading_scale',
  'subject_allocation', 'attendance',
  'gl_account', 'journal_entry', 'journal_entry_line',
  'fee_category', 'transaction_category', 'fee_structure',
  'fee_invoice', 'invoice_item', 'ledger_transaction', 'receipt',
  'inventory_category', 'supplier',
  'inventory_item', 'stock_movement', 'fee_exemption',
  'approval_rule', 'transaction_approval',
  'approval_workflow', 'approval_request', 'approval_history',
  'accounting_period', 'budget_allocation', 'budget',
  'asset_category', 'fixed_asset', 'financial_period',
  'payroll_period', 'payroll', 'payroll_deduction',
  'exam', 'exam_result', 'exam_timetable', 'exam_invigilator',
  'report_card', 'report_card_subject', 'report_card_summary',
  'merit_list', 'merit_list_entry',
  'scheduled_report', 'report_execution_log',
]

/** FK dependency edges: child → parents. */
const FK_DEPS: Record<string, string[]> = {
  audit_log: ['user'],
  term: ['academic_year'],
  enrollment: ['student', 'academic_year', 'stream', 'term'],
  subject_allocation: ['stream', 'staff', 'subject'],
  attendance: ['student', 'stream', 'academic_year', 'term', 'user'],
  journal_entry: ['supplier'],
  journal_entry_line: ['journal_entry'],
  fee_structure: ['academic_year', 'stream', 'fee_category'],
  fee_invoice: ['student', 'user'],
  invoice_item: ['fee_invoice'],
  ledger_transaction: ['transaction_category', 'student', 'fee_invoice', 'user'],
  receipt: ['ledger_transaction', 'student'],
  inventory_item: ['inventory_category'],
  stock_movement: ['inventory_item'],
  fee_exemption: ['student', 'academic_year', 'user'],
  transaction_approval: ['journal_entry', 'approval_rule', 'user'],
  approval_request: ['approval_workflow', 'user'],
  approval_history: ['approval_request'],
  budget_allocation: ['gl_account'],
  budget: ['academic_year', 'user'],
  fixed_asset: ['asset_category'],
  financial_period: ['academic_year', 'term', 'user'],
  payroll: ['payroll_period', 'staff'],
  payroll_deduction: ['payroll'],
  exam: ['academic_year'],
  exam_result: ['exam', 'student', 'subject'],
  exam_timetable: ['exam', 'subject', 'academic_year', 'term', 'stream'],
  exam_invigilator: ['exam_timetable', 'staff'],
  report_card: ['exam', 'student', 'stream', 'user'],
  report_card_subject: ['report_card', 'subject'],
  report_card_summary: ['exam', 'student'],
  merit_list: ['academic_year', 'term', 'stream', 'exam', 'subject'],
  merit_list_entry: ['merit_list', 'student'],
  scheduled_report: ['user'],
  report_execution_log: ['scheduled_report'],
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
