export function getDemoData(): string {
    return `
    -- Terms for 2025
    INSERT OR IGNORE INTO term (academic_year_id, term_number, term_name, start_date, end_date, is_current) VALUES 
    (1, 1, 'Term 1', '2025-01-06', '2025-04-04', 1),
    (1, 2, 'Term 2', '2025-05-05', '2025-08-08', 0),
    (1, 3, 'Term 3', '2025-09-01', '2025-11-28', 0);

    -- Statutory Rates (Simplified 2024/2025)
    INSERT OR IGNORE INTO statutory_rates (rate_type, min_amount, max_amount, rate, fixed_amount, effective_from) VALUES 
    ('NHIF', 0, 5999, 0, 150, '2024-01-01'),
    ('NHIF', 6000, 7999, 0, 300, '2024-01-01'),
    ('NHIF', 8000, 11999, 0, 400, '2024-01-01'),
    ('NHIF', 12000, 14999, 0, 500, '2024-01-01'),
    ('NSSF', 0, 999999, 0.06, 0, '2024-02-01'),
    ('PAYE', 0, 24000, 0.1, 0, '2024-01-01'),
    ('PAYE', 24001, 32333, 0.25, 0, '2024-01-01'),
    ('PAYE', 32334, 999999, 0.3, 0, '2024-01-01');

    -- Staff
    INSERT OR IGNORE INTO staff (staff_number, first_name, middle_name, last_name, id_number, phone, email, job_title, basic_salary, employment_date) VALUES 
    ('TSC001', 'David', 'Kamau', 'Njoroge', '12345678', '0711000001', 'david.njoroge@school.com', 'Head Teacher', 45000, '2023-01-01'),
    ('TSC002', 'Alice', 'Wanjiru', 'Mutua', '23456789', '0711000002', 'alice.mutua@school.com', 'Teacher', 35000, '2023-05-01'),
    ('SUP001', 'Joseph', '', 'Kiptoo', '34567890', '0711000003', 'joseph.kiptoo@school.com', 'Support Staff', 15000, '2024-01-01');

    -- Students
    INSERT OR IGNORE INTO student (admission_number, first_name, last_name, gender, student_type, admission_date, guardian_name, guardian_phone, is_active) VALUES 
    ('ADM001', 'James', 'Mwangi', 'M', 'DAY_SCHOLAR', '2024-01-05', 'Peter Mwangi', '0722000001', 1),
    ('ADM002', 'Mary', 'Wanjiku', 'F', 'DAY_SCHOLAR', '2024-01-05', 'Jane Wanjiku', '0722000002', 1),
    ('ADM003', 'John', 'Kamau', 'M', 'BOARDER', '2025-01-06', 'Samuel Kamau', '0722000003', 1),
    ('ADM004', 'Grace', 'Atieno', 'F', 'BOARDER', '2025-01-06', 'Rose Atieno', '0722000004', 1),
    ('ADM005', 'Peter', 'Omondi', 'M', 'DAY_SCHOLAR', '2025-01-06', 'Thomas Omondi', '0722000005', 1),
    ('ADM006', 'Faith', 'Chebet', 'F', 'BOARDER', '2025-01-06', 'Daniel Chebet', '0722000006', 1);

    -- Enrollments (Using subqueries for IDs to be safe)
    INSERT OR IGNORE INTO enrollment (student_id, academic_year_id, term_id, stream_id, student_type, enrollment_date) VALUES 
    ((SELECT id FROM student WHERE admission_number='ADM001'), 1, 1, (SELECT id FROM stream WHERE stream_code='G1'), 'DAY_SCHOLAR', '2025-01-06'),
    ((SELECT id FROM student WHERE admission_number='ADM002'), 1, 1, (SELECT id FROM stream WHERE stream_code='G2'), 'DAY_SCHOLAR', '2025-01-06'),
    ((SELECT id FROM student WHERE admission_number='ADM003'), 1, 1, (SELECT id FROM stream WHERE stream_code='G7'), 'BOARDER', '2025-01-06'),
    ((SELECT id FROM student WHERE admission_number='ADM004'), 1, 1, (SELECT id FROM stream WHERE stream_code='G8'), 'BOARDER', '2025-01-06'),
    ((SELECT id FROM student WHERE admission_number='ADM005'), 1, 1, (SELECT id FROM stream WHERE stream_code='PP1'), 'DAY_SCHOLAR', '2025-01-06'),
    ((SELECT id FROM student WHERE admission_number='ADM006'), 1, 1, (SELECT id FROM stream WHERE stream_code='G7'), 'BOARDER', '2025-01-06');

    -- Suppliers
    INSERT OR IGNORE INTO supplier (supplier_name, contact_person, phone, email, address) VALUES 
    ('Text Book Centre', 'Sales Manager', '020-1234567', 'sales@tbc.co.ke', 'Nairobi'),
    ('Uchumi Supermarkets', 'Branch Manager', '0700-000000', 'info@uchumi.com', 'Mwingi Town'),
    ('Bata Shoe Company', 'Sales Rep', '0711-111111', 'sales@bata.com', 'Limuru');

    -- Inventory Items
    INSERT OR IGNORE INTO inventory_item (item_code, item_name, category_id, unit_of_measure, current_stock, reorder_level, unit_cost) VALUES 
    ('INV001', 'A4 Exercise Books 200pg', (SELECT id FROM inventory_category WHERE category_name='Stationery'), 'Dozen', 50, 10, 850),
    ('INV002', 'Chalk Box (White)', (SELECT id FROM inventory_category WHERE category_name='Stationery'), 'Box', 20, 5, 120),
    ('INV003', 'Maize 90kg', (SELECT id FROM inventory_category WHERE category_name='Food Supplies'), 'Bag', 10, 2, 4500),
    ('INV004', 'Beans 90kg', (SELECT id FROM inventory_category WHERE category_name='Food Supplies'), 'Bag', 5, 2, 9000);

    -- Fee Structure (Sample for G1 Day Scholar and G7 Boarder)
    -- G1 Day Scholar
    INSERT OR IGNORE INTO fee_structure (academic_year_id, term_id, stream_id, student_type, fee_category_id, amount) VALUES 
    (1, 1, (SELECT id FROM stream WHERE stream_code='G1'), 'DAY_SCHOLAR', (SELECT id FROM fee_category WHERE category_name='Tuition'), 5000),
    (1, 1, (SELECT id FROM stream WHERE stream_code='G1'), 'DAY_SCHOLAR', (SELECT id FROM fee_category WHERE category_name='Activity'), 500),
    (1, 1, (SELECT id FROM stream WHERE stream_code='G1'), 'DAY_SCHOLAR', (SELECT id FROM fee_category WHERE category_name='Exam'), 300);

    -- G7 Boarder
    INSERT OR IGNORE INTO fee_structure (academic_year_id, term_id, stream_id, student_type, fee_category_id, amount) VALUES 
    (1, 1, (SELECT id FROM stream WHERE stream_code='G7'), 'BOARDER', (SELECT id FROM fee_category WHERE category_name='Tuition'), 8000),
    (1, 1, (SELECT id FROM stream WHERE stream_code='G7'), 'BOARDER', (SELECT id FROM fee_category WHERE category_name='Boarding'), 12000),
    (1, 1, (SELECT id FROM stream WHERE stream_code='G7'), 'BOARDER', (SELECT id FROM fee_category WHERE category_name='Meals'), 6000),
    (1, 1, (SELECT id FROM stream WHERE stream_code='G7'), 'BOARDER', (SELECT id FROM fee_category WHERE category_name='Activity'), 1000);

    -- Transactions (Some history)
    -- Income: Donation
    INSERT OR IGNORE INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, payment_method, description, recorded_by_user_id) VALUES 
    ('TXN-SEED-001', '2025-01-10', 'DONATION', (SELECT id FROM transaction_category WHERE category_name='Donations'), 50000, 'CREDIT', 'BANK_TRANSFER', 'Alumni Donation', 1);
    
    -- Expense: Utilities
    INSERT OR IGNORE INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, payment_method, description, recorded_by_user_id) VALUES 
    ('TXN-SEED-002', '2025-01-15', 'EXPENSE', (SELECT id FROM transaction_category WHERE category_name='Utilities'), 2500, 'DEBIT', 'MPESA', 'Electricity Token', 1);

    -- Expense: Supplies
    INSERT OR IGNORE INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, payment_method, description, recorded_by_user_id) VALUES 
    ('TXN-SEED-003', '2025-01-20', 'EXPENSE', (SELECT id FROM transaction_category WHERE category_name='Supplies'), 1500, 'DEBIT', 'CASH', 'Office Stationery', 1);
    `
}

