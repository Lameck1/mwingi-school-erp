import { getDatabase } from '../../database';
import { DoubleEntryJournalService } from '../accounting/DoubleEntryJournalService';
import { SystemAccounts } from '../accounting/SystemAccounts';

interface BoardingFacility {
  id: number;
  name: string;
  capacity: number;
  current_occupancy: number;
  matron_id?: number;
  is_active: boolean;
}

interface BoardingExpense {
  id: number;
  facility_id: number;
  gl_account_code: string;
  fiscal_year: number;
  term: number;
  amount_cents: number;
  expense_type: 'FOOD' | 'UTILITIES' | 'BEDDING' | 'STAFF' | 'MAINTENANCE' | 'OTHER';
  description: string;
  recorded_date: string;
  recorded_by: number;
}

interface BoardingProfitability {
  facility_id: number;
  facility_name: string;
  capacity: number;
  current_occupancy: number;
  occupancy_rate: number;
  total_revenue_cents: number;
  total_expenses_cents: number;
  net_profit_cents: number;
  profit_margin: number;
  cost_per_boarder_cents: number;
  break_even_occupancy: number;
}

interface ExpenseSummary {
  expense_type: string;
  total_amount_cents: number;
  percentage: number;
}

interface RevenueResult {
  total_revenue: number;
}

/**
 * BoardingCostService
 * 
 * Manages boarding facility costs and profitability analysis.
 * Tracks revenue from boarding fees vs actual costs (food, utilities, staffing, maintenance).
 * Calculates true profitability per facility with occupancy rate analysis.
 * 
 * Key Features:
 * - Track expenses by facility and expense type
 * - Calculate cost per boarder
 * - Determine break-even occupancy rates
 * - Generate profitability reports
 * - Support budget allocation decisions
 */
export class BoardingCostService {
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
        `Boarding expenses must be recorded in the active period (${active.fiscal_year} term ${active.term_number})`
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
   * Get all boarding facilities
   */
  getAllFacilities(): BoardingFacility[] {
    const query = `
      SELECT * FROM boarding_facility
      ORDER BY name
    `;
    return this.db.prepare(query).all() as BoardingFacility[];
  }

  /**
   * Get active boarding facilities
   */
  getActiveFacilities(): BoardingFacility[] {
    const query = `
      SELECT * FROM boarding_facility
      WHERE is_active = 1
      ORDER BY name
    `;
    return this.db.prepare(query).all() as BoardingFacility[];
  }

  /**
   * Record a boarding-related expense
   */
  recordBoardingExpense(params: {
    facility_id: number;
    gl_account_code: string;
    fiscal_year: number;
    term: number;
    amount_cents: number;
    expense_type: 'FOOD' | 'UTILITIES' | 'BEDDING' | 'STAFF' | 'MAINTENANCE' | 'OTHER';
    description: string;
    recorded_by: number;
    payment_method?: 'CASH' | 'BANK';
  }): number {
    if (!Number.isFinite(params.facility_id) || params.facility_id <= 0) {
      throw new Error('Valid boarding facility is required')
    }
    if (!Number.isFinite(params.fiscal_year) || params.fiscal_year < 2000 || params.fiscal_year > 2100) {
      throw new Error('Invalid fiscal year for boarding expense')
    }
    if (![1, 2, 3].includes(params.term)) {
      throw new Error('Invalid academic term for boarding expense')
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

    const facility = this.db.prepare(`
      SELECT id
      FROM boarding_facility
      WHERE id = ? AND is_active = 1
      LIMIT 1
    `).get(params.facility_id) as { id: number } | undefined
    if (!facility) {
      throw new Error('Selected boarding facility is invalid or inactive')
    }

    const query = `
      INSERT INTO boarding_expense (
        facility_id, gl_account_code, fiscal_year, term,
        amount_cents, expense_type, description,
        recorded_date, recorded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    `;

    const result = this.db.prepare(query).run(
      params.facility_id,
      params.gl_account_code,
      params.fiscal_year,
      params.term,
      params.amount_cents,
      params.expense_type,
      params.description?.trim() || null,
      params.recorded_by
    );

    // Create Journal Entry
    try {
      const journalService = new DoubleEntryJournalService(this.db);
      const creditAccount = params.payment_method === 'BANK' ? SystemAccounts.BANK : SystemAccounts.CASH;

      journalService.createJournalEntrySync({
        entry_date: new Date().toISOString(),
        entry_type: 'BOARDING_EXPENSE',
        description: `Boarding Expense: ${params.description || params.expense_type}`,
        created_by_user_id: params.recorded_by,
        lines: [
          {
            gl_account_code: params.gl_account_code,
            debit_amount: params.amount_cents / 100,
            credit_amount: 0,
            description: params.expense_type
          },
          {
            gl_account_code: creditAccount,
            debit_amount: 0,
            credit_amount: params.amount_cents / 100,
            description: 'Paid via ' + (params.payment_method || 'CASH')
          }
        ]
      });
    } catch (error) {
      console.error('Failed to create journal entry for boarding expense:', error);
      throw error;
    }

    return result.lastInsertRowid as number;
  }

  /**
   * Get expenses for a facility
   */
  getFacilityExpenses(
    facilityId: number,
    fiscalYear: number,
    term?: number
  ): BoardingExpense[] {
    let query = `
      SELECT * FROM boarding_expense
      WHERE facility_id = ? AND fiscal_year = ?
    `;

    const params: unknown[] = [facilityId, fiscalYear];

    if (term) {
      query += ` AND term = ?`;
      params.push(term);
    }

    query += ` ORDER BY recorded_date DESC`;

    return this.db.prepare(query).all(...params) as BoardingExpense[];
  }

  /**
   * Get total expenses by type for a facility
   */
  getExpenseSummaryByType(
    facilityId: number,
    fiscalYear: number,
    term?: number
  ): ExpenseSummary[] {
    let query = `
      SELECT 
        expense_type,
        SUM(amount_cents) as total_amount_cents
      FROM boarding_expense
      WHERE facility_id = ? AND fiscal_year = ?
    `;

    const params: unknown[] = [facilityId, fiscalYear];

    if (term) {
      query += ` AND term = ?`;
      params.push(term);
    }

    query += `
      GROUP BY expense_type
      ORDER BY total_amount_cents DESC
    `;

    const results = this.db.prepare(query).all(...params) as { expense_type: string; total_amount_cents: number }[];

    // Calculate total for percentages
    const total = results.reduce((sum, row) => sum + row.total_amount_cents, 0);

    return results.map(row => ({
      expense_type: row.expense_type,
      total_amount_cents: row.total_amount_cents,
      percentage: total > 0 ? (row.total_amount_cents / total) * 100 : 0
    }));
  }

  /**
   * Calculate boarding revenue for a facility
   * Revenue comes from boarding fees paid by students assigned to this facility
   */
  private calculateBoardingRevenue(
    facilityId: number,
    fiscalYear: number,
    term?: number
  ): number {
    // Calculate total boarding revenue from invoices, then allocate by occupancy share
    let query = `
      SELECT COALESCE(SUM(ii.amount), 0) as total_revenue
      FROM fee_invoice fi
      JOIN invoice_item ii ON fi.id = ii.invoice_id
      JOIN fee_category fc ON ii.fee_category_id = fc.id
      LEFT JOIN term t ON fi.term_id = t.id
      WHERE LOWER(fc.category_name) LIKE '%boarding%'
        AND CAST(strftime('%Y', fi.invoice_date) AS INTEGER) = ?
    `;

    const params: unknown[] = [fiscalYear];

    if (term) {
      query += ` AND t.term_number = ?`;
      params.push(term);
    }

    const result = this.db.prepare(query).get(...params) as RevenueResult | undefined;
    const totalRevenue = result?.total_revenue || 0;

    const facility = this.db.prepare(`SELECT current_occupancy FROM boarding_facility WHERE id = ?`).get(facilityId) as { current_occupancy: number } | undefined;
    const totalOccupancyRow = this.db.prepare(`SELECT COALESCE(SUM(current_occupancy), 0) as total FROM boarding_facility WHERE is_active = 1`).get() as { total: number };
    const totalOccupancy = totalOccupancyRow.total || 0;

    if (!facility || totalOccupancy <= 0) { return 0; }
    return Math.round((totalRevenue * facility.current_occupancy) / totalOccupancy);
  }

  /**
   * Calculate profitability for a boarding facility
   */
  calculateFacilityProfitability(
    facilityId: number,
    fiscalYear: number,
    term?: number
  ): BoardingProfitability {
    // Get facility details
    const facility = this.db.prepare(`
      SELECT * FROM boarding_facility WHERE id = ?
    `).get(facilityId) as BoardingFacility | undefined;

    if (!facility) {
      throw new Error(`Boarding facility ${facilityId} not found`);
    }

    // Calculate revenue
    const totalRevenueCents = this.calculateBoardingRevenue(facilityId, fiscalYear, term);

    // Calculate total expenses
    const expenses = this.getFacilityExpenses(facilityId, fiscalYear, term);
    const totalExpensesCents = expenses.reduce((sum, exp) => sum + exp.amount_cents, 0);

    // Calculate metrics
    const netProfitCents = totalRevenueCents - totalExpensesCents;
    const profitMargin = totalRevenueCents > 0
      ? (netProfitCents / totalRevenueCents) * 100
      : 0;

    const occupancyRate = facility.capacity > 0
      ? (facility.current_occupancy / facility.capacity) * 100
      : 0;

    const costPerBoarderCents = facility.current_occupancy > 0
      ? totalExpensesCents / facility.current_occupancy
      : 0;

    // Calculate break-even occupancy
    // Break-even: Revenue = Expenses
    // Assuming revenue per boarder is constant, we can calculate
    const revenuePerBoarder = facility.current_occupancy > 0
      ? totalRevenueCents / facility.current_occupancy
      : 0;

    const breakEvenOccupancy = revenuePerBoarder > 0
      ? Math.ceil(totalExpensesCents / revenuePerBoarder)
      : 0;

    return {
      facility_id: facility.id,
      facility_name: facility.name,
      capacity: facility.capacity,
      current_occupancy: facility.current_occupancy,
      occupancy_rate: occupancyRate,
      total_revenue_cents: totalRevenueCents,
      total_expenses_cents: totalExpensesCents,
      net_profit_cents: netProfitCents,
      profit_margin: profitMargin,
      cost_per_boarder_cents: costPerBoarderCents,
      break_even_occupancy: breakEvenOccupancy
    };
  }

  /**
   * Get profitability for all facilities
   */
  getAllFacilitiesProfitability(
    fiscalYear: number,
    term?: number
  ): BoardingProfitability[] {
    const facilities = this.getActiveFacilities();

    return facilities.map(facility =>
      this.calculateFacilityProfitability(facility.id, fiscalYear, term)
    );
  }

  /**
   * Update facility occupancy
   */
  updateFacilityOccupancy(facilityId: number, newOccupancy: number): void {
    const query = `
      UPDATE boarding_facility
      SET current_occupancy = ?
      WHERE id = ?
    `;

    this.db.prepare(query).run(newOccupancy, facilityId);
  }

  /**
   * Create a new boarding facility
   */
  createFacility(params: {
    name: string;
    capacity: number;
    matron_id?: number;
  }): number {
    const query = `
      INSERT INTO boarding_facility (
        name, capacity, current_occupancy, matron_id, is_active
      ) VALUES (?, ?, 0, ?, 1)
    `;

    const result = this.db.prepare(query).run(
      params.name,
      params.capacity,
      params.matron_id || null
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Generate boarding profitability summary report
   */
  generateProfitabilitySummary(fiscalYear: number, term?: number): {
    total_capacity: number;
    total_occupancy: number;
    overall_occupancy_rate: number;
    total_revenue_cents: number;
    total_expenses_cents: number;
    net_profit_cents: number;
    profit_margin: number;
    average_cost_per_boarder_cents: number;
    facilities: BoardingProfitability[];
  } {
    const facilities = this.getAllFacilitiesProfitability(fiscalYear, term);

    const totalCapacity = facilities.reduce((sum, f) => sum + f.capacity, 0);
    const totalOccupancy = facilities.reduce((sum, f) => sum + f.current_occupancy, 0);
    const totalRevenue = facilities.reduce((sum, f) => sum + f.total_revenue_cents, 0);
    const totalExpenses = facilities.reduce((sum, f) => sum + f.total_expenses_cents, 0);
    const netProfit = totalRevenue - totalExpenses;

    return {
      total_capacity: totalCapacity,
      total_occupancy: totalOccupancy,
      overall_occupancy_rate: totalCapacity > 0 ? (totalOccupancy / totalCapacity) * 100 : 0,
      total_revenue_cents: totalRevenue,
      total_expenses_cents: totalExpenses,
      net_profit_cents: netProfit,
      profit_margin: totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0,
      average_cost_per_boarder_cents: totalOccupancy > 0 ? totalExpenses / totalOccupancy : 0,
      facilities
    };
  }
}

export default BoardingCostService;
