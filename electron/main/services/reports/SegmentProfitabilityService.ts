import Database from 'better-sqlite3-multiple-ciphers'
import { getDatabase } from '../../database'

// ============================================================================
// SEGREGATED INTERFACES (ISP)
// ============================================================================

export interface ITransportProfitabilityCalculator {
  calculateTransportProfitability(): Promise<any>
}

export interface IBoardingProfitabilityCalculator {
  calculateBoardingProfitability(): Promise<any>
}

export interface IActivityFeeAnalyzer {
  analyzeActivityFees(): Promise<any>
}

export interface IOverallProfitabilityAnalyzer {
  getOverallProfitabilityBreakdown(): Promise<any>
}

export interface SegmentProfitability {
  segment_type: string
  segment_name: string
  revenue: number
  costs: number
  profit: number
  profit_margin_percentage: number
  status: 'PROFITABLE' | 'BREAKING_EVEN' | 'UNPROFITABLE'
}

// ============================================================================
// REPOSITORY LAYER (SRP)
// ============================================================================

class ProfitabilityRepository {
  private db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  async getTransportRevenue(): Promise<number> {
    const db = this.db
    const result = db.prepare(`
      SELECT SUM(amount) as total FROM ledger_transaction
      WHERE description LIKE '%transport%' OR description LIKE '%bus%'
      AND transaction_type IN ('CREDIT', 'PAYMENT')
    `).get() as any
    return result?.total || 0
  }

  async getTransportCosts(): Promise<number> {
    const db = this.db
    const result = db.prepare(`
      SELECT SUM(amount) as total FROM expense_transaction
      WHERE expense_type IN ('FUEL', 'VEHICLE_MAINTENANCE', 'VEHICLE_DEPRECIATION', 'DRIVER_SALARY')
    `).get() as any
    return result?.total || 0
  }

  async getBoardingRevenue(): Promise<number> {
    const db = this.db
    const result = db.prepare(`
      SELECT SUM(amount) as total FROM fee_invoice
      WHERE fee_type = 'BOARDING'
    `).get() as any
    return result?.total || 0
  }

  async getBoardingCosts(): Promise<number> {
    const db = this.db
    const result = db.prepare(`
      SELECT SUM(amount) as total FROM expense_transaction
      WHERE expense_type IN ('FOOD', 'BEDDING', 'DORM_MAINTENANCE', 'UTILITIES')
    `).get() as any
    return result?.total || 0
  }

  async getActivityFeeRevenue(): Promise<number> {
    const db = this.db
    const result = db.prepare(`
      SELECT SUM(amount) as total FROM fee_invoice
      WHERE fee_type = 'ACTIVITY'
    `).get() as any
    return result?.total || 0
  }

  async getActivityFeeExpenses(): Promise<number> {
    const db = this.db
    const result = db.prepare(`
      SELECT SUM(amount) as total FROM expense_transaction
      WHERE expense_type = 'ACTIVITY'
    `).get() as any
    return result?.total || 0
  }

  async getTotalRevenue(): Promise<number> {
    const db = this.db
    const result = db.prepare(`
      SELECT SUM(amount) as total FROM fee_invoice
      WHERE status IN ('PAID', 'OUTSTANDING')
    `).get() as any
    return result?.total || 0
  }

  async getTotalExpenses(): Promise<number> {
    const db = this.db
    const result = db.prepare(`
      SELECT SUM(amount) as total FROM expense_transaction
    `).get() as any
    return result?.total || 0
  }

  async getStudentOccupancyRate(): Promise<number> {
    const db = this.db
    const currentStudents = db.prepare(`SELECT COUNT(*) as count FROM student WHERE status = 'ACTIVE'`).get() as any
    const totalCapacity = db.prepare(`SELECT SUM(capacity) as total FROM dormitory`).get() as any
    return totalCapacity?.total ? (currentStudents?.count || 0) / totalCapacity.total : 0
  }
}

// ============================================================================
// TRANSPORT PROFITABILITY CALCULATOR (SRP)
// ============================================================================

class TransportProfitabilityCalculator implements ITransportProfitabilityCalculator {
  private db: Database.Database
  private repo: ProfitabilityRepository

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.repo = new ProfitabilityRepository(this.db)
  }

  async calculateTransportProfitability(): Promise<any> {
    const revenue = await this.repo.getTransportRevenue()
    const costs = await this.repo.getTransportCosts()
    const profit = revenue - costs
    const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0

    let status: 'PROFITABLE' | 'BREAKING_EVEN' | 'UNPROFITABLE' = 'BREAKING_EVEN'
    if (profit > 0) status = 'PROFITABLE'
    if (profit < 0) status = 'UNPROFITABLE'

    return {
      segment_type: 'TRANSPORT',
      segment_name: 'Transport Services',
      revenue: revenue,
      costs: costs,
      profit: profit,
      profit_margin_percentage: profitMargin,
      status: status,
      recommendations: this.getTransportRecommendations(profit, revenue)
    }
  }

  private getTransportRecommendations(profit: number, revenue: number): string[] {
    const recommendations: string[] = []

    if (profit < 0) {
      recommendations.push('Transport is unprofitable. Consider reviewing fuel consumption and driver efficiency.')
      recommendations.push('Analyze maintenance costs for potential cost reduction.')
    } else if (revenue * 0.2 > profit) {
      recommendations.push('Transport profit margin is below 20%. Review operational efficiency.')
    }

    return recommendations
  }
}

// ============================================================================
// BOARDING PROFITABILITY CALCULATOR (SRP)
// ============================================================================

class BoardingProfitabilityCalculator implements IBoardingProfitabilityCalculator {
  private db: Database.Database
  private repo: ProfitabilityRepository

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.repo = new ProfitabilityRepository(this.db)
  }

  async calculateBoardingProfitability(): Promise<any> {
    const revenue = await this.repo.getBoardingRevenue()
    const costs = await this.repo.getBoardingCosts()
    const occupancyRate = await this.repo.getStudentOccupancyRate()
    const profit = revenue - costs
    const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0

    let status: 'PROFITABLE' | 'BREAKING_EVEN' | 'UNPROFITABLE' = 'BREAKING_EVEN'
    if (profit > 0) status = 'PROFITABLE'
    if (profit < 0) status = 'UNPROFITABLE'

    return {
      segment_type: 'BOARDING',
      segment_name: 'Boarding Services',
      revenue: revenue,
      costs: costs,
      profit: profit,
      profit_margin_percentage: profitMargin,
      occupancy_rate_percentage: occupancyRate * 100,
      status: status,
      recommendations: this.getBoardingRecommendations(profit, occupancyRate)
    }
  }

  private getBoardingRecommendations(profit: number, occupancyRate: number): string[] {
    const recommendations: string[] = []

    if (occupancyRate < 0.7) {
      recommendations.push(`Low boarding occupancy (${(occupancyRate * 100).toFixed(0)}%). Promote boarding to increase revenue.`)
    }

    if (profit < 0) {
      recommendations.push('Boarding is unprofitable. Reduce food and utility costs or increase boarding fees.')
    } else if (profit * 100 < occupancyRate) {
      recommendations.push('Boarding profit margin is thin. Review operational efficiency.')
    }

    return recommendations
  }
}

// ============================================================================
// ACTIVITY FEE ANALYZER (SRP)
// ============================================================================

class ActivityFeeAnalyzer implements IActivityFeeAnalyzer {
  private db: Database.Database
  private repo: ProfitabilityRepository

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.repo = new ProfitabilityRepository(this.db)
  }

  async analyzeActivityFees(): Promise<any> {
    const revenue = await this.repo.getActivityFeeRevenue()
    const expenses = await this.repo.getActivityFeeExpenses()
    const profit = revenue - expenses
    const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0

    let status: 'PROFITABLE' | 'BREAKING_EVEN' | 'UNPROFITABLE' = 'BREAKING_EVEN'
    if (profit > 0) status = 'PROFITABLE'
    if (profit < 0) status = 'UNPROFITABLE'

    return {
      segment_type: 'ACTIVITIES',
      segment_name: 'Activity Programs',
      revenue: revenue,
      costs: expenses,
      profit: profit,
      profit_margin_percentage: profitMargin,
      status: status,
      recommendations: this.getActivityRecommendations(profit, revenue)
    }
  }

  private getActivityRecommendations(profit: number, revenue: number): string[] {
    const recommendations: string[] = []

    if (revenue === 0) {
      recommendations.push('No activity fee revenue recorded. Ensure all activities are properly coded.')
    }

    if (profit < 0) {
      recommendations.push('Activity programs are unprofitable. Review program costs and participation.')
    } else if (revenue > 0 && profit / revenue < 0.3) {
      recommendations.push('Activity profit margin is below 30%. Consider increasing activity fees or reducing costs.')
    }

    return recommendations
  }
}

// ============================================================================
// OVERALL PROFITABILITY ANALYZER (SRP)
// ============================================================================

class OverallProfitabilityAnalyzer implements IOverallProfitabilityAnalyzer {
  private db: Database.Database
  private repo: ProfitabilityRepository

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.repo = new ProfitabilityRepository(this.db)
  }

  async getOverallProfitabilityBreakdown(): Promise<any> {
    const totalRevenue = await this.repo.getTotalRevenue()
    const totalExpenses = await this.repo.getTotalExpenses()
    const netProfit = totalRevenue - totalExpenses
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0

    let status: 'PROFITABLE' | 'BREAKING_EVEN' | 'UNPROFITABLE' = 'BREAKING_EVEN'
    if (netProfit > 0) status = 'PROFITABLE'
    if (netProfit < 0) status = 'UNPROFITABLE'

    return {
      overall_summary: {
        total_revenue: totalRevenue,
        total_expenses: totalExpenses,
        net_profit: netProfit,
        profit_margin_percentage: profitMargin,
        status: status
      },
      financial_health: this.assessFinancialHealth(profitMargin, netProfit),
      recommendations: this.getOverallRecommendations(profitMargin, netProfit)
    }
  }

  private assessFinancialHealth(profitMargin: number, netProfit: number): string {
    if (profitMargin >= 20 && netProfit > 0) return 'EXCELLENT'
    if (profitMargin >= 10 && netProfit > 0) return 'GOOD'
    if (profitMargin >= 0 && netProfit > 0) return 'FAIR'
    if (profitMargin < 0 || netProfit < 0) return 'CRITICAL'
    return 'FAIR'
  }

  private getOverallRecommendations(profitMargin: number, netProfit: number): string[] {
    const recommendations: string[] = []

    if (netProfit < 0) {
      recommendations.push('School is operating at a loss. Urgent action required to review revenue and expenses.')
      recommendations.push('Consider increasing fees or reducing operational costs.')
    } else if (profitMargin < 10) {
      recommendations.push('Profit margin is below 10%. Monitor expenses closely and look for efficiency improvements.')
    }

    if (profitMargin >= 15) {
      recommendations.push('Strong profit margin. Consider reinvesting in school infrastructure and programs.')
    }

    return recommendations
  }
}

// ============================================================================
// FACADE - SOLID-COMPLIANT SERVICE
// ============================================================================

export class SegmentProfitabilityService
  implements ITransportProfitabilityCalculator, IBoardingProfitabilityCalculator, IActivityFeeAnalyzer
{
  // Composed services
  private db: Database.Database
  private readonly transportCalculator: TransportProfitabilityCalculator
  private readonly boardingCalculator: BoardingProfitabilityCalculator
  private readonly activityAnalyzer: ActivityFeeAnalyzer
  private readonly overallAnalyzer: OverallProfitabilityAnalyzer

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.transportCalculator = new TransportProfitabilityCalculator(this.db)
    this.boardingCalculator = new BoardingProfitabilityCalculator(this.db)
    this.activityAnalyzer = new ActivityFeeAnalyzer(this.db)
    this.overallAnalyzer = new OverallProfitabilityAnalyzer(this.db)
  }

  /**
   * Calculate transport segment profitability
   */
  async calculateTransportProfitability(): Promise<any> {
    return this.transportCalculator.calculateTransportProfitability()
  }

  /**
   * Calculate boarding segment profitability
   */
  async calculateBoardingProfitability(): Promise<any> {
    return this.boardingCalculator.calculateBoardingProfitability()
  }

  /**
   * Analyze activity fees profitability
   */
  async analyzeActivityFees(): Promise<any> {
    return this.activityAnalyzer.analyzeActivityFees()
  }

  /**
   * Get overall school profitability breakdown
   */
  async getOverallProfitabilityBreakdown(): Promise<any> {
    return this.overallAnalyzer.getOverallProfitabilityBreakdown()
  }

  /**
   * Get list of unprofitable segments with recommendations
   */
  async getUnprofitableSegments(): Promise<any[]> {
    const transport = await this.calculateTransportProfitability()
    const boarding = await this.calculateBoardingProfitability()
    const activities = await this.analyzeActivityFees()

    const unprofitable: any[] = []

    if (transport.status === 'UNPROFITABLE') {
      unprofitable.push({
        segment: transport.segment_name,
        profit: transport.profit,
        margin: transport.profit_margin_percentage,
        recommendations: transport.recommendations
      })
    }

    if (boarding.status === 'UNPROFITABLE') {
      unprofitable.push({
        segment: boarding.segment_name,
        profit: boarding.profit,
        margin: boarding.profit_margin_percentage,
        occupancy: boarding.occupancy_rate_percentage,
        recommendations: boarding.recommendations
      })
    }

    if (activities.status === 'UNPROFITABLE') {
      unprofitable.push({
        segment: activities.segment_name,
        profit: activities.profit,
        margin: activities.profit_margin_percentage,
        recommendations: activities.recommendations
      })
    }

    return unprofitable.sort((a, b) => a.profit - b.profit) // Worst first
  }

  /**
   * Get comprehensive segment analysis report
   */
  async getSegmentAnalysisReport(): Promise<any> {
    const transport = await this.calculateTransportProfitability()
    const boarding = await this.calculateBoardingProfitability()
    const activities = await this.analyzeActivityFees()
    const overall = await this.getOverallProfitabilityBreakdown()

    return {
      segments: [transport, boarding, activities],
      overall: overall,
      unprofitable_segments: await this.getUnprofitableSegments(),
      generated_at: new Date().toISOString()
    }
  }
}
