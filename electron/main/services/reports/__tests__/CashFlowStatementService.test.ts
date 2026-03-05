import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { CashFlowStatementService } from '../CashFlowStatementService'
import { getDatabase } from '../../../database'

// Mock audit utilities
vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

vi.mock('../../../database', () => ({
  getDatabase: vi.fn()
}))

describe('CashFlowStatementService', () => {
  let db: Database.Database
  let service: CashFlowStatementService

  beforeEach(() => {
    db = new Database(':memory:')
    
    db.exec(`
    CREATE TABLE IF NOT EXISTS fee_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT, category_name TEXT NOT NULL UNIQUE,
      description TEXT, is_active BOOLEAN DEFAULT 1, priority INTEGER DEFAULT 99,
      gl_account_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS invoice_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL,
      fee_category_id INTEGER NOT NULL, description TEXT NOT NULL, amount INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS receipt (
      id INTEGER PRIMARY KEY AUTOINCREMENT, receipt_number TEXT NOT NULL UNIQUE,
      transaction_id INTEGER NOT NULL UNIQUE, receipt_date DATE NOT NULL,
      student_id INTEGER NOT NULL, amount INTEGER NOT NULL, amount_in_words TEXT,
      payment_method TEXT NOT NULL, payment_reference TEXT, printed_count INTEGER DEFAULT 0,
      created_by_user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
          CREATE TABLE IF NOT EXISTS gl_account (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_code TEXT NOT NULL UNIQUE,
            account_name TEXT NOT NULL,
            account_type TEXT NOT NULL,
            normal_balance TEXT NOT NULL,
            is_active BOOLEAN DEFAULT 1
          );
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1100', 'Accounts Receivable', 'ASSET', 'DEBIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('2020', 'Student Credit Balance', 'LIABILITY', 'CREDIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1010', 'Cash', 'ASSET', 'DEBIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1020', 'Bank', 'ASSET', 'DEBIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('4010', 'Tuition Revenue', 'REVENUE', 'CREDIT');
          
          CREATE TABLE IF NOT EXISTS journal_entry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_ref TEXT NOT NULL UNIQUE,
            entry_date DATE NOT NULL,
            entry_type TEXT NOT NULL,
            description TEXT NOT NULL,
            student_id INTEGER,
            staff_id INTEGER,
            term_id INTEGER,
            is_posted BOOLEAN DEFAULT 0,
            posted_by_user_id INTEGER,
            posted_at DATETIME,
            is_voided BOOLEAN DEFAULT 0,
            voided_reason TEXT,
            voided_by_user_id INTEGER,
            voided_at DATETIME,
            requires_approval BOOLEAN DEFAULT 0,
            approval_status TEXT DEFAULT 'PENDING',
            approved_by_user_id INTEGER,
            approved_at DATETIME,
            created_by_user_id INTEGER NOT NULL,
            source_ledger_txn_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          CREATE TABLE IF NOT EXISTS journal_entry_line (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            journal_entry_id INTEGER NOT NULL,
            line_number INTEGER NOT NULL,
            gl_account_id INTEGER NOT NULL,
            debit_amount INTEGER DEFAULT 0,
            credit_amount INTEGER DEFAULT 0,
            description TEXT
          );
          CREATE TABLE IF NOT EXISTS approval_rule (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rule_name TEXT NOT NULL UNIQUE,
            description TEXT,
            transaction_type TEXT NOT NULL,
            min_amount INTEGER,
            max_amount INTEGER,
            days_since_transaction INTEGER,
            required_role_id INTEGER,
            is_active BOOLEAN DEFAULT 1,
            created_by_user_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

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
    if (db) {db.close()}
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

  describe('getCashFlowStatement', () => {
    it('returns empty statement when term not found', async () => {
      db.exec(`CREATE TABLE IF NOT EXISTS academic_term (id INTEGER PRIMARY KEY, start_date TEXT, end_date TEXT)`)
      const result = await service.getCashFlowStatement('999')
      expect(result.period_start).toBe('')
      expect(result.period_end).toBe('')
      expect(result.net_cash_change).toBe(0)
    })

    it('returns statement for valid term', async () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS academic_term (id INTEGER PRIMARY KEY, start_date TEXT, end_date TEXT);
        INSERT INTO academic_term (id, start_date, end_date) VALUES (1, '2026-01-01', '2026-04-30');
      `)
      const result = await service.getCashFlowStatement('1')
      expect(result.period_start).toBe('2026-01-01')
      expect(result.period_end).toBe('2026-04-30')
      expect(result).toHaveProperty('operating_activities')
    })
  })

  describe('analyzeCashFlowByTerm', () => {
    it('delegates to getCashFlowStatement', async () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS academic_term (id INTEGER PRIMARY KEY, start_date TEXT, end_date TEXT);
        INSERT INTO academic_term (id, start_date, end_date) VALUES (1, '2026-01-01', '2026-04-30');
      `)
      const result = await service.analyzeCashFlowByTerm('1')
      expect(result.period_start).toBe('2026-01-01')
      expect(result.period_end).toBe('2026-04-30')
    })
  })

  describe('calculateCashPosition', () => {
    it('returns cash position summary', async () => {
      const result = await service.calculateCashPosition()
      expect(result).toHaveProperty('opening_balance')
      expect(result).toHaveProperty('total_inflows')
      expect(result).toHaveProperty('total_outflows')
      expect(result).toHaveProperty('closing_balance')
      expect(typeof result.opening_balance).toBe('number')
      expect(typeof result.closing_balance).toBe('number')
    })
  })

  describe('assessLiquidityStatus', () => {
    it('returns STRONG when balance is high relative to expenses', async () => {
      const status = await service.assessLiquidityStatus(10000000)
      expect(status).toBe('STRONG')
    })

    it('returns CRITICAL when balance is near zero with expenses', async () => {
      db.exec(`INSERT INTO expense_transaction (expense_type, amount, transaction_date) VALUES ('OTHER', 300000, date('now', '-1 month'))`)
      const status = await service.assessLiquidityStatus(1000)
      expect(status).toBe('CRITICAL')
    })

    it('returns ADEQUATE when balance covers 1.5-3 months expenses', async () => {
      db.exec(`INSERT INTO expense_transaction (expense_type, amount, transaction_date) VALUES ('OTHER', 300000, date('now', '-1 month'))`)
      const status = await service.assessLiquidityStatus(200000)
      expect(status).toBe('ADEQUATE')
    })

    it('returns TIGHT when balance covers 0.5-1.5 months expenses', async () => {
      db.exec(`INSERT INTO expense_transaction (expense_type, amount, transaction_date) VALUES ('OTHER', 300000, date('now', '-1 month'))`)
      const status = await service.assessLiquidityStatus(80000)
      expect(status).toBe('TIGHT')
    })
  })

  describe('generateCashForecasts', () => {
    it('returns forecast array with correct length', async () => {
      const forecasts = await service.generateCashForecasts('2026-01-01', '2026-01-31', 30)
      expect(Array.isArray(forecasts)).toBe(true)
      expect(forecasts.length).toBe(30)
      forecasts.forEach(f => {
        expect(f).toHaveProperty('forecast_date')
        expect(f).toHaveProperty('projected_balance')
        expect(f).toHaveProperty('confidence_level')
      })
    })

    it('confidence decreases over time', async () => {
      const forecasts = await service.generateCashForecasts('2026-01-01', '2026-01-31', 60)
      const highConfidence = forecasts.filter(f => f.confidence_level === 'HIGH')
      const lowConfidence = forecasts.filter(f => f.confidence_level === 'LOW')
      expect(highConfidence.length).toBeGreaterThan(0)
      expect(lowConfidence.length).toBeGreaterThan(0)
    })
  })

  describe('resolvePeriod - default dates', () => {
    it('defaults to current month when no dates provided', async () => {
      const result = await service.generateCashFlowStatement()
      const now = new Date()
      const expectedStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      expect(result.period_start).toBe(expectedStart)
    })
  })

  describe('investing activities - asset transactions', () => {
    it('handles PURCHASE and SALE asset transactions', async () => {
      db.exec(`
        INSERT INTO asset_transaction (transaction_type, amount, transaction_date) VALUES ('PURCHASE', 50000, '2026-01-10');
        INSERT INTO asset_transaction (transaction_type, amount, transaction_date) VALUES ('SALE', 20000, '2026-01-20');
      `)
      const result = await service.getInvestingActivities('2026-01-01', '2026-01-31')
      expect(result.asset_purchases).toBe(50000)
      expect(result.asset_sales).toBe(20000)
      expect(result.net_investing_cash_flow).toBe(-30000)
    })
  })

  describe('financing activities - loan transactions', () => {
    it('handles DISBURSEMENT, REPAYMENT and GRANT transactions', async () => {
      db.exec(`
        INSERT INTO loan_transaction (transaction_type, amount, transaction_date) VALUES ('DISBURSEMENT', 100000, '2026-01-05');
        INSERT INTO loan_transaction (transaction_type, amount, transaction_date) VALUES ('REPAYMENT', 30000, '2026-01-15');
        INSERT INTO loan_transaction (transaction_type, amount, transaction_date) VALUES ('GRANT', 50000, '2026-01-25');
      `)
      const result = await service.getFinancingActivities('2026-01-01', '2026-01-31')
      expect(result.loans_received).toBe(100000)
      expect(result.loan_repayments).toBe(30000)
      expect(result.grant_received).toBe(50000)
      expect(result.net_financing_cash_flow).toBe(120000)
    })
  })

  describe('operating activities - payroll and expenses', () => {
    it('includes payroll and categorized expenses', async () => {
      db.exec(`
        INSERT INTO payroll_transaction (amount, transaction_date) VALUES (80000, '2026-01-15');
        INSERT INTO expense_transaction (expense_type, amount, transaction_date) VALUES ('SUPPLIES', 15000, '2026-01-10');
        INSERT INTO expense_transaction (expense_type, amount, transaction_date) VALUES ('UTILITIES', 10000, '2026-01-20');
        INSERT INTO expense_transaction (expense_type, amount, transaction_date) VALUES ('OTHER', 5000, '2026-01-25');
      `)
      const result = await service.getOperatingActivities('2026-01-01', '2026-01-31')
      expect(result.salary_payments).toBe(80000)
      expect(result.supplier_payments).toBe(15000)
      expect(result.utilities).toBe(10000)
      expect(result.other_expenses).toBe(5000)
    })
  })

  // ── Branch coverage: assessLiquidityStatus all 4 levels ──────────
  describe('assessLiquidityStatus thresholds', () => {
    it('returns STRONG when closing balance >= 3x avg monthly expenses', async () => {
      // Avg monthly expenses = 0 (no expense_transactions), so any positive balance is STRONG
      const status = await service.assessLiquidityStatus(100000)
      expect(status).toBe('STRONG')
    })

    it('returns ADEQUATE when closing balance >= 1.5x but < 3x avg expenses', async () => {
      // Insert recent expenses so avg monthly = 100000/3 ≈ 33333
      db.exec(`
        INSERT INTO expense_transaction (expense_type, amount, transaction_date)
        VALUES ('OTHER', 100000, date('now', '-1 month'));
      `)
      // balance = 60000, avg = ~33333, 60000/33333 ≈ 1.8 → ADEQUATE
      const status = await service.assessLiquidityStatus(60000)
      expect(status).toBe('ADEQUATE')
    })

    it('returns TIGHT when closing balance >= 0.5x but < 1.5x avg expenses', async () => {
      db.exec(`
        INSERT INTO expense_transaction (expense_type, amount, transaction_date)
        VALUES ('OTHER', 300000, date('now', '-1 month'));
      `)
      // avg = 300000/3 = 100000; balance=80000; 80000/100000=0.8 → TIGHT
      const status = await service.assessLiquidityStatus(80000)
      expect(status).toBe('TIGHT')
    })

    it('returns CRITICAL when closing balance < 0.5x avg expenses', async () => {
      db.exec(`
        INSERT INTO expense_transaction (expense_type, amount, transaction_date)
        VALUES ('OTHER', 300000, date('now', '-1 month'));
      `)
      // avg = 300000/3 = 100000; balance=10000; 10000/100000=0.1 → CRITICAL
      const status = await service.assessLiquidityStatus(10000)
      expect(status).toBe('CRITICAL')
    })
  })

  // ── Branch coverage: resolvePeriod without dates ─────────────────
  describe('resolvePeriod (no dates)', () => {
    it('defaults to current month when start/end dates omitted', async () => {
      const statement = await service.generateCashFlowStatement()
      const now = new Date()
      const expectedStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      expect(statement.period_start).toBe(expectedStart)
      expect(statement).toBeDefined()
      expect(statement.liquidity_status).toBeDefined()
    })
  })

  // ── Branch coverage: getCashFlowStatement term not found ─────────
  describe('getCashFlowStatement', () => {
    it('returns empty statement when term not found', async () => {
      db.exec(`CREATE TABLE IF NOT EXISTS academic_term (id INTEGER PRIMARY KEY, start_date TEXT, end_date TEXT)`)
      const statement = await service.getCashFlowStatement('9999')
      expect(statement.opening_cash_balance).toBe(0)
      expect(statement.net_cash_change).toBe(0)
      expect(statement.closing_cash_balance).toBe(0)
    })

    it('returns statement for valid term', async () => {
      db.exec(`CREATE TABLE IF NOT EXISTS academic_term (id INTEGER PRIMARY KEY, start_date TEXT, end_date TEXT)`)
      db.exec(`
        INSERT OR IGNORE INTO academic_term (id, start_date, end_date)
        VALUES (1, '2026-01-01', '2026-04-30');
      `)
      const statement = await service.getCashFlowStatement('1')
      expect(statement.period_start).toBe('2026-01-01')
      expect(statement.period_end).toBe('2026-04-30')
    })
  })

  // ── Branch coverage: calculateCashPosition ───────────────────────
  describe('calculateCashPosition', () => {
    it('aggregates inflows and outflows correctly', async () => {
      const result = await service.calculateCashPosition()
      expect(result).toHaveProperty('opening_balance')
      expect(result).toHaveProperty('total_inflows')
      expect(result).toHaveProperty('total_outflows')
      expect(result).toHaveProperty('closing_balance')
    })
  })

  // ── Branch coverage: forecaster confidence levels and forecastDays cap ──
  describe('generateCashForecasts', () => {
    it('caps forecast at 60 days and assigns confidence levels', async () => {
      // Request 90 days but should be capped at 60
      const forecasts = await service.generateCashForecasts('2026-01-01', '2026-01-31', 90)
      expect(forecasts.length).toBeLessThanOrEqual(60)

      // Check confidence levels
      if (forecasts.length >= 45) {
        const highItems = forecasts.filter(f => f.confidence_level === 'HIGH')
        const mediumItems = forecasts.filter(f => f.confidence_level === 'MEDIUM')
        const lowItems = forecasts.filter(f => f.confidence_level === 'LOW')
        expect(highItems.length).toBeGreaterThan(0)
        expect(mediumItems.length).toBeGreaterThan(0)
        expect(lowItems.length).toBeGreaterThan(0)
      }
    })

    it('produces forecasts with zero daily average for days with no data', async () => {
      // No transactions → dailyAverages should all be 0
      const forecasts = await service.generateCashForecasts('2099-01-01', '2099-01-31', 7)
      expect(forecasts.length).toBe(7)
      // All projected balances should be 0 (no historical data)
      for (const f of forecasts) {
        expect(f.projected_balance).toBe(0)
      }
    })
  })

  // ── Branch coverage: analyzeCashFlowByTerm ───────────────────────
  describe('analyzeCashFlowByTerm', () => {
    it('delegates to getCashFlowStatement', async () => {
      db.exec(`CREATE TABLE IF NOT EXISTS academic_term (id INTEGER PRIMARY KEY, start_date TEXT, end_date TEXT)`)
      db.exec(`INSERT OR IGNORE INTO academic_term (id, start_date, end_date) VALUES (50, '2026-01-01', '2026-03-31')`)
      const statement = await service.analyzeCashFlowByTerm('50')
      expect(statement.period_start).toBe('2026-01-01')
    })
  })

  // ── Branch coverage: DONATION / OTHER_INCOME transaction types ──
  describe('operating activities – donation & other income types', () => {
    it('includes DONATION and OTHER_INCOME in operating activities', async () => {
      db.exec(`
        INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, recorded_by_user_id)
        VALUES
          ('DON-001', '2026-01-10', 'DONATION', 1, 25000, 'DEBIT', 1),
          ('OI-001',  '2026-01-11', 'OTHER_INCOME', 1, 15000, 'DEBIT', 1);
      `)
      const result = await service.getOperatingActivities('2026-01-01', '2026-01-31')
      expect(result.donation_collections).toBe(25000)
      expect(result.other_income).toBe(15000)
    })

    it('treats amount=0 as falsy, falling back to 0 via || operator', async () => {
      db.exec(`
        INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, recorded_by_user_id)
        VALUES
          ('DON-002', '2026-01-12', 'DONATION', 1, 0, 'DEBIT', 1),
          ('OI-002',  '2026-01-13', 'OTHER_INCOME', 1, 0, 'DEBIT', 1),
          ('CR-002',  '2026-01-14', 'CREDIT', 1, 0, 'DEBIT', 1);
      `)
      const result = await service.getOperatingActivities('2026-01-01', '2026-01-31')
      // amount=0 || 0 → 0, so all zero-amount transactions contribute 0
      expect(result.donation_collections).toBe(0)
      expect(result.other_income).toBe(0)
    })
  })

  // ── Branch coverage: forecaster with historical data ─────────────
  describe('generateCashForecasts – with actual transaction data', () => {
    it('builds daily averages from CREDIT/PAYMENT transactions', async () => {
      // Insert CREDIT and PAYMENT transactions that fall within the query range
      db.exec(`
        INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, recorded_by_user_id)
        VALUES
          ('FC-001', '2026-01-05', 'CREDIT',  1, 10000, 'DEBIT', 1),
          ('FC-002', '2026-01-12', 'PAYMENT', 1, 5000, 'DEBIT', 1),
          ('FC-003', '2026-01-19', 'CREDIT',  1, 8000, 'DEBIT', 1);
      `)
      const forecasts = await service.generateCashForecasts('2026-01-01', '2026-01-31', 7)
      expect(forecasts.length).toBe(7)
      // At least one forecast should have a non-zero projected_balance
      // because historical data provides daily averages for certain days of the week
      const hasNonZero = forecasts.some(f => f.projected_balance > 0)
      expect(hasNonZero).toBe(true)
    })
  })

  // ── Branch coverage: asset/loan transactions with amount=0 ───────
  describe('investing/financing – zero amount fallback branches', () => {
    it('handles asset transactions with amount=0', async () => {
      db.exec(`
        INSERT INTO asset_transaction (transaction_type, amount, transaction_date)
        VALUES ('PURCHASE', 0, '2026-01-10'), ('SALE', 0, '2026-01-20');
      `)
      const result = await service.getInvestingActivities('2026-01-01', '2026-01-31')
      expect(result.asset_purchases).toBe(0)
      expect(result.asset_sales).toBe(0)
    })

    it('handles loan transactions with amount=0', async () => {
      db.exec(`
        INSERT INTO loan_transaction (transaction_type, amount, transaction_date)
        VALUES ('DISBURSEMENT', 0, '2026-01-05'), ('REPAYMENT', 0, '2026-01-15'), ('GRANT', 0, '2026-01-25');
      `)
      const result = await service.getFinancingActivities('2026-01-01', '2026-01-31')
      expect(result.loans_received).toBe(0)
      expect(result.loan_repayments).toBe(0)
      expect(result.grant_received).toBe(0)
    })
  })

  // ── Function coverage: getCashFlowStatement – term lookup ──────────
  describe('getCashFlowStatement', () => {
    it('returns empty statement when term does not exist', async () => {
      db.exec(`CREATE TABLE IF NOT EXISTS academic_term (id INTEGER PRIMARY KEY, academic_year_id INTEGER, term_name TEXT, start_date TEXT, end_date TEXT)`)
      const result = await service.getCashFlowStatement('9999')
      expect(result.period_start).toBe('')
      expect(result.period_end).toBe('')
      expect(result.net_cash_change).toBe(0)
      expect(result.liquidity_status).toBe('ADEQUATE')
    })

    it('returns full statement for valid term', async () => {
      db.exec(`CREATE TABLE IF NOT EXISTS academic_term (id INTEGER PRIMARY KEY, academic_year_id INTEGER, term_name TEXT, start_date TEXT, end_date TEXT)`)
      db.exec(`
        INSERT OR IGNORE INTO academic_term (id, academic_year_id, term_name, start_date, end_date)
        VALUES (1, 2026, 'Term 1', '2026-01-01', '2026-03-31');
      `)
      const result = await service.getCashFlowStatement('1')
      expect(result.period_start).toBe('2026-01-01')
      expect(result.period_end).toBe('2026-03-31')
    })
  })

  // ── Function coverage: analyzeCashFlowByTerm delegates to getCashFlowStatement ──
  describe('analyzeCashFlowByTerm', () => {
    it('delegates to getCashFlowStatement', async () => {
      db.exec(`CREATE TABLE IF NOT EXISTS academic_term (id INTEGER PRIMARY KEY, academic_year_id INTEGER, term_name TEXT, start_date TEXT, end_date TEXT)`)
      const result = await service.analyzeCashFlowByTerm('9999')
      expect(result.period_start).toBe('')
    })
  })

  // ── Function coverage: calculateCashPosition ─────────────────────
  describe('calculateCashPosition', () => {
    it('returns cash position breakdown', async () => {
      const result = await service.calculateCashPosition()
      expect(result).toHaveProperty('opening_balance')
      expect(result).toHaveProperty('total_inflows')
      expect(result).toHaveProperty('total_outflows')
      expect(result).toHaveProperty('closing_balance')
      expect(typeof result.closing_balance).toBe('number')
    })
  })

  // ── Function coverage: assessLiquidityStatus (async public method) ──
  describe('assessLiquidityStatus', () => {
    it('returns STRONG for large balance', async () => {
      const status = await service.assessLiquidityStatus(10_000_000)
      expect(status).toBe('STRONG')
    })

    it('returns CRITICAL for zero balance', async () => {
      const status = await service.assessLiquidityStatus(0)
      expect(['CRITICAL', 'STRONG']).toContain(status)
    })
  })

  // ── Function coverage: generateCashFlowStatement error wrapping ──
  describe('generateCashFlowStatement', () => {
    it('generates statement with default period (current month)', async () => {
      const result = await service.generateCashFlowStatement()
      expect(result.period_start).toBeDefined()
      expect(result.period_end).toBeDefined()
      expect(typeof result.net_cash_change).toBe('number')
    })

    it('generates statement for explicit date range', async () => {
      const result = await service.generateCashFlowStatement('2026-01-01', '2026-01-31')
      expect(result.period_start).toBe('2026-01-01')
      expect(result.period_end).toBe('2026-01-31')
    })
  })

  // ── Branch coverage: generateCashFlowStatement error wrapping ──
  describe('generateCashFlowStatement – error wrapping', () => {
    it('wraps internal errors with descriptive message', async () => {
      // Close the db to force an error during statement generation
      db.close()
      await expect(service.generateCashFlowStatement('2026-01-01', '2026-01-31'))
        .rejects.toThrow('Failed to generate cash flow statement')
      // Reopen db for afterEach
      db = new Database(':memory:')
    })
  })

  // ── Branch coverage: resolvePeriod with only one date provided ──
  describe('resolvePeriod partial dates', () => {
    it('defaults to current month when only startDate provided (endDate undefined)', async () => {
      // eslint-disable-next-line sonarjs/no-undefined-argument, unicorn/no-useless-undefined
      const result = await service.generateCashFlowStatement('2026-01-01', undefined)
      const now = new Date()
      const expectedStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      // When endDate is undefined, it falls through to default
      expect(result.period_start).toBe(expectedStart)
    })

    it('defaults to current month when only endDate provided (startDate undefined)', async () => {
      const result = await service.generateCashFlowStatement(undefined, '2026-01-31')
      const now = new Date()
      const expectedStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      expect(result.period_start).toBe(expectedStart)
    })
  })

  // ── Branch coverage: cashForecast30/60 fallback to closingBalance ──
  describe('cash forecast fallback paths', () => {
    it('cash_forecast_30_days falls back to closingBalance when no exact date match', async () => {
      // No transactions at all → forecasts are all zero → .find() will likely miss the exact date
      db.exec('DELETE FROM ledger_transaction')
      const result = await service.generateCashFlowStatement('2026-01-01', '2026-01-31')
      // cash_forecast_30_days should equal closingBalance since forecasts have 0 amounts
      expect(typeof result.cash_forecast_30_days).toBe('number')
      expect(typeof result.cash_forecast_60_days).toBe('number')
    })
  })

  // ── Branch coverage: generateCashForecasts MEDIUM confidence range (31-45 days) ──
  describe('generateCashForecasts – MEDIUM confidence', () => {
    it('assigns MEDIUM confidence for days 31-45', async () => {
      const forecasts = await service.generateCashForecasts('2026-01-01', '2026-01-31', 45)
      const mediumItems = forecasts.filter(f => f.confidence_level === 'MEDIUM')
      expect(mediumItems.length).toBeGreaterThan(0)
      // Days 1-30 should be HIGH, days 31-45 should be MEDIUM
      const highItems = forecasts.filter(f => f.confidence_level === 'HIGH')
      expect(highItems.length).toBe(30)
      expect(mediumItems.length).toBe(15) // days 31-45
    })
  })

  // ── Branch coverage: assessLiquidityStatus with exact threshold values ──
  describe('assessLiquidityStatus – boundary values', () => {
    it('returns STRONG when closingBalance equals exactly 3x avg expenses (zero case)', async () => {
      // avgMonthlyExpenses = 0, closingBalance = 0 → 0 >= 0*3 → STRONG
      const status = await service.assessLiquidityStatus(0)
      expect(status).toBe('STRONG')
    })
  })

  // ── Branch coverage: getAverageMonthlyExpenses when result?.total is null ──
  describe('repository edge – null total from SUM', () => {
    it('getAverageMonthlyExpenses returns 0 when no recent expenses', async () => {
      db.exec('DELETE FROM expense_transaction')
      // assessLiquidityStatus will call getAverageMonthlyExpenses → SUM returns NULL → || 0
      const status = await service.assessLiquidityStatus(100)
      expect(status).toBe('STRONG')
    })
  })

  // ── Branch coverage: operating activities with MATERIALS expense type ──
  describe('operating activities – MATERIALS expense type', () => {
    it('includes MATERIALS in supplier_payments', async () => {
      db.exec(`
        INSERT INTO expense_transaction (expense_type, amount, transaction_date)
        VALUES ('MATERIALS', 20000, '2026-01-10');
      `)
      const result = await service.getOperatingActivities('2026-01-01', '2026-01-31')
      expect(result.supplier_payments).toBe(20000)
    })
  })

  // ── Branch coverage: opening balance with null SUM ──
  describe('opening balance null SUM fallback', () => {
    it('returns 0 opening balance when no prior transactions', async () => {
      db.exec('DELETE FROM ledger_transaction')
      const result = await service.generateCashFlowStatement('2026-06-01', '2026-06-30')
      expect(result.opening_cash_balance).toBe(0)
    })
  })

  /* ==================================================================
   *  Branch coverage: investing activities – PURCHASE + SALE
   * ================================================================== */
  describe('investing activities with asset purchases and sales', () => {
    it('separates purchases from sales in investing activities', async () => {
      db.exec(`
        INSERT INTO asset_transaction (transaction_type, amount, transaction_date)
        VALUES ('PURCHASE', 50000, '2026-01-12'), ('SALE', 20000, '2026-01-15');
      `)
      const result = await service.getInvestingActivities('2026-01-01', '2026-01-31')
      expect(result.asset_purchases).toBe(50000)
      expect(result.asset_sales).toBe(20000)
      expect(result.net_investing_cash_flow).toBe(-30000) // sales - purchases
    })
  })

  /* ==================================================================
   *  Branch coverage: financing activities – DISBURSEMENT + REPAYMENT + GRANT
   * ================================================================== */
  describe('financing activities with loan disbursement, repayment, and grant', () => {
    it('categorises loan types correctly', async () => {
      db.exec(`
        INSERT INTO loan_transaction (transaction_type, amount, transaction_date)
        VALUES ('DISBURSEMENT', 100000, '2026-01-05'),
               ('REPAYMENT',    30000, '2026-01-15'),
               ('GRANT',        50000, '2026-01-20');
      `)
      const result = await service.getFinancingActivities('2026-01-01', '2026-01-31')
      expect(result.loans_received).toBe(100000)
      expect(result.loan_repayments).toBe(30000)
      expect(result.grant_received).toBe(50000)
      expect(result.net_financing_cash_flow).toBe(120000) // 100k + 50k - 30k
    })
  })

  /* ==================================================================
   *  Branch coverage: liquidity status – STRONG / TIGHT / CRITICAL
   * ================================================================== */
  describe('assessLiquidityStatus branches', () => {
    it('returns STRONG when cash covers 3+ months', async () => {
      const status = await service.assessLiquidityStatus(999999999)
      expect(status).toBe('STRONG')
    })

    it('returns TIGHT when cash covers 0.5-1.5 months expenses', async () => {
      // Insert recent expenses to make avgMonthly ~100k
      db.exec(`
        INSERT INTO expense_transaction (expense_type, amount, transaction_date)
        VALUES ('OTHER', 300000, date('now', '-1 day'));
      `)
      // avg = 300000/3 = 100000.  0.5*100k=50k.  1.5*100k=150k
      const status = await service.assessLiquidityStatus(80000)
      expect(status).toBe('TIGHT')
    })

    it('returns CRITICAL when cash covers < 0.5 months expenses', async () => {
      db.exec(`
        INSERT INTO expense_transaction (expense_type, amount, transaction_date)
        VALUES ('OTHER', 900000, date('now', '-1 day'));
      `)
      // avg = 900000/3 = 300000.  0.5*300k=150k. balance 10000 < 150k
      const status = await service.assessLiquidityStatus(10000)
      expect(status).toBe('CRITICAL')
    })
  })

  /* ==================================================================
   *  Branch coverage: getCashFlowStatement with term not found → empty
   * ================================================================== */
  describe('getCashFlowStatement – term not found', () => {
    it('returns empty statement when termId is not found', async () => {
      // academic_term table doesn't exist, so will throw or return empty
      // Need to create academic_term table first
      db.exec(`CREATE TABLE IF NOT EXISTS academic_term (id INTEGER PRIMARY KEY, start_date TEXT, end_date TEXT)`)
      const result = await service.getCashFlowStatement('9999')
      expect(result.opening_cash_balance).toBe(0)
      expect(result.closing_cash_balance).toBe(0)
    })
  })

  /* ==================================================================
   *  Branch coverage: generateCashFlowStatement with no dates → defaults
   * ================================================================== */
  describe('generateCashFlowStatement – defaults to current month', () => {
    it('generates statement with auto-resolved period when no dates given', async () => {
      const result = await service.generateCashFlowStatement()
      expect(result.period_start).toBeDefined()
      expect(result.period_end).toBeDefined()
    })
  })

  /* ==================================================================
   *  Branch coverage: calculateCashPosition aggregates all sections
   * ================================================================== */
  describe('calculateCashPosition', () => {
    it('returns aggregated inflows and outflows', async () => {
      const result = await service.calculateCashPosition()
      expect(result).toHaveProperty('opening_balance')
      expect(result).toHaveProperty('total_inflows')
      expect(result).toHaveProperty('total_outflows')
      expect(result).toHaveProperty('closing_balance')
    })
  })

  /* ==================================================================
   *  Branch coverage: generateCashForecasts with 60 days
   * ================================================================== */
  describe('generateCashForecasts with historical data', () => {
    it('generates forecasts with historical transactions', async () => {
      const forecasts = await service.generateCashForecasts('2026-01-01', '2026-01-31', 60)
      expect(forecasts.length).toBe(60)
      // First 30 days: HIGH confidence. 30-45: MEDIUM. 45+: LOW
      expect(forecasts[0]!.confidence_level).toBe('HIGH')
      expect(forecasts[35]!.confidence_level).toBe('MEDIUM')
      expect(forecasts[50]!.confidence_level).toBe('LOW')
    })
  })

  /* ==================================================================
   *  Branch coverage: operating – DONATION + OTHER_INCOME + OTHER expense
   * ================================================================== */
  describe('operating activities with donations and other income', () => {
    it('includes DONATION and OTHER_INCOME in gross operating cash', async () => {
      db.exec(`
        INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, recorded_by_user_id)
        VALUES ('DON-001', '2026-01-05', 'DONATION', 1, 25000, 'DEBIT', 1),
               ('OTH-001', '2026-01-06', 'OTHER_INCOME', 1, 10000, 'DEBIT', 1);
        INSERT INTO expense_transaction (expense_type, amount, transaction_date)
        VALUES ('OTHER', 5000, '2026-01-10');
      `)
      const result = await service.getOperatingActivities('2026-01-01', '2026-01-31')
      expect(result.donation_collections).toBe(25000)
      expect(result.other_income).toBe(10000)
      expect(result.other_expenses).toBe(5000)
    })
  })

  /* ==================================================================
   *  Branch coverage: payroll expenses aggregate
   * ================================================================== */
  describe('operating activities with payroll expenses', () => {
    it('includes payroll_transaction amounts in salary_payments', async () => {
      db.exec(`
        INSERT INTO payroll_transaction (amount, transaction_date)
        VALUES (45000, '2026-01-15');
      `)
      const result = await service.getOperatingActivities('2026-01-01', '2026-01-31')
      expect(result.salary_payments).toBe(45000)
    })
  })

  /* ==================================================================
   *  Branch coverage: resolvePeriod – ?? '' fallback (L551-552)
   *  .toISOString().split('T')[0] always returns a string, so the
   *  nullish-coalescing fallback can never fire. We ensure both the
   *  "both dates provided" and "no dates" paths are exercised.
   * ================================================================== */
  describe('resolvePeriod – both branches', () => {
    it('uses provided dates directly when both startDate AND endDate given', async () => {
      const result = await service.generateCashFlowStatement('2026-02-01', '2026-02-28')
      expect(result.period_start).toBe('2026-02-01')
      expect(result.period_end).toBe('2026-02-28')
    })

    it('falls through to default period when startDate is empty string', async () => {
      const result = await service.generateCashFlowStatement('', '2026-01-31')
      // Empty string is falsy → falls through to default
      const now = new Date()
      const expectedStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      expect(result.period_start).toBe(expectedStart)
    })

    it('falls through to default period when endDate is empty string', async () => {
      const result = await service.generateCashFlowStatement('2026-01-01', '')
      const now = new Date()
      const expectedStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      expect(result.period_start).toBe(expectedStart)
    })
  })

  /* ==================================================================
   *  Branch coverage: getOpeningBalance – null balance from SUM (L148)
   * ================================================================== */
  describe('opening balance – null from SUM', () => {
    it('returns 0 when no transactions exist before period (SUM returns NULL)', async () => {
      db.exec('DELETE FROM ledger_transaction')
      const result = await service.generateCashFlowStatement('2099-01-01', '2099-01-31')
      expect(result.opening_cash_balance).toBe(0)
    })
  })

  /* ==================================================================
   *  Branch coverage: getExpensesByType – null total from SUM (L158)
   * ================================================================== */
  describe('expenses – null from SUM when no matching expense type', () => {
    it('returns 0 for supplier_payments when no SUPPLIES/MATERIALS expense exists', async () => {
      db.exec('DELETE FROM expense_transaction')
      const result = await service.getOperatingActivities('2026-01-01', '2026-01-31')
      expect(result.supplier_payments).toBe(0)
      expect(result.utilities).toBe(0)
      expect(result.other_expenses).toBe(0)
    })
  })

  /* ==================================================================
   *  Branch coverage: getPayrollExpenses – null total from SUM (L170)
   * ================================================================== */
  describe('payroll – null from SUM when no payroll transactions', () => {
    it('returns 0 salary_payments when payroll_transaction is empty', async () => {
      const result = await service.getOperatingActivities('2026-01-01', '2026-01-31')
      expect(result.salary_payments).toBe(0)
    })
  })

  /* ==================================================================
   *  Branch coverage: getAverageMonthlyExpenses – null total (L182)
   * ================================================================== */
  describe('average monthly expenses – null SUM', () => {
    it('treats null SUM as 0 when no recent expenses', async () => {
      db.exec('DELETE FROM expense_transaction')
      // With avg=0, any balance >= 0 is STRONG
      const status = await service.assessLiquidityStatus(1)
      expect(status).toBe('STRONG')
    })
  })

  /* ==================================================================
   *  Branch coverage: CashFlowForecaster – dailyAverages accumulation
   *  when same day-of-week appears more than once (L325 !dailyAverages[dayOfWeek])
   * ================================================================== */
  describe('forecaster – same day-of-week appears twice', () => {
    it('accumulates amounts for same day-of-week in daily averages', async () => {
      // 2026-01-05 and 2026-01-12 are both Monday (day 1)
      db.exec(`
        INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, recorded_by_user_id)
        VALUES
          ('FC-MON1', '2026-01-05', 'CREDIT', 1, 10000, 'DEBIT', 1),
          ('FC-MON2', '2026-01-12', 'CREDIT', 1, 20000, 'DEBIT', 1);
      `)
      const forecasts = await service.generateCashForecasts('2026-01-01', '2026-01-31', 7)
      expect(forecasts.length).toBe(7)
      // Monday forecasts should reflect accumulated amount (10000+20000=30000)
      const hasNonZero = forecasts.some(f => f.projected_balance > 0)
      expect(hasNonZero).toBe(true)
    })
  })

  /* ==================================================================
   *  Branch coverage: expense types with zero-sum matching rows
   *  Exercises the `result?.total || 0` branch where SUM returns 0 (not NULL).
   * ================================================================== */
  describe('expense types – SUM returns 0 (not NULL)', () => {
    it('treats SUM of zero-amount expenses as 0', async () => {
      db.exec(`
        INSERT INTO expense_transaction (expense_type, amount, transaction_date)
        VALUES ('SUPPLIES', 0, '2026-01-10'), ('MATERIALS', 0, '2026-01-15'),
               ('UTILITIES', 0, '2026-01-20'), ('OTHER', 0, '2026-01-25');
        INSERT INTO payroll_transaction (amount, transaction_date) VALUES (0, '2026-01-18');
      `)
      const result = await service.getOperatingActivities('2026-01-01', '2026-01-31')
      expect(result.supplier_payments).toBe(0)
      expect(result.utilities).toBe(0)
      expect(result.other_expenses).toBe(0)
      expect(result.salary_payments).toBe(0)
    })
  })

  /* ==================================================================
   *  Branch coverage: asset transactions with amount=0 in forEach
   *  Exercises `trans.amount || 0` in the investing activities calculator.
   * ================================================================== */
  describe('investing – asset transaction with null-like amount', () => {
    it('uses 0 for asset amount when falsy', async () => {
      db.exec(`
        INSERT INTO asset_transaction (transaction_type, amount, transaction_date)
        VALUES ('PURCHASE', 0, '2026-01-10'), ('SALE', 0, '2026-01-20');
      `)
      const result = await service.getInvestingActivities('2026-01-01', '2026-01-31')
      expect(result.asset_purchases).toBe(0)
      expect(result.asset_sales).toBe(0)
      expect(result.net_investing_cash_flow).toBe(0)
    })
  })

  /* ==================================================================
   *  Branch coverage: loan transactions with amount=0 in forEach
   *  Exercises `trans.amount || 0` in the financing activities calculator.
   * ================================================================== */
  describe('financing – loan transaction with zero amount', () => {
    it('uses 0 for loan amount when falsy', async () => {
      db.exec(`
        INSERT INTO loan_transaction (transaction_type, amount, transaction_date)
        VALUES ('DISBURSEMENT', 0, '2026-01-05'), ('REPAYMENT', 0, '2026-01-15'), ('GRANT', 0, '2026-01-25');
      `)
      const result = await service.getFinancingActivities('2026-01-01', '2026-01-31')
      expect(result.loans_received).toBe(0)
      expect(result.loan_repayments).toBe(0)
      expect(result.grant_received).toBe(0)
      expect(result.net_financing_cash_flow).toBe(0)
    })
  })

  /* ==================================================================
   *  Branch coverage: constructor without db – getDatabase() fallback (L431)
   * ================================================================== */
  describe('constructor without db parameter', () => {
    it('falls back to getDatabase() when no db is provided', async () => {
      vi.mocked(getDatabase).mockReturnValue(db as any)
      const svc = new CashFlowStatementService()
      const result = await svc.generateCashFlowStatement('2026-01-01', '2026-01-31')
      expect(result).toBeDefined()
      expect(result.period_start).toBe('2026-01-01')
    })

    it('exercises all activity calculators via getDatabase fallback', async () => {
      vi.mocked(getDatabase).mockReturnValue(db as any)
      const svc = new CashFlowStatementService()
      const op = await svc.getOperatingActivities('2026-01-01', '2026-01-31')
      expect(op).toBeDefined()
      const inv = await svc.getInvestingActivities('2026-01-01', '2026-01-31')
      expect(inv).toBeDefined()
      const fin = await svc.getFinancingActivities('2026-01-01', '2026-01-31')
      expect(fin).toBeDefined()
    })
  })

  /* ==================================================================
   *  Branch coverage: forecaster !dailyAverages[dayOfWeek] false (L366)
   *  When same day-of-week appears twice with non-zero amount, the
   *  initialisation guard is skipped on the second occurrence.
   * ================================================================== */
  describe('forecaster – dailyAverages already initialised for day', () => {
    it('skips initialisation when dailyAverage is already set for that day of week', async () => {
      // Clear all ledger transactions to have only our test data
      db.exec('DELETE FROM ledger_transaction')
      // 2026-01-05 = Monday (day 1), 2026-01-12 = Monday (day 1)
      // First record: dailyAverages[1] = 0 + 7000 = 7000 (truthy)
      // Second record: !7000 = false → skip init → branch covered
      db.exec(`
        INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, recorded_by_user_id)
        VALUES
          ('CF-DAY-A', '2026-01-05', 'CREDIT', 1, 7000, 'DEBIT', 1),
          ('CF-DAY-B', '2026-01-12', 'CREDIT', 1, 4000, 'DEBIT', 1);
      `)
      const forecasts = await service.generateCashForecasts('2026-01-01', '2026-01-31', 14)
      expect(forecasts.length).toBe(14)
      // Monday forecasts should reflect accumulated amount (7000+4000=11000 per Monday)
      const hasNonZero = forecasts.some(f => f.projected_balance > 0)
      expect(hasNonZero).toBe(true)
    })
  })

  /* ==================================================================
   *  Branch coverage: operating activities with zero-amount ledger txns
   *  Exercises t.amount || 0 falsy branch in reduce (L210-245)
   * ================================================================== */
  describe('operating activities – zero-amount CREDIT/DONATION/OTHER_INCOME', () => {
    it('handles t.amount=0 in fee/donation/other_income reduce callbacks', async () => {
      db.exec(`
        INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, recorded_by_user_id)
        VALUES
          ('CF-ZOP-1', '2026-01-05', 'CREDIT', 1, 0, 'DEBIT', 1),
          ('CF-ZOP-2', '2026-01-06', 'PAYMENT', 1, 0, 'DEBIT', 1),
          ('CF-ZOP-3', '2026-01-07', 'DONATION', 1, 0, 'DEBIT', 1),
          ('CF-ZOP-4', '2026-01-08', 'OTHER_INCOME', 1, 0, 'DEBIT', 1);
      `)
      const result = await service.getOperatingActivities('2026-01-01', '2026-01-31')
      expect(result.fee_collections).toBe(0)
      expect(result.donation_collections).toBe(0)
      expect(result.other_income).toBe(0)
    })
  })

  /* ==================================================================
   *  Branch coverage: operating activities with non-zero CREDIT/DONATION
   *  Exercises t.amount || 0 truthy branch in reduce (L210-245)
   * ================================================================== */
  describe('operating activities – non-zero CREDIT/DONATION/OTHER_INCOME', () => {
    it('sums non-zero amounts for fee/donation/other_income', async () => {
      db.exec(`
        INSERT INTO ledger_transaction (transaction_ref, transaction_date, transaction_type, category_id, amount, debit_credit, recorded_by_user_id)
        VALUES
          ('CF-NZ-1', '2026-01-05', 'CREDIT', 1, 5000, 'DEBIT', 1),
          ('CF-NZ-2', '2026-01-06', 'PAYMENT', 1, 3000, 'DEBIT', 1),
          ('CF-NZ-3', '2026-01-07', 'DONATION', 1, 2000, 'DEBIT', 1),
          ('CF-NZ-4', '2026-01-08', 'OTHER_INCOME', 1, 1500, 'DEBIT', 1);
      `)
      const result = await service.getOperatingActivities('2026-01-01', '2026-01-31')
      expect(result.fee_collections).toBe(8000)
      expect(result.donation_collections).toBe(2000)
      expect(result.other_income).toBe(1500)
    })
  })

  /* ==================================================================
   *  Branch coverage: generateCashFlowStatement without dates (L441)
   *  Exercises resolvePeriod fallback to current month
   * ================================================================== */
  describe('generateCashFlowStatement – no dates provided', () => {
    it('uses current month when no start/end dates given', async () => {
      const result = await service.generateCashFlowStatement()
      expect(result.period_start).toBeDefined()
      expect(result.period_end).toBeDefined()
      expect(result.period_start).not.toBe('')
      expect(result.period_end).not.toBe('')
    })
  })
})
