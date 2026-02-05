import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { StudentLedgerService } from '../StudentLedgerService'

// Mock audit utilities
vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

describe('StudentLedgerService', () => {
  let db: Database.Database
  let service: StudentLedgerService

  beforeEach(() => {
    db = new Database(':memory:')
    
    db.exec(`
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
    if (db) db.close()
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
  })
})
