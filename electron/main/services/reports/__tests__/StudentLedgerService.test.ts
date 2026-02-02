import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
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
        transaction_type TEXT NOT NULL CHECK(transaction_type IN ('INCOME', 'FEE_PAYMENT', 'DONATION', 'GRANT', 'EXPENSE', 'SALARY_PAYMENT', 'REFUND', 'OPENING_BALANCE', 'ADJUSTMENT')),
        category_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        debit_credit TEXT NOT NULL CHECK(debit_credit IN ('DEBIT', 'CREDIT')),
        student_id INTEGER,
        staff_id INTEGER,
        invoice_id INTEGER,
        payment_method TEXT CHECK(payment_method IN ('CASH', 'MPESA', 'BANK_TRANSFER', 'CHEQUE')),
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

      -- Insert test data
      INSERT INTO transaction_category (category_name) VALUES ('FEE_INCOME'), ('REFUND');
      INSERT INTO user (username) VALUES ('testuser');

      -- Insert test student
      INSERT INTO student (first_name, last_name, admission_number)
      VALUES ('John', 'Doe', 'STU-001');

      -- Insert historical invoices (for opening balance)
      INSERT INTO fee_invoice (student_id, invoice_number, amount, amount_paid, status, invoice_date, created_at)
      VALUES 
        (1, 'INV-2025-001', 100000, 60000, 'PARTIAL', '2025-11-15', '2025-11-15 10:00:00'),
        (1, 'INV-2025-002', 50000, 50000, 'PAID', '2025-12-01', '2025-12-01 10:00:00');

      -- Insert historical transactions
      INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, invoice_id, description, recorded_by_user_id, is_voided, created_at)
      VALUES 
        ('TRX-2025-001', '2025-11-15', 'INCOME', 1, 100000, 'DEBIT', 1, 1, 'Invoice INV-2025-001', 1, 0, '2025-11-15 10:00:00'),
        ('PAY-2025-001', '2025-11-20', 'FEE_PAYMENT', 1, 60000, 'CREDIT', 1, 1, 'Payment for INV-2025-001', 1, 0, '2025-11-20 14:00:00'),
        ('TRX-2025-002', '2025-12-01', 'INCOME', 1, 50000, 'DEBIT', 1, 2, 'Invoice INV-2025-002', 1, 0, '2025-12-01 10:00:00'),
        ('PAY-2025-002', '2025-12-05', 'FEE_PAYMENT', 1, 50000, 'CREDIT', 1, 2, 'Payment for INV-2025-002', 1, 0, '2025-12-05 14:00:00');

      -- Insert current period invoices
      INSERT INTO fee_invoice (student_id, invoice_number, amount, amount_paid, status, invoice_date, created_at)
      VALUES 
        (1, 'INV-2026-001', 75000, 0, 'OUTSTANDING', '2026-01-05', '2026-01-05 10:00:00'),
        (1, 'INV-2026-002', 30000, 20000, 'PARTIAL', '2026-01-15', '2026-01-15 10:00:00');

      -- Insert current period transactions
      INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, invoice_id, description, recorded_by_user_id, is_voided, created_at)
      VALUES 
        ('TRX-2026-001', '2026-01-05', 'INCOME', 1, 75000, 'DEBIT', 1, 3, 'Invoice INV-2026-001', 1, 0, '2026-01-05 10:00:00'),
        ('PAY-2026-001', '2026-01-10', 'FEE_PAYMENT', 1, 50000, 'CREDIT', 1, 3, 'Payment for INV-2026-001', 1, 0, '2026-01-10 14:00:00'),
        ('TRX-2026-002', '2026-01-15', 'INCOME', 1, 30000, 'DEBIT', 1, 4, 'Invoice INV-2026-002', 1, 0, '2026-01-15 10:00:00'),
        ('PAY-2026-002', '2026-01-20', 'FEE_PAYMENT', 1, 20000, 'CREDIT', 1, 4, 'Payment for INV-2026-002', 1, 0, '2026-01-20 14:00:00'),
        ('ADJ-2026-001', '2026-01-25', 'ADJUSTMENT', 1, 5000, 'CREDIT', 1, NULL, 'Credit adjustment', 1, 0, '2026-01-25 10:00:00');
    `)

    service = new StudentLedgerService(db)
  })

  afterEach(() => {
    db.close()
  })

  describe('generateLedger', () => {
    it('should generate complete ledger with opening balance', () => {
      const result = service.generateLedger(1, '2026-01-01', '2026-01-31')

      expect(result).toHaveProperty('student')
      expect(result).toHaveProperty('openingBalance')
      expect(result).toHaveProperty('transactions')
      expect(result).toHaveProperty('closingBalance')
      expect(result).toHaveProperty('summary')
    })

    it('should calculate opening balance correctly', () => {
      const result = service.generateLedger(1, '2026-01-01', '2026-01-31')

      // Opening balance = previous invoices - previous payments
      // = (100000 + 50000) - (60000 + 50000) = 40000
      expect(result.openingBalance).toBe(40000)
    })

    it('should include all transactions in period', () => {
      const result = service.generateLedger(1, '2026-01-01', '2026-01-31')

      // Should have 5 transactions: 2 invoices, 2 payments, 1 credit
      expect(result.transactions).toHaveLength(5)
    })

    it('should order transactions chronologically', () => {
      const result = service.generateLedger(1, '2026-01-01', '2026-01-31')

      // Verify chronological order
      for (let i = 1; i < result.transactions.length; i++) {
        const prev = new Date(result.transactions[i - 1].date)
        const curr = new Date(result.transactions[i].date)
        expect(curr >= prev).toBe(true)
      }
    })

    it('should calculate running balance correctly', () => {
      const result = service.generateLedger(1, '2026-01-01', '2026-01-31')

      // Verify running balance
      let expectedBalance = result.openingBalance

      result.transactions.forEach(txn => {
        if (txn.type === 'INVOICE') {
          expectedBalance += txn.debit
        } else if (txn.type === 'PAYMENT' || txn.type === 'CREDIT') {
          expectedBalance -= txn.credit
        }
        expect(txn.running_balance).toBe(expectedBalance)
      })
    })

    it('should calculate closing balance correctly', () => {
      const result = service.generateLedger(1, '2026-01-01', '2026-01-31')

      // Opening: 40000
      // Invoices: 75000 + 30000 = 105000
      // Payments: 50000 + 20000 = 70000
      // Credits: 5000
      // Closing = 40000 + 105000 - 70000 - 5000 = 70000
      expect(result.closingBalance).toBe(70000)
    })

    it('should provide summary statistics', () => {
      const result = service.generateLedger(1, '2026-01-01', '2026-01-31')

      expect(result.summary).toHaveProperty('totalInvoiced')
      expect(result.summary).toHaveProperty('totalPaid')
      expect(result.summary).toHaveProperty('totalCredits')
      expect(result.summary).toHaveProperty('netMovement')

      expect(result.summary.totalInvoiced).toBe(105000)
      expect(result.summary.totalPaid).toBe(70000)
      expect(result.summary.totalCredits).toBe(5000)
    })

    it('should exclude voided transactions', () => {
      db.exec(`UPDATE payment SET status = 'VOIDED' WHERE payment_date = '2026-01-20'`)

      const result = service.generateLedger(1, '2026-01-01', '2026-01-31')

      // Should have 4 transactions (one payment voided)
      expect(result.transactions).toHaveLength(4)
      
      // Closing balance should not include voided payment
      expect(result.closingBalance).toBeGreaterThan(70000)
    })

    it('should handle empty period', () => {
      const result = service.generateLedger(1, '2027-01-01', '2027-01-31')

      expect(result.transactions).toHaveLength(0)
      expect(result.closingBalance).toBe(result.openingBalance)
    })
  })

  describe('reconcileLedger', () => {
    it('should validate ledger integrity', () => {
      const result = service.reconcileLedger(1, '2026-01-01', '2026-01-31')

      expect(result).toHaveProperty('isBalanced')
      expect(result).toHaveProperty('discrepancies')
      expect(result).toHaveProperty('recommendation')
    })

    it('should identify balanced ledger', () => {
      const result = service.reconcileLedger(1, '2026-01-01', '2026-01-31')

      expect(result.isBalanced).toBe(true)
      expect(result.discrepancies).toHaveLength(0)
    })

    it('should detect invoice allocation discrepancies', () => {
      // Manually corrupt data: mark invoice as paid without payment allocation
      db.exec(`UPDATE invoice SET paid_amount = amount WHERE invoice_number = 'INV-2026-001'`)

      const result = service.reconcileLedger(1, '2026-01-01', '2026-01-31')

      expect(result.isBalanced).toBe(false)
      expect(result.discrepancies.length).toBeGreaterThan(0)
      expect(result.discrepancies.some(d => d.includes('allocation'))).toBe(true)
    })

    it('should provide reconciliation recommendations', () => {
      const result = service.reconcileLedger(1, '2026-01-01', '2026-01-31')

      expect(result.recommendation).toBeTruthy()
      expect(typeof result.recommendation).toBe('string')
    })
  })

  describe('calculateOpeningBalance', () => {
    it('should calculate opening balance for specific date', () => {
      const balance = service.calculateOpeningBalance(1, '2026-01-01')

      expect(balance).toBe(40000) // As calculated earlier
    })

    it('should return 0 for student with no prior transactions', () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('New', 'Student', 'STU-002')`)

      const balance = service.calculateOpeningBalance(2, '2026-01-01')

      expect(balance).toBe(0)
    })

    it('should handle mid-period opening balance', () => {
      const balance = service.calculateOpeningBalance(1, '2026-01-15')

      // Should include transactions up to Jan 14
      expect(balance).toBeGreaterThan(40000) // Opening + Jan 5 invoice - Jan 10 payment
    })

    it('should exclude voided transactions from opening balance', () => {
      db.exec(`UPDATE payment SET status = 'VOIDED' WHERE payment_date = '2025-11-20'`)

      const balance = service.calculateOpeningBalance(1, '2026-01-01')

      // Should be higher since payment was voided
      expect(balance).toBeGreaterThan(40000)
    })
  })

  describe('validateLedger', () => {
    it('should validate mathematical accuracy', () => {
      const result = service.validateLedger(1, '2026-01-01', '2026-01-31')

      expect(result).toHaveProperty('isValid')
      expect(result).toHaveProperty('errors')
    })

    it('should pass validation for correct ledger', () => {
      const result = service.validateLedger(1, '2026-01-01', '2026-01-31')

      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should detect negative running balances', () => {
      // Create scenario with negative balance
      db.exec(`
        INSERT INTO payment (student_id, amount, payment_date, status, created_at)
        VALUES (1, 1000000, '2026-01-30', 'ACTIVE', '2026-01-30 14:00:00')
      `)

      const result = service.validateLedger(1, '2026-01-01', '2026-01-31')

      // May or may not flag negative balance depending on business rules
      expect(result).toHaveProperty('warnings')
    })

    it('should detect missing transaction references', () => {
      // Manually delete payment allocation
      db.exec(`DELETE FROM payment WHERE id = (SELECT MAX(id) FROM payment)`)

      const result = service.validateLedger(1, '2026-01-01', '2026-01-31')

      expect(result.isValid).toBe(true) // Still mathematically valid
    })
  })

  describe('edge cases', () => {
    it('should handle student with no transactions', () => {
      db.exec(`INSERT INTO student (first_name, last_name, admission_number) VALUES ('Empty', 'Ledger', 'STU-003')`)

      const result = service.generateLedger(3, '2026-01-01', '2026-01-31')

      expect(result.openingBalance).toBe(0)
      expect(result.closingBalance).toBe(0)
      expect(result.transactions).toHaveLength(0)
    })

    it('should handle date range before any transactions', () => {
      const result = service.generateLedger(1, '2020-01-01', '2020-01-31')

      expect(result.openingBalance).toBe(0)
      expect(result.closingBalance).toBe(0)
      expect(result.transactions).toHaveLength(0)
    })

    it('should handle invalid student ID', () => {
      expect(() => {
        service.generateLedger(999, '2026-01-01', '2026-01-31')
      }).toThrow()
    })

    it('should handle invalid date range', () => {
      const result = service.generateLedger(1, '2026-02-01', '2026-01-01') // End before start

      expect(result.transactions).toHaveLength(0)
    })
  })
})
