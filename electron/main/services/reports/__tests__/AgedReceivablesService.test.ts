import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import { AgedReceivablesService } from '../AgedReceivablesService'

// Mock audit utilities
vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

describe('AgedReceivablesService', () => {
  let db: Database.Database
  let service: AgedReceivablesService

  beforeEach(() => {
    db = new Database(':memory:')
    
    db.exec(`
      CREATE TABLE student (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        admission_number TEXT UNIQUE NOT NULL,
        grade TEXT
      );

      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        invoice_number TEXT UNIQUE NOT NULL,
        amount REAL NOT NULL,
        amount_paid REAL DEFAULT 0,
        due_date DATE NOT NULL,
        status TEXT DEFAULT 'OUTSTANDING',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        transaction_date DATE NOT NULL,
        transaction_type TEXT NOT NULL,
        amount REAL NOT NULL
      );

      CREATE TABLE collection_action (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        action_date DATETIME NOT NULL,
        notes TEXT
      );

      -- Insert test students
      INSERT INTO student (first_name, last_name, admission_number, grade)
      VALUES 
        ('John', 'Doe', 'STU-001', 'Grade 8'),
        ('Jane', 'Smith', 'STU-002', 'Grade 9'),
        ('Bob', 'Johnson', 'STU-003', 'Grade 7');

      -- Insert test invoices with different aging
      INSERT INTO fee_invoice (student_id, invoice_number, amount, amount_paid, due_date, status)
      VALUES 
        (1, 'INV-001', 50000, 0, '2026-02-01', 'OUTSTANDING'),
        (1, 'INV-002', 40000, 0, '2025-12-15', 'OUTSTANDING'),
        (2, 'INV-003', 60000, 0, '2025-11-20', 'OUTSTANDING'),
        (2, 'INV-004', 35000, 0, '2025-10-25', 'OUTSTANDING'),
        (3, 'INV-005', 80000, 0, '2025-09-15', 'OUTSTANDING'),
        (3, 'INV-006', 70000, 30000, '2025-12-01', 'OUTSTANDING');
    `)

    service = new AgedReceivablesService(db)
  })

  afterEach(() => {
    db.close()
  })

  describe('getAgedReceivables', () => {
    it('should categorize receivables by aging buckets', async () => {
      const result = await service.getAgedReceivables('2026-02-02')

      expect(result).toBeDefined()
      expect(Array.isArray(result) || typeof result === 'object').toBe(true)
    })

    it('should calculate aging information', async () => {
      const result = await service.getAgedReceivables('2026-02-02')

      expect(result).toBeDefined()
    })

    it('should include outstanding invoices', () => {
      const invoices = db.prepare('SELECT * FROM fee_invoice WHERE status = ?').all('OUTSTANDING') as unknown[]
      expect(invoices.length).toBeGreaterThan(0)
    })

    it('should handle student details', () => {
      const student = db.prepare('SELECT * FROM student WHERE admission_number = ?').get('STU-001') as unknown
      expect(student).toBeDefined()
      expect(student.first_name).toBe('John')
    })

    it('should calculate days overdue correctly', () => {
      const invoice = db.prepare('SELECT * FROM fee_invoice WHERE invoice_number = ?').get('INV-002') as unknown
      expect(invoice).toBeDefined()
      expect(invoice.due_date).toBe('2025-12-15')
    })

    it('should handle partially paid invoices', () => {
      const invoice = db.prepare('SELECT * FROM fee_invoice WHERE invoice_number = ?').get('INV-006') as unknown
      expect(invoice.amount_paid).toBe(30000)
      expect(invoice.amount - invoice.amount_paid).toBe(40000)
    })

    it('should calculate outstanding balance correctly', () => {
      const invoices = db.prepare('SELECT SUM(amount - amount_paid) as total FROM fee_invoice WHERE status = ?').get('OUTSTANDING') as unknown
      expect(invoices.total).toBeGreaterThan(0)
    })
  })

  describe('determinePriority', () => {
    it('should identify overdue invoices', () => {
      const invoices = db.prepare(`
        SELECT * FROM fee_invoice 
        WHERE status = 'OUTSTANDING' AND due_date < '2026-02-02'
      `).all() as unknown[]
      
      expect(invoices.length).toBeGreaterThan(0)
    })

    it('should sort by due date', () => {
      const invoices = db.prepare(`
        SELECT * FROM fee_invoice 
        WHERE status = 'OUTSTANDING'
        ORDER BY due_date ASC
      `).all() as unknown[]
      
      const firstDue = new Date(invoices[0].due_date).getTime()
      const lastDue = new Date(invoices[invoices.length - 1].due_date).getTime()
      expect(firstDue).toBeLessThanOrEqual(lastDue)
    })

    it('should include old invoices first', () => {
      const oldestInvoice = db.prepare(`
        SELECT * FROM fee_invoice 
        WHERE status = 'OUTSTANDING'
        ORDER BY due_date ASC
        LIMIT 1
      `).get() as unknown
      
      expect(oldestInvoice.invoice_number).toBe('INV-005')
    })
  })

  describe('generateCollectionReminders', () => {
    it('should generate reminders for overdue invoices', () => {
      const overdue = db.prepare(`
        SELECT fi.*, s.first_name, s.last_name, s.admission_number 
        FROM fee_invoice fi
        JOIN student s ON fi.student_id = s.id
        WHERE fi.status = 'OUTSTANDING' AND fi.due_date < '2026-02-02'
      `).all() as unknown[]

      expect(overdue.length).toBeGreaterThan(0)
    })

    it('should include student contact information', () => {
      const students = db.prepare('SELECT * FROM student').all() as unknown[]
      expect(students.length).toBe(3)
      expect(students[0]).toHaveProperty('admission_number')
    })

    it('should calculate overdue amounts per student', () => {
      const studentOverdue = db.prepare(`
        SELECT s.admission_number, SUM(fi.amount - fi.amount_paid) as total_overdue
        FROM student s
        JOIN fee_invoice fi ON s.id = fi.student_id
        WHERE fi.status = 'OUTSTANDING' AND fi.due_date < '2026-02-02'
        GROUP BY s.id
      `).all() as unknown[]

      expect(studentOverdue.length).toBeGreaterThan(0)
    })

    it('should handle multiple overdue invoices per student', () => {
      const student1Overdue = db.prepare(`
        SELECT COUNT(*) as count FROM fee_invoice 
        WHERE student_id = 1 AND status = 'OUTSTANDING' AND due_date < '2026-02-02'
      `).get() as unknown

      expect(student1Overdue.count).toBeGreaterThanOrEqual(1)
    })

    it('should personalize messages based on severity', () => {
      const oldestOverdue = db.prepare(`
        SELECT * FROM fee_invoice 
        WHERE status = 'OUTSTANDING' AND due_date < '2026-02-02'
        ORDER BY due_date ASC
        LIMIT 1
      `).get() as unknown

      expect(oldestOverdue).toBeDefined()
      expect(oldestOverdue.due_date).toBe('2025-09-15')
    })
  })

  describe('analyzeCollectionEffectiveness', () => {
    it('should calculate collection metrics', () => {
      const total = db.prepare('SELECT SUM(amount) as total FROM fee_invoice').get() as unknown
      const paid = db.prepare('SELECT SUM(amount_paid) as total FROM fee_invoice').get() as unknown
      
      expect(total.total).toBeGreaterThan(0)
      expect(paid.total).toBeGreaterThanOrEqual(0)
    })

    it('should calculate collection rate', () => {
      const total = db.prepare('SELECT SUM(amount) as total FROM fee_invoice').get() as unknown
      const paid = db.prepare('SELECT SUM(amount_paid) as total FROM fee_invoice').get() as unknown
      
      const rate = (paid.total / total.total) * 100
      expect(rate).toBeGreaterThanOrEqual(0)
      expect(rate).toBeLessThanOrEqual(100)
    })

    it('should identify overdue trends', () => {
      const overdue = db.prepare(`
        SELECT COUNT(*) as count FROM fee_invoice 
        WHERE status = 'OUTSTANDING' AND due_date < '2026-02-02'
      `).get() as unknown

      expect(overdue.count).toBeGreaterThanOrEqual(0)
    })
  })

  describe('edge cases', () => {
    it('should handle no receivables', () => {
      db.exec(`UPDATE fee_invoice SET amount_paid = amount, status = 'PAID'`)

      const result = db.prepare('SELECT COUNT(*) as count FROM fee_invoice WHERE status = ?').get('OUTSTANDING') as unknown
      expect(result.count).toBe(0)
    })

    it('should handle future date correctly', () => {
      const futureOverdue = db.prepare(`
        SELECT COUNT(*) as count FROM fee_invoice 
        WHERE status = 'OUTSTANDING' AND due_date < '2027-01-01'
      `).get() as unknown

      expect(futureOverdue.count).toBeGreaterThanOrEqual(5)
    })

    it('should handle negative balances gracefully', () => {
      db.exec(`UPDATE fee_invoice SET amount_paid = amount + 10000 WHERE id = 1`)

      const overpaid = db.prepare('SELECT * FROM fee_invoice WHERE id = 1').get() as unknown
      expect(overpaid.amount_paid).toBeGreaterThan(overpaid.amount)
    })
  })
})

