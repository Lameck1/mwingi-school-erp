import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db
}))

import { PerformanceAnalysisService } from '../PerformanceAnalysisService'

describe('PerformanceAnalysisService schema-safe analytics', () => {
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
        last_name TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
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

      CREATE TABLE report_card_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        mean_score REAL NOT NULL
      );

      CREATE TABLE exam_result (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        subject_id INTEGER NOT NULL,
        score REAL NOT NULL
      );

      CREATE TABLE term (
        id INTEGER PRIMARY KEY,
        term_name TEXT NOT NULL,
        term_number INTEGER NOT NULL
      );

      INSERT INTO term (id, term_name, term_number) VALUES (1, 'Term 1', 1), (2, 'Term 2', 2);
      INSERT INTO exam (id, academic_year_id, term_id) VALUES (101, 2026, 1), (102, 2026, 2);

      INSERT INTO student (id, admission_number, first_name, last_name, is_active)
      VALUES
        (1, 'ADM/001', 'Grace', 'Mutua', 1),
        (2, 'ADM/002', 'Sarah', 'Ochieng', 1);

      INSERT INTO enrollment (student_id, academic_year_id, term_id, stream_id, status)
      VALUES
        (1, 2026, 2, 1, 'ACTIVE'),
        (2, 2026, 2, 2, 'ACTIVE');

      INSERT INTO report_card_summary (exam_id, student_id, mean_score)
      VALUES
        (101, 1, 50),
        (101, 2, 50),
        (102, 1, 72),
        (102, 2, 55);

      INSERT INTO exam_result (exam_id, student_id, subject_id, score)
      VALUES
        (102, 1, 1, 50),
        (102, 1, 2, 55),
        (102, 2, 1, 65),
        (102, 2, 2, 60),
        (101, 1, 1, 45);
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('computes most-improved students with enrollment-based stream filtering', async () => {
    const service = new PerformanceAnalysisService()
    const result = await service.getMostImprovedStudents({
      academicYearId: 2026,
      currentTermId: 2,
      comparisonTermId: 1,
      streamId: 1,
      minimumImprovement: 1
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.student_name).toBe('Grace Mutua')
    expect(result[0]?.improvement_points).toBeGreaterThan(0)
  })

  it('returns struggling students with valid stream filtering and having clause', async () => {
    const service = new PerformanceAnalysisService()
    const result = await service.getStrugglingStudents(2026, 2, 60, 1)

    expect(result).toHaveLength(1)
    expect(result[0]?.student_name).toBe('Grace Mutua')
    expect(result[0]?.failing_subjects).toBe(2)
  })

  it('builds term trends using term_name column', async () => {
    const service = new PerformanceAnalysisService()
    const trends = await service.getPerformanceTrends(1, 2026, 2)

    expect(trends.length).toBeGreaterThan(0)
    expect(trends[0]?.term_name).toBe('Term 2')
  })
})
