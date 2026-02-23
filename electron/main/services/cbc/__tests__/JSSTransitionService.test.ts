import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db
}))

import { JSSTransitionService } from '../JSSTransitionService'

describe('JSSTransitionService outstanding balance normalization', () => {
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

      CREATE TABLE jss_fee_structure (
        id INTEGER PRIMARY KEY,
        grade INTEGER NOT NULL,
        fiscal_year INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE student (
        id INTEGER PRIMARY KEY,
        admission_number TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        student_type TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE stream (
        id INTEGER PRIMARY KEY,
        level_order INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE enrollment (
        id INTEGER PRIMARY KEY,
        student_id INTEGER NOT NULL,
        stream_id INTEGER NOT NULL,
        student_type TEXT NOT NULL,
        status TEXT NOT NULL
      );

      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY,
        student_id INTEGER NOT NULL,
        total_amount REAL,
        amount_due REAL,
        amount REAL,
        amount_paid REAL,
        status TEXT
      );
    `)

    db.exec(`
      INSERT INTO jss_fee_structure (id, grade, fiscal_year, is_active)
      VALUES (1, 7, 2026, 1);

      INSERT INTO stream (id, level_order, is_active)
      VALUES (100, 6, 1);

      INSERT INTO student (id, admission_number, first_name, last_name, student_type, is_active)
      VALUES
        (10, 'ADM-10', 'Grace', 'Mutua', 'DAY_SCHOLAR', 1),
        (11, 'ADM-11', 'Sarah', 'Ochieng', 'BOARDER', 1);

      INSERT INTO enrollment (id, student_id, stream_id, student_type, status)
      VALUES
        (1, 10, 100, 'DAY_SCHOLAR', 'ACTIVE'),
        (2, 11, 100, 'BOARDER', 'ACTIVE');

      INSERT INTO fee_invoice (id, student_id, total_amount, amount_due, amount, amount_paid, status)
      VALUES
        (1, 10, 0, 17000, 17000, 0, 'partial'),
        (2, 10, 7000, 7000, 7000, 8500, 'PARTIAL'),
        (3, 10, 9000, 9000, 9000, 0, 'cancelled'),
        (4, 11, NULL, NULL, 12000, 2000, 'OUTSTANDING');
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('calculates transition balances using normalized invoice amounts and status filtering', () => {
    const service = new JSSTransitionService()
    const students = service.getEligibleStudentsForTransition(6, 2026)

    expect(students).toHaveLength(2)

    const grace = students.find((student) => student.student_id === 10)
    const sarah = students.find((student) => student.student_id === 11)

    expect(grace?.outstanding_balance_cents).toBe(15500)
    expect(sarah?.outstanding_balance_cents).toBe(10000)
  })
})
