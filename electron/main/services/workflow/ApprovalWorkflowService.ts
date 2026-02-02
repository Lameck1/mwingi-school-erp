import Database from 'better-sqlite3-multiple-ciphers'
import { getDatabase } from '../../database'

// ============================================================================
// INTERFACES
// ============================================================================

export interface ApprovalRequest {
  id: number
  request_type: string
  entity_type: string
  entity_id: number
  amount: number
  description: string
  requested_by: number
  requested_at: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  current_level: number
  final_decision: string | null
  completed_at: string | null
}

export interface ApprovalLevel {
  id: number
  request_id: number
  level: number
  approver_id: number | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  comments: string | null
  decided_at: string | null
}

export interface ApprovalConfiguration {
  id: number
  request_type: string
  min_amount: number
  max_amount: number | null
  required_level: number
  approver_role: string
  is_active: boolean
}

export interface ApprovalHistoryResult {
  request: ApprovalRequest
  levels: ApprovalLevel[]
}

// ============================================================================
// APPROVAL WORKFLOW SERVICE
// ============================================================================

export class ApprovalWorkflowService {
  private db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  /**
   * Create an approval request
   */
  createApprovalRequest(params: {
    requestType: string
    entityType: string
    entityId: number
    amount: number
    description: string
    requestedBy: number
  }): {
    success: boolean
    message: string
    requestId?: number
    requiredLevel?: number
  } {
    try {
      const { requestType, entityType, entityId, amount, description, requestedBy } = params

      // Get all applicable approval configurations for this request type
      const configs = this.db
        .prepare(
          `SELECT * FROM approval_configuration 
           WHERE request_type = ? AND is_active = 1 
           ORDER BY min_amount DESC`
        )
        .all(requestType) as ApprovalConfiguration[]

      if (configs.length === 0) {
        return {
          success: false,
          message: `No approval configuration found for request type: ${requestType}`
        }
      }

      // Find the matching configuration based on amount
      let matchingConfigs = configs.filter((c) => {
        const amountInRange =
          amount >= c.min_amount && (c.max_amount === null || amount <= c.max_amount)
        return amountInRange
      })

      if (matchingConfigs.length === 0) {
        return {
          success: false,
          message: `No approval configuration found for amount: ${amount}`
        }
      }

      // Sort by required_level to get all levels needed
      matchingConfigs = matchingConfigs.sort((a, b) => a.required_level - b.required_level)
      const maxLevel = matchingConfigs[matchingConfigs.length - 1].required_level

      // Create approval request
      const now = new Date().toISOString()
      const result = this.db
        .prepare(
          `INSERT INTO approval_request 
           (request_type, entity_type, entity_id, amount, description, requested_by, requested_at, status, current_level)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(requestType, entityType, entityId, amount, description, requestedBy, now, 'PENDING', 1)

      const requestId = result.lastInsertRowid as number

      // Create approval level records
      for (let level = 1; level <= maxLevel; level++) {
        this.db
          .prepare(
            `INSERT INTO approval_level (request_id, level, status)
             VALUES (?, ?, ?)`
          )
          .run(requestId, level, 'PENDING')
      }

      // Log audit trail
      this.db
        .prepare(
          `INSERT INTO audit_log (user_id, action_type, table_name, record_id, new_values, timestamp)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          requestedBy,
          'CREATE_APPROVAL_REQUEST',
          'approval_request',
          requestId,
          JSON.stringify({
            request_type: requestType,
            amount,
            required_level: maxLevel
          }),
          now
        )

      return {
        success: true,
        message: `Approval request created - requires Level ${maxLevel} approval`,
        requestId,
        requiredLevel: maxLevel
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to create approval request: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Process approval decision (approve or reject)
   */
  processApproval(params: {
    requestId: number
    level: number
    decision: 'APPROVED' | 'REJECTED'
    approverId: number
    comments?: string
  }): {
    success: boolean
    message: string
  } {
    try {
      const { requestId, level, decision, approverId, comments } = params

      // Get the approval request
      const request = this.db
        .prepare('SELECT * FROM approval_request WHERE id = ?')
        .get(requestId) as ApprovalRequest | undefined

      if (!request) {
        return {
          success: false,
          message: `Approval request not found: ${requestId}`
        }
      }

      // Get the approval level record
      const approvalLevel = this.db
        .prepare('SELECT * FROM approval_level WHERE request_id = ? AND level = ?')
        .get(requestId, level) as ApprovalLevel | undefined

      if (!approvalLevel) {
        return {
          success: false,
          message: `Approval level ${level} not found for request ${requestId}`
        }
      }

      // Check if we're at the current level
      if (request.current_level !== level) {
        return {
          success: false,
          message: `Request is not at the current approval level (current: ${request.current_level}, attempted: ${level})`
        }
      }

      const now = new Date().toISOString()

      if (decision === 'APPROVED') {
        // Update approval level
        this.db
          .prepare(
            `UPDATE approval_level 
             SET status = ?, approver_id = ?, decided_at = ?, comments = ?
             WHERE request_id = ? AND level = ?`
          )
          .run('APPROVED', approverId, now, comments || null, requestId, level)

        // Get max level to check if this is the final approval
        const maxLevel = (
          this.db
            .prepare('SELECT MAX(level) as max_level FROM approval_level WHERE request_id = ?')
            .get(requestId) as { max_level: number }
        ).max_level

        if (level === maxLevel) {
          // Final approval - mark request as fully approved
          this.db
            .prepare(
              `UPDATE approval_request 
               SET status = ?, final_decision = ?, completed_at = ?
               WHERE id = ?`
            )
            .run('APPROVED', 'APPROVED', now, requestId)

          // Log audit
          this.db
            .prepare(
              `INSERT INTO audit_log (user_id, action_type, table_name, record_id, timestamp)
               VALUES (?, ?, ?, ?, ?)`
            )
            .run(approverId, 'APPROVE_LEVEL_' + level, 'approval_request', requestId, now)

          return {
            success: true,
            message: `Request fully approved by level ${level}`
          }
        } else {
          // Advance to next level
          this.db
            .prepare('UPDATE approval_request SET current_level = ? WHERE id = ?')
            .run(level + 1, requestId)

          // Log audit
          this.db
            .prepare(
              `INSERT INTO audit_log (user_id, action_type, table_name, record_id, timestamp)
               VALUES (?, ?, ?, ?, ?)`
            )
            .run(approverId, 'APPROVE_LEVEL_' + level, 'approval_request', requestId, now)

          return {
            success: true,
            message: `Level ${level} approved - request advanced to Level ${level + 1}`
          }
        }
      } else {
        // Reject the request
        this.db
          .prepare(
            `UPDATE approval_level 
             SET status = ?, approver_id = ?, decided_at = ?, comments = ?
             WHERE request_id = ? AND level = ?`
          )
          .run('REJECTED', approverId, now, comments || null, requestId, level)

        this.db
          .prepare(
            `UPDATE approval_request 
             SET status = ?, final_decision = ?, completed_at = ?
             WHERE id = ?`
          )
          .run('REJECTED', 'REJECTED', now, requestId)

        // Log audit
        this.db
          .prepare(
            `INSERT INTO audit_log (user_id, action_type, table_name, record_id, timestamp)
             VALUES (?, ?, ?, ?, ?)`
          )
          .run(approverId, 'REJECT_LEVEL_' + level, 'approval_request', requestId, now)

        return {
          success: true,
          message: `Request rejected at level ${level}`
        }
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to process approval: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * Get approval queue for a specific level
   */
  getApprovalQueue(level: number, requestType?: string): ApprovalRequest[] {
    try {
      let query = `
        SELECT DISTINCT ar.* FROM approval_request ar
        WHERE ar.current_level = ? AND ar.status = 'PENDING'
      `
      const params: unknown[] = [level]

      if (requestType) {
        query += ` AND ar.request_type = ?`
        params.push(requestType)
      }

      query += ` ORDER BY ar.requested_at DESC`

      return this.db.prepare(query).all(...params) as ApprovalRequest[]
    } catch (error) {
      console.error('Failed to get approval queue:', error)
      return []
    }
  }

  /**
   * Get complete approval history for a request
   */
  getApprovalHistory(requestId: number): ApprovalHistoryResult {
    try {
      const request = this.db
        .prepare('SELECT * FROM approval_request WHERE id = ?')
        .get(requestId) as ApprovalRequest

      const levels = this.db
        .prepare('SELECT * FROM approval_level WHERE request_id = ? ORDER BY level ASC')
        .all(requestId) as ApprovalLevel[]

      return {
        request,
        levels
      }
    } catch (error) {
      throw new Error(`Failed to get approval history: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
