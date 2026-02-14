import type { Database } from 'better-sqlite3'

export function up(db: Database): void {
  console.warn('Running Seed: Academic Data')

  db.exec(`
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

    INSERT OR IGNORE INTO subject (code, name, curriculum, is_compulsory) VALUES
    ('E-LANG', 'Language Activities', 'ECDE', 1),
    ('E-MATH', 'Mathematical Activities', 'ECDE', 1),
    ('E-ENV', 'Environmental Activities', 'ECDE', 1),
    ('E-PSY', 'Psychomotor and Creative Activities', 'ECDE', 1),
    ('E-REL', 'Religious Education Activities', 'ECDE', 1);

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
  `)
}

export function down(): void {
  console.warn('Reverting Seed: Academic Data (No Action Taken)')
}
