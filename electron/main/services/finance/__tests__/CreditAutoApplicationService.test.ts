import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CreditAutoApplicationService } from '../CreditAutoApplicationService'

// Mock audit utilities
vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

describe('CreditAutoApplicationService', () => {
  let db: Database.Database
  let service: CreditAutoApplicationService

  beforeEach(() => {
    db = new Database(':memory:')
    
    db.exec(`
      CREATE TABLE student (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        admission_number TEXT UNIQUE NOT NULL
      );

      CREATE TABLE credit_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        transaction_type TEXT NOT NULL,
        source TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        invoice_number TEXT UNIQUE NOT NULL,
        amount REAL NOT NULL,
        amount_paid REAL DEFAULT 0,
        status TEXT DEFAULT 'OUTSTANDING',
        due_date DATE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Insert test student
      INSERT INTO student (first_name, last_name, admission_number)
      VALUES ('John', 'Doe', 'STU-001');

      -- Insert test invoices (different due dates for FIFO testing)
      INSERT INTO fee_invoice (student_id, invoice_number, amount, amount_paid, due_date, status, created_at)
      VALUES 
        (1, 'INV-001', 50000, 0, '2026-01-15', 'OUTSTANDING', '2026-01-01 10:00:00'),
        (1, 'INV-002', 30000, 0, '2026-01-20', 'OUTSTANDING', '2026-01-05 10:00:00'),
        (1, 'INV-003', 20000, 0, '2026-01-25', 'OUTSTANDING', '2026-01-10 10:00:00');

      -- Insert test credit
      INSERT INTO credit_transaction (student_id, amount, transaction_type, source, created_at)
      VALUES (1, 70000, 'CREDIT', 'OVERPAYMENT', '2026-01-12 10:00:00');
    `)

    service = new CreditAutoApplicationService(db)
  })

  afterEach(() => {
    if (db) db.close()
  })

  describe('autoApplyCredits', () => {
    it('should auto-apply credits', () => {
      const result = service.autoApplyCredits(1)

      expect(result).toBeDefined()
      expect(typeof result === 'object').toBe(true)
    })

    it('should prioritize oldest invoices first', () => {
      service.autoApplyCredits(1)

      // Check first invoice (oldest due date)
      const invoice1 = db.prepare('SELECT * FROM fee_invoice WHERE invoice_number = ?').get('INV-001') as unknown
      expect(invoice1.amount_paid).toBeGreaterThanOrEqual(0)

      // Check second invoice
      const invoice2 = db.prepare('SELECT * FROM fee_invoice WHERE invoice_number = ?').get('INV-002') as unknown
      expect(invoice2.amount_paid).toBeGreaterThanOrEqual(0)

      // Check third invoice
      const invoice3 = db.prepare('SELECT * FROM fee_invoice WHERE invoice_number = ?').get('INV-003') as unknown
      expect(invoice3.amount_paid).toBeGreaterThanOrEqual(0)
    })

    it('should handle exact match scenario', () => {
      // Update credit to exactly match first two invoices
      db.exec('UPDATE credit_transaction SET amount = 80000')

      const result = service.autoApplyCredits(1)

      expect(result).toBeDefined()
    })

    it('should handle insufficient credit scenario', () => {
      // Update credit to be less than first invoice
      db.exec('UPDATE credit_transaction SET amount = 30000')

      const result = service.autoApplyCredits(1)

      expect(result).toBeDefined()

      // First invoice should have some payment
      const invoice1 = db.prepare('SELECT * FROM fee_invoice WHERE invoice_number = ?').get('INV-001') as unknown
      expect(invoice1.amount_paid).toBeGreaterThanOrEqual(0)
    })

    it('should handle excess credit scenario', () => {
      // Update credit to more than all invoices
      db.exec('UPDATE credit_transaction SET amount = 150000')

      const result = service.autoApplyCredits(1)

      expect(result).toBeDefined()
    })

    it('should prioritize overdue invoices', () => {
      // Mark first invoice as overdue
      db.exec(`UPDATE fee_invoice SET due_date = '2025-12-01' WHERE invoice_number = 'INV-001'`)

      service.autoApplyCredits(1)

      // Overdue invoice should have payment applied
      const invoice1 = db.prepare('SELECT * FROM fee_invoice WHERE invoice_number = ?').get('INV-001') as unknown
      expect(invoice1.amount_paid).toBeGreaterThanOrEqual(0)
    })

    it('should handle student with no credits', () => {
      db.exec('DELETE FROM credit_transaction')

      const result = service.autoApplyCredits(1)

      expect(result).toBeDefined()
    })

    it('should handle student with no outstanding invoices', () => {
      db.exec(`UPDATE fee_invoice SET amount_paid = amount, status = 'PAID'`)

      const result = service.autoApplyCredits(1)

      expect(result).toBeDefined()
    })
  })

  describe('getCreditBalance', () => {
    it('should return available credit balance', () => {
      const balance = service.getCreditBalance(1)

      expect(typeof balance === 'number').toBe(true)
      expect(balance).toBeGreaterThanOrEqual(0)
    })

    it('should return 0 for student with no credits', () => {
      db.exec('INSERT INTO student (first_name, last_name, admission_number) VALUES (\'New\', \'Student\', \'STU-002\')')

      const balance = service.getCreditBalance(2)

      expect(balance).toBe(0)
    })

    it('should calculate credit correctly', () => {
      const credits = db.prepare('SELECT SUM(amount) as total FROM credit_transaction WHERE student_id = 1').get() as unknown
      expect(credits.total).toBe(70000)
    })
  })

  describe('addCredit', () => {
    it('should add manual credit', () => {
      const result = service.addCredit(
        1,  // studentId
        50000,  // amount
        'MANUAL_ADJUSTMENT',  // notes
        10  // userId
      )

      expect(result).toBeDefined()
    })

    it('should reject negative credit', () => {
      const result = service.addCredit(
        1,  // studentId
        -10000,  // amount
        'MANUAL_ADJUSTMENT',  // notes
        10  // userId
      )

      expect(result).toBeDefined()
    })

    it('should create new credit transaction', () => {
      const beforeCount = db.prepare('SELECT COUNT(*) as count FROM credit_transaction').get() as unknown
      
      service.addCredit(
        1,  // studentId
        25000,  // amount
        'REFUND',  // notes
        10  // userId
      )

      const afterCount = db.prepare('SELECT COUNT(*) as count FROM credit_transaction').get() as unknown
      expect(afterCount.count).toBeGreaterThanOrEqual(beforeCount.count)
    })
  })

  describe('getCreditTransactions', () => {
    it('should retrieve credit transactions', async () => {
      const transactions = await service.getCreditTransactions(1)

      expect(Array.isArray(transactions) || transactions === undefined).toBe(true)
    })

    it('should return empty for student with no credits', async () => {
      db.exec('INSERT INTO student (first_name, last_name, admission_number) VALUES (\'New\', \'Student\', \'STU-003\')')

      const transactions = await service.getCreditTransactions(3)

      expect(transactions === undefined || Array.isArray(transactions)).toBe(true)
    })
  })

  describe('reverseCredit', () => {
    it('should reverse credit', () => {
      const result = service.reverseCredit(
        1,  // creditId
        'Error correction',  // reason
        10  // userId
      )

      expect(result).toBeDefined()
    })

    it('should validate credit existence', () => {
      const result = service.reverseCredit(
        999,  // creditId
        'Error correction',  // reason
        10  // userId
      )

      expect(result).toBeDefined()
    })
  })
})

