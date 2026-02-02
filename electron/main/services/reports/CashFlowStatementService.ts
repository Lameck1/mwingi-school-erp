import { getDatabase } from '../../database'

// ============================================================================
// SEGREGATED INTERFACES (ISP)
// ============================================================================

export interface IOperatingActivitiesCalculator {
  getOperatingActivities(startDate: string, endDate: string): Promise<any>
}

export interface IInvestingActivitiesCalculator {
  getInvestingActivities(startDate: string, endDate: string): Promise<any>
}

export interface IFinancingActivitiesCalculator {
  getFinancingActivities(startDate: string, endDate: string): Promise<any>
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
  async getTransactionsByType(startDate: string, endDate: string, transactionTypes: string[]): Promise<any[]> {
    const db = getDatabase()
    const placeholders = transactionTypes.map(() => '?').join(',')
    return db.prepare(`
      SELECT * FROM ledger_transaction
      WHERE transaction_date >= ? AND transaction_date <= ?
        AND transaction_type IN (${placeholders})
      ORDER BY transaction_date ASC
    `).all(startDate, endDate, ...transactionTypes) as any[]
  }

  async getOpeningBalance(periodStartDate: string): Promise<number> {
    const db = getDatabase()
    const result = db.prepare(`
      SELECT SUM(amount) as balance
      FROM ledger_transaction
      WHERE transaction_date < ? AND is_voided = 0
    `).get(periodStartDate) as any
    return result?.balance || 0
  }

  async getExpensesByType(startDate: string, endDate: string, expenseTypes: string[]): Promise<number> {
    const db = getDatabase()
    const placeholders = expenseTypes.map(() => '?').join(',')
    const result = db.prepare(`
      SELECT SUM(amount) as total
      FROM expense_transaction
      WHERE expense_type IN (${placeholders})
        AND transaction_date >= ? AND transaction_date <= ?
    `).get(...expenseTypes, startDate, endDate) as any
    return result?.total || 0
  }

  async getPayrollExpenses(startDate: string, endDate: string): Promise<number> {
    const db = getDatabase()
    const result = db.prepare(`
      SELECT SUM(amount) as total FROM payroll_transaction
      WHERE transaction_date >= ? AND transaction_date <= ?
    `).get(startDate, endDate) as any
    return result?.total || 0
  }

  async getAssetTransactions(startDate: string, endDate: string): Promise<any[]> {
    const db = getDatabase()
    return db.prepare(`
      SELECT * FROM asset_transaction
      WHERE transaction_date >= ? AND transaction_date <= ?
      ORDER BY transaction_date ASC
    `).all(startDate, endDate) as any[]
  }

  async getLoanTransactions(startDate: string, endDate: string): Promise<any[]> {
    const db = getDatabase()
    return db.prepare(`
      SELECT * FROM loan_transaction
      WHERE transaction_date >= ? AND transaction_date <= ?
      ORDER BY transaction_date ASC
    `).all(startDate, endDate) as any[]
  }

  async getAverageMonthlyExpenses(): Promise<number> {
    const db = getDatabase()
    const result = db.prepare(`
      SELECT SUM(amount) as total FROM expense_transaction
      WHERE transaction_date >= date('now', '-3 months')
    `).get() as any
    return (result?.total || 0) / 3
  }
}

// ============================================================================
// OPERATING ACTIVITIES CALCULATOR (SRP)
// ============================================================================

class OperatingActivitiesCalculator implements IOperatingActivitiesCalculator {
  private repo = new CashFlowRepository()

  async getOperatingActivities(startDate: string, endDate: string): Promise<any> {
    const incomingTransactions = await this.repo.getTransactionsByType(startDate, endDate, ['CREDIT', 'PAYMENT'])
    const feeCollections = incomingTransactions.reduce((sum: number, t: any) => sum + (t.amount || 0), 0)

    const donationTransactions = await this.repo.getTransactionsByType(startDate, endDate, ['DONATION'])
    const donationCollections = donationTransactions.reduce((sum: number, t: any) => sum + (t.amount || 0), 0)

    const otherIncomeTransactions = await this.repo.getTransactionsByType(startDate, endDate, ['OTHER_INCOME'])
    const otherIncome = otherIncomeTransactions.reduce((sum: number, t: any) => sum + (t.amount || 0), 0)

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
      utilities: utilities,
      other_expenses: otherExpenses,
      net_operating_cash_flow: netOperatingCashFlow
    }
  }
}

// ============================================================================
// INVESTING ACTIVITIES CALCULATOR (SRP)
// ============================================================================

class InvestingActivitiesCalculator implements IInvestingActivitiesCalculator {
  private repo = new CashFlowRepository()

  async getInvestingActivities(startDate: string, endDate: string): Promise<any> {
    const assetTransactions = await this.repo.getAssetTransactions(startDate, endDate)

    let assetPurchases = 0
    let assetSales = 0

    assetTransactions.forEach((trans: any) => {
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
  private repo = new CashFlowRepository()

  async getFinancingActivities(startDate: string, endDate: string): Promise<any> {
    const loanTransactions = await this.repo.getLoanTransactions(startDate, endDate)

    let loansReceived = 0
    let loanRepayments = 0
    let grantReceived = 0

    loanTransactions.forEach((trans: any) => {
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
  private repo = new CashFlowRepository()

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
    historicalData.forEach((record: any) => {
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
  private readonly operatingCalculator: OperatingActivitiesCalculator
  private readonly investingCalculator: InvestingActivitiesCalculator
  private readonly financingCalculator: FinancingActivitiesCalculator
  private readonly liquidityAnalyzer: LiquidityAnalyzer
  private readonly forecaster: CashFlowForecaster
  private readonly repository: CashFlowRepository

  constructor() {
    this.operatingCalculator = new OperatingActivitiesCalculator()
    this.investingCalculator = new InvestingActivitiesCalculator()
    this.financingCalculator = new FinancingActivitiesCalculator()
    this.liquidityAnalyzer = new LiquidityAnalyzer()
    this.forecaster = new CashFlowForecaster()
    this.repository = new CashFlowRepository()
  }

  /**
   * Generate complete cash flow statement for a period
   */
  async generateCashFlowStatement(startDate: string, endDate: string): Promise<CashFlowStatement> {
    try {
      // Get opening balance
      const openingCashBalance = await this.repository.getOpeningBalance(startDate)

      // Get all activity categories (delegates to specialized calculators)
      const operatingActivities = await this.getOperatingActivities(startDate, endDate)
      const investingActivities = await this.getInvestingActivities(startDate, endDate)
      const financingActivities = await this.getFinancingActivities(startDate, endDate)

      // Calculate net changes
      const netOperatingCash = operatingActivities.net_operating_cash_flow
      const netInvestingCash = investingActivities.net_investing_cash_flow
      const netFinancingCash = financingActivities.net_financing_cash_flow
      const netCashChange = netOperatingCash + netInvestingCash + netFinancingCash

      const closingCashBalance = openingCashBalance + netCashChange

      // Get liquidity status
      const liquidityStatus = this.liquidityAnalyzer.assessLiquidityStatus(closingCashBalance)

      // Generate forecasts (simplified for phase 2)
      const transactions = await this.repository.getTransactionsByType(startDate, endDate, ['CREDIT', 'PAYMENT'])
      const forecasts = await this.forecaster.generateCashForecasts(transactions, 60)

      const cashForecast30 = forecasts.find(f => f.forecast_date === new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])?.projected_balance || closingCashBalance
      const cashForecast60 = forecasts.find(f => f.forecast_date === new Date(new Date().getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])?.projected_balance || closingCashBalance

      return {
        period_start: startDate,
        period_end: endDate,
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

  // Delegated interface implementations
  async getOperatingActivities(startDate: string, endDate: string): Promise<any> {
    return this.operatingCalculator.getOperatingActivities(startDate, endDate)
  }

  async getInvestingActivities(startDate: string, endDate: string): Promise<any> {
    return this.investingCalculator.getInvestingActivities(startDate, endDate)
  }

  async getFinancingActivities(startDate: string, endDate: string): Promise<any> {
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
