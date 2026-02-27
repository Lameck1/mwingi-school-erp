
import { getDatabase } from '../../database'

import type Database from 'better-sqlite3'

// ============================================================================
// TYPES (ISP)
// ============================================================================

interface InvoiceItemForAllocation {
    readonly id: number
    readonly fee_category_id: number
    readonly amount: number
    readonly category_name: string
    readonly priority: number
}

interface ItemAllocation {
    readonly invoice_item_id: number
    readonly category_name: string
    readonly applied_amount: number
    readonly item_total: number
}

interface VoteHeadBalance {
    readonly fee_category_id: number
    readonly category_name: string
    readonly total_charged: number
    readonly total_paid: number
    readonly outstanding: number
}

interface SpreadResult {
    readonly allocations: ReadonlyArray<{ invoice_item_id: number; applied_amount: number }>
    readonly total_applied: number
    readonly remaining: number
}

// ============================================================================
// REPOSITORY LAYER (SRP)
// ============================================================================

class VoteHeadAllocationRepository {
    private readonly db: Database.Database

    constructor(db?: Database.Database) {
        this.db = db || getDatabase()
    }

    /**
     * Get invoice items ordered by fee_category priority (ascending = highest priority first).
     */
    getInvoiceItemsForAllocation(invoiceId: number): InvoiceItemForAllocation[] {
        return this.db.prepare(`
      SELECT
        ii.id,
        ii.fee_category_id,
        ii.amount,
        fc.category_name,
        COALESCE(fc.priority, 99) as priority
      FROM invoice_item ii
      JOIN fee_category fc ON ii.fee_category_id = fc.id
      WHERE ii.invoice_id = ?
      ORDER BY COALESCE(fc.priority, 99) ASC, ii.id ASC
    `).all(invoiceId) as InvoiceItemForAllocation[]
    }

    /**
     * Get existing per-item allocations for an invoice (across all payments).
     */
    getItemAllocationsForInvoice(invoiceId: number): ItemAllocation[] {
        return this.db.prepare(`
      SELECT
        pia.invoice_item_id,
        fc.category_name,
        SUM(pia.applied_amount) as applied_amount,
        ii.amount as item_total
      FROM payment_item_allocation pia
      JOIN invoice_item ii ON pia.invoice_item_id = ii.id
      JOIN fee_category fc ON ii.fee_category_id = fc.id
      WHERE ii.invoice_id = ?
      GROUP BY pia.invoice_item_id
    `).all(invoiceId) as ItemAllocation[]
    }

    /**
     * Record a per-item payment allocation.
     */
    recordItemAllocation(
        paymentAllocationId: number,
        invoiceItemId: number,
        appliedAmount: number
    ): void {
        this.db.prepare(`
      INSERT INTO payment_item_allocation (payment_allocation_id, invoice_item_id, applied_amount)
      VALUES (?, ?, ?)
    `).run(paymentAllocationId, invoiceItemId, appliedAmount)
    }

    /**
     * Get per-vote-head balance summary for a student's invoice.
     */
    getVoteHeadBalances(invoiceId: number): VoteHeadBalance[] {
        return this.db.prepare(`
      SELECT
        ii.fee_category_id,
        fc.category_name,
        ii.amount as total_charged,
        COALESCE(allocated.total_paid, 0) as total_paid,
        MAX(0, ii.amount - COALESCE(allocated.total_paid, 0)) as outstanding
      FROM invoice_item ii
      JOIN fee_category fc ON ii.fee_category_id = fc.id
      LEFT JOIN (
        SELECT invoice_item_id, SUM(applied_amount) as total_paid
        FROM payment_item_allocation
        GROUP BY invoice_item_id
      ) allocated ON allocated.invoice_item_id = ii.id
      WHERE ii.invoice_id = ?
      ORDER BY COALESCE(fc.priority, 99) ASC, ii.id ASC
    `).all(invoiceId) as VoteHeadBalance[]
    }
}

// ============================================================================
// SERVICE LAYER (SRP)
// ============================================================================

class VoteHeadSpreadingService {
    private readonly repo: VoteHeadAllocationRepository

    constructor(db?: Database.Database) {
        this.repo = new VoteHeadAllocationRepository(db)
    }

    /**
     * Spread a payment across invoice items in priority order.
     *
     * Called immediately after a `payment_invoice_allocation` record is created.
     * Allocates money to the highest-priority (lowest priority number) items first,
     * filling each item before moving to the next.
     *
     * @param paymentAllocationId - FK into payment_invoice_allocation
     * @param invoiceId - The invoice being paid
     * @param paymentAmount - Amount (in cents) applied to this invoice
     * @returns SpreadResult with per-item allocations
     */
    spreadPaymentOverItems(
        paymentAllocationId: number,
        invoiceId: number,
        paymentAmount: number
    ): SpreadResult {
        const items = this.repo.getInvoiceItemsForAllocation(invoiceId)
        if (items.length === 0) {
            return { allocations: [], total_applied: 0, remaining: paymentAmount }
        }

        // Get existing allocations to determine what's already been paid per item
        const existingAllocations = this.repo.getItemAllocationsForInvoice(invoiceId)
        const paidByItem = new Map<number, number>()
        for (const alloc of existingAllocations) {
            paidByItem.set(alloc.invoice_item_id, alloc.applied_amount)
        }

        let remaining = paymentAmount
        const allocations: Array<{ invoice_item_id: number; applied_amount: number }> = []

        for (const item of items) {
            if (remaining <= 0) {
                break
            }

            const alreadyPaid = paidByItem.get(item.id) || 0
            const outstanding = Math.max(0, item.amount - alreadyPaid)

            if (outstanding <= 0) {
                continue
            }

            const toApply = Math.min(remaining, outstanding)
            this.repo.recordItemAllocation(paymentAllocationId, item.id, toApply)
            allocations.push({ invoice_item_id: item.id, applied_amount: toApply })
            remaining -= toApply
        }

        const totalApplied = paymentAmount - remaining
        return { allocations, total_applied: totalApplied, remaining }
    }

    /**
     * Get per-vote-head outstanding balances for an invoice.
     */
    getVoteHeadBalance(invoiceId: number): VoteHeadBalance[] {
        return this.repo.getVoteHeadBalances(invoiceId)
    }
}

export { VoteHeadSpreadingService, VoteHeadAllocationRepository }
export type { VoteHeadBalance, SpreadResult, InvoiceItemForAllocation, ItemAllocation }
