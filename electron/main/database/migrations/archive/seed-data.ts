export function getSeedData(): string {
  return `
    INSERT OR IGNORE INTO school_settings (id, school_name, school_motto, address, phone, email) 
    VALUES (1, 'Mwingi Adventist School', 'Education for Eternity', 'P.O. Box 212-90400, Mwingi, Kenya', '0725064785', 'mwingiadventist@gmail.com');
    INSERT OR IGNORE INTO stream (stream_code, stream_name, level_order, is_junior_secondary) VALUES 
    ('BABY', 'Baby Class', 1, 0), ('PP1', 'Pre-Primary 1', 2, 0), ('PP2', 'Pre-Primary 2', 3, 0),
    ('G1', 'Grade 1', 4, 0), ('G2', 'Grade 2', 5, 0), ('G3', 'Grade 3', 6, 0),
    ('G4', 'Grade 4', 7, 0), ('G5', 'Grade 5', 8, 0), ('G6', 'Grade 6', 9, 0),
    ('G7', 'Grade 7', 10, 1), ('G8', 'Grade 8', 11, 1), ('G9', 'Grade 9', 12, 1);
    INSERT OR IGNORE INTO fee_category (category_name, description) VALUES 
    ('Tuition', 'Tuition fees'), ('Feeding', 'Meals/Feeding fees'), ('Maintenance', 'School maintenance'),
    ('Admission', 'One-time admission fee'), ('Transport', 'Transport fees'), ('Textbook', 'Books and materials'),
    ('Activity', 'Activity fees'), ('Interview', 'Interview fee for new pupils'), 
    ('Motivation', 'Motivation fee'), ('Exams', 'Exams and project fee');
    INSERT OR IGNORE INTO transaction_category (category_name, category_type, is_system) VALUES 
    ('School Fees', 'INCOME', 1), ('Donations', 'INCOME', 1), ('Grants', 'INCOME', 1),
    ('Other Income', 'INCOME', 0), ('Salaries', 'EXPENSE', 1), ('Utilities', 'EXPENSE', 0),
    ('Supplies', 'EXPENSE', 0), ('Maintenance', 'EXPENSE', 0);
    INSERT OR IGNORE INTO user (username, password_hash, full_name, email, role) VALUES 
    ('admin', '$2a$10$RicmEoNAtBI5Kfx9Z1YcA.09l63qLqDPXes6IH.09Gd7vy4Ilwqte', 'System Administrator', 'admin@mwingiadventist.ac.ke', 'ADMIN');
    INSERT OR IGNORE INTO academic_year (year_name, start_date, end_date, is_current) VALUES ('2025', '2025-01-06', '2025-11-28', 1);
    INSERT OR IGNORE INTO inventory_category (category_name) VALUES 
    ('Stationery'), ('Food Supplies'), ('Uniforms'), ('Cleaning'), ('Furniture'), ('Electronics');

    -- Kenyan Statutory Rates 2024/2025
    -- NSSF Tier I (Fixed 720) and Tier II (Fixed 1440)
    INSERT OR IGNORE INTO statutory_rates (rate_type, min_amount, max_amount, fixed_amount, effective_from) VALUES
    ('NSSF_TIER_I', 0, 7000, 720, '2024-02-01'),
    ('NSSF_TIER_II', 7001, 36000, 1440, '2024-02-01');

    -- Housing Levy (1.5% of Gross)
    INSERT OR IGNORE INTO statutory_rates (rate_type, rate, effective_from) VALUES
    ('HOUSING_LEVY', 0.015, '2023-07-01');

    -- SHIF (2.75% of Gross)
    INSERT OR IGNORE INTO statutory_rates (rate_type, rate, effective_from) VALUES
    ('SHIF', 0.0275, '2024-10-01');

    -- PAYE Bands 2024/2025
    INSERT OR IGNORE INTO statutory_rates (rate_type, min_amount, max_amount, rate, effective_from) VALUES
    ('PAYE_BAND', 0, 24000, 0.1, '2024-01-01'),
    ('PAYE_BAND', 24001, 32333, 0.25, '2024-01-01'),
    ('PAYE_BAND', 32334, 500000, 0.3, '2024-01-01'),
    ('PAYE_BAND', 500001, 800000, 0.325, '2024-01-01'),
    ('PAYE_BAND', 800001, 99999999, 0.35, '2024-01-01');

    -- Personal Relief
    INSERT OR IGNORE INTO statutory_rates (rate_type, fixed_amount, effective_from) VALUES
    ('PERSONAL_RELIEF', 2400, '2024-01-01');
  `;
}

