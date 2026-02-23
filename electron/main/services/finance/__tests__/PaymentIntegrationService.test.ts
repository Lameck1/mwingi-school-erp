import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PaymentIntegrationService } from '../PaymentIntegrationService'

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

describe('PaymentIntegrationService', () => {
  let db: Database.Database
  let service: PaymentIntegrationService

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
        credit_balance INTEGER DEFAULT 0
      );

      CREATE TABLE transaction_category (
        id INTEGER PRIMARY KEY,
        category_name TEXT NOT NULL,
        category_type TEXT
      );

      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY,
        student_id INTEGER NOT NULL,
        total_amount INTEGER,
        amount INTEGER,
        amount_due INTEGER,
        amount_paid INTEGER DEFAULT 0,
        status TEXT,
        invoice_date TEXT,
        due_date TEXT,
        created_at TEXT
      );

      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_ref TEXT NOT NULL UNIQUE,
        transaction_date TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        category_id INTEGER,
        amount INTEGER NOT NULL,
        debit_credit TEXT,
        student_id INTEGER,
        payment_method TEXT,
        payment_reference TEXT,
        description TEXT,
        term_id INTEGER,
        recorded_by_user_id INTEGER,
        invoice_id INTEGER,
        journal_entry_id INTEGER
      );

      CREATE TABLE receipt (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_number TEXT NOT NULL UNIQUE,
        transaction_id INTEGER NOT NULL,
        receipt_date TEXT NOT NULL,
        student_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        amount_in_words TEXT,
        payment_method TEXT,
        payment_reference TEXT,
        created_by_user_id INTEGER
      );

      INSERT INTO student (id, credit_balance) VALUES (1, 0);
      INSERT INTO transaction_category (id, category_name, category_type) VALUES (1, 'School Fees', 'INCOME');
      INSERT INTO fee_invoice (
        id, student_id, total_amount, amount, amount_due, amount_paid, status, invoice_date, due_date, created_at
      ) VALUES (
        1, 1, 0, 7000, 7000, 0, 'outstanding', '2026-02-01', '2026-02-20', '2026-02-01T08:00:00.000Z'
      );
    `)

    service = new PaymentIntegrationService(db)
  })

  afterEach(() => {
    db.close()
  })

  it('allocates payment to normalized outstanding invoices and only credits the remainder', async () => {
    const result = await service.recordPaymentDualSystem(
      {
        student_id: 1,
        amount: 8500,
        payment_method: 'CREDIT_BALANCE',
        transaction_date: '2026-02-16',
        payment_reference: 'CREDIT-BAL-001'
      },
      9
    )

    expect(result.success).toBe(true)

    const invoice = db.prepare('SELECT amount_paid, status FROM fee_invoice WHERE id = 1').get() as {
      amount_paid: number
      status: string
    }
    expect(invoice.amount_paid).toBe(7000)
    expect(invoice.status).toBe('PAID')

    const student = db.prepare('SELECT credit_balance FROM student WHERE id = 1').get() as { credit_balance: number }
    expect(student.credit_balance).toBe(1500)

    const ledger = db.prepare('SELECT amount, transaction_type FROM ledger_transaction WHERE student_id = 1').get() as {
      amount: number
      transaction_type: string
    }
    expect(ledger.amount).toBe(8500)
    expect(ledger.transaction_type).toBe('FEE_PAYMENT')
  })
})

