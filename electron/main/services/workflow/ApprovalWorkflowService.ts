import { getDatabase } from '../../database'

import type Database from 'better-sqlite3'

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

interface CreateApprovalRequestRecordInput {
  requestType: string
  entityType: string
  entityId: number
  amount: number
  description: string
  requestedBy: number
  now: string
}

interface AuditEntryInput {
  userId: number
  actionType: string
  tableName: string
  recordId: number
  timestamp: string
  newValues?: Record<string, unknown>
}

interface UpdateApprovalLevelInput {
  decision: 'APPROVED' | 'REJECTED'
  requestId: number
  level: number
  approverId: number
  now: string
  comments?: string
}

// ============================================================================
// APPROVAL WORKFLOW SERVICE
// ============================================================================

export class ApprovalWorkflowService {
  private readonly db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  private normalizeCreateParams(params: {
    requestType?: string
    request_type?: string
    entityType?: string
    entity_type?: string
    entityId?: number
    entity_id?: number
    amount: number
    description: string
    requestedBy?: number
    requested_by?: number
  }): {
    requestType?: string
    entityType?: string
    entityId?: number
    requestedBy?: number
    amount: number
    description: string
  } {
    return {
      requestType: params.requestType ?? params.request_type,
      entityType: params.entityType ?? params.entity_type,
      entityId: params.entityId ?? params.entity_id,
      requestedBy: params.requestedBy ?? params.requested_by,
      amount: params.amount,
      description: params.description
    }
  }

  private getMatchingConfigs(requestType: string, amount: number): ApprovalConfiguration[] {
    const configs = this.db
      .prepare(
        `SELECT * FROM approval_configuration
         WHERE request_type = ? AND is_active = 1
         ORDER BY min_amount DESC`
      )
      .all(requestType) as ApprovalConfiguration[]

    return configs
      .filter((config) => amount >= config.min_amount && (config.max_amount === null || amount <= config.max_amount))
      .sort((a, b) => a.required_level - b.required_level)
  }

  private createApprovalRequestRecord(data: CreateApprovalRequestRecordInput): number {
    const { requestType, entityType, entityId, amount, description, requestedBy, now } = data

    const result = this.db
      .prepare(
        `INSERT INTO approval_request
         (request_type, entity_type, entity_id, amount, description, requested_by, requested_at, status, current_level)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(requestType, entityType, entityId, amount, description, requestedBy, now, 'PENDING', 1)

    return result.lastInsertRowid as number
  }

  private createApprovalLevels(requestId: number, maxLevel: number): void {
    for (let level = 1; level <= maxLevel; level += 1) {
      this.db
        .prepare(
          `INSERT INTO approval_level (request_id, level, status)
           VALUES (?, ?, ?)`
        )
        .run(requestId, level, 'PENDING')
    }
  }

  private writeAuditEntry(args: AuditEntryInput): void {
    const { userId, actionType, tableName, recordId, timestamp, newValues } = args

    this.db
      .prepare(
        `INSERT INTO audit_log (user_id, action_type, table_name, record_id, new_values, timestamp)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(userId, actionType, tableName, recordId, newValues ? JSON.stringify(newValues) : null, timestamp)
  }

  /**
   * Create an approval request
   */
  createApprovalRequest(params: {
    requestType?: string
    request_type?: string
    entityType?: string
    entity_type?: string
    entityId?: number
    entity_id?: number
    amount: number
    description: string
    requestedBy?: number
    requested_by?: number
  }): {
    success: boolean
    message: string
    requestId?: number
    requiredLevel?: number
  } {
    try {
      const normalized = this.normalizeCreateParams(params)
      const { requestType, entityType, entityId, requestedBy, amount, description } = normalized

      if (!requestType || !entityType || entityId === undefined || requestedBy === undefined) {
        return {
          success: false,
          message: 'Missing required approval request fields'
        }
      }

      const matchingConfigs = this.getMatchingConfigs(requestType, amount)
      if (matchingConfigs.length === 0) {
        return {
          success: false,
          message: `No approval configuration found for amount: ${amount}`
        }
      }

      const maxLevel = matchingConfigs[matchingConfigs.length - 1].required_level
      const now = new Date().toISOString()
      const requestId = this.createApprovalRequestRecord({
        requestType,
        entityType,
        entityId,
        amount,
        description,
        requestedBy,
        now
      })

      this.createApprovalLevels(requestId, maxLevel)
      this.writeAuditEntry({
        userId: requestedBy,
        actionType: 'CREATE_APPROVAL_REQUEST',
        tableName: 'approval_request',
        recordId: requestId,
        timestamp: now,
        newValues: {
          request_type: requestType,
          amount,
          required_level: maxLevel
        }
      })

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

  private getApprovalContext(
    requestId: number,
    level: number
  ): { request?: ApprovalRequest; approvalLevel?: ApprovalLevel; message?: string } {
    const request = this.db
      .prepare('SELECT * FROM approval_request WHERE id = ?')
      .get(requestId) as ApprovalRequest | undefined

    if (!request) {
      return {
        message: `Approval request not found: ${requestId}`
      }
    }

    const approvalLevel = this.db
      .prepare('SELECT * FROM approval_level WHERE request_id = ? AND level = ?')
      .get(requestId, level) as ApprovalLevel | undefined

    if (!approvalLevel) {
      return {
        message: `Approval level ${level} not found for request ${requestId}`
      }
    }

    if (request.current_level !== level) {
      return {
        message: `Request is not at the current approval level (current: ${request.current_level}, attempted: ${level})`
      }
    }

    return { request, approvalLevel }
  }

  private updateApprovalLevel(args: UpdateApprovalLevelInput): void {
    const { decision, requestId, level, approverId, now, comments } = args

    this.db
      .prepare(
        `UPDATE approval_level
         SET status = ?, approver_id = ?, decided_at = ?, comments = ?
         WHERE request_id = ? AND level = ?`
      )
      .run(decision, approverId, now, comments || null, requestId, level)
  }

  private resolveMaxLevel(requestId: number): number {
    const row = this.db
      .prepare('SELECT MAX(level) as max_level FROM approval_level WHERE request_id = ?')
      .get(requestId) as { max_level: number }

    return row.max_level
  }

  private finalizeApprovalRequest(requestId: number, status: 'APPROVED' | 'REJECTED', now: string): void {
    this.db
      .prepare(
        `UPDATE approval_request
         SET status = ?, final_decision = ?, completed_at = ?
         WHERE id = ?`
      )
      .run(status, status, now, requestId)
  }

  private advanceApprovalLevel(requestId: number, nextLevel: number): void {
    this.db
      .prepare('UPDATE approval_request SET current_level = ? WHERE id = ?')
      .run(nextLevel, requestId)
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
      const context = this.getApprovalContext(requestId, level)
      if (context.message) {
        return {
          success: false,
          message: context.message
        }
      }

      const now = new Date().toISOString()
      this.updateApprovalLevel({ decision, requestId, level, approverId, now, comments })

      if (decision === 'REJECTED') {
        this.finalizeApprovalRequest(requestId, 'REJECTED', now)
        this.writeAuditEntry({
          userId: approverId,
          actionType: `REJECT_LEVEL_${level}`,
          tableName: 'approval_request',
          recordId: requestId,
          timestamp: now
        })

        return {
          success: true,
          message: `Request rejected at level ${level}`
        }
      }

      const maxLevel = this.resolveMaxLevel(requestId)
      const finalApproval = level === maxLevel
      if (finalApproval) {
        this.finalizeApprovalRequest(requestId, 'APPROVED', now)
      } else {
        this.advanceApprovalLevel(requestId, level + 1)
      }

      this.writeAuditEntry({
        userId: approverId,
        actionType: `APPROVE_LEVEL_${level}`,
        tableName: 'approval_request',
        recordId: requestId,
        timestamp: now
      })

      return {
        success: true,
        message: finalApproval
          ? `Request fully approved by level ${level}`
          : `Level ${level} approved - request advanced to Level ${level + 1}`
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

  // --------------------------------------------------------------------------
  // Backward-compatible wrappers for legacy test usage
  // --------------------------------------------------------------------------

  approveRequest(requestId: number, level: number, comments: string, approverId: number): {
    success: boolean
    message: string
  } {
    return this.processApproval({
      requestId,
      level,
      decision: 'APPROVED',
      approverId,
      comments
    })
  }

  rejectRequest(requestId: number, level: number, comments: string, approverId: number): {
    success: boolean
    message: string
  } {
    return this.processApproval({
      requestId,
      level,
      decision: 'REJECTED',
      approverId,
      comments
    })
  }

  getRequestHistory(requestId: number): ApprovalHistoryResult {
    return this.getApprovalHistory(requestId)
  }

  getPendingRequests(level = 1, requestType?: string): ApprovalRequest[] {
    return this.getApprovalQueue(level, requestType)
  }
}
