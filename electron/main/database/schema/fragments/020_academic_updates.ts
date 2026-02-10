import { type Database } from 'better-sqlite3'

export function up(db: Database): void {
    // Academic Exams Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS academic_exam (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            academic_year_id INTEGER,
            term_id INTEGER,
            exam_type TEXT,
            start_date TEXT,
            end_date TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(academic_year_id) REFERENCES academic_year(id),
            FOREIGN KEY(term_id) REFERENCES term(id)
        )
    `)

    // Award Categories
    db.exec(`
        CREATE TABLE IF NOT EXISTS award_category (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category_type TEXT NOT NULL, -- e.g., 'academic', 'sports', 'behavior'
            description TEXT,
            icon TEXT,
            color TEXT,
            sort_order INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `)

    // Student Awards
    db.exec(`
        CREATE TABLE IF NOT EXISTS student_award (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            award_category_id INTEGER NOT NULL,
            academic_year_id INTEGER NOT NULL,
            term_id INTEGER NOT NULL,
            award_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            remarks TEXT,
            approval_status TEXT DEFAULT 'pending', -- pending, approved, rejected
            approved_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(student_id) REFERENCES student(id),
            FOREIGN KEY(award_category_id) REFERENCES award_category(id),
            FOREIGN KEY(academic_year_id) REFERENCES academic_year(id),
            FOREIGN KEY(term_id) REFERENCES term(id)
        )
    `)
}

export function down(db: Database): void {
    db.exec('DROP TABLE IF EXISTS student_award')
    db.exec('DROP TABLE IF EXISTS award_category')
    db.exec('DROP TABLE IF EXISTS academic_exam')
}
