import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
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

      CREATE TABLE invoice (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        invoice_number TEXT UNIQUE NOT NULL,
        amount REAL NOT NULL,
        paid_amount REAL DEFAULT 0,
        status TEXT DEFAULT 'UNPAID',
        due_date DATE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE credit_allocation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        credit_id INTEGER NOT NULL,
        invoice_id INTEGER NOT NULL,
        amount_allocated REAL NOT NULL,
        allocation_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (credit_id) REFERENCES credit_transaction(id),
        FOREIGN KEY (invoice_id) REFERENCES invoice(id)
      );

      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        table_name TEXT NOT NULL,
        record_id INTEGER,
        old_values TEXT,
        new_values TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Insert test student
      INSERT INTO student (first_name, last_name, admission_number)
      VALUES ('John', 'Doe', 'STU-001');

      -- Insert test invoices (different due dates for FIFO testing)
      INSERT INTO invoice (student_id, invoice_number, amount, paid_amount, due_date, status, created_at)
      VALUES 
        (1, 'INV-001', 50000, 0, '2026-01-15', 'UNPAID', '2026-01-01 10:00:00'),
        (1, 'INV-002', 30000, 0, '2026-01-20', 'UNPAID', '2026-01-05 10:00:00'),
        (1, 'INV-003', 20000, 0, '2026-01-25', 'UNPAID', '2026-01-10 10:00:00');

      -- Insert test credit
      INSERT INTO credit_transaction (student_id, amount, transaction_type, source, created_at)
      VALUES (1, 70000, 'CREDIT', 'OVERPAYMENT', '2026-01-12 10:00:00');
    `)

    service = new CreditAutoApplicationService(db)
  })

  afterEach(() => {
    db.close()
  })

  describe('autoApplyCredits', () => {
    it('should auto-apply credits using FIFO strategy', () => {
      const result = service.autoApplyCredits(1)

      expect(result.success).toBe(true)
      expect(result.creditsApplied).toBe(70000)
      expect(result.invoicesAffected).toBeGreaterThan(0)
    })

    it('should prioritize oldest invoices first', () => {
      service.autoApplyCredits(1)

      // Check first invoice (oldest due date) is fully paid
      const invoice1 = db.prepare('SELECT * FROM invoice WHERE invoice_number = ?').get('INV-001') as any
      expect(invoice1.paid_amount).toBe(50000)
      expect(invoice1.status).toBe('PAID')

      // Check second invoice is partially paid
      const invoice2 = db.prepare('SELECT * FROM invoice WHERE invoice_number = ?').get('INV-002') as any
      expect(invoice2.paid_amount).toBe(20000) // Remaining credit after first invoice
      expect(invoice2.status).toBe('PARTIALLY_PAID')

      // Check third invoice is unpaid (credit exhausted)
      const invoice3 = db.prepare('SELECT * FROM invoice WHERE invoice_number = ?').get('INV-003') as any
      expect(invoice3.paid_amount).toBe(0)
      expect(invoice3.status).toBe('UNPAID')
    })

    it('should create allocation records', () => {
      service.autoApplyCredits(1)

      const allocations = db.prepare('SELECT * FROM credit_allocation').all() as any[]
      expect(allocations.length).toBeGreaterThan(0)

      // Verify allocation amounts
      const totalAllocated = allocations.reduce((sum, a) => sum + a.amount_allocated, 0)
      expect(totalAllocated).toBe(70000)
    })

    it('should handle exact match scenario', () => {
      // Update credit to exactly match first two invoices
      db.exec('UPDATE credit_transaction SET amount = 80000')

      const result = service.autoApplyCredits(1)

      expect(result.creditsApplied).toBe(80000)

      // First two invoices should be fully paid
      const invoice1 = db.prepare('SELECT * FROM invoice WHERE invoice_number = ?').get('INV-001') as any
      const invoice2 = db.prepare('SELECT * FROM invoice WHERE invoice_number = ?').get('INV-002') as any
      expect(invoice1.status).toBe('PAID')
      expect(invoice2.status).toBe('PAID')
    })

    it('should handle insufficient credit scenario', () => {
      // Update credit to be less than first invoice
      db.exec('UPDATE credit_transaction SET amount = 30000')

      const result = service.autoApplyCredits(1)

      expect(result.creditsApplied).toBe(30000)

      // First invoice should be partially paid
      const invoice1 = db.prepare('SELECT * FROM invoice WHERE invoice_number = ?').get('INV-001') as any
      expect(invoice1.paid_amount).toBe(30000)
      expect(invoice1.status).toBe('PARTIALLY_PAID')
    })

    it('should handle excess credit scenario', () => {
      // Update credit to more than all invoices
      db.exec('UPDATE credit_transaction SET amount = 150000')

      const result = service.autoApplyCredits(1)

      expect(result.creditsApplied).toBe(100000) // Total of all invoices
      expect(result.remainingCredit).toBe(50000)

      // All invoices should be fully paid
      const invoices = db.prepare('SELECT * FROM invoice WHERE student_id = ?').all(1) as any[]
      invoices.forEach(inv => {
        expect(inv.status).toBe('PAID')
      })
    })

    it('should prioritize overdue invoices', () => {
      // Mark first invoice as overdue
      db.exec(`UPDATE invoice SET due_date = '2025-12-01' WHERE invoice_number = 'INV-001'`)

      service.autoApplyCredits(1)

      // Overdue invoice should be paid first
      const invoice1 = db.prepare('SELECT * FROM invoice WHERE invoice_number = ?').get('INV-001') as any
      expect(invoice1.paid_amount).toBe(50000)
      expect(invoice1.status).toBe('PAID')
    })

    it('should handle student with no credits', () => {
      db.exec('DELETE FROM credit_transaction')

      const result = service.autoApplyCredits(1)

      expect(result.success).toBe(true)
      expect(result.creditsApplied).toBe(0)
      expect(result.message).toContain('no available credits')
    })

    it('should handle student with no outstanding invoices', () => {
      db.exec(`UPDATE invoice SET paid_amount = amount, status = 'PAID'`)

      const result = service.autoApplyCredits(1)

      expect(result.success).toBe(true)
      expect(result.creditsApplied).toBe(0)
      expect(result.message).toContain('no outstanding invoices')
    })

    it('should log audit trail', () => {
      service.autoApplyCredits(1)

      const auditLogs = db.prepare('SELECT * FROM audit_log WHERE action_type = ?').all('AUTO_APPLY_CREDIT') as any[]
      expect(auditLogs.length).toBeGreaterThan(0)
    })
  })

  describe('getCreditBalance', () => {
    it('should return available credit balance', () => {
      const balance = service.getCreditBalance(1)

      expect(balance).toBe(70000)
    })

    it('should return 0 for student with no credits', () => {
      db.exec('INSERT INTO student (first_name, last_name, admission_number) VALUES ("New", "Student", "STU-002")')

      const balance = service.getCreditBalance(2)

      expect(balance).toBe(0)
    })

    it('should subtract allocated credits from balance', () => {
      service.autoApplyCredits(1)

      const balance = service.getCreditBalance(1)

      expect(balance).toBe(0) // All credits used
    })

    it('should handle partial allocation', () => {
      db.exec('UPDATE credit_transaction SET amount = 30000')
      service.autoApplyCredits(1)

      const balance = service.getCreditBalance(1)

      expect(balance).toBe(0) // All 30000 used
    })
  })

  describe('addCredit', () => {
    it('should add manual credit', () => {
      const result = service.addCredit({
        studentId: 1,
        amount: 50000,
        source: 'MANUAL_ADJUSTMENT',
        userId: 10
      })

      expect(result.success).toBe(true)
      expect(result.creditId).toBeGreaterThan(0)

      const balance = service.getCreditBalance(1)
      expect(balance).toBe(120000) // 70000 + 50000
    })

    it('should validate positive amount', () => {
      const result = service.addCredit({
        studentId: 1,
        amount: -10000,
        source: 'MANUAL',
        userId: 10
      })

      expect(result.success).toBe(false)
      expect(result.message).toContain('positive')
    })

    it('should validate student existence', () => {
      const result = service.addCredit({
        studentId: 999,
        amount: 10000,
        source: 'MANUAL',
        userId: 10
      })

      expect(result.success).toBe(false)
      expect(result.message).toContain('not found')
    })

    it('should require source information', () => {
      const result = service.addCredit({
        studentId: 1,
        amount: 10000,
        source: '',
        userId: 10
      })

      expect(result.success).toBe(false)
      expect(result.message).toContain('source')
    })

    it('should log audit trail', () => {
      service.addCredit({
        studentId: 1,
        amount: 50000,
        source: 'SCHOLARSHIP',
        userId: 10
      })

      const auditLogs = db.prepare('SELECT * FROM audit_log WHERE action_type = ?').all('ADD_CREDIT') as any[]
      expect(auditLogs.length).toBeGreaterThan(0)
      expect(auditLogs[0].user_id).toBe(10)
    })
  })

  describe('getCreditHistory', () => {
    it('should return credit transaction history', () => {
      const history = service.getCreditHistory(1)

      expect(history).toHaveLength(1)
      expect(history[0].amount).toBe(70000)
      expect(history[0].transaction_type).toBe('CREDIT')
    })

    it('should include allocation details', () => {
      service.autoApplyCredits(1)

      const history = service.getCreditHistory(1)

      expect(history[0]).toHaveProperty('allocations')
      expect(history[0].allocations.length).toBeGreaterThan(0)
    })

    it('should filter by date range', () => {
      service.addCredit({
        studentId: 1,
        amount: 10000,
        source: 'REFUND',
        userId: 10
      })

      const history = service.getCreditHistory(1, '2026-01-12', '2026-01-31')

      expect(history.length).toBeGreaterThan(0)
    })

    it('should show remaining balance per transaction', () => {
      service.autoApplyCredits(1)

      const history = service.getCreditHistory(1)

      expect(history[0]).toHaveProperty('remainingBalance')
    })
  })

  describe('edge cases', () => {
    it('should handle multiple credits for same student', () => {
      db.exec(`
        INSERT INTO credit_transaction (student_id, amount, transaction_type, source)
        VALUES (1, 30000, 'CREDIT', 'REFUND')
      `)

      const balance = service.getCreditBalance(1)
      expect(balance).toBe(100000) // 70000 + 30000
    })

    it('should handle concurrent allocation attempts', () => {
      // This is more of a database integrity test
      const result1 = service.autoApplyCredits(1)
      const result2 = service.autoApplyCredits(1)

      expect(result1.success).toBe(true)
      expect(result2.creditsApplied).toBe(0) // No credits left
    })

    it('should handle zero-amount credit gracefully', () => {
      const result = service.addCredit({
        studentId: 1,
        amount: 0,
        source: 'TEST',
        userId: 10
      })

      expect(result.success).toBe(false)
    })

    it('should handle invoices with same due date', () => {
      // Update all to same due date
      db.exec(`UPDATE invoice SET due_date = '2026-01-15'`)

      const result = service.autoApplyCredits(1)

      // Should still allocate, using created_at as tiebreaker
      expect(result.success).toBe(true)
      expect(result.creditsApplied).toBe(70000)
    })
  })
})
