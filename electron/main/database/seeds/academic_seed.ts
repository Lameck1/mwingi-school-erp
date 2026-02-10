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
    ('CBC', 'Exceeding Expectations', 80, 100, 4, 'The learner demonstrates proficiency beyond the level expected'),
    ('CBC', 'Meeting Expectations', 60, 79, 3, 'The learner demonstrates proficiency in the level expected'),
    ('CBC', 'Approaching Expectations', 40, 59, 2, 'The learner is yet to demonstrate full proficiency in the level expected'),
    ('CBC', 'Below Expectations', 0, 39, 1, 'The learner demonstrates basic proficiency in the level expected with support'),
    ('ECDE', 'Exceeding Expectations', 80, 100, 4, 'Exceeding Expectations'),
    ('ECDE', 'Meeting Expectations', 60, 79, 3, 'Meeting Expectations'),
    ('ECDE', 'Approaching Expectations', 40, 59, 2, 'Approaching Expectations'),
    ('ECDE', 'Below Expectations', 0, 39, 1, 'Below Expectations');

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
