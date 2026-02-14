import { type Database } from 'better-sqlite3'

interface ColumnDefinition {
  readonly definition: string
  readonly name: string
}

const ARCHIVE_RESTORATION_TABLE_STATEMENTS: readonly string[] = [
  `
    CREATE TABLE IF NOT EXISTS credit_transaction (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      transaction_type TEXT NOT NULL CHECK(transaction_type IN ('CREDIT_RECEIVED', 'CREDIT_APPLIED', 'CREDIT_REFUNDED')),
      reference_invoice_id INTEGER,
      notes TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES student(id),
      FOREIGN KEY (reference_invoice_id) REFERENCES fee_invoice(id)
    );
    CREATE INDEX IF NOT EXISTS idx_credit_transaction_student ON credit_transaction(student_id);
    CREATE INDEX IF NOT EXISTS idx_credit_transaction_type ON credit_transaction(transaction_type);
    CREATE INDEX IF NOT EXISTS idx_credit_transaction_date ON credit_transaction(created_at);
  `,
  `
    CREATE TABLE IF NOT EXISTS pro_ration_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      full_amount INTEGER NOT NULL,
      pro_rated_amount INTEGER NOT NULL,
      discount_percentage REAL NOT NULL,
      enrollment_date TEXT NOT NULL,
      term_start TEXT NOT NULL,
      term_end TEXT NOT NULL,
      days_in_term INTEGER NOT NULL,
      days_enrolled INTEGER NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (invoice_id) REFERENCES fee_invoice(id),
      FOREIGN KEY (student_id) REFERENCES student(id)
    );
    CREATE INDEX IF NOT EXISTS idx_proration_invoice ON pro_ration_log(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_proration_student ON pro_ration_log(student_id);
  `,
  `
    CREATE TABLE IF NOT EXISTS scholarship (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      scholarship_type TEXT NOT NULL CHECK(scholarship_type IN ('MERIT', 'NEED_BASED', 'SPORTS', 'PARTIAL', 'FULL')),
      amount INTEGER NOT NULL,
      percentage REAL,
      total_amount INTEGER NOT NULL,
      allocated_amount INTEGER NOT NULL DEFAULT 0,
      available_amount INTEGER NOT NULL DEFAULT 0,
      current_beneficiaries INTEGER NOT NULL DEFAULT 0,
      max_beneficiaries INTEGER NOT NULL,
      total_allocated INTEGER NOT NULL DEFAULT 0,
      eligibility_criteria TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'SUSPENDED', 'EXPIRED')),
      valid_from TEXT NOT NULL,
      valid_to TEXT NOT NULL,
      sponsor_name TEXT,
      sponsor_contact TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_scholarship_status ON scholarship(status);
    CREATE INDEX IF NOT EXISTS idx_scholarship_type ON scholarship(scholarship_type);
    CREATE INDEX IF NOT EXISTS idx_scholarship_validity ON scholarship(valid_from, valid_to);
  `,
  `
    CREATE TABLE IF NOT EXISTS student_scholarship (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scholarship_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      amount_allocated INTEGER NOT NULL,
      amount_utilized INTEGER NOT NULL DEFAULT 0,
      allocation_notes TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'FULLY_UTILIZED', 'EXPIRED', 'REVOKED')),
      effective_date TEXT NOT NULL,
      expiry_date TEXT NOT NULL,
      allocated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (scholarship_id) REFERENCES scholarship(id),
      FOREIGN KEY (student_id) REFERENCES student(id)
    );
    CREATE INDEX IF NOT EXISTS idx_student_scholarship_student ON student_scholarship(student_id);
    CREATE INDEX IF NOT EXISTS idx_student_scholarship_status ON student_scholarship(status);
  `,
  `
    CREATE TABLE IF NOT EXISTS nemis_export (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      export_type TEXT NOT NULL,
      format TEXT NOT NULL,
      record_count INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      exported_by INTEGER,
      status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK(status IN ('COMPLETED', 'FAILED')),
      error_message TEXT,
      exported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS academic_term (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      term_name TEXT NOT NULL,
      term_number INTEGER NOT NULL CHECK(term_number IN (1, 2, 3)),
      academic_year TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'UPCOMING' CHECK(status IN ('UPCOMING', 'ACTIVE', 'COMPLETED', 'OPEN', 'CLOSED')),
      is_current BOOLEAN DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(term_number, academic_year)
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS hire_client (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name TEXT NOT NULL,
      contact_phone TEXT,
      contact_email TEXT,
      organization TEXT,
      address TEXT,
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS hire_asset (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_name TEXT NOT NULL,
      asset_type TEXT NOT NULL CHECK (asset_type IN ('VEHICLE', 'FACILITY', 'EQUIPMENT', 'OTHER')),
      registration_number TEXT,
      description TEXT,
      default_rate INTEGER,
      rate_type TEXT CHECK (rate_type IN ('PER_DAY', 'PER_KM', 'PER_HOUR', 'FIXED')),
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS hire_booking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_number TEXT UNIQUE NOT NULL,
      asset_id INTEGER NOT NULL REFERENCES hire_asset(id),
      client_id INTEGER NOT NULL REFERENCES hire_client(id),
      hire_date DATE NOT NULL,
      return_date DATE,
      hire_start_time TEXT,
      hire_end_time TEXT,
      purpose TEXT,
      destination TEXT,
      distance_km REAL,
      hours REAL,
      total_amount INTEGER NOT NULL,
      amount_paid INTEGER DEFAULT 0,
      status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
      notes TEXT,
      recorded_by_user_id INTEGER REFERENCES user(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS hire_payment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL REFERENCES hire_booking(id),
      receipt_number TEXT UNIQUE NOT NULL,
      amount INTEGER NOT NULL,
      payment_method TEXT NOT NULL,
      payment_reference TEXT,
      payment_date DATE NOT NULL,
      notes TEXT,
      is_voided INTEGER DEFAULT 0,
      void_reason TEXT,
      recorded_by_user_id INTEGER REFERENCES user(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS fee_exemption (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES student(id),
      academic_year_id INTEGER NOT NULL REFERENCES academic_year(id),
      term_id INTEGER REFERENCES term(id),
      fee_category_id INTEGER REFERENCES fee_category(id),
      exemption_type TEXT NOT NULL CHECK (exemption_type IN ('FULL', 'PARTIAL')),
      exemption_percentage REAL NOT NULL CHECK (exemption_percentage > 0 AND exemption_percentage <= 100),
      exemption_reason TEXT NOT NULL,
      supporting_document TEXT,
      notes TEXT,
      approved_by_user_id INTEGER REFERENCES user(id),
      approved_at DATETIME,
      status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
      revoked_by_user_id INTEGER REFERENCES user(id),
      revoked_at DATETIME,
      revoke_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_hire_booking_date ON hire_booking(hire_date);
    CREATE INDEX IF NOT EXISTS idx_hire_booking_status ON hire_booking(status);
    CREATE INDEX IF NOT EXISTS idx_hire_booking_client ON hire_booking(client_id);
    CREATE INDEX IF NOT EXISTS idx_hire_booking_asset ON hire_booking(asset_id);
    CREATE INDEX IF NOT EXISTS idx_fee_exemption_student ON fee_exemption(student_id);
    CREATE INDEX IF NOT EXISTS idx_fee_exemption_year_term ON fee_exemption(academic_year_id, term_id);
    CREATE INDEX IF NOT EXISTS idx_fee_exemption_status ON fee_exemption(status);
  `,
  `
    CREATE TABLE IF NOT EXISTS void_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      transaction_type TEXT NOT NULL,
      original_amount INTEGER NOT NULL,
      student_id INTEGER,
      description TEXT,
      void_reason TEXT NOT NULL,
      voided_by INTEGER NOT NULL,
      voided_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      approval_request_id INTEGER,
      recovered_amount INTEGER,
      recovered_method TEXT,
      recovered_at TEXT,
      recovered_by INTEGER,
      notes TEXT,
      FOREIGN KEY (voided_by) REFERENCES user(id),
      FOREIGN KEY (recovered_by) REFERENCES user(id),
      FOREIGN KEY (student_id) REFERENCES student(id),
      FOREIGN KEY (approval_request_id) REFERENCES approval_request(id)
    );
  `,
  `
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
    );

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
    );

    CREATE TABLE IF NOT EXISTS report_card_strand (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_card_id INTEGER NOT NULL,
      strand_id INTEGER NOT NULL,
      strand_name TEXT,
      competency_level TEXT,
      teacher_comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_card_id) REFERENCES report_card(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS exam_subject_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL,
      subject_id INTEGER NOT NULL,
      stream_id INTEGER,
      teacher_id INTEGER,
      total_students INTEGER,
      pass_count INTEGER,
      fail_count INTEGER,
      mean_score REAL,
      median_score REAL,
      mode_score REAL,
      std_deviation REAL,
      min_score REAL,
      max_score REAL,
      pass_rate REAL,
      fail_rate REAL,
      difficulty_index REAL,
      discrimination_index REAL,
      analysis_date TEXT,
      FOREIGN KEY (exam_id) REFERENCES exam(id),
      FOREIGN KEY (subject_id) REFERENCES subject(id),
      FOREIGN KEY (stream_id) REFERENCES stream(id)
    );

    CREATE TABLE IF NOT EXISTS student_exam_performance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      academic_year_id INTEGER NOT NULL,
      exam_id INTEGER NOT NULL,
      stream_position INTEGER,
      class_position INTEGER,
      total_marks REAL,
      average_marks REAL,
      grade TEXT,
      pass_count INTEGER,
      fail_count INTEGER,
      best_subject_id INTEGER,
      worst_subject_id INTEGER,
      improvement_index REAL,
      analysis_date TEXT,
      FOREIGN KEY (student_id) REFERENCES student(id),
      FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
      FOREIGN KEY (exam_id) REFERENCES exam(id)
    );
  `
]

const INVOICE_ITEM_COMPATIBILITY_COLUMNS: readonly ColumnDefinition[] = [
  { definition: 'exemption_id INTEGER', name: 'exemption_id' },
  { definition: 'original_amount INTEGER', name: 'original_amount' },
  { definition: 'exemption_amount INTEGER DEFAULT 0', name: 'exemption_amount' }
]

const FEE_INVOICE_COMPATIBILITY_COLUMNS: readonly ColumnDefinition[] = [
  { definition: 'academic_term_id INTEGER', name: 'academic_term_id' },
  { definition: 'amount INTEGER', name: 'amount' },
  { definition: 'amount_due INTEGER', name: 'amount_due' },
  { definition: 'original_amount INTEGER', name: 'original_amount' },
  { definition: 'is_prorated INTEGER DEFAULT 0', name: 'is_prorated' },
  { definition: 'proration_percentage REAL', name: 'proration_percentage' },
  { definition: 'invoice_type TEXT', name: 'invoice_type' },
  { definition: 'class_id INTEGER', name: 'class_id' },
  { definition: 'fee_type TEXT', name: 'fee_type' },
  { definition: 'description TEXT', name: 'description' },
  { definition: 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP', name: 'updated_at' }
]

function tableExists(db: Database, tableName: string): boolean {
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(tableName) as { name?: string } | undefined
  return Boolean(row?.name)
}

function columnExists(db: Database, tableName: string, columnName: string): boolean {
  if (!tableExists(db, tableName)) { return false }
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[]
  return columns.some(col => col.name === columnName)
}

function addColumnIfMissing(db: Database, tableName: string, columnDef: string, columnName: string): void {
  if (!tableExists(db, tableName)) { return }
  if (!columnExists(db, tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDef}`)
  }
}

function addColumnsIfMissing(db: Database, tableName: string, columns: readonly ColumnDefinition[]): void {
  for (const column of columns) {
    addColumnIfMissing(db, tableName, column.definition, column.name)
  }
}

function executeStatements(db: Database, statements: readonly string[]): void {
  for (const statement of statements) {
    db.exec(statement)
  }
}

function syncAcademicTermRecords(db: Database): void {
  if (!tableExists(db, 'term') || !tableExists(db, 'academic_year')) { return }
  const termHasCreatedAt = columnExists(db, 'term', 'created_at')
  const termCreatedAtExpression = termHasCreatedAt ? 't.created_at' : 'CURRENT_TIMESTAMP'
  const termNewCreatedAtExpression = termHasCreatedAt ? 'NEW.created_at' : 'CURRENT_TIMESTAMP'

  db.exec(`
      INSERT OR IGNORE INTO academic_term (id, term_name, term_number, academic_year, start_date, end_date, status, is_current, created_at, updated_at)
      SELECT t.id, t.term_name, t.term_number, ay.year_name, t.start_date, t.end_date, t.status, t.is_current, ${termCreatedAtExpression}, ${termCreatedAtExpression}
      FROM term t
      JOIN academic_year ay ON ay.id = t.academic_year_id
    `)

  db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_term_insert_academic_term
      AFTER INSERT ON term
      BEGIN
        INSERT OR IGNORE INTO academic_term (id, term_name, term_number, academic_year, start_date, end_date, status, is_current, created_at, updated_at)
        VALUES (
          NEW.id,
          NEW.term_name,
          NEW.term_number,
          (SELECT year_name FROM academic_year WHERE id = NEW.academic_year_id),
          NEW.start_date,
          NEW.end_date,
          NEW.status,
          NEW.is_current,
          ${termNewCreatedAtExpression},
          ${termNewCreatedAtExpression}
        );
      END;

      CREATE TRIGGER IF NOT EXISTS trg_term_update_academic_term
      AFTER UPDATE ON term
      BEGIN
        UPDATE academic_term
        SET term_name = NEW.term_name,
            term_number = NEW.term_number,
            academic_year = (SELECT year_name FROM academic_year WHERE id = NEW.academic_year_id),
            start_date = NEW.start_date,
            end_date = NEW.end_date,
            status = NEW.status,
            is_current = NEW.is_current,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.id;
      END;
    `)
}

function applyAcademicTermCompatibilityBackfill(db: Database): void {
  addColumnIfMissing(db, 'academic_term', 'start_date TEXT', 'start_date')
  addColumnIfMissing(db, 'academic_term', 'end_date TEXT', 'end_date')

  if (tableExists(db, 'academic_term') && columnExists(db, 'academic_term', 'term_start')) {
    db.exec(`UPDATE academic_term SET start_date = term_start WHERE start_date IS NULL`)
  }
  if (tableExists(db, 'academic_term') && columnExists(db, 'academic_term', 'term_end')) {
    db.exec(`UPDATE academic_term SET end_date = term_end WHERE end_date IS NULL`)
  }
}

function applyInvoiceCompatibilityBackfill(db: Database): void {
  addColumnIfMissing(db, 'enrollment', 'academic_term_id INTEGER', 'academic_term_id')
  addColumnsIfMissing(db, 'fee_invoice', FEE_INVOICE_COMPATIBILITY_COLUMNS)

  if (tableExists(db, 'enrollment') && columnExists(db, 'enrollment', 'term_id')) {
    db.exec(`UPDATE enrollment SET academic_term_id = term_id WHERE academic_term_id IS NULL`)
  }

  if (tableExists(db, 'fee_invoice') && columnExists(db, 'fee_invoice', 'total_amount')) {
    db.exec(`UPDATE fee_invoice SET amount = total_amount WHERE amount IS NULL`)
    db.exec(`UPDATE fee_invoice SET amount_due = total_amount WHERE amount_due IS NULL`)
  }

  if (tableExists(db, 'fee_invoice') && columnExists(db, 'fee_invoice', 'term_id')) {
    db.exec(`UPDATE fee_invoice SET academic_term_id = term_id WHERE academic_term_id IS NULL`)
  }
}

export function up(db: Database): void {
  console.warn('Running Migration 006: Archive Restorations')
  executeStatements(db, ARCHIVE_RESTORATION_TABLE_STATEMENTS)
  syncAcademicTermRecords(db)
  addColumnsIfMissing(db, 'invoice_item', INVOICE_ITEM_COMPATIBILITY_COLUMNS)
  applyAcademicTermCompatibilityBackfill(db)
  applyInvoiceCompatibilityBackfill(db)
  migrateCBCGradingScale(db)
}

function migrateCBCGradingScale(db: Database): void {
  if (!tableExists(db, 'grading_scale')) return

  // Remove old 4-level CBC/ECDE grades
  db.exec(`DELETE FROM grading_scale WHERE curriculum IN ('CBC', 'ECDE') AND grade IN (
    'Exceeding Expectations', 'Meeting Expectations', 'Approaching Expectations', 'Below Expectations'
  )`)

  // Insert new 8-level grades (INSERT OR IGNORE to avoid duplicate issues)
  db.exec(`
    INSERT OR IGNORE INTO grading_scale (curriculum, grade, min_score, max_score, points, remarks) VALUES
    ('CBC', 'EE1', 90, 100, 4.0, 'Exceeding Expectation'),
    ('CBC', 'EE2', 75, 89, 3.5, 'Exceeding Expectation'),
    ('CBC', 'ME1', 58, 74, 3.0, 'Meeting Expectation'),
    ('CBC', 'ME2', 41, 57, 2.5, 'Meeting Expectation'),
    ('CBC', 'AE1', 31, 40, 2.0, 'Approaching Expectation'),
    ('CBC', 'AE2', 21, 30, 1.5, 'Approaching Expectation'),
    ('CBC', 'BE1', 11, 20, 1.0, 'Below Expectation'),
    ('CBC', 'BE2', 1, 10, 0.5, 'Below Expectation'),
    ('ECDE', 'EE1', 90, 100, 4.0, 'Exceeding Expectation'),
    ('ECDE', 'EE2', 75, 89, 3.5, 'Exceeding Expectation'),
    ('ECDE', 'ME1', 58, 74, 3.0, 'Meeting Expectation'),
    ('ECDE', 'ME2', 41, 57, 2.5, 'Meeting Expectation'),
    ('ECDE', 'AE1', 31, 40, 2.0, 'Approaching Expectation'),
    ('ECDE', 'AE2', 21, 30, 1.5, 'Approaching Expectation'),
    ('ECDE', 'BE1', 11, 20, 1.0, 'Below Expectation'),
    ('ECDE', 'BE2', 1, 10, 0.5, 'Below Expectation');
  `)
}
