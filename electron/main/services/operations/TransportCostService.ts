import { getDatabase } from '../../database';
import { DoubleEntryJournalService } from '../accounting/DoubleEntryJournalService';
import { SystemAccounts } from '../accounting/SystemAccounts';

interface TransportRoute {
  id: number;
  route_name: string;
  distance_km: number;
  estimated_students: number;
  budget_per_term_cents: number;
  driver_id?: number;
  vehicle_registration?: string;
  is_active: boolean;
}

interface TransportRouteExpense {
  id: number;
  route_id: number;
  gl_account_code: string;
  fiscal_year: number;
  term: number;
  amount_cents: number;
  expense_type: 'FUEL' | 'MAINTENANCE' | 'INSURANCE' | 'PERMITS' | 'DRIVER_SALARY' | 'OTHER';
  description: string;
  recorded_date: string;
  recorded_by: number;
}

interface StudentRouteAssignment {
  id: number;
  student_id: number;
  route_id: number;
  academic_year: number;
  term: number;
  pickup_location: string;
}

interface RouteProfitability {
  route_id: number;
  route_name: string;
  distance_km: number;
  student_count: number;
  total_revenue_cents: number;
  total_expenses_cents: number;
  net_profit_cents: number;
  profit_margin: number;
  cost_per_student_cents: number;
  cost_per_km_cents: number;
  is_profitable: boolean;
}

interface ExpenseSummary {
  expense_type: string;
  total_amount_cents: number;
  percentage: number;
}

interface CountResult {
  count: number;
}

interface RevenueResult {
  total_revenue: number;
}

interface ExpenseSummaryResult {
  expense_type: string;
  total_amount_cents: number;
}

/**
 * TransportCostService
 * 
 * Manages transport route costs and profitability analysis.
 * Tracks revenue from transport fees vs actual costs (fuel, maintenance, insurance, driver salaries).
 * Identifies profitable vs unprofitable routes for optimization.
 * 
 * Key Features:
 * - Track expenses by route and expense type
 * - Calculate cost per student per route
 * - Identify unprofitable routes
 * - Support route optimization decisions
 * - Generate profitability reports
 */
export class TransportCostService {
  private get db() { return getDatabase(); }

  private getCurrentAcademicContext(): { fiscal_year: number; term_number: number } {
    const current = this.db.prepare(`
      SELECT ay.year_name, t.term_number
      FROM academic_year ay
      JOIN term t ON t.academic_year_id = ay.id
      WHERE ay.is_current = 1 AND t.is_current = 1
      LIMIT 1
    `).get() as { term_number: number; year_name: string } | undefined

    if (!current) {
      throw new Error('No active academic year and term are configured')
    }

    const fiscalYear = Number.parseInt(current.year_name, 10)
    if (!Number.isFinite(fiscalYear)) {
      throw new Error(`Active academic year '${current.year_name}' is not numeric`)
    }

    return {
      fiscal_year: fiscalYear,
      term_number: current.term_number
    }
  }

  private assertActiveExpensePeriod(fiscalYear: number, term: number): void {
    const active = this.getCurrentAcademicContext()
    if (active.fiscal_year !== fiscalYear || active.term_number !== term) {
      throw new Error(
        `Transport expenses must be recorded in the active period (${active.fiscal_year} term ${active.term_number})`
      )
    }
  }

  private assertValidGLAccount(glAccountCode: string): void {
    if (!glAccountCode || !glAccountCode.trim()) {
      throw new Error('GL account code is required')
    }

    const account = this.db.prepare(`
      SELECT account_code
      FROM gl_account
      WHERE account_code = ? AND is_active = 1
      LIMIT 1
    `).get(glAccountCode.trim()) as { account_code: string } | undefined

    if (!account) {
      throw new Error(`Invalid or inactive GL account code: ${glAccountCode}`)
    }
  }

  private assertValidRecorder(userId: number): void {
    const user = this.db.prepare(`
      SELECT id
      FROM user
      WHERE id = ? AND is_active = 1
      LIMIT 1
    `).get(userId) as { id: number } | undefined

    if (!user) {
      throw new Error('Recorded by user is invalid or inactive')
    }
  }

  /**
   * Get all transport routes
   */
  getAllRoutes(): TransportRoute[] {
    const query = `
      SELECT * FROM transport_route
      ORDER BY route_name
    `;
    return this.db.prepare(query).all() as TransportRoute[];
  }

  /**
   * Get active transport routes
   */
  getActiveRoutes(): TransportRoute[] {
    const query = `
      SELECT * FROM transport_route
      WHERE is_active = 1
      ORDER BY route_name
    `;
    return this.db.prepare(query).all() as TransportRoute[];
  }

  /**
   * Create a new transport route
   */
  createRoute(params: {
    route_name: string;
    distance_km: number;
    estimated_students: number;
    budget_per_term_cents: number;
    driver_id?: number;
    vehicle_registration?: string;
  }): number {
    const query = `
      INSERT INTO transport_route (
        route_name, distance_km, estimated_students, budget_per_term_cents,
        driver_id, vehicle_registration, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, 1)
    `;

    const result = this.db.prepare(query).run(
      params.route_name,
      params.distance_km,
      params.estimated_students,
      params.budget_per_term_cents,
      params.driver_id || null,
      params.vehicle_registration || null
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Record a transport-related expense
   */
  recordTransportExpense(params: {
    route_id: number;
    gl_account_code: string;
    fiscal_year: number;
    term: number;
    amount_cents: number;
    expense_type: 'FUEL' | 'MAINTENANCE' | 'INSURANCE' | 'PERMITS' | 'DRIVER_SALARY' | 'OTHER';
    description: string;
    recorded_by: number;
  }): number {
    if (!Number.isFinite(params.route_id) || params.route_id <= 0) {
      throw new Error('Valid transport route is required')
    }
    if (!Number.isFinite(params.fiscal_year) || params.fiscal_year < 2000 || params.fiscal_year > 2100) {
      throw new Error('Invalid fiscal year for transport expense')
    }
    if (![1, 2, 3].includes(params.term)) {
      throw new Error('Invalid academic term for transport expense')
    }
    if (!Number.isInteger(params.amount_cents) || params.amount_cents <= 0) {
      throw new Error('Expense amount must be greater than zero')
    }
    if (!Number.isInteger(params.recorded_by) || params.recorded_by <= 0) {
      throw new Error('Recorded by user is required')
    }

    this.assertActiveExpensePeriod(params.fiscal_year, params.term)
    this.assertValidGLAccount(params.gl_account_code)
    this.assertValidRecorder(params.recorded_by)

    const route = this.db.prepare(`
      SELECT id, route_name
      FROM transport_route
      WHERE id = ? AND is_active = 1
      LIMIT 1
    `).get(params.route_id) as { id: number; route_name: string } | undefined

    if (!route) {
      throw new Error('Selected transport route is invalid or inactive')
    }

    const query = `
      INSERT INTO transport_route_expense (
        route_id, gl_account_code, fiscal_year, term,
        amount_cents, expense_type, description,
        recorded_date, recorded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    `;

    const result = this.db.prepare(query).run(
      params.route_id,
      params.gl_account_code,
      params.fiscal_year,
      params.term,
      params.amount_cents,
      params.expense_type,
      params.description?.trim() || null,
      params.recorded_by
    );

    // GL journal entry: Debit Transport Expense, Credit Cash
    if (params.gl_account_code) {
      const journalService = new DoubleEntryJournalService(this.db);
      journalService.createJournalEntrySync({
        entry_date: new Date().toISOString().split('T')[0],
        entry_type: 'TRANSPORT_EXPENSE',
        description: `Transport Expense: ${params.description || params.expense_type} (Route: ${route.route_name})`,
        created_by_user_id: params.recorded_by,
        lines: [
          {
            gl_account_code: params.gl_account_code,
            debit_amount: params.amount_cents,
            credit_amount: 0,
            description: `Transport expense - ${params.expense_type}`
          },
          {
            gl_account_code: SystemAccounts.CASH,
            debit_amount: 0,
            credit_amount: params.amount_cents,
            description: 'Cash payment for transport expense'
          }
        ]
      });
    }

    return result.lastInsertRowid as number;
  }

  /**
   * Get expenses for a route
   */
  getRouteExpenses(
    routeId: number,
    fiscalYear: number,
    term?: number
  ): TransportRouteExpense[] {
    let query = `
      SELECT * FROM transport_route_expense
      WHERE route_id = ? AND fiscal_year = ?
    `;

    const params: unknown[] = [routeId, fiscalYear];

    if (term) {
      query += ` AND term = ?`;
      params.push(term);
    }

    query += ` ORDER BY recorded_date DESC`;

    return this.db.prepare(query).all(...params) as TransportRouteExpense[];
  }

  /**
   * Get total expenses by type for a route
   */
  getExpenseSummaryByType(
    routeId: number,
    fiscalYear: number,
    term?: number
  ): ExpenseSummary[] {
    let query = `
      SELECT 
        expense_type,
        SUM(amount_cents) as total_amount_cents
      FROM transport_route_expense
      WHERE route_id = ? AND fiscal_year = ?
    `;

    const params: unknown[] = [routeId, fiscalYear];

    if (term) {
      query += ` AND term = ?`;
      params.push(term);
    }

    query += `
      GROUP BY expense_type
      ORDER BY total_amount_cents DESC
    `;

    const results = this.db.prepare(query).all(...params) as ExpenseSummaryResult[];

    // Calculate total for percentages
    const total = results.reduce((sum, row) => sum + row.total_amount_cents, 0);

    return results.map(row => ({
      expense_type: row.expense_type,
      total_amount_cents: row.total_amount_cents,
      percentage: total > 0 ? (row.total_amount_cents / total) * 100 : 0
    }));
  }

  /**
   * Assign a student to a route
   */
  assignStudentToRoute(params: {
    student_id: number;
    route_id: number;
    academic_year: number;
    term: number;
    pickup_location: string;
  }): number {
    const query = `
      INSERT INTO student_route_assignment (
        student_id, route_id, academic_year, term, pickup_location
      ) VALUES (?, ?, ?, ?, ?)
    `;

    const result = this.db.prepare(query).run(
      params.student_id,
      params.route_id,
      params.academic_year,
      params.term,
      params.pickup_location
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Get students assigned to a route
   */
  getRouteStudents(
    routeId: number,
    academicYear: number,
    term: number
  ): StudentRouteAssignment[] {
    const query = `
      SELECT * FROM student_route_assignment
      WHERE route_id = ? AND academic_year = ? AND term = ?
      ORDER BY pickup_location
    `;

    return this.db.prepare(query).all(routeId, academicYear, term) as StudentRouteAssignment[];
  }

  /**
   * Calculate transport revenue for a route
   * Revenue comes from transport fees paid by students assigned to this route
   */
  private calculateRouteRevenue(
    routeId: number,
    fiscalYear: number,
    term?: number
  ): number {
    // Get transport fee revenue from invoice items tagged as transport
    let revenueQuery = `
      SELECT COALESCE(SUM(ii.amount), 0) as total_revenue
      FROM fee_invoice fi
      JOIN invoice_item ii ON fi.id = ii.invoice_id
      JOIN fee_category fc ON ii.fee_category_id = fc.id
      JOIN student_route_assignment sra ON fi.student_id = sra.student_id
      LEFT JOIN term t ON fi.term_id = t.id
      WHERE sra.route_id = ?
        AND sra.academic_year = ?
        AND LOWER(fc.category_name) LIKE '%transport%'
        AND CAST(strftime('%Y', fi.invoice_date) AS INTEGER) = ?
    `;

    const revenueParams: unknown[] = [routeId, fiscalYear, fiscalYear];

    if (term) {
      revenueQuery += ` AND sra.term = ? AND t.term_number = ?`;
      revenueParams.push(term, term);
    }

    const revenueResult = this.db.prepare(revenueQuery).get(...revenueParams) as RevenueResult | undefined;
    return revenueResult?.total_revenue || 0;
  }

  /**
   * Calculate profitability for a transport route
   */
  calculateRouteProfitability(
    routeId: number,
    fiscalYear: number,
    term?: number
  ): RouteProfitability {
    // Get route details
    const route = this.db.prepare(`
      SELECT * FROM transport_route WHERE id = ?
    `).get(routeId) as TransportRoute | undefined;

    if (!route) {
      throw new Error(`Transport route ${routeId} not found`);
    }

    // Get student count
    let studentCountQuery = `
      SELECT COUNT(*) as count
      FROM student_route_assignment
      WHERE route_id = ? AND academic_year = ?
    `;

    const studentCountParams: unknown[] = [routeId, fiscalYear];

    if (term) {
      studentCountQuery += ` AND term = ?`;
      studentCountParams.push(term);
    }

    const studentCountResult = this.db.prepare(studentCountQuery).get(...studentCountParams) as CountResult | undefined;
    const studentCount = studentCountResult?.count || 0;

    // Calculate revenue
    const totalRevenueCents = this.calculateRouteRevenue(routeId, fiscalYear, term);

    // Calculate total expenses
    const expenses = this.getRouteExpenses(routeId, fiscalYear, term);
    const totalExpensesCents = expenses.reduce((sum, exp) => sum + exp.amount_cents, 0);

    // Calculate metrics
    const netProfitCents = totalRevenueCents - totalExpensesCents;
    const profitMargin = totalRevenueCents > 0 
      ? (netProfitCents / totalRevenueCents) * 100 
      : 0;
    
    const costPerStudentCents = studentCount > 0
      ? totalExpensesCents / studentCount
      : 0;

    const costPerKmCents = route.distance_km > 0
      ? totalExpensesCents / route.distance_km
      : 0;

    return {
      route_id: route.id,
      route_name: route.route_name,
      distance_km: route.distance_km,
      student_count: studentCount,
      total_revenue_cents: totalRevenueCents,
      total_expenses_cents: totalExpensesCents,
      net_profit_cents: netProfitCents,
      profit_margin: profitMargin,
      cost_per_student_cents: costPerStudentCents,
      cost_per_km_cents: costPerKmCents,
      is_profitable: netProfitCents >= 0
    };
  }

  /**
   * Get profitability for all routes
   */
  getAllRoutesProfitability(
    fiscalYear: number,
    term?: number
  ): RouteProfitability[] {
    const routes = this.getActiveRoutes();
    
    return routes.map(route => 
      this.calculateRouteProfitability(route.id, fiscalYear, term)
    );
  }

  /**
   * Get unprofitable routes (routes with negative profit)
   */
  getUnprofitableRoutes(
    fiscalYear: number,
    term?: number
  ): RouteProfitability[] {
    const allRoutes = this.getAllRoutesProfitability(fiscalYear, term);
    return allRoutes.filter(route => !route.is_profitable);
  }

  /**
   * Generate transport profitability summary report
   */
  generateProfitabilitySummary(fiscalYear: number, term?: number): {
    total_routes: number;
    profitable_routes: number;
    unprofitable_routes: number;
    total_students: number;
    total_revenue_cents: number;
    total_expenses_cents: number;
    net_profit_cents: number;
    profit_margin: number;
    average_cost_per_student_cents: number;
    routes: RouteProfitability[];
  } {
    const routes = this.getAllRoutesProfitability(fiscalYear, term);

    const profitableCount = routes.filter(r => r.is_profitable).length;
    const totalStudents = routes.reduce((sum, r) => sum + r.student_count, 0);
    const totalRevenue = routes.reduce((sum, r) => sum + r.total_revenue_cents, 0);
    const totalExpenses = routes.reduce((sum, r) => sum + r.total_expenses_cents, 0);
    const netProfit = totalRevenue - totalExpenses;

    return {
      total_routes: routes.length,
      profitable_routes: profitableCount,
      unprofitable_routes: routes.length - profitableCount,
      total_students: totalStudents,
      total_revenue_cents: totalRevenue,
      total_expenses_cents: totalExpenses,
      net_profit_cents: netProfit,
      profit_margin: totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0,
      average_cost_per_student_cents: totalStudents > 0 ? totalExpenses / totalStudents : 0,
      routes
    };
  }

  /**
   * Deactivate a route
   */
  deactivateRoute(routeId: number): void {
    const query = `
      UPDATE transport_route
      SET is_active = 0
      WHERE id = ?
    `;

    this.db.prepare(query).run(routeId);
  }
}

export default TransportCostService;
