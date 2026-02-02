import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import { FeeProrationService } from '../FeeProrationService'

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
        invoice_number TEXT UNIQUE NOT NULL,
        amount REAL NOT NULL,
        amount_paid REAL DEFAULT 0,
        status TEXT DEFAULT 'OUTSTANDING',
        is_prorated BOOLEAN DEFAULT 0,
        proration_percentage REAL,
        original_amount REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE pro_ration_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        invoice_id INTEGER NOT NULL,
        enrollment_date DATE NOT NULL,
        term_start_date DATE NOT NULL,
        term_end_date DATE NOT NULL,
        days_in_term INTEGER NOT NULL,
        days_enrolled INTEGER NOT NULL,
        proration_percentage REAL NOT NULL,
        original_amount REAL NOT NULL,
        prorated_amount REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

      -- Insert test term (90 days)
      INSERT INTO academic_term (term_name, start_date, end_date, is_current)
      VALUES ('Term 1 2026', '2026-01-01', '2026-03-31', 1);

      -- Insert invoice templates
      INSERT INTO invoice_template (grade, item_type, amount, is_prorated)
      VALUES 
        ('Grade 8', 'TUITION', 60000, 1),
        ('Grade 8', 'BOARDING', 45000, 1),
        ('Grade 8', 'TRANSPORT', 15000, 1),
        ('Grade 8', 'ACTIVITY', 5000, 0); -- Not prorated

      -- Insert test student
      INSERT INTO student (first_name, last_name, admission_number, enrollment_date)
      VALUES ('John', 'Doe', 'STU-001', '2026-01-15'); -- Enrolled 15 days into term
    `)

    service = new FeeProrationService(db)
  })

  afterEach(() => {
    db.close()
  })

  describe('generateProRatedInvoice', () => {
    it('should generate pro-rated invoice for mid-term enrollment', () => {
      const result = service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })

      expect(result.success).toBe(true)
      expect(result.invoicesGenerated).toBeGreaterThan(0)
    })

    it('should calculate correct proration percentage', () => {
      service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })

      const prorationLog = db.prepare('SELECT * FROM pro_ration_log WHERE student_id = ?').get(1) as any

      // Term: Jan 1 to Mar 31 = 90 days
      // Enrolled: Jan 15 to Mar 31 = 76 days
      // Percentage: (76/90) * 100 = 84.44%
      expect(prorationLog.days_in_term).toBe(90)
      expect(prorationLog.days_enrolled).toBe(76)
      expect(prorationLog.proration_percentage).toBeCloseTo(84.44, 1)
    })

    it('should apply proration to eligible fees', () => {
      service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })

      const invoices = db.prepare('SELECT * FROM invoice WHERE student_id = ?').all(1) as any[]

      // Check tuition (60000 * 0.8444 = 50664)
      const tuitionInvoice = invoices.find(inv => inv.invoice_number.includes('TUITION'))
      expect(tuitionInvoice.is_prorated).toBe(1)
      expect(tuitionInvoice.original_amount).toBe(60000)
      expect(tuitionInvoice.amount).toBeCloseTo(50664, 0)

      // Check boarding (45000 * 0.8444 = 37998)
      const boardingInvoice = invoices.find(inv => inv.invoice_number.includes('BOARDING'))
      expect(boardingInvoice.amount).toBeCloseTo(37998, 0)
    })

    it('should not prorate non-eligible fees', () => {
      service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })

      const invoices = db.prepare('SELECT * FROM invoice WHERE student_id = ?').all(1) as any[]

      // Activity fee should not be prorated
      const activityInvoice = invoices.find(inv => inv.invoice_number.includes('ACTIVITY'))
      expect(activityInvoice.is_prorated).toBe(0)
      expect(activityInvoice.amount).toBe(5000) // Full amount
    })

    it('should create proration audit log', () => {
      service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })

      const prorationLogs = db.prepare('SELECT * FROM pro_ration_log WHERE student_id = ?').all(1) as any[]
      expect(prorationLogs.length).toBeGreaterThan(0)

      prorationLogs.forEach(log => {
        expect(log).toHaveProperty('enrollment_date')
        expect(log).toHaveProperty('proration_percentage')
        expect(log).toHaveProperty('original_amount')
        expect(log).toHaveProperty('prorated_amount')
      })
    })

    it('should handle enrollment on term start date', () => {
      const result = service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-01', // First day of term
        grade: 'Grade 8',
        userId: 10
      })

      expect(result.success).toBe(true)

      const prorationLog = db.prepare('SELECT * FROM pro_ration_log WHERE student_id = ?').get(1) as any
      expect(prorationLog.proration_percentage).toBe(100) // Full fee
    })

    it('should handle enrollment on last day of term', () => {
      const result = service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-03-31', // Last day
        grade: 'Grade 8',
        userId: 10
      })

      expect(result.success).toBe(true)

      const prorationLog = db.prepare('SELECT * FROM pro_ration_log WHERE student_id = ?').get(1) as any
      // Should be just 1 day
      expect(prorationLog.days_enrolled).toBe(1)
      expect(prorationLog.proration_percentage).toBeCloseTo(1.11, 1)
    })

    it('should reject enrollment before term start', () => {
      const result = service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2025-12-01',
        grade: 'Grade 8',
        userId: 10
      })

      expect(result.success).toBe(false)
      expect(result.message).toContain('before term start')
    })

    it('should reject enrollment after term end', () => {
      const result = service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-04-01',
        grade: 'Grade 8',
        userId: 10
      })

      expect(result.success).toBe(false)
      expect(result.message).toContain('after term end')
    })

    it('should log audit trail', () => {
      service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })

      const auditLogs = db.prepare('SELECT * FROM audit_log WHERE action_type = ?').all('GENERATE_PRORATED_INVOICE') as any[]
      expect(auditLogs.length).toBeGreaterThan(0)
      expect(auditLogs[0].user_id).toBe(10)
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

      expect(details).toHaveProperty('student')
      expect(details).toHaveProperty('enrollmentDate')
      expect(details).toHaveProperty('term')
      expect(details).toHaveProperty('prorationPercentage')
      expect(details).toHaveProperty('invoices')
    })

    it('should show original vs prorated amounts', () => {
      const details = service.getProrationDetails(1)

      expect(details.invoices.length).toBeGreaterThan(0)

      const proratedInvoices = details.invoices.filter(inv => inv.is_prorated)
      proratedInvoices.forEach(inv => {
        expect(inv.original_amount).toBeGreaterThan(inv.amount)
        expect(inv).toHaveProperty('discount_amount')
      })
    })

    it('should calculate total savings', () => {
      const details = service.getProrationDetails(1)

      expect(details).toHaveProperty('totalOriginalAmount')
      expect(details).toHaveProperty('totalProratedAmount')
      expect(details).toHaveProperty('totalDiscount')

      expect(details.totalDiscount).toBeGreaterThan(0)
      expect(details.totalDiscount).toBe(details.totalOriginalAmount - details.totalProratedAmount)
    })
  })

  describe('validateEnrollmentDate', () => {
    it('should validate date within term', () => {
      const result = service.validateEnrollmentDate('2026-01-15')

      expect(result.isValid).toBe(true)
      expect(result.term).toBeDefined()
    })

    it('should reject date before term', () => {
      const result = service.validateEnrollmentDate('2025-12-01')

      expect(result.isValid).toBe(false)
      expect(result.reason).toContain('No active term')
    })

    it('should reject date after term', () => {
      const result = service.validateEnrollmentDate('2026-04-15')

      expect(result.isValid).toBe(false)
      expect(result.reason).toContain('No active term')
    })

    it('should accept term boundary dates', () => {
      const startResult = service.validateEnrollmentDate('2026-01-01')
      expect(startResult.isValid).toBe(true)

      const endResult = service.validateEnrollmentDate('2026-03-31')
      expect(endResult.isValid).toBe(true)
    })
  })

  describe('calculateProrationPercentage', () => {
    it('should calculate daily proration accurately', () => {
      const percentage = service.calculateProrationPercentage('2026-01-15', '2026-01-01', '2026-03-31')

      // 76 days enrolled / 90 days total = 84.44%
      expect(percentage).toBeCloseTo(84.44, 1)
    })

    it('should return 100% for full term', () => {
      const percentage = service.calculateProrationPercentage('2026-01-01', '2026-01-01', '2026-03-31')

      expect(percentage).toBe(100)
    })

    it('should handle leap year correctly', () => {
      // 2024 is a leap year
      const percentage = service.calculateProrationPercentage('2024-02-15', '2024-02-01', '2024-02-29')

      // 15 days enrolled / 29 days total = 51.72%
      expect(percentage).toBeCloseTo(51.72, 1)
    })

    it('should round to 2 decimal places', () => {
      const percentage = service.calculateProrationPercentage('2026-01-15', '2026-01-01', '2026-03-31')

      expect(percentage.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(2)
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

      expect(history.length).toBeGreaterThan(0)
      history.forEach(record => {
        expect(record).toHaveProperty('enrollment_date')
        expect(record).toHaveProperty('proration_percentage')
        expect(record).toHaveProperty('prorated_amount')
      })
    })

    it('should filter by date range', () => {
      const history = service.getProrationHistory(1, '2026-01-01', '2026-01-31')

      expect(history.length).toBeGreaterThan(0)
    })

    it('should show term-wide proration statistics', () => {
      const stats = service.getProrationHistory(1)

      const totalDiscount = stats.reduce((sum, s) => sum + (s.original_amount - s.prorated_amount), 0)
      expect(totalDiscount).toBeGreaterThan(0)
    })
  })

  describe('edge cases', () => {
    it('should handle student with no invoice templates', () => {
      db.exec('DELETE FROM invoice_template')

      const result = service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })

      expect(result.success).toBe(false)
      expect(result.message).toContain('No invoice templates')
    })

    it('should handle term with no current flag', () => {
      db.exec('UPDATE academic_term SET is_current = 0')

      const result = service.validateEnrollmentDate('2026-01-15')

      expect(result.isValid).toBe(false)
    })

    it('should handle very short term enrollment', () => {
      // Enroll on second-to-last day
      const result = service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-03-30',
        grade: 'Grade 8',
        userId: 10
      })

      expect(result.success).toBe(true)

      const prorationLog = db.prepare('SELECT * FROM pro_ration_log WHERE student_id = ?').get(1) as any
      expect(prorationLog.days_enrolled).toBe(2)
      expect(prorationLog.proration_percentage).toBeLessThan(5)
    })

    it('should handle invalid date format gracefully', () => {
      expect(() => {
        service.validateEnrollmentDate('invalid-date')
      }).toThrow()
    })

    it('should handle duplicate proration attempts', () => {
      service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })

      // Try to generate again
      const result = service.generateProRatedInvoice({
        studentId: 1,
        enrollmentDate: '2026-01-15',
        grade: 'Grade 8',
        userId: 10
      })

      // Should either prevent duplicate or handle gracefully
      expect(result).toHaveProperty('success')
    })
  })
})
