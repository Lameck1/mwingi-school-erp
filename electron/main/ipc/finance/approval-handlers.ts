import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'
import { ipcMain } from '../../electron-env'

import type { IpcMainInvokeEvent } from 'electron'

type ApprovalRecord = {
  journal_entry_id: number
  status: string
}

export function registerFinanceApprovalHandlers(): void {
  const db = getDatabase()
  registerApprovalQueueHandler(db)
  registerApproveHandler(db)
  registerRejectHandler(db)
  registerApprovalStatsHandler(db)
}

function registerApprovalQueueHandler(db: ReturnType<typeof getDatabase>): void {
  ipcMain.handle('approvals:getQueue', async (_event: IpcMainInvokeEvent, filter: 'PENDING' | 'ALL' = 'PENDING') => {
    try {
      const whereClause = filter === 'PENDING' ? "AND ta.status = 'PENDING'" : ''
      const approvals = db.prepare(`
        SELECT
          ta.id,
          ta.journal_entry_id,
          je.entry_ref,
          je.entry_type,
          je.description,
          ta.requested_at,
          ta.status,
          ta.review_notes,
          ta.reviewed_at,
          ar.rule_name,
          u_req.username as requested_by_name,
          u_rev.username as reviewed_by_name,
          s.first_name || ' ' || s.last_name as student_name,
          COALESCE(SUM(jel.debit_amount), 0) as amount
        FROM transaction_approval ta
        JOIN journal_entry je ON ta.journal_entry_id = je.id
        JOIN approval_rule ar ON ta.approval_rule_id = ar.id
        JOIN user u_req ON ta.requested_by_user_id = u_req.id
        LEFT JOIN user u_rev ON ta.reviewed_by_user_id = u_rev.id
        LEFT JOIN student s ON je.student_id = s.id
        LEFT JOIN journal_entry_line jel ON je.id = jel.journal_entry_id
        WHERE 1=1 ${whereClause}
        GROUP BY ta.id
        ORDER BY ta.requested_at DESC
      `).all()

      return { success: true, data: approvals }
    } catch (error) {
      return { success: false, message: `Failed to get approval queue: ${(error as Error).message}` }
    }
  })
}

function registerApproveHandler(db: ReturnType<typeof getDatabase>): void {
  ipcMain.handle('approvals:approve', async (_event: IpcMainInvokeEvent, approvalId: number, reviewNotes: string, reviewerUserId: number) => {
    try {
      return db.transaction(() => {
        const approval = db.prepare(`
          SELECT ta.*, je.id as journal_entry_id
          FROM transaction_approval ta
          JOIN journal_entry je ON ta.journal_entry_id = je.id
          WHERE ta.id = ? AND ta.status = 'PENDING'
        `).get(approvalId) as ApprovalRecord | undefined

        if (!approval) {
          return { success: false, message: 'Approval request not found or already processed' }
        }

        db.prepare(`
          UPDATE transaction_approval
          SET
            status = 'APPROVED',
            reviewed_by_user_id = ?,
            reviewed_at = CURRENT_TIMESTAMP,
            review_notes = ?
          WHERE id = ?
        `).run(reviewerUserId, reviewNotes, approvalId)

        db.prepare(`
          UPDATE journal_entry
          SET
            approval_status = 'APPROVED',
            approved_by_user_id = ?,
            approved_at = CURRENT_TIMESTAMP,
            is_posted = 1,
            posted_by_user_id = ?,
            posted_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(reviewerUserId, reviewerUserId, approval.journal_entry_id)

        logAudit(reviewerUserId, 'APPROVE', 'transaction_approval', approvalId, null, {
          journal_entry_id: approval.journal_entry_id,
          review_notes: reviewNotes,
        })

        return { success: true, message: 'Transaction approved successfully' }
      })()
    } catch (error) {
      return { success: false, message: `Failed to approve transaction: ${(error as Error).message}` }
    }
  })
}

function registerRejectHandler(db: ReturnType<typeof getDatabase>): void {
  ipcMain.handle('approvals:reject', async (_event: IpcMainInvokeEvent, approvalId: number, reviewNotes: string, reviewerUserId: number) => {
    try {
      if (!reviewNotes) {
        return { success: false, message: 'Review notes are required for rejection' }
      }

      return db.transaction(() => {
        const approval = db.prepare(`
          SELECT ta.*, je.id as journal_entry_id
          FROM transaction_approval ta
          JOIN journal_entry je ON ta.journal_entry_id = je.id
          WHERE ta.id = ? AND ta.status = 'PENDING'
        `).get(approvalId) as ApprovalRecord | undefined

        if (!approval) {
          return { success: false, message: 'Approval request not found or already processed' }
        }

        db.prepare(`
          UPDATE transaction_approval
          SET
            status = 'REJECTED',
            reviewed_by_user_id = ?,
            reviewed_at = CURRENT_TIMESTAMP,
            review_notes = ?
          WHERE id = ?
        `).run(reviewerUserId, reviewNotes, approvalId)

        db.prepare(`
          UPDATE journal_entry
          SET
            approval_status = 'REJECTED',
            approved_by_user_id = ?,
            approved_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(reviewerUserId, approval.journal_entry_id)

        db.prepare(`
          UPDATE journal_entry
          SET
            is_voided = 1,
            voided_reason = ?,
            voided_by_user_id = ?,
            voided_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(`Rejected: ${reviewNotes}`, reviewerUserId, approval.journal_entry_id)

        logAudit(reviewerUserId, 'REJECT', 'transaction_approval', approvalId, null, {
          journal_entry_id: approval.journal_entry_id,
          review_notes: reviewNotes,
        })

        return { success: true, message: 'Transaction rejected successfully' }
      })()
    } catch (error) {
      return { success: false, message: `Failed to reject transaction: ${(error as Error).message}` }
    }
  })
}

function registerApprovalStatsHandler(db: ReturnType<typeof getDatabase>): void {
  ipcMain.handle('approvals:getStats', async () => {
    try {
      const stats = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as approved,
          SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) as rejected
        FROM transaction_approval
      `).get()

      return { success: true, data: stats }
    } catch (error) {
      return { success: false, message: `Failed to get approval statistics: ${(error as Error).message}` }
    }
  })
}
