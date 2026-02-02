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
        grade TEXT,
        contact_phone TEXT
      );

      CREATE TABLE invoice (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        invoice_number TEXT UNIQUE NOT NULL,
        amount REAL NOT NULL,
        paid_amount REAL DEFAULT 0,
        due_date DATE NOT NULL,
        status TEXT DEFAULT 'UNPAID',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE payment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        payment_date DATE NOT NULL,
        status TEXT DEFAULT 'ACTIVE'
      );

      -- Insert test students
      INSERT INTO student (first_name, last_name, admission_number, grade, contact_phone)
      VALUES 
        ('John', 'Doe', 'STU-001', 'Grade 8', '0712345678'),
        ('Jane', 'Smith', 'STU-002', 'Grade 9', '0723456789'),
        ('Bob', 'Johnson', 'STU-003', 'Grade 7', '0734567890');

      -- Insert test invoices with different aging
      INSERT INTO invoice (student_id, invoice_number, amount, paid_amount, due_date, status)
      VALUES 
        -- Current (within 30 days)
        (1, 'INV-001', 50000, 0, '2026-02-01', 'UNPAID'),
        
        -- 31-60 days overdue
        (1, 'INV-002', 40000, 0, '2025-12-15', 'UNPAID'),
        
        -- 61-90 days overdue
        (2, 'INV-003', 60000, 0, '2025-11-20', 'UNPAID'),
        
        -- 91-120 days overdue
        (2, 'INV-004', 35000, 0, '2025-10-25', 'UNPAID'),
        
        -- Over 120 days
        (3, 'INV-005', 80000, 0, '2025-09-15', 'UNPAID'),
        
        -- Partially paid
        (3, 'INV-006', 70000, 30000, '2025-12-01', 'PARTIALLY_PAID');
    `)

    service = new AgedReceivablesService(db)
  })

  afterEach(() => {
    db.close()
  })

  describe('getAgedReceivables', () => {
    it('should categorize receivables by aging buckets', () => {
      const result = service.getAgedReceivables('2026-02-02')

      expect(result).toHaveProperty('current')
      expect(result).toHaveProperty('days31to60')
      expect(result).toHaveProperty('days61to90')
      expect(result).toHaveProperty('days91to120')
      expect(result).toHaveProperty('over120')
      expect(result).toHaveProperty('total')
    })

    it('should calculate correct aging amounts', () => {
      const result = service.getAgedReceivables('2026-02-02')

      expect(result.current).toHaveLength(1)
      expect(result.current[0].balance).toBe(50000)

      expect(result.days31to60).toHaveLength(2) // INV-002 and INV-006
      
      expect(result.days61to90).toHaveLength(1)
      expect(result.days61to90[0].balance).toBe(60000)

      expect(result.days91to120).toHaveLength(1)
      expect(result.days91to120[0].balance).toBe(35000)

      expect(result.over120).toHaveLength(1)
      expect(result.over120[0].balance).toBe(80000)
    })

    it('should calculate total receivables correctly', () => {
      const result = service.getAgedReceivables('2026-02-02')

      const expectedTotal = 50000 + 40000 + 60000 + 35000 + 80000 + 40000 // Including partial payment balance
      expect(result.total).toBe(expectedTotal)
    })

    it('should include student details in aging report', () => {
      const result = service.getAgedReceivables('2026-02-02')

      const currentItem = result.current[0]
      expect(currentItem).toHaveProperty('student_name')
      expect(currentItem).toHaveProperty('admission_number')
      expect(currentItem).toHaveProperty('grade')
      expect(currentItem).toHaveProperty('contact_phone')
    })

    it('should calculate days overdue correctly', () => {
      const result = service.getAgedReceivables('2026-02-02')

      result.days31to60.forEach(item => {
        expect(item.days_overdue).toBeGreaterThanOrEqual(31)
        expect(item.days_overdue).toBeLessThanOrEqual(60)
      })

      result.days61to90.forEach(item => {
        expect(item.days_overdue).toBeGreaterThanOrEqual(61)
        expect(item.days_overdue).toBeLessThanOrEqual(90)
      })
    })

    it('should handle partially paid invoices', () => {
      const result = service.getAgedReceivables('2026-02-02')

      const partiallyPaid = result.days31to60.find(item => item.invoice_number === 'INV-006')
      expect(partiallyPaid).toBeDefined()
      expect(partiallyPaid?.balance).toBe(40000) // 70000 - 30000
    })

    it('should exclude fully paid invoices', () => {
      db.exec(`UPDATE invoice SET paid_amount = amount, status = 'PAID' WHERE invoice_number = 'INV-001'`)

      const result = service.getAgedReceivables('2026-02-02')

      const paidInvoice = result.current.find(item => item.invoice_number === 'INV-001')
      expect(paidInvoice).toBeUndefined()
    })
  })

  describe('determinePriority', () => {
    it('should assign HIGH priority to over 90 days', () => {
      const priorities = service.determinePriority('2026-02-02')

      const highPriority = priorities.filter(p => p.priority === 'HIGH')
      expect(highPriority.length).toBeGreaterThan(0)
      
      highPriority.forEach(item => {
        expect(item.days_overdue).toBeGreaterThan(90)
      })
    })

    it('should assign MEDIUM priority to 31-90 days', () => {
      const priorities = service.determinePriority('2026-02-02')

      const mediumPriority = priorities.filter(p => p.priority === 'MEDIUM')
      expect(mediumPriority.length).toBeGreaterThan(0)

      mediumPriority.forEach(item => {
        expect(item.days_overdue).toBeGreaterThanOrEqual(31)
        expect(item.days_overdue).toBeLessThanOrEqual(90)
      })
    })

    it('should assign LOW priority to current invoices', () => {
      const priorities = service.determinePriority('2026-02-02')

      const lowPriority = priorities.filter(p => p.priority === 'LOW')
      expect(lowPriority.length).toBeGreaterThan(0)

      lowPriority.forEach(item => {
        expect(item.days_overdue).toBeLessThanOrEqual(30)
      })
    })

    it('should include recommended actions', () => {
      const priorities = service.determinePriority('2026-02-02')

      priorities.forEach(item => {
        expect(item).toHaveProperty('recommendedAction')
        expect(item.recommendedAction).toBeTruthy()
      })
    })

    it('should sort by priority and then by days overdue', () => {
      const priorities = service.determinePriority('2026-02-02')

      // First items should be HIGH priority
      expect(priorities[0].priority).toBe('HIGH')
      
      // Within same priority, older should come first
      const highPriorityItems = priorities.filter(p => p.priority === 'HIGH')
      if (highPriorityItems.length > 1) {
        expect(highPriorityItems[0].days_overdue).toBeGreaterThanOrEqual(highPriorityItems[1].days_overdue)
      }
    })
  })

  describe('generateCollectionReminders', () => {
    it('should generate reminders for overdue invoices', () => {
      const reminders = service.generateCollectionReminders('2026-02-02')

      expect(reminders.length).toBeGreaterThan(0)
      reminders.forEach(reminder => {
        expect(reminder).toHaveProperty('student_name')
        expect(reminder).toHaveProperty('contact_phone')
        expect(reminder).toHaveProperty('total_overdue')
        expect(reminder).toHaveProperty('message')
      })
    })

    it('should calculate total overdue per student', () => {
      const reminders = service.generateCollectionReminders('2026-02-02')

      const student1Reminder = reminders.find(r => r.admission_number === 'STU-001')
      expect(student1Reminder).toBeDefined()
      expect(student1Reminder?.total_overdue).toBe(40000) // Only INV-002 is overdue
    })

    it('should personalize messages based on severity', () => {
      const reminders = service.generateCollectionReminders('2026-02-02')

      const severeOverdue = reminders.find(r => r.oldest_days_overdue > 120)
      expect(severeOverdue?.message).toContain('urgent')

      const moderateOverdue = reminders.find(r => {
        return r.oldest_days_overdue > 30 && r.oldest_days_overdue <= 120
      })
      if (moderateOverdue) {
        expect(moderateOverdue.message).toBeTruthy()
      }
    })

    it('should not generate reminders for students with no overdue', () => {
      // Pay all invoices for student 1 except current ones
      db.exec(`UPDATE invoice SET paid_amount = amount, status = 'PAID' WHERE student_id = 1 AND due_date < '2026-01-01'`)

      const reminders = service.generateCollectionReminders('2026-02-02')

      const student1Reminder = reminders.find(r => r.admission_number === 'STU-001')
      if (student1Reminder) {
        expect(student1Reminder.total_overdue).toBe(0)
      }
    })
  })

  describe('analyzeCollectionEffectiveness', () => {
    beforeEach(() => {
      // Add payment history
      db.exec(`
        INSERT INTO payment (student_id, amount, payment_date, status)
        VALUES 
          (1, 30000, '2026-01-15', 'ACTIVE'),
          (2, 45000, '2026-01-20', 'ACTIVE'),
          (3, 20000, '2026-01-25', 'ACTIVE')
      `)
    })

    it('should calculate collection metrics', () => {
      const analysis = service.analyzeCollectionEffectiveness('2026-01-01', '2026-01-31')

      expect(analysis).toHaveProperty('totalBilled')
      expect(analysis).toHaveProperty('totalCollected')
      expect(analysis).toHaveProperty('collectionRate')
      expect(analysis).toHaveProperty('averageCollectionTime')
      expect(analysis).toHaveProperty('overdueRate')
    })

    it('should calculate collection rate correctly', () => {
      const analysis = service.analyzeCollectionEffectiveness('2026-01-01', '2026-01-31')

      expect(analysis.collectionRate).toBeGreaterThanOrEqual(0)
      expect(analysis.collectionRate).toBeLessThanOrEqual(100)
    })

    it('should identify collection trends', () => {
      const analysis = service.analyzeCollectionEffectiveness('2026-01-01', '2026-01-31')

      expect(analysis).toHaveProperty('trend')
      expect(['IMPROVING', 'STABLE', 'DECLINING']).toContain(analysis.trend)
    })

    it('should provide recommendations', () => {
      const analysis = service.analyzeCollectionEffectiveness('2026-01-01', '2026-01-31')

      expect(analysis).toHaveProperty('recommendations')
      expect(Array.isArray(analysis.recommendations)).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('should handle no receivables', () => {
      db.exec(`UPDATE invoice SET paid_amount = amount, status = 'PAID'`)

      const result = service.getAgedReceivables('2026-02-02')

      expect(result.total).toBe(0)
      expect(result.current).toHaveLength(0)
    })

    it('should handle future date correctly', () => {
      const result = service.getAgedReceivables('2027-01-01')

      // All invoices should be overdue by now
      expect(result.current).toHaveLength(0)
      expect(result.over120.length).toBeGreaterThan(0)
    })

    it('should handle negative balances gracefully', () => {
      // Overpayment scenario
      db.exec(`UPDATE invoice SET paid_amount = amount + 10000 WHERE id = 1`)

      const result = service.getAgedReceivables('2026-02-02')

      // Overpaid invoice should not appear or should have 0 balance
      const overpaid = result.current.find(item => item.invoice_number === 'INV-001')
      if (overpaid) {
        expect(overpaid.balance).toBeLessThanOrEqual(0)
      }
    })
  })
})
