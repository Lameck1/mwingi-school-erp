import { getDatabase } from '../../database';

export interface CBCStrand {
  id: number;
  code: string;
  name: string;
  description: string;
  category: 'CORE' | 'ELECTIVE';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StrandExpense {
  id: number;
  strand_id: number;
  expense_date: string;
  description: string;
  gl_account_code: string;
  amount_cents: number;
  term: number;
  fiscal_year: number;
  receipt_number?: string;
  created_by: number;
  created_at: string;
}

export interface StrandRevenue {
  strand_id: number;
  strand_name: string;
  fiscal_year: number;
  term: number;
  student_count: number;
  total_fees_cents: number;
  avg_fee_per_student_cents: number;
}

export interface StrandProfitability {
  strand_id: number;
  strand_name: string;
  fiscal_year: number;
  term: number;
  revenue_cents: number;
  expenses_cents: number;
  net_profit_cents: number;
  profit_margin_percent: number;
  student_count: number;
  cost_per_student_cents: number;
  revenue_per_student_cents: number;
}

export interface StudentActivityParticipation {
  id: number;
  student_id: number;
  strand_id: number;
  activity_name: string;
  start_date: string;
  end_date?: string;
  participation_level: 'PRIMARY' | 'SECONDARY' | 'INTEREST';
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

/**
 * Service for managing CBC (Competency-Based Curriculum) strand tracking
 * 
 * Capabilities:
 * - Track revenue and expenses by CBC strand
 * - Calculate profitability per strand
 * - Manage student activity participation
 * - Generate strand performance reports
 * - Support budget allocation by strand
 */
export class CBCStrandService {
  private get db() { return getDatabase(); }

  /**
   * Get all CBC strands
   */
  getAllStrands(): CBCStrand[] {
    const stmt = this.db.prepare(`
      SELECT * FROM cbc_strand
      ORDER BY code
    `);
    return stmt.all() as CBCStrand[];
  }

  /**
   * Get active CBC strands only
   */
  getActiveStrands(): CBCStrand[] {
    const stmt = this.db.prepare(`
      SELECT * FROM cbc_strand
      WHERE is_active = 1
      ORDER BY code
    `);
    return stmt.all() as CBCStrand[];
  }

  /**
   * Get strand by ID
   */
  getStrandById(strandId: number): CBCStrand | null {
    const stmt = this.db.prepare(`
      SELECT * FROM cbc_strand
      WHERE id = ?
    `);
    const strand = stmt.get(strandId) as CBCStrand | undefined;
    return strand ?? null;
  }

  /**
   * Record expense for a CBC strand
   */
  recordStrandExpense(data: {
    strand_id: number;
    expense_date: string;
    description: string;
    gl_account_code: string;
    amount_cents: number;
    term: number;
    fiscal_year: number;
    receipt_number?: string;
    created_by: number;
  }): number {
    const stmt = this.db.prepare(`
      INSERT INTO cbc_strand_expense (
        cbc_strand_id, expense_date, description, gl_account_code,
        amount_cents, term, fiscal_year, receipt_number, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.strand_id,
      data.expense_date,
      data.description,
      data.gl_account_code,
      data.amount_cents,
      data.term,
      data.fiscal_year,
      data.receipt_number || null,
      data.created_by
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Get strand expenses for a period
   */
  getStrandExpenses(
    strandId: number,
    fiscalYear: number,
    term?: number
  ): StrandExpense[] {
    let sql = `
      SELECT * FROM cbc_strand_expense
      WHERE cbc_strand_id = ? AND fiscal_year = ?
    `;
    const params: unknown[] = [strandId, fiscalYear];

    if (term !== undefined) {
      sql += ' AND term = ?';
      params.push(term);
    }

    sql += ' ORDER BY expense_date DESC';

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as StrandExpense[];
  }

  /**
   * Calculate strand revenue from fee categories
   */
  getStrandRevenue(
    fiscalYear: number,
    term?: number
  ): StrandRevenue[] {
    let sql = `
      SELECT 
        cs.id as strand_id,
        cs.name as strand_name,
        CAST(strftime('%Y', fi.invoice_date) AS INTEGER) as fiscal_year,
        t.term_number as term,
        COUNT(DISTINCT fi.student_id) as student_count,
        SUM(ii.amount) as total_fees_cents,
        AVG(ii.amount) as avg_fee_per_student_cents
      FROM cbc_strand cs
      JOIN fee_category_strand fcs ON cs.id = fcs.cbc_strand_id
      JOIN invoice_item ii ON fcs.fee_category_id = ii.fee_category_id
      JOIN fee_invoice fi ON ii.invoice_id = fi.id
      LEFT JOIN term t ON fi.term_id = t.id
      WHERE CAST(strftime('%Y', fi.invoice_date) AS INTEGER) = ?
    `;
    const params: unknown[] = [fiscalYear];

    if (term !== undefined) {
      sql += ' AND t.term_number = ?';
      params.push(term);
    }

    sql += `
      GROUP BY cs.id, cs.name, i.fiscal_year, i.term
      ORDER BY cs.code
    `;

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as StrandRevenue[];
  }

  /**
   * Calculate strand profitability
   */
  getStrandProfitability(
    fiscalYear: number,
    term?: number
  ): StrandProfitability[] {
    // Get revenue
    const revenues = this.getStrandRevenue(fiscalYear, term);

    // Get expenses for each strand
    const results: StrandProfitability[] = [];

    for (const rev of revenues) {
      const expenses = this.getStrandExpenses(rev.strand_id, fiscalYear, term);
      const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount_cents, 0);

      const netProfit = rev.total_fees_cents - totalExpenses;
      const profitMargin = rev.total_fees_cents > 0
        ? (netProfit / rev.total_fees_cents) * 100
        : 0;

      results.push({
        strand_id: rev.strand_id,
        strand_name: rev.strand_name,
        fiscal_year: rev.fiscal_year,
        term: rev.term,
        revenue_cents: rev.total_fees_cents,
        expenses_cents: totalExpenses,
        net_profit_cents: netProfit,
        profit_margin_percent: profitMargin,
        student_count: rev.student_count,
        cost_per_student_cents: rev.student_count > 0
          ? Math.round(totalExpenses / rev.student_count)
          : 0,
        revenue_per_student_cents: Math.round(rev.avg_fee_per_student_cents),
      });
    }

    return results;
  }

  /**
   * Link fee category to CBC strand
   */
  linkFeeCategoryToStrand(
    feeCategoryId: number,
    strandId: number,
    allocationPercentage: number,
    userId: number
  ): number {
    const stmt = this.db.prepare(`
      INSERT INTO fee_category_strand (
        fee_category_id, cbc_strand_id, allocation_percentage, created_by
      ) VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(feeCategoryId, strandId, allocationPercentage, userId);
    return result.lastInsertRowid as number;
  }

  /**
   * Record student activity participation
   */
  recordStudentParticipation(data: {
    student_id: number;
    strand_id: number;
    activity_name: string;
    start_date: string;
    academic_year: number;
    term: number;
    participation_level: 'PRIMARY' | 'SECONDARY' | 'INTEREST';
  }): number {
    const stmt = this.db.prepare(`
      INSERT INTO student_activity_participation (
        student_id, cbc_strand_id, academic_year, term, activity_name, start_date, participation_level
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.student_id,
      data.strand_id,
      data.academic_year,
      data.term,
      data.activity_name,
      data.start_date,
      data.participation_level
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Get student's activity participations
   */
  getStudentParticipations(studentId: number): StudentActivityParticipation[] {
    const stmt = this.db.prepare(`
      SELECT 
        sap.*
      FROM student_activity_participation sap
      WHERE sap.student_id = ?
      ORDER BY sap.start_date DESC
    `);

    return stmt.all(studentId) as StudentActivityParticipation[];
  }

  /**
   * Get students participating in a strand
   */
  getStrandParticipants(
    strandId: number,
    activeOnly: boolean = true
  ): StudentActivityParticipation[] {
    let sql = `
      SELECT 
        sap.*
      FROM student_activity_participation sap
      WHERE sap.cbc_strand_id = ?
    `;

    if (activeOnly) {
      sql += ' AND sap.is_active = 1';
    }

    sql += ' ORDER BY sap.activity_name, sap.start_date DESC';

    const stmt = this.db.prepare(sql);
    return stmt.all(strandId) as StudentActivityParticipation[];
  }

  /**
   * End student participation in activity
   */
  endStudentParticipation(participationId: number, endDate: string): void {
    const stmt = this.db.prepare(`
      UPDATE student_activity_participation
      SET end_date = ?, is_active = 0, updated_at = datetime('now')
      WHERE id = ?
    `);

    stmt.run(endDate, participationId);
  }

  /**
   * Get strand performance summary
   */
  getStrandPerformanceSummary(fiscalYear: number): {
    total_strands: number;
    profitable_strands: number;
    unprofitable_strands: number;
    total_revenue_cents: number;
    total_expenses_cents: number;
    total_profit_cents: number;
    avg_profit_margin_percent: number;
    most_profitable_strand: string;
    least_profitable_strand: string;
  } {
    const profitability = this.getStrandProfitability(fiscalYear);

    if (profitability.length === 0) {
      return {
        total_strands: 0,
        profitable_strands: 0,
        unprofitable_strands: 0,
        total_revenue_cents: 0,
        total_expenses_cents: 0,
        total_profit_cents: 0,
        avg_profit_margin_percent: 0,
        most_profitable_strand: 'N/A',
        least_profitable_strand: 'N/A',
      };
    }

    const totalRevenue = profitability.reduce((sum, s) => sum + s.revenue_cents, 0);
    const totalExpenses = profitability.reduce((sum, s) => sum + s.expenses_cents, 0);
    const totalProfit = totalRevenue - totalExpenses;

    const profitableStrands = profitability.filter(s => s.net_profit_cents > 0).length;
    const unprofitableStrands = profitability.filter(s => s.net_profit_cents < 0).length;

    const avgMargin = profitability.reduce((sum, s) => sum + s.profit_margin_percent, 0) / profitability.length;

    const sortedByProfit = [...profitability].sort((a, b) => b.net_profit_cents - a.net_profit_cents);
    const mostProfitable = sortedByProfit[0];
    const leastProfitable = sortedByProfit[sortedByProfit.length - 1];

    return {
      total_strands: profitability.length,
      profitable_strands: profitableStrands,
      unprofitable_strands: unprofitableStrands,
      total_revenue_cents: totalRevenue,
      total_expenses_cents: totalExpenses,
      total_profit_cents: totalProfit,
      avg_profit_margin_percent: avgMargin,
      most_profitable_strand: mostProfitable.strand_name,
      least_profitable_strand: leastProfitable.strand_name,
    };
  }
}
