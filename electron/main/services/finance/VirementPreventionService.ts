
import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

import type Database from 'better-sqlite3'

// ============================================================================
// TYPES
// ============================================================================

type JssAccountType = 'TUITION' | 'OPERATIONS' | 'INFRASTRUCTURE'

interface VirementValidationResult {
    readonly allowed: boolean
    readonly reason?: string
    readonly from_account: JssAccountType
    readonly to_account: JssAccountType
}

interface VirementRequest {
    readonly id: number
    readonly from_account_type: JssAccountType
    readonly to_account_type: JssAccountType
    readonly amount: number
    readonly reason: string
    readonly status: 'PENDING' | 'APPROVED' | 'REJECTED'
    readonly requested_by_user_id: number
    readonly reviewed_by_user_id: number | null
    readonly created_at: string
}

interface AccountSummary {
    readonly account_type: JssAccountType
    readonly total_invoiced: number
    readonly total_collected: number
    readonly total_expenditure: number
    readonly balance: number
}

// ============================================================================
// SERVICE
// ============================================================================

class VirementPreventionService {
    private readonly db: Database.Database

    constructor(db?: Database.Database) {
        this.db = db || getDatabase()
    }

    /**
     * Validate whether an expenditure from a specific fee category violates JSS segregation rules.
     *
     * An expenditure is invalid if funded from a different JSS account than
     * the account the expense category belongs to.
     *
     * @param expenseAccountType - The JSS account type the expense belongs to
     * @param fundingCategoryId - The fee category being used to fund the expense
     */
    validateExpenditure(
        expenseAccountType: JssAccountType,
        fundingCategoryId: number
    ): VirementValidationResult {
        const fundingCategory = this.db.prepare(
            'SELECT jss_account_type FROM fee_category WHERE id = ?'
        ).get(fundingCategoryId) as { jss_account_type: JssAccountType | null } | undefined

        if (!fundingCategory || !fundingCategory.jss_account_type) {
            // Category not classified — allow (fail open for uncategorized items)
            return {
                allowed: true,
                from_account: expenseAccountType,
                to_account: expenseAccountType
            }
        }

        if (fundingCategory.jss_account_type === expenseAccountType) {
            return {
                allowed: true,
                from_account: fundingCategory.jss_account_type,
                to_account: expenseAccountType
            }
        }

        return {
            allowed: false,
            reason: `Virement blocked: Cannot use ${fundingCategory.jss_account_type} funds for ${expenseAccountType} expenses. Cross-account transfers require Principal approval.`,
            from_account: fundingCategory.jss_account_type,
            to_account: expenseAccountType
        }
    }

    /**
     * Submit a virement request for principal approval.
     */
    requestVirement(
        fromAccount: JssAccountType,
        toAccount: JssAccountType,
        amount: number,
        reason: string,
        userId: number
    ): { success: boolean; id?: number; error?: string } {
        if (fromAccount === toAccount) {
            return { success: false, error: 'Source and destination accounts must differ' }
        }
        if (amount <= 0) {
            return { success: false, error: 'Amount must be positive' }
        }

        const result = this.db.prepare(`
      INSERT INTO jss_virement_request (from_account_type, to_account_type, amount, reason, requested_by_user_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(fromAccount, toAccount, amount, reason.trim(), userId)

        const id = result.lastInsertRowid as number
        logAudit(userId, 'CREATE', 'jss_virement_request', id, null, {
            from_account_type: fromAccount,
            to_account_type: toAccount,
            amount
        })

        return { success: true, id }
    }

    /**
     * Approve or reject a virement request.
     * Only PRINCIPAL or ADMIN roles should reach this method (enforced at IPC layer).
     */
    reviewVirement(
        requestId: number,
        decision: 'APPROVED' | 'REJECTED',
        reviewNotes: string,
        reviewerId: number
    ): { success: boolean; error?: string } {
        const request = this.db.prepare(
            'SELECT * FROM jss_virement_request WHERE id = ?'
        ).get(requestId) as VirementRequest | undefined

        if (!request) {
            return { success: false, error: 'Virement request not found' }
        }
        if (request.status !== 'PENDING') {
            return { success: false, error: `Request already ${request.status.toLowerCase()}` }
        }

        this.db.prepare(`
      UPDATE jss_virement_request
      SET status = ?, reviewed_by_user_id = ?, reviewed_at = CURRENT_TIMESTAMP, review_notes = ?
      WHERE id = ?
    `).run(decision, reviewerId, reviewNotes.trim(), requestId)

        logAudit(reviewerId, 'UPDATE', 'jss_virement_request', requestId,
            { status: 'PENDING' },
            { status: decision, review_notes: reviewNotes }
        )

        return { success: true }
    }

    /**
     * Get pending virement requests for principal review.
     */
    getPendingRequests(): VirementRequest[] {
        return this.db.prepare(
            "SELECT * FROM jss_virement_request WHERE status = 'PENDING' ORDER BY created_at ASC"
        ).all() as VirementRequest[]
    }

    /**
     * Get per-JSS-account summary (invoiced vs collected vs expenditure).
     */
    getAccountSummaries(): AccountSummary[] {
        return this.db.prepare(`
      SELECT
        fc.jss_account_type as account_type,
        COALESCE(SUM(ii.amount), 0) as total_invoiced,
        COALESCE(SUM(pia_totals.total_paid), 0) as total_collected,
        0 as total_expenditure,
        COALESCE(SUM(pia_totals.total_paid), 0) as balance
      FROM fee_category fc
      LEFT JOIN invoice_item ii ON ii.fee_category_id = fc.id
      LEFT JOIN (
        SELECT invoice_item_id, SUM(applied_amount) as total_paid
        FROM payment_item_allocation
        GROUP BY invoice_item_id
      ) pia_totals ON pia_totals.invoice_item_id = ii.id
      WHERE fc.jss_account_type IS NOT NULL
      GROUP BY fc.jss_account_type
      ORDER BY fc.jss_account_type
    `).all() as AccountSummary[]
    }
}

export { VirementPreventionService }
export type { JssAccountType, VirementValidationResult, VirementRequest, AccountSummary }
