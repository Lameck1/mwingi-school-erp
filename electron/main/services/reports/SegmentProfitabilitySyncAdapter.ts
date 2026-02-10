import type {
  ComparisonSummary,
  OverallProfitabilitySync,
  SegmentProfitability
} from './SegmentProfitabilityService'
import type Database from 'better-sqlite3'


type ProfitabilityStatus = 'PROFITABLE' | 'BREAKING_EVEN' | 'UNPROFITABLE'

interface SegmentAnalysisResult {
  revenue: number
  costs: number
}

export class SegmentProfitabilitySyncAdapter {
  constructor(private readonly db: Database.Database) {}

  private resolveStatus(value: number): ProfitabilityStatus {
    if (value > 0) {
      return 'PROFITABLE'
    }
    if (value < 0) {
      return 'UNPROFITABLE'
    }
    return 'BREAKING_EVEN'
  }

  analyzeTransportProfitability(startDate?: string, endDate?: string): SegmentProfitability {
    const result = this.db.prepare(`
      SELECT 
        'TRANSPORT' as segment_type,
        'Transport Services' as segment_name,
        COALESCE(SUM(CASE WHEN transaction_type IN ('CREDIT', 'PAYMENT') THEN amount ELSE 0 END), 0) as revenue,
        COALESCE(SUM(CASE WHEN transaction_type = 'DEBIT' AND description LIKE '%transport%' THEN amount ELSE 0 END), 0) as costs
      FROM ledger_transaction
      WHERE (description LIKE '%transport%' OR description LIKE '%bus%')
        AND (? IS NULL OR transaction_date >= ?)
        AND (? IS NULL OR transaction_date <= ?)
    `).get(startDate, startDate, endDate, endDate) as SegmentAnalysisResult | undefined

    const revenue = result?.revenue || 0
    const costs = result?.costs || 0
    const profit = revenue - costs
    const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0

    return {
      segment_type: 'TRANSPORT',
      segment_name: 'Transport Services',
      revenue,
      costs,
      profit,
      profit_margin_percentage: parseFloat(profitMargin.toFixed(2)),
      status: this.resolveStatus(profit)
    }
  }

  analyzeBoardingProfitability(startDate?: string, endDate?: string): SegmentProfitability {
    const result = this.db.prepare(`
      SELECT 
        'BOARDING' as segment_type,
        'Boarding Services' as segment_name,
        COALESCE(SUM(CASE WHEN transaction_type IN ('CREDIT', 'PAYMENT') THEN amount ELSE 0 END), 0) as revenue,
        COALESCE(SUM(CASE WHEN transaction_type = 'DEBIT' AND description LIKE '%boarding%' THEN amount ELSE 0 END), 0) as costs
      FROM ledger_transaction
      WHERE (description LIKE '%boarding%' OR description LIKE '%hostel%')
        AND (? IS NULL OR transaction_date >= ?)
        AND (? IS NULL OR transaction_date <= ?)
    `).get(startDate, startDate, endDate, endDate) as SegmentAnalysisResult | undefined

    const revenue = result?.revenue || 0
    const costs = result?.costs || 0
    const profit = revenue - costs
    const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0
    const occupancyRate = 85
    const recommendations = this.getBoardingRecommendations(revenue, costs, occupancyRate)

    return {
      segment_type: 'BOARDING',
      segment_name: 'Boarding Services',
      revenue,
      costs,
      profit,
      profit_margin_percentage: parseFloat(profitMargin.toFixed(2)),
      occupancy_rate_percentage: occupancyRate,
      status: this.resolveStatus(profit),
      recommendations
    }
  }

  analyzeActivityFees(startDate?: string, endDate?: string): SegmentProfitability {
    const result = this.db.prepare(`
      SELECT 
        'ACTIVITY' as segment_type,
        'Activity Fees' as segment_name,
        COALESCE(SUM(CASE WHEN transaction_type IN ('CREDIT', 'PAYMENT') THEN amount ELSE 0 END), 0) as revenue,
        COALESCE(SUM(CASE WHEN transaction_type = 'DEBIT' AND description LIKE '%activity%' THEN amount ELSE 0 END), 0) as costs
      FROM ledger_transaction
      WHERE (description LIKE '%activity%' OR description LIKE '%club%')
        AND (? IS NULL OR transaction_date >= ?)
        AND (? IS NULL OR transaction_date <= ?)
    `).get(startDate, startDate, endDate, endDate) as SegmentAnalysisResult | undefined

    const revenue = result?.revenue || 0
    const costs = result?.costs || 0
    const profit = revenue - costs
    const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0

    return {
      segment_type: 'ACTIVITY',
      segment_name: 'Activity Fees',
      revenue,
      costs,
      profit,
      profit_margin_percentage: parseFloat(profitMargin.toFixed(2)),
      status: this.resolveStatus(profit)
    }
  }

  generateOverallProfitability(startDate?: string, endDate?: string): OverallProfitabilitySync {
    const transport = this.analyzeTransportProfitability(startDate, endDate)
    const boarding = this.analyzeBoardingProfitability(startDate, endDate)
    const activity = this.analyzeActivityFees(startDate, endDate)

    const totalRevenue = transport.revenue + boarding.revenue + activity.revenue
    const totalExpenses = transport.costs + boarding.costs + activity.costs
    const netProfit = totalRevenue - totalExpenses
    const totalMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0

    return {
      segments: [transport, boarding, activity],
      totalRevenue,
      totalExpenses,
      netProfit,
      profit_margin_percentage: parseFloat(totalMargin.toFixed(2)),
      status: this.resolveStatus(netProfit),
      recommendations: this.getOverallRecommendations(transport, boarding, activity)
    }
  }

  compareSegments(startDate?: string, endDate?: string): ComparisonSummary {
    const segments = [
      this.analyzeTransportProfitability(startDate, endDate),
      this.analyzeBoardingProfitability(startDate, endDate),
      this.analyzeActivityFees(startDate, endDate)
    ]
    const sorted = segments.toSorted((a, b) => b.profit_margin_percentage - a.profit_margin_percentage)

    return {
      segments: sorted,
      comparison_summary: {
        highest_performing: sorted[0]?.segment_name || 'N/A',
        lowest_performing: sorted[sorted.length - 1]?.segment_name || 'N/A',
        total_segments: sorted.length
      }
    }
  }

  private getBoardingRecommendations(revenue: number, costs: number, occupancyRate: number): string[] {
    const recommendations: string[] = []

    if (occupancyRate < 80) {
      recommendations.push('Increase marketing efforts to improve boarding occupancy')
    }

    const margin = revenue > 0 ? ((revenue - costs) / revenue) * 100 : 0
    if (margin < 15) {
      recommendations.push('Review boarding fees to improve profitability')
    }

    if (recommendations.length === 0) {
      recommendations.push('Boarding operations are performing well')
    }

    return recommendations
  }

  private getOverallRecommendations(
    transport: SegmentProfitability,
    boarding: SegmentProfitability,
    activity: SegmentProfitability
  ): string[] {
    const recommendations: string[] = []

    if (transport.profit_margin_percentage < 10) {
      recommendations.push('Optimize transport operations to improve profitability')
    }

    if (boarding.profit_margin_percentage < 15) {
      recommendations.push('Review boarding facility utilization and pricing strategy')
    }

    if (activity.profit_margin_percentage < 5) {
      recommendations.push('Evaluate activity fee structure for sustainability')
    }

    if (recommendations.length === 0) {
      recommendations.push('All segments demonstrate strong profitability performance')
    }

    return recommendations
  }
}
