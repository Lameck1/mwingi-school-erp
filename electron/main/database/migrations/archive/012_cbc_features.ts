import { Database } from 'better-sqlite3';

/**
 * Migration 012: CBC/CBE Domain Model Features
 * 
 * Adds Kenyan CBC (Competency-Based Curriculum) specific features:
 * - CBC activity strand categorization (Performing Arts, Sports, Home Science, Agriculture, ICT)
 * - Junior Secondary School (JSS) transition workflows (Grade 6→7)
 * - Boarding cost attribution and profitability tracking
 * - Transport cost attribution per route
 * - Government grant tracking (NEMIS integration)
 * - Per-student cost tracking
 */
export function up(db: Database): void {
  // ============================================================================
  // 1. CBC STRAND SYSTEM
  // ============================================================================
  
  // CBC strands for activity categorization
  db.exec(`
    CREATE TABLE IF NOT EXISTS cbc_strand (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      budget_gl_account_code TEXT,
      is_active BOOLEAN NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (budget_gl_account_code) REFERENCES gl_account(code)
    );
  `);

  // Link fee categories to CBC strands (many-to-many)
  db.exec(`
    CREATE TABLE IF NOT EXISTS fee_category_strand (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fee_category_id INTEGER NOT NULL,
      cbc_strand_id INTEGER NOT NULL,
      allocation_percentage REAL NOT NULL DEFAULT 100.0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (fee_category_id) REFERENCES fee_category(id) ON DELETE CASCADE,
      FOREIGN KEY (cbc_strand_id) REFERENCES cbc_strand(id) ON DELETE CASCADE,
      UNIQUE(fee_category_id, cbc_strand_id)
    );
  `);

  // Equipment/Resource costs per strand
  db.exec(`
    CREATE TABLE IF NOT EXISTS cbc_strand_expense (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cbc_strand_id INTEGER NOT NULL,
      gl_account_code TEXT NOT NULL,
      fiscal_year INTEGER NOT NULL,
      allocated_budget INTEGER NOT NULL DEFAULT 0,
      spent_amount INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cbc_strand_id) REFERENCES cbc_strand(id) ON DELETE CASCADE,
      FOREIGN KEY (gl_account_code) REFERENCES gl_account(code)
    );
  `);

  // Per-student activity participation
  db.exec(`
    CREATE TABLE IF NOT EXISTS student_activity_participation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      cbc_strand_id INTEGER NOT NULL,
      academic_year INTEGER NOT NULL,
      term INTEGER NOT NULL CHECK (term IN (1, 2, 3)),
      participation_level TEXT NOT NULL CHECK (participation_level IN ('PRIMARY', 'SECONDARY', 'INTEREST')),
      notes TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES student(id) ON DELETE CASCADE,
      FOREIGN KEY (cbc_strand_id) REFERENCES cbc_strand(id) ON DELETE CASCADE,
      UNIQUE(student_id, cbc_strand_id, academic_year, term)
    );
  `);

  // Seed default CBC strands
  db.exec(`
    INSERT INTO cbc_strand (code, name, description, budget_gl_account_code) VALUES
    ('PERF_ARTS', 'Performing Arts', 'Music, Drama, Dance', '5400'),
    ('SPORTS', 'Sports & Physical Education', 'Games, Athletics, PE', '5410'),
    ('HOME_SCI', 'Home Science', 'Food & Nutrition, Textiles', '5420'),
    ('AGRICULTURE', 'Agriculture', 'Farming, Livestock, Horticulture', '5430'),
    ('ICT', 'Information & Communication Technology', 'Computer Studies, Digital Literacy', '5440'),
    ('SCIENCE', 'Science & Technology', 'Laboratory, STEM Activities', '5450'),
    ('ENTREPRENEURSHIP', 'Business & Entrepreneurship', 'Business Skills, Financial Literacy', '5460')
    ON CONFLICT(code) DO NOTHING;
  `);

  // ============================================================================
  // 2. JSS TRANSITION WORKFLOWS
  // ============================================================================

  // Grade transition records
  db.exec(`
    CREATE TABLE IF NOT EXISTS grade_transition (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      from_grade INTEGER NOT NULL CHECK (from_grade BETWEEN 1 AND 9),
      to_grade INTEGER NOT NULL CHECK (to_grade BETWEEN 1 AND 9),
      transition_date DATE NOT NULL,
      is_jss_entry BOOLEAN NOT NULL DEFAULT 0,
      fee_structure_changed BOOLEAN NOT NULL DEFAULT 0,
      boarding_status_before TEXT,
      boarding_status_after TEXT,
      balance_migrated_amount INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_by_user_id INTEGER NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES student(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by_user_id) REFERENCES user(id)
    );
  `);

  // JSS-specific fee structures
  db.exec(`
    CREATE TABLE IF NOT EXISTS jss_fee_structure (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grade INTEGER NOT NULL CHECK (grade IN (7, 8, 9)),
      academic_year INTEGER NOT NULL,
      term INTEGER NOT NULL CHECK (term IN (1, 2, 3)),
      tuition_fee INTEGER NOT NULL DEFAULT 0,
      boarding_fee INTEGER NOT NULL DEFAULT 0,
      activity_fee INTEGER NOT NULL DEFAULT 0,
      ict_fee INTEGER NOT NULL DEFAULT 0,
      exam_fee INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(grade, academic_year, term)
    );
  `);

  // Seed default JSS fee structures for 2026
  db.exec(`
    INSERT INTO jss_fee_structure (grade, academic_year, term, tuition_fee, boarding_fee, activity_fee, ict_fee, exam_fee) VALUES
    -- Grade 7 (Kes 18,000 tuition, 25,000 boarding per term)
    (7, 2026, 1, 1800000, 2500000, 300000, 200000, 150000),
    (7, 2026, 2, 1800000, 2500000, 300000, 200000, 150000),
    (7, 2026, 3, 1800000, 2500000, 300000, 200000, 150000),
    -- Grade 8 (Kes 19,000 tuition, 25,000 boarding per term)
    (8, 2026, 1, 1900000, 2500000, 350000, 200000, 200000),
    (8, 2026, 2, 1900000, 2500000, 350000, 200000, 200000),
    (8, 2026, 3, 1900000, 2500000, 350000, 200000, 200000),
    -- Grade 9 (Kes 20,000 tuition, 25,000 boarding per term)
    (9, 2026, 1, 2000000, 2500000, 400000, 200000, 250000),
    (9, 2026, 2, 2000000, 2500000, 400000, 200000, 250000),
    (9, 2026, 3, 2000000, 2500000, 400000, 200000, 250000)
    ON CONFLICT DO NOTHING;
  `);

  // ============================================================================
  // 3. BOARDING COST ATTRIBUTION
  // ============================================================================

  // Boarding facility information
  db.exec(`
    CREATE TABLE IF NOT EXISTS boarding_facility (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      facility_name TEXT NOT NULL,
      facility_type TEXT NOT NULL CHECK (facility_type IN ('BOYS_DORM', 'GIRLS_DORM', 'MIXED_DORM')),
      total_beds INTEGER NOT NULL DEFAULT 0,
      occupied_beds INTEGER NOT NULL DEFAULT 0,
      matron_staff_id INTEGER,
      is_active BOOLEAN NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (matron_staff_id) REFERENCES staff(id)
    );
  `);

  // Boarding-specific expenses
  db.exec(`
    CREATE TABLE IF NOT EXISTS boarding_expense (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      facility_id INTEGER,
      expense_date DATE NOT NULL,
      expense_type TEXT NOT NULL CHECK (expense_type IN ('FOOD', 'UTILITIES', 'BEDDING', 'STAFF', 'MAINTENANCE', 'OTHER')),
      amount INTEGER NOT NULL,
      description TEXT,
      gl_account_code TEXT NOT NULL,
      journal_entry_id INTEGER,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (facility_id) REFERENCES boarding_facility(id) ON DELETE SET NULL,
      FOREIGN KEY (gl_account_code) REFERENCES gl_account(code),
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entry(id)
    );
  `);

  // ============================================================================
  // 4. TRANSPORT COST ATTRIBUTION
  // ============================================================================

  // Transport routes
  db.exec(`
    CREATE TABLE IF NOT EXISTS transport_route (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_name TEXT NOT NULL,
      route_code TEXT NOT NULL UNIQUE,
      start_location TEXT NOT NULL,
      end_location TEXT NOT NULL,
      distance_km REAL NOT NULL DEFAULT 0,
      monthly_fuel_budget INTEGER NOT NULL DEFAULT 0,
      monthly_maintenance_budget INTEGER NOT NULL DEFAULT 0,
      driver_staff_id INTEGER,
      vehicle_registration TEXT,
      vehicle_capacity INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (driver_staff_id) REFERENCES staff(id)
    );
  `);

  // Route expenses
  db.exec(`
    CREATE TABLE IF NOT EXISTS transport_route_expense (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_id INTEGER NOT NULL,
      expense_date DATE NOT NULL,
      expense_type TEXT NOT NULL CHECK (expense_type IN ('FUEL', 'MAINTENANCE', 'INSURANCE', 'DRIVER_SALARY', 'PERMITS', 'OTHER')),
      amount INTEGER NOT NULL,
      description TEXT,
      gl_account_code TEXT NOT NULL,
      journal_entry_id INTEGER,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (route_id) REFERENCES transport_route(id) ON DELETE CASCADE,
      FOREIGN KEY (gl_account_code) REFERENCES gl_account(code),
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entry(id)
    );
  `);

  // Student route assignment
  db.exec(`
    CREATE TABLE IF NOT EXISTS student_route_assignment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      route_id INTEGER NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE,
      pickup_point TEXT,
      is_active BOOLEAN NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES student(id) ON DELETE CASCADE,
      FOREIGN KEY (route_id) REFERENCES transport_route(id) ON DELETE CASCADE
    );
  `);

  // ============================================================================
  // 5. GOVERNMENT GRANT TRACKING
  // ============================================================================

  // Government grants
  db.exec(`
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
  `);

  // Grant utilization tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS grant_utilization (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grant_id INTEGER NOT NULL,
      gl_account_code TEXT NOT NULL,
      amount_used INTEGER NOT NULL,
      utilization_date DATE NOT NULL,
      description TEXT NOT NULL,
      journal_entry_id INTEGER,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (grant_id) REFERENCES government_grant(id) ON DELETE CASCADE,
      FOREIGN KEY (gl_account_code) REFERENCES gl_account(code),
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entry(id)
    );
  `);

  // ============================================================================
  // 6. STUDENT COST TRACKING
  // ============================================================================

  // Per-student cost snapshot (calculated periodically)
  db.exec(`
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
  `);

  // ============================================================================
  // CREATE INDEXES FOR PERFORMANCE
  // ============================================================================

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_fee_category_strand_fee ON fee_category_strand(fee_category_id);
    CREATE INDEX IF NOT EXISTS idx_fee_category_strand_cbc ON fee_category_strand(cbc_strand_id);
    CREATE INDEX IF NOT EXISTS idx_strand_expense_strand ON cbc_strand_expense(cbc_strand_id);
    CREATE INDEX IF NOT EXISTS idx_strand_expense_year ON cbc_strand_expense(fiscal_year);
    CREATE INDEX IF NOT EXISTS idx_student_participation_student ON student_activity_participation(student_id);
    CREATE INDEX IF NOT EXISTS idx_student_participation_strand ON student_activity_participation(cbc_strand_id);
    CREATE INDEX IF NOT EXISTS idx_grade_transition_student ON grade_transition(student_id);
    CREATE INDEX IF NOT EXISTS idx_grade_transition_date ON grade_transition(transition_date);
    CREATE INDEX IF NOT EXISTS idx_jss_fee_year ON jss_fee_structure(academic_year);
    CREATE INDEX IF NOT EXISTS idx_boarding_expense_facility ON boarding_expense(facility_id);
    CREATE INDEX IF NOT EXISTS idx_boarding_expense_date ON boarding_expense(expense_date);
    CREATE INDEX IF NOT EXISTS idx_route_expense_route ON transport_route_expense(route_id);
    CREATE INDEX IF NOT EXISTS idx_route_expense_date ON transport_route_expense(expense_date);
    CREATE INDEX IF NOT EXISTS idx_student_route_student ON student_route_assignment(student_id);
    CREATE INDEX IF NOT EXISTS idx_student_route_route ON student_route_assignment(route_id);
    CREATE INDEX IF NOT EXISTS idx_grant_year ON government_grant(fiscal_year);
    CREATE INDEX IF NOT EXISTS idx_grant_utilization_grant ON grant_utilization(grant_id);
    CREATE INDEX IF NOT EXISTS idx_cost_snapshot_year ON student_cost_snapshot(academic_year);
  `);

  // eslint-disable-next-line no-console
  console.info('Migration 012: CBC/CBE features applied successfully');
}

export function down(db: Database): void {
  // Drop tables in reverse order to respect foreign key constraints
  db.exec(`
    DROP INDEX IF EXISTS idx_cost_snapshot_year;
    DROP INDEX IF EXISTS idx_grant_utilization_grant;
    DROP INDEX IF EXISTS idx_grant_year;
    DROP INDEX IF EXISTS idx_student_route_route;
    DROP INDEX IF EXISTS idx_student_route_student;
    DROP INDEX IF EXISTS idx_route_expense_date;
    DROP INDEX IF EXISTS idx_route_expense_route;
    DROP INDEX IF EXISTS idx_boarding_expense_date;
    DROP INDEX IF EXISTS idx_boarding_expense_facility;
    DROP INDEX IF EXISTS idx_jss_fee_year;
    DROP INDEX IF EXISTS idx_grade_transition_date;
    DROP INDEX IF EXISTS idx_grade_transition_student;
    DROP INDEX IF EXISTS idx_student_participation_strand;
    DROP INDEX IF EXISTS idx_student_participation_student;
    DROP INDEX IF EXISTS idx_strand_expense_year;
    DROP INDEX IF EXISTS idx_strand_expense_strand;
    DROP INDEX IF EXISTS idx_fee_category_strand_cbc;
    DROP INDEX IF EXISTS idx_fee_category_strand_fee;
    
    DROP TABLE IF EXISTS student_cost_snapshot;
    DROP TABLE IF EXISTS grant_utilization;
    DROP TABLE IF EXISTS government_grant;
    DROP TABLE IF EXISTS student_route_assignment;
    DROP TABLE IF EXISTS transport_route_expense;
    DROP TABLE IF EXISTS transport_route;
    DROP TABLE IF EXISTS boarding_expense;
    DROP TABLE IF EXISTS boarding_facility;
    DROP TABLE IF EXISTS jss_fee_structure;
    DROP TABLE IF EXISTS grade_transition;
    DROP TABLE IF EXISTS student_activity_participation;
    DROP TABLE IF EXISTS cbc_strand_expense;
    DROP TABLE IF EXISTS fee_category_strand;
    DROP TABLE IF EXISTS cbc_strand;
  `);

  // eslint-disable-next-line no-console
  console.info('Migration 012: CBC/CBE features rolled back');
}

