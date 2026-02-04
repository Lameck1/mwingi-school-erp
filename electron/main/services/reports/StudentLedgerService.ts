import Database from 'better-sqlite3-multiple-ciphers'
import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

// ============================================================================
// SEGREGATED INTERFACES (ISP)
// ============================================================================

export interface IOpeningBalanceCalculator {
  calculateOpeningBalance(studentId: number, beforeDate: string): Promise<number>
}

export interface ILedgerGenerator {
  generateStudentLedger(studentId: number, startDate: string, endDate: string): Promise<LedgerEntry[]>
}

export interface ILedgerReconciler {
  reconcileStudentLedger(studentId: number, periodStart: string, periodEnd: string): Promise<ReconciliationResult>
}

export interface ILedgerValidator {
  verifyOpeningBalance(studentId: number, periodStart: string): Promise<VerificationResult>
}

export interface LedgerEntry {
  transaction_date: string
  transaction_type: string
  description: string
  debit: number
  credit: number
  balance: number
}

export interface ReconciliationResult {
  reconciled: boolean
  ledger_balance: number
  invoice_balance: number
  difference: number
  status: 'BALANCED' | 'OUT_OF_BALANCE'
  discrepancies: any[]
}

export interface VerificationResult {
  verified: boolean
  opening_balance: number
  verification_status: 'VERIFIED' | 'UNVERIFIED' | 'DISCREPANCY'
}

export interface StudentLedgerData {
  student_id: number
  start_date: string
  end_date: string
}

// ============================================================================
// REPOSITORY LAYER (SRP)
// ============================================================================

class StudentLedgerRepository {
  private db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  async getTransactionHistory(studentId: number): Promise<any[]> {
    const db = this.db
    return db.prepare(`
      SELECT * FROM ledger_transaction
      WHERE student_id = ? AND is_voided = 0
      ORDER BY transaction_date ASC, created_at ASC
    `).all(studentId) as unknown[]
  }

  async getTransactionsByPeriod(studentId: number, startDate: string, endDate: string): Promise<any[]> {
    const db = this.db
    return db.prepare(`
      SELECT * FROM ledger_transaction
      WHERE student_id = ? AND transaction_date >= ? AND transaction_date <= ? AND is_voided = 0
      ORDER BY transaction_date ASC, created_at ASC
    `).all(studentId, startDate, endDate) as unknown[]
  }

  async getOutstandingInvoices(studentId: number): Promise<any[]> {
    const db = this.db
    return db.prepare(`
      SELECT * FROM fee_invoice
      WHERE student_id = ? AND status = 'OUTSTANDING'
      ORDER BY due_date ASC
    `).all(studentId) as unknown[]
  }

  async getInvoicesForPeriod(studentId: number, startDate: string, endDate: string): Promise<any[]> {
    const db = this.db
    return db.prepare(`
      SELECT * FROM fee_invoice
      WHERE student_id = ? AND invoice_date >= ? AND invoice_date <= ?
      ORDER BY invoice_date ASC
    `).all(studentId, startDate, endDate) as unknown[]
  }

  async getStudent(studentId: number): Promise<unknown> {
    const db = this.db
    return db.prepare(`SELECT * FROM student WHERE id = ?`).get(studentId)
  }

  async recordOpeningBalance(studentId: number, periodStart: string, openingBalance: number): Promise<number> {
    const db = this.db
    const result = db.prepare(`
      INSERT INTO student_opening_balance (student_id, period_start, opening_balance, recorded_at)
      VALUES (?, ?, ?, ?)
    `).run(studentId, periodStart, openingBalance, new Date().toISOString())
    return result.lastInsertRowid as number
  }

  async getRecordedOpeningBalance(studentId: number, periodStart: string): Promise<number | null> {
    const db = this.db
    const result = db.prepare(`
      SELECT opening_balance FROM student_opening_balance
      WHERE student_id = ? AND period_start = ?
    `).get(studentId, periodStart) as unknown
    return result?.opening_balance || null
  }
}

// ============================================================================
// OPENING BALANCE CALCULATOR (SRP)
// ============================================================================

class OpeningBalanceCalculator implements IOpeningBalanceCalculator {
  private db: Database.Database
  private repo: StudentLedgerRepository

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.repo = new StudentLedgerRepository(this.db)
  }

  async calculateOpeningBalance(studentId: number, beforeDate: string): Promise<number> {
    const transactions = await this.repo.getTransactionHistory(studentId)

    // Sum all transactions before the period start date
    let balance = 0
    for (const transaction of transactions) {
      if (transaction.transaction_date < beforeDate) {
        if (transaction.transaction_type === 'CREDIT' || transaction.transaction_type === 'PAYMENT') {
          balance += transaction.amount || 0
        } else if (transaction.transaction_type === 'DEBIT' || transaction.transaction_type === 'CHARGE') {
          balance -= transaction.amount || 0
        } else if (transaction.transaction_type === 'REVERSAL') {
          balance -= transaction.amount || 0
        }
      }
    }

    return Math.max(0, balance) // Never negative
  }
}

// ============================================================================
// LEDGER GENERATOR (SRP)
// ============================================================================

class LedgerGenerator implements ILedgerGenerator {
  private db: Database.Database
  private repo: StudentLedgerRepository
  private balanceCalc: OpeningBalanceCalculator

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.repo = new StudentLedgerRepository(this.db)
    this.balanceCalc = new OpeningBalanceCalculator(this.db)
  }

  async generateStudentLedger(studentId: number, startDate: string, endDate: string): Promise<LedgerEntry[]> {
    const transactions = await this.repo.getTransactionsByPeriod(studentId, startDate, endDate)

    // Get opening balance
    const openingBalance = await this.balanceCalc.calculateOpeningBalance(studentId, startDate)

    const entries: LedgerEntry[] = []
    let runningBalance = openingBalance

    // Add opening balance entry
    if (openingBalance > 0) {
      entries.push({
        transaction_date: startDate,
        transaction_type: 'OPENING_BALANCE',
        description: 'Opening Balance',
        debit: openingBalance,
        credit: 0,
        balance: runningBalance
      })
    }

    // Process all transactions
    for (const transaction of transactions) {
      let debit = 0
      let credit = 0

      if (transaction.transaction_type === 'CREDIT' || transaction.transaction_type === 'PAYMENT') {
        credit = transaction.amount || 0
        runningBalance += credit
      } else if (transaction.transaction_type === 'DEBIT' || transaction.transaction_type === 'CHARGE') {
        debit = transaction.amount || 0
        runningBalance -= debit
      } else if (transaction.transaction_type === 'REVERSAL') {
        debit = transaction.amount || 0
        runningBalance -= debit
      }

      entries.push({
        transaction_date: transaction.transaction_date,
        transaction_type: transaction.transaction_type,
        description: transaction.description || `${transaction.transaction_type} - ${transaction.reference}`,
        debit,
        credit,
        balance: runningBalance
      })
    }

    return entries
  }
}

// ============================================================================
// LEDGER RECONCILER (SRP)
// ============================================================================

class LedgerReconciler implements ILedgerReconciler {
  private db: Database.Database
  private repo: StudentLedgerRepository
  private ledgerGen: LedgerGenerator

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.repo = new StudentLedgerRepository(this.db)
    this.ledgerGen = new LedgerGenerator(this.db)
  }

  async reconcileStudentLedger(studentId: number, periodStart: string, periodEnd: string): Promise<ReconciliationResult> {
    // Get ledger balance
    const ledgerEntries = await this.ledgerGen.generateStudentLedger(studentId, periodStart, periodEnd)
    const ledgerBalance = ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1].balance : 0

    // Get invoice balance
    const invoices = await this.repo.getInvoicesForPeriod(studentId, periodStart, periodEnd)
    const invoiceBalance = invoices.reduce((sum: number, inv: unknown) => sum + (inv.amount || 0), 0)

    const difference = Math.abs(ledgerBalance - invoiceBalance)
    const isBalanced = difference < 1 // Allow for rounding

    const discrepancies: any[] = []

    // Identify discrepancies
    if (!isBalanced) {
      discrepancies.push({
        type: 'BALANCE_MISMATCH',
        ledger_balance: ledgerBalance,
        invoice_balance: invoiceBalance,
        difference
      })
    }

    return {
      reconciled: isBalanced,
      ledger_balance: ledgerBalance,
      invoice_balance: invoiceBalance,
      difference,
      status: isBalanced ? 'BALANCED' : 'OUT_OF_BALANCE',
      discrepancies
    }
  }
}

// ============================================================================
// LEDGER VALIDATOR (SRP)
// ============================================================================

class LedgerValidator implements ILedgerValidator {
  private db: Database.Database
  private repo: StudentLedgerRepository
  private balanceCalc: OpeningBalanceCalculator

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.repo = new StudentLedgerRepository(this.db)
    this.balanceCalc = new OpeningBalanceCalculator(this.db)
  }

  async verifyOpeningBalance(studentId: number, periodStart: string): Promise<VerificationResult> {
    // Calculate opening balance
    const calculatedBalance = await this.balanceCalc.calculateOpeningBalance(studentId, periodStart)

    // Get recorded opening balance
    const recordedBalance = await this.repo.getRecordedOpeningBalance(studentId, periodStart)

    // If no recorded balance, this is first time - verify it
    if (recordedBalance === null) {
      await this.repo.recordOpeningBalance(studentId, periodStart, calculatedBalance)
      return {
        verified: true,
        opening_balance: calculatedBalance,
        verification_status: 'VERIFIED'
      }
    }

    // Compare calculated vs recorded
    const difference = Math.abs(calculatedBalance - recordedBalance)
    const isVerified = difference < 1 // Allow for rounding

    return {
      verified: isVerified,
      opening_balance: calculatedBalance,
      verification_status: isVerified ? 'VERIFIED' : 'DISCREPANCY'
    }
  }
}

// ============================================================================
// FACADE - SOLID-COMPLIANT SERVICE
// ============================================================================

export class StudentLedgerService
  implements IOpeningBalanceCalculator, ILedgerGenerator, ILedgerReconciler, ILedgerValidator
{
  // Composed services
  private db: Database.Database
  private readonly balanceCalculator: OpeningBalanceCalculator
  private readonly ledgerGenerator: LedgerGenerator
  private readonly reconciler: LedgerReconciler
  private readonly validator: LedgerValidator

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.balanceCalculator = new OpeningBalanceCalculator(this.db)
    this.ledgerGenerator = new LedgerGenerator(this.db)
    this.reconciler = new LedgerReconciler(this.db)
    this.validator = new LedgerValidator(this.db)
  }

  /**
   * Generate complete student ledger for period
   */
  async generateStudentLedger(studentId: number, startDate: string, endDate: string): Promise<LedgerEntry[]> {
    const entries = await this.ledgerGenerator.generateStudentLedger(studentId, startDate, endDate)

    logAudit(
      0,
      'GENERATE_LEDGER',
      'ledger_transaction',
      studentId,
      null,
      { period_start: startDate, period_end: endDate, entry_count: entries.length }
    )

    return entries
  }

  /**
   * Calculate opening balance for student as of date
   */
  async calculateOpeningBalance(studentId: number, beforeDate: string): Promise<number> {
    return this.balanceCalculator.calculateOpeningBalance(studentId, beforeDate)
  }

  /**
   * Get student's current balance
   */
  async getStudentCurrentBalance(studentId: number): Promise<number> {
    const today = new Date().toISOString().split('T')[0]
    const entries = await this.ledgerGenerator.generateStudentLedger(studentId, '1900-01-01', today)
    return entries.length > 0 ? entries[entries.length - 1].balance : 0
  }

  /**
   * Record opening balance for verification
   */
  async recordOpeningBalance(studentId: number, periodStart: string, openingBalance: number): Promise<number> {
    const repo = new StudentLedgerRepository(this.db)
    return repo.recordOpeningBalance(studentId, periodStart, openingBalance)
  }

  /**
   * Verify opening balance matches calculation
   */
  async verifyOpeningBalance(studentId: number, periodStart: string): Promise<VerificationResult> {
    return this.validator.verifyOpeningBalance(studentId, periodStart)
  }

  /**
   * Reconcile ledger with invoices
   */
  async reconcileStudentLedger(studentId: number, periodStart: string, periodEnd: string): Promise<ReconciliationResult> {
    return this.reconciler.reconcileStudentLedger(studentId, periodStart, periodEnd)
  }

  /**
   * Generate complete period-end audit report
   */
  async generateLedgerAuditReport(studentId: number, periodStart: string, periodEnd: string): Promise<unknown> {
    const ledger = await this.generateStudentLedger(studentId, periodStart, periodEnd)
    const reconciliation = await this.reconcileStudentLedger(studentId, periodStart, periodEnd)
    const verification = await this.verifyOpeningBalance(studentId, periodStart)

    return {
      student_id: studentId,
      period_start: periodStart,
      period_end: periodEnd,
      ledger_entries: ledger,
      reconciliation_status: reconciliation,
      verification_status: verification,
      audit_status: reconciliation.reconciled && verification.verified ? 'PASSED' : 'FAILED'
    }
  }
}

