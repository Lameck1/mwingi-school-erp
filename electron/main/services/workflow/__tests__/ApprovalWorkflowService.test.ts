import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import { ApprovalWorkflowService } from '../ApprovalWorkflowService'

describe('ApprovalWorkflowService', () => {
  let db: Database.Database
  let service: ApprovalWorkflowService

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(':memory:')
    
    // Initialize schema
    db.exec(`
      CREATE TABLE approval_request (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        requested_by INTEGER NOT NULL,
        requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'PENDING',
        current_level INTEGER DEFAULT 1,
        final_decision TEXT,
        completed_at DATETIME
      );

      CREATE TABLE approval_level (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id INTEGER NOT NULL,
        level INTEGER NOT NULL,
        approver_id INTEGER NOT NULL,
        status TEXT DEFAULT 'PENDING',
        comments TEXT,
        decided_at DATETIME,
        FOREIGN KEY (request_id) REFERENCES approval_request(id)
      );

      CREATE TABLE approval_configuration (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_type TEXT NOT NULL,
        min_amount REAL NOT NULL,
        max_amount REAL,
        required_level INTEGER NOT NULL,
        approver_role TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 1
      );

      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        table_name TEXT NOT NULL,
        record_id INTEGER,
        old_values TEXT,
        new_values TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Seed approval configurations
      INSERT INTO approval_configuration (request_type, min_amount, max_amount, required_level, approver_role)
      VALUES 
        ('PAYMENT', 0, 50000, 1, 'BURSAR'),
        ('PAYMENT', 50000, NULL, 2, 'PRINCIPAL'),
        ('EXPENSE', 0, 25000, 1, 'BURSAR'),
        ('EXPENSE', 25000, NULL, 2, 'PRINCIPAL');
    `)

    service = new ApprovalWorkflowService(db)
  })

  afterEach(() => {
    db.close()
  })

  describe('createApprovalRequest', () => {
    it('should create level 1 approval for amount under 50,000', () => {
      const result = service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'payment',
        entityId: 1,
        amount: 30000,
        description: 'School fees payment',
        requestedBy: 5
      })

      expect(result.success).toBe(true)
      expect(result.requestId).toBeGreaterThan(0)
      expect(result.requiredLevel).toBe(1)
      expect(result.message).toContain('Level 1')

      // Verify approval request created
      const request = db.prepare('SELECT * FROM approval_request WHERE id = ?').get(result.requestId) as any
      expect(request.status).toBe('PENDING')
      expect(request.amount).toBe(30000)
      expect(request.current_level).toBe(1)

      // Verify level 1 approval created
      const levels = db.prepare('SELECT * FROM approval_level WHERE request_id = ?').all(result.requestId) as any[]
      expect(levels).toHaveLength(1)
      expect(levels[0].level).toBe(1)
      expect(levels[0].status).toBe('PENDING')
    })

    it('should create level 2 approval for amount over 50,000', () => {
      const result = service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'payment',
        entityId: 2,
        amount: 75000,
        description: 'Supplier payment',
        requestedBy: 5
      })

      expect(result.success).toBe(true)
      expect(result.requiredLevel).toBe(2)
      expect(result.message).toContain('Level 2')

      // Verify both approval levels created
      const levels = db.prepare('SELECT * FROM approval_level WHERE request_id = ? ORDER BY level').all(result.requestId) as any[]
      expect(levels).toHaveLength(2)
      expect(levels[0].level).toBe(1)
      expect(levels[1].level).toBe(2)
    })

    it('should reject invalid request type', () => {
      const result = service.createApprovalRequest({
        requestType: 'INVALID',
        entityType: 'payment',
        entityId: 1,
        amount: 10000,
        description: 'Test',
        requestedBy: 5
      })

      expect(result.success).toBe(false)
      expect(result.message).toContain('No approval configuration')
    })

    it('should log audit trail on creation', () => {
      service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'payment',
        entityId: 1,
        amount: 30000,
        description: 'Test payment',
        requestedBy: 5
      })

      const auditLogs = db.prepare('SELECT * FROM audit_log WHERE action_type = ?').all('CREATE_APPROVAL_REQUEST') as any[]
      expect(auditLogs.length).toBeGreaterThan(0)
      expect(auditLogs[0].user_id).toBe(5)
    })
  })

  describe('processApproval', () => {
    let requestId: number

    beforeEach(() => {
      // Create a test approval request
      const result = service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'payment',
        entityId: 1,
        amount: 75000, // Requires level 2
        description: 'Test payment',
        requestedBy: 5
      })
      requestId = result.requestId!
    })

    it('should approve level 1 and advance to level 2', () => {
      const result = service.processApproval({
        requestId,
        level: 1,
        decision: 'APPROVED',
        approverId: 10,
        comments: 'Approved by bursar'
      })

      expect(result.success).toBe(true)
      expect(result.message).toContain('advanced to Level 2')

      // Verify level 1 status
      const level1 = db.prepare('SELECT * FROM approval_level WHERE request_id = ? AND level = 1').get(requestId) as any
      expect(level1.status).toBe('APPROVED')
      expect(level1.approver_id).toBe(10)

      // Verify request advanced
      const request = db.prepare('SELECT * FROM approval_request WHERE id = ?').get(requestId) as any
      expect(request.current_level).toBe(2)
      expect(request.status).toBe('PENDING')
    })

    it('should reject level 1 and mark request as rejected', () => {
      const result = service.processApproval({
        requestId,
        level: 1,
        decision: 'REJECTED',
        approverId: 10,
        comments: 'Insufficient documentation'
      })

      expect(result.success).toBe(true)
      expect(result.message).toContain('rejected')

      // Verify request status
      const request = db.prepare('SELECT * FROM approval_request WHERE id = ?').get(requestId) as any
      expect(request.status).toBe('REJECTED')
      expect(request.final_decision).toBe('REJECTED')
      expect(request.completed_at).not.toBeNull()
    })

    it('should fully approve when level 2 approves', () => {
      // First approve level 1
      service.processApproval({
        requestId,
        level: 1,
        decision: 'APPROVED',
        approverId: 10,
        comments: 'Level 1 approved'
      })

      // Then approve level 2
      const result = service.processApproval({
        requestId,
        level: 2,
        decision: 'APPROVED',
        approverId: 20,
        comments: 'Level 2 approved'
      })

      expect(result.success).toBe(true)
      expect(result.message).toContain('fully approved')

      // Verify request fully approved
      const request = db.prepare('SELECT * FROM approval_request WHERE id = ?').get(requestId) as any
      expect(request.status).toBe('APPROVED')
      expect(request.final_decision).toBe('APPROVED')
      expect(request.completed_at).not.toBeNull()
    })

    it('should prevent approval of wrong level', () => {
      const result = service.processApproval({
        requestId,
        level: 2, // Trying to approve level 2 before level 1
        decision: 'APPROVED',
        approverId: 20,
        comments: 'Premature approval'
      })

      expect(result.success).toBe(false)
      expect(result.message).toContain('not at the current approval level')
    })
  })

  describe('getApprovalQueue', () => {
    beforeEach(() => {
      // Create multiple approval requests
      service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'payment',
        entityId: 1,
        amount: 30000,
        description: 'Payment 1',
        requestedBy: 5
      })

      service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'payment',
        entityId: 2,
        amount: 60000,
        description: 'Payment 2',
        requestedBy: 5
      })

      service.createApprovalRequest({
        requestType: 'EXPENSE',
        entityType: 'expense',
        entityId: 3,
        amount: 15000,
        description: 'Expense 1',
        requestedBy: 6
      })
    })

    it('should return all pending approvals for level 1', () => {
      const queue = service.getApprovalQueue(1)

      expect(queue.length).toBe(3)
      queue.forEach(item => {
        expect(item.status).toBe('PENDING')
        expect(item.current_level).toBe(1)
      })
    })

    it('should return only level 2 pending after level 1 approval', () => {
      const requests = db.prepare('SELECT id FROM approval_request').all() as any[]
      const level2RequestId = requests.find((r: any) => {
        const req = db.prepare('SELECT amount FROM approval_request WHERE id = ?').get(r.id) as any
        return req.amount > 50000
      })?.id

      // Approve level 1 for the level 2 request
      service.processApproval({
        requestId: level2RequestId,
        level: 1,
        decision: 'APPROVED',
        approverId: 10,
        comments: 'Approved'
      })

      const level2Queue = service.getApprovalQueue(2)
      expect(level2Queue.length).toBe(1)
      expect(level2Queue[0].current_level).toBe(2)
    })

    it('should filter by request type', () => {
      const paymentQueue = service.getApprovalQueue(1, 'PAYMENT')
      expect(paymentQueue.length).toBe(2)
      paymentQueue.forEach(item => {
        expect(item.request_type).toBe('PAYMENT')
      })
    })
  })

  describe('getApprovalHistory', () => {
    it('should return complete approval history', () => {
      const result = service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'payment',
        entityId: 1,
        amount: 75000,
        description: 'Test payment',
        requestedBy: 5
      })

      service.processApproval({
        requestId: result.requestId!,
        level: 1,
        decision: 'APPROVED',
        approverId: 10,
        comments: 'Level 1 approved'
      })

      service.processApproval({
        requestId: result.requestId!,
        level: 2,
        decision: 'APPROVED',
        approverId: 20,
        comments: 'Level 2 approved'
      })

      const history = service.getApprovalHistory(result.requestId!)

      expect(history.request).toBeDefined()
      expect(history.request.id).toBe(result.requestId)
      expect(history.levels).toHaveLength(2)
      expect(history.levels[0].status).toBe('APPROVED')
      expect(history.levels[1].status).toBe('APPROVED')
    })
  })

  describe('edge cases', () => {
    it('should handle zero amount gracefully', () => {
      const result = service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'payment',
        entityId: 1,
        amount: 0,
        description: 'Zero payment',
        requestedBy: 5
      })

      expect(result.success).toBe(true)
      expect(result.requiredLevel).toBe(1)
    })

    it('should handle missing approval level configuration', () => {
      // Delete all configs
      db.exec('DELETE FROM approval_configuration')

      const result = service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'payment',
        entityId: 1,
        amount: 10000,
        description: 'Test',
        requestedBy: 5
      })

      expect(result.success).toBe(false)
      expect(result.message).toContain('No approval configuration')
    })
  })
})
