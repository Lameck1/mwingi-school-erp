import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db
}))

import { CBCStrandService } from '../CBCStrandService'

describe('CBCStrandService', () => {
  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
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

      CREATE TABLE cbc_strand (
        id INTEGER PRIMARY KEY,
        code TEXT NOT NULL,
        name TEXT NOT NULL
      );
      CREATE TABLE fee_category_strand (
        fee_category_id INTEGER NOT NULL,
        cbc_strand_id INTEGER NOT NULL
      );
      CREATE TABLE invoice_item (
        id INTEGER PRIMARY KEY,
        invoice_id INTEGER NOT NULL,
        fee_category_id INTEGER NOT NULL,
        amount INTEGER NOT NULL
      );
      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY,
        student_id INTEGER NOT NULL,
        term_id INTEGER,
        invoice_date TEXT NOT NULL
      );
      CREATE TABLE term (
        id INTEGER PRIMARY KEY,
        term_number INTEGER NOT NULL
      );
    `)

    db.prepare(`INSERT INTO cbc_strand (id, code, name) VALUES (1, 'ART', 'Arts')`).run()
    db.prepare(`INSERT INTO term (id, term_number) VALUES (11, 1)`).run()
    db.prepare(`INSERT INTO fee_category_strand (fee_category_id, cbc_strand_id) VALUES (5, 1)`).run()
    db.prepare(`INSERT INTO fee_invoice (id, student_id, term_id, invoice_date) VALUES (8, 101, 11, '2026-02-10')`).run()
    db.prepare(`INSERT INTO invoice_item (invoice_id, fee_category_id, amount) VALUES (8, 5, 4000)`).run()
  })

  afterEach(() => {
    db.close()
  })

  it('calculates strand revenue without SQL alias errors', () => {
    const service = new CBCStrandService()
    const revenue = service.getStrandRevenue(2026, 1)

    expect(revenue).toHaveLength(1)
    expect(revenue[0].strand_name).toBe('Arts')
    expect(revenue[0].total_fees_cents).toBe(4000)
    expect(revenue[0].student_count).toBe(1)
  })
})
