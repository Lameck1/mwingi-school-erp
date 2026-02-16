import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'
import { safeHandleRawWithRole, ROLES, resolveActorId } from '../ipc-result'

type ApprovalRecord = {
  id: number
  entity_id: number
  status: string
}

function tableExists(db: ReturnType<typeof getDatabase>, tableName: string): boolean {
  const row = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName) as { name: string } | undefined
  return Boolean(row?.name)
}

function columnExists(db: ReturnType<typeof getDatabase>, tableName: string, columnName: string): boolean {
  if (!tableExists(db, tableName)) {
    return false
  }

  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
  return columns.some((column) => column.name === columnName)
}

export function registerFinanceApprovalHandlers(): void {
  const db = getDatabase()
  registerApprovalQueueHandler(db)
  registerApproveHandler(db)
  registerRejectHandler(db)
  registerApprovalStatsHandler(db)
}

function registerApprovalQueueHandler(db: ReturnType<typeof getDatabase>): void {
  safeHandleRawWithRole('approvals:getQueue', ROLES.FINANCE, (_event, filter: 'PENDING' | 'ALL' = 'PENDING') => {
    try {
      const whereClause = filter === 'PENDING' ? "AND ar.status = 'PENDING'" : ''
      const hasWorkflowTable = tableExists(db, 'approval_workflow')
      const hasRuleColumn = columnExists(db, 'approval_request', 'approval_rule_id')
      const hasRuleTable = tableExists(db, 'approval_rule')
      const hasHistoryTable = tableExists(db, 'approval_history')
      const workflowJoin = hasWorkflowTable ? 'LEFT JOIN approval_workflow aw ON ar.workflow_id = aw.id' : ''
      const ruleJoin = hasRuleColumn && hasRuleTable ? 'LEFT JOIN approval_rule apr ON ar.approval_rule_id = apr.id' : ''
      const historyJoin = hasHistoryTable ? `
        LEFT JOIN approval_history latest ON latest.id = (
          SELECT ah.id
          FROM approval_history ah
          WHERE ah.approval_request_id = ar.id
            AND ah.action IN ('APPROVED', 'REJECTED')
          ORDER BY ah.action_at DESC, ah.id DESC
          LIMIT 1
        )` : ''
      const ruleExpr = hasRuleColumn && hasRuleTable
        ? hasWorkflowTable
          ? "COALESCE(apr.rule_name, aw.workflow_name, 'Workflow approval')"
          : "COALESCE(apr.rule_name, 'Workflow approval')"
        : hasWorkflowTable
          ? "COALESCE(aw.workflow_name, 'Workflow approval')"
          : "'Workflow approval'"
      const reviewNotesExpr = hasHistoryTable ? 'latest.notes' : 'NULL'

      const approvals = db.prepare(`
        SELECT
          ar.id,
          ar.entity_id as journal_entry_id,
          je.entry_ref,
          je.entry_type,
          je.description,
          ar.created_at as requested_at,
          ar.status,
          ${reviewNotesExpr} as review_notes,
          ar.completed_at as reviewed_at,
          ${ruleExpr} as rule_name,
          u_req.username as requested_by_name,
          u_rev.username as reviewed_by_name,
          s.first_name || ' ' || s.last_name as student_name,
          COALESCE(SUM(jel.debit_amount), 0) as amount
        FROM approval_request ar
        JOIN journal_entry je ON ar.entity_id = je.id AND ar.entity_type = 'JOURNAL_ENTRY'
        ${workflowJoin}
        ${ruleJoin}
        LEFT JOIN user u_req ON ar.requested_by_user_id = u_req.id
        LEFT JOIN user u_rev ON ar.final_approver_user_id = u_rev.id
        LEFT JOIN student s ON je.student_id = s.id
        LEFT JOIN journal_entry_line jel ON je.id = jel.journal_entry_id
        ${historyJoin}
        WHERE ar.entity_type = 'JOURNAL_ENTRY' ${whereClause}
        GROUP BY ar.id
        ORDER BY ar.created_at DESC
      `).all()

      return { success: true, data: approvals }
    } catch (error) {
      return { success: false, error: `Failed to get approval queue: ${(error as Error).message}` }
    }
  })
}

function registerApproveHandler(db: ReturnType<typeof getDatabase>): void {
  safeHandleRawWithRole('approvals:approve', ROLES.MANAGEMENT, (event, approvalId: number, reviewNotes: string, legacyReviewerUserId?: number) => {
    const actor = resolveActorId(event, legacyReviewerUserId)
    if (!actor.success) {
      return { success: false, error: actor.error }
    }
    const reviewerUserId = actor.actorId

    try {
      return db.transaction(() => {
        const approval = db.prepare(`
          SELECT ar.id, ar.entity_id, ar.status
          FROM approval_request ar
          WHERE ar.id = ?
            AND ar.entity_type = 'JOURNAL_ENTRY'
            AND ar.status = 'PENDING'
        `).get(approvalId) as ApprovalRecord | undefined

        if (!approval) {
          return { success: false, error: 'Approval request not found or already processed' }
        }

        db.prepare(`
          UPDATE approval_request
          SET
            status = 'APPROVED',
            final_approver_user_id = ?,
            completed_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(reviewerUserId, approvalId)

        if (tableExists(db, 'approval_history')) {
          db.prepare(`
            INSERT INTO approval_history (
              approval_request_id, action, action_by, previous_status, new_status, notes
            ) VALUES (?, 'APPROVED', ?, 'PENDING', 'APPROVED', ?)
          `).run(approvalId, reviewerUserId, reviewNotes || null)
        }

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
        `).run(reviewerUserId, reviewerUserId, approval.entity_id)

        logAudit(reviewerUserId, 'APPROVE', 'approval_request', approvalId, null, {
          journal_entry_id: approval.entity_id,
          review_notes: reviewNotes,
        })

        return { success: true, message: 'Transaction approved successfully' }
      })()
    } catch (error) {
      return { success: false, error: `Failed to approve transaction: ${(error as Error).message}` }
    }
  })
}

function registerRejectHandler(db: ReturnType<typeof getDatabase>): void {
  safeHandleRawWithRole('approvals:reject', ROLES.MANAGEMENT, (event, approvalId: number, reviewNotes: string, legacyReviewerUserId?: number) => {
    const actor = resolveActorId(event, legacyReviewerUserId)
    if (!actor.success) {
      return { success: false, error: actor.error }
    }
    const reviewerUserId = actor.actorId

    try {
      if (!reviewNotes) {
        return { success: false, error: 'Review notes are required for rejection' }
      }

      return db.transaction(() => {
        const approval = db.prepare(`
          SELECT ar.id, ar.entity_id, ar.status
          FROM approval_request ar
          WHERE ar.id = ?
            AND ar.entity_type = 'JOURNAL_ENTRY'
            AND ar.status = 'PENDING'
        `).get(approvalId) as ApprovalRecord | undefined

        if (!approval) {
          return { success: false, error: 'Approval request not found or already processed' }
        }

        db.prepare(`
          UPDATE approval_request
          SET
            status = 'REJECTED',
            final_approver_user_id = ?,
            completed_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(reviewerUserId, approvalId)

        if (tableExists(db, 'approval_history')) {
          db.prepare(`
            INSERT INTO approval_history (
              approval_request_id, action, action_by, previous_status, new_status, notes
            ) VALUES (?, 'REJECTED', ?, 'PENDING', 'REJECTED', ?)
          `).run(approvalId, reviewerUserId, reviewNotes)
        }

        db.prepare(`
          UPDATE journal_entry
          SET
            approval_status = 'REJECTED',
            approved_by_user_id = ?,
            approved_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(reviewerUserId, approval.entity_id)

        db.prepare(`
          UPDATE journal_entry
          SET
            is_voided = 1,
            voided_reason = ?,
            voided_by_user_id = ?,
            voided_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(`Rejected: ${reviewNotes}`, reviewerUserId, approval.entity_id)

        logAudit(reviewerUserId, 'REJECT', 'approval_request', approvalId, null, {
          journal_entry_id: approval.entity_id,
          review_notes: reviewNotes,
        })

        return { success: true, message: 'Transaction rejected successfully' }
      })()
    } catch (error) {
      return { success: false, error: `Failed to reject transaction: ${(error as Error).message}` }
    }
  })
}

function registerApprovalStatsHandler(db: ReturnType<typeof getDatabase>): void {
  safeHandleRawWithRole('approvals:getStats', ROLES.FINANCE, () => {
    try {
      const stats = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as approved,
          SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) as rejected
        FROM approval_request
        WHERE entity_type = 'JOURNAL_ENTRY'
      `).get()

      return { success: true, data: stats }
    } catch (error) {
      return { success: false, error: `Failed to get approval statistics: ${(error as Error).message}` }
    }
  })
}
