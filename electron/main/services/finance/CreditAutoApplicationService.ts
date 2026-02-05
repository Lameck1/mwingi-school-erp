import Database from 'better-sqlite3'
import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

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
  private db: Database.Database

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
    const query = `
      SELECT * FROM credit_transaction
      WHERE student_id = ?
      ORDER BY created_at DESC
      ${limit ? `LIMIT ${limit}` : ''}
    `
    return db.prepare(query).all(studentId) as CreditTransaction[]
  }

  async recordCreditTransaction(data: {
    student_id: number
    amount: number
    transaction_type: 'CREDIT_RECEIVED' | 'CREDIT_APPLIED' | 'CREDIT_REFUNDED'
    reference_invoice_id?: number
    notes: string
  }): Promise<number> {
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
  private db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  async getOutstandingInvoices(studentId: number): Promise<OutstandingInvoice[]> {
    const db = this.db
    return db.prepare(`
      SELECT 
        id,
        student_id,
        amount,
        amount_paid,
        (amount - amount_paid) as balance,
        due_date,
        invoice_date,
        invoice_number,
        description,
        CAST(julianday('now') - julianday(due_date) AS INTEGER) as days_overdue
      FROM fee_invoice
      WHERE student_id = ? AND (amount - amount_paid) > 0
      ORDER BY due_date ASC
    `).all(studentId) as OutstandingInvoice[]
  }

  async updateInvoicePayment(invoiceId: number, amountToAdd: number): Promise<void> {
    const db = this.db
    db.prepare(`
      UPDATE fee_invoice
      SET amount_paid = amount_paid + ?,
          updated_at = ?
      WHERE id = ?
    `).run(amountToAdd, new Date().toISOString(), invoiceId)
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
      if (a.days_overdue > 0 && b.days_overdue <= 0) return -1
      if (b.days_overdue > 0 && a.days_overdue <= 0) return 1

      // Second priority: by due date (oldest first)
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    })
  }
}

class CreditAllocator implements ICreditAllocator {
  private db: Database.Database

  constructor(
    private creditRepo: CreditRepository,
    private invoiceRepo: InvoiceRepository,
    private allocationStrategy: ICreditAllocationStrategy,
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
          if (remainingCredit <= 0) break

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
  constructor(private creditRepo: CreditRepository) {}

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
  private db: Database.Database
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
  async addCreditToStudent(studentId: number, amount: number, notes: string, userId: number): Promise<{ success: boolean; message: string; credit_id: number }> {
    try {
      const creditRepo = new CreditRepository(this.db)
      const creditId = await creditRepo.recordCreditTransaction({
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
  autoApplyCredits(studentId: number, userId?: number): { success: boolean; message: string; credits_applied?: number; remaining_credit?: number; invoices_affected?: number } {
    try {
      const creditRepo = new CreditRepository(this.db)
      const invoiceRepo = new InvoiceRepository(this.db)

      // Get student's credit balance
      const creditResult = this.db.prepare(
        'SELECT amount FROM credit_transaction WHERE student_id = ? ORDER BY created_at DESC LIMIT 1'
      ).get(studentId) as { amount: number } | undefined

      const creditBalance = creditResult?.amount || 0

      if (creditBalance === 0) {
        return { success: true, message: 'No credits to apply', credits_applied: 0 }
      }

      // Get outstanding invoices sorted by priority (due date, oldest first)
      const invoices = this.db.prepare(`
        SELECT id, amount as amount_due, amount_paid, due_date 
        FROM fee_invoice 
        WHERE student_id = ? AND (amount_paid < amount OR status = 'OUTSTANDING')
        ORDER BY due_date ASC, id ASC
      `).all(studentId) as { id: number, amount_due: number, amount_paid: number, due_date: string }[]

      let remainingCredit = creditBalance
      let applicationsCount = 0

      for (const invoice of invoices) {
        if (remainingCredit === 0) break

        const amountDue = invoice.amount_due - invoice.amount_paid
        const applicationAmount = Math.min(remainingCredit, amountDue)

        this.db.prepare(
          'UPDATE fee_invoice SET amount_paid = amount_paid + ? WHERE id = ?'
        ).run(applicationAmount, invoice.id)

        remainingCredit -= applicationAmount
        applicationsCount++

        // Log the credit application
        logAudit(
          userId || 0,
          'CREDIT_APPLY',
          'fee_invoice',
          invoice.id,
          null,
          { student_id: studentId, amount_applied: applicationAmount }
        )
      }

      return {
        success: true,
        message: `Credits applied to ${applicationsCount} invoice(s)`,
        credits_applied: creditBalance - remainingCredit,
        remaining_credit: remainingCredit,
        invoices_affected: applicationsCount
      }
    } catch (error) {
      return { success: false, message: `Failed to apply credits: ${(error as Error).message}` }
    }
  }

  /**
   * Add a manual credit
   */
  addCredit(studentId: number, amount: number, notes?: string, userId?: number): { success: boolean; message: string; credit_id?: number } {
    if (amount < 0) {
      return { success: false, message: 'Credit amount must be positive' }
    }

    try {
      const _creditRepo = new CreditRepository(this.db)
      const creditId = this.db.prepare(
        'INSERT INTO credit_transaction (student_id, amount, transaction_type, notes, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(studentId, amount, 'MANUAL_CREDIT', notes || '', new Date().toISOString()).lastInsertRowid

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
      return { success: false, message: `Failed to add credit: ${(error as Error).message}` }
    }
  }

  /**
   * Reverse a credit transaction
   */
  reverseCredit(creditId: number, reason?: string, userId?: number): { success: boolean; message: string; credit_id?: number } {
    try {
      const credit = this.db.prepare('SELECT * FROM credit_transaction WHERE id = ?').get(creditId) as CreditTransaction | undefined

      if (!credit) {
        return { success: false, message: 'Credit transaction not found' }
      }

      this.db.prepare(
        'UPDATE credit_transaction SET amount = 0, notes = ? WHERE id = ?'
      ).run(`Reversed - ${reason || 'No reason provided'}`, creditId)

      logAudit(
        userId || 0,
        'CREDIT_REVERSE',
        'credit_transaction',
        creditId,
        credit,
        { reason }
      )

      return {
        success: true,
        message: `Credit transaction reversed`,
        credit_id: creditId
      }
    } catch (error) {
      return { success: false, message: `Failed to reverse credit: ${(error as Error).message}` }
    }
  }

  /**
   * Get credit balance (synchronous)
   */
  getCreditBalance(studentId: number): number {
    const result = this.db.prepare(
      'SELECT SUM(amount) as total FROM credit_transaction WHERE student_id = ?'
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
