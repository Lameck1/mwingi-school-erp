-- ============================================================================
-- PHASE 3 DATABASE MIGRATION
-- Mwingi Adventist School ERP - Production Remediation
-- ============================================================================
-- Purpose: Add tables for credit auto-application, fee proration,
--          scholarships, and NEMIS exports
-- Created: 2026-02-02
-- ============================================================================

-- ============================================================================
-- CREDIT AUTO-APPLICATION TABLES
-- ============================================================================

-- Track student credit balances and transactions
CREATE TABLE IF NOT EXISTS credit_transaction (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  transaction_type TEXT NOT NULL CHECK(transaction_type IN ('CREDIT_RECEIVED', 'CREDIT_APPLIED', 'CREDIT_REFUNDED')),
  reference_invoice_id INTEGER,
  notes TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (student_id) REFERENCES student(id),
  FOREIGN KEY (reference_invoice_id) REFERENCES fee_invoice(id)
);

CREATE INDEX IF NOT EXISTS idx_credit_transaction_student ON credit_transaction(student_id);
CREATE INDEX IF NOT EXISTS idx_credit_transaction_type ON credit_transaction(transaction_type);
CREATE INDEX IF NOT EXISTS idx_credit_transaction_date ON credit_transaction(created_at);

-- ============================================================================
-- FEE PRORATION TABLES
-- ============================================================================

-- Log pro-rated fee calculations for mid-term enrollments
CREATE TABLE IF NOT EXISTS pro_ration_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  full_amount REAL NOT NULL,
  pro_rated_amount REAL NOT NULL,
  discount_percentage REAL NOT NULL,
  enrollment_date TEXT NOT NULL,
  term_start TEXT NOT NULL,
  term_end TEXT NOT NULL,
  days_in_term INTEGER NOT NULL,
  days_enrolled INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (invoice_id) REFERENCES fee_invoice(id),
  FOREIGN KEY (student_id) REFERENCES student(id)
);

CREATE INDEX IF NOT EXISTS idx_pro_ration_student ON pro_ration_log(student_id);
CREATE INDEX IF NOT EXISTS idx_pro_ration_invoice ON pro_ration_log(invoice_id);
CREATE INDEX IF NOT EXISTS idx_pro_ration_date ON pro_ration_log(enrollment_date);

-- ============================================================================
-- SCHOLARSHIP TABLES
-- ============================================================================

-- Main scholarship/grant programs
CREATE TABLE IF NOT EXISTS scholarship (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  scholarship_type TEXT NOT NULL CHECK(scholarship_type IN ('MERIT', 'NEED_BASED', 'SPORTS', 'PARTIAL', 'FULL')),
  amount REAL NOT NULL,
  percentage REAL,
  current_beneficiaries INTEGER NOT NULL DEFAULT 0,
  max_beneficiaries INTEGER NOT NULL,
  total_allocated REAL NOT NULL DEFAULT 0,
  eligibility_criteria TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'SUSPENDED', 'EXPIRED')),
  valid_from TEXT NOT NULL,
  valid_to TEXT NOT NULL,
  sponsor_name TEXT,
  sponsor_contact TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_scholarship_status ON scholarship(status);
CREATE INDEX IF NOT EXISTS idx_scholarship_type ON scholarship(scholarship_type);
CREATE INDEX IF NOT EXISTS idx_scholarship_validity ON scholarship(valid_from, valid_to);

-- Student scholarship allocations
CREATE TABLE IF NOT EXISTS student_scholarship (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scholarship_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  amount_allocated REAL NOT NULL,
  amount_utilized REAL NOT NULL DEFAULT 0,
  allocation_notes TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'FULLY_UTILIZED', 'EXPIRED', 'REVOKED')),
  effective_date TEXT NOT NULL,
  expiry_date TEXT NOT NULL,
  allocated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (scholarship_id) REFERENCES scholarship(id),
  FOREIGN KEY (student_id) REFERENCES student(id),
  UNIQUE(scholarship_id, student_id, status)
);

CREATE INDEX IF NOT EXISTS idx_student_scholarship_student ON student_scholarship(student_id);
CREATE INDEX IF NOT EXISTS idx_student_scholarship_scholarship ON student_scholarship(scholarship_id);
CREATE INDEX IF NOT EXISTS idx_student_scholarship_status ON student_scholarship(status);
CREATE INDEX IF NOT EXISTS idx_student_scholarship_dates ON student_scholarship(effective_date, expiry_date);

-- ============================================================================
-- NEMIS EXPORT TABLES
-- ============================================================================

-- Track NEMIS export history
CREATE TABLE IF NOT EXISTS nemis_export (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  export_type TEXT NOT NULL CHECK(export_type IN ('STUDENTS', 'STAFF', 'ENROLLMENT', 'FINANCIAL')),
  format TEXT NOT NULL CHECK(format IN ('CSV', 'JSON', 'XML')),
  record_count INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  exported_by INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('COMPLETED', 'FAILED')),
  error_message TEXT,
  exported_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (exported_by) REFERENCES user(id)
);

CREATE INDEX IF NOT EXISTS idx_nemis_export_type ON nemis_export(export_type);
CREATE INDEX IF NOT EXISTS idx_nemis_export_date ON nemis_export(exported_at);
CREATE INDEX IF NOT EXISTS idx_nemis_export_status ON nemis_export(status);

-- ============================================================================
-- ACADEMIC TERM TABLE (if not exists - needed for proration)
-- ============================================================================

CREATE TABLE IF NOT EXISTS academic_term (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  term_name TEXT NOT NULL,
  term_number INTEGER NOT NULL CHECK(term_number IN (1, 2, 3)),
  academic_year TEXT NOT NULL,
  term_start TEXT NOT NULL,
  term_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'UPCOMING' CHECK(status IN ('UPCOMING', 'ACTIVE', 'COMPLETED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(term_number, academic_year)
);

CREATE INDEX IF NOT EXISTS idx_academic_term_year ON academic_term(academic_year);
CREATE INDEX IF NOT EXISTS idx_academic_term_status ON academic_term(status);

-- ============================================================================
-- STUDENT TABLE ENHANCEMENTS (if columns don't exist)
-- ============================================================================

-- Add NEMIS UPI column if it doesn't exist
-- Note: SQLite doesn't have IF NOT EXISTS for columns, so this might fail if already exists
-- In production, use conditional migration checking

-- ALTER TABLE student ADD COLUMN nemis_upi TEXT UNIQUE;
-- ALTER TABLE student ADD COLUMN special_needs TEXT;
-- ALTER TABLE student ADD COLUMN county TEXT;
-- ALTER TABLE student ADD COLUMN sub_county TEXT;

-- ============================================================================
-- USER TABLE ENHANCEMENTS (for NEMIS staff data)
-- ============================================================================

-- ALTER TABLE user ADD COLUMN tsc_number TEXT UNIQUE;
-- ALTER TABLE user ADD COLUMN qualification TEXT;
-- ALTER TABLE user ADD COLUMN subject_taught TEXT;
-- ALTER TABLE user ADD COLUMN employment_date TEXT;

-- ============================================================================
-- DATA INTEGRITY VIEWS
-- ============================================================================

-- View: Student credit balances
CREATE VIEW IF NOT EXISTS v_student_credit_balance AS
SELECT 
  student_id,
  SUM(CASE 
    WHEN transaction_type = 'CREDIT_RECEIVED' THEN amount
    WHEN transaction_type = 'CREDIT_APPLIED' THEN -amount
    WHEN transaction_type = 'CREDIT_REFUNDED' THEN -amount
    ELSE 0
  END) as credit_balance,
  COUNT(*) as transaction_count,
  MAX(created_at) as last_transaction_date
FROM credit_transaction
GROUP BY student_id;

-- View: Active scholarships summary
CREATE VIEW IF NOT EXISTS v_scholarship_summary AS
SELECT 
  s.*,
  (s.amount * s.max_beneficiaries) as total_budget,
  (s.amount * s.max_beneficiaries - s.total_allocated) as remaining_budget,
  ROUND((s.current_beneficiaries * 100.0 / s.max_beneficiaries), 2) as utilization_percentage
FROM scholarship s
WHERE s.status = 'ACTIVE';

-- View: Student scholarship utilization
CREATE VIEW IF NOT EXISTS v_student_scholarship_utilization AS
SELECT 
  ss.student_id,
  st.full_name as student_name,
  st.admission_number,
  COUNT(DISTINCT ss.scholarship_id) as scholarships_count,
  SUM(ss.amount_allocated) as total_allocated,
  SUM(ss.amount_utilized) as total_utilized,
  SUM(ss.amount_allocated - ss.amount_utilized) as total_balance
FROM student_scholarship ss
LEFT JOIN student st ON ss.student_id = st.id
WHERE ss.status = 'ACTIVE'
GROUP BY ss.student_id, st.full_name, st.admission_number;

-- ============================================================================
-- TRIGGERS FOR DATA INTEGRITY
-- ============================================================================

-- Auto-update scholarship utilization status when fully used
CREATE TRIGGER IF NOT EXISTS trg_scholarship_utilization_status
AFTER UPDATE OF amount_utilized ON student_scholarship
FOR EACH ROW
WHEN NEW.amount_utilized >= NEW.amount_allocated AND NEW.status = 'ACTIVE'
BEGIN
  UPDATE student_scholarship
  SET status = 'FULLY_UTILIZED',
      updated_at = datetime('now')
  WHERE id = NEW.id;
END;

-- Auto-expire scholarships past expiry date
CREATE TRIGGER IF NOT EXISTS trg_scholarship_expiry
AFTER UPDATE ON student_scholarship
FOR EACH ROW
WHEN date('now') > NEW.expiry_date AND NEW.status = 'ACTIVE'
BEGIN
  UPDATE student_scholarship
  SET status = 'EXPIRED',
      updated_at = datetime('now')
  WHERE id = NEW.id;
END;

-- Update scholarship totals when allocation changes
CREATE TRIGGER IF NOT EXISTS trg_update_scholarship_totals
AFTER INSERT ON student_scholarship
FOR EACH ROW
BEGIN
  UPDATE scholarship
  SET current_beneficiaries = current_beneficiaries + 1,
      total_allocated = total_allocated + NEW.amount_allocated,
      updated_at = datetime('now')
  WHERE id = NEW.scholarship_id;
END;

-- ============================================================================
-- SAMPLE DATA FOR TESTING (Optional)
-- ============================================================================

-- Insert default academic terms if table is empty
INSERT OR IGNORE INTO academic_term (term_name, term_number, academic_year, term_start, term_end, status)
VALUES 
  ('Term 1 2026', 1, '2026', '2026-01-06', '2026-04-03', 'ACTIVE'),
  ('Term 2 2026', 2, '2026', '2026-05-05', '2026-08-01', 'UPCOMING'),
  ('Term 3 2026', 3, '2026', '2026-09-07', '2026-11-20', 'UPCOMING');

-- ============================================================================
-- MIGRATION VERIFICATION QUERIES
-- ============================================================================

-- Verify all Phase 3 tables exist
-- SELECT name FROM sqlite_master WHERE type='table' AND name IN (
--   'credit_transaction',
--   'pro_ration_log',
--   'scholarship',
--   'student_scholarship',
--   'nemis_export',
--   'academic_term'
-- );

-- Verify all indexes exist
-- SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%';

-- Verify all views exist
-- SELECT name FROM sqlite_master WHERE type='view' AND name LIKE 'v_%';

-- Verify all triggers exist
-- SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_%';

-- ============================================================================
-- END OF PHASE 3 MIGRATION
-- ============================================================================
