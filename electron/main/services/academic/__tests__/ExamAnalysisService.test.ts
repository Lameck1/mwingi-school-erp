import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db
}))

import { ExamAnalysisService } from '../ExamAnalysisService'

describe('ExamAnalysisService enrollment-aware filtering', () => {
  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
    CREATE TABLE IF NOT EXISTS fee_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT, category_name TEXT NOT NULL UNIQUE,
      description TEXT, is_active BOOLEAN DEFAULT 1, priority INTEGER DEFAULT 99,
      gl_account_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS invoice_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL,
      fee_category_id INTEGER NOT NULL, description TEXT NOT NULL, amount INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS receipt (
      id INTEGER PRIMARY KEY AUTOINCREMENT, receipt_number TEXT NOT NULL UNIQUE,
      transaction_id INTEGER NOT NULL UNIQUE, receipt_date DATE NOT NULL,
      student_id INTEGER NOT NULL, amount INTEGER NOT NULL, amount_in_words TEXT,
      payment_method TEXT NOT NULL, payment_reference TEXT, printed_count INTEGER DEFAULT 0,
      created_by_user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
          CREATE TABLE IF NOT EXISTS gl_account (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_code TEXT NOT NULL UNIQUE,
            account_name TEXT NOT NULL,
            account_type TEXT NOT NULL,
            normal_balance TEXT NOT NULL,
            is_active BOOLEAN DEFAULT 1
          );
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1100', 'Accounts Receivable', 'ASSET', 'DEBIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('2020', 'Student Credit Balance', 'LIABILITY', 'CREDIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1010', 'Cash', 'ASSET', 'DEBIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1020', 'Bank', 'ASSET', 'DEBIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('4010', 'Tuition Revenue', 'REVENUE', 'CREDIT');
          
          CREATE TABLE IF NOT EXISTS journal_entry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_ref TEXT NOT NULL UNIQUE,
            entry_date DATE NOT NULL,
            entry_type TEXT NOT NULL,
            description TEXT NOT NULL,
            student_id INTEGER,
            staff_id INTEGER,
            term_id INTEGER,
            is_posted BOOLEAN DEFAULT 0,
            posted_by_user_id INTEGER,
            posted_at DATETIME,
            is_voided BOOLEAN DEFAULT 0,
            voided_reason TEXT,
            voided_by_user_id INTEGER,
            voided_at DATETIME,
            requires_approval BOOLEAN DEFAULT 0,
            approval_status TEXT DEFAULT 'PENDING',
            approved_by_user_id INTEGER,
            approved_at DATETIME,
            created_by_user_id INTEGER NOT NULL,
            source_ledger_txn_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          CREATE TABLE IF NOT EXISTS journal_entry_line (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            journal_entry_id INTEGER NOT NULL,
            line_number INTEGER NOT NULL,
            gl_account_id INTEGER NOT NULL,
            debit_amount INTEGER DEFAULT 0,
            credit_amount INTEGER DEFAULT 0,
            description TEXT
          );
          CREATE TABLE IF NOT EXISTS approval_rule (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rule_name TEXT NOT NULL UNIQUE,
            description TEXT,
            transaction_type TEXT NOT NULL,
            min_amount INTEGER,
            max_amount INTEGER,
            days_since_transaction INTEGER,
            required_role_id INTEGER,
            is_active BOOLEAN DEFAULT 1,
            created_by_user_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

      CREATE TABLE student (
        id INTEGER PRIMARY KEY,
        admission_number TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL
      );

      CREATE TABLE enrollment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        stream_id INTEGER NOT NULL,
        status TEXT NOT NULL
      );

      CREATE TABLE exam (
        id INTEGER PRIMARY KEY,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL
      );

      CREATE TABLE subject (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      );

      CREATE TABLE exam_result (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        subject_id INTEGER NOT NULL,
        score REAL NOT NULL
      );

      CREATE TABLE grading_scale (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        curriculum TEXT NOT NULL,
        grade TEXT NOT NULL,
        remarks TEXT NOT NULL,
        min_score REAL NOT NULL,
        max_score REAL NOT NULL
      );

      INSERT INTO grading_scale (curriculum, grade, remarks, min_score, max_score)
      VALUES ('8-4-4', 'A', 'Excellent', 80, 100), ('8-4-4', 'B', 'Good', 60, 79), ('8-4-4', 'C', 'Fair', 0, 59);

      INSERT INTO subject (id, name) VALUES (1, 'Mathematics');
      INSERT INTO exam (id, academic_year_id, term_id) VALUES (10, 2026, 1), (11, 2026, 2);

      INSERT INTO student (id, admission_number, first_name, last_name)
      VALUES
        (1, 'ADM/001', 'Grace', 'Mutua'),
        (2, 'ADM/002', 'Sarah', 'Ochieng');

      INSERT INTO enrollment (student_id, academic_year_id, term_id, stream_id, status)
      VALUES
        (1, 2026, 2, 1, 'ACTIVE'),
        (2, 2026, 2, 2, 'ACTIVE');

      INSERT INTO exam_result (exam_id, student_id, subject_id, score)
      VALUES
        (11, 1, 1, 80),
        (11, 2, 1, 40),
        (10, 1, 1, 70);
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('filters subject analysis by stream using enrollment records', async () => {
    const service = new ExamAnalysisService()
    const analysis = await service.getSubjectAnalysis(11, 1, 1)

    expect(analysis.student_count).toBe(1)
    expect(analysis.mean_score).toBe(80)
    expect(analysis.subject_name).toBe('Mathematics')
  })

  it('builds student analysis name from first and last name columns', async () => {
    const service = new ExamAnalysisService()
    const analysis = await service.getStudentPerformance(1, 11)

    expect(analysis.student_name).toBe('Grace Mutua')
    expect(analysis.admission_number).toBe('ADM/001')
  })

  it('scopes analyzeAllSubjects to requested stream enrollment', async () => {
    const service = new ExamAnalysisService()
    const analyses = await service.analyzeAllSubjects(11, 1)

    expect(analyses).toHaveLength(1)
    expect(analyses[0]?.student_count).toBe(1)
    expect(analyses[0]?.mean_score).toBe(80)
  })
})
