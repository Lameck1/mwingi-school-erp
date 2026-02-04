
import { Database } from 'better-sqlite3';

export function up(db: Database) {
  db.exec(`
    -- Create merit_list table
    CREATE TABLE merit_list (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      academic_year_id INTEGER,
      term_id INTEGER,
      stream_id INTEGER,
      generated_date TEXT,
      generated_by INTEGER,
      FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
      FOREIGN KEY (term_id) REFERENCES term(id),
      FOREIGN KEY (stream_id) REFERENCES stream(id)
    );

    -- Create merit_list_entry table
    CREATE TABLE merit_list_entry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merit_list_id INTEGER,
      student_id INTEGER,
      position INTEGER,
      total_marks REAL,
      average_marks REAL,
      grade TEXT,
      remarks TEXT,
      FOREIGN KEY (merit_list_id) REFERENCES merit_list(id),
      FOREIGN KEY (student_id) REFERENCES student(id)
    );

    -- Create award_category table
    CREATE TABLE award_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      criteria TEXT, -- JSON criteria
      is_active INTEGER DEFAULT 1
    );

    -- Create student_award table
    CREATE TABLE student_award (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER,
      award_category_id INTEGER,
      academic_year_id INTEGER,
      term_id INTEGER,
      awarded_date TEXT,
      certificate_number TEXT,
      remarks TEXT,
      FOREIGN KEY (student_id) REFERENCES student(id),
      FOREIGN KEY (award_category_id) REFERENCES award_category(id)
    );
  `);
}
