import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  console.warn('Running Migration: Seed Initial Data');

  // ============================================================================
  // 1. SCHOOL SETTINGS
  // ============================================================================
  db.exec(`
    INSERT OR IGNORE INTO school_settings (id, school_name, school_motto, address, phone, email) 
    VALUES (1, 'Mwingi Adventist School', 'Education for Eternity', 'P.O. Box 212-90400, Mwingi, Kenya', '0725064785', 'mwingiadventist@gmail.com');
  `);

  // ============================================================================
  // 2. ADMIN USER
  // ============================================================================
  db.exec(`
    INSERT OR IGNORE INTO user (username, password_hash, full_name, email, role) VALUES 
    ('admin', '$2a$10$RicmEoNAtBI5Kfx9Z1YcA.09l63qLqDPXes6IH.09Gd7vy4Ilwqte', 'System Administrator', 'admin@mwingiadventist.ac.ke', 'ADMIN');
  `);

  // ============================================================================
  // 3. ACADEMIC YEAR & TERMS
  // ============================================================================
  db.exec(`
    INSERT OR IGNORE INTO academic_year (year_name, start_date, end_date, is_current) VALUES ('2026', '2026-01-06', '2026-11-28', 1);
  `);

  // Seed Terms for 2026
  const year2026 = db.prepare(`SELECT id FROM academic_year WHERE year_name = '2026'`).get() as { id: number } | undefined;
  if (year2026) {
    db.exec(`
        INSERT OR IGNORE INTO term (academic_year_id, term_number, term_name, start_date, end_date, is_current, status) VALUES
        (${year2026.id}, 1, 'Term 1', '2026-01-06', '2026-04-11', 1, 'OPEN'),
        (${year2026.id}, 2, 'Term 2', '2026-04-28', '2026-08-08', 0, 'OPEN'),
        (${year2026.id}, 3, 'Term 3', '2026-08-25', '2026-11-28', 0, 'OPEN');
      `);
  }

  // ============================================================================
  // 4. STREAMS
  // ============================================================================
  db.exec(`
    INSERT OR IGNORE INTO stream (stream_code, stream_name, level_order, is_junior_secondary) VALUES 
    ('BABY', 'Baby Class', 1, 0), ('PP1', 'Pre-Primary 1', 2, 0), ('PP2', 'Pre-Primary 2', 3, 0),
    ('G1', 'Grade 1', 4, 0), ('G2', 'Grade 2', 5, 0), ('G3', 'Grade 3', 6, 0),
    ('G4', 'Grade 4', 7, 0), ('G5', 'Grade 5', 8, 0), ('G6', 'Grade 6', 9, 0),
    ('G7', 'Grade 7', 10, 1), ('G8', 'Grade 8', 11, 1), ('G9', 'Grade 9', 12, 1);
  `);

  // ============================================================================
  // 5. INVENTORY CATEGORIES
  // ============================================================================
  db.exec(`
    INSERT OR IGNORE INTO inventory_category (category_name) VALUES 
    ('Stationery'), ('Food Supplies'), ('Uniforms'), ('Cleaning'), ('Furniture'), ('Electronics');
  `);

  // ============================================================================
  // 6. TRANSACTION CATEGORIES
  // ============================================================================
  db.exec(`
    INSERT OR IGNORE INTO transaction_category (category_name, category_type, is_system) VALUES 
    ('School Fees', 'INCOME', 1), ('Donations', 'INCOME', 1), ('Grants', 'INCOME', 1),
    ('Other Income', 'INCOME', 0), ('Salaries', 'EXPENSE', 1), ('Utilities', 'EXPENSE', 0),
    ('Supplies', 'EXPENSE', 0), ('Maintenance', 'EXPENSE', 0);
  `);

  // ============================================================================
  // 7. STATUTORY RATES
  // ============================================================================
  db.exec(`
    INSERT OR IGNORE INTO statutory_rates (rate_type, min_amount, max_amount, fixed_amount, effective_from) VALUES
    ('NSSF_TIER_I', 0, 7000, 720, '2024-02-01'),
    ('NSSF_TIER_II', 7001, 36000, 1440, '2024-02-01');
    INSERT OR IGNORE INTO statutory_rates (rate_type, rate, effective_from) VALUES
    ('HOUSING_LEVY', 0.015, '2023-07-01');
    INSERT OR IGNORE INTO statutory_rates (rate_type, rate, effective_from) VALUES
    ('SHIF', 0.0275, '2024-10-01');
    INSERT OR IGNORE INTO statutory_rates (rate_type, min_amount, max_amount, rate, effective_from) VALUES
    ('PAYE_BAND', 0, 24000, 0.1, '2024-01-01'),
    ('PAYE_BAND', 24001, 32333, 0.25, '2024-01-01'),
    ('PAYE_BAND', 32334, 500000, 0.3, '2024-01-01'),
    ('PAYE_BAND', 500001, 800000, 0.325, '2024-01-01'),
    ('PAYE_BAND', 800001, 99999999, 0.35, '2024-01-01');
    INSERT OR IGNORE INTO statutory_rates (rate_type, fixed_amount, effective_from) VALUES
    ('PERSONAL_RELIEF', 2400, '2024-01-01');
  `);

  // ============================================================================
  // 8. CHART OF ACCOUNTS
  // ============================================================================
  const standardAccounts = [
    { code: '1010', name: 'Cash on Hand', type: 'ASSET', balance: 'DEBIT', system: 1 },
    { code: '1020', name: 'Bank Account - KCB', type: 'ASSET', balance: 'DEBIT', system: 1 },
    { code: '1030', name: 'Bank Account - Equity', type: 'ASSET', balance: 'DEBIT', system: 1 },
    { code: '1100', name: 'Accounts Receivable - Students', type: 'ASSET', balance: 'DEBIT', system: 1 },
    { code: '1200', name: 'Inventory - Supplies', type: 'ASSET', balance: 'DEBIT', system: 1 },
    { code: '1300', name: 'Fixed Assets - Buildings', type: 'ASSET', balance: 'DEBIT', system: 1 },
    { code: '1310', name: 'Fixed Assets - Vehicles', type: 'ASSET', balance: 'DEBIT', system: 1 },
    { code: '1320', name: 'Fixed Assets - Furniture', type: 'ASSET', balance: 'DEBIT', system: 1 },
    { code: '1390', name: 'Accumulated Depreciation', type: 'ASSET', balance: 'CREDIT', system: 1 },
    { code: '2010', name: 'Accounts Payable', type: 'LIABILITY', balance: 'CREDIT', system: 1 },
    { code: '2020', name: 'Student Credit Balances', type: 'LIABILITY', balance: 'CREDIT', system: 1 },
    { code: '2100', name: 'Salary Payable', type: 'LIABILITY', balance: 'CREDIT', system: 1 },
    { code: '2110', name: 'PAYE Payable', type: 'LIABILITY', balance: 'CREDIT', system: 1 },
    { code: '2120', name: 'NSSF Payable', type: 'LIABILITY', balance: 'CREDIT', system: 1 },
    { code: '2130', name: 'NHIF/SHIF Payable', type: 'LIABILITY', balance: 'CREDIT', system: 1 },
    { code: '2140', name: 'Housing Levy Payable', type: 'LIABILITY', balance: 'CREDIT', system: 1 },
    { code: '2200', name: 'Loans Payable', type: 'LIABILITY', balance: 'CREDIT', system: 1 },
    { code: '3010', name: 'Capital', type: 'EQUITY', balance: 'CREDIT', system: 1 },
    { code: '3020', name: 'Retained Earnings', type: 'EQUITY', balance: 'CREDIT', system: 1 },
    { code: '3030', name: 'Current Year Surplus/Deficit', type: 'EQUITY', balance: 'CREDIT', system: 1 },
    { code: '4010', name: 'Tuition Fees', type: 'REVENUE', balance: 'CREDIT', system: 1 },
    { code: '4020', name: 'Boarding Fees', type: 'REVENUE', balance: 'CREDIT', system: 1 },
    { code: '4030', name: 'Transport Fees', type: 'REVENUE', balance: 'CREDIT', system: 1 },
    { code: '4040', name: 'Activity Fees', type: 'REVENUE', balance: 'CREDIT', system: 1 },
    { code: '4050', name: 'Exam Fees', type: 'REVENUE', balance: 'CREDIT', system: 1 },
    { code: '4100', name: 'Government Grants - Capitation', type: 'REVENUE', balance: 'CREDIT', system: 1 },
    { code: '4200', name: 'Donations', type: 'REVENUE', balance: 'CREDIT', system: 1 },
    { code: '4300', name: 'Other Income', type: 'REVENUE', balance: 'CREDIT', system: 1 },
    { code: '5010', name: 'Salaries - Teaching Staff', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5020', name: 'Salaries - Non-Teaching Staff', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5030', name: 'Statutory Deductions - NSSF', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5040', name: 'Statutory Deductions - NHIF/SHIF', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5050', name: 'Statutory Deductions - Housing Levy', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5100', name: 'Food & Catering - Boarding', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5200', name: 'Transport - Fuel & Maintenance', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5210', name: 'Transport - Driver Salaries', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5300', name: 'Utilities - Electricity', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5310', name: 'Utilities - Water', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5400', name: 'Supplies - Stationery', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5410', name: 'Supplies - Cleaning', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5500', name: 'Repairs & Maintenance', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5600', name: 'Depreciation Expense', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5700', name: 'Bank Charges', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5800', name: 'Professional Fees', type: 'EXPENSE', balance: 'DEBIT', system: 1 },
    { code: '5900', name: 'Miscellaneous Expenses', type: 'EXPENSE', balance: 'DEBIT', system: 1 }
  ];

  const insertGLStmt = db.prepare(`
    INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance, is_system_account, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  for (const account of standardAccounts) {
    insertGLStmt.run(account.code, account.name, account.type, account.balance, account.system);
  }

  // ============================================================================
  // 9. APPROVAL RULES
  // ============================================================================
  db.exec(`
    INSERT OR IGNORE INTO approval_rule (rule_name, transaction_type, min_amount, required_approver_role, is_active)
    VALUES ('High Value Void', 'VOID', 50000, 'FINANCE_MANAGER', 1);
    INSERT OR IGNORE INTO approval_rule (rule_name, transaction_type, days_since_transaction, required_approver_role, is_active)
    VALUES ('Aged Transaction Void', 'VOID', 7, 'FINANCE_MANAGER', 1);
    INSERT OR IGNORE INTO approval_rule (rule_name, transaction_type, min_amount, required_approver_role, is_active)
    VALUES ('Large Payment', 'FEE_PAYMENT', 100000, 'FINANCE_MANAGER', 1);
    INSERT OR IGNORE INTO approval_rule (rule_name, transaction_type, required_approver_role, is_active)
    VALUES ('All Refunds', 'REFUND', 'FINANCE_MANAGER', 1);
  `);

  // ============================================================================
  // 10. FEE CATEGORIES
  // ============================================================================
  const categories = [
    { name: 'Tuition', desc: 'Tuition Fees', gl: '4010' },
    { name: 'Feeding', desc: 'Meals/Feeding Fees', gl: '4020' },
    { name: 'Maintenance', desc: 'Maintenance Fees', gl: '5500' },
    { name: 'Boarding', desc: 'Boarding Fees', gl: '4020' },
    { name: 'Activity', desc: 'Activity Fees', gl: '4040' },
    { name: 'Exams', desc: 'Exam Fees', gl: '4050' },
    { name: 'Medical', desc: 'Medical/Emergency Fees', gl: '4300' },
    { name: 'Transport', desc: 'Transport Fees', gl: '4030' },
    { name: 'Textbook', desc: 'Books and materials', gl: '4300' },
    { name: 'Interview', desc: 'Interview fee', gl: '4300' },
    { name: 'Motivation', desc: 'Motivation fee', gl: '4300' },
    { name: 'Admission', desc: 'One-time admission fee', gl: '4300' }
  ];

  const getGLId = db.prepare('SELECT id FROM gl_account WHERE account_code = ?');
  const insertCatStmt = db.prepare(`INSERT OR IGNORE INTO fee_category (category_name, description, gl_account_id) VALUES (?, ?, ?)`);
  const updateCatStmt = db.prepare(`UPDATE fee_category SET gl_account_id = ? WHERE category_name = ?`);

  for (const cat of categories) {
    const glRow = getGLId.get(cat.gl) as { id: number } | undefined;
    const glId = glRow ? glRow.id : null;
    insertCatStmt.run(cat.name, cat.desc, glId);
    if (glId) updateCatStmt.run(glId, cat.name);
  }

  // ============================================================================
  // 11. AWARD CATEGORIES
  // ============================================================================
  db.exec(`
    INSERT OR IGNORE INTO award_category (name, category_type, description, is_automatic, requires_approval, is_active, sort_order) VALUES
    ('Academic Excellence', 'academic_excellence', 'Awarded to top performing students', 0, 1, 1, 1),
    ('Most Improved Student', 'improvement', 'Awarded to students showing significant improvement', 0, 1, 1, 2),
    ('Best in Discipline', 'discipline', 'Awarded for exemplary behavior and discipline', 0, 1, 1, 3),
    ('Sports Achievement', 'sports', 'Awarded for outstanding performance in sports', 0, 1, 1, 4),
    ('Arts & Culture', 'arts', 'Awarded for excellence in arts and cultural activities', 0, 1, 1, 5),
    ('Agriculture Award', 'agriculture', 'Awarded for excellence in agricultural activities', 0, 1, 1, 6),
    ('Leadership Award', 'other', 'Awarded for outstanding leadership qualities', 0, 1, 1, 7),
    ('Perfect Attendance', 'other', 'Awarded to students with perfect attendance', 1, 0, 1, 8);
  `);
}

export function down(db: Database): void {
  // We generally don't delete seed data in down() unless it's strictly required.
  // The schema down() will drop the tables anyway.
  console.warn('Reverting Migration: Seed Initial Data (No Action Taken)');
}
