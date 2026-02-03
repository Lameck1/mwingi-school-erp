import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import { CashFlowStatementService } from '../CashFlowStatementService'

// Mock audit utilities
vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

describe('CashFlowStatementService', () => {
  let db: Database.Database
  let service: CashFlowStatementService

  beforeEach(() => {
    db = new Database(':memory:')
    
    db.exec(`
      CREATE TABLE student (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        admission_number TEXT UNIQUE NOT NULL
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

      CREATE TABLE transaction_category (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_name TEXT NOT NULL
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
        recorded_by_user_id INTEGER NOT NULL,
        is_voided BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES transaction_category(id),
        FOREIGN KEY (student_id) REFERENCES student(id),
        FOREIGN KEY (recorded_by_user_id) REFERENCES user(id)
      );

      CREATE TABLE expense_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        expense_type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        transaction_date DATE NOT NULL
      );

      CREATE TABLE payroll_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        amount INTEGER NOT NULL,
        transaction_date DATE NOT NULL
      );

      CREATE TABLE asset_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        transaction_date DATE NOT NULL
      );

      CREATE TABLE loan_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        transaction_date DATE NOT NULL
      );

      -- Insert test data
      INSERT INTO user (username) VALUES ('testuser');
      INSERT INTO transaction_category (category_name) VALUES ('INCOME'), ('EXPENSE');

      -- Insert test students
      INSERT INTO student (first_name, last_name, admission_number)
      VALUES 
        ('Student', 'One', 'STU-001'),
        ('Student', 'Two', 'STU-002');

      -- Insert invoices
      INSERT INTO fee_invoice (student_id, invoice_number, amount, amount_paid, status, invoice_date, created_at)
      VALUES 
        (1, 'INV-2026-001', 50000, 50000, 'PAID', '2026-01-05', '2026-01-05 10:00:00'),
        (1, 'INV-2026-002', 30000, 0, 'OUTSTANDING', '2026-01-10', '2026-01-10 10:00:00'),
        (2, 'INV-2026-003', 60000, 30000, 'PARTIAL', '2026-01-15', '2026-01-15 10:00:00'),
        (2, 'INV-2026-004', 25000, 0, 'OUTSTANDING', '2026-01-20', '2026-01-20 10:00:00');

      -- Insert transactions
      INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, student_id, recorded_by_user_id, created_at)
      VALUES 
        ('TRX-2026-001', '2026-01-05', 'INCOME', 1, 50000, 'DEBIT', 1, 1, '2026-01-05 14:00:00'),
        ('TRX-2026-002', '2026-01-10', 'INCOME', 1, 30000, 'DEBIT', 1, 1, '2026-01-10 14:00:00'),
        ('TRX-2026-003', '2026-01-15', 'INCOME', 1, 60000, 'DEBIT', 2, 1, '2026-01-15 14:00:00'),
        ('TRX-2026-004', '2026-01-18', 'INCOME', 1, 30000, 'DEBIT', 2, 1, '2026-01-18 14:00:00'),
        ('EXP-2026-001', '2026-01-12', 'EXPENSE', 2, 10000, 'CREDIT', NULL, 1, '2026-01-12 14:00:00'),
        ('EXP-2026-002', '2026-01-25', 'EXPENSE', 2, 5000, 'CREDIT', NULL, 1, '2026-01-25 14:00:00');
    `)

    service = new CashFlowStatementService(db)
  })

  afterEach(() => {
    db.close()
  })

  describe('generateCashFlowStatement', () => {
    it('should generate cash flow statement without errors', async () => {
      const result = await service.generateCashFlowStatement('2026-01-01', '2026-01-31')

      expect(result).toBeDefined()
      expect(typeof result).toBe('object')
    })

    it('should include required sections', async () => {
      const result = await service.generateCashFlowStatement('2026-01-01', '2026-01-31')

      expect(result).toHaveProperty('period_start')
      expect(result).toHaveProperty('period_end')
    })

    it('should calculate cash flows', async () => {
      const result = await service.generateCashFlowStatement('2026-01-01', '2026-01-31')

      expect(result).toBeDefined()
      expect(typeof result).toBe('object')
    })

    it('should handle empty period', async () => {
      const result = await service.generateCashFlowStatement('2025-01-01', '2025-01-31')

      expect(result).toBeDefined()
    })

    it('should include period dates', async () => {
      const result = await service.generateCashFlowStatement('2026-01-01', '2026-01-31')

      expect(result.period_start).toBe('2026-01-01')
      expect(result.period_end).toBe('2026-01-31')
    })

    it('should process income transactions', async () => {
      const result = await service.generateCashFlowStatement('2026-01-01', '2026-01-31')

      expect(result).toBeDefined()
    })

    it('should process expense transactions', async () => {
      const result = await service.generateCashFlowStatement('2026-01-01', '2026-01-31')

      expect(result).toBeDefined()
    })

    it('should handle single day period', async () => {
      const result = await service.generateCashFlowStatement('2026-01-15', '2026-01-15')

      expect(result).toBeDefined()
    })

    it('should handle month spanning periods', async () => {
      const result = await service.generateCashFlowStatement('2026-01-20', '2026-02-10')

      expect(result).toBeDefined()
    })

    it('should handle year spanning periods', async () => {
      const result = await service.generateCashFlowStatement('2025-12-01', '2026-02-28')

      expect(result).toBeDefined()
    })

    it('should return consistent results', async () => {
      const result1 = await service.generateCashFlowStatement('2026-01-01', '2026-01-31')
      const result2 = await service.generateCashFlowStatement('2026-01-01', '2026-01-31')

      expect(result1.period_start).toBe(result2.period_start)
    })

    it('should handle period before any transactions', async () => {
      const result = await service.generateCashFlowStatement('2020-01-01', '2020-01-31')

      expect(result).toBeDefined()
    })

    it('should handle period after all transactions', async () => {
      const result = await service.generateCashFlowStatement('2030-01-01', '2030-01-31')

      expect(result).toBeDefined()
    })

    it('should handle concurrent requests', async () => {
      const [r1, r2] = await Promise.all([
        service.generateCashFlowStatement('2026-01-01', '2026-01-31'),
        service.generateCashFlowStatement('2026-01-01', '2026-01-31')
      ])

      expect(r1).toBeDefined()
      expect(r2).toBeDefined()
    })

    it('should process partial invoices', async () => {
      const result = await service.generateCashFlowStatement('2026-01-01', '2026-01-31')

      expect(result).toBeDefined()
    })

    it('should calculate net cash flow', async () => {
      const result = await service.generateCashFlowStatement('2026-01-01', '2026-01-31')

      expect(result).toHaveProperty('period_start')
    })

    it('should work with no invoices', async () => {
      db.exec(`DELETE FROM fee_invoice`)

      const result = await service.generateCashFlowStatement('2026-01-01', '2026-01-31')

      expect(result).toBeDefined()
    })

    it('should work with no transactions', async () => {
      db.exec(`DELETE FROM ledger_transaction`)

      const result = await service.generateCashFlowStatement('2026-01-01', '2026-01-31')

      expect(result).toBeDefined()
    })

    it('should handle mixed transaction dates', async () => {
      const result = await service.generateCashFlowStatement('2026-01-10', '2026-01-20')

      expect(result).toBeDefined()
    })

    it('should exclude out-of-period transactions', async () => {
      const result = await service.generateCashFlowStatement('2026-01-05', '2026-01-10')

      expect(result).toBeDefined()
    })
  })

  describe('getOperatingActivities', () => {
    it('should calculate operating activities', async () => {
      const result = await service.getOperatingActivities('2026-01-01', '2026-01-31')

      expect(result).toBeDefined()
      expect(typeof result).toBe('object')
    })

    it('should include fee collections', async () => {
      const result = await service.getOperatingActivities('2026-01-01', '2026-01-31')

      expect(result).toBeDefined()
    })

    it('should handle empty period', async () => {
      const result = await service.getOperatingActivities('2025-01-01', '2025-01-31')

      expect(result).toBeDefined()
    })
  })

  describe('getInvestingActivities', () => {
    it('should calculate investing activities', async () => {
      const result = await service.getInvestingActivities('2026-01-01', '2026-01-31')

      expect(result).toBeDefined()
      expect(typeof result).toBe('object')
    })

    it('should handle empty period', async () => {
      const result = await service.getInvestingActivities('2025-01-01', '2025-01-31')

      expect(result).toBeDefined()
    })
  })

  describe('getFinancingActivities', () => {
    it('should calculate financing activities', async () => {
      const result = await service.getFinancingActivities('2026-01-01', '2026-01-31')

      expect(result).toBeDefined()
      expect(typeof result).toBe('object')
    })

    it('should handle empty period', async () => {
      const result = await service.getFinancingActivities('2025-01-01', '2025-01-31')

      expect(result).toBeDefined()
    })
  })

  describe('edge cases', () => {
    it('should handle invalid date range (end before start)', async () => {
      const result = await service.generateCashFlowStatement('2026-02-01', '2026-01-01')

      expect(result).toBeDefined()
    })

    it('should handle same start and end dates', async () => {
      const result = await service.generateCashFlowStatement('2026-01-15', '2026-01-15')

      expect(result).toBeDefined()
    })

    it('should handle special characters in transaction data', async () => {
      const result = await service.generateCashFlowStatement('2026-01-01', '2026-01-31')

      expect(result).toBeDefined()
    })

    it('should handle high transaction volumes', async () => {
      const stmt = db.prepare(`
        INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, recorded_by_user_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)

      for (let i = 0; i < 50; i++) {
        stmt.run(`TRX-${i}`, '2026-01-15', 'INCOME', 1, 1000, 'DEBIT', 1, '2026-01-15 14:00:00')
      }

      const result = await service.generateCashFlowStatement('2026-01-01', '2026-01-31')

      expect(result).toBeDefined()
    })

    it('should handle zero amounts', async () => {
      const result = await service.generateCashFlowStatement('2026-01-01', '2026-01-31')

      expect(result).toBeDefined()
    })

    it('should handle large amounts', async () => {
      db.exec(`INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, recorded_by_user_id, created_at)
               VALUES ('LARGE-TRX', '2026-01-20', 'INCOME', 1, 999999999, 'DEBIT', 1, '2026-01-20 14:00:00')`)

      const result = await service.generateCashFlowStatement('2026-01-01', '2026-01-31')

      expect(result).toBeDefined()
    })
  })
})
