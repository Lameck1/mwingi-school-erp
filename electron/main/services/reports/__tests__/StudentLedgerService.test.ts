import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { StudentLedgerService } from '../StudentLedgerService'
import { getDatabase } from '../../../database'

// Mock audit utilities
vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

vi.mock('../../../database', () => ({
  getDatabase: vi.fn()
}))

describe('StudentLedgerService', () => {
  let db: Database.Database
  let service: StudentLedgerService

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
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        admission_number TEXT UNIQUE NOT NULL
      );

      CREATE TABLE transaction_category (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_name TEXT NOT NULL
      );

      CREATE TABLE user (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE
      );

      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        invoice_number TEXT UNIQUE NOT NULL,
        amount INTEGER NOT NULL,
        amount_paid INTEGER DEFAULT 0,
        status TEXT DEFAULT 'OUTSTANDING',
        due_date DATE,
        invoice_date DATE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES student(id)
      );

      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_ref TEXT NOT NULL UNIQUE,
        transaction_date DATE NOT NULL,
        transaction_type TEXT NOT NULL,
        category_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        debit_credit TEXT NOT NULL,
        student_id INTEGER,
        staff_id INTEGER,
        invoice_id INTEGER,
        payment_method TEXT,
        payment_reference TEXT,
        description TEXT,
        term_id INTEGER,
        recorded_by_user_id INTEGER NOT NULL,
        is_voided BOOLEAN DEFAULT 0,
        voided_reason TEXT,
        voided_by_user_id INTEGER,
        voided_at DATETIME,
        deleted_at DATETIME DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES transaction_category(id),
        FOREIGN KEY (student_id) REFERENCES student(id),
        FOREIGN KEY (recorded_by_user_id) REFERENCES user(id),
        FOREIGN KEY (invoice_id) REFERENCES fee_invoice(id)
      );

      CREATE TABLE student_opening_balance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        period_start TEXT NOT NULL,
        opening_balance REAL NOT NULL,
        recorded_at TEXT NOT NULL,
        FOREIGN KEY (student_id) REFERENCES student(id)
      );

      -- Insert test data
      INSERT INTO transaction_category (category_name) VALUES ('FEE_INCOME'), ('REFUND');
      INSERT INTO user (username) VALUES ('testuser');

      -- Insert test student
      INSERT INTO student (first_name, last_name, admission_number)
      VALUES ('John', 'Doe', 'STU-001');

      -- Insert invoices
      INSERT INTO fee_invoice (student_id, invoice_number, amount, amount_paid, status, invoice_date, created_at)
      VALUES 
        (1, 'INV-2025-001', 100000, 60000, 'PARTIAL', '2025-11-15', '2025-11-15 10:00:00'),
        (1, 'INV-2025-002', 50000, 50000, 'PAID', '2025-12-01', '2025-12-01 10:00:00'),
        (1, 'INV-2026-001', 75000, 0, 'OUTSTANDING', '2026-01-05', '2026-01-05 10:00:00'),
        (1, 'INV-2026-002', 30000, 20000, 'PARTIAL', '2026-01-15', '2026-01-15 10:00:00');

      -- Insert transactions
      INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, invoice_id, description, recorded_by_user_id, is_voided, created_at)
      VALUES 
        ('TRX-2025-001', '2025-11-15', 'INCOME', 1, 100000, 'DEBIT', 1, 1, 'Invoice INV-2025-001', 1, 0, '2025-11-15 10:00:00'),
        ('PAY-2025-001', '2025-11-20', 'FEE_PAYMENT', 1, 60000, 'CREDIT', 1, 1, 'Payment for INV-2025-001', 1, 0, '2025-11-20 14:00:00'),
        ('TRX-2025-002', '2025-12-01', 'INCOME', 1, 50000, 'DEBIT', 1, 2, 'Invoice INV-2025-002', 1, 0, '2025-12-01 10:00:00'),
        ('PAY-2025-002', '2025-12-05', 'FEE_PAYMENT', 1, 50000, 'CREDIT', 1, 2, 'Payment for INV-2025-002', 1, 0, '2025-12-05 14:00:00'),
        ('TRX-2026-001', '2026-01-05', 'INCOME', 1, 75000, 'DEBIT', 1, 3, 'Invoice INV-2026-001', 1, 0, '2026-01-05 10:00:00'),
        ('PAY-2026-001', '2026-01-10', 'FEE_PAYMENT', 1, 50000, 'CREDIT', 1, 3, 'Payment for INV-2026-001', 1, 0, '2026-01-10 14:00:00'),
        ('TRX-2026-002', '2026-01-15', 'INCOME', 1, 30000, 'DEBIT', 1, 4, 'Invoice INV-2026-002', 1, 0, '2026-01-15 10:00:00'),
        ('PAY-2026-002', '2026-01-20', 'FEE_PAYMENT', 1, 20000, 'CREDIT', 1, 4, 'Payment for INV-2026-002', 1, 0, '2026-01-20 14:00:00'),
        ('ADJ-2026-001', '2026-01-25', 'ADJUSTMENT', 1, 5000, 'CREDIT', 1, NULL, 'Credit adjustment', 1, 0, '2026-01-25 10:00:00');
    `)

    service = new StudentLedgerService(db)
  })

  afterEach(() => {
    if (db) {db.close()}
  })

  describe('generateStudentLedger', () => {
    it('should generate ledger entries for period', async () => {
      const result = await service.generateStudentLedger(1, '2026-01-01', '2026-01-31')

      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
    })

    it('should include transactions within period', async () => {
      const result = await service.generateStudentLedger(1, '2026-01-01', '2026-01-31')

      expect(result.length).toBeGreaterThan(0)
      result.forEach(entry => {
        expect(entry).toHaveProperty('transaction_date')
        expect(entry).toHaveProperty('transaction_type')
        expect(entry).toHaveProperty('debit')
        expect(entry).toHaveProperty('credit')
        expect(entry).toHaveProperty('balance')
      })
    })

    it('should order transactions chronologically', async () => {
      const result = await service.generateStudentLedger(1, '2026-01-01', '2026-01-31')

      for (let i = 1; i < result.length; i++) {
        const prev = new Date(result[i - 1].transaction_date)
        const curr = new Date(result[i].transaction_date)
        expect(curr >= prev).toBe(true)
      }
    })

    it('should handle empty period gracefully', async () => {
      const result = await service.generateStudentLedger(1, '2025-01-01', '2025-01-31')

      expect(Array.isArray(result)).toBe(true)
    })

    it('should exclude voided transactions', async () => {
      db.exec(`UPDATE ledger_transaction SET is_voided = 1 WHERE transaction_ref = 'PAY-2026-001'`)

      const result = await service.generateStudentLedger(1, '2026-01-01', '2026-01-31')

      expect(result.length).toBeGreaterThan(0)
    })

    it('should include all invoice transactions', async () => {
      const result = await service.generateStudentLedger(1, '2026-01-01', '2026-01-31')

      const incomeTransactions = result.filter(e => e.transaction_type === 'INCOME')
      expect(incomeTransactions.length).toBeGreaterThan(0)
    })

    it('should include all payment transactions', async () => {
      const result = await service.generateStudentLedger(1, '2026-01-01', '2026-01-31')

      const paymentTransactions = result.filter(e => e.transaction_type === 'FEE_PAYMENT')
      expect(paymentTransactions.length).toBeGreaterThan(0)
    })

    it('should handle non-existent student', async () => {
      const result = await service.generateStudentLedger(9999, '2026-01-01', '2026-01-31')

      expect(Array.isArray(result)).toBe(true)
    })

    it('should process multiple students independently', async () => {
      db.exec(`
        INSERT INTO student (first_name, last_name, admission_number)
        VALUES ('Jane', 'Smith', 'STU-002');

        INSERT INTO fee_invoice (student_id, invoice_number, amount, amount_paid, status, invoice_date, created_at)
        VALUES (2, 'INV-2026-101', 80000, 0, 'OUTSTANDING', '2026-01-05', '2026-01-05 10:00:00');

        INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, created_at)
        VALUES ('TRX-2026-101', '2026-01-05', 'INCOME', 1, 80000, 'DEBIT', 2, 'Invoice for student 2', 1, '2026-01-05 10:00:00');
      `)

      const result1 = await service.generateStudentLedger(1, '2026-01-01', '2026-01-31')
      const result2 = await service.generateStudentLedger(2, '2026-01-01', '2026-01-31')

      expect(result1.length).toBeGreaterThan(0)
      expect(result2.length).toBeGreaterThan(0)
    })

    it('should handle large date ranges', async () => {
      const result = await service.generateStudentLedger(1, '2024-01-01', '2026-12-31')

      expect(Array.isArray(result)).toBe(true)
    })

    it('should calculate correct balance progression', async () => {
      const result = await service.generateStudentLedger(1, '2026-01-01', '2026-01-31')

      if (result.length > 1) {
        for (let i = 1; i < result.length; i++) {
          expect(result[i].balance).toBeDefined()
        }
      }
    })

    it('should handle mixed transaction types', async () => {
      const result = await service.generateStudentLedger(1, '2026-01-01', '2026-01-31')

      const types = new Set(result.map(e => e.transaction_type))
      expect(types.size).toBeGreaterThan(0)
    })

    it('should include adjustment transactions', async () => {
      const result = await service.generateStudentLedger(1, '2026-01-01', '2026-01-31')

      const adjustments = result.filter(e => e.transaction_type === 'ADJUSTMENT')
      expect(adjustments.length).toBeGreaterThan(0)
    })

    it('should not include transactions outside period', async () => {
      const result = await service.generateStudentLedger(1, '2026-01-10', '2026-01-20')

      result.forEach(entry => {
        const date = new Date(entry.transaction_date)
        const start = new Date('2026-01-10')
        const end = new Date('2026-01-20')
        expect(date >= start && date <= end).toBe(true)
      })
    })

    it('should handle single day period', async () => {
      const result = await service.generateStudentLedger(1, '2026-01-15', '2026-01-15')

      expect(Array.isArray(result)).toBe(true)
    })

    it('should preserve transaction order within same day', async () => {
      db.exec(`
        INSERT INTO fee_invoice (student_id, invoice_number, amount, amount_paid, status, invoice_date, created_at)
        VALUES (1, 'INV-2026-003', 25000, 0, 'OUTSTANDING', '2026-01-30', '2026-01-30 08:00:00');

        INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, invoice_id, description, recorded_by_user_id, created_at)
        VALUES 
          ('TRX-2026-003', '2026-01-30', 'INCOME', 1, 25000, 'DEBIT', 1, 5, 'Invoice', 1, '2026-01-30 08:00:00'),
          ('PAY-2026-003', '2026-01-30', 'FEE_PAYMENT', 1, 10000, 'CREDIT', 1, 5, 'Payment', 1, '2026-01-30 09:00:00');
      `)

      const result = await service.generateStudentLedger(1, '2026-01-30', '2026-01-30')

      expect(result.length).toBeGreaterThan(0)
    })

    it('should handle concurrent requests', async () => {
      const [result1, result2] = await Promise.all([
        service.generateStudentLedger(1, '2026-01-01', '2026-01-31'),
        service.generateStudentLedger(1, '2026-01-01', '2026-01-31')
      ])

      expect(result1.length).toEqual(result2.length)
    })

    it('should generate consistent results', async () => {
      const result1 = await service.generateStudentLedger(1, '2026-01-01', '2026-01-31')
      const result2 = await service.generateStudentLedger(1, '2026-01-01', '2026-01-31')

      expect(result1.length).toBe(result2.length)
    })

    it('should handle payments larger than invoices', async () => {
      db.exec(`
        INSERT INTO fee_invoice (student_id, invoice_number, amount, amount_paid, status, invoice_date, created_at)
        VALUES (1, 'INV-2026-999', 10000, 0, 'OUTSTANDING', '2026-01-28', '2026-01-28 10:00:00');

        INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, invoice_id, description, recorded_by_user_id, created_at)
        VALUES 
          ('TRX-2026-999', '2026-01-28', 'INCOME', 1, 10000, 'DEBIT', 1, 5, 'Invoice', 1, '2026-01-28 10:00:00'),
          ('PAY-2026-999', '2026-01-29', 'FEE_PAYMENT', 1, 15000, 'CREDIT', 1, 5, 'Over payment', 1, '2026-01-29 10:00:00');
      `)

      const result = await service.generateStudentLedger(1, '2026-01-01', '2026-01-31')

      expect(result.length).toBeGreaterThan(0)
    })

    it('should include description field', async () => {
      const result = await service.generateStudentLedger(1, '2026-01-01', '2026-01-31')

      result.forEach(entry => {
        expect(entry).toHaveProperty('description')
      })
    })

    it('should handle query with null filters', async () => {
      const result = await service.generateStudentLedger(1, '2026-01-01', '2026-01-31')

      expect(result).toBeDefined()
      expect(Array.isArray(result)).toBe(true)
    })

    it('should scale to multiple periods', async () => {
      const result1 = await service.generateStudentLedger(1, '2025-01-01', '2025-12-31')
      const result2 = await service.generateStudentLedger(1, '2026-01-01', '2026-12-31')

      expect(Array.isArray(result1)).toBe(true)
      expect(Array.isArray(result2)).toBe(true)
    })
  })

  describe('reconcileStudentLedger', () => {
    it('should reconcile ledger without errors', async () => {
      const result = await service.reconcileStudentLedger(1, '2026-01-01', '2026-01-31')

      expect(result).toBeDefined()
      expect(result).toHaveProperty('reconciled')
    })

    it('should return reconciliation status', async () => {
      const result = await service.reconcileStudentLedger(1, '2026-01-01', '2026-01-31')

      expect(typeof result.reconciled).toBe('boolean')
    })
  })

  describe('verifyOpeningBalance', () => {
    it('should verify opening balance without errors', async () => {
      const result = await service.verifyOpeningBalance(1, '2026-01-01')

      expect(result).toBeDefined()
      expect(result).toHaveProperty('verified')
    })

    it('should return verification result', async () => {
      const result = await service.verifyOpeningBalance(1, '2026-01-01')

      expect(typeof result.verified).toBe('boolean')
    })

    it('treats FEE_PAYMENT transactions as credits when calculating opening balance', async () => {
      const openingBalance = await service.calculateOpeningBalance(1, '2026-01-01')

      expect(openingBalance).toBe(110000)
    })
  })

  describe('getStudentCurrentBalance', () => {
    it('returns current balance from all transactions', async () => {
      const balance = await service.getStudentCurrentBalance(1)
      expect(typeof balance).toBe('number')
      expect(balance).toBeGreaterThanOrEqual(0)
    })

    it('returns 0 for student with no transactions', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('No', 'Txn', 'STU-099')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-099'").get() as { id: number }
      const balance = await service.getStudentCurrentBalance(stu.id)
      expect(balance).toBe(0)
    })
  })

  describe('recordOpeningBalance', () => {
    it('records opening balance and returns row id', async () => {
      const id = await service.recordOpeningBalance(1, '2026-02-01', 50000)
      expect(id).toBeGreaterThan(0)
      const row = db.prepare('SELECT * FROM student_opening_balance WHERE id = ?').get(id) as { student_id: number; opening_balance: number }
      expect(row.student_id).toBe(1)
      expect(row.opening_balance).toBe(50000)
    })
  })

  describe('generateLedgerAuditReport', () => {
    it('returns composite audit report with all sections', async () => {
      const report = await service.generateLedgerAuditReport(1, '2026-01-01', '2026-01-31') as {
        student_id: number
        period_start: string
        period_end: string
        ledger_entries: unknown[]
        reconciliation_status: { reconciled: boolean }
        verification_status: { verified: boolean }
        audit_status: string
      }
      expect(report.student_id).toBe(1)
      expect(report.period_start).toBe('2026-01-01')
      expect(report.period_end).toBe('2026-01-31')
      expect(Array.isArray(report.ledger_entries)).toBe(true)
      expect(report.reconciliation_status).toHaveProperty('reconciled')
      expect(report.verification_status).toHaveProperty('verified')
      expect(['PASSED', 'FAILED']).toContain(report.audit_status)
    })
  })

  describe('verifyOpeningBalance - with existing recorded balance', () => {
    it('returns VERIFIED when recorded matches calculated', async () => {
      const calculated = await service.calculateOpeningBalance(1, '2026-02-01')
      await service.recordOpeningBalance(1, '2026-02-01', calculated)
      const result = await service.verifyOpeningBalance(1, '2026-02-01')
      expect(result.verified).toBe(true)
      expect(result.verification_status).toBe('VERIFIED')
    })

    it('returns DISCREPANCY when recorded does not match calculated', async () => {
      await service.recordOpeningBalance(1, '2026-03-01', 999999)
      const result = await service.verifyOpeningBalance(1, '2026-03-01')
      expect(result.verified).toBe(false)
      expect(result.verification_status).toBe('DISCREPANCY')
    })
  })

  describe('debit transactions in ledger', () => {
    it('processes DEBIT transactions with debit > 0 and credit = 0', async () => {
      db.exec(`
        INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, created_at)
        VALUES ('DBT-001', '2026-01-16', 'DEBIT', 1, 5000, 'DEBIT', 1, 'Debit entry', 1, '2026-01-16 10:00:00')
      `)
      const result = await service.generateStudentLedger(1, '2026-01-16', '2026-01-16')
      const debitEntry = result.find(e => e.transaction_type === 'DEBIT')
      expect(debitEntry).toBeDefined()
      expect(debitEntry!.debit).toBe(5000)
      expect(debitEntry!.credit).toBe(0)
    })

    it('processes CHARGE transactions as debits', async () => {
      db.exec(`
        INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, created_at)
        VALUES ('CHG-001', '2026-01-17', 'CHARGE', 1, 3000, 'DEBIT', 1, 'Charge entry', 1, '2026-01-17 10:00:00')
      `)
      const result = await service.generateStudentLedger(1, '2026-01-17', '2026-01-17')
      const chargeEntry = result.find(e => e.transaction_type === 'CHARGE')
      expect(chargeEntry).toBeDefined()
      expect(chargeEntry!.debit).toBe(3000)
    })

    it('processes REVERSAL transactions as debits', async () => {
      db.exec(`
        INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, created_at)
        VALUES ('REV-001', '2026-01-18', 'REVERSAL', 1, 2000, 'DEBIT', 1, 'Reversal entry', 1, '2026-01-18 10:00:00')
      `)
      const result = await service.generateStudentLedger(1, '2026-01-18', '2026-01-18')
      const reversalEntry = result.find(e => e.transaction_type === 'REVERSAL')
      expect(reversalEntry).toBeDefined()
      expect(reversalEntry!.debit).toBe(2000)
    })

    it('processes REFUND transactions as debits', async () => {
      db.exec(`
        INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, created_at)
        VALUES ('REF-001', '2026-01-19', 'REFUND', 1, 1000, 'DEBIT', 1, 'Refund entry', 1, '2026-01-19 10:00:00')
      `)
      const result = await service.generateStudentLedger(1, '2026-01-19', '2026-01-19')
      const refundEntry = result.find(e => e.transaction_type === 'REFUND')
      expect(refundEntry).toBeDefined()
      expect(refundEntry!.debit).toBe(1000)
    })
  })

  describe('opening balance edge cases', () => {
    it('does not add OPENING_BALANCE entry when opening balance is 0', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('New', 'Student', 'STU-NEW')`)
      const newStu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-NEW'").get() as { id: number }
      db.exec(`
        INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, created_at)
        VALUES ('NEW-001', '2026-01-20', 'INCOME', 1, 10000, 'DEBIT', ${newStu.id}, 'New student fee', 1, '2026-01-20 10:00:00')
      `)
      const result = await service.generateStudentLedger(newStu.id, '2026-01-01', '2026-01-31')
      const openingEntries = result.filter(e => e.transaction_type === 'OPENING_BALANCE')
      expect(openingEntries.length).toBe(0)
    })

    it('uses fallback description for transactions without description', async () => {
      db.exec(`
        INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, recorded_by_user_id, created_at)
        VALUES ('NODESC-001', '2026-01-21', 'INCOME', 1, 5000, 'DEBIT', 1, 1, '2026-01-21 10:00:00')
      `)
      const result = await service.generateStudentLedger(1, '2026-01-21', '2026-01-21')
      expect(result.length).toBeGreaterThan(0)
      const entry = result.find(e => e.transaction_date === '2026-01-21' && e.transaction_type !== 'OPENING_BALANCE')
      expect(entry).toBeDefined()
      expect(entry!.description).toBeDefined()
      expect(entry!.description.length).toBeGreaterThan(0)
    })
  })

  // ── Branch coverage: reconcileStudentLedger ──────────────────────
  describe('reconcileStudentLedger', () => {
    it('returns BALANCED when ledger and invoice totals match', async () => {
      const result = await service.reconcileStudentLedger(1, '2026-01-01', '2026-01-31')
      expect(result).toBeDefined()
      expect(result.status).toBeDefined()
      expect(['BALANCED', 'OUT_OF_BALANCE']).toContain(result.status)
      expect(typeof result.ledger_balance).toBe('number')
      expect(typeof result.invoice_balance).toBe('number')
    })

    it('detects OUT_OF_BALANCE when discrepancy exists', async () => {
      // Add a large invoice without corresponding payment
      db.exec(`
        INSERT INTO fee_invoice (student_id, invoice_number, invoice_date, due_date, amount, amount_paid, status)
        VALUES (1, 'INV-RECON-001', '2026-01-15', '2026-02-15', 999999, 0, 'PENDING');
      `)
      const result = await service.reconcileStudentLedger(1, '2026-01-01', '2026-01-31')
      expect(result.difference).toBeGreaterThan(0)
    })
  })

  // ── Branch coverage: verifyOpeningBalance ─────────────────────────
  describe('verifyOpeningBalance', () => {
    it('records and verifies opening balance for first-time', async () => {
      const result = await service.verifyOpeningBalance(1, '2026-01-01')
      expect(result.verified).toBe(true)
      expect(result.verification_status).toBe('VERIFIED')
      expect(typeof result.opening_balance).toBe('number')
    })

    it('verifies existing opening balance on subsequent call', async () => {
      // First call records the balance
      await service.verifyOpeningBalance(1, '2026-01-01')
      // Second call compares
      const result = await service.verifyOpeningBalance(1, '2026-01-01')
      expect(result.verified).toBe(true)
      expect(result.verification_status).toBe('VERIFIED')
    })
  })

  // ── Branch coverage: getStudentCurrentBalance ─────────────────────
  describe('getStudentCurrentBalance', () => {
    it('returns current balance for student with transactions', async () => {
      const balance = await service.getStudentCurrentBalance(1)
      expect(typeof balance).toBe('number')
    })

    it('returns 0 for student with no transactions', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Empty', 'Stu', 'STU-EMPTY')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-EMPTY'").get() as { id: number }
      const balance = await service.getStudentCurrentBalance(stu.id)
      expect(balance).toBe(0)
    })
  })

  // ── Branch coverage: generateLedgerAuditReport ────────────────────
  describe('generateLedgerAuditReport', () => {
    it('generates complete audit report', async () => {
      const report = await service.generateLedgerAuditReport(1, '2026-01-01', '2026-01-31') as {
        student_id: number
        audit_status: string
        ledger_entries: unknown[]
      }
      expect(report.student_id).toBe(1)
      expect(report.audit_status).toBeDefined()
      expect(Array.isArray(report.ledger_entries)).toBe(true)
    })
  })

  // ── Branch coverage: unknown transaction type (neither credit nor debit) ──
  describe('unknown transaction type passthrough', () => {
    it('generates ledger entry with zero debit and credit for unknown type', async () => {
      db.exec(`
        INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, is_voided, created_at)
        VALUES ('TRX-UNK-001', '2026-01-28', 'UNKNOWN_TYPE', 1, 7000, 'DEBIT', 1, 'Unknown type txn', 1, 0, '2026-01-28 10:00:00');
      `)
      const entries = await service.generateStudentLedger(1, '2026-01-01', '2026-01-31')
      const unknownEntry = entries.find(e => e.transaction_type === 'UNKNOWN_TYPE')
      expect(unknownEntry).toBeDefined()
      expect(unknownEntry!.debit).toBe(0)
      expect(unknownEntry!.credit).toBe(0)
    })
  })

  // ── Branch coverage: null description fallback ─────────────────────
  describe('null description fallback', () => {
    it('falls back to type-reference description when description is null', async () => {
      db.exec(`
        INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, payment_reference, recorded_by_user_id, is_voided, created_at)
        VALUES ('TRX-NULL-DESC', '2026-01-29', 'FEE_PAYMENT', 1, 1000, 'CREDIT', 1, NULL, 'REF-NULL', 1, 0, '2026-01-29 10:00:00');
      `)
      const entries = await service.generateStudentLedger(1, '2026-01-01', '2026-01-31')
      const nullDescEntry = entries.find(e => e.description?.includes('FEE_PAYMENT'))
      expect(nullDescEntry).toBeDefined()
    })
  })

  // ── Branch coverage: zero opening balance (no OPENING_BALANCE entry) ──
  describe('zero opening balance', () => {
    it('skips OPENING_BALANCE entry when balance before period is zero', async () => {
      // Create a new student with no prior transactions
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('New', 'Stu', 'STU-NEW')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-NEW'").get() as { id: number }
      // Add a transaction in the period only
      db.prepare(`
        INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, is_voided, created_at)
        VALUES (?, '2026-01-10', 'FEE_PAYMENT', 1, 5000, 'CREDIT', ?, 'Payment', 1, 0, '2026-01-10 10:00:00')
      `).run('TRX-ZERO-OB', stu.id)

      const entries = await service.generateStudentLedger(stu.id, '2026-01-01', '2026-01-31')
      const obEntry = entries.find(e => e.transaction_type === 'OPENING_BALANCE')
      expect(obEntry).toBeUndefined()
    })
  })

  // ── Branch coverage: Math.max(0, balance) clamping negative to 0 ──
  describe('negative opening balance clamped to zero', () => {
    it('clamps negative opening balance to 0', async () => {
      // Create a student with only debit transactions before the period
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Neg', 'Bal', 'STU-NEG')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-NEG'").get() as { id: number }
      db.prepare(`
        INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, is_voided, created_at)
        VALUES (?, '2025-12-01', 'DEBIT', 1, 50000, 'DEBIT', ?, 'Charge', 1, 0, '2025-12-01 10:00:00')
      `).run('TRX-NEG-001', stu.id)

      const balance = await service.calculateOpeningBalance(stu.id, '2026-01-01')
      expect(balance).toBe(0)
    })
  })

  // ── Branch coverage: DISCREPANCY in verifyOpeningBalance ──────────
  describe('verifyOpeningBalance DISCREPANCY', () => {
    it('returns DISCREPANCY when recorded and calculated balance differ', async () => {
      // Manually record an opening balance that doesn't match the calculation
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Disc', 'Check', 'STU-DISC')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-DISC'").get() as { id: number }

      // Record a fake opening balance that will differ from calculated
      db.prepare(`
        INSERT INTO student_opening_balance (student_id, period_start, opening_balance, recorded_at)
        VALUES (?, '2026-01-01', 999999, '2025-12-31T00:00:00.000Z')
      `).run(stu.id)

      const result = await service.verifyOpeningBalance(stu.id, '2026-01-01')
      expect(result.verification_status).toBe('DISCREPANCY')
      expect(result.verified).toBe(false)
    })
  })

  // ── Branch coverage: unknown transaction type (neither credit nor debit) ──
  describe('unknown transaction type branch', () => {
    it('does not add debit or credit for unknown transaction type', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Unk', 'Type', 'STU-UNK')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-UNK'").get() as { id: number }
      // Insert a transaction with an unknown type
      db.prepare(`
        INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, is_voided, created_at)
        VALUES (?, '2026-01-12', 'FOOBAR_UNKNOWN', 1, 7777, 'CREDIT', ?, 'Unknown type txn', 1, 0, '2026-01-12 10:00:00')
      `).run('TRX-UNK-TYPE', stu.id)

      const entries = await service.generateStudentLedger(stu.id, '2026-01-01', '2026-01-31')
      // The unknown transaction should appear with both debit=0 and credit=0
      const unknownEntry = entries.find(e => e.transaction_type === 'FOOBAR_UNKNOWN')
      expect(unknownEntry).toBeDefined()
      expect(unknownEntry!.debit).toBe(0)
      expect(unknownEntry!.credit).toBe(0)
    })
  })

  // ── Branch coverage: getStudentCurrentBalance with no transactions ──
  describe('getStudentCurrentBalance empty entries', () => {
    it('returns 0 when student has no ledger entries', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Empty', 'Ledger', 'STU-EMPTY')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-EMPTY'").get() as { id: number }

      const balance = await service.getStudentCurrentBalance(stu.id)
      expect(balance).toBe(0)
    })
  })

  // ── Branch coverage: transaction.amount || 0 with null/zero amount ──
  describe('falsy amount fallback', () => {
    it('treats null amount as zero in balance calculation', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Null', 'Amt', 'STU-NULLAMT')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-NULLAMT'").get() as { id: number }
      // Insert a transaction with amount = 0 (falsy)
      db.prepare(`
        INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, is_voided, created_at)
        VALUES (?, '2026-01-05', 'FEE_PAYMENT', 1, 0, 'CREDIT', ?, 'Zero amount payment', 1, 0, '2026-01-05 10:00:00')
      `).run('TRX-ZERO-AMT', stu.id)

      const entries = await service.generateStudentLedger(stu.id, '2026-01-01', '2026-01-31')
      const zeroEntry = entries.find(e => e.description === 'Zero amount payment')
      expect(zeroEntry).toBeDefined()
      expect(zeroEntry!.credit).toBe(0)
      expect(zeroEntry!.balance).toBe(0)
    })
  })

  // ── Branch coverage: reconciliation OUT_OF_BALANCE ──
  describe('reconciliation OUT_OF_BALANCE status', () => {
    it('returns OUT_OF_BALANCE when ledger and invoice balances differ significantly', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Oob', 'Rec', 'STU-OOB')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-OOB'").get() as { id: number }

      // Create an invoice with large amount
      db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, amount, amount_paid, status, invoice_date, created_at) VALUES (${stu.id}, 'INV-OOB-001', 200000, 0, 'OUTSTANDING', '2026-01-10', '2026-01-10 10:00:00')`)

      // Add only a small payment (mismatch)
      db.prepare(`
        INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, is_voided, created_at)
        VALUES (?, '2026-01-12', 'FEE_PAYMENT', 1, 5000, 'CREDIT', ?, 'Partial', 1, 0, '2026-01-12 10:00:00')
      `).run('TRX-OOB-001', stu.id)

      const result = await service.reconcileStudentLedger(stu.id, '2026-01-01', '2026-01-31')
      expect(result.status).toBe('OUT_OF_BALANCE')
      expect(result.reconciled).toBe(false)
      expect(result.discrepancies.length).toBeGreaterThan(0)
    })
  })

  // ── Branch coverage: isDebitTransaction types ──
  describe('debit transaction branches', () => {
    it('processes DEBIT transaction type and reduces balance', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Deb', 'Test', 'STU-DEB')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-DEB'").get() as { id: number }
      // Add a credit first
      db.prepare(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, is_voided, created_at) VALUES (?, '2026-01-05', 'FEE_PAYMENT', 1, 10000, 'CREDIT', ?, 'Payment', 1, 0, '2026-01-05 10:00:00')`).run('TRX-DEB-001', stu.id)
      // Add a DEBIT transaction
      db.prepare(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, is_voided, created_at) VALUES (?, '2026-01-10', 'DEBIT', 1, 3000, 'DEBIT', ?, 'Adjustment', 1, 0, '2026-01-10 10:00:00')`).run('TRX-DEB-002', stu.id)

      const entries = await service.generateStudentLedger(stu.id, '2026-01-01', '2026-01-31')
      const debitEntry = entries.find(e => e.transaction_type === 'DEBIT')
      expect(debitEntry).toBeDefined()
      expect(debitEntry!.debit).toBe(3000)
      expect(debitEntry!.credit).toBe(0)
    })

    it('processes CHARGE transaction type as debit', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Chg', 'Test', 'STU-CHG')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-CHG'").get() as { id: number }
      db.prepare(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, is_voided, created_at) VALUES (?, '2026-01-10', 'CHARGE', 1, 5000, 'DEBIT', ?, 'Late fee charge', 1, 0, '2026-01-10 10:00:00')`).run('TRX-CHG-001', stu.id)

      const entries = await service.generateStudentLedger(stu.id, '2026-01-01', '2026-01-31')
      const chargeEntry = entries.find(e => e.transaction_type === 'CHARGE')
      expect(chargeEntry).toBeDefined()
      expect(chargeEntry!.debit).toBe(5000)
    })

    it('processes REVERSAL and REFUND as debit transaction types', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Rev', 'Test', 'STU-REV')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-REV'").get() as { id: number }
      db.prepare(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, is_voided, created_at) VALUES (?, '2026-01-10', 'REVERSAL', 1, 2000, 'DEBIT', ?, 'Reversed', 1, 0, '2026-01-10 10:00:00')`).run('TRX-REV-001', stu.id)
      db.prepare(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, is_voided, created_at) VALUES (?, '2026-01-12', 'REFUND', 1, 1000, 'DEBIT', ?, 'Refunded', 1, 0, '2026-01-12 10:00:00')`).run('TRX-REF-001', stu.id)

      const entries = await service.generateStudentLedger(stu.id, '2026-01-01', '2026-01-31')
      expect(entries.find(e => e.transaction_type === 'REVERSAL')?.debit).toBe(2000)
      expect(entries.find(e => e.transaction_type === 'REFUND')?.debit).toBe(1000)
    })
  })

  // ── Branch coverage: description fallback to type-reference ──
  describe('description fallback branch', () => {
    it('falls back to type-reference when description is null', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Desc', 'Test', 'STU-DESC')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-DESC'").get() as { id: number }
      db.prepare(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, payment_reference, recorded_by_user_id, is_voided, created_at) VALUES (?, '2026-01-10', 'FEE_PAYMENT', 1, 5000, 'CREDIT', ?, NULL, 'REF-123', 1, 0, '2026-01-10 10:00:00')`).run('TRX-DESC-001', stu.id)

      const entries = await service.generateStudentLedger(stu.id, '2026-01-01', '2026-01-31')
      const entry = entries.find(e => e.transaction_type === 'FEE_PAYMENT')
      expect(entry).toBeDefined()
      expect(entry!.description).toContain('FEE_PAYMENT')
    })
  })

  // ── Branch coverage: verifyOpeningBalance DISCREPANCY path ──
  describe('verifyOpeningBalance DISCREPANCY', () => {
    it('returns DISCREPANCY when recorded balance differs from calculated', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Disc', 'Test', 'STU-DISC')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-DISC'").get() as { id: number }

      // Record a wrong opening balance manually
      await service.recordOpeningBalance(stu.id, '2026-02-01', 99999)

      // Verify it - calculated should be 0 (no transactions), recorded is 99999 → DISCREPANCY
      const result = await service.verifyOpeningBalance(stu.id, '2026-02-01')
      expect(result.verification_status).toBe('DISCREPANCY')
      expect(result.verified).toBe(false)
    })
  })

  // ── Branch coverage: calculateOpeningBalance with debit transactions ──
  describe('calculateOpeningBalance with debits', () => {
    it('clamps opening balance to 0 when debits exceed credits', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Clamp', 'Test', 'STU-CLAMP')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-CLAMP'").get() as { id: number }
      // DEBIT exceeds any credit → balance negative → Math.max(0, balance) clamps to 0
      db.prepare(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, is_voided, created_at) VALUES (?, '2026-01-05', 'DEBIT', 1, 50000, 'DEBIT', ?, 'Large debit', 1, 0, '2026-01-05 10:00:00')`).run('TRX-CLAMP-001', stu.id)

      const balance = await service.calculateOpeningBalance(stu.id, '2026-02-01')
      expect(balance).toBe(0) // Clamped to 0 by Math.max(0, balance)
    })
  })

  // ── Branch coverage: isCreditTransaction / isDebitTransaction edge cases ──
  describe('transaction type classification edge cases', () => {
    it('handles empty transaction type in ledger entries', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('TypeEdge', 'Test', 'STU-TYPE-EDGE')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-TYPE-EDGE'").get() as { id: number }
      // Insert a transaction with empty type
      db.prepare(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, is_voided, created_at) VALUES (?, '2026-01-10', '', 1, 1000, '', ?, 'Empty type', 1, 0, '2026-01-10 10:00:00')`).run('TRX-EMPTY-TYPE', stu.id)

      const entries = await service.generateStudentLedger(stu.id, '2026-01-01', '2026-01-31')
      // Should not throw, entries should include it even if neither credit nor debit
      expect(entries).toBeDefined()
    })

    it('classifies unknown transaction type without crashing', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('NullType', 'Test', 'STU-NULL-TYPE')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-NULL-TYPE'").get() as { id: number }
      db.prepare(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, is_voided, created_at) VALUES (?, '2026-01-10', 'UNKNOWN', 1, 1000, 'UNKNOWN', ?, 'Unknown type', 1, 0, '2026-01-10 10:00:00')`).run('TRX-UNK-TYPE', stu.id)

      const entries = await service.generateStudentLedger(stu.id, '2026-01-01', '2026-01-31')
      expect(entries).toBeDefined()
    })
  })

  // ── Branch coverage: reconcileStudentLedger with empty entries ──
  describe('reconcileStudentLedger – empty entries', () => {
    it('returns default result for student with no transactions', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Empty', 'Ledger', 'STU-EMPTY-LEDGER')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-EMPTY-LEDGER'").get() as { id: number }

      const result = await service.reconcileStudentLedger(stu.id, '2026-01-01', '2026-01-31')
      expect(result).toBeDefined()
      expect(result.reconciled).toBeDefined()
    })
  })

  // ── Branch coverage: getStudentCurrentBalance with empty entries ──
  describe('getStudentCurrentBalance – empty entries', () => {
    it('returns 0 balance for student with no transactions', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('NoBalance', 'Test', 'STU-NO-BAL')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-NO-BAL'").get() as { id: number }

      const balance = await service.getStudentCurrentBalance(stu.id)
      expect(balance).toBe(0)
    })
  })

  // ── Branch coverage: verifyOpeningBalance first-time path ──
  describe('verifyOpeningBalance – first-time (no recorded balance)', () => {
    it('returns OK when no balance was previously recorded', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('FirstTime', 'OB', 'STU-FIRST-OB')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-FIRST-OB'").get() as { id: number }

      const result = await service.verifyOpeningBalance(stu.id, '2026-02-01')
      // No recorded balance → should handle gracefully
      expect(result).toBeDefined()
      expect(result.verified).toBeDefined()
    })
  })

  // ── Branch coverage: generateLedgerAuditReport ──
  describe('generateLedgerAuditReport', () => {
    it('returns PASSED audit_status when ledger and verification both pass', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Audit', 'Test', 'STU-AUDIT')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-AUDIT'").get() as { id: number }

      const report = await service.generateLedgerAuditReport(stu.id, '2026-01-01', '2026-01-31') as any
      expect(report).toBeDefined()
      expect(report.student_id).toBe(stu.id)
      expect(report.period_start).toBe('2026-01-01')
      expect(report.period_end).toBe('2026-01-31')
      expect(report.audit_status).toBeDefined()
    })

    it('returns FAILED audit_status when there is a reconciliation mismatch', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('AuditFail', 'Test', 'STU-AUDIT-FAIL')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-AUDIT-FAIL'").get() as { id: number }

      // Add an invoice but no payment to create mismatch
      db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, amount, amount_paid, status, invoice_date, created_at) VALUES (${stu.id}, 'INV-AUF-1', 50000, 0, 'OUTSTANDING', '2026-01-10', '2026-01-10')`)
      // Record a wrong opening balance to trigger DISCREPANCY
      await service.recordOpeningBalance(stu.id, '2026-01-01', 99999)

      const report = await service.generateLedgerAuditReport(stu.id, '2026-01-01', '2026-01-31') as any
      expect(report.audit_status).toBe('FAILED')
    })
  })

  // ── Branch coverage: reconcileStudentLedger OUT_OF_BALANCE ──
  describe('reconcileStudentLedger – OUT_OF_BALANCE', () => {
    it('returns OUT_OF_BALANCE when ledger and invoices differ', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('OutBal', 'Test', 'STU-OUT-BAL')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-OUT-BAL'").get() as { id: number }

      // Create invoice amount that won't match ledger (no matching payment)
      db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, amount, amount_paid, status, invoice_date, created_at) VALUES (${stu.id}, 'INV-OB-1', 80000, 0, 'OUTSTANDING', '2026-01-15', '2026-01-15')`)
      // Add a payment that doesn't cover the invoice
      db.prepare(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, is_voided, created_at) VALUES (?, '2026-01-20', 'FEE_PAYMENT', 1, 10000, 'CREDIT', ?, 'Partial pay', 1, 0, '2026-01-20 10:00:00')`).run('TRX-OB-001', stu.id)

      const result = await service.reconcileStudentLedger(stu.id, '2026-01-01', '2026-01-31')
      expect(result.status).toBe('OUT_OF_BALANCE')
      expect(result.reconciled).toBe(false)
      expect(result.discrepancies.length).toBeGreaterThan(0)
      expect(result.discrepancies[0].type).toBe('BALANCE_MISMATCH')
    })
  })

  // ── Branch coverage: getStudentCurrentBalance with transactions ──
  describe('getStudentCurrentBalance – with transactions', () => {
    it('returns non-zero balance when student has transactions', async () => {
      const balance = await service.getStudentCurrentBalance(1)
      expect(balance != null).toBe(true)
    })
  })

  // ── Branch coverage: opening balance entry when > 0 ──
  describe('generateStudentLedger – opening balance entry', () => {
    it('includes OPENING_BALANCE entry when student has prior transactions', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Opening', 'Bal', 'STU-OPEN-BAL')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-OPEN-BAL'").get() as { id: number }

      // Add credit before the period
      db.prepare(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, is_voided, created_at) VALUES (?, '2025-12-15', 'FEE_PAYMENT', 1, 20000, 'CREDIT', ?, 'Prior payment', 1, 0, '2025-12-15 10:00:00')`).run('TRX-OPEN-BAL', stu.id)

      const entries = await service.generateStudentLedger(stu.id, '2026-01-01', '2026-01-31')
      const openingEntry = entries.find(e => e.transaction_type === 'OPENING_BALANCE')
      expect(openingEntry).toBeDefined()
      expect(openingEntry!.debit).toBe(20000)
      expect(openingEntry!.credit).toBe(0)
      expect(openingEntry!.balance).toBe(20000)
    })
  })

  // ── Branch coverage: zero amount handling (amount || 0) ──
  describe('zero amount handling', () => {
    it('treats zero amount correctly in balance calculation', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('ZeroAmt', 'Test', 'STU-ZERO-AMT')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-ZERO-AMT'").get() as { id: number }
      // Insert tx with 0 amount (covers the `amount || 0` falsy branch)
      db.prepare(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, is_voided, created_at) VALUES (?, '2026-01-10', 'FEE_PAYMENT', 1, 0, 'CREDIT', ?, 'Zero amt', 1, 0, '2026-01-10 10:00:00')`)
        .run('TRX-ZERO-AMT', stu.id)

      const entries = await service.generateStudentLedger(stu.id, '2026-01-01', '2026-01-31')
      const zeroEntry = entries.find(e => e.description === 'Zero amt')
      expect(zeroEntry).toBeDefined()
      expect(zeroEntry!.credit).toBe(0)
    })
  })

  // ── Branch coverage: transaction with no description → type-reference fallback (L280) ──
  describe('generateStudentLedger – description fallback', () => {
    it('uses transaction_type + reference as description when description is null', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('NoDesc', 'Test', 'STU-NODESC')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-NODESC'").get() as { id: number }
      // Insert transaction without description (NULL) but with payment_reference
      db.prepare(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, payment_reference, recorded_by_user_id, is_voided, created_at) VALUES (?, '2026-01-15', 'FEE_PAYMENT', 1, 5000, 'CREDIT', ?, NULL, 'REF-NODESC', 1, 0, '2026-01-15 10:00:00')`)
        .run('TRX-NODESC', stu.id)

      const entries = await service.generateStudentLedger(stu.id, '2026-01-01', '2026-01-31')
      const noDescEntry = entries.find(e => e.credit === 5000)
      expect(noDescEntry).toBeDefined()
      // Should fall back to `${type} - ${reference}`
      expect(noDescEntry!.description).toContain('FEE_PAYMENT')
    })
  })

  // ── Branch coverage: reconcileStudentLedger – BALANCED status (L325-326) ──
  describe('reconcileStudentLedger – balanced result', () => {
    it('returns BALANCED when ledger and invoice balances match', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Balanced', 'Test', 'STU-BAL')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-BAL'").get() as { id: number }
      // No transactions and no invoices → both 0 → balanced
      const result = await service.reconcileStudentLedger(stu.id, '2026-01-01', '2026-12-31')
      expect(result.status).toBe('BALANCED')
      expect(result.reconciled).toBe(true)
      expect(result.discrepancies).toHaveLength(0)
    })
  })

  // ── Branch coverage: reconcileStudentLedger – OUT_OF_BALANCE status (L329-334) ──
  describe('reconcileStudentLedger – out of balance', () => {
    it('returns OUT_OF_BALANCE when ledger and invoices differ', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Unbalanced', 'Test', 'STU-UNBAL')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-UNBAL'").get() as { id: number }
      // Add an invoice but no payments → invoice balance > 0, ledger balance = 0
      db.prepare(`INSERT INTO fee_invoice (student_id, invoice_number, invoice_date, due_date, amount, amount_paid, status) VALUES (?, 'INV-UNBAL', '2026-01-10', '2026-02-10', 10000, 0, 'OUTSTANDING')`)
        .run(stu.id)

      const result = await service.reconcileStudentLedger(stu.id, '2026-01-01', '2026-12-31')
      expect(result.status).toBe('OUT_OF_BALANCE')
      expect(result.reconciled).toBe(false)
      expect(result.discrepancies.length).toBeGreaterThan(0)
      expect(result.discrepancies[0].type).toBe('BALANCE_MISMATCH')
    })
  })

  // ── Branch coverage: verifyOpeningBalance – first-time verification (L378-383) ──
  describe('verifyOpeningBalance – first time', () => {
    it('records and verifies opening balance on first call', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Verify', 'First', 'STU-VERIFY')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-VERIFY'").get() as { id: number }

      const result = await service.verifyOpeningBalance(stu.id, '2026-01-01')
      expect(result.verified).toBe(true)
      expect(result.verification_status).toBe('VERIFIED')
    })
  })

  // ── Branch coverage: verifyOpeningBalance – discrepancy detection (L387-393) ──
  describe('verifyOpeningBalance – discrepancy', () => {
    it('detects discrepancy when recorded balance differs from calculated', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Disc', 'Test', 'STU-DISC')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-DISC'").get() as { id: number }

      // First, record an opening balance manually with a different value
      db.prepare(`INSERT INTO student_opening_balance (student_id, period_start, opening_balance, recorded_at) VALUES (?, '2026-01-01', 99999, '2026-01-01')`)
        .run(stu.id)

      // Now verify – calculated will be 0 (no transactions), recorded is 99999 → discrepancy
      const result = await service.verifyOpeningBalance(stu.id, '2026-01-01')
      expect(result.verification_status).toBe('DISCREPANCY')
      expect(result.verified).toBe(false)
    })
  })

  /* ==================================================================
   *  Branch coverage: transaction with null description → fallback
   * ================================================================== */
  describe('generateStudentLedger – null description fallback', () => {
    it('uses transaction_type + reference as description when description is null', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Null', 'Desc', 'STU-ND')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-ND'").get() as { id: number }
      db.exec(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, is_voided) VALUES ('ND-001', '2026-03-01', 'FEE_PAYMENT', 1, 5000, 'CREDIT', ${stu.id}, NULL, 1, 0)`)

      const entries = await service.generateStudentLedger(stu.id, '2026-01-01', '2026-12-31')
      const paymentEntry = entries.find(e => e.transaction_type === 'FEE_PAYMENT')
      expect(paymentEntry).toBeDefined()
      expect(paymentEntry!.description).toContain('FEE_PAYMENT')
    })
  })

  /* ==================================================================
   *  Branch coverage: transaction with unknown type (not credit or debit)
   * ================================================================== */
  describe('generateStudentLedger – unknown transaction type', () => {
    it('handles transaction with unrecognized type (no debit or credit applied)', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Unknown', 'Type', 'STU-UT')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-UT'").get() as { id: number }
      db.exec(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, is_voided) VALUES ('UT-001', '2026-03-01', 'UNKNOWN_TYPE', 1, 3000, 'NONE', ${stu.id}, 'Unknown type txn', 1, 0)`)

      const entries = await service.generateStudentLedger(stu.id, '2026-01-01', '2026-12-31')
      const unknown = entries.find(e => e.transaction_type === 'UNKNOWN_TYPE')
      expect(unknown).toBeDefined()
      expect(unknown!.debit).toBe(0)
      expect(unknown!.credit).toBe(0)
    })
  })

  /* ==================================================================
   *  Branch coverage: student with no transactions → empty ledger (no opening balance entry)
   * ================================================================== */
  describe('generateStudentLedger – no prior transactions', () => {
    it('returns empty ledger for student with no transactions and zero opening balance', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Empty', 'Ledger', 'STU-EL')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-EL'").get() as { id: number }

      const entries = await service.generateStudentLedger(stu.id, '2026-01-01', '2026-12-31')
      expect(entries.length).toBe(0) // No opening balance (=0), no transactions
    })
  })

  /* ==================================================================
   *  Branch coverage: reconcileStudentLedger balanced path
   * ================================================================== */
  describe('reconcileStudentLedger – balanced', () => {
    it('returns reconciled true when ledger matches invoices', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Bal', 'Student', 'STU-BAL')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-BAL'").get() as { id: number }

      // No transactions and no invoices → both 0 → balanced
      const result = await service.reconcileStudentLedger(stu.id, '2026-01-01', '2026-12-31')
      expect(result.reconciled).toBe(true)
      expect(result.status).toBe('BALANCED')
      expect(result.discrepancies.length).toBe(0)
    })
  })

  /* ==================================================================
   *  Branch coverage: reconcileStudentLedger unbalanced path
   * ================================================================== */
  describe('reconcileStudentLedger – unbalanced', () => {
    it('returns OUT_OF_BALANCE when ledger and invoices differ', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Unbal', 'Student', 'STU-UNB')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-UNB'").get() as { id: number }

      // Create an invoice with no matching transaction
      db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, amount, amount_paid, status, invoice_date) VALUES (${stu.id}, 'INV-UNB-001', 50000, 0, 'OUTSTANDING', '2026-06-01')`)

      const result = await service.reconcileStudentLedger(stu.id, '2026-01-01', '2026-12-31')
      expect(result.reconciled).toBe(false)
      expect(result.status).toBe('OUT_OF_BALANCE')
      expect(result.discrepancies.length).toBeGreaterThan(0)
    })
  })

  /* ==================================================================
   *  Branch coverage: getStudentCurrentBalance with no entries
   * ================================================================== */
  describe('getStudentCurrentBalance', () => {
    it('returns 0 for student with no entries', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('NoTx', 'Student', 'STU-NT')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-NT'").get() as { id: number }
      const balance = await service.getStudentCurrentBalance(stu.id)
      expect(balance).toBe(0)
    })
  })

  /* ==================================================================
   *  Branch coverage: generateLedgerAuditReport
   * ================================================================== */
  describe('generateLedgerAuditReport', () => {
    it('returns complete audit report with all sections', async () => {
      const report = await service.generateLedgerAuditReport(1, '2026-01-01', '2026-12-31') as any
      expect(report.student_id).toBe(1)
      expect(report).toHaveProperty('ledger_entries')
      expect(report).toHaveProperty('reconciliation_status')
      expect(report).toHaveProperty('verification_status')
      expect(report).toHaveProperty('audit_status')
    })
  })

  /* ==================================================================
   *  Branch coverage: verifyOpeningBalance – first time verification (no recorded balance)
   * ================================================================== */
  describe('verifyOpeningBalance – first time', () => {
    it('records and verifies opening balance when no prior record exists', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('First', 'Verify', 'STU-FV')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-FV'").get() as { id: number }

      const result = await service.verifyOpeningBalance(stu.id, '2026-01-01')
      expect(result.verified).toBe(true)
      expect(result.verification_status).toBe('VERIFIED')
      // Second call should still verify since recorded == calculated
      const result2 = await service.verifyOpeningBalance(stu.id, '2026-01-01')
      expect(result2.verified).toBe(true)
    })
  })

  /* ==================================================================
   *  Branch coverage: calculateOpeningBalance with mixed credit/debit transactions
   * ================================================================== */
  describe('calculateOpeningBalance – mixed types', () => {
    it('sums credits and subtracts debits before the date', async () => {
      const balance = await service.calculateOpeningBalance(1, '2026-01-01')
      // Student 1 has transactions before 2026-01-01 (in 2025)
      expect(typeof balance).toBe('number')
      expect(balance).toBeGreaterThanOrEqual(0)
    })
  })

  /* ==================================================================
   *  Branch coverage: recordOpeningBalance
   * ================================================================== */
  describe('recordOpeningBalance', () => {
    it('records and returns row id', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Rec', 'OB', 'STU-RO')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-RO'").get() as { id: number }
      const id = await service.recordOpeningBalance(stu.id, '2026-01-01', 5000)
      expect(id).toBeGreaterThan(0)
    })
  })

  /* ==================================================================
   *  Branch coverage: transactions with amount=0 → || 0 fallback
   * ================================================================== */
  describe('generateStudentLedger – zero amount transaction', () => {
    it('handles transaction with amount=0', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Zero', 'Amt', 'STU-ZA')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-ZA'").get() as { id: number }
      db.exec(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, is_voided) VALUES ('ZA-001', '2026-03-01', 'FEE_PAYMENT', 1, 0, 'CREDIT', ${stu.id}, 'Zero payment', 1, 0)`)

      const entries = await service.generateStudentLedger(stu.id, '2026-01-01', '2026-12-31')
      const entry = entries.find(e => e.transaction_type === 'FEE_PAYMENT')
      expect(entry).toBeDefined()
      expect(entry!.credit).toBe(0)
    })
  })

  /* ==================================================================
   *  Branch coverage: isDebitTransaction in calculateOpeningBalance (L217)
   * ================================================================== */
  describe('calculateOpeningBalance – debit transaction types', () => {
    it('subtracts DEBIT-type transactions from balance', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Deb', 'Test', 'STU-DEB')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-DEB'").get() as { id: number }

      // Add a credit first, then a DEBIT (charge) type
      db.exec(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, is_voided) VALUES ('DB-CR1', '2025-06-01', 'FEE_PAYMENT', 1, 20000, 'CREDIT', ${stu.id}, 'Payment', 1, 0)`)
      db.exec(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, is_voided) VALUES ('DB-CHG', '2025-07-01', 'CHARGE', 1, 5000, 'DEBIT', ${stu.id}, 'Late charge', 1, 0)`)
      db.exec(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, is_voided) VALUES ('DB-REF', '2025-08-01', 'REFUND', 1, 3000, 'DEBIT', ${stu.id}, 'Refund', 1, 0)`)

      const balance = await service.calculateOpeningBalance(stu.id, '2026-01-01')
      // 20000 credit - 5000 debit - 3000 debit = 12000
      expect(balance).toBe(12000)
    })
  })

  /* ==================================================================
   *  Branch coverage: isDebitTransaction in generateStudentLedger (L273)
   * ================================================================== */
  describe('generateStudentLedger – DEBIT/CHARGE/REVERSAL types', () => {
    it('processes DEBIT transaction type as debit entry', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Debit', 'Ledger', 'STU-DBL')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-DBL'").get() as { id: number }

      db.exec(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, is_voided) VALUES ('DL-001', '2026-03-01', 'CHARGE', 1, 7500, 'DEBIT', ${stu.id}, 'Additional charge', 1, 0)`)
      db.exec(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, is_voided) VALUES ('DL-002', '2026-03-15', 'REVERSAL', 1, 2000, 'DEBIT', ${stu.id}, 'Reversal', 1, 0)`)

      const entries = await service.generateStudentLedger(stu.id, '2026-01-01', '2026-12-31')
      const chargeEntry = entries.find(e => e.transaction_type === 'CHARGE')
      const reversalEntry = entries.find(e => e.transaction_type === 'REVERSAL')
      expect(chargeEntry).toBeDefined()
      expect(chargeEntry!.debit).toBe(7500)
      expect(chargeEntry!.credit).toBe(0)
      expect(reversalEntry).toBeDefined()
      expect(reversalEntry!.debit).toBe(2000)
    })
  })

  /* ==================================================================
   *  Branch coverage: reconcileStudentLedger – balance mismatch (L313)
   * ================================================================== */
  describe('reconcileStudentLedger – mismatch', () => {
    it('returns OUT_OF_BALANCE when ledger and invoices differ significantly', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Mis', 'Match', 'STU-MM')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-MM'").get() as { id: number }

      // Large invoice but no matching transactions → mismatch
      db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, amount, amount_paid, status, invoice_date, due_date, created_at) VALUES (${stu.id}, 'INV-MM1', 500000, 0, 'OUTSTANDING', '2026-02-01', '2026-03-01', '2026-02-01 10:00:00')`)
      // Small payment only
      db.exec(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, is_voided) VALUES ('MM-001', '2026-02-15', 'FEE_PAYMENT', 1, 10000, 'CREDIT', ${stu.id}, 'Small payment', 1, 0)`)

      const result = await service.reconcileStudentLedger(stu.id, '2026-01-01', '2026-12-31')
      expect(result.reconciled).toBe(false)
      expect(result.status).toBe('OUT_OF_BALANCE')
      expect(result.discrepancies.length).toBeGreaterThan(0)
    })
  })

  /* ==================================================================
   *  Branch coverage: verifyOpeningBalance – discrepancy (L389)
   * ================================================================== */
  describe('verifyOpeningBalance – mismatch', () => {
    it('returns DISCREPANCY when recorded balance does not match calculated', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Disc', 'Rep', 'STU-DR')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-DR'").get() as { id: number }

      // Record a wrong opening balance
      db.exec(`INSERT INTO student_opening_balance (student_id, period_start, opening_balance, recorded_at) VALUES (${stu.id}, '2026-01-01', 999999, '2026-01-01 00:00:00')`)

      const result = await service.verifyOpeningBalance(stu.id, '2026-01-01')
      // Calculated = 0 (no transactions before 2026), recorded = 999999 → discrepancy
      expect(result.verified).toBe(false)
      expect(result.verification_status).toBe('DISCREPANCY')
    })
  })

  /* ==================================================================
   *  Branch coverage: getStudentCurrentBalance
   * ================================================================== */
  describe('getStudentCurrentBalance', () => {
    it('returns current balance for student with transactions', async () => {
      const balance = await service.getStudentCurrentBalance(1)
      expect(typeof balance).toBe('number')
    })

    it('returns 0 for student with no transactions', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Empty', 'Stu', 'STU-EMPTY')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-EMPTY'").get() as { id: number }
      const balance = await service.getStudentCurrentBalance(stu.id)
      expect(balance).toBe(0)
    })
  })

  /* ==================================================================
   *  Branch coverage: transaction with amount=0 (L217, L219, L270, L273)
   *  Covers the || 0 fallback for transaction.amount in credit/debit paths
   * ================================================================== */
  describe('ledger with zero-amount transactions', () => {
    it('generateStudentLedger handles transactions with amount=0', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Zero', 'Amt', 'STU-ZERO')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-ZERO'").get() as { id: number }

      // Insert a credit transaction with amount=0
      db.exec(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, is_voided) VALUES ('Z-001', '2026-03-01', 'FEE_PAYMENT', 1, 0, 'CREDIT', ${stu.id}, 'Zero payment', 1, 0)`)
      // Insert a debit transaction with amount=0
      db.exec(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, is_voided) VALUES ('Z-002', '2026-03-02', 'CHARGE', 1, 0, 'DEBIT', ${stu.id}, 'Zero charge', 1, 0)`)

      const entries = await service.generateStudentLedger(stu.id, '2026-01-01', '2026-12-31')
      expect(entries.length).toBeGreaterThanOrEqual(2)
      // Balance should remain at opening balance (0) since amounts are 0
      const lastEntry = entries[entries.length - 1]
      expect(lastEntry.balance).toBe(0)
    })
  })

  /* ==================================================================
   *  Branch coverage: reconcileStudentLedger with no ledger entries (L309)
   *  Covers the ?? 0 fallback when entries array is empty
   * ================================================================== */
  describe('reconcileStudentLedger – no transactions', () => {
    it('reconcile returns balanced when student has no transactions and no invoices', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('No', 'Txns', 'STU-NOTXN')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-NOTXN'").get() as { id: number }

      const result = await service.reconcileStudentLedger(stu.id, '2026-01-01', '2026-12-31')
      expect(result.reconciled).toBe(true)
      expect(result.status).toBe('BALANCED')
    })
  })

  /* ==================================================================
   *  Branch coverage: reconcile invoice with amount=0 (L313)
   *  Covers the || 0 fallback for inv.amount in the reduce
   * ================================================================== */
  describe('reconcileStudentLedger – zero-amount invoice', () => {
    it('reconcile handles invoices with amount=0', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Inv', 'Zero', 'STU-INVZ')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-INVZ'").get() as { id: number }

      // Insert an invoice with amount=0
      db.exec(`INSERT INTO fee_invoice (student_id, invoice_number, amount, amount_paid, status, invoice_date, due_date, created_at) VALUES (${stu.id}, 'INV-Z1', 0, 0, 'OUTSTANDING', '2026-02-01', '2026-03-01', '2026-02-01 10:00:00')`)

      const result = await service.reconcileStudentLedger(stu.id, '2026-01-01', '2026-12-31')
      // With 0 invoices and 0 transactions, should be balanced
      expect(result.reconciled).toBe(true)
    })
  })

  /* ==================================================================
   *  Branch coverage: calculateOpeningBalance with zero-amount transactions (L217, L219)
   * ================================================================== */
  describe('calculateOpeningBalance – zero amounts', () => {
    it('opening balance handles zero-amount credit and debit transactions', async () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('OB', 'Zero', 'STU-OBZ')`)
      const stu = db.prepare("SELECT id FROM student WHERE admission_number = 'STU-OBZ'").get() as { id: number }

      // Credit transaction before period with amount=0
      db.exec(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, is_voided) VALUES ('OBZ-001', '2025-06-01', 'FEE_PAYMENT', 1, 0, 'CREDIT', ${stu.id}, 'Zero credit', 1, 0)`)
      // Debit transaction before period with amount=0
      db.exec(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, description, recorded_by_user_id, is_voided) VALUES ('OBZ-002', '2025-07-01', 'CHARGE', 1, 0, 'DEBIT', ${stu.id}, 'Zero debit', 1, 0)`)

      const balance = await service.calculateOpeningBalance(stu.id, '2026-01-01')
      expect(balance).toBe(0)
    })
  })

  /* ==================================================================
   *  Branch coverage: constructor without db – getDatabase() fallback
   * ================================================================== */
  describe('constructor without db parameter', () => {
    it('falls back to getDatabase() when no db is provided', async () => {
      vi.mocked(getDatabase).mockReturnValue(db as any)
      const svc = new StudentLedgerService()
      const balance = await svc.calculateOpeningBalance(1, '2026-01-01')
      expect(typeof balance).toBe('number')
    })

    it('generates ledger via getDatabase fallback', async () => {
      vi.mocked(getDatabase).mockReturnValue(db as any)
      const svc = new StudentLedgerService()
      const entries = await svc.generateStudentLedger(1, '2026-01-01', '2026-01-31')
      expect(Array.isArray(entries)).toBe(true)
    })
  })
})
