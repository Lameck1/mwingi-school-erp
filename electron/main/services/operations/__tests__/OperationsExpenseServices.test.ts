import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db,
}))

import { BoardingCostService } from '../BoardingCostService'
import { TransportCostService } from '../TransportCostService'

/** Full schema matching what both services actually query */
function createSchema(d: Database.Database): void {
  d.exec(`
    -- Accounting tables
    CREATE TABLE gl_account (account_code TEXT PRIMARY KEY, account_name TEXT, account_type TEXT, normal_balance TEXT, is_active BOOLEAN DEFAULT 1);
    INSERT INTO gl_account VALUES ('1010', 'Cash', 'ASSET', 'DEBIT', 1);
    INSERT INTO gl_account VALUES ('1020', 'Bank', 'ASSET', 'DEBIT', 1);
    INSERT INTO gl_account VALUES ('5000', 'Expenses', 'EXPENSE', 'DEBIT', 1);
    INSERT INTO gl_account VALUES ('5099', 'Inactive GL', 'EXPENSE', 'DEBIT', 0);
    CREATE TABLE journal_entry (id INTEGER PRIMARY KEY AUTOINCREMENT, entry_ref TEXT NOT NULL UNIQUE, entry_date DATE NOT NULL, entry_type TEXT NOT NULL, description TEXT NOT NULL, student_id INTEGER, staff_id INTEGER, term_id INTEGER, is_posted BOOLEAN DEFAULT 0, posted_by_user_id INTEGER, posted_at DATETIME, is_voided BOOLEAN DEFAULT 0, voided_reason TEXT, voided_by_user_id INTEGER, voided_at DATETIME, requires_approval BOOLEAN DEFAULT 0, approval_status TEXT DEFAULT 'PENDING', approved_by_user_id INTEGER, approved_at DATETIME, created_by_user_id INTEGER NOT NULL, source_ledger_txn_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE journal_entry_line (id INTEGER PRIMARY KEY AUTOINCREMENT, journal_entry_id INTEGER NOT NULL, line_number INTEGER NOT NULL, gl_account_id INTEGER NOT NULL, debit_amount INTEGER DEFAULT 0, credit_amount INTEGER DEFAULT 0, description TEXT);
    CREATE TABLE approval_rule (id INTEGER PRIMARY KEY AUTOINCREMENT, rule_name TEXT NOT NULL UNIQUE, description TEXT, transaction_type TEXT NOT NULL, min_amount INTEGER, max_amount INTEGER, days_since_transaction INTEGER, required_role_id INTEGER, is_active BOOLEAN DEFAULT 1, created_by_user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE receipt (id INTEGER PRIMARY KEY AUTOINCREMENT, receipt_number TEXT NOT NULL UNIQUE, transaction_id INTEGER NOT NULL UNIQUE, receipt_date DATE NOT NULL, student_id INTEGER NOT NULL, amount INTEGER NOT NULL, amount_in_words TEXT, payment_method TEXT NOT NULL, payment_reference TEXT, printed_count INTEGER DEFAULT 0, created_by_user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);

    -- Academic context
    CREATE TABLE academic_year (id INTEGER PRIMARY KEY AUTOINCREMENT, year_name TEXT NOT NULL, is_current BOOLEAN DEFAULT 0);
    CREATE TABLE term (id INTEGER PRIMARY KEY AUTOINCREMENT, academic_year_id INTEGER NOT NULL, term_number INTEGER NOT NULL, is_current BOOLEAN DEFAULT 0);
    INSERT INTO academic_year (id, year_name, is_current) VALUES (1, '2026', 1);
    INSERT INTO term (id, academic_year_id, term_number, is_current) VALUES (10, 1, 2, 1);

    -- Users
    CREATE TABLE user (id INTEGER PRIMARY KEY AUTOINCREMENT, is_active BOOLEAN DEFAULT 1);
    INSERT INTO user (id, is_active) VALUES (5, 1);
    INSERT INTO user (id, is_active) VALUES (6, 0);

    -- Revenue tables (for profitability calculations)
    CREATE TABLE fee_category (id INTEGER PRIMARY KEY AUTOINCREMENT, category_name TEXT NOT NULL UNIQUE, description TEXT, is_active BOOLEAN DEFAULT 1, priority INTEGER DEFAULT 99, gl_account_id INTEGER);
    CREATE TABLE fee_invoice (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, term_id INTEGER, invoice_date TEXT NOT NULL);
    CREATE TABLE invoice_item (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL, fee_category_id INTEGER NOT NULL, description TEXT, amount INTEGER NOT NULL);

    -- Boarding tables (FULL schema)
    CREATE TABLE boarding_facility (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, capacity INTEGER NOT NULL DEFAULT 0, current_occupancy INTEGER NOT NULL DEFAULT 0, matron_id INTEGER, is_active BOOLEAN DEFAULT 1);
    CREATE TABLE boarding_expense (id INTEGER PRIMARY KEY AUTOINCREMENT, facility_id INTEGER NOT NULL, gl_account_code TEXT NOT NULL, fiscal_year INTEGER NOT NULL, term INTEGER NOT NULL, amount_cents INTEGER NOT NULL, expense_type TEXT NOT NULL, description TEXT, recorded_date TEXT, recorded_by INTEGER NOT NULL);

    -- Transport tables (FULL schema)
    CREATE TABLE transport_route (id INTEGER PRIMARY KEY AUTOINCREMENT, route_name TEXT NOT NULL, distance_km REAL DEFAULT 0, estimated_students INTEGER DEFAULT 0, budget_per_term_cents INTEGER DEFAULT 0, driver_id INTEGER, vehicle_registration TEXT, is_active BOOLEAN DEFAULT 1);
    CREATE TABLE transport_route_expense (id INTEGER PRIMARY KEY AUTOINCREMENT, route_id INTEGER NOT NULL, gl_account_code TEXT NOT NULL, fiscal_year INTEGER NOT NULL, term INTEGER NOT NULL, amount_cents INTEGER NOT NULL, expense_type TEXT NOT NULL, description TEXT, recorded_date TEXT, recorded_by INTEGER NOT NULL);
    CREATE TABLE student_route_assignment (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, route_id INTEGER NOT NULL, academic_year INTEGER NOT NULL, term INTEGER NOT NULL, pickup_location TEXT);
  `)
}

describe('Operations expense services', () => {
  beforeEach(() => {
    db = new Database(':memory:')
    createSchema(db)
    // Seed base data
    db.prepare(`INSERT INTO boarding_facility (id, name, capacity, current_occupancy, is_active) VALUES (1, 'Boys Dorm', 100, 80, 1)`).run()
    db.prepare(`INSERT INTO boarding_facility (id, name, capacity, current_occupancy, is_active) VALUES (2, 'Girls Dorm', 80, 60, 1)`).run()
    db.prepare(`INSERT INTO transport_route (id, route_name, distance_km, estimated_students, is_active) VALUES (1, 'Route A', 25, 30, 1)`).run()
    db.prepare(`INSERT INTO transport_route (id, route_name, distance_km, estimated_students, is_active) VALUES (2, 'Route B', 40, 20, 1)`).run()
  })

  afterEach(() => { db.close() })

  // ======================== BoardingCostService ========================
  describe('BoardingCostService', () => {
    // --- Expense recording (original + new) ---
    it('rejects boarding expense when payload period does not match active academic context', () => {
      const service = new BoardingCostService()
      expect(() => service.recordBoardingExpense({
        facility_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 1,
        amount_cents: 10000, expense_type: 'FOOD', description: 'Food supplies', recorded_by: 5
      })).toThrow('active period')
    })

    it('records boarding expense when payload matches active context', () => {
      const service = new BoardingCostService()
      const id = service.recordBoardingExpense({
        facility_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 2,
        amount_cents: 10000, expense_type: 'FOOD', description: 'Rice', recorded_by: 5
      })
      expect(id).toBeGreaterThan(0)
    })

    it('rejects expense with invalid facility_id', () => {
      const service = new BoardingCostService()
      expect(() => service.recordBoardingExpense({
        facility_id: 0, gl_account_code: '5000', fiscal_year: 2026, term: 2,
        amount_cents: 10000, expense_type: 'FOOD', description: 'X', recorded_by: 5
      })).toThrow()
    })

    it('rejects expense with fiscal_year out of range', () => {
      const service = new BoardingCostService()
      expect(() => service.recordBoardingExpense({
        facility_id: 1, gl_account_code: '5000', fiscal_year: 1999, term: 2,
        amount_cents: 10000, expense_type: 'FOOD', description: 'X', recorded_by: 5
      })).toThrow()
    })

    it('rejects expense with invalid term', () => {
      const service = new BoardingCostService()
      expect(() => service.recordBoardingExpense({
        facility_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 4,
        amount_cents: 10000, expense_type: 'FOOD', description: 'X', recorded_by: 5
      })).toThrow()
    })

    it('rejects expense with non-integer amount', () => {
      const service = new BoardingCostService()
      expect(() => service.recordBoardingExpense({
        facility_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 2,
        amount_cents: 10.5, expense_type: 'FOOD', description: 'X', recorded_by: 5
      })).toThrow()
    })

    it('rejects expense with amount_cents <= 0', () => {
      const service = new BoardingCostService()
      expect(() => service.recordBoardingExpense({
        facility_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 2,
        amount_cents: 0, expense_type: 'FOOD', description: 'X', recorded_by: 5
      })).toThrow()
    })

    it('rejects expense with inactive GL account', () => {
      const service = new BoardingCostService()
      expect(() => service.recordBoardingExpense({
        facility_id: 1, gl_account_code: '5099', fiscal_year: 2026, term: 2,
        amount_cents: 5000, expense_type: 'FOOD', description: 'X', recorded_by: 5
      })).toThrow()
    })

    it('rejects expense with inactive user', () => {
      const service = new BoardingCostService()
      expect(() => service.recordBoardingExpense({
        facility_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 2,
        amount_cents: 5000, expense_type: 'FOOD', description: 'X', recorded_by: 6
      })).toThrow()
    })

    // --- Facility CRUD ---
    it('getAllFacilities returns all facilities', () => {
      const svc = new BoardingCostService()
      const facilities = svc.getAllFacilities()
      expect(facilities.length).toBe(2)
    })

    it('getActiveFacilities returns only active', () => {
      db.prepare(`INSERT INTO boarding_facility (name, capacity, is_active) VALUES ('Old Dorm', 20, 0)`).run()
      const svc = new BoardingCostService()
      const facilities = svc.getActiveFacilities()
      expect(facilities.length).toBe(2) // only the 2 active ones
    })

    it('createFacility inserts and returns id', () => {
      const svc = new BoardingCostService()
      const id = svc.createFacility({ name: 'New Dorm', capacity: 50 })
      expect(id).toBeGreaterThan(0)
      const all = svc.getAllFacilities()
      expect(all.length).toBe(3)
    })

    it('createFacility with optional matron_id', () => {
      const svc = new BoardingCostService()
      const id = svc.createFacility({ name: 'Staff Dorm', capacity: 30, matron_id: 5 })
      expect(id).toBeGreaterThan(0)
    })

    it('updateFacilityOccupancy updates occupancy', () => {
      const svc = new BoardingCostService()
      svc.updateFacilityOccupancy(1, 95)
      const facilities = svc.getAllFacilities()
      const f = facilities.find(f => f.id === 1)
      expect(f!.current_occupancy).toBe(95)
    })

    // --- Expense queries ---
    it('getFacilityExpenses returns filtered expenses', () => {
      const svc = new BoardingCostService()
      svc.recordBoardingExpense({ facility_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 2, amount_cents: 10000, expense_type: 'FOOD', description: 'Rice', recorded_by: 5 })
      svc.recordBoardingExpense({ facility_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 2, amount_cents: 5000, expense_type: 'UTILITIES', description: 'Electricity', recorded_by: 5 })
      const expenses = svc.getFacilityExpenses(1, 2026, 2)
      expect(expenses.length).toBe(2)
    })

    it('getFacilityExpenses without term returns all terms', () => {
      const svc = new BoardingCostService()
      svc.recordBoardingExpense({ facility_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 2, amount_cents: 10000, expense_type: 'FOOD', description: 'Rice', recorded_by: 5 })
      const expenses = svc.getFacilityExpenses(1, 2026)
      expect(expenses.length).toBe(1)
    })

    it('getExpenseSummaryByType groups expenses and computes percentage', () => {
      const svc = new BoardingCostService()
      svc.recordBoardingExpense({ facility_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 2, amount_cents: 8000, expense_type: 'FOOD', description: 'A', recorded_by: 5 })
      svc.recordBoardingExpense({ facility_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 2, amount_cents: 2000, expense_type: 'UTILITIES', description: 'B', recorded_by: 5 })
      const summary = svc.getExpenseSummaryByType(1, 2026, 2)
      expect(summary.length).toBe(2)
      const food = summary.find(s => s.expense_type === 'FOOD')
      expect(food).toBeDefined()
      expect(food!.total_amount_cents).toBe(8000)
      expect(food!.percentage).toBeCloseTo(80, 0)
    })

    // --- Profitability ---
    it('calculateFacilityProfitability returns profitability metrics', () => {
      const svc = new BoardingCostService()
      svc.recordBoardingExpense({ facility_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 2, amount_cents: 10000, expense_type: 'FOOD', description: 'Rice', recorded_by: 5 })
      const prof = svc.calculateFacilityProfitability(1, 2026, 2)
      expect(prof.facility_name).toBe('Boys Dorm')
      expect(prof.capacity).toBe(100)
      expect(prof.total_expenses_cents).toBe(10000)
      expect(typeof prof.net_profit_cents).toBe('number')
      expect(typeof prof.occupancy_rate).toBe('number')
    })

    it('getAllFacilitiesProfitability returns array for all active facilities', () => {
      const svc = new BoardingCostService()
      const profs = svc.getAllFacilitiesProfitability(2026, 2)
      expect(profs.length).toBe(2) // 2 active facilities
    })

    it('generateProfitabilitySummary returns aggregate report', () => {
      const svc = new BoardingCostService()
      svc.recordBoardingExpense({ facility_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 2, amount_cents: 5000, expense_type: 'FOOD', description: 'A', recorded_by: 5 })
      const summary = svc.generateProfitabilitySummary(2026, 2)
      expect(typeof summary.total_capacity).toBe('number')
      expect(typeof summary.total_occupancy).toBe('number')
      expect(typeof summary.net_profit_cents).toBe('number')
      expect(summary.facilities.length).toBeGreaterThanOrEqual(1)
    })

    // --- Additional coverage: uncovered branches ---
    it('records boarding expense with payment_method BANK', () => {
      const svc = new BoardingCostService()
      const id = svc.recordBoardingExpense({
        facility_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 2,
        amount_cents: 8000, expense_type: 'FOOD', description: 'Bank payment', recorded_by: 5,
        payment_method: 'BANK'
      })
      expect(id).toBeGreaterThan(0)
    })

    it('rejects expense with recorded_by <= 0', () => {
      const svc = new BoardingCostService()
      expect(() => svc.recordBoardingExpense({
        facility_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 2,
        amount_cents: 5000, expense_type: 'FOOD', description: 'X', recorded_by: 0
      })).toThrow('Recorded by user is required')
    })

    it('rejects expense with blank GL account code', () => {
      const svc = new BoardingCostService()
      expect(() => svc.recordBoardingExpense({
        facility_id: 1, gl_account_code: '  ', fiscal_year: 2026, term: 2,
        amount_cents: 5000, expense_type: 'FOOD', description: 'X', recorded_by: 5
      })).toThrow('GL account code is required')
    })

    it('rejects expense with inactive facility', () => {
      db.prepare(`INSERT INTO boarding_facility (id, name, capacity, current_occupancy, is_active) VALUES (99, 'Closed Dorm', 50, 10, 0)`).run()
      const svc = new BoardingCostService()
      expect(() => svc.recordBoardingExpense({
        facility_id: 99, gl_account_code: '5000', fiscal_year: 2026, term: 2,
        amount_cents: 5000, expense_type: 'FOOD', description: 'X', recorded_by: 5
      })).toThrow('invalid or inactive')
    })

    it('throws when no active academic year is configured', () => {
      db.exec('UPDATE academic_year SET is_current = 0')
      db.exec('UPDATE term SET is_current = 0')
      const svc = new BoardingCostService()
      expect(() => svc.recordBoardingExpense({
        facility_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 2,
        amount_cents: 5000, expense_type: 'FOOD', description: 'X', recorded_by: 5
      })).toThrow('No active academic year')
    })

    it('throws when academic year_name is non-numeric', () => {
      db.exec("UPDATE academic_year SET year_name = 'TwentyTwentySix'")
      const svc = new BoardingCostService()
      expect(() => svc.recordBoardingExpense({
        facility_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 2,
        amount_cents: 5000, expense_type: 'FOOD', description: 'X', recorded_by: 5
      })).toThrow('not numeric')
    })

    it('calculateFacilityProfitability throws for non-existent facility', () => {
      const svc = new BoardingCostService()
      expect(() => svc.calculateFacilityProfitability(999, 2026, 2))
        .toThrow('Boarding facility 999 not found')
    })

    it('handles zero occupancy in profitability calculation', () => {
      db.prepare(`INSERT INTO boarding_facility (id, name, capacity, current_occupancy, is_active) VALUES (3, 'Empty Dorm', 50, 0, 1)`).run()
      const svc = new BoardingCostService()
      const prof = svc.calculateFacilityProfitability(3, 2026, 2)
      expect(prof.cost_per_boarder_cents).toBe(0)
      expect(prof.break_even_occupancy).toBe(0)
    })

    it('handles zero capacity in profitability calculation', () => {
      db.prepare(`INSERT INTO boarding_facility (id, name, capacity, current_occupancy, is_active) VALUES (4, 'No Cap Dorm', 0, 0, 1)`).run()
      const svc = new BoardingCostService()
      const prof = svc.calculateFacilityProfitability(4, 2026, 2)
      expect(prof.occupancy_rate).toBe(0)
    })

    it('getExpenseSummaryByType without term filter', () => {
      const svc = new BoardingCostService()
      svc.recordBoardingExpense({ facility_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 2, amount_cents: 3000, expense_type: 'FOOD', description: 'A', recorded_by: 5 })
      const summary = svc.getExpenseSummaryByType(1, 2026)
      expect(summary.length).toBeGreaterThan(0)
    })

    it('generateProfitabilitySummary with zero total revenue/occupancy', () => {
      // All facilities have zero occupancy
      db.exec('UPDATE boarding_facility SET current_occupancy = 0')
      const svc = new BoardingCostService()
      const summary = svc.generateProfitabilitySummary(2026, 2)
      expect(summary.overall_occupancy_rate).toBe(0)
      expect(summary.average_cost_per_boarder_cents).toBe(0)
    })
  })

  // ======================== TransportCostService ========================
  describe('TransportCostService', () => {
    // --- Expense recording (original + new) ---
    it('rejects transport expense with blank GL account code', () => {
      const service = new TransportCostService()
      expect(() => service.recordTransportExpense({
        route_id: 1, gl_account_code: '   ', fiscal_year: 2026, term: 2,
        amount_cents: 15000, expense_type: 'FUEL', description: 'Fuel top-up', recorded_by: 5
      })).toThrow('GL account code is required')
    })

    it('records transport expense when payload is valid and in active context', () => {
      const service = new TransportCostService()
      const expenseId = service.recordTransportExpense({
        route_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 2,
        amount_cents: 15000, expense_type: 'FUEL', description: 'Fuel top-up', recorded_by: 5
      })
      expect(expenseId).toBeGreaterThan(0)
    })

    it('rejects expense with invalid route_id', () => {
      const service = new TransportCostService()
      expect(() => service.recordTransportExpense({
        route_id: 0, gl_account_code: '5000', fiscal_year: 2026, term: 2,
        amount_cents: 5000, expense_type: 'FUEL', description: 'X', recorded_by: 5
      })).toThrow()
    })

    it('rejects expense with term = 0', () => {
      const service = new TransportCostService()
      expect(() => service.recordTransportExpense({
        route_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 0,
        amount_cents: 5000, expense_type: 'FUEL', description: 'X', recorded_by: 5
      })).toThrow()
    })

    it('rejects expense with negative amount_cents', () => {
      const service = new TransportCostService()
      expect(() => service.recordTransportExpense({
        route_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 2,
        amount_cents: -100, expense_type: 'FUEL', description: 'X', recorded_by: 5
      })).toThrow()
    })

    it('rejects expense when period does not match active context', () => {
      const service = new TransportCostService()
      expect(() => service.recordTransportExpense({
        route_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 1,
        amount_cents: 5000, expense_type: 'FUEL', description: 'X', recorded_by: 5
      })).toThrow('active period')
    })

    it('rejects expense with inactive GL account', () => {
      const service = new TransportCostService()
      expect(() => service.recordTransportExpense({
        route_id: 1, gl_account_code: '5099', fiscal_year: 2026, term: 2,
        amount_cents: 5000, expense_type: 'FUEL', description: 'X', recorded_by: 5
      })).toThrow()
    })

    it('rejects expense with inactive user', () => {
      const service = new TransportCostService()
      expect(() => service.recordTransportExpense({
        route_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 2,
        amount_cents: 5000, expense_type: 'FUEL', description: 'X', recorded_by: 6
      })).toThrow()
    })

    // --- Route CRUD ---
    it('getAllRoutes returns all routes', () => {
      const svc = new TransportCostService()
      expect(svc.getAllRoutes().length).toBe(2)
    })

    it('getActiveRoutes returns only active routes', () => {
      db.prepare(`INSERT INTO transport_route (route_name, distance_km, is_active) VALUES ('Old Route', 10, 0)`).run()
      const svc = new TransportCostService()
      expect(svc.getActiveRoutes().length).toBe(2)
    })

    it('createRoute inserts and returns id', () => {
      const svc = new TransportCostService()
      const id = svc.createRoute({ route_name: 'Route C', distance_km: 15, estimated_students: 25, budget_per_term_cents: 50000 })
      expect(id).toBeGreaterThan(0)
      expect(svc.getAllRoutes().length).toBe(3)
    })

    it('deactivateRoute sets is_active to 0', () => {
      const svc = new TransportCostService()
      svc.deactivateRoute(2)
      expect(svc.getActiveRoutes().length).toBe(1)
    })

    // --- Expense queries ---
    it('getRouteExpenses returns filtered expenses', () => {
      const svc = new TransportCostService()
      svc.recordTransportExpense({ route_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 2, amount_cents: 5000, expense_type: 'FUEL', description: 'A', recorded_by: 5 })
      svc.recordTransportExpense({ route_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 2, amount_cents: 3000, expense_type: 'MAINTENANCE', description: 'B', recorded_by: 5 })
      const expenses = svc.getRouteExpenses(1, 2026, 2)
      expect(expenses.length).toBe(2)
    })

    it('getRouteExpenses without term returns all terms', () => {
      const svc = new TransportCostService()
      svc.recordTransportExpense({ route_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 2, amount_cents: 5000, expense_type: 'FUEL', description: 'A', recorded_by: 5 })
      expect(svc.getRouteExpenses(1, 2026).length).toBe(1)
    })

    it('getExpenseSummaryByType groups by type with percentages', () => {
      const svc = new TransportCostService()
      svc.recordTransportExpense({ route_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 2, amount_cents: 6000, expense_type: 'FUEL', description: 'A', recorded_by: 5 })
      svc.recordTransportExpense({ route_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 2, amount_cents: 4000, expense_type: 'MAINTENANCE', description: 'B', recorded_by: 5 })
      const summary = svc.getExpenseSummaryByType(1, 2026, 2)
      expect(summary.length).toBe(2)
      const fuel = summary.find(s => s.expense_type === 'FUEL')
      expect(fuel!.total_amount_cents).toBe(6000)
      expect(fuel!.percentage).toBeCloseTo(60, 0)
    })

    // --- Student route assignment ---
    it('assignStudentToRoute inserts assignment', () => {
      const svc = new TransportCostService()
      const id = svc.assignStudentToRoute({ student_id: 101, route_id: 1, academic_year: 2026, term: 2, pickup_location: 'Main Gate' })
      expect(id).toBeGreaterThan(0)
    })

    it('getRouteStudents returns assignments', () => {
      const svc = new TransportCostService()
      svc.assignStudentToRoute({ student_id: 101, route_id: 1, academic_year: 2026, term: 2, pickup_location: 'Main Gate' })
      svc.assignStudentToRoute({ student_id: 102, route_id: 1, academic_year: 2026, term: 2, pickup_location: 'Junction' })
      const students = svc.getRouteStudents(1, 2026, 2)
      expect(students.length).toBe(2)
    })

    // --- Profitability ---
    it('calculateRouteProfitability returns metrics', () => {
      const svc = new TransportCostService()
      svc.recordTransportExpense({ route_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 2, amount_cents: 10000, expense_type: 'FUEL', description: 'A', recorded_by: 5 })
      const prof = svc.calculateRouteProfitability(1, 2026, 2)
      expect(prof.route_name).toBe('Route A')
      expect(prof.total_expenses_cents).toBe(10000)
      expect(typeof prof.net_profit_cents).toBe('number')
      expect(typeof prof.is_profitable).toBe('boolean')
    })

    it('getAllRoutesProfitability returns array for all active routes', () => {
      const svc = new TransportCostService()
      const profs = svc.getAllRoutesProfitability(2026, 2)
      expect(profs.length).toBe(2)
    })

    it('getUnprofitableRoutes returns only unprofitable ones', () => {
      const svc = new TransportCostService()
      // Route 1 has expenses but no revenue → unprofitable
      svc.recordTransportExpense({ route_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 2, amount_cents: 10000, expense_type: 'FUEL', description: 'A', recorded_by: 5 })
      const unprofitable = svc.getUnprofitableRoutes(2026, 2)
      expect(unprofitable.length).toBeGreaterThanOrEqual(1)
      expect(unprofitable.every(r => !r.is_profitable)).toBe(true)
    })

    it('generateProfitabilitySummary returns aggregate report', () => {
      const svc = new TransportCostService()
      svc.recordTransportExpense({ route_id: 1, gl_account_code: '5000', fiscal_year: 2026, term: 2, amount_cents: 5000, expense_type: 'FUEL', description: 'A', recorded_by: 5 })
      const summary = svc.generateProfitabilitySummary(2026, 2)
      expect(typeof summary.total_routes).toBe('number')
      expect(typeof summary.total_students).toBe('number')
      expect(typeof summary.net_profit_cents).toBe('number')
      expect(summary.routes.length).toBeGreaterThanOrEqual(1)
    })
  })
})
