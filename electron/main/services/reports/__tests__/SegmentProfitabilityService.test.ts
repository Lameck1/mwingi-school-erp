import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import { SegmentProfitabilityService } from '../SegmentProfitabilityService'

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
        uses_transport BOOLEAN DEFAULT 0,
        uses_boarding BOOLEAN DEFAULT 0
      );

      CREATE TABLE invoice (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        item_type TEXT NOT NULL,
        amount REAL NOT NULL,
        paid_amount REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE expense (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        expense_date DATE NOT NULL
      );

      CREATE TABLE activity_fee (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        activity_name TEXT NOT NULL,
        student_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Insert test students
      INSERT INTO student (first_name, last_name, uses_transport, uses_boarding)
      VALUES 
        ('John', 'Doe', 1, 0),      -- Transport only
        ('Jane', 'Smith', 0, 1),    -- Boarding only
        ('Bob', 'Johnson', 1, 1),   -- Both
        ('Alice', 'Brown', 0, 0);   -- Neither

      -- Insert transport invoices
      INSERT INTO invoice (student_id, item_type, amount, paid_amount, created_at)
      VALUES 
        (1, 'TRANSPORT', 15000, 15000, '2026-01-05'),
        (3, 'TRANSPORT', 15000, 15000, '2026-01-05');

      -- Insert boarding invoices
      INSERT INTO invoice (student_id, item_type, amount, paid_amount, created_at)
      VALUES 
        (2, 'BOARDING', 40000, 40000, '2026-01-05'),
        (3, 'BOARDING', 40000, 40000, '2026-01-05');

      -- Insert activity fees
      INSERT INTO activity_fee (activity_name, student_id, amount, created_at)
      VALUES 
        ('Music Club', 1, 5000, '2026-01-10'),
        ('Sports Team', 2, 8000, '2026-01-10'),
        ('Drama Club', 3, 6000, '2026-01-10'),
        ('Science Club', 4, 7000, '2026-01-10');

      -- Insert expenses
      INSERT INTO expense (category, amount, expense_date)
      VALUES 
        ('TRANSPORT_FUEL', 8000, '2026-01-15'),
        ('TRANSPORT_MAINTENANCE', 4000, '2026-01-20'),
        ('BOARDING_FOOD', 50000, '2026-01-10'),
        ('BOARDING_UTILITIES', 15000, '2026-01-15'),
        ('ACTIVITY_SUPPLIES', 10000, '2026-01-12');
    `)

    service = new SegmentProfitabilityService(db)
  })

  afterEach(() => {
    db.close()
  })

  describe('analyzeTransportProfitability', () => {
    it('should calculate transport segment metrics', () => {
      const result = service.analyzeTransportProfitability('2026-01-01', '2026-01-31')

      expect(result).toHaveProperty('revenue')
      expect(result).toHaveProperty('expenses')
      expect(result).toHaveProperty('netProfit')
      expect(result).toHaveProperty('profitMargin')
      expect(result).toHaveProperty('studentsServed')
    })

    it('should calculate transport revenue correctly', () => {
      const result = service.analyzeTransportProfitability('2026-01-01', '2026-01-31')

      // 2 students * 15000 = 30000
      expect(result.revenue).toBe(30000)
    })

    it('should calculate transport expenses correctly', () => {
      const result = service.analyzeTransportProfitability('2026-01-01', '2026-01-31')

      // Fuel 8000 + Maintenance 4000 = 12000
      expect(result.expenses).toBe(12000)
    })

    it('should calculate net profit correctly', () => {
      const result = service.analyzeTransportProfitability('2026-01-01', '2026-01-31')

      // Revenue 30000 - Expenses 12000 = 18000
      expect(result.netProfit).toBe(18000)
    })

    it('should calculate profit margin percentage', () => {
      const result = service.analyzeTransportProfitability('2026-01-01', '2026-01-31')

      // (18000 / 30000) * 100 = 60%
      expect(result.profitMargin).toBe(60)
    })

    it('should count students served correctly', () => {
      const result = service.analyzeTransportProfitability('2026-01-01', '2026-01-31')

      expect(result.studentsServed).toBe(2)
    })

    it('should calculate per-student metrics', () => {
      const result = service.analyzeTransportProfitability('2026-01-01', '2026-01-31')

      expect(result).toHaveProperty('revenuePerStudent')
      expect(result).toHaveProperty('expensePerStudent')
      
      expect(result.revenuePerStudent).toBe(15000)
      expect(result.expensePerStudent).toBe(6000)
    })
  })

  describe('analyzeBoardingProfitability', () => {
    it('should calculate boarding segment metrics', () => {
      const result = service.analyzeBoardingProfitability('2026-01-01', '2026-01-31')

      expect(result).toHaveProperty('revenue')
      expect(result).toHaveProperty('expenses')
      expect(result).toHaveProperty('netProfit')
      expect(result).toHaveProperty('profitMargin')
      expect(result).toHaveProperty('studentsServed')
    })

    it('should calculate boarding revenue correctly', () => {
      const result = service.analyzeBoardingProfitability('2026-01-01', '2026-01-31')

      // 2 students * 40000 = 80000
      expect(result.revenue).toBe(80000)
    })

    it('should calculate boarding expenses correctly', () => {
      const result = service.analyzeBoardingProfitability('2026-01-01', '2026-01-31')

      // Food 50000 + Utilities 15000 = 65000
      expect(result.expenses).toBe(65000)
    })

    it('should calculate net profit correctly', () => {
      const result = service.analyzeBoardingProfitability('2026-01-01', '2026-01-31')

      // Revenue 80000 - Expenses 65000 = 15000
      expect(result.netProfit).toBe(15000)
    })

    it('should identify low margins', () => {
      const result = service.analyzeBoardingProfitability('2026-01-01', '2026-01-31')

      // (15000 / 80000) * 100 = 18.75%
      expect(result.profitMargin).toBe(18.75)
      expect(result.profitMargin).toBeLessThan(25) // Flag as low margin
    })

    it('should count students served correctly', () => {
      const result = service.analyzeBoardingProfitability('2026-01-01', '2026-01-31')

      expect(result.studentsServed).toBe(2)
    })
  })

  describe('analyzeActivityFees', () => {
    it('should calculate activity fee metrics', () => {
      const result = service.analyzeActivityFees('2026-01-01', '2026-01-31')

      expect(result).toHaveProperty('totalRevenue')
      expect(result).toHaveProperty('totalExpenses')
      expect(result).toHaveProperty('netProfit')
      expect(result).toHaveProperty('activities')
    })

    it('should calculate total activity revenue', () => {
      const result = service.analyzeActivityFees('2026-01-01', '2026-01-31')

      // 5000 + 8000 + 6000 + 7000 = 26000
      expect(result.totalRevenue).toBe(26000)
    })

    it('should break down by activity', () => {
      const result = service.analyzeActivityFees('2026-01-01', '2026-01-31')

      expect(result.activities).toHaveLength(4)
      
      const musicClub = result.activities.find(a => a.name === 'Music Club')
      expect(musicClub?.revenue).toBe(5000)
      expect(musicClub?.participants).toBe(1)
    })

    it('should identify most profitable activities', () => {
      const result = service.analyzeActivityFees('2026-01-01', '2026-01-31')

      const sortedByRevenue = [...result.activities].sort((a, b) => b.revenue - a.revenue)
      expect(sortedByRevenue[0].name).toBe('Sports Team')
      expect(sortedByRevenue[0].revenue).toBe(8000)
    })

    it('should calculate net profit after expenses', () => {
      const result = service.analyzeActivityFees('2026-01-01', '2026-01-31')

      // Revenue 26000 - Expenses 10000 = 16000
      expect(result.netProfit).toBe(16000)
    })
  })

  describe('generateOverallProfitability', () => {
    it('should provide comprehensive profitability analysis', () => {
      const result = service.generateOverallProfitability('2026-01-01', '2026-01-31')

      expect(result).toHaveProperty('transport')
      expect(result).toHaveProperty('boarding')
      expect(result).toHaveProperty('activities')
      expect(result).toHaveProperty('totalRevenue')
      expect(result).toHaveProperty('totalExpenses')
      expect(result).toHaveProperty('netProfit')
      expect(result).toHaveProperty('overallMargin')
    })

    it('should calculate total revenue across segments', () => {
      const result = service.generateOverallProfitability('2026-01-01', '2026-01-31')

      // Transport 30000 + Boarding 80000 + Activities 26000 = 136000
      expect(result.totalRevenue).toBe(136000)
    })

    it('should calculate total expenses across segments', () => {
      const result = service.generateOverallProfitability('2026-01-01', '2026-01-31')

      // Transport 12000 + Boarding 65000 + Activities 10000 = 87000
      expect(result.totalExpenses).toBe(87000)
    })

    it('should calculate overall net profit', () => {
      const result = service.generateOverallProfitability('2026-01-01', '2026-01-31')

      // Revenue 136000 - Expenses 87000 = 49000
      expect(result.netProfit).toBe(49000)
    })

    it('should calculate overall profit margin', () => {
      const result = service.generateOverallProfitability('2026-01-01', '2026-01-31')

      // (49000 / 136000) * 100 = 36.03%
      expect(result.overallMargin).toBeCloseTo(36.03, 1)
    })

    it('should identify most and least profitable segments', () => {
      const result = service.generateOverallProfitability('2026-01-01', '2026-01-31')

      expect(result).toHaveProperty('mostProfitableSegment')
      expect(result).toHaveProperty('leastProfitableSegment')
      
      // Transport has highest margin (60%)
      expect(result.mostProfitableSegment).toBe('TRANSPORT')
      
      // Boarding has lowest margin (18.75%)
      expect(result.leastProfitableSegment).toBe('BOARDING')
    })

    it('should provide strategic recommendations', () => {
      const result = service.generateOverallProfitability('2026-01-01', '2026-01-31')

      expect(result).toHaveProperty('recommendations')
      expect(Array.isArray(result.recommendations)).toBe(true)
      expect(result.recommendations.length).toBeGreaterThan(0)
    })
  })

  describe('compareSegments', () => {
    it('should provide comparative segment analysis', () => {
      const result = service.compareSegments('2026-01-01', '2026-01-31')

      expect(result).toHaveProperty('segments')
      expect(result.segments).toHaveLength(3)
    })

    it('should rank segments by profitability', () => {
      const result = service.compareSegments('2026-01-01', '2026-01-31')

      const sorted = [...result.segments].sort((a, b) => b.profitMargin - a.profitMargin)
      expect(sorted[0].name).toBe('Transport')
      expect(sorted[2].name).toBe('Boarding')
    })

    it('should show segment contribution to total revenue', () => {
      const result = service.compareSegments('2026-01-01', '2026-01-31')

      const totalRevenue = result.segments.reduce((sum, s) => sum + s.revenue, 0)
      expect(totalRevenue).toBe(136000)

      result.segments.forEach(segment => {
        expect(segment).toHaveProperty('revenueContribution')
        expect(segment.revenueContribution).toBeGreaterThan(0)
        expect(segment.revenueContribution).toBeLessThanOrEqual(100)
      })
    })
  })

  describe('edge cases', () => {
    it('should handle segment with no revenue', () => {
      db.exec(`DELETE FROM invoice WHERE item_type = 'TRANSPORT'`)

      const result = service.analyzeTransportProfitability('2026-01-01', '2026-01-31')

      expect(result.revenue).toBe(0)
      expect(result.netProfit).toBeLessThan(0) // Negative due to expenses
    })

    it('should handle segment with no expenses', () => {
      db.exec(`DELETE FROM expense WHERE category LIKE 'ACTIVITY%'`)

      const result = service.analyzeActivityFees('2026-01-01', '2026-01-31')

      expect(result.totalExpenses).toBe(0)
      expect(result.netProfit).toBe(result.totalRevenue)
      expect(result.profitMargin).toBe(100)
    })

    it('should handle empty date range', () => {
      const result = service.generateOverallProfitability('2025-01-01', '2025-01-31')

      expect(result.totalRevenue).toBe(0)
      expect(result.totalExpenses).toBe(0)
      expect(result.netProfit).toBe(0)
    })

    it('should handle invalid date range', () => {
      const result = service.generateOverallProfitability('2026-02-01', '2026-01-01')

      expect(result.totalRevenue).toBe(0)
    })
  })
})
