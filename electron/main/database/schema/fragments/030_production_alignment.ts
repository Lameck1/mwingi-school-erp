import { type Database } from 'better-sqlite3';

interface ColumnDefinition {
  readonly definition: string;
  readonly name: string;
}

const FIXED_ASSET_COLUMNS: readonly ColumnDefinition[] = [
  { definition: 'supplier_id INTEGER', name: 'supplier_id' },
  { definition: 'warranty_expiry DATE', name: 'warranty_expiry' },
  { definition: 'created_by_user_id INTEGER', name: 'created_by_user_id' },
  { definition: 'deleted_at DATETIME', name: 'deleted_at' }
];

const INVENTORY_COLUMNS: readonly ColumnDefinition[] = [
  { definition: 'unit_price INTEGER DEFAULT 0', name: 'unit_price' },
  { definition: 'supplier_id INTEGER', name: 'supplier_id' },
  { definition: 'description TEXT', name: 'description' },
  { definition: 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP', name: 'updated_at' }
];

const CBC_EXPENSE_COLUMNS: readonly ColumnDefinition[] = [
  { definition: 'expense_date DATE', name: 'expense_date' },
  { definition: 'amount_cents INTEGER DEFAULT 0', name: 'amount_cents' },
  { definition: 'term INTEGER', name: 'term' },
  { definition: 'receipt_number TEXT', name: 'receipt_number' },
  { definition: 'created_by INTEGER', name: 'created_by' }
];

const STUDENT_ACTIVITY_COLUMNS: readonly ColumnDefinition[] = [
  { definition: 'activity_name TEXT', name: 'activity_name' },
  { definition: 'start_date DATE', name: 'start_date' },
  { definition: 'end_date DATE', name: 'end_date' },
  { definition: 'is_active BOOLEAN DEFAULT 1', name: 'is_active' }
];

const PRODUCTION_ALIGNMENT_TABLES: readonly string[] = [
  `
    CREATE TABLE IF NOT EXISTS asset_depreciation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL,
      depreciation_date DATE NOT NULL,
      amount INTEGER NOT NULL,
      book_value_before INTEGER NOT NULL,
      book_value_after INTEGER NOT NULL,
      financial_period_id INTEGER,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (asset_id) REFERENCES fixed_asset(id) ON DELETE CASCADE
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS jss_fee_structure (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grade INTEGER NOT NULL CHECK (grade IN (7, 8, 9)),
      fiscal_year INTEGER NOT NULL,
      tuition_fee_cents INTEGER NOT NULL DEFAULT 0,
      boarding_fee_cents INTEGER DEFAULT 0,
      activity_fee_cents INTEGER DEFAULT 0,
      exam_fee_cents INTEGER DEFAULT 0,
      library_fee_cents INTEGER DEFAULT 0,
      lab_fee_cents INTEGER DEFAULT 0,
      ict_fee_cents INTEGER DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(grade, fiscal_year)
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS grade_transition (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      from_grade INTEGER NOT NULL CHECK (from_grade BETWEEN 1 AND 12),
      to_grade INTEGER NOT NULL CHECK (to_grade BETWEEN 1 AND 12),
      transition_date DATE NOT NULL,
      new_fee_structure_id INTEGER,
      outstanding_balance_cents INTEGER NOT NULL DEFAULT 0,
      boarding_status_change TEXT,
      transition_notes TEXT,
      processed_by INTEGER NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES student(id) ON DELETE CASCADE,
      FOREIGN KEY (new_fee_structure_id) REFERENCES jss_fee_structure(id),
      FOREIGN KEY (processed_by) REFERENCES user(id)
    );
  `,
  `
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
    );

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
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS boarding_facility (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 0,
      current_occupancy INTEGER NOT NULL DEFAULT 0,
      matron_id INTEGER,
      is_active BOOLEAN NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (matron_id) REFERENCES staff(id)
    );

    CREATE TABLE IF NOT EXISTS boarding_expense (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      facility_id INTEGER NOT NULL,
      gl_account_code TEXT NOT NULL,
      fiscal_year INTEGER NOT NULL,
      term INTEGER NOT NULL CHECK (term IN (1, 2, 3)),
      amount_cents INTEGER NOT NULL,
      expense_type TEXT NOT NULL CHECK (expense_type IN ('FOOD', 'UTILITIES', 'BEDDING', 'STAFF', 'MAINTENANCE', 'OTHER')),
      description TEXT,
      recorded_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      recorded_by INTEGER NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (facility_id) REFERENCES boarding_facility(id) ON DELETE CASCADE,
      FOREIGN KEY (recorded_by) REFERENCES user(id)
    );

    CREATE TABLE IF NOT EXISTS transport_route (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_name TEXT NOT NULL,
      distance_km REAL NOT NULL DEFAULT 0,
      estimated_students INTEGER NOT NULL DEFAULT 0,
      budget_per_term_cents INTEGER NOT NULL DEFAULT 0,
      driver_id INTEGER,
      vehicle_registration TEXT,
      is_active BOOLEAN NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (driver_id) REFERENCES staff(id)
    );

    CREATE TABLE IF NOT EXISTS transport_route_expense (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_id INTEGER NOT NULL,
      gl_account_code TEXT NOT NULL,
      fiscal_year INTEGER NOT NULL,
      term INTEGER NOT NULL CHECK (term IN (1, 2, 3)),
      amount_cents INTEGER NOT NULL,
      expense_type TEXT NOT NULL CHECK (expense_type IN ('FUEL', 'MAINTENANCE', 'INSURANCE', 'PERMITS', 'DRIVER_SALARY', 'OTHER')),
      description TEXT,
      recorded_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      recorded_by INTEGER NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (route_id) REFERENCES transport_route(id) ON DELETE CASCADE,
      FOREIGN KEY (recorded_by) REFERENCES user(id)
    );

    CREATE TABLE IF NOT EXISTS student_route_assignment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      route_id INTEGER NOT NULL,
      academic_year INTEGER NOT NULL,
      term INTEGER NOT NULL CHECK (term IN (1, 2, 3)),
      pickup_location TEXT,
      is_active BOOLEAN NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES student(id) ON DELETE CASCADE,
      FOREIGN KEY (route_id) REFERENCES transport_route(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS government_grant (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grant_name TEXT NOT NULL,
      grant_type TEXT NOT NULL CHECK (grant_type IN ('CAPITATION', 'FREE_DAY_SECONDARY', 'SPECIAL_NEEDS', 'INFRASTRUCTURE', 'FEEDING_PROGRAM', 'OTHER')),
      fiscal_year INTEGER NOT NULL,
      amount_allocated INTEGER NOT NULL DEFAULT 0,
      amount_received INTEGER NOT NULL DEFAULT 0,
      date_received DATE,
      nemis_reference_number TEXT,
      conditions TEXT,
      is_utilized BOOLEAN NOT NULL DEFAULT 0,
      utilization_percentage REAL NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS grant_utilization (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grant_id INTEGER NOT NULL,
      gl_account_code TEXT,
      amount_used INTEGER NOT NULL,
      utilization_date DATE NOT NULL,
      description TEXT NOT NULL,
      journal_entry_id INTEGER,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (grant_id) REFERENCES government_grant(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS student_cost_snapshot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      academic_year INTEGER NOT NULL,
      term INTEGER NOT NULL CHECK (term IN (1, 2, 3)),
      total_students INTEGER NOT NULL,
      total_expenses INTEGER NOT NULL,
      cost_per_student INTEGER NOT NULL,
      teaching_cost_per_student INTEGER NOT NULL DEFAULT 0,
      facilities_cost_per_student INTEGER NOT NULL DEFAULT 0,
      activities_cost_per_student INTEGER NOT NULL DEFAULT 0,
      administration_cost_per_student INTEGER NOT NULL DEFAULT 0,
      snapshot_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(academic_year, term)
    );
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_boarding_expense_facility ON boarding_expense(facility_id);
    CREATE INDEX IF NOT EXISTS idx_boarding_expense_year_term ON boarding_expense(fiscal_year, term);
    CREATE INDEX IF NOT EXISTS idx_transport_expense_route ON transport_route_expense(route_id);
    CREATE INDEX IF NOT EXISTS idx_transport_expense_year_term ON transport_route_expense(fiscal_year, term);
    CREATE INDEX IF NOT EXISTS idx_student_route_assignment_year_term ON student_route_assignment(academic_year, term);
    CREATE INDEX IF NOT EXISTS idx_grant_year ON government_grant(fiscal_year);
    CREATE INDEX IF NOT EXISTS idx_grant_utilization_grant ON grant_utilization(grant_id);
    CREATE INDEX IF NOT EXISTS idx_student_cost_snapshot_year_term ON student_cost_snapshot(academic_year, term);
  `
];

function tableExists(db: Database, tableName: string): boolean {
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(tableName) as { name?: string } | undefined;
  return Boolean(row?.name);
}

function columnExists(db: Database, tableName: string, columnName: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
  return columns.some(col => col.name === columnName);
}

function addColumnIfMissing(db: Database, tableName: string, columnDef: string, columnName: string): void {
  if (!tableExists(db, tableName)) {return;}
  if (!columnExists(db, tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDef}`);
  }
}

function addColumnsIfMissing(db: Database, tableName: string, columns: readonly ColumnDefinition[]): void {
  for (const column of columns) {
    addColumnIfMissing(db, tableName, column.definition, column.name);
  }
}

function createProductionAlignmentTables(db: Database): void {
  for (const statement of PRODUCTION_ALIGNMENT_TABLES) {
    db.exec(statement);
  }
}

export function up(db: Database): void {
  console.warn('Running Migration 004: Production Alignment');

  addColumnsIfMissing(db, 'fixed_asset', FIXED_ASSET_COLUMNS);
  addColumnsIfMissing(db, 'inventory_item', INVENTORY_COLUMNS);
  addColumnIfMissing(db, 'fee_category_strand', 'created_by INTEGER', 'created_by');
  addColumnsIfMissing(db, 'cbc_strand_expense', CBC_EXPENSE_COLUMNS);
  addColumnsIfMissing(db, 'student_activity_participation', STUDENT_ACTIVITY_COLUMNS);
  createProductionAlignmentTables(db);

  console.warn('Migration 004: Production alignment applied successfully');
}
