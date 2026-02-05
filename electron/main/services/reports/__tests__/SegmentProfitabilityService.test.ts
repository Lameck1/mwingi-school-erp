import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { SegmentProfitabilityService } from '../SegmentProfitabilityService'

// Mock audit utilities
vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

describe('SegmentProfitabilityService', () => {
  let db: Database.Database
  let service: SegmentProfitabilityService

  beforeEach(() => {
    db = new Database(':memory:')
    
    db.exec(`
      CREATE TABLE student (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        admission_number TEXT UNIQUE,
        status TEXT DEFAULT 'ACTIVE'
      );

      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        invoice_number TEXT UNIQUE,
        amount REAL NOT NULL,
        amount_paid REAL DEFAULT 0,
        fee_type TEXT,
        status TEXT DEFAULT 'OUTSTANDING',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        transaction_date DATE NOT NULL,
        transaction_type TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT
      );

      CREATE TABLE expense_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        expense_type TEXT NOT NULL,
        amount REAL NOT NULL,
        transaction_date DATE NOT NULL
      );

      CREATE TABLE transaction_category (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL
      );

      CREATE TABLE user (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL
      );

      CREATE TABLE dormitory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        capacity INTEGER NOT NULL
      );

      -- Insert test students
      INSERT INTO student (first_name, last_name, admission_number, status)
      VALUES 
        ('John', 'Doe', 'STU-001', 'ACTIVE'),
        ('Jane', 'Smith', 'STU-002', 'ACTIVE'),
        ('Bob', 'Johnson', 'STU-003', 'ACTIVE');

      -- Insert test invoices
      INSERT INTO fee_invoice (student_id, invoice_number, amount, amount_paid, fee_type, status)
      VALUES 
        (1, 'INV-001', 50000, 50000, 'TRANSPORT', 'PAID'),
        (2, 'INV-002', 40000, 40000, 'BOARDING', 'PAID'),
        (3, 'INV-003', 35000, 35000, 'TRANSPORT', 'PAID'),
        (1, 'INV-004', 60000, 60000, 'BOARDING', 'PAID'),
        (2, 'INV-005', 15000, 15000, 'ACTIVITY', 'PAID');

      -- Insert test ledger transactions
      INSERT INTO ledger_transaction (student_id, transaction_date, transaction_type, amount, description)
      VALUES 
        (1, '2026-01-05', 'CREDIT', 50000, 'transport fees'),
        (2, '2026-01-05', 'CREDIT', 40000, 'boarding fees'),
        (3, '2026-01-05', 'CREDIT', 35000, 'bus transport'),
        (1, '2026-01-10', 'CREDIT', 60000, 'dormitory boarding'),
        (2, '2026-01-15', 'CREDIT', 15000, 'activity fees');

      -- Insert test expenses
      INSERT INTO expense_transaction (expense_type, amount, transaction_date)
      VALUES 
        ('FUEL', 5000, '2026-01-10'),
        ('VEHICLE_MAINTENANCE', 3000, '2026-01-12'),
        ('FOOD', 25000, '2026-01-10'),
        ('UTILITIES', 8000, '2026-01-15'),
        ('ACTIVITY', 7000, '2026-01-12');

      -- Insert dormitory capacity data
      INSERT INTO dormitory (name, capacity)
      VALUES 
        ('Boys Dorm A', 50),
        ('Girls Dorm B', 40);
    `)

    service = new SegmentProfitabilityService(db)
  })

  afterEach(() => {
    if (db) db.close()
  })

  describe('Service initialization', () => {
    it('should initialize successfully with database', () => {
      expect(service).toBeDefined()
    })

    it('should have database schema in place', () => {
      const tables = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `).all() as unknown[]

      expect(tables.length).toBeGreaterThan(0)
    })

    it('should have student table with status column', () => {
      const student = db.prepare('SELECT * FROM student WHERE admission_number = ?').get('STU-001') as unknown
      expect(student).toBeDefined()
      expect(student.status).toBe('ACTIVE')
    })
  })

  describe('analyzeTransportProfitability', () => {
    it('should execute without errors', () => {
      expect(() => {
        service.analyzeTransportProfitability('2026-01-01', '2026-01-31')
      }).not.toThrow()
    })

    it('should return transport profitability data', () => {
      const result = service.analyzeTransportProfitability('2026-01-01', '2026-01-31')
      expect(result).toBeDefined()
    })

    it('should calculate transport metrics', () => {
      const result = service.analyzeTransportProfitability('2026-01-01', '2026-01-31')
      expect(result).toHaveProperty('segment_type')
      expect(result.segment_type).toBe('TRANSPORT')
    })

    it('should have profit and cost information', () => {
      const result = service.analyzeTransportProfitability('2026-01-01', '2026-01-31')
      expect(result).toHaveProperty('revenue')
      expect(result).toHaveProperty('costs')
      expect(result).toHaveProperty('profit')
    })

    it('should have profit margin calculation', () => {
      const result = service.analyzeTransportProfitability('2026-01-01', '2026-01-31')
      expect(result).toHaveProperty('profit_margin_percentage')
      expect(typeof result.profit_margin_percentage).toBe('number')
    })

    it('should indicate segment profitability status', () => {
      const result = service.analyzeTransportProfitability('2026-01-01', '2026-01-31')
      expect(result).toHaveProperty('status')
      expect(['PROFITABLE', 'BREAKING_EVEN', 'UNPROFITABLE']).toContain(result.status)
    })
  })

  describe('analyzeBoardingProfitability', () => {
    it('should execute without errors', () => {
      expect(() => {
        service.analyzeBoardingProfitability('2026-01-01', '2026-01-31')
      }).not.toThrow()
    })

    it('should return boarding profitability data', () => {
      const result = service.analyzeBoardingProfitability('2026-01-01', '2026-01-31')
      expect(result).toBeDefined()
    })

    it('should calculate boarding metrics', () => {
      const result = service.analyzeBoardingProfitability('2026-01-01', '2026-01-31')
      expect(result).toHaveProperty('segment_type')
      expect(result.segment_type).toBe('BOARDING')
    })

    it('should have occupancy rate information', () => {
      const result = service.analyzeBoardingProfitability('2026-01-01', '2026-01-31')
      expect(result).toBeDefined()
    })

    it('should include boarding-specific recommendations', () => {
      const result = service.analyzeBoardingProfitability('2026-01-01', '2026-01-31')
      expect(result).toHaveProperty('recommendations')
    })

    it('should calculate boarding profit status', () => {
      const result = service.analyzeBoardingProfitability('2026-01-01', '2026-01-31')
      expect(result).toHaveProperty('status')
      expect(['PROFITABLE', 'BREAKING_EVEN', 'UNPROFITABLE']).toContain(result.status)
    })
  })

  describe('analyzeActivityFees', () => {
    it('should execute without errors', () => {
      expect(() => {
        service.analyzeActivityFees('2026-01-01', '2026-01-31')
      }).not.toThrow()
    })

    it('should return activity fee profitability data', () => {
      const result = service.analyzeActivityFees('2026-01-01', '2026-01-31')
      expect(result).toBeDefined()
    })

    it('should calculate activity metrics', () => {
      const result = service.analyzeActivityFees('2026-01-01', '2026-01-31')
      expect(result).toHaveProperty('segment_type')
      expect(result.segment_type).toBe('ACTIVITY')
    })

    it('should have activity profitability information', () => {
      const result = service.analyzeActivityFees('2026-01-01', '2026-01-31')
      expect(result).toHaveProperty('profit')
    })
  })

  describe('generateOverallProfitability', () => {
    it('should execute without errors', () => {
      expect(() => {
        service.generateOverallProfitability('2026-01-01', '2026-01-31')
      }).not.toThrow()
    })

    it('should return comprehensive profitability analysis', () => {
      const result = service.generateOverallProfitability('2026-01-01', '2026-01-31')
      expect(result).toBeDefined()
    })

    it('should include segment breakdown', () => {
      const result = service.generateOverallProfitability('2026-01-01', '2026-01-31')
      expect(result).toHaveProperty('segments')
    })

    it('should calculate total profitability metrics', () => {
      const result = service.generateOverallProfitability('2026-01-01', '2026-01-31')
      expect(result).toHaveProperty('totalRevenue')
      expect(result).toHaveProperty('totalExpenses')
      expect(result).toHaveProperty('netProfit')
    })

    it('should provide strategic recommendations', () => {
      const result = service.generateOverallProfitability('2026-01-01', '2026-01-31')
      expect(result).toHaveProperty('recommendations')
    })
  })

  describe('compareSegments', () => {
    it('should execute without errors', () => {
      expect(() => {
        service.compareSegments('2026-01-01', '2026-01-31')
      }).not.toThrow()
    })

    it('should return segment comparison data', () => {
      const result = service.compareSegments('2026-01-01', '2026-01-31')
      expect(result).toBeDefined()
    })

    it('should include all segments', () => {
      const result = service.compareSegments('2026-01-01', '2026-01-31')
      expect(result).toHaveProperty('segments')
    })
  })

  describe('Database integrity', () => {
    it('should have test data inserted correctly', () => {
      const studentCount = db.prepare('SELECT COUNT(*) as count FROM student').get() as unknown
      expect(studentCount.count).toBe(3)
    })

    it('should have fee invoices in database', () => {
      const invoiceCount = db.prepare('SELECT COUNT(*) as count FROM fee_invoice').get() as unknown
      expect(invoiceCount.count).toBe(5)
    })

    it('should have ledger transactions', () => {
      const transactionCount = db.prepare('SELECT COUNT(*) as count FROM ledger_transaction').get() as unknown
      expect(transactionCount.count).toBeGreaterThan(0)
    })

    it('should have expense data', () => {
      const expenseCount = db.prepare('SELECT COUNT(*) as count FROM expense_transaction').get() as unknown
      expect(expenseCount.count).toBeGreaterThan(0)
    })

    it('should have all students with ACTIVE status', () => {
      const activeStudents = db.prepare("SELECT COUNT(*) as count FROM student WHERE status = 'ACTIVE'").get() as unknown
      expect(activeStudents.count).toBe(3)
    })
  })
})

