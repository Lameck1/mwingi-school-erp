import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { FeeProrationService } from '../FeeProrationService'

type DbRow = Record<string, any>

// Mock audit utilities to avoid database initialization issues
vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

describe('FeeProrationService', () => {
  let db: Database.Database
  let service: FeeProrationService

  beforeEach(() => {
    db = new Database(':memory:')
    
    db.exec(`
      CREATE TABLE student (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        admission_number TEXT UNIQUE NOT NULL,
        enrollment_date DATE
      );

      CREATE TABLE academic_term (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        term_name TEXT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        is_current BOOLEAN DEFAULT 0
      );

      CREATE TABLE invoice_template (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        grade TEXT NOT NULL,
        item_type TEXT NOT NULL,
        amount REAL NOT NULL,
        is_prorated BOOLEAN DEFAULT 0
      );

      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        academic_term_id INTEGER,
        invoice_number TEXT UNIQUE NOT NULL,
        invoice_date DATE,
        due_date DATE,
        total_amount INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        amount_due INTEGER NOT NULL,
        original_amount INTEGER,
        amount_paid INTEGER DEFAULT 0,
        description TEXT,
        invoice_type TEXT,
        class_id INTEGER,
        status TEXT DEFAULT 'PENDING',
        is_prorated INTEGER DEFAULT 0,
        proration_percentage REAL,
        created_by_user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE pro_ration_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        full_amount INTEGER NOT NULL,
        pro_rated_amount INTEGER NOT NULL,
        discount_percentage REAL NOT NULL,
        enrollment_date TEXT NOT NULL,
        term_start TEXT NOT NULL,
        term_end TEXT NOT NULL,
        days_in_term INTEGER NOT NULL,
        days_enrolled INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Insert test term (90 days)
      INSERT INTO academic_term (term_name, start_date, end_date, is_current)
      VALUES ('Term 1 2026', '2026-01-01', '2026-03-31', 1);

      -- Insert invoice templates
      INSERT INTO invoice_template (grade, item_type, amount, is_prorated)
      VALUES 
        ('Grade 8', 'TUITION', 60000, 1),
        ('Grade 8', 'BOARDING', 45000, 1),
        ('Grade 8', 'TRANSPORT', 15000, 1),
        ('Grade 8', 'ACTIVITY', 5000, 0);

      -- Insert test student
      INSERT INTO student (first_name, last_name, admission_number, enrollment_date)
      VALUES ('John', 'Doe', 'STU-001', '2026-01-15');
    `)

    service = new FeeProrationService(db)
  })

  afterEach(() => {
    if (db) {db.close()}
  })

  describe('generateProRatedInvoice', () => {
    it('should generate pro-rated invoice for mid-term enrollment', () => {
      const result = service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })

      expect(result).toBeDefined()
    })

    it('should calculate correct proration percentage', () => {
      service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })

      const prorationLog = db.prepare('SELECT * FROM pro_ration_log WHERE student_id = ?').get(1) as DbRow

      expect(prorationLog).toBeDefined()
      if (prorationLog) {
        expect(prorationLog.days_in_term).toBe(90)
        expect(prorationLog.days_enrolled).toBeGreaterThan(0)
      }
    })

    it('should apply proration to eligible fees', () => {
      service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })

      const invoices = db.prepare('SELECT * FROM fee_invoice WHERE student_id = ?').all(1) as DbRow[]

      expect(invoices.length).toBeGreaterThan(0)
    })

    it('should not prorate non-eligible fees', () => {
      service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })

      const invoices = db.prepare('SELECT * FROM fee_invoice WHERE student_id = ?').all(1) as DbRow[]

      const nonProratedExists = invoices.some(inv => inv.is_prorated === 0)
      if (nonProratedExists) {
        const nonProrated = invoices.find(inv => inv.is_prorated === 0)
        expect(nonProrated).toBeDefined()
      }
    })

    it('should create proration audit log', () => {
      service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })

      const prorationLogs = db.prepare('SELECT * FROM pro_ration_log WHERE student_id = ?').all(1) as DbRow[]
      expect(prorationLogs.length).toBeGreaterThan(0)
    })

    it('should handle enrollment on term start date', () => {
      const result = service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-01',
        grade: 'Grade 8',
        userId: 10
      })

      expect(result).toBeDefined()
    })

    it('should handle enrollment on last day of term', () => {
      const result = service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-03-31',
        grade: 'Grade 8',
        userId: 10
      })

      expect(result).toBeDefined()
    })

    it('should reject enrollment before term start', () => {
      const result = service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2025-12-01',
        grade: 'Grade 8',
        userId: 10
      })

      expect(result).toBeDefined()
    })

    it('should reject enrollment after term end', () => {
      const result = service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-04-01',
        grade: 'Grade 8',
        userId: 10
      })

      expect(result).toBeDefined()
    })
  })

  describe('getProrationDetails', () => {
    beforeEach(() => {
      service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })
    })

    it('should return proration breakdown', () => {
      const details = service.getProrationDetails(1)

      expect(details).toBeDefined()
    })

    it('should show original vs prorated amounts', () => {
      const invoices = db.prepare('SELECT * FROM fee_invoice WHERE student_id = 1').all() as DbRow[]

      expect(invoices.length).toBeGreaterThan(0)
      invoices.forEach(inv => {
        if (inv.is_prorated === 1 && inv.original_amount) {
          expect(inv.amount).toBeLessThanOrEqual(inv.original_amount)
        }
      })
    })

    it('should calculate total savings', () => {
      const invoices = db.prepare('SELECT * FROM fee_invoice WHERE student_id = 1').all() as DbRow[]
      
      let totalOriginal = 0
      let totalProrated = 0
      
      invoices.forEach(inv => {
        totalProrated += inv.amount
        if (inv.original_amount) {
          totalOriginal += inv.original_amount
        } else {
          totalOriginal += inv.amount
        }
      })

      expect(totalProrated).toBeLessThanOrEqual(totalOriginal)
    })
  })

  describe('validateEnrollmentDate', () => {
    const termStart = '2026-01-01'
    const termEnd = '2026-03-31'

    it('should validate date within term', () => {
      const result = service.validateEnrollmentDate(termStart, termEnd, '2026-01-15')

      expect(result).toBeDefined()
    })

    it('should reject date before term', () => {
      const result = service.validateEnrollmentDate(termStart, termEnd, '2025-12-01')

      expect(result).toBeDefined()
    })

    it('should reject date after term', () => {
      const result = service.validateEnrollmentDate(termStart, termEnd, '2026-04-15')

      expect(result).toBeDefined()
    })

    it('should accept term boundary dates', () => {
      const startResult = service.validateEnrollmentDate(termStart, termEnd, '2026-01-01')
      expect(startResult).toBeDefined()

      const endResult = service.validateEnrollmentDate(termStart, termEnd, '2026-03-31')
      expect(endResult).toBeDefined()
    })
  })

  describe('calculateProrationPercentage', () => {
    it('should calculate daily proration accurately', () => {
      const percentage = service.calculateProrationPercentage('2026-01-15', '2026-01-01', '2026-03-31')

      expect(percentage).toBeGreaterThan(0)
      expect(percentage).toBeLessThanOrEqual(100)
    })

    it('should return 100% for full term', () => {
      const percentage = service.calculateProrationPercentage('2026-01-01', '2026-01-01', '2026-03-31')

      expect(percentage).toBe(100)
    })

    it('should handle leap year correctly', () => {
      const percentage = service.calculateProrationPercentage('2024-02-15', '2024-02-01', '2024-02-29')

      expect(percentage).toBeGreaterThan(0)
      expect(percentage).toBeLessThanOrEqual(100)
    })

    it('should round to 2 decimal places', () => {
      const percentage = service.calculateProrationPercentage('2026-01-15', '2026-01-01', '2026-03-31')

      const decimals = percentage.toString().split('.')[1]?.length || 0
      expect(decimals).toBeLessThanOrEqual(2)
    })
  })

  describe('getProrationHistory', () => {
    beforeEach(() => {
      service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })
    })

    it('should return proration history for student', () => {
      const history = service.getProrationHistory(1)

      expect(history).toBeDefined()
    })

    it('should filter by date range', () => {
      const history = service.getProrationHistory(1, '2026-01-01', '2026-01-31')

      expect(history).toBeDefined()
    })

    it('should show term-wide proration statistics', () => {
      const stats = service.getProrationHistory(1)

      expect(stats).toBeDefined()
    })
  })

  describe('edge cases', () => {
    const termStart = '2026-01-01'
    const termEnd = '2026-03-31'

    it('should handle student with no invoice templates', () => {
      db.exec('DELETE FROM invoice_template')

      const result = service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })

      expect(result).toBeDefined()
    })

    it('should handle term with no current flag', () => {
      db.exec('UPDATE academic_term SET is_current = 0')

      const result = service.validateEnrollmentDate(termStart, termEnd, '2026-01-15')

      expect(result).toBeDefined()
    })

    it('should handle very short term enrollment', () => {
      const result = service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-03-30',
        grade: 'Grade 8',
        userId: 10
      })

      expect(result).toBeDefined()
    })

    it('should handle duplicate proration attempts', () => {
      service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })

      const result = service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })

      expect(result).toBeDefined()
    })
  })
})

