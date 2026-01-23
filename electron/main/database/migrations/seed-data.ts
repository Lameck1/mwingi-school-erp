export function getSeedData(): string {
    return `
    INSERT OR IGNORE INTO school_settings (id, school_name, school_motto, address, phone, email) 
    VALUES (1, 'Mwingi Adventist School', 'Education for Eternity', 'P.O. Box 12345-90100, Mwingi, Kenya', '+254 712 345 678', 'info@mwingiadventist.ac.ke');
    INSERT OR IGNORE INTO stream (stream_code, stream_name, level_order, is_junior_secondary) VALUES 
    ('PG', 'Play Group', 1, 0), ('PP1', 'Pre-Primary 1', 2, 0), ('PP2', 'Pre-Primary 2', 3, 0),
    ('G1', 'Grade 1', 4, 0), ('G2', 'Grade 2', 5, 0), ('G3', 'Grade 3', 6, 0),
    ('G4', 'Grade 4', 7, 0), ('G5', 'Grade 5', 8, 0), ('G6', 'Grade 6', 9, 0),
    ('G7', 'Grade 7', 10, 1), ('G8', 'Grade 8', 11, 1), ('G9', 'Grade 9', 12, 1);
    INSERT OR IGNORE INTO fee_category (category_name, description) VALUES 
    ('Tuition', 'Tuition fees'), ('Boarding', 'Boarding fees'), ('Meals', 'Meals fees'),
    ('Transport', 'Transport fees'), ('Activity', 'Activity fees'), ('Uniform', 'Uniform fees'),
    ('Books', 'Books and materials'), ('Exam', 'Examination fees'), ('Registration', 'Registration fees');
    INSERT OR IGNORE INTO transaction_category (category_name, category_type, is_system) VALUES 
    ('School Fees', 'INCOME', 1), ('Donations', 'INCOME', 1), ('Grants', 'INCOME', 1),
    ('Other Income', 'INCOME', 0), ('Salaries', 'EXPENSE', 1), ('Utilities', 'EXPENSE', 0),
    ('Supplies', 'EXPENSE', 0), ('Maintenance', 'EXPENSE', 0);
    INSERT OR IGNORE INTO user (username, password_hash, full_name, email, role) VALUES 
    ('admin', '$2a$10$RicmEoNAtBI5Kfx9Z1YcA.09l63qLqDPXes6IH.09Gd7vy4Ilwqte', 'System Administrator', 'admin@mwingiadventist.ac.ke', 'ADMIN');
    INSERT OR IGNORE INTO academic_year (year_name, start_date, end_date, is_current) VALUES ('2025', '2025-01-06', '2025-11-28', 1);
    INSERT OR IGNORE INTO inventory_category (category_name) VALUES 
    ('Stationery'), ('Food Supplies'), ('Uniforms'), ('Cleaning'), ('Furniture'), ('Electronics');
  `;
}

