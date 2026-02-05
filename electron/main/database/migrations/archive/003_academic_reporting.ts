export function getAcademicSchema(): string {
    return `
    -- Subjects & Activity Areas
    CREATE TABLE IF NOT EXISTS subject (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE, 
        name TEXT NOT NULL, 
        curriculum TEXT NOT NULL CHECK(curriculum IN ('8-4-4', 'CBC', 'ECDE')), 
        is_compulsory BOOLEAN DEFAULT 0,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Teacher Assignment (Per Class/Stream)
    CREATE TABLE IF NOT EXISTS subject_allocation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        stream_id INTEGER NOT NULL,
        subject_id INTEGER NOT NULL,
        teacher_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (stream_id) REFERENCES stream(id),
        FOREIGN KEY (teacher_id) REFERENCES staff(id),
        FOREIGN KEY (subject_id) REFERENCES subject(id),
        UNIQUE(academic_year_id, term_id, stream_id, subject_id)
    );

    -- Grading Logic
    CREATE TABLE IF NOT EXISTS grading_scale (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        curriculum TEXT NOT NULL CHECK(curriculum IN ('8-4-4', 'CBC', 'ECDE')),
        grade TEXT NOT NULL, 
        min_score INTEGER NOT NULL,
        max_score INTEGER NOT NULL,
        points INTEGER, 
        remarks TEXT,
        is_active BOOLEAN DEFAULT 1
    );

    -- Exam Definitions
    CREATE TABLE IF NOT EXISTS exam (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        name TEXT NOT NULL, 
        weight DECIMAL(5, 2) DEFAULT 1.0,
        is_published BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Universal Result Table
    CREATE TABLE IF NOT EXISTS exam_result (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        subject_id INTEGER NOT NULL,
        score DECIMAL(5, 2),    
        competency_level INTEGER, 
        teacher_remarks TEXT,
        entered_by_user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (exam_id) REFERENCES exam(id),
        FOREIGN KEY (student_id) REFERENCES student(id),
        FOREIGN KEY (subject_id) REFERENCES subject(id),
        UNIQUE(exam_id, student_id, subject_id)
    );

    -- Report Card Summaries
    CREATE TABLE IF NOT EXISTS report_card_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        total_marks DECIMAL(6, 2),
        mean_score DECIMAL(5, 2),
        mean_grade TEXT,
        stream_position INTEGER,
        class_position INTEGER,
        class_teacher_remarks TEXT,
        principal_remarks TEXT,
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (exam_id) REFERENCES exam(id),
        FOREIGN KEY (student_id) REFERENCES student(id),
        UNIQUE(exam_id, student_id)
    );
  `;
}

export function getAcademicSeedData(): string {
    return `
    -- Default 8-4-4 Grading
    INSERT OR IGNORE INTO grading_scale (curriculum, grade, min_score, max_score, points, remarks) VALUES
    ('8-4-4', 'A', 80, 100, 12, 'Excellent'),
    ('8-4-4', 'A-', 75, 79, 11, 'Very Good'),
    ('8-4-4', 'B+', 70, 74, 10, 'Good'),
    ('8-4-4', 'B', 65, 69, 9, 'Good'),
    ('8-4-4', 'B-', 60, 64, 8, 'Above Average'),
    ('8-4-4', 'C+', 55, 59, 7, 'Average'),
    ('8-4-4', 'C', 50, 54, 6, 'Average'),
    ('8-4-4', 'C-', 45, 49, 5, 'Below Average'),
    ('8-4-4', 'D+', 40, 44, 4, 'Fair'),
    ('8-4-4', 'D', 35, 39, 3, 'Fair'),
    ('8-4-4', 'D-', 30, 34, 2, 'Weak'),
    ('8-4-4', 'E', 0, 29, 1, 'Poor');

    -- Default CBC/ECDE Grading
    INSERT OR IGNORE INTO grading_scale (curriculum, grade, min_score, max_score, points, remarks) VALUES
    ('CBC', 'Exceeding Expectations', 80, 100, 4, 'The learner demonstrates proficiency beyond the level expected'),
    ('CBC', 'Meeting Expectations', 60, 79, 3, 'The learner demonstrates proficiency in the level expected'),
    ('CBC', 'Approaching Expectations', 40, 59, 2, 'The learner is yet to demonstrate full proficiency in the level expected'),
    ('CBC', 'Below Expectations', 0, 39, 1, 'The learner demonstrates basic proficiency in the level expected with support'),
    ('ECDE', 'Exceeding Expectations', 80, 100, 4, 'Exceeding Expectations'),
    ('ECDE', 'Meeting Expectations', 60, 79, 3, 'Meeting Expectations'),
    ('ECDE', 'Approaching Expectations', 40, 59, 2, 'Approaching Expectations'),
    ('ECDE', 'Below Expectations', 0, 39, 1, 'Below Expectations');

    -- Seeding ECDE Activity Areas
    INSERT OR IGNORE INTO subject (code, name, curriculum, is_compulsory) VALUES
    ('E-LANG', 'Language Activities', 'ECDE', 1),
    ('E-MATH', 'Mathematical Activities', 'ECDE', 1),
    ('E-ENV', 'Environmental Activities', 'ECDE', 1),
    ('E-PSY', 'Psychomotor and Creative Activities', 'ECDE', 1),
    ('E-REL', 'Religious Education Activities', 'ECDE', 1);

    -- Seeding CBC Primary Subjects (G1-G6)
    INSERT OR IGNORE INTO subject (code, name, curriculum, is_compulsory) VALUES
    ('C-ENG', 'English Language', 'CBC', 1),
    ('C-KIS', 'Kiswahili Language', 'CBC', 1),
    ('C-MATH', 'Mathematics', 'CBC', 1),
    ('C-ENV', 'Environmental Activities', 'CBC', 1),
    ('C-CRE', 'Christian Religious Education', 'CBC', 1),
    ('C-HYG', 'Hygiene and Nutrition', 'CBC', 1),
    ('C-ART', 'Art and Craft', 'CBC', 1),
    ('C-MUS', 'Music', 'CBC', 1),
    ('C-PE', 'Movement and Physical Education', 'CBC', 1);

    -- Seeding CBC Junior Secondary Subjects (G7-G9)
    INSERT OR IGNORE INTO subject (code, name, curriculum, is_compulsory) VALUES
    ('J-ENG', 'English', 'CBC', 1),
    ('J-KIS', 'Kiswahili', 'CBC', 1),
    ('J-MATH', 'Mathematics', 'CBC', 1),
    ('J-INT', 'Integrated Science', 'CBC', 1),
    ('J-HEL', 'Health Education', 'CBC', 1),
    ('J-PRE', 'Pre-Technical Studies', 'CBC', 1),
    ('J-SOC', 'Social Studies', 'CBC', 1),
    ('J-BUS', 'Business Studies', 'CBC', 1),
    ('J-AGR', 'Agriculture', 'CBC', 1),
    ('J-CRE', 'CRE', 'CBC', 1);

    -- Default Exams
    INSERT OR IGNORE INTO exam (academic_year_id, term_id, name, weight) VALUES
    (1, 1, 'End of Term 1 2025', 1.0);
  `;
}
