import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db,
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn(),
}))

vi.mock('../../accounting/DoubleEntryJournalService', () => ({
  DoubleEntryJournalService: class {
    createJournalEntrySync() { return { success: true, entryId: 1 } }
  },
}))

import TransportCostService from '../TransportCostService'

function createSchema(targetDb: Database.Database): void {
  targetDb.exec(`
    CREATE TABLE academic_year (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year_name TEXT NOT NULL,
      is_current INTEGER DEFAULT 0
    );
    CREATE TABLE term (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      academic_year_id INTEGER NOT NULL,
      term_number INTEGER NOT NULL,
      is_current INTEGER DEFAULT 0
    );
    CREATE TABLE user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL DEFAULT 'h',
      full_name TEXT NOT NULL,
      role TEXT NOT NULL,
      is_active INTEGER DEFAULT 1
    );
    CREATE TABLE gl_account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_code TEXT NOT NULL UNIQUE,
      account_name TEXT NOT NULL,
      account_type TEXT NOT NULL,
      normal_balance TEXT NOT NULL,
      is_active INTEGER DEFAULT 1
    );
    CREATE TABLE transport_route (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_name TEXT NOT NULL,
      distance_km REAL NOT NULL DEFAULT 0,
      estimated_students INTEGER NOT NULL DEFAULT 0,
      budget_per_term_cents INTEGER NOT NULL DEFAULT 0,
      driver_id INTEGER,
      vehicle_registration TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE transport_route_expense (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_id INTEGER NOT NULL,
      gl_account_code TEXT NOT NULL,
      fiscal_year INTEGER NOT NULL,
      term INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      expense_type TEXT NOT NULL,
      description TEXT,
      recorded_date DATETIME,
      recorded_by INTEGER NOT NULL
    );
    CREATE TABLE student_route_assignment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      route_id INTEGER NOT NULL,
      academic_year INTEGER NOT NULL,
      term INTEGER NOT NULL,
      pickup_location TEXT
    );
    CREATE TABLE student (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_number TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      student_type TEXT DEFAULT 'DAY_SCHOLAR',
      is_active INTEGER DEFAULT 1
    );
    CREATE TABLE fee_invoice (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      term_id INTEGER,
      invoice_date DATE,
      total_amount INTEGER DEFAULT 0
    );
    CREATE TABLE invoice_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      fee_category_id INTEGER NOT NULL,
      description TEXT,
      amount INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE fee_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_name TEXT NOT NULL UNIQUE,
      description TEXT,
      is_active INTEGER DEFAULT 1
    );

    -- Seed data
    INSERT INTO academic_year (id, year_name, is_current) VALUES (1, '2026', 1);
    INSERT INTO term (id, academic_year_id, term_number, is_current) VALUES (1, 1, 1, 1);
    INSERT INTO user (id, username, full_name, role) VALUES (1, 'admin', 'Admin User', 'ADMIN');
    INSERT INTO gl_account (account_code, account_name, account_type, normal_balance)
      VALUES ('5100', 'Transport Expense', 'EXPENSE', 'DEBIT');
    INSERT INTO gl_account (account_code, account_name, account_type, normal_balance)
      VALUES ('1010', 'Cash', 'ASSET', 'DEBIT');

    INSERT INTO transport_route (id, route_name, distance_km, estimated_students, budget_per_term_cents)
      VALUES (1, 'Route A - Mwingi Town', 15, 30, 500000);
    INSERT INTO transport_route (id, route_name, distance_km, estimated_students, budget_per_term_cents)
      VALUES (2, 'Route B - Garissa Road', 25, 20, 750000);
    INSERT INTO transport_route (id, route_name, distance_km, estimated_students, budget_per_term_cents, is_active)
      VALUES (3, 'Route C - Inactive', 10, 5, 100000, 0);

    INSERT INTO student (id, admission_number, first_name, last_name) VALUES (1, 'ADM-001', 'John', 'Doe');
    INSERT INTO student (id, admission_number, first_name, last_name) VALUES (2, 'ADM-002', 'Jane', 'Smith');

    INSERT INTO fee_category (id, category_name) VALUES (1, 'Transport Fee');
  `)
}

describe('TransportCostService', () => {
  let service: TransportCostService

  beforeEach(() => {
    db = new Database(':memory:')
    createSchema(db)
    service = new TransportCostService()
  })

  afterEach(() => {
    db.close()
  })

  // ── Route CRUD ────────────────────────────────────────────────
  describe('getAllRoutes', () => {
    it('returns all routes including inactive', () => {
      const routes = service.getAllRoutes()
      expect(routes.length).toBe(3)
    })
  })

  describe('getActiveRoutes', () => {
    it('returns only active routes', () => {
      const routes = service.getActiveRoutes()
      expect(routes.length).toBe(2)
      expect(routes.every(r => r.is_active)).toBe(true)
    })
  })

  describe('createRoute', () => {
    it('creates a route and returns its id', () => {
      const id = service.createRoute({
        route_name: 'New Route',
        distance_km: 12,
        estimated_students: 15,
        budget_per_term_cents: 300000,
      })
      expect(id).toBeGreaterThan(0)
      const routes = service.getAllRoutes()
      expect(routes.length).toBe(4)
    })

    it('creates route with optional driver and vehicle', () => {
      const id = service.createRoute({
        route_name: 'Full Route',
        distance_km: 20,
        estimated_students: 25,
        budget_per_term_cents: 600000,
        driver_id: 1,
        vehicle_registration: 'KBZ 123A',
      })
      expect(id).toBeGreaterThan(0)
      const route = db.prepare('SELECT * FROM transport_route WHERE id = ?').get(id) as any
      expect(route.driver_id).toBe(1)
      expect(route.vehicle_registration).toBe('KBZ 123A')
    })

    it('defaults driver_id and vehicle_registration to null when not provided', () => {
      const id = service.createRoute({
        route_name: 'Simple Route',
        distance_km: 5,
        estimated_students: 10,
        budget_per_term_cents: 100000,
      })
      const route = db.prepare('SELECT * FROM transport_route WHERE id = ?').get(id) as any
      expect(route.driver_id).toBeNull()
      expect(route.vehicle_registration).toBeNull()
    })
  })

  describe('deactivateRoute', () => {
    it('sets is_active to 0', () => {
      service.deactivateRoute(1)
      const route = db.prepare('SELECT is_active FROM transport_route WHERE id = 1').get() as any
      expect(route.is_active).toBe(0)
    })
  })

  // ── Record Transport Expense ──────────────────────────────────
  describe('recordTransportExpense', () => {
    it('records expense and returns id', () => {
      const id = service.recordTransportExpense({
        route_id: 1,
        gl_account_code: '5100',
        fiscal_year: 2026,
        term: 1,
        amount_cents: 50000,
        expense_type: 'FUEL',
        description: 'January fuel',
        recorded_by: 1,
      })
      expect(id).toBeGreaterThan(0)
    })

    it('throws for invalid route_id', () => {
      expect(() => service.recordTransportExpense({
        route_id: 0,
        gl_account_code: '5100',
        fiscal_year: 2026, term: 1,
        amount_cents: 1000, expense_type: 'FUEL',
        description: 'x', recorded_by: 1,
      })).toThrow('Valid transport route is required')
    })

    it('throws for invalid fiscal year', () => {
      expect(() => service.recordTransportExpense({
        route_id: 1,
        gl_account_code: '5100',
        fiscal_year: 1999, term: 1,
        amount_cents: 1000, expense_type: 'FUEL',
        description: 'x', recorded_by: 1,
      })).toThrow('Invalid fiscal year')
    })

    it('throws for invalid term', () => {
      expect(() => service.recordTransportExpense({
        route_id: 1,
        gl_account_code: '5100',
        fiscal_year: 2026, term: 5,
        amount_cents: 1000, expense_type: 'FUEL',
        description: 'x', recorded_by: 1,
      })).toThrow('Invalid academic term')
    })

    it('throws for non-positive amount', () => {
      expect(() => service.recordTransportExpense({
        route_id: 1,
        gl_account_code: '5100',
        fiscal_year: 2026, term: 1,
        amount_cents: 0, expense_type: 'FUEL',
        description: 'x', recorded_by: 1,
      })).toThrow('Expense amount must be greater than zero')
    })

    it('throws for invalid recorded_by', () => {
      expect(() => service.recordTransportExpense({
        route_id: 1,
        gl_account_code: '5100',
        fiscal_year: 2026, term: 1,
        amount_cents: 1000, expense_type: 'FUEL',
        description: 'x', recorded_by: 0,
      })).toThrow('Recorded by user is required')
    })

    it('throws when expense period does not match active period', () => {
      expect(() => service.recordTransportExpense({
        route_id: 1,
        gl_account_code: '5100',
        fiscal_year: 2025, term: 1,
        amount_cents: 1000, expense_type: 'FUEL',
        description: 'x', recorded_by: 1,
      })).toThrow('active period')
    })

    it('throws for invalid GL account code', () => {
      expect(() => service.recordTransportExpense({
        route_id: 1,
        gl_account_code: 'INVALID',
        fiscal_year: 2026, term: 1,
        amount_cents: 1000, expense_type: 'FUEL',
        description: 'x', recorded_by: 1,
      })).toThrow('Invalid or inactive GL account')
    })

    it('throws for empty GL account code', () => {
      expect(() => service.recordTransportExpense({
        route_id: 1,
        gl_account_code: '',
        fiscal_year: 2026, term: 1,
        amount_cents: 1000, expense_type: 'FUEL',
        description: 'x', recorded_by: 1,
      })).toThrow('GL account code is required')
    })

    it('throws for inactive user', () => {
      db.prepare('UPDATE user SET is_active = 0 WHERE id = 1').run()
      expect(() => service.recordTransportExpense({
        route_id: 1,
        gl_account_code: '5100',
        fiscal_year: 2026, term: 1,
        amount_cents: 1000, expense_type: 'FUEL',
        description: 'x', recorded_by: 1,
      })).toThrow('Recorded by user is invalid or inactive')
    })

    it('throws for inactive route', () => {
      expect(() => service.recordTransportExpense({
        route_id: 3, // inactive
        gl_account_code: '5100',
        fiscal_year: 2026, term: 1,
        amount_cents: 1000, expense_type: 'FUEL',
        description: 'x', recorded_by: 1,
      })).toThrow('transport route is invalid or inactive')
    })
  })

  // ── Expense Queries ───────────────────────────────────────────
  describe('getRouteExpenses', () => {
    beforeEach(() => {
      service.recordTransportExpense({
        route_id: 1, gl_account_code: '5100',
        fiscal_year: 2026, term: 1,
        amount_cents: 30000, expense_type: 'FUEL',
        description: 'Fuel Jan', recorded_by: 1,
      })
      service.recordTransportExpense({
        route_id: 1, gl_account_code: '5100',
        fiscal_year: 2026, term: 1,
        amount_cents: 10000, expense_type: 'MAINTENANCE',
        description: 'Oil change', recorded_by: 1,
      })
    })

    it('returns all expenses for route and year', () => {
      const expenses = service.getRouteExpenses(1, 2026)
      expect(expenses.length).toBe(2)
    })

    it('filters by term when provided', () => {
      const expenses = service.getRouteExpenses(1, 2026, 1)
      expect(expenses.length).toBe(2)
      const noExpenses = service.getRouteExpenses(1, 2026, 2)
      expect(noExpenses.length).toBe(0)
    })
  })

  describe('getExpenseSummaryByType', () => {
    beforeEach(() => {
      service.recordTransportExpense({
        route_id: 1, gl_account_code: '5100',
        fiscal_year: 2026, term: 1,
        amount_cents: 30000, expense_type: 'FUEL',
        description: 'Fuel', recorded_by: 1,
      })
      service.recordTransportExpense({
        route_id: 1, gl_account_code: '5100',
        fiscal_year: 2026, term: 1,
        amount_cents: 10000, expense_type: 'MAINTENANCE',
        description: 'Repairs', recorded_by: 1,
      })
    })

    it('returns expense breakdown by type', () => {
      const summary = service.getExpenseSummaryByType(1, 2026)
      expect(summary.length).toBe(2)
      const fuel = summary.find(s => s.expense_type === 'FUEL')
      expect(fuel!.total_amount_cents).toBe(30000)
      expect(fuel!.percentage).toBeCloseTo(75, 0)
    })

    it('filters by term', () => {
      const noTerm2 = service.getExpenseSummaryByType(1, 2026, 2)
      expect(noTerm2.length).toBe(0)
    })

    it('returns 0 percentage when total is 0', () => {
      const empty = service.getExpenseSummaryByType(2, 2026)
      expect(empty.length).toBe(0)
    })
  })

  // ── Student Route Assignment ──────────────────────────────────
  describe('assignStudentToRoute / getRouteStudents', () => {
    it('assigns student and retrieves assignment', () => {
      const id = service.assignStudentToRoute({
        student_id: 1, route_id: 1,
        academic_year: 2026, term: 1,
        pickup_location: 'Town Center',
      })
      expect(id).toBeGreaterThan(0)

      const students = service.getRouteStudents(1, 2026, 1)
      expect(students.length).toBe(1)
      expect(students[0]!.pickup_location).toBe('Town Center')
    })
  })

  // ── Profitability Analysis ────────────────────────────────────
  describe('calculateRouteProfitability', () => {
    it('calculates profitability with zero expenses and zero revenue', () => {
      const result = service.calculateRouteProfitability(1, 2026)
      expect(result.route_id).toBe(1)
      expect(result.total_expenses_cents).toBe(0)
      expect(result.total_revenue_cents).toBe(0)
      expect(result.net_profit_cents).toBe(0)
      expect(result.profit_margin).toBe(0)
      expect(result.is_profitable).toBe(true)
    })

    it('throws for non-existent route', () => {
      expect(() => service.calculateRouteProfitability(999, 2026)).toThrow('not found')
    })

    it('calculates cost per student and cost per km', () => {
      // Assign 2 students
      service.assignStudentToRoute({ student_id: 1, route_id: 1, academic_year: 2026, term: 1, pickup_location: 'A' })
      service.assignStudentToRoute({ student_id: 2, route_id: 1, academic_year: 2026, term: 1, pickup_location: 'B' })
      // Record expense
      service.recordTransportExpense({
        route_id: 1, gl_account_code: '5100',
        fiscal_year: 2026, term: 1,
        amount_cents: 30000, expense_type: 'FUEL',
        description: 'Fuel', recorded_by: 1,
      })

      const result = service.calculateRouteProfitability(1, 2026)
      expect(result.student_count).toBe(2)
      expect(result.cost_per_student_cents).toBe(15000) // 30000 / 2
      expect(result.cost_per_km_cents).toBe(2000) // 30000 / 15
      expect(result.is_profitable).toBe(false) // revenue=0, expenses > 0
    })

    it('filters by term when provided', () => {
      service.recordTransportExpense({
        route_id: 1, gl_account_code: '5100',
        fiscal_year: 2026, term: 1,
        amount_cents: 20000, expense_type: 'FUEL',
        description: 'Fuel', recorded_by: 1,
      })
      const withTerm = service.calculateRouteProfitability(1, 2026, 1)
      expect(withTerm.total_expenses_cents).toBe(20000)
    })

    it('cost_per_student_cents is 0 when no students assigned', () => {
      service.recordTransportExpense({
        route_id: 1, gl_account_code: '5100',
        fiscal_year: 2026, term: 1,
        amount_cents: 10000, expense_type: 'FUEL',
        description: 'Fuel', recorded_by: 1,
      })
      const result = service.calculateRouteProfitability(1, 2026)
      expect(result.cost_per_student_cents).toBe(0)
    })

    it('cost_per_km_cents is 0 when distance is 0', () => {
      // Create route with 0 distance
      const id = service.createRoute({
        route_name: 'Zero Distance', distance_km: 0,
        estimated_students: 5, budget_per_term_cents: 100000,
      })
      const result = service.calculateRouteProfitability(id, 2026)
      expect(result.cost_per_km_cents).toBe(0)
    })
  })

  describe('getAllRoutesProfitability', () => {
    it('returns profitability for all active routes', () => {
      const results = service.getAllRoutesProfitability(2026)
      expect(results.length).toBe(2) // only active routes
    })
  })

  describe('getUnprofitableRoutes', () => {
    it('returns only unprofitable routes', () => {
      // No expenses → all routes are profitable (net=0)
      expect(service.getUnprofitableRoutes(2026).length).toBe(0)

      // Add expense to route 1 → now unprofitable (revenue=0)
      service.recordTransportExpense({
        route_id: 1, gl_account_code: '5100',
        fiscal_year: 2026, term: 1,
        amount_cents: 50000, expense_type: 'FUEL',
        description: 'Fuel', recorded_by: 1,
      })
      const unprofitable = service.getUnprofitableRoutes(2026)
      expect(unprofitable.length).toBe(1)
      expect(unprofitable[0]!.route_name).toBe('Route A - Mwingi Town')
    })
  })

  // ── Summary Report ────────────────────────────────────────────
  describe('generateProfitabilitySummary', () => {
    it('generates correct summary with no expenses', () => {
      const summary = service.generateProfitabilitySummary(2026)
      expect(summary.total_routes).toBe(2)
      expect(summary.profitable_routes).toBe(2)
      expect(summary.unprofitable_routes).toBe(0)
      expect(summary.total_revenue_cents).toBe(0)
      expect(summary.profit_margin).toBe(0) // 0 revenue → 0 margin
      expect(summary.average_cost_per_student_cents).toBe(0) // no students
    })

    it('generates summary with expenses and students', () => {
      service.assignStudentToRoute({ student_id: 1, route_id: 1, academic_year: 2026, term: 1, pickup_location: 'A' })
      service.recordTransportExpense({
        route_id: 1, gl_account_code: '5100',
        fiscal_year: 2026, term: 1,
        amount_cents: 40000, expense_type: 'FUEL',
        description: 'Fuel', recorded_by: 1,
      })

      const summary = service.generateProfitabilitySummary(2026)
      expect(summary.total_expenses_cents).toBe(40000)
      expect(summary.total_students).toBe(1)
      expect(summary.average_cost_per_student_cents).toBe(40000)
      expect(summary.unprofitable_routes).toBe(1)
    })

    it('filters by term', () => {
      service.recordTransportExpense({
        route_id: 1, gl_account_code: '5100',
        fiscal_year: 2026, term: 1,
        amount_cents: 10000, expense_type: 'FUEL',
        description: 'Fuel', recorded_by: 1,
      })
      const term2 = service.generateProfitabilitySummary(2026, 2)
      expect(term2.total_expenses_cents).toBe(0)
    })
  })

  // ── Edge cases ────────────────────────────────────────────────
  describe('getCurrentAcademicContext edge cases', () => {
    it('throws when no active academic year', () => {
      db.prepare('UPDATE academic_year SET is_current = 0').run()
      expect(() => service.recordTransportExpense({
        route_id: 1, gl_account_code: '5100',
        fiscal_year: 2026, term: 1,
        amount_cents: 1000, expense_type: 'FUEL',
        description: 'x', recorded_by: 1,
      })).toThrow('No active academic year')
    })

    it('throws when year_name is not numeric', () => {
      db.prepare("UPDATE academic_year SET year_name = 'Two Thousand'").run()
      expect(() => service.recordTransportExpense({
        route_id: 1, gl_account_code: '5100',
        fiscal_year: 2026, term: 1,
        amount_cents: 1000, expense_type: 'FUEL',
        description: 'x', recorded_by: 1,
      })).toThrow('not numeric')
    })
  })

  // ── Branch coverage: assertValidGLAccount with null glAccountCode (L131 ?. branch) ──
  describe('assertValidGLAccount null glAccountCode branch', () => {
    it('throws GL account code is required when gl_account_code is null', () => {
      expect(() => service.recordTransportExpense({
        route_id: 1,
        gl_account_code: null as unknown as string,
        fiscal_year: 2026, term: 1,
        amount_cents: 1000, expense_type: 'FUEL',
        description: 'x', recorded_by: 1,
      })).toThrow('GL account code is required')
    })
  })

  // ── Branch coverage: getExpenseSummaryByType percentage=0 when total=0 (L356 false branch) ──
  describe('getExpenseSummaryByType with zero-amount expenses', () => {
    it('returns 0 percentage when all expenses have zero amount', () => {
      // Insert expense records directly with 0 amount to bypass service validation
      db.prepare(
        `INSERT INTO transport_route_expense (route_id, gl_account_code, fiscal_year, term, amount_cents, expense_type, description, recorded_by)
         VALUES (1, '5100', 2026, 1, 0, 'FUEL', 'zero amount', 1)`
      ).run()
      db.prepare(
        `INSERT INTO transport_route_expense (route_id, gl_account_code, fiscal_year, term, amount_cents, expense_type, description, recorded_by)
         VALUES (1, '5100', 2026, 1, 0, 'MAINTENANCE', 'zero amount', 1)`
      ).run()

      const summary = service.getExpenseSummaryByType(1, 2026)
      expect(summary.length).toBe(2)
      // total=0, so percentage should be 0 for both
      expect(summary[0]!.percentage).toBe(0)
      expect(summary[1]!.percentage).toBe(0)
    })
  })

  // ── Branch coverage: profitMargin > 0 (L481) and summary profit_margin > 0 (L564) ──
  describe('calculateRouteProfitability with transport fee revenue', () => {
    it('computes positive profit margin when transport fee revenue exists (L481)', () => {
      // Assign student to route
      service.assignStudentToRoute({
        student_id: 1, route_id: 1, academic_year: 2026, term: 1, pickup_location: 'Stop A',
      })

      // Create fee invoice with transport fee items
      db.prepare(
        `INSERT INTO fee_invoice (id, student_id, term_id, invoice_date, total_amount)
         VALUES (1, 1, 1, '2026-02-01', 50000)`
      ).run()
      db.prepare(
        `INSERT INTO invoice_item (invoice_id, fee_category_id, description, amount)
         VALUES (1, 1, 'Transport Fee T1', 50000)`
      ).run()

      // Record some expenses (less than revenue)
      service.recordTransportExpense({
        route_id: 1, gl_account_code: '5100',
        fiscal_year: 2026, term: 1,
        amount_cents: 20000, expense_type: 'FUEL',
        description: 'Fuel', recorded_by: 1,
      })

      const result = service.calculateRouteProfitability(1, 2026)
      expect(result.total_revenue_cents).toBe(50000)
      expect(result.total_expenses_cents).toBe(20000)
      expect(result.net_profit_cents).toBe(30000)
      expect(result.profit_margin).toBeCloseTo(60, 0) // 30000/50000 * 100
      expect(result.is_profitable).toBe(true)
    })
  })

  describe('generateProfitabilitySummary with transport fee revenue', () => {
    it('computes positive summary profit_margin when revenue exists (L564)', () => {
      service.assignStudentToRoute({
        student_id: 1, route_id: 1, academic_year: 2026, term: 1, pickup_location: 'Stop A',
      })
      db.prepare(
        `INSERT INTO fee_invoice (id, student_id, term_id, invoice_date, total_amount)
         VALUES (1, 1, 1, '2026-02-01', 60000)`
      ).run()
      db.prepare(
        `INSERT INTO invoice_item (invoice_id, fee_category_id, description, amount)
         VALUES (1, 1, 'Transport Fee', 60000)`
      ).run()

      service.recordTransportExpense({
        route_id: 1, gl_account_code: '5100',
        fiscal_year: 2026, term: 1,
        amount_cents: 30000, expense_type: 'FUEL',
        description: 'Fuel', recorded_by: 1,
      })

      const summary = service.generateProfitabilitySummary(2026)
      expect(summary.total_revenue_cents).toBe(60000)
      expect(summary.profit_margin).toBeGreaterThan(0)
      expect(summary.total_students).toBe(1)
      expect(summary.average_cost_per_student_cents).toBe(30000)
    })
  })
})
