export const CORE_SCHEMA_PART3 = [
  `

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
  `,
  `

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
  `,
  `

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
  `,
] as const
