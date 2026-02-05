/**
 * Migration 018: Merit Lists and Awards Management
 * Adds comprehensive tables for exam merit lists and awards tracking
 * Supports CBC and 8-4-4 grading systems
 */

export function getMeritListSchema(): string {
    return `
    -- Merit List Snapshot (Generated per class/term)
    CREATE TABLE IF NOT EXISTS merit_list (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        stream_id INTEGER NOT NULL,
        exam_id INTEGER,
        list_type TEXT NOT NULL CHECK(list_type IN ('overall', 'subject')),
        subject_id INTEGER,
        generated_date TEXT NOT NULL,
        generated_by_user_id INTEGER,
        total_students INTEGER,
        remarks TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
        FOREIGN KEY (term_id) REFERENCES term(id),
        FOREIGN KEY (stream_id) REFERENCES stream(id),
        FOREIGN KEY (exam_id) REFERENCES exam(id),
        FOREIGN KEY (subject_id) REFERENCES subject(id),
        FOREIGN KEY (generated_by_user_id) REFERENCES staff(id),
        UNIQUE(academic_year_id, term_id, stream_id, exam_id, list_type)
    );

    -- Individual Merit List Entry
    CREATE TABLE IF NOT EXISTS merit_list_entry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        merit_list_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        position INTEGER NOT NULL,
        total_marks REAL NOT NULL,
        average_marks REAL NOT NULL,
        grade TEXT,
        percentage REAL NOT NULL,
        class_position INTEGER,
        stream_position INTEGER,
        tied_count INTEGER DEFAULT 1,
        remarks TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (merit_list_id) REFERENCES merit_list(id),
        FOREIGN KEY (student_id) REFERENCES student(id),
        UNIQUE(merit_list_id, student_id)
    );

    -- Subject Merit List Entry (Top performers per subject)
    CREATE TABLE IF NOT EXISTS subject_merit_entry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject_id INTEGER NOT NULL,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        exam_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        stream_id INTEGER NOT NULL,
        position INTEGER NOT NULL,
        marks REAL NOT NULL,
        percentage REAL NOT NULL,
        grade TEXT,
        teacher_id INTEGER,
        subject_difficulty_index REAL,
        remarks TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subject_id) REFERENCES subject(id),
        FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
        FOREIGN KEY (term_id) REFERENCES term(id),
        FOREIGN KEY (exam_id) REFERENCES exam(id),
        FOREIGN KEY (student_id) REFERENCES student(id),
        FOREIGN KEY (stream_id) REFERENCES stream(id),
        FOREIGN KEY (teacher_id) REFERENCES staff(id),
        UNIQUE(exam_id, student_id, subject_id)
    );

    -- Award Categories
    CREATE TABLE IF NOT EXISTS award_category (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        category_type TEXT NOT NULL CHECK(category_type IN (
            'academic_excellence', 'improvement', 'discipline', 
            'sports', 'arts', 'agriculture', 'other'
        )),
        description TEXT,
        criteria TEXT,
        minimum_threshold REAL,
        is_automatic BOOLEAN DEFAULT 0,
        requires_approval BOOLEAN DEFAULT 1,
        is_active BOOLEAN DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Performance Improvement Tracking
    CREATE TABLE IF NOT EXISTS performance_improvement (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        academic_year_id INTEGER NOT NULL,
        previous_term_id INTEGER,
        current_term_id INTEGER NOT NULL,
        previous_average REAL,
        current_average REAL,
        improvement_percentage REAL,
        improvement_points REAL,
        subjects_improved_count INTEGER,
        subjects_declined_count INTEGER,
        grade_improvement TEXT,
        overall_rank_change INTEGER,
        is_most_improved BOOLEAN DEFAULT 0,
        calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES student(id),
        FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
        FOREIGN KEY (previous_term_id) REFERENCES term(id),
        FOREIGN KEY (current_term_id) REFERENCES term(id)
    );

    -- Student Awards (Earned)
    CREATE TABLE IF NOT EXISTS student_award (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        award_category_id INTEGER NOT NULL,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER,
        award_date TEXT NOT NULL,
        certificate_number TEXT UNIQUE,
        awarded_by_user_id INTEGER,
        approval_status TEXT CHECK(approval_status IN ('pending', 'approved', 'rejected')),
        approved_by_user_id INTEGER,
        approved_at DATETIME,
        remarks TEXT,
        certificate_issued_at DATETIME,
        email_sent_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES student(id),
        FOREIGN KEY (award_category_id) REFERENCES award_category(id),
        FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
        FOREIGN KEY (term_id) REFERENCES term(id),
        FOREIGN KEY (awarded_by_user_id) REFERENCES staff(id),
        FOREIGN KEY (approved_by_user_id) REFERENCES staff(id)
    );

    -- Report Card (CBC & 8-4-4)
    CREATE TABLE IF NOT EXISTS report_card (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        stream_id INTEGER NOT NULL,
        generated_by_user_id INTEGER,
        overall_grade TEXT,
        total_marks REAL,
        average_marks REAL,
        position_in_class INTEGER,
        position_in_stream INTEGER,
        class_teacher_remarks TEXT,
        principal_remarks TEXT,
        attendance_days_present INTEGER,
        attendance_days_absent INTEGER,
        attendance_percentage REAL,
        next_term_begin_date TEXT,
        fees_balance REAL,
        qr_code_token TEXT,
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        email_sent_at DATETIME,
        sms_sent_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (exam_id) REFERENCES exam(id),
        FOREIGN KEY (student_id) REFERENCES student(id),
        FOREIGN KEY (stream_id) REFERENCES stream(id),
        FOREIGN KEY (generated_by_user_id) REFERENCES staff(id),
        UNIQUE(exam_id, student_id)
    );

    -- Report Card Subject Entry
    CREATE TABLE IF NOT EXISTS report_card_subject (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_card_id INTEGER NOT NULL,
        subject_id INTEGER NOT NULL,
        marks REAL NOT NULL,
        grade TEXT,
        percentage REAL,
        teacher_comment TEXT,
        competency_level TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (report_card_id) REFERENCES report_card(id),
        FOREIGN KEY (subject_id) REFERENCES subject(id),
        UNIQUE(report_card_id, subject_id)
    );

    -- Report Card CBC Strand Entry
    CREATE TABLE IF NOT EXISTS report_card_strand (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_card_id INTEGER NOT NULL,
        strand_id INTEGER,
        strand_name TEXT,
        competency_level TEXT CHECK(competency_level IN (
            'exceeds_expectations', 'meets_expectations', 
            'approaching_expectations', 'below_expectations'
        )),
        teacher_comment TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (report_card_id) REFERENCES report_card(id)
    );

    -- Exam Timetable
    CREATE TABLE IF NOT EXISTS exam_timetable (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        exam_id INTEGER NOT NULL,
        exam_date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        subject_id INTEGER NOT NULL,
        stream_id INTEGER,
        duration_minutes INTEGER,
        venue_id INTEGER,
        venue_name TEXT,
        capacity INTEGER,
        invigilators_count INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
        FOREIGN KEY (term_id) REFERENCES term(id),
        FOREIGN KEY (exam_id) REFERENCES exam(id),
        FOREIGN KEY (subject_id) REFERENCES subject(id),
        FOREIGN KEY (stream_id) REFERENCES stream(id),
        UNIQUE(exam_id, exam_date, start_time, subject_id)
    );

    -- Exam Invigilator Assignment
    CREATE TABLE IF NOT EXISTS exam_invigilator (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_timetable_id INTEGER NOT NULL,
        staff_id INTEGER NOT NULL,
        role TEXT CHECK(role IN ('chief', 'assistant', 'relief')),
        assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (exam_timetable_id) REFERENCES exam_timetable(id),
        FOREIGN KEY (staff_id) REFERENCES staff(id),
        UNIQUE(exam_timetable_id, staff_id)
    );

    -- Exam Analysis (Generated per subject/exam)
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
        analysis_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (exam_id) REFERENCES exam(id),
        FOREIGN KEY (subject_id) REFERENCES subject(id),
        FOREIGN KEY (stream_id) REFERENCES stream(id),
        FOREIGN KEY (teacher_id) REFERENCES staff(id),
        UNIQUE(exam_id, subject_id, stream_id)
    );

    -- Student Exam Performance Tracking
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
        analysis_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES student(id),
        FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
        FOREIGN KEY (exam_id) REFERENCES exam(id),
        FOREIGN KEY (best_subject_id) REFERENCES subject(id),
        FOREIGN KEY (worst_subject_id) REFERENCES subject(id),
        UNIQUE(student_id, exam_id)
    );
  `;
}

export function getMeritListSeedData(): string {
    return `
    -- Default Award Categories
    INSERT OR IGNORE INTO award_category (name, category_type, description, is_automatic, sort_order) VALUES
    ('Top Student Overall', 'academic_excellence', 'Overall class/stream top performer', 1, 1),
    ('Second Position', 'academic_excellence', 'Second in class/stream rankings', 1, 2),
    ('Third Position', 'academic_excellence', 'Third in class/stream rankings', 1, 3),
    ('Most Improved Student', 'improvement', 'Highest improvement from previous term', 1, 4),
    ('Perfect Attendance', 'discipline', 'Zero absence record', 1, 5),
    ('Sports Excellence', 'sports', 'Outstanding sports performance', 0, 6),
    ('Arts & Culture Excellence', 'arts', 'Outstanding arts and culture performance', 0, 7),
    ('Agriculture/Environmental Excellence', 'agriculture', 'Outstanding agriculture/environmental project', 0, 8),
    ('Subject Champion - English', 'academic_excellence', 'Top in English subject', 1, 9),
    ('Subject Champion - Mathematics', 'academic_excellence', 'Top in Mathematics subject', 1, 10),
    ('Subject Champion - Science', 'academic_excellence', 'Top in Science subject', 1, 11),
    ('Consistent Performer', 'academic_excellence', 'Top 10 in all terms this year', 1, 12),
    ('Most Disciplined', 'discipline', 'Zero disciplinary cases', 1, 13),
    ('Leadership Excellence', 'discipline', 'Outstanding leadership and character', 0, 14),
    ('Comeback Student', 'improvement', 'Remarkable improvement from bottom to top', 0, 15);
  `;
}

export default function migrate() {
    return { schema: getMeritListSchema(), seedData: getMeritListSeedData() }
}
