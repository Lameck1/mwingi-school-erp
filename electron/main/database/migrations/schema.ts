export function getSchema(): string {
  return `
    CREATE TABLE IF NOT EXISTS school_settings (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      school_name TEXT NOT NULL DEFAULT 'Mwingi Adventist School',
      school_motto TEXT, address TEXT, phone TEXT, email TEXT, logo_path TEXT,
      mpesa_paybill TEXT, sms_api_key TEXT, sms_api_secret TEXT, sms_sender_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS academic_year (
      id INTEGER PRIMARY KEY AUTOINCREMENT, year_name TEXT NOT NULL UNIQUE,
      start_date DATE NOT NULL, end_date DATE NOT NULL, is_current BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS term (
      id INTEGER PRIMARY KEY AUTOINCREMENT, academic_year_id INTEGER NOT NULL,
      term_number INTEGER NOT NULL, term_name TEXT NOT NULL,
      start_date DATE NOT NULL, end_date DATE NOT NULL, is_current BOOLEAN DEFAULT 0,
      FOREIGN KEY (academic_year_id) REFERENCES academic_year(id), UNIQUE(academic_year_id, term_number)
    );
    CREATE TABLE IF NOT EXISTS stream (
      id INTEGER PRIMARY KEY AUTOINCREMENT, stream_code TEXT NOT NULL UNIQUE,
      stream_name TEXT NOT NULL, level_order INTEGER NOT NULL,
      is_junior_secondary BOOLEAN DEFAULT 0, is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS fee_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT, category_name TEXT NOT NULL UNIQUE,
      description TEXT, is_active BOOLEAN DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS fee_structure (
      id INTEGER PRIMARY KEY AUTOINCREMENT, academic_year_id INTEGER NOT NULL,
      stream_id INTEGER NOT NULL, student_type TEXT NOT NULL CHECK(student_type IN ('DAY_SCHOLAR', 'BOARDER')),
      term_id INTEGER, fee_category_id INTEGER NOT NULL, amount INTEGER NOT NULL,
      description TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
      FOREIGN KEY (stream_id) REFERENCES stream(id),
      FOREIGN KEY (fee_category_id) REFERENCES fee_category(id)
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
    CREATE TABLE IF NOT EXISTS user (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, full_name TEXT NOT NULL, email TEXT,
      role TEXT NOT NULL CHECK(role IN ('ADMIN', 'ACCOUNTS_CLERK', 'AUDITOR')),
      is_active BOOLEAN DEFAULT 1, last_login DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
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
      student_id INTEGER, staff_id INTEGER,
      payment_method TEXT CHECK(payment_method IN ('CASH', 'MPESA', 'BANK_TRANSFER', 'CHEQUE')),
      payment_reference TEXT, description TEXT, term_id INTEGER,
      recorded_by_user_id INTEGER NOT NULL, is_voided BOOLEAN DEFAULT 0,
      voided_reason TEXT, voided_by_user_id INTEGER, voided_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES transaction_category(id),
      FOREIGN KEY (student_id) REFERENCES student(id),
      FOREIGN KEY (recorded_by_user_id) REFERENCES user(id)
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
    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT, staff_number TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL, middle_name TEXT, last_name TEXT NOT NULL,
      id_number TEXT, kra_pin TEXT, nhif_number TEXT, nssf_number TEXT,
      phone TEXT, email TEXT, bank_name TEXT, bank_account TEXT,
      department TEXT, job_title TEXT, employment_date DATE,
      basic_salary INTEGER DEFAULT 0, is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
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
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
      action_type TEXT NOT NULL, table_name TEXT NOT NULL, record_id INTEGER,
      old_values TEXT, new_values TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES user(id)
    );
    CREATE TABLE IF NOT EXISTS message_template (
      id INTEGER PRIMARY KEY AUTOINCREMENT, template_name TEXT NOT NULL UNIQUE,
      template_type TEXT NOT NULL CHECK(template_type IN ('SMS', 'EMAIL')),
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
    CREATE TABLE IF NOT EXISTS backup_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, backup_path TEXT NOT NULL,
      backup_size INTEGER, backup_type TEXT NOT NULL, status TEXT DEFAULT 'SUCCESS',
      error_message TEXT, created_by_user_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS statutory_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT, rate_type TEXT NOT NULL,
      min_amount DECIMAL(12, 2), max_amount DECIMAL(12, 2),
      rate DECIMAL(6, 4), fixed_amount DECIMAL(12, 2),
      effective_from DATE NOT NULL, effective_to DATE, is_current BOOLEAN DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_student_admission ON student(admission_number);
    CREATE INDEX IF NOT EXISTS idx_ledger_date ON ledger_transaction(transaction_date);
    CREATE INDEX IF NOT EXISTS idx_ledger_student ON ledger_transaction(student_id);
  `;
}

