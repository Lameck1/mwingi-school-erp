import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

// ============================================================================
// INTERFACES
// ============================================================================

export interface ApprovalThreshold {
  id: number
  transaction_type: string
  level_1_threshold: number
  level_1_approver_role: string
  level_2_threshold: number
  level_2_approver_role: string
  requires_dual_approval: boolean
}

export interface ApprovalRequest {
  id: number
  transaction_type: string
  reference_id: string
  amount: number
  description: string
  requested_by: number
  status: 'PENDING' | 'APPROVED_LEVEL_1' | 'APPROVED_LEVEL_2' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  approval_level: number
  current_approver_id: number | null
  current_approver_role: string | null
  approval_1_by: number | null
  approval_1_at: string | null
  approval_2_by: number | null
  approval_2_at: string | null
  rejection_by: number | null
  rejection_at: string | null
  rejection_reason: string | null
  requested_at: string
  supporting_documents: string | null
}

export interface ApprovalHistoryEntry {
  id: number
  approval_request_id: number
  action: string
  decision_by: number
  old_status: string
  new_status: string
  notes: string | null
  ip_address: string | null
  created_at: string
}

export interface IApprovalRequestCreator {
  createApprovalRequest(data: ApprovalRequestData): Promise<ApprovalResult>
}

export interface IApprovalProcessor {
  approveLevel1(data: ApprovalDecisionData): Promise<ApprovalResult>
  approveLevel2(data: ApprovalDecisionData): Promise<ApprovalResult>
  rejectApprovalRequest(data: ApprovalDecisionData & { rejection_reason: string }): Promise<ApprovalResult>
}

export interface IApprovalQueryService {
  getPendingApprovalsForRole(role: string, limit?: number): Promise<ApprovalRequest[]>
  getApprovalRequest(id: number): Promise<ApprovalRequest | null>
  getApprovalHistory(approvalRequestId: number): Promise<ApprovalHistoryEntry[]>
  isTransactionApproved(transactionType: string, referenceId: string): Promise<boolean>
}

export interface ApprovalRequestData {
  transaction_type: string
  reference_id: string
  amount: number
  description: string
  requested_by: number
  supporting_documents?: string[]
}

export interface ApprovalResult {
  success: boolean
  message: string
  approval_request_id?: number
  requires_approval: boolean
  approval_level?: number
  next_approver_role?: string
}

export interface ApprovalDecisionData {
  approval_request_id: number
  decision: 'APPROVE' | 'REJECT'
  decision_by: number
  notes?: string
  ip_address?: string
}

// ============================================================================
// REPOSITORY LAYER (SRP)
// ============================================================================

class ApprovalRequestRepository {
  async createRequest(data: ApprovalRequestData, approvalLevel: number, nextApproverRole: string): Promise<number> {
    const db = getDatabase()
    const result = db.prepare(`
      INSERT INTO approval_request (
        transaction_type, reference_id, amount, description, requested_by,
        approval_level, current_approver_role, supporting_documents
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.transaction_type,
      data.reference_id,
      data.amount,
      data.description,
      data.requested_by,
      approvalLevel,
      nextApproverRole,
      data.supporting_documents ? JSON.stringify(data.supporting_documents) : null
    )
    return result.lastInsertRowid as number
  }

  async getRequest(id: number): Promise<ApprovalRequest | null> {
    const db = getDatabase()
    return db.prepare(`SELECT * FROM approval_request WHERE id = ?`).get(id) as ApprovalRequest | null
  }

  async updateStatus(id: number, newStatus: string, updateData: Record<string, unknown>): Promise<void> {
    const db = getDatabase()
    const setClauses: string[] = ['status = ?']
    const values: unknown[] = [newStatus]

    for (const [key, value] of Object.entries(updateData)) {
      setClauses.push(`${key} = ?`)
      values.push(value)
    }

    values.push(id)
    db.prepare(`UPDATE approval_request SET ${setClauses.join(', ')} WHERE id = ?`).run(...values)
  }

  async getPendingForRole(role: string, limit: number): Promise<ApprovalRequest[]> {
    const db = getDatabase()
    return db.prepare(`
      SELECT * FROM approval_request
      WHERE current_approver_role = ? AND status IN ('PENDING', 'APPROVED_LEVEL_1')
      ORDER BY requested_at ASC LIMIT ?
    `).all(role, limit) as ApprovalRequest[]
  }

  async getByReference(transactionType: string, referenceId: string): Promise<ApprovalRequest | null> {
    const db = getDatabase()
    return db.prepare(`
      SELECT * FROM approval_request
      WHERE transaction_type = ? AND reference_id = ?
      ORDER BY requested_at DESC LIMIT 1
    `).get(transactionType, referenceId) as ApprovalRequest | null
  }
}

class ApprovalConfigurationRepository {
  async getConfiguration(transactionType: string): Promise<ApprovalThreshold | null> {
    const db = getDatabase()
    return db.prepare(`
      SELECT * FROM approval_workflow WHERE transaction_type = ?
    `).get(transactionType) as ApprovalThreshold | null
  }

  async createApprovalHistory(approvalRequestId: number, action: string, decisionBy: number, oldStatus: string, newStatus: string, notes: string | null, ipAddress: string | null): Promise<number> {
    const db = getDatabase()
    const result = db.prepare(`
      INSERT INTO approval_history (
        approval_request_id, action, decision_by, old_status, new_status, notes, ip_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(approvalRequestId, action, decisionBy, oldStatus, newStatus, notes, ipAddress)
    return result.lastInsertRowid as number
  }

  async getApprovalHistory(approvalRequestId: number): Promise<ApprovalHistoryEntry[]> {
    const db = getDatabase()
    return db.prepare(`
      SELECT * FROM approval_history WHERE approval_request_id = ? ORDER BY created_at ASC
    `).all(approvalRequestId) as ApprovalHistoryEntry[]
  }
}

// ============================================================================
// APPROVAL LEVEL DETERMINER (SRP)
// ============================================================================

class ApprovalLevelDeterminer {
  async determineLevelForAmount(transactionType: string, amount: number, configRepo: ApprovalConfigurationRepository): Promise<{ level: number; role: string }> {
    const config = await configRepo.getConfiguration(transactionType)

    if (!config) {
      return { level: 0, role: '' }
    }

    if (amount >= config.level_2_threshold) {
      return { level: 2, role: config.level_2_approver_role }
    }

    if (amount >= config.level_1_threshold) {
      return { level: 1, role: config.level_1_approver_role }
    }

    return { level: 0, role: '' }
  }
}

// ============================================================================
// APPROVAL PROCESSOR (SRP)
// ============================================================================

class ApprovalProcessor implements IApprovalProcessor {
  constructor(
    private requestRepo: ApprovalRequestRepository,
    private configRepo: ApprovalConfigurationRepository
  ) {}

  async approveLevel1(data: ApprovalDecisionData): Promise<ApprovalResult> {
    const request = await this.requestRepo.getRequest(data.approval_request_id)

    if (!request) {
      return { success: false, message: 'Approval request not found', requires_approval: false }
    }

    if (request.status !== 'PENDING') {
      return { success: false, message: `Cannot approve - request status is ${request.status}`, requires_approval: false }
    }

    const newStatus = request.approval_level === 2 ? 'APPROVED_LEVEL_1' : 'APPROVED'

    await this.requestRepo.updateStatus(request.id, newStatus, {
      approval_1_by: data.decision_by,
      approval_1_at: new Date().toISOString(),
      current_approver_role: request.approval_level === 2 ? request.current_approver_role : null
    })

    await this.configRepo.createApprovalHistory(
      data.approval_request_id,
      'APPROVED',
      data.decision_by,
      request.status,
      newStatus,
      data.notes || null,
      data.ip_address || null
    )

    logAudit(
      data.decision_by,
      'APPROVE_L1',
      'approval_request',
      data.approval_request_id,
      { status: request.status },
      { status: newStatus }
    )

    return {
      success: true,
      message: newStatus === 'APPROVED' ? 'Transaction approved' : 'Level 1 approval completed, pending Level 2',
      approval_request_id: request.id,
      requires_approval: newStatus !== 'APPROVED'
    }
  }

  async approveLevel2(data: ApprovalDecisionData): Promise<ApprovalResult> {
    const request = await this.requestRepo.getRequest(data.approval_request_id)

    if (!request) {
      return { success: false, message: 'Approval request not found', requires_approval: false }
    }

    if (request.status !== 'APPROVED_LEVEL_1') {
      return { success: false, message: `Cannot approve Level 2 - request status is ${request.status}`, requires_approval: false }
    }

    await this.requestRepo.updateStatus(request.id, 'APPROVED', {
      approval_2_by: data.decision_by,
      approval_2_at: new Date().toISOString(),
      current_approver_role: null
    })

    await this.configRepo.createApprovalHistory(
      data.approval_request_id,
      'APPROVED',
      data.decision_by,
      request.status,
      'APPROVED',
      data.notes || null,
      data.ip_address || null
    )

    logAudit(
      data.decision_by,
      'APPROVE_L2',
      'approval_request',
      data.approval_request_id,
      { status: request.status },
      { status: 'APPROVED' }
    )

    return {
      success: true,
      message: 'Transaction fully approved',
      approval_request_id: request.id,
      requires_approval: false
    }
  }

  async rejectApprovalRequest(data: ApprovalDecisionData & { rejection_reason: string }): Promise<ApprovalResult> {
    const request = await this.requestRepo.getRequest(data.approval_request_id)

    if (!request) {
      return { success: false, message: 'Approval request not found', requires_approval: false }
    }

    if (!['PENDING', 'APPROVED_LEVEL_1'].includes(request.status)) {
      return { success: false, message: `Cannot reject - request status is ${request.status}`, requires_approval: false }
    }

    await this.requestRepo.updateStatus(request.id, 'REJECTED', {
      rejection_by: data.decision_by,
      rejection_at: new Date().toISOString(),
      rejection_reason: data.rejection_reason,
      current_approver_role: null
    })

    await this.configRepo.createApprovalHistory(
      data.approval_request_id,
      'REJECTED',
      data.decision_by,
      request.status,
      'REJECTED',
      data.rejection_reason,
      data.ip_address || null
    )

    logAudit(
      data.decision_by,
      'REJECT',
      'approval_request',
      data.approval_request_id,
      { status: request.status },
      { status: 'REJECTED', rejection_reason: data.rejection_reason }
    )

    return {
      success: true,
      message: 'Approval request rejected',
      approval_request_id: request.id,
      requires_approval: false
    }
  }
}

// ============================================================================
// APPROVAL REQUEST CREATOR (SRP)
// ============================================================================

class ApprovalRequestCreator implements IApprovalRequestCreator {
  constructor(
    private requestRepo: ApprovalRequestRepository,
    private configRepo: ApprovalConfigurationRepository,
    private levelDeterminer: ApprovalLevelDeterminer
  ) {}

  async createApprovalRequest(data: ApprovalRequestData): Promise<ApprovalResult> {
    const { level, role } = await this.levelDeterminer.determineLevelForAmount(
      data.transaction_type,
      data.amount,
      this.configRepo
    )

    if (level === 0) {
      return {
        success: true,
        message: 'No approval required - amount below threshold',
        requires_approval: false
      }
    }

    const approvalRequestId = await this.requestRepo.createRequest(data, level, role)

    logAudit(
      data.requested_by,
      'CREATE',
      'approval_request',
      approvalRequestId,
      null,
      { transaction_type: data.transaction_type, amount: data.amount, level }
    )

    return {
      success: true,
      message: `Approval request created - requires Level ${level} approval`,
      approval_request_id: approvalRequestId,
      requires_approval: true,
      approval_level: level,
      next_approver_role: role
    }
  }
}

// ============================================================================
// APPROVAL QUERY SERVICE (SRP)
// ============================================================================

class ApprovalQueryService implements IApprovalQueryService {
  constructor(
    private requestRepo: ApprovalRequestRepository,
    private configRepo: ApprovalConfigurationRepository
  ) {}

  async getPendingApprovalsForRole(role: string, limit = 50): Promise<ApprovalRequest[]> {
    return this.requestRepo.getPendingForRole(role, limit)
  }

  async getApprovalRequest(id: number): Promise<ApprovalRequest | null> {
    return this.requestRepo.getRequest(id)
  }

  async getApprovalHistory(approvalRequestId: number): Promise<ApprovalHistoryEntry[]> {
    return this.configRepo.getApprovalHistory(approvalRequestId)
  }

  async isTransactionApproved(transactionType: string, referenceId: string): Promise<boolean> {
    const request = await this.requestRepo.getByReference(transactionType, referenceId)
    return request?.status === 'APPROVED'
  }
}

// ============================================================================
// FACADE - SOLID-COMPLIANT SERVICE
// ============================================================================

export class ApprovalWorkflowService implements IApprovalRequestCreator, IApprovalProcessor, IApprovalQueryService {
  private readonly requestRepo: ApprovalRequestRepository
  private readonly configRepo: ApprovalConfigurationRepository
  private readonly levelDeterminer: ApprovalLevelDeterminer
  private readonly processor: ApprovalProcessor
  private readonly creator: ApprovalRequestCreator
  private readonly queryService: ApprovalQueryService

  constructor() {
    this.requestRepo = new ApprovalRequestRepository()
    this.configRepo = new ApprovalConfigurationRepository()
    this.levelDeterminer = new ApprovalLevelDeterminer()
    this.processor = new ApprovalProcessor(this.requestRepo, this.configRepo)
    this.creator = new ApprovalRequestCreator(this.requestRepo, this.configRepo, this.levelDeterminer)
    this.queryService = new ApprovalQueryService(this.requestRepo, this.configRepo)
  }

  async createApprovalRequest(data: ApprovalRequestData): Promise<ApprovalResult> {
    return this.creator.createApprovalRequest(data)
  }

  async approveLevel1(data: ApprovalDecisionData): Promise<ApprovalResult> {
    return this.processor.approveLevel1(data)
  }

  async approveLevel2(data: ApprovalDecisionData): Promise<ApprovalResult> {
    return this.processor.approveLevel2(data)
  }

  async rejectApprovalRequest(data: ApprovalDecisionData & { rejection_reason: string }): Promise<ApprovalResult> {
    return this.processor.rejectApprovalRequest(data)
  }

  async getPendingApprovalsForRole(role: string, limit = 50): Promise<ApprovalRequest[]> {
    return this.queryService.getPendingApprovalsForRole(role, limit)
  }

  async getApprovalRequest(id: number): Promise<ApprovalRequest | null> {
    return this.queryService.getApprovalRequest(id)
  }

  async getApprovalHistory(approvalRequestId: number): Promise<ApprovalHistoryEntry[]> {
    return this.queryService.getApprovalHistory(approvalRequestId)
  }

  async isTransactionApproved(transactionType: string, referenceId: string): Promise<boolean> {
    return this.queryService.isTransactionApproved(transactionType, referenceId)
  }
}
