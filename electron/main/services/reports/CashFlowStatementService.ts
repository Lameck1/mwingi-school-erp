import Database from 'better-sqlite3-multiple-ciphers'
import { getDatabase } from '../../database'

// ============================================================================
// SEGREGATED INTERFACES (ISP)
// ============================================================================

export interface IOperatingActivitiesCalculator {
  getOperatingActivities(startDate: string, endDate: string): Promise<unknown>
}

export interface IInvestingActivitiesCalculator {
  getInvestingActivities(startDate: string, endDate: string): Promise<unknown>
}

export interface IFinancingActivitiesCalculator {
  getFinancingActivities(startDate: string, endDate: string): Promise<unknown>
}

export interface ILiquidityAnalyzer {
  assessLiquidityStatus(closingBalance: number): 'STRONG' | 'ADEQUATE' | 'TIGHT' | 'CRITICAL'
}

export interface ICashFlowForecaster {
  generateCashForecasts(historicalData: any[], forecastDays: number): Promise<any[]>
}

export interface CashFlowData {
  start_date: string
  end_date: string
  include_forecasts?: boolean
  forecast_days?: number
}

export interface CashFlowStatement {
  period_start: string
  period_end: string
  operating_activities: {
    fee_collections: number
    donation_collections: number
    other_income: number
    salary_payments: number
    supplier_payments: number
    utilities: number
    other_expenses: number
    net_operating_cash_flow: number
  }
  investing_activities: {
    asset_purchases: number
    asset_sales: number
    net_investing_cash_flow: number
  }
  financing_activities: {
    loans_received: number
    loan_repayments: number
    grant_received: number
    net_financing_cash_flow: number
  }
  opening_cash_balance: number
  net_cash_change: number
  closing_cash_balance: number
  cash_forecast_30_days: number
  cash_forecast_60_days: number
  liquidity_status: 'STRONG' | 'ADEQUATE' | 'TIGHT' | 'CRITICAL'
}

// ============================================================================
// REPOSITORY LAYER (SRP)
// ============================================================================

class CashFlowRepository {
  private db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  async getTransactionsByType(startDate: string, endDate: string, transactionTypes: string[]): Promise<any[]> {
    const db = this.db
    const placeholders = transactionTypes.map(() => '?').join(',')
    return db.prepare(`
      SELECT * FROM ledger_transaction
      WHERE transaction_date >= ? AND transaction_date <= ?
        AND transaction_type IN (${placeholders})
      ORDER BY transaction_date ASC
    `).all(startDate, endDate, ...transactionTypes) as unknown[]
  }

  async getOpeningBalance(periodStartDate: string): Promise<number> {
    const db = this.db
    const result = db.prepare(`
      SELECT SUM(amount) as balance
      FROM ledger_transaction
      WHERE transaction_date < ? AND is_voided = 0
    `).get(periodStartDate) as unknown
    return result?.balance || 0
  }

  async getExpensesByType(startDate: string, endDate: string, expenseTypes: string[]): Promise<number> {
    const db = this.db
    const placeholders = expenseTypes.map(() => '?').join(',')
    const result = db.prepare(`
      SELECT SUM(amount) as total
      FROM expense_transaction
      WHERE expense_type IN (${placeholders})
        AND transaction_date >= ? AND transaction_date <= ?
    `).get(...expenseTypes, startDate, endDate) as unknown
    return result?.total || 0
  }

  async getPayrollExpenses(startDate: string, endDate: string): Promise<number> {
    const db = this.db
    const result = db.prepare(`
      SELECT SUM(amount) as total FROM payroll_transaction
      WHERE transaction_date >= ? AND transaction_date <= ?
    `).get(startDate, endDate) as unknown
    return result?.total || 0
  }

  async getAssetTransactions(startDate: string, endDate: string): Promise<any[]> {
    const db = this.db
    return db.prepare(`
      SELECT * FROM asset_transaction
      WHERE transaction_date >= ? AND transaction_date <= ?
      ORDER BY transaction_date ASC
    `).all(startDate, endDate) as unknown[]
  }

  async getLoanTransactions(startDate: string, endDate: string): Promise<any[]> {
    const db = this.db
    return db.prepare(`
      SELECT * FROM loan_transaction
      WHERE transaction_date >= ? AND transaction_date <= ?
      ORDER BY transaction_date ASC
    `).all(startDate, endDate) as unknown[]
  }

  async getAverageMonthlyExpenses(): Promise<number> {
    const db = this.db
    const result = db.prepare(`
      SELECT SUM(amount) as total FROM expense_transaction
      WHERE transaction_date >= date('now', '-3 months')
    `).get() as unknown
    return (result?.total || 0) / 3
  }
}

// ============================================================================
// OPERATING ACTIVITIES CALCULATOR (SRP)
// ============================================================================

class OperatingActivitiesCalculator implements IOperatingActivitiesCalculator {
  private db: Database.Database
  private repo: CashFlowRepository

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.repo = new CashFlowRepository(this.db)
  }

  async getOperatingActivities(startDate: string, endDate: string): Promise<unknown> {
    const incomingTransactions = await this.repo.getTransactionsByType(startDate, endDate, ['CREDIT', 'PAYMENT'])
    const feeCollections = incomingTransactions.reduce((sum: number, t: unknown) => sum + (t.amount || 0), 0)

    const donationTransactions = await this.repo.getTransactionsByType(startDate, endDate, ['DONATION'])
    const donationCollections = donationTransactions.reduce((sum: number, t: unknown) => sum + (t.amount || 0), 0)

    const otherIncomeTransactions = await this.repo.getTransactionsByType(startDate, endDate, ['OTHER_INCOME'])
    const otherIncome = otherIncomeTransactions.reduce((sum: number, t: unknown) => sum + (t.amount || 0), 0)

    const salaryPayments = await this.repo.getPayrollExpenses(startDate, endDate)
    const supplierPayments = await this.repo.getExpensesByType(startDate, endDate, ['SUPPLIES', 'MATERIALS'])
    const utilities = await this.repo.getExpensesByType(startDate, endDate, ['UTILITIES'])
    const otherExpenses = await this.repo.getExpensesByType(startDate, endDate, ['OTHER'])

    const grossOperatingCash = feeCollections + donationCollections + otherIncome
    const totalOperatingExpenses = salaryPayments + supplierPayments + utilities + otherExpenses
    const netOperatingCashFlow = grossOperatingCash - totalOperatingExpenses

    return {
      fee_collections: feeCollections,
      donation_collections: donationCollections,
      other_income: otherIncome,
      salary_payments: salaryPayments,
      supplier_payments: supplierPayments,
      utilities,
      other_expenses: otherExpenses,
      net_operating_cash_flow: netOperatingCashFlow
    }
  }
}

// ============================================================================
// INVESTING ACTIVITIES CALCULATOR (SRP)
// ============================================================================

class InvestingActivitiesCalculator implements IInvestingActivitiesCalculator {
  private db: Database.Database
  private repo: CashFlowRepository

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.repo = new CashFlowRepository(this.db)
  }

  async getInvestingActivities(startDate: string, endDate: string): Promise<unknown> {
    const assetTransactions = await this.repo.getAssetTransactions(startDate, endDate)

    let assetPurchases = 0
    let assetSales = 0

    assetTransactions.forEach((trans: unknown) => {
      if (trans.transaction_type === 'PURCHASE') {
        assetPurchases += trans.amount || 0
      } else if (trans.transaction_type === 'SALE') {
        assetSales += trans.amount || 0
      }
    })

    const netInvestingCashFlow = assetSales - assetPurchases

    return {
      asset_purchases: assetPurchases,
      asset_sales: assetSales,
      net_investing_cash_flow: netInvestingCashFlow
    }
  }
}

// ============================================================================
// FINANCING ACTIVITIES CALCULATOR (SRP)
// ============================================================================

class FinancingActivitiesCalculator implements IFinancingActivitiesCalculator {
  private db: Database.Database
  private repo: CashFlowRepository

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.repo = new CashFlowRepository(this.db)
  }

  async getFinancingActivities(startDate: string, endDate: string): Promise<unknown> {
    const loanTransactions = await this.repo.getLoanTransactions(startDate, endDate)

    let loansReceived = 0
    let loanRepayments = 0
    let grantReceived = 0

    loanTransactions.forEach((trans: unknown) => {
      if (trans.transaction_type === 'DISBURSEMENT') {
        loansReceived += trans.amount || 0
      } else if (trans.transaction_type === 'REPAYMENT') {
        loanRepayments += trans.amount || 0
      } else if (trans.transaction_type === 'GRANT') {
        grantReceived += trans.amount || 0
      }
    })

    const netFinancingCashFlow = loansReceived + grantReceived - loanRepayments

    return {
      loans_received: loansReceived,
      loan_repayments: loanRepayments,
      grant_received: grantReceived,
      net_financing_cash_flow: netFinancingCashFlow
    }
  }
}

// ============================================================================
// LIQUIDITY ANALYZER (SRP)
// ============================================================================

class LiquidityAnalyzer implements ILiquidityAnalyzer {
  private db: Database.Database
  private repo: CashFlowRepository

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.repo = new CashFlowRepository(this.db)
  }

  async getStatus(closingBalance: number): Promise<'STRONG' | 'ADEQUATE' | 'TIGHT' | 'CRITICAL'> {
    const avgMonthlyExpenses = await this.repo.getAverageMonthlyExpenses()
    return this.assessLiquidityStatus(closingBalance, avgMonthlyExpenses)
  }

  assessLiquidityStatus(closingBalance: number, avgMonthlyExpenses: number = 0): 'STRONG' | 'ADEQUATE' | 'TIGHT' | 'CRITICAL' {
    // Determine liquidity status based on available months of expenses
    if (closingBalance >= avgMonthlyExpenses * 3) {
      return 'STRONG' // 3+ months of expenses available
    } else if (closingBalance >= avgMonthlyExpenses * 1.5) {
      return 'ADEQUATE' // 1.5-3 months
    } else if (closingBalance >= avgMonthlyExpenses * 0.5) {
      return 'TIGHT' // 0.5-1.5 months
    }
    return 'CRITICAL' // Less than 0.5 months
  }
}

// ============================================================================
// CASH FLOW FORECASTER (SRP)
// ============================================================================

class CashFlowForecaster implements ICashFlowForecaster {
  async generateCashForecasts(historicalData: any[], forecastDays: number): Promise<any[]> {
    const forecasts: any[] = []

    // Calculate 3-day average from historical data (simple moving average)
    const dailyAverages: { [key: string]: number } = {}
    historicalData.forEach((record: unknown) => {
      const dayOfWeek = new Date(record.transaction_date).getDay()
      if (!dailyAverages[dayOfWeek]) {
        dailyAverages[dayOfWeek] = 0
      }
      dailyAverages[dayOfWeek] += record.amount || 0
    })

    // Calculate forecast
    let currentBalance = historicalData[historicalData.length - 1]?.balance || 0
    const today = new Date()

    for (let i = 1; i <= Math.min(forecastDays, 60); i++) {
      const forecastDate = new Date(today)
      forecastDate.setDate(forecastDate.getDate() + i)
      const dayOfWeek = forecastDate.getDay()

      const dailyAverage = dailyAverages[dayOfWeek] || 0
      currentBalance += dailyAverage

      // Confidence decreases over time
      let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH'
      if (i > 30) confidence = 'MEDIUM'
      if (i > 45) confidence = 'LOW'

      forecasts.push({
        forecast_date: forecastDate.toISOString().split('T')[0],
        projected_balance: Math.max(0, currentBalance),
        confidence_level: confidence
      })
    }

    return forecasts
  }
}

// ============================================================================
// FACADE - SOLID-COMPLIANT SERVICE
// ============================================================================

export class CashFlowStatementService
  implements IOperatingActivitiesCalculator, IInvestingActivitiesCalculator, IFinancingActivitiesCalculator {
  // Composed services
  private db: Database.Database
  private readonly operatingCalculator: OperatingActivitiesCalculator
  private readonly investingCalculator: InvestingActivitiesCalculator
  private readonly financingCalculator: FinancingActivitiesCalculator
  private readonly liquidityAnalyzer: LiquidityAnalyzer
  private readonly forecaster: CashFlowForecaster
  private readonly repository: CashFlowRepository

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.operatingCalculator = new OperatingActivitiesCalculator(this.db)
    this.investingCalculator = new InvestingActivitiesCalculator(this.db)
    this.financingCalculator = new FinancingActivitiesCalculator(this.db)
    this.liquidityAnalyzer = new LiquidityAnalyzer(this.db)
    this.forecaster = new CashFlowForecaster()
    this.repository = new CashFlowRepository(this.db)
  }

  /**
   * Generate complete cash flow statement for a period
   */
  async generateCashFlowStatement(startDate?: string, endDate?: string): Promise<CashFlowStatement> {
    try {
      const period = this.resolvePeriod(startDate, endDate)

      // Get opening balance
      const openingCashBalance = await this.repository.getOpeningBalance(period.startDate)

      // Get all activity categories (delegates to specialized calculators)
      const operatingActivities = await this.getOperatingActivities(period.startDate, period.endDate)
      const investingActivities = await this.getInvestingActivities(period.startDate, period.endDate)
      const financingActivities = await this.getFinancingActivities(period.startDate, period.endDate)

      // Calculate net changes
      const netOperatingCash = operatingActivities.net_operating_cash_flow
      const netInvestingCash = investingActivities.net_investing_cash_flow
      const netFinancingCash = financingActivities.net_financing_cash_flow
      const netCashChange = netOperatingCash + netInvestingCash + netFinancingCash

      const closingCashBalance = openingCashBalance + netCashChange

      // Get liquidity status
      const liquidityStatus = this.liquidityAnalyzer.assessLiquidityStatus(closingCashBalance)

      // Generate forecasts (simplified for phase 2)
      const transactions = await this.repository.getTransactionsByType(period.startDate, period.endDate, ['CREDIT', 'PAYMENT'])
      const forecasts = await this.forecaster.generateCashForecasts(transactions, 60)

      const cashForecast30 = forecasts.find(f => f.forecast_date === new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])?.projected_balance || closingCashBalance
      const cashForecast60 = forecasts.find(f => f.forecast_date === new Date(new Date().getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])?.projected_balance || closingCashBalance

      return {
        period_start: period.startDate,
        period_end: period.endDate,
        operating_activities: operatingActivities,
        investing_activities: investingActivities,
        financing_activities: financingActivities,
        opening_cash_balance: openingCashBalance,
        net_cash_change: netCashChange,
        closing_cash_balance: closingCashBalance,
        cash_forecast_30_days: cashForecast30,
        cash_forecast_60_days: cashForecast60,
        liquidity_status: liquidityStatus
      }
    } catch (error) {
      throw new Error(`Failed to generate cash flow statement: ${(error as Error).message}`)
    }
  }

  // --------------------------------------------------------------------------
  // Backward-compatible helpers for accounting module tests
  // --------------------------------------------------------------------------

  async getCashFlowStatement(termId: string): Promise<CashFlowStatement> {
    const term = this.db
      .prepare('SELECT start_date, end_date FROM academic_term WHERE id = ?')
      .get(termId) as { start_date: string; end_date: string } | undefined

    if (!term) {
      return this.buildEmptyStatement('', '')
    }

    return this.generateCashFlowStatement(term.start_date, term.end_date)
  }

  async analyzeCashFlowByTerm(termId: string): Promise<CashFlowStatement> {
    return this.getCashFlowStatement(termId)
  }

  async calculateCashPosition(): Promise<{
    opening_balance: number
    total_inflows: number
    total_outflows: number
    closing_balance: number
  }> {
    const statement = await this.generateCashFlowStatement()
    const totalInflows =
      statement.operating_activities.fee_collections +
      statement.operating_activities.donation_collections +
      statement.operating_activities.other_income +
      statement.investing_activities.asset_sales +
      statement.financing_activities.loans_received +
      statement.financing_activities.grant_received
    const totalOutflows =
      statement.operating_activities.salary_payments +
      statement.operating_activities.supplier_payments +
      statement.operating_activities.utilities +
      statement.operating_activities.other_expenses +
      statement.investing_activities.asset_purchases +
      statement.financing_activities.loan_repayments

    return {
      opening_balance: statement.opening_cash_balance,
      total_inflows: totalInflows,
      total_outflows: totalOutflows,
      closing_balance: statement.closing_cash_balance
    }
  }

  private resolvePeriod(startDate?: string, endDate?: string): { startDate: string; endDate: string } {
    if (startDate && endDate) {
      return { startDate, endDate }
    }

    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0]
    }
  }

  private buildEmptyStatement(startDate: string, endDate: string): CashFlowStatement {
    return {
      period_start: startDate,
      period_end: endDate,
      operating_activities: {
        fee_collections: 0,
        donation_collections: 0,
        other_income: 0,
        salary_payments: 0,
        supplier_payments: 0,
        utilities: 0,
        other_expenses: 0,
        net_operating_cash_flow: 0
      },
      investing_activities: {
        asset_purchases: 0,
        asset_sales: 0,
        net_investing_cash_flow: 0
      },
      financing_activities: {
        loans_received: 0,
        loan_repayments: 0,
        grant_received: 0,
        net_financing_cash_flow: 0
      },
      opening_cash_balance: 0,
      net_cash_change: 0,
      closing_cash_balance: 0,
      cash_forecast_30_days: 0,
      cash_forecast_60_days: 0,
      liquidity_status: 'ADEQUATE'
    }
  }

  // Delegated interface implementations
  async getOperatingActivities(startDate: string, endDate: string): Promise<unknown> {
    return this.operatingCalculator.getOperatingActivities(startDate, endDate)
  }

  async getInvestingActivities(startDate: string, endDate: string): Promise<unknown> {
    return this.investingCalculator.getInvestingActivities(startDate, endDate)
  }

  async getFinancingActivities(startDate: string, endDate: string): Promise<unknown> {
    return this.financingCalculator.getFinancingActivities(startDate, endDate)
  }

  /**
   * Generate cash forecasts for specified number of days
   */
  async generateCashForecasts(startDate: string, endDate: string, forecastDays: number = 60): Promise<any[]> {
    const transactions = await this.repository.getTransactionsByType(startDate, endDate, ['CREDIT', 'PAYMENT'])
    return this.forecaster.generateCashForecasts(transactions, forecastDays)
  }

  /**
   * Assess liquidity status based on closing balance
   */
  async assessLiquidityStatus(closingBalance: number): Promise<'STRONG' | 'ADEQUATE' | 'TIGHT' | 'CRITICAL'> {
    return this.liquidityAnalyzer.getStatus(closingBalance)
  }
}

