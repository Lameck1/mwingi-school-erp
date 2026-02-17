import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'
import {
  buildFeeInvoiceActiveStatusPredicate,
  buildFeeInvoiceAmountSql,
  buildFeeInvoiceOutstandingBalanceSql,
  buildFeeInvoicePaidAmountSql
} from '../../utils/feeInvoiceSql'
import { DoubleEntryJournalService } from '../accounting/DoubleEntryJournalService'

import type Database from 'better-sqlite3'

// ============================================================================
// SEGREGATED INTERFACES (ISP)
// ============================================================================

export interface ICreditAllocator {
  allocateCreditsToInvoices(studentId: number, userId: number): Promise<AllocationResult>
}

export interface ICreditBalanceTracker {
  getStudentCreditBalance(studentId: number): Promise<number>
  getCreditTransactions(studentId: number, limit?: number): Promise<CreditTransaction[]>
}

export interface ICreditAllocationStrategy {
  determineAllocationOrder(invoices: OutstandingInvoice[]): OutstandingInvoice[]
}

export interface OutstandingInvoice {
  id: number
  student_id: number
  amount: number
  amount_paid: number
  balance: number
  due_date: string
  invoice_date: string
  invoice_number: string
  description: string
  days_overdue: number
}

export interface CreditTransaction {
  id: number
  student_id: number
  amount: number
  transaction_type: 'CREDIT_RECEIVED' | 'CREDIT_APPLIED' | 'CREDIT_REFUNDED'
  reference_invoice_id: number | null
  notes: string
  created_at: string
}

interface LegacyInvoiceRow {
  amount_due: number
  amount_paid: number
  id: number
  invoice_number: string | null
  status: string | null
}

export interface AllocationResult {
  success: boolean
  message: string
  total_credit_applied: number
  invoices_affected: number
  allocations: Array<{
    invoice_id: number
    invoice_number: string
    amount_applied: number
    new_balance: number
  }>
}

// ============================================================================
// REPOSITORY LAYER (SRP)
// ============================================================================

class CreditRepository {
  private readonly db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  async getStudentCreditBalance(studentId: number): Promise<number> {
    const db = this.db
    const result = db.prepare(`
      SELECT COALESCE(SUM(
        CASE 
          WHEN transaction_type = 'CREDIT_RECEIVED' THEN amount
          WHEN transaction_type = 'CREDIT_APPLIED' THEN -amount
          WHEN transaction_type = 'CREDIT_REFUNDED' THEN -amount
          ELSE 0
        END
      ), 0) as balance
      FROM credit_transaction
      WHERE student_id = ?
    `).get(studentId) as { balance: number } | undefined

    return result?.balance || 0
  }

  async getCreditTransactions(studentId: number, limit?: number): Promise<CreditTransaction[]> {
    const db = this.db
    const safeLimit = typeof limit === 'number' && Number.isInteger(limit) && limit > 0
      ? Math.min(limit, 500)
      : null
    const query = safeLimit !== null
      ? `
        SELECT * FROM credit_transaction
        WHERE student_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `
      : `
        SELECT * FROM credit_transaction
        WHERE student_id = ?
        ORDER BY created_at DESC
      `
    return (safeLimit !== null
      ? db.prepare(query).all(studentId, safeLimit)
      : db.prepare(query).all(studentId)) as CreditTransaction[]
  }

  recordCreditTransaction(data: {
    student_id: number
    amount: number
    transaction_type: 'CREDIT_RECEIVED' | 'CREDIT_APPLIED' | 'CREDIT_REFUNDED'
    reference_invoice_id?: number
    notes: string
  }): number {
    const db = this.db
    const result = db.prepare(`
      INSERT INTO credit_transaction (student_id, amount, transaction_type, reference_invoice_id, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      data.student_id,
      data.amount,
      data.transaction_type,
      data.reference_invoice_id || null,
      data.notes
    )

    return result.lastInsertRowid as number
  }
}

class InvoiceRepository {
  private readonly db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  async getOutstandingInvoices(studentId: number): Promise<OutstandingInvoice[]> {
    const db = this.db
    const amountSql = buildFeeInvoiceAmountSql(db, 'fi')
    const paidAmountSql = buildFeeInvoicePaidAmountSql(db, 'fi')
    const outstandingBalanceSql = buildFeeInvoiceOutstandingBalanceSql(db, 'fi')
    const activeStatusPredicate = buildFeeInvoiceActiveStatusPredicate(db, 'fi')
    return db.prepare(`
      SELECT 
        fi.id,
        fi.student_id,
        ${amountSql} as amount,
        ${paidAmountSql} as amount_paid,
        ${outstandingBalanceSql} as balance,
        fi.due_date,
        fi.invoice_date,
        fi.invoice_number,
        fi.description,
        CAST(julianday('now') - julianday(fi.due_date) AS INTEGER) as days_overdue
      FROM fee_invoice fi
      WHERE fi.student_id = ?
        AND ${activeStatusPredicate}
        AND (${outstandingBalanceSql}) > 0
      ORDER BY fi.due_date ASC
    `).all(studentId) as OutstandingInvoice[]
  }

  updateInvoicePayment(invoiceId: number, amountToAdd: number): void {
    const db = this.db
    const invoiceAmountSql = buildFeeInvoiceAmountSql(db, 'fee_invoice')
    db.prepare(`
      UPDATE fee_invoice
      SET amount_paid = COALESCE(amount_paid, 0) + ?,
          status = CASE
            WHEN COALESCE(amount_paid, 0) + ? >= ${invoiceAmountSql} THEN 'PAID'
            WHEN COALESCE(amount_paid, 0) + ? > 0 THEN 'PARTIAL'
            ELSE 'PENDING'
          END,
          updated_at = ?
      WHERE id = ?
    `).run(amountToAdd, amountToAdd, amountToAdd, new Date().toISOString(), invoiceId)
  }
}

// ============================================================================
// BUSINESS LOGIC LAYER (SRP + Strategy Pattern)
// ============================================================================

/**
 * Determines allocation order using oldest-first (FIFO) strategy
 * Prioritizes overdue invoices first, then by due date
 */
class FIFOAllocationStrategy implements ICreditAllocationStrategy {
  determineAllocationOrder(invoices: OutstandingInvoice[]): OutstandingInvoice[] {
    return [...invoices].sort((a, b) => {
      // First priority: overdue invoices
      if (a.days_overdue > 0 && b.days_overdue <= 0) {return -1}
      if (b.days_overdue > 0 && a.days_overdue <= 0) {return 1}

      // Second priority: by due date (oldest first)
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    })
  }
}

class CreditAllocator implements ICreditAllocator {
  private readonly db: Database.Database

  constructor(
    private readonly creditRepo: CreditRepository,
    private readonly invoiceRepo: InvoiceRepository,
    private readonly allocationStrategy: ICreditAllocationStrategy,
    db?: Database.Database
  ) {
    this.db = db || getDatabase()
  }

  async allocateCreditsToInvoices(studentId: number, userId: number): Promise<AllocationResult> {
    const db = this.db

    try {
      // Get available credit balance
      const creditBalance = await this.creditRepo.getStudentCreditBalance(studentId)

      if (creditBalance <= 0) {
        return {
          success: false,
          message: 'No credit balance available for allocation',
          total_credit_applied: 0,
          invoices_affected: 0,
          allocations: []
        }
      }

      // Get outstanding invoices
      const outstandingInvoices = await this.invoiceRepo.getOutstandingInvoices(studentId)

      if (outstandingInvoices.length === 0) {
        return {
          success: false,
          message: 'No outstanding invoices to apply credit to',
          total_credit_applied: 0,
          invoices_affected: 0,
          allocations: []
        }
      }

      // Apply allocation strategy to determine order
      const sortedInvoices = this.allocationStrategy.determineAllocationOrder(outstandingInvoices)

      // Allocate credits
      let remainingCredit = creditBalance
      const allocations: AllocationResult['allocations'] = []

      const transaction = db.transaction(() => {
        for (const invoice of sortedInvoices) {
          if (remainingCredit <= 0) {break}

          const amountToApply = Math.min(remainingCredit, invoice.balance)

          // Update invoice payment
          this.invoiceRepo.updateInvoicePayment(invoice.id, amountToApply)

          // Record credit transaction
          this.creditRepo.recordCreditTransaction({
            student_id: studentId,
            amount: amountToApply,
            transaction_type: 'CREDIT_APPLIED',
            reference_invoice_id: invoice.id,
            notes: `Auto-applied to invoice ${invoice.invoice_number}`
          })

          allocations.push({
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            amount_applied: amountToApply,
            new_balance: invoice.balance - amountToApply
          })

          remainingCredit -= amountToApply

          // Audit log
          logAudit(
            userId,
            'CREDIT_AUTO_APPLY',
            'fee_invoice',
            invoice.id,
            { amount_paid: invoice.amount_paid },
            { amount_paid: invoice.amount_paid + amountToApply }
          )
        }
      })

      transaction()

      const totalApplied = creditBalance - remainingCredit

      // GL journal entry: Debit Accounts Receivable, Credit Student Credit
      if (totalApplied > 0) {
        const journalService = new DoubleEntryJournalService(db)
        journalService.createJournalEntrySync({
          entry_date: new Date().toISOString().split('T')[0] ?? '',
          entry_type: 'CREDIT_APPLICATION',
          description: `Credit auto-applied for student #${studentId}: ${totalApplied.toFixed(2)} KES to ${allocations.length} invoice(s)`,
          created_by_user_id: userId,
          lines: [
            {
              gl_account_code: '1300',
              debit_amount: totalApplied,
              credit_amount: 0,
              description: 'Accounts receivable - credit applied'
            },
            {
              gl_account_code: '2100',
              debit_amount: 0,
              credit_amount: totalApplied,
              description: 'Student credit balance applied'
            }
          ]
        })
      }

      // Overall audit log
      logAudit(
        userId,
        'CREDIT_ALLOCATION',
        'credit_transaction',
        studentId,
        null,
        { total_applied: totalApplied, invoices_count: allocations.length }
      )

      return {
        success: true,
        message: `Successfully applied ${totalApplied.toFixed(2)} KES to ${allocations.length} invoice(s)`,
        total_credit_applied: totalApplied,
        invoices_affected: allocations.length,
        allocations
      }

    } catch (error) {
      throw new Error(`Failed to allocate credits: ${(error as Error).message}`)
    }
  }
}

class CreditBalanceTracker implements ICreditBalanceTracker {
  constructor(private readonly creditRepo: CreditRepository) {}

  async getStudentCreditBalance(studentId: number): Promise<number> {
    return this.creditRepo.getStudentCreditBalance(studentId)
  }

  async getCreditTransactions(studentId: number, limit?: number): Promise<CreditTransaction[]> {
    return this.creditRepo.getCreditTransactions(studentId, limit)
  }
}

// ============================================================================
// FACADE SERVICE (Composition, DIP)
// ============================================================================

export class CreditAutoApplicationService implements ICreditAllocator, ICreditBalanceTracker {
  private readonly db: Database.Database
  private readonly allocator: CreditAllocator
  private readonly balanceTracker: CreditBalanceTracker

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    const creditRepo = new CreditRepository(this.db)
    const invoiceRepo = new InvoiceRepository(this.db)
    const strategy = new FIFOAllocationStrategy()

    this.allocator = new CreditAllocator(creditRepo, invoiceRepo, strategy, this.db)
    this.balanceTracker = new CreditBalanceTracker(creditRepo)
  }

  /**
   * Automatically allocate student credits to outstanding invoices
   * Uses FIFO strategy: oldest/overdue invoices first
   */
  async allocateCreditsToInvoices(studentId: number, userId: number): Promise<AllocationResult> {
    return this.allocator.allocateCreditsToInvoices(studentId, userId)
  }

  /**
   * Get current credit balance for student
   */
  async getStudentCreditBalance(studentId: number): Promise<number> {
    return this.balanceTracker.getStudentCreditBalance(studentId)
  }

  /**
   * Get credit transaction history
   */
  async getCreditTransactions(studentId: number, limit?: number): Promise<CreditTransaction[]> {
    return this.balanceTracker.getCreditTransactions(studentId, limit)
  }

  /**
   * Manually add credit to student account (e.g., overpayment, refund)
   */
  async addCreditToStudent(studentId: number, amount: number, notes: string, userId: number): Promise<{ success: boolean; error?: string; message?: string; credit_id?: number }> {
    try {
      const creditRepo = new CreditRepository(this.db)
      const creditId = creditRepo.recordCreditTransaction({
        student_id: studentId,
        amount,
        transaction_type: 'CREDIT_RECEIVED',
        notes
      })

      logAudit(
        userId,
        'CREDIT_ADD',
        'credit_transaction',
        creditId,
        null,
        { student_id: studentId, amount, notes }
      )

      return {
        success: true,
        message: `Credit of ${amount.toFixed(2)} KES added successfully`,
        credit_id: creditId
      }
    } catch (error) {
      throw new Error(`Failed to add credit: ${(error as Error).message}`)
    }
  }

  /**
   * Auto-apply credits (synchronous wrapper for allocateCreditsToInvoices)
   */
  autoApplyCredits(studentId: number, userId?: number): { success: boolean; error?: string; message?: string; credits_applied?: number; remaining_credit?: number; invoices_affected?: number } {
    try {
      const creditResult = this.db.prepare(`
        SELECT COALESCE(SUM(
          CASE
            WHEN transaction_type = 'CREDIT_RECEIVED' THEN amount
            WHEN transaction_type = 'CREDIT_APPLIED' THEN -amount
            WHEN transaction_type = 'CREDIT_REFUNDED' THEN -amount
            ELSE 0
          END
        ), 0) as balance
        FROM credit_transaction
        WHERE student_id = ?
      `).get(studentId) as { balance: number } | undefined

      const creditBalance = creditResult?.balance ?? 0

      if (creditBalance === 0) {
        return { success: true, message: 'No credits to apply', credits_applied: 0 }
      }

      const invoiceAmountSql = buildFeeInvoiceAmountSql(this.db, 'fi')
      const paidAmountSql = buildFeeInvoicePaidAmountSql(this.db, 'fi')
      const outstandingBalanceSql = buildFeeInvoiceOutstandingBalanceSql(this.db, 'fi')
      const activeStatusPredicate = buildFeeInvoiceActiveStatusPredicate(this.db, 'fi')
      const invoices = this.db.prepare(`
        SELECT
          fi.id,
          ${invoiceAmountSql} as amount_due,
          ${paidAmountSql} as amount_paid,
          fi.invoice_number,
          fi.status
        FROM fee_invoice fi
        WHERE fi.student_id = ?
          AND ${activeStatusPredicate}
          AND (${outstandingBalanceSql}) > 0
        ORDER BY fi.due_date ASC, fi.id ASC
      `).all(studentId) as LegacyInvoiceRow[]

      const applyTransaction = this.db.transaction(() => {
        let remainingCredit = creditBalance
        let applicationsCount = 0

        for (const invoice of invoices) {
          if (remainingCredit <= 0) { break }

          const amountDue = Math.max(0, invoice.amount_due - invoice.amount_paid)
          if (amountDue <= 0) { continue }

          const applicationAmount = Math.min(remainingCredit, amountDue)
          const newAmountPaid = invoice.amount_paid + applicationAmount
          const nextStatus = newAmountPaid >= invoice.amount_due
            ? 'PAID'
            : newAmountPaid > 0
              ? 'PARTIAL'
              : (invoice.status === 'OUTSTANDING' ? 'OUTSTANDING' : 'PENDING')

          this.db.prepare(`
            UPDATE fee_invoice
            SET amount_paid = ?,
                status = ?,
                updated_at = ?
            WHERE id = ?
          `).run(newAmountPaid, nextStatus, new Date().toISOString(), invoice.id)

          this.db.prepare(`
            INSERT INTO credit_transaction (student_id, amount, transaction_type, reference_invoice_id, notes)
            VALUES (?, ?, 'CREDIT_APPLIED', ?, ?)
          `).run(
            studentId,
            applicationAmount,
            invoice.id,
            `Auto-applied to invoice ${invoice.invoice_number ?? invoice.id}`
          )

          remainingCredit -= applicationAmount
          applicationsCount++

          logAudit(
            userId || 0,
            'CREDIT_APPLY',
            'fee_invoice',
            invoice.id,
            null,
            { student_id: studentId, amount_applied: applicationAmount, status: nextStatus }
          )
        }

        return { remainingCredit, applicationsCount }
      })

      const { remainingCredit, applicationsCount } = applyTransaction()

      return {
        success: true,
        message: `Credits applied to ${applicationsCount} invoice(s)`,
        credits_applied: creditBalance - remainingCredit,
        remaining_credit: remainingCredit,
        invoices_affected: applicationsCount
      }
    } catch (error) {
      return { success: false, error: `Failed to apply credits: ${(error as Error).message}` }
    }
  }

  /**
   * Add a manual credit
   */
  addCredit(studentId: number, amount: number, notes?: string, userId?: number): { success: boolean; error?: string; message?: string; credit_id?: number } {
    if (!Number.isFinite(amount) || amount <= 0) {
      return { success: false, error: 'Credit amount must be positive' }
    }

    try {
      const creditId = this.db.prepare(
        'INSERT INTO credit_transaction (student_id, amount, transaction_type, notes, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(studentId, amount, 'CREDIT_RECEIVED', notes?.trim() || 'Manual credit adjustment', new Date().toISOString()).lastInsertRowid

      logAudit(
        userId || 0,
        'CREDIT_ADD',
        'credit_transaction',
        Number(creditId),
        null,
        { student_id: studentId, amount, notes }
      )

      return {
        success: true,
        message: `Credit of ${amount.toFixed(2)} KES added successfully`,
        credit_id: Number(creditId)
      }
    } catch (error) {
      return { success: false, error: `Failed to add credit: ${(error as Error).message}` }
    }
  }

  /**
   * Reverse a credit transaction
   */
  reverseCredit(creditId: number, reason?: string, userId?: number): { success: boolean; error?: string; message?: string; credit_id?: number } {
    try {
      const credit = this.db.prepare('SELECT * FROM credit_transaction WHERE id = ?').get(creditId) as CreditTransaction | undefined

      if (!credit) {
        return { success: false, error: 'Credit transaction not found' }
      }

      if (credit.transaction_type !== 'CREDIT_RECEIVED') {
        return { success: false, error: 'Only received credits can be reversed' }
      }

      const reverseResult = this.db.prepare(`
        INSERT INTO credit_transaction (student_id, amount, transaction_type, reference_invoice_id, notes)
        VALUES (?, ?, 'CREDIT_REFUNDED', ?, ?)
      `).run(
        credit.student_id,
        credit.amount,
        credit.reference_invoice_id ?? null,
        `Reversal of credit #${creditId}: ${reason?.trim() || 'No reason provided'}`
      )

      logAudit(
        userId || 0,
        'CREDIT_REVERSE',
        'credit_transaction',
        reverseResult.lastInsertRowid as number,
        credit,
        { reason }
      )

      return {
        success: true,
        message: `Credit transaction reversed`,
        credit_id: reverseResult.lastInsertRowid as number
      }
    } catch (error) {
      return { success: false, error: `Failed to reverse credit: ${(error as Error).message}` }
    }
  }

  /**
   * Get credit balance (synchronous)
   */
  getCreditBalance(studentId: number): number {
    const result = this.db.prepare(
      `SELECT COALESCE(SUM(
        CASE
          WHEN transaction_type = 'CREDIT_RECEIVED' THEN amount
          WHEN transaction_type = 'CREDIT_APPLIED' THEN -amount
          WHEN transaction_type = 'CREDIT_REFUNDED' THEN -amount
          ELSE 0
        END
      ), 0) as total
      FROM credit_transaction
      WHERE student_id = ?`
    ).get(studentId) as { total: number } | undefined
    
    return result?.total || 0
  }

  /**
   * Get credit transactions synchronously
   */
  /**
   * Retrieve credit transactions history
   */
  getTransactions(studentId: number): CreditTransaction[] {
    return this.db.prepare(
      'SELECT * FROM credit_transaction WHERE student_id = ? ORDER BY created_at DESC'
    ).all(studentId) as CreditTransaction[]
  }
}
