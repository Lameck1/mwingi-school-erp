import { getDatabase } from '../../database'
import { buildFeeInvoiceActiveStatusPredicate, buildFeeInvoiceAmountSql } from '../../utils/feeInvoiceSql'
import {
  REPORT_EXPENSE_TRANSACTION_TYPES,
  STUDENT_COLLECTION_TRANSACTION_TYPES,
  asSqlInList
} from '../../utils/financeTransactionTypes'

import type Database from 'better-sqlite3'

type ProfitabilityStatus = 'PROFITABLE' | 'BREAKING_EVEN' | 'UNPROFITABLE'
const studentCollectionTransactionTypesSql = asSqlInList(STUDENT_COLLECTION_TRANSACTION_TYPES)
const debitAndExpenseTransactionTypesSql = asSqlInList(['DEBIT', ...REPORT_EXPENSE_TRANSACTION_TYPES])
export interface ITransportProfitabilityCalculator { calculateTransportProfitability(): Promise<SegmentProfitability> }
export interface IBoardingProfitabilityCalculator { calculateBoardingProfitability(): Promise<SegmentProfitability> }
export interface IActivityFeeAnalyzer { calculateActivityProfitability(): Promise<SegmentProfitability> }
export interface IOverallProfitabilityAnalyzer { getOverallProfitabilityBreakdown(): Promise<OverallProfitability> }
export interface SegmentProfitability {
  segment_type: string
  segment_name: string
  revenue: number
  costs: number
  profit: number
  profit_margin_percentage: number
  status: ProfitabilityStatus
  occupancy_rate_percentage?: number
  recommendations?: string[]
}
export interface OverallProfitability { overall_summary: { total_revenue: number; total_expenses: number; net_profit: number; profit_margin_percentage: number; status: ProfitabilityStatus }; financial_health: string; recommendations: string[] }
export interface OverallProfitabilitySync { segments: SegmentProfitability[]; totalRevenue: number; totalExpenses: number; netProfit: number; profit_margin_percentage: number; status: ProfitabilityStatus; recommendations: string[] }
export interface ComparisonSummary { segments: SegmentProfitability[]; comparison_summary: { highest_performing: string; lowest_performing: string; total_segments: number } }
export interface SegmentAnalysisReport { segments: SegmentProfitability[]; overall: OverallProfitability; unprofitable_segments: SegmentProfitability[]; generated_at: string }
type TotalResult = { total: number }
type CountResult = { count: number }
type SegmentAnalysisResult = { revenue: number; costs: number }
class ProfitabilityRepository {
  private readonly db: Database.Database
  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }
  async getTransportRevenue(): Promise<number> {
    const db = this.db
    const result = db.prepare(`
      SELECT SUM(amount) as total FROM ledger_transaction
      WHERE (description LIKE '%transport%' OR description LIKE '%bus%')
        AND UPPER(COALESCE(transaction_type, '')) IN (${studentCollectionTransactionTypesSql})
    `).get() as TotalResult | undefined
    return result?.total || 0
  }
  async getTransportCosts(): Promise<number> {
    const db = this.db
    const result = db.prepare(`
      SELECT SUM(amount) as total FROM expense_transaction
      WHERE expense_type IN ('FUEL', 'VEHICLE_MAINTENANCE', 'VEHICLE_DEPRECIATION', 'DRIVER_SALARY')
    `).get() as TotalResult | undefined
    return result?.total || 0
  }
  async getBoardingRevenue(): Promise<number> {
    const db = this.db
    const invoiceAmountSql = buildFeeInvoiceAmountSql(db, 'fi')
    const activeStatusPredicate = buildFeeInvoiceActiveStatusPredicate(db, 'fi')
    const result = db.prepare(`
      SELECT SUM(${invoiceAmountSql}) as total FROM fee_invoice fi
      WHERE fi.fee_type = 'BOARDING'
        AND ${activeStatusPredicate}
    `).get() as TotalResult | undefined
    return result?.total || 0
  }
  async getBoardingCosts(): Promise<number> {
    const db = this.db
    const result = db.prepare(`
      SELECT SUM(amount) as total FROM expense_transaction
      WHERE expense_type IN ('FOOD', 'BEDDING', 'DORM_MAINTENANCE', 'UTILITIES')
    `).get() as TotalResult | undefined
    return result?.total || 0
  }
  async getActivityFeeRevenue(): Promise<number> {
    const db = this.db
    const invoiceAmountSql = buildFeeInvoiceAmountSql(db, 'fi')
    const activeStatusPredicate = buildFeeInvoiceActiveStatusPredicate(db, 'fi')
    const result = db.prepare(`
      SELECT SUM(${invoiceAmountSql}) as total FROM fee_invoice fi
      WHERE fi.fee_type = 'ACTIVITY'
        AND ${activeStatusPredicate}
    `).get() as TotalResult | undefined
    return result?.total || 0
  }
  async getActivityFeeExpenses(): Promise<number> {
    const db = this.db
    const result = db.prepare(`
      SELECT SUM(amount) as total FROM expense_transaction
      WHERE expense_type = 'ACTIVITY'
    `).get() as TotalResult | undefined
    return result?.total || 0
  }
  async getTotalRevenue(): Promise<number> {
    const db = this.db
    const invoiceAmountSql = buildFeeInvoiceAmountSql(db, 'fi')
    const activeStatusPredicate = buildFeeInvoiceActiveStatusPredicate(db, 'fi')
    const result = db.prepare(`
      SELECT SUM(${invoiceAmountSql}) as total FROM fee_invoice fi
      WHERE ${activeStatusPredicate}
    `).get() as TotalResult | undefined
    return result?.total || 0
  }
  async getTotalExpenses(): Promise<number> {
    const db = this.db
    const result = db.prepare(`
      SELECT SUM(amount) as total FROM expense_transaction
    `).get() as TotalResult | undefined
    return result?.total || 0
  }
  async getStudentOccupancyRate(): Promise<number> {
    const db = this.db
    const currentStudents = db.prepare(`SELECT COUNT(*) as count FROM student WHERE status = 'ACTIVE'`).get() as CountResult | undefined
    const totalCapacity = db.prepare(`SELECT SUM(capacity) as total FROM dormitory`).get() as TotalResult | undefined
    return totalCapacity?.total ? (currentStudents?.count || 0) / totalCapacity.total : 0
  }
}
// TRANSPORT PROFITABILITY CALCULATOR (SRP)
class TransportProfitabilityCalculator implements ITransportProfitabilityCalculator {
  private readonly db: Database.Database
  private readonly repo: ProfitabilityRepository
  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.repo = new ProfitabilityRepository(this.db)
  }
  async calculateTransportProfitability(): Promise<SegmentProfitability> {
    const revenue = await this.repo.getTransportRevenue()
    const costs = await this.repo.getTransportCosts()
    const profit = revenue - costs
    const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0
    let status: ProfitabilityStatus = 'BREAKING_EVEN'
    if (profit > 0) {status = 'PROFITABLE'}
    if (profit < 0) {status = 'UNPROFITABLE'}
    return {
      segment_type: 'TRANSPORT',
      segment_name: 'Transport Services',
      revenue,
      costs,
      profit,
      profit_margin_percentage: profitMargin,
      status,
      recommendations: this.getTransportRecommendations(profit, revenue)
    }
  }
  private getTransportRecommendations(profit: number, revenue: number): string[] {
    const recommendations: string[] = []
    if (profit < 0) {
      recommendations.push(
        'Transport is unprofitable. Consider reviewing fuel consumption and driver efficiency.',
        'Analyze maintenance costs for potential cost reduction.'
      )
    } else if (revenue * 0.2 > profit) {
      recommendations.push('Transport profit margin is below 20%. Review operational efficiency.')
    }
    return recommendations
  }
}
// BOARDING PROFITABILITY CALCULATOR (SRP)
class BoardingProfitabilityCalculator implements IBoardingProfitabilityCalculator {
  private readonly db: Database.Database
  private readonly repo: ProfitabilityRepository
  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.repo = new ProfitabilityRepository(this.db)
  }
  async calculateBoardingProfitability(): Promise<SegmentProfitability> {
    const revenue = await this.repo.getBoardingRevenue()
    const costs = await this.repo.getBoardingCosts()
    const occupancyRate = await this.repo.getStudentOccupancyRate()
    const profit = revenue - costs
    const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0
    let status: ProfitabilityStatus = 'BREAKING_EVEN'
    if (profit > 0) {status = 'PROFITABLE'}
    if (profit < 0) {status = 'UNPROFITABLE'}
    return {
      segment_type: 'BOARDING',
      segment_name: 'Boarding Services',
      revenue,
      costs,
      profit,
      profit_margin_percentage: profitMargin,
      occupancy_rate_percentage: occupancyRate * 100, // Added to SegmentProfitability if we extend it, or just extra prop
      status,
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
// ACTIVITY FEE ANALYZER (SRP)
class ActivityFeeAnalyzer implements IActivityFeeAnalyzer {
  private readonly db: Database.Database
  private readonly repo: ProfitabilityRepository
  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.repo = new ProfitabilityRepository(this.db)
  }
  async calculateActivityProfitability(): Promise<SegmentProfitability> {
    const revenue = await this.repo.getActivityFeeRevenue()
    const expenses = await this.repo.getActivityFeeExpenses()
    const profit = revenue - expenses
    const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0
    let status: ProfitabilityStatus = 'BREAKING_EVEN'
    if (profit > 0) {status = 'PROFITABLE'}
    if (profit < 0) {status = 'UNPROFITABLE'}
    return {
      segment_type: 'ACTIVITIES',
      segment_name: 'Activity Programs',
      revenue,
      costs: expenses,
      profit,
      profit_margin_percentage: profitMargin,
      status,
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
// OVERALL PROFITABILITY ANALYZER (SRP)
class OverallProfitabilityAnalyzer implements IOverallProfitabilityAnalyzer {
  private readonly db: Database.Database
  private readonly repo: ProfitabilityRepository
  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.repo = new ProfitabilityRepository(this.db)
  }
  async getOverallProfitabilityBreakdown(): Promise<OverallProfitability> {
    const totalRevenue = await this.repo.getTotalRevenue()
    const totalExpenses = await this.repo.getTotalExpenses()
    const netProfit = totalRevenue - totalExpenses
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0
    let status: ProfitabilityStatus = 'BREAKING_EVEN'
    if (netProfit > 0) {status = 'PROFITABLE'}
    if (netProfit < 0) {status = 'UNPROFITABLE'}
    return {
      overall_summary: {
        total_revenue: totalRevenue,
        total_expenses: totalExpenses,
        net_profit: netProfit,
        profit_margin_percentage: profitMargin,
        status
      },
      financial_health: this.assessFinancialHealth(profitMargin, netProfit),
      recommendations: this.getOverallRecommendations(profitMargin, netProfit)
    }
  }
  private assessFinancialHealth(profitMargin: number, netProfit: number): string {
    if (profitMargin >= 20 && netProfit > 0) {return 'EXCELLENT'}
    if (profitMargin >= 10 && netProfit > 0) {return 'GOOD'}
    if (profitMargin >= 0 && netProfit > 0) {return 'FAIR'}
    if (profitMargin < 0 || netProfit < 0) {return 'CRITICAL'}
    return 'FAIR'
  }
  private getOverallRecommendations(profitMargin: number, netProfit: number): string[] {
    const recommendations: string[] = []
    if (netProfit < 0) {
      recommendations.push(
        'School is operating at a loss. Urgent action required to review revenue and expenses.',
        'Consider increasing fees or reducing operational costs.'
      )
    } else if (profitMargin < 10) {
      recommendations.push('Profit margin is below 10%. Monitor expenses closely and look for efficiency improvements.')
    }
    if (profitMargin >= 15) {
      recommendations.push('Strong profit margin. Consider reinvesting in school infrastructure and programs.')
    }
    return recommendations
  }
}
// FACADE - SOLID-COMPLIANT SERVICE
export class SegmentProfitabilityService
  implements ITransportProfitabilityCalculator, IBoardingProfitabilityCalculator, IActivityFeeAnalyzer
{
  // Composed services
  private readonly db: Database.Database
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
  private resolveStatus(value: number): ProfitabilityStatus {
    if (value > 0) {
      return 'PROFITABLE'
    }
    if (value < 0) {
      return 'UNPROFITABLE'
    }
    return 'BREAKING_EVEN'
  }
  async calculateTransportProfitability(): Promise<SegmentProfitability> {
    return this.transportCalculator.calculateTransportProfitability()
  }
  async calculateBoardingProfitability(): Promise<SegmentProfitability> {
    return this.boardingCalculator.calculateBoardingProfitability()
  }
  async calculateActivityProfitability(): Promise<SegmentProfitability> {
    return this.activityAnalyzer.calculateActivityProfitability()
  }
  async getOverallProfitabilityBreakdown(): Promise<OverallProfitability> {
    return this.overallAnalyzer.getOverallProfitabilityBreakdown()
  }
  async getUnprofitableSegments(): Promise<SegmentProfitability[]> {
    const transport = await this.calculateTransportProfitability()
    const boarding = await this.calculateBoardingProfitability()
    const activities = await this.activityAnalyzer.calculateActivityProfitability()
    const unprofitable: SegmentProfitability[] = []
    if (transport.status === 'UNPROFITABLE') {
      unprofitable.push(transport)
    }
    if (boarding.status === 'UNPROFITABLE') {
      unprofitable.push(boarding)
    }
    if (activities.status === 'UNPROFITABLE') {
      unprofitable.push(activities)
    }
    return unprofitable
  }
  async getSegmentAnalysisReport(): Promise<SegmentAnalysisReport> {
    const transport = await this.calculateTransportProfitability()
    const boarding = await this.calculateBoardingProfitability()
    const activities = await this.activityAnalyzer.calculateActivityProfitability()
    const overall = await this.getOverallProfitabilityBreakdown()
    return {
      segments: [transport, boarding, activities],
      overall,
      unprofitable_segments: await this.getUnprofitableSegments(),
      generated_at: new Date().toISOString()
    }
  }
  // SYNCHRONOUS WRAPPERS FOR TEST COMPATIBILITY
  analyzeTransportProfitability(startDate?: string, endDate?: string): SegmentProfitability {
    const db = this.db
    const result = db.prepare(`
      SELECT 
        'TRANSPORT' as segment_type,
        'Transport Services' as segment_name,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(transaction_type, '')) IN (${studentCollectionTransactionTypesSql}) THEN amount ELSE 0 END), 0) as revenue,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(transaction_type, '')) IN (${debitAndExpenseTransactionTypesSql}) AND description LIKE '%transport%' THEN amount ELSE 0 END), 0) as costs
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
      profit_margin_percentage: Number.parseFloat(profitMargin.toFixed(2)),
      status: this.resolveStatus(profit)
    }
  }
  analyzeBoardingProfitability(startDate?: string, endDate?: string): SegmentProfitability {
    const db = this.db
    const result = db.prepare(`
      SELECT 
        'BOARDING' as segment_type,
        'Boarding Services' as segment_name,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(transaction_type, '')) IN (${studentCollectionTransactionTypesSql}) THEN amount ELSE 0 END), 0) as revenue,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(transaction_type, '')) IN (${debitAndExpenseTransactionTypesSql}) AND description LIKE '%boarding%' THEN amount ELSE 0 END), 0) as costs
      FROM ledger_transaction
      WHERE (description LIKE '%boarding%' OR description LIKE '%hostel%')
        AND (? IS NULL OR transaction_date >= ?)
        AND (? IS NULL OR transaction_date <= ?)
    `).get(startDate, startDate, endDate, endDate) as SegmentAnalysisResult | undefined
    const revenue = result?.revenue || 0
    const costs = result?.costs || 0
    const profit = revenue - costs
    const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0
    const occupancyRate = 85 // Default occupancy assumption
    const recommendations = this.getBoardingRecommendations(revenue, costs, occupancyRate)
    return {
      segment_type: 'BOARDING',
      segment_name: 'Boarding Services',
      revenue,
      costs,
      profit,
      profit_margin_percentage: Number.parseFloat(profitMargin.toFixed(2)),
      occupancy_rate_percentage: occupancyRate,
      status: this.resolveStatus(profit),
      recommendations
    }
  }
  analyzeActivityFees(startDate?: string, endDate?: string): SegmentProfitability {
    const db = this.db
    const result = db.prepare(`
      SELECT 
        'ACTIVITY' as segment_type,
        'Activity Fees' as segment_name,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(transaction_type, '')) IN (${studentCollectionTransactionTypesSql}) THEN amount ELSE 0 END), 0) as revenue,
        COALESCE(SUM(CASE WHEN UPPER(COALESCE(transaction_type, '')) IN (${debitAndExpenseTransactionTypesSql}) AND description LIKE '%activity%' THEN amount ELSE 0 END), 0) as costs
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
      profit_margin_percentage: Number.parseFloat(profitMargin.toFixed(2)),
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
      profit_margin_percentage: Number.parseFloat(totalMargin.toFixed(2)),
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
    const sorted = [...segments].sort(
      (a: SegmentProfitability, b: SegmentProfitability) => b.profit_margin_percentage - a.profit_margin_percentage
    )
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
  private getOverallRecommendations(transport: SegmentProfitability, boarding: SegmentProfitability, activity: SegmentProfitability): string[] {
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
