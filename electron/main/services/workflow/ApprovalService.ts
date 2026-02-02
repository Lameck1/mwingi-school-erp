import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

export interface ApprovalRequest {
    id: number
    workflow_id: number
    entity_type: string
    entity_id: number
    current_step: number
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
    requested_by_user_id: number
    final_approver_user_id: number | null
    completed_at: string | null
    created_at: string
    // Computed fields
    workflow_name?: string
    requester_name?: string
    approver_name?: string
    entity_description?: string
}

export interface ApprovalWorkflow {
    id: number
    workflow_name: string
    entity_type: string
    is_active: boolean
    created_at: string
}

export class ApprovalService {
    private get db() { return getDatabase() }

    // ===== WORKFLOWS =====

    async getWorkflows(): Promise<ApprovalWorkflow[]> {
        return this.db.prepare(`
      SELECT * FROM approval_workflow WHERE is_active = 1 ORDER BY workflow_name
    `).all() as ApprovalWorkflow[]
    }

    async getWorkflowByEntityType(entityType: string): Promise<ApprovalWorkflow | null> {
        return this.db.prepare(`
      SELECT * FROM approval_workflow WHERE entity_type = ? AND is_active = 1
    `).get(entityType) as ApprovalWorkflow | null
    }

    // ===== APPROVAL REQUESTS =====

    async getPendingApprovals(userId?: number): Promise<ApprovalRequest[]> {
        const query = `
      SELECT ar.*, 
             aw.workflow_name,
             u1.full_name as requester_name,
             u2.full_name as approver_name,
             CASE 
               WHEN ar.entity_type = 'BUDGET' THEN (SELECT budget_name FROM budget WHERE id = ar.entity_id)
               WHEN ar.entity_type = 'EXPENSE' THEN (SELECT description FROM ledger_transaction WHERE id = ar.entity_id)
               ELSE 'Unknown'
             END as entity_description
      FROM approval_request ar
      LEFT JOIN approval_workflow aw ON ar.workflow_id = aw.id
      LEFT JOIN user u1 ON ar.requested_by_user_id = u1.id
      LEFT JOIN user u2 ON ar.final_approver_user_id = u2.id
      WHERE ar.status = 'PENDING'
    `

        return this.db.prepare(query + ' ORDER BY ar.created_at DESC').all() as ApprovalRequest[]
    }

    async getAllApprovals(filters?: { status?: string; entity_type?: string }): Promise<ApprovalRequest[]> {
        let query = `
      SELECT ar.*, 
             aw.workflow_name,
             u1.full_name as requester_name,
             u2.full_name as approver_name,
             CASE 
               WHEN ar.entity_type = 'BUDGET' THEN (SELECT budget_name FROM budget WHERE id = ar.entity_id)
               WHEN ar.entity_type = 'EXPENSE' THEN (SELECT description FROM ledger_transaction WHERE id = ar.entity_id)
               ELSE 'Unknown'
             END as entity_description
      FROM approval_request ar
      LEFT JOIN approval_workflow aw ON ar.workflow_id = aw.id
      LEFT JOIN user u1 ON ar.requested_by_user_id = u1.id
      LEFT JOIN user u2 ON ar.final_approver_user_id = u2.id
      WHERE 1=1
    `

        const params: unknown[] = []

        if (filters?.status) {
            query += ' AND ar.status = ?'
            params.push(filters.status)
        }

        if (filters?.entity_type) {
            query += ' AND ar.entity_type = ?'
            params.push(filters.entity_type)
        }

        return this.db.prepare(query + ' ORDER BY ar.created_at DESC').all(...params) as ApprovalRequest[]
    }

    async createApprovalRequest(
        entityType: string,
        entityId: number,
        requestedByUserId: number
    ): Promise<{ success: boolean; id?: number; errors?: string[] }> {
        try {
            // Find workflow for this entity type
            const workflow = await this.getWorkflowByEntityType(entityType)

            if (!workflow) {
                // No workflow defined, auto-approve
                return { success: true, id: 0 }
            }

            // Check if request already exists
            const existing = this.db.prepare(`
        SELECT id FROM approval_request 
        WHERE entity_type = ? AND entity_id = ? AND status = 'PENDING'
      `).get(entityType, entityId)

            if (existing) {
                return { success: false, errors: ['An approval request is already pending for this item'] }
            }

            const result = this.db.prepare(`
        INSERT INTO approval_request (workflow_id, entity_type, entity_id, requested_by_user_id, status)
        VALUES (?, ?, ?, ?, 'PENDING')
      `).run(workflow.id, entityType, entityId, requestedByUserId)

            logAudit(requestedByUserId, 'CREATE', 'approval_request', result.lastInsertRowid as number, null, {
                workflow_id: workflow.id,
                entity_type: entityType,
                entity_id: entityId
            })

            return { success: true, id: result.lastInsertRowid as number }
        } catch (error) {
            return { success: false, errors: [error instanceof Error ? error.message : 'Unknown error'] }
        }
    }

    async approve(requestId: number, approverId: number): Promise<{ success: boolean; errors?: string[] }> {
        try {
            const request = this.db.prepare(`SELECT * FROM approval_request WHERE id = ?`).get(requestId) as ApprovalRequest | null

            if (!request) {
                return { success: false, errors: ['Approval request not found'] }
            }

            if (request.status !== 'PENDING') {
                return { success: false, errors: ['This request has already been processed'] }
            }

            // Update the approval request
            this.db.prepare(`
        UPDATE approval_request 
        SET status = 'APPROVED', 
            final_approver_user_id = ?,
            completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(approverId, requestId)

            // Update the related entity based on type
            if (request.entity_type === 'BUDGET') {
                this.db.prepare(`
          UPDATE budget SET status = 'APPROVED', approved_by_user_id = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(approverId, request.entity_id)
            }

            logAudit(approverId, 'APPROVE', 'approval_request', requestId, { status: 'PENDING' }, { status: 'APPROVED' })

            return { success: true }
        } catch (error) {
            return { success: false, errors: [error instanceof Error ? error.message : 'Unknown error'] }
        }
    }

    async reject(requestId: number, approverId: number, reason: string): Promise<{ success: boolean; errors?: string[] }> {
        try {
            const request = this.db.prepare(`SELECT * FROM approval_request WHERE id = ?`).get(requestId) as ApprovalRequest | null

            if (!request) {
                return { success: false, errors: ['Approval request not found'] }
            }

            if (request.status !== 'PENDING') {
                return { success: false, errors: ['This request has already been processed'] }
            }

            // Update the approval request
            this.db.prepare(`
        UPDATE approval_request 
        SET status = 'REJECTED', 
            final_approver_user_id = ?,
            completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(approverId, requestId)

            // Update the related entity
            if (request.entity_type === 'BUDGET') {
                this.db.prepare(`
          UPDATE budget SET status = 'REJECTED', notes = COALESCE(notes, '') || '\n\nRejection: ' || ? WHERE id = ?
        `).run(reason, request.entity_id)
            }

            logAudit(approverId, 'REJECT', 'approval_request', requestId, { status: 'PENDING' }, { status: 'REJECTED', reason })

            return { success: true }
        } catch (error) {
            return { success: false, errors: [error instanceof Error ? error.message : 'Unknown error'] }
        }
    }

    async cancel(requestId: number, userId: number): Promise<{ success: boolean; errors?: string[] }> {
        try {
            const request = this.db.prepare(`SELECT * FROM approval_request WHERE id = ?`).get(requestId) as ApprovalRequest | null

            if (!request) {
                return { success: false, errors: ['Approval request not found'] }
            }

            if (request.status !== 'PENDING') {
                return { success: false, errors: ['Only pending requests can be cancelled'] }
            }

            if (request.requested_by_user_id !== userId) {
                return { success: false, errors: ['Only the requester can cancel this request'] }
            }

            this.db.prepare(`
        UPDATE approval_request SET status = 'CANCELLED', completed_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(requestId)

            // Revert entity to draft if budget
            if (request.entity_type === 'BUDGET') {
                this.db.prepare(`UPDATE budget SET status = 'DRAFT' WHERE id = ?`).run(request.entity_id)
            }

            logAudit(userId, 'CANCEL', 'approval_request', requestId, { status: 'PENDING' }, { status: 'CANCELLED' })

            return { success: true }
        } catch (error) {
            return { success: false, errors: [error instanceof Error ? error.message : 'Unknown error'] }
        }
    }

    // Get counts for dashboard
    async getApprovalCounts(): Promise<{ pending: number; approved: number; rejected: number }> {
        const result = this.db.prepare(`
      SELECT 
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) as rejected
      FROM approval_request
    `).get() as { pending: number; approved: number; rejected: number }

        return {
            pending: result.pending || 0,
            approved: result.approved || 0,
            rejected: result.rejected || 0
        }
    }
}
