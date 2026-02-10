export const CORE_SCHEMA_PART2 = [
  `

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
  `,
  `

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
  `,
  `

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
  `,
  `

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
  `,
] as const
