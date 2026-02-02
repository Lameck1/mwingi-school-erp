import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import { CashFlowStatementService } from '../CashFlowStatementService'

describe('CashFlowStatementService', () => {
  let db: Database.Database
  let service: CashFlowStatementService

  beforeEach(() => {
    db = new Database(':memory:')
    
    db.exec(`
      CREATE TABLE payment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        payment_date DATE NOT NULL,
        payment_method TEXT NOT NULL,
        status TEXT DEFAULT 'ACTIVE'
      );

      CREATE TABLE expense (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        expense_date DATE NOT NULL,
        description TEXT
      );

      CREATE TABLE asset_purchase (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_name TEXT NOT NULL,
        purchase_amount REAL NOT NULL,
        purchase_date DATE NOT NULL
      );

      CREATE TABLE loan (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        loan_type TEXT NOT NULL,
        amount REAL NOT NULL,
        disbursement_date DATE NOT NULL
      );

      CREATE TABLE loan_repayment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        loan_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        payment_date DATE NOT NULL
      );

      -- Insert test data
      INSERT INTO payment (student_id, amount, payment_date, payment_method, status)
      VALUES 
        (1, 50000, '2026-01-15', 'MPESA', 'ACTIVE'),
        (2, 75000, '2026-01-20', 'BANK', 'ACTIVE'),
        (3, 30000, '2026-01-25', 'CASH', 'ACTIVE');

      INSERT INTO expense (category, amount, expense_date, description)
      VALUES 
        ('SALARIES', 200000, '2026-01-31', 'Staff salaries'),
        ('UTILITIES', 15000, '2026-01-10', 'Electricity bill'),
        ('SUPPLIES', 25000, '2026-01-15', 'Office supplies');

      INSERT INTO asset_purchase (asset_name, purchase_amount, purchase_date)
      VALUES 
        ('Computer', 80000, '2026-01-20'),
        ('Furniture', 45000, '2026-01-25');

      INSERT INTO loan (loan_type, amount, disbursement_date)
      VALUES 
        ('BANK_LOAN', 500000, '2026-01-10');

      INSERT INTO loan_repayment (loan_id, amount, payment_date)
      VALUES 
        (1, 50000, '2026-01-31');
    `)

    service = new CashFlowStatementService(db)
  })

  afterEach(() => {
    db.close()
  })

  describe('getCashFlowStatement', () => {
    it('should generate complete cash flow statement', () => {
      const result = service.getCashFlowStatement('2026-01-01', '2026-01-31')

      expect(result).toHaveProperty('operatingActivities')
      expect(result).toHaveProperty('investingActivities')
      expect(result).toHaveProperty('financingActivities')
      expect(result).toHaveProperty('netCashFlow')
      expect(result).toHaveProperty('openingBalance')
      expect(result).toHaveProperty('closingBalance')
    })

    it('should calculate operating activities correctly', () => {
      const result = service.getCashFlowStatement('2026-01-01', '2026-01-31')

      expect(result.operatingActivities.cashFromFees).toBe(155000) // Sum of all payments
      expect(result.operatingActivities.salariesPaid).toBe(200000)
      expect(result.operatingActivities.utilitiesPaid).toBe(15000)
      expect(result.operatingActivities.suppliesPaid).toBe(25000)
      
      const netOperating = 155000 - 200000 - 15000 - 25000
      expect(result.operatingActivities.netOperatingCashFlow).toBe(netOperating)
    })

    it('should calculate investing activities correctly', () => {
      const result = service.getCashFlowStatement('2026-01-01', '2026-01-31')

      expect(result.investingActivities.assetPurchases).toBe(125000) // 80000 + 45000
      expect(result.investingActivities.netInvestingCashFlow).toBe(-125000)
    })

    it('should calculate financing activities correctly', () => {
      const result = service.getCashFlowStatement('2026-01-01', '2026-01-31')

      expect(result.financingActivities.loansReceived).toBe(500000)
      expect(result.financingActivities.loanRepayments).toBe(50000)
      expect(result.financingActivities.netFinancingCashFlow).toBe(450000)
    })

    it('should calculate net cash flow correctly', () => {
      const result = service.getCashFlowStatement('2026-01-01', '2026-01-31')

      const expectedNetCashFlow = 
        result.operatingActivities.netOperatingCashFlow +
        result.investingActivities.netInvestingCashFlow +
        result.financingActivities.netFinancingCashFlow

      expect(result.netCashFlow).toBe(expectedNetCashFlow)
    })

    it('should handle empty date range', () => {
      const result = service.getCashFlowStatement('2025-01-01', '2025-01-31')

      expect(result.operatingActivities.cashFromFees).toBe(0)
      expect(result.investingActivities.netInvestingCashFlow).toBe(0)
      expect(result.financingActivities.netFinancingCashFlow).toBe(0)
      expect(result.netCashFlow).toBe(0)
    })

    it('should filter by date range correctly', () => {
      const result = service.getCashFlowStatement('2026-01-15', '2026-01-20')

      // Should only include transactions within range
      expect(result.operatingActivities.cashFromFees).toBe(125000) // 50000 + 75000
      expect(result.operatingActivities.utilitiesPaid).toBe(0) // Outside range
    })
  })

  describe('analyzeLiquidity', () => {
    it('should assess liquidity position', () => {
      const result = service.analyzeLiquidity('2026-01-01', '2026-01-31')

      expect(result).toHaveProperty('liquidityRatio')
      expect(result).toHaveProperty('daysOfCashCover')
      expect(result).toHaveProperty('liquidityStatus')
      expect(result).toHaveProperty('recommendation')
    })

    it('should identify healthy liquidity', () => {
      // Add more cash inflows
      db.exec(`
        INSERT INTO payment (student_id, amount, payment_date, payment_method, status)
        VALUES 
          (4, 500000, '2026-01-05', 'BANK', 'ACTIVE'),
          (5, 300000, '2026-01-10', 'BANK', 'ACTIVE')
      `)

      const result = service.analyzeLiquidity('2026-01-01', '2026-01-31')

      expect(result.liquidityStatus).toBe('HEALTHY')
      expect(result.liquidityRatio).toBeGreaterThan(1.5)
    })

    it('should identify critical liquidity issues', () => {
      // Add more expenses
      db.exec(`
        INSERT INTO expense (category, amount, expense_date, description)
        VALUES 
          ('OTHER', 500000, '2026-01-28', 'Large expense')
      `)

      const result = service.analyzeLiquidity('2026-01-01', '2026-01-31')

      expect(result.liquidityStatus).toBe('CRITICAL')
      expect(result.liquidityRatio).toBeLessThan(1)
    })

    it('should calculate days of cash cover', () => {
      const result = service.analyzeLiquidity('2026-01-01', '2026-01-31')

      expect(result.daysOfCashCover).toBeGreaterThan(0)
      expect(typeof result.daysOfCashCover).toBe('number')
    })
  })

  describe('forecastCashFlow', () => {
    it('should generate cash flow forecast', () => {
      const result = service.forecastCashFlow(3) // 3 months

      expect(result).toHaveLength(3)
      result.forEach(month => {
        expect(month).toHaveProperty('month')
        expect(month).toHaveProperty('projectedInflows')
        expect(month).toHaveProperty('projectedOutflows')
        expect(month).toHaveProperty('netProjection')
        expect(month).toHaveProperty('confidence')
      })
    })

    it('should base projections on historical data', () => {
      const forecast = service.forecastCashFlow(1)

      expect(forecast[0].projectedInflows).toBeGreaterThan(0)
      expect(forecast[0].projectedOutflows).toBeGreaterThan(0)
    })

    it('should calculate confidence levels', () => {
      const forecast = service.forecastCashFlow(3)

      forecast.forEach(month => {
        expect(month.confidence).toBeGreaterThanOrEqual(0)
        expect(month.confidence).toBeLessThanOrEqual(100)
      })

      // Confidence should decrease over time
      if (forecast.length > 1) {
        expect(forecast[0].confidence).toBeGreaterThanOrEqual(forecast[1].confidence)
      }
    })

    it('should handle custom periods', () => {
      const forecast6Months = service.forecastCashFlow(6)
      expect(forecast6Months).toHaveLength(6)
    })
  })

  describe('edge cases', () => {
    it('should handle voided payments', () => {
      db.exec(`UPDATE payment SET status = 'VOIDED' WHERE id = 1`)

      const result = service.getCashFlowStatement('2026-01-01', '2026-01-31')

      // Voided payment should not be included
      expect(result.operatingActivities.cashFromFees).toBe(105000) // Excluding first payment
    })

    it('should handle negative balances', () => {
      // Add huge expense
      db.exec(`
        INSERT INTO expense (category, amount, expense_date, description)
        VALUES ('OTHER', 1000000, '2026-01-30', 'Massive expense')
      `)

      const result = service.getCashFlowStatement('2026-01-01', '2026-01-31')

      expect(result.netCashFlow).toBeLessThan(0)
      expect(result.closingBalance).toBeLessThan(result.openingBalance)
    })

    it('should handle invalid date ranges', () => {
      const result = service.getCashFlowStatement('2026-02-01', '2026-01-01') // End before start

      expect(result.netCashFlow).toBe(0)
    })
  })
})
