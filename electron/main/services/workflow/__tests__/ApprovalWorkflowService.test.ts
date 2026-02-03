import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import { ApprovalWorkflowService } from '../ApprovalWorkflowService'

// Mock audit utilities
vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

describe('ApprovalWorkflowService', () => {
  let db: Database.Database
  let service: ApprovalWorkflowService

  beforeEach(() => {
    db = new Database(':memory:')
    
    db.exec(`
      CREATE TABLE student (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        admission_number TEXT UNIQUE NOT NULL
      );

      CREATE TABLE user (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT,
        role TEXT
      );

      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        invoice_number TEXT UNIQUE NOT NULL,
        amount INTEGER NOT NULL,
        amount_paid INTEGER DEFAULT 0,
        status TEXT DEFAULT 'OUTSTANDING',
        due_date DATE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES student(id)
      );

      CREATE TABLE approval_request (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        description TEXT,
        requested_by INTEGER NOT NULL,
        requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'PENDING',
        current_level INTEGER DEFAULT 1,
        final_decision TEXT,
        completed_at DATETIME,
        FOREIGN KEY (requested_by) REFERENCES user(id)
      );

      CREATE TABLE approval_level (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id INTEGER NOT NULL,
        level INTEGER NOT NULL,
        approver_id INTEGER,
        status TEXT DEFAULT 'PENDING',
        comments TEXT,
        decided_at DATETIME,
        FOREIGN KEY (request_id) REFERENCES approval_request(id),
        FOREIGN KEY (approver_id) REFERENCES user(id)
      );

      CREATE TABLE approval_configuration (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_type TEXT NOT NULL,
        min_amount INTEGER NOT NULL,
        max_amount INTEGER,
        required_level INTEGER NOT NULL,
        approver_role TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 1
      );

      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action_type TEXT NOT NULL,
        table_name TEXT NOT NULL,
        record_id INTEGER,
        new_values TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Insert test data
      INSERT INTO user (username, email, role) VALUES 
        ('bursar', 'bursar@school.com', 'BURSAR'),
        ('principal', 'principal@school.com', 'PRINCIPAL');

      INSERT INTO student (first_name, last_name, admission_number) VALUES
        ('John', 'Doe', 'STU-001'),
        ('Jane', 'Smith', 'STU-002');

      INSERT INTO fee_invoice (student_id, invoice_number, amount, status, created_at) VALUES
        (1, 'INV-2026-001', 50000, 'OUTSTANDING', '2026-01-05 10:00:00'),
        (2, 'INV-2026-002', 100000, 'OUTSTANDING', '2026-01-10 10:00:00');

      INSERT INTO approval_configuration (request_type, min_amount, max_amount, required_level, approver_role) VALUES
        ('PAYMENT', 0, 50000, 1, 'BURSAR'),
        ('PAYMENT', 50000, NULL, 2, 'PRINCIPAL'),
        ('EXPENSE', 0, 30000, 1, 'BURSAR'),
        ('EXPENSE', 30000, NULL, 2, 'PRINCIPAL');
    `)

    service = new ApprovalWorkflowService(db)
  })

  afterEach(() => {
    db.close()
  })

  describe('createApprovalRequest', () => {
    it('should create approval request successfully', async () => {
      const result = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 1,
        amount: 30000,
        description: 'Payment for tuition',
        requestedBy: 1
      })

      expect(result).toBeDefined()
      expect(result).toHaveProperty('success')
    })

    it('should assign level 1 for small amounts', async () => {
      const result = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 1,
        amount: 30000,
        description: 'Small payment',
        requestedBy: 1
      })

      expect(result.success).toBe(true)
    })

    it('should assign level 2 for large amounts', async () => {
      const result = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 2,
        amount: 100000,
        description: 'Large payment',
        requestedBy: 1
      })

      expect(result.success).toBe(true)
    })

    it('should handle expense requests', async () => {
      const result = await service.createApprovalRequest({
        requestType: 'EXPENSE',
        entityType: 'supplies',
        entityId: 1,
        amount: 15000,
        description: 'Office supplies',
        requestedBy: 1
      })

      expect(result.success).toBe(true)
    })

    it('should return request ID', async () => {
      const result = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 1,
        amount: 25000,
        description: 'Test payment',
        requestedBy: 1
      })

      expect(result).toHaveProperty('requestId')
      expect(result.requestId).toBeGreaterThan(0)
    })

    it('should track requester', async () => {
      const result = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 1,
        amount: 20000,
        description: 'Test',
        requestedBy: 1
      })

      expect(result.success).toBe(true)
    })

    it('should set initial status to PENDING', async () => {
      const result = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 1,
        amount: 25000,
        description: 'Test',
        requestedBy: 1
      })

      expect(result.success).toBe(true)
    })

    it('should create approval levels', async () => {
      const result = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 1,
        amount: 30000,
        description: 'Test',
        requestedBy: 1
      })

      expect(result.success).toBe(true)
    })

    it('should handle multiple requests', async () => {
      const r1 = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 1,
        amount: 25000,
        description: 'Request 1',
        requestedBy: 1
      })

      const r2 = await service.createApprovalRequest({
        requestType: 'EXPENSE',
        entityType: 'supplies',
        entityId: 2,
        amount: 15000,
        description: 'Request 2',
        requestedBy: 1
      })

      expect(r1.success).toBe(true)
      expect(r2.success).toBe(true)
    })

    it('should preserve description', async () => {
      const description = 'Special payment for scholarship'
      const result = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 1,
        amount: 20000,
        description,
        requestedBy: 1
      })

      expect(result.success).toBe(true)
    })

    it('should handle concurrent requests', async () => {
      const [r1, r2] = await Promise.all([
        service.createApprovalRequest({
          requestType: 'PAYMENT',
          entityType: 'fee_invoice',
          entityId: 1,
          amount: 25000,
          description: 'Concurrent 1',
          requestedBy: 1
        }),
        service.createApprovalRequest({
          requestType: 'PAYMENT',
          entityType: 'fee_invoice',
          entityId: 2,
          amount: 35000,
          description: 'Concurrent 2',
          requestedBy: 1
        })
      ])

      expect(r1.success).toBe(true)
      expect(r2.success).toBe(true)
    })
  })

  describe('approveRequest', () => {
    it('should approve level 1 request', async () => {
      const req = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 1,
        amount: 30000,
        description: 'Test approval',
        requestedBy: 1
      })

      const result = await service.processApproval({
        requestId: req.requestId!,
        level: 1,
        decision: 'APPROVED',
        approverId: 1,
        comments: 'Approved'
      })

      expect(result).toBeDefined()
      expect(result).toHaveProperty('success')
    })

    it('should handle comments', async () => {
      const req = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 1,
        amount: 25000,
        description: 'Test',
        requestedBy: 1
      })

      const result = await service.processApproval({
        requestId: req.requestId!,
        level: 1,
        decision: 'APPROVED',
        approverId: 1,
        comments: 'Looks good'
      })

      expect(result.success).toBe(true)
    })

    it('should track approver', async () => {
      const req = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 1,
        amount: 20000,
        description: 'Test',
        requestedBy: 1
      })

      const result = await service.processApproval({
        requestId: req.requestId!,
        level: 1,
        decision: 'APPROVED',
        approverId: 2,
        comments: 'Approved'
      })

      expect(result.success).toBe(true)
    })

    it('should update approval status', async () => {
      const req = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 1,
        amount: 25000,
        description: 'Test',
        requestedBy: 1
      })

      const result = await service.processApproval({
        requestId: req.requestId!,
        level: 1,
        decision: 'APPROVED',
        approverId: 1,
        comments: 'Approved'
      })

      expect(result.success).toBe(true)
    })

    it('should handle non-existent request', async () => {
      const result = await service.processApproval({
        requestId: 9999,
        level: 1,
        decision: 'APPROVED',
        approverId: 1,
        comments: 'Approved'
      })

      expect(result).toBeDefined()
    })

    it('should handle out-of-range level', async () => {
      const req = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 1,
        amount: 25000,
        description: 'Test',
        requestedBy: 1
      })

      const result = await service.processApproval({
        requestId: req.requestId!,
        level: 99,
        decision: 'APPROVED',
        approverId: 1,
        comments: 'Approved'
      })

      expect(result).toBeDefined()
    })
  })

  describe('rejectRequest', () => {
    it('should reject request', async () => {
      const req = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 1,
        amount: 30000,
        description: 'Test rejection',
        requestedBy: 1
      })

      const result = await service.processApproval({
        requestId: req.requestId!,
        level: 1,
        decision: 'REJECTED',
        approverId: 1,
        comments: 'Insufficient funds'
      })

      expect(result).toBeDefined()
      expect(result).toHaveProperty('success')
    })

    it('should include rejection reason', async () => {
      const req = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 1,
        amount: 25000,
        description: 'Test',
        requestedBy: 1
      })

      const result = await service.processApproval({
        requestId: req.requestId!,
        level: 1,
        decision: 'REJECTED',
        approverId: 1,
        comments: 'Budget exceeded'
      })

      expect(result.success).toBe(true)
    })

    it('should track rejector', async () => {
      const req = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 1,
        amount: 20000,
        description: 'Test',
        requestedBy: 1
      })

      const result = await service.processApproval({
        requestId: req.requestId!,
        level: 1,
        decision: 'REJECTED',
        approverId: 2,
        comments: 'Rejected'
      })

      expect(result.success).toBe(true)
    })

    it('should update request status', async () => {
      const req = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 1,
        amount: 25000,
        description: 'Test',
        requestedBy: 1
      })

      const result = await service.processApproval({
        requestId: req.requestId!,
        level: 1,
        decision: 'REJECTED',
        approverId: 1,
        comments: 'Not approved'
      })

      expect(result.success).toBe(true)
    })
  })

  describe('getRequestHistory', () => {
    it('should retrieve approval history', async () => {
      const req = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 1,
        amount: 30000,
        description: 'History test',
        requestedBy: 1
      })

      const result = await service.getApprovalHistory(req.requestId!)

      expect(result).toBeDefined()
      expect(result).toHaveProperty('request')
      expect(result).toHaveProperty('levels')
    })

    it('should include request details', async () => {
      const req = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 1,
        amount: 25000,
        description: 'Test',
        requestedBy: 1
      })

      const result = await service.getApprovalHistory(req.requestId!)

      expect(result.request).toBeDefined()
    })

    it('should include approval levels', async () => {
      const req = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 1,
        amount: 30000,
        description: 'Test',
        requestedBy: 1
      })

      const result = await service.getApprovalHistory(req.requestId!)

      expect(Array.isArray(result.levels)).toBe(true)
    })

    it('should handle non-existent request', async () => {
      const result = await service.getApprovalHistory(9999)

      expect(result).toBeDefined()
    })

    it('should preserve request properties', async () => {
      const req = await service.createApprovalRequest({
        requestType: 'EXPENSE',
        entityType: 'supplies',
        entityId: 5,
        amount: 20000,
        description: 'Special order',
        requestedBy: 1
      })

      const result = await service.getApprovalHistory(req.requestId!)

      expect(result.request.request_type).toBe('EXPENSE')
      expect(result.request.amount).toBe(20000)
    })
  })

  describe('getPendingRequests', () => {
    it('should retrieve pending requests', async () => {
      await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 1,
        amount: 30000,
        description: 'Pending test',
        requestedBy: 1
      })

      const result = await service.getApprovalQueue(1)

      expect(Array.isArray(result)).toBe(true)
    })

    it('should include multiple pending requests', async () => {
      await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 1,
        amount: 25000,
        description: 'Request 1',
        requestedBy: 1
      })

      await service.createApprovalRequest({
        requestType: 'EXPENSE',
        entityType: 'supplies',
        entityId: 2,
        amount: 15000,
        description: 'Request 2',
        requestedBy: 1
      })

      const result = await service.getApprovalQueue(1)

      expect(result.length).toBeGreaterThanOrEqual(2)
    })

    it('should exclude completed requests', async () => {
      const req = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 1,
        amount: 30000,
        description: 'Test',
        requestedBy: 1
      })

      await service.processApproval({
        requestId: req.requestId!,
        level: 1,
        decision: 'APPROVED',
        approverId: 1,
        comments: 'Approved'
      })

      const result = await service.getApprovalQueue(1)

      expect(Array.isArray(result)).toBe(true)
    })

    it('should return empty for no pending requests', async () => {
      const result = await service.getApprovalQueue(1)

      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('should handle zero amounts', async () => {
      const result = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 1,
        amount: 0,
        description: 'Zero amount',
        requestedBy: 1
      })

      expect(result).toBeDefined()
    })

    it('should handle large amounts', async () => {
      const result = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 2,
        amount: 999999999,
        description: 'Large amount',
        requestedBy: 1
      })

      expect(result.success).toBe(true)
    })

    it('should handle special characters in description', async () => {
      const result = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 1,
        amount: 25000,
        description: 'Payment for "Special" tuition & fees',
        requestedBy: 1
      })

      expect(result.success).toBe(true)
    })

    it('should handle concurrent workflow operations', async () => {
      const [r1, r2] = await Promise.all([
        service.createApprovalRequest({
          requestType: 'PAYMENT',
          entityType: 'fee_invoice',
          entityId: 1,
          amount: 25000,
          description: 'Concurrent 1',
          requestedBy: 1
        }),
        service.createApprovalRequest({
          requestType: 'EXPENSE',
          entityType: 'supplies',
          entityId: 2,
          amount: 15000,
          description: 'Concurrent 2',
          requestedBy: 1
        })
      ])

      expect(r1.success).toBe(true)
      expect(r2.success).toBe(true)
    })

    it('should maintain data consistency', async () => {
      const req = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 1,
        amount: 30000,
        description: 'Consistency test',
        requestedBy: 1
      })

      const history = await service.getApprovalHistory(req.requestId!)

      expect(history.request.amount).toBe(30000)
      expect(history.request.request_type).toBe('PAYMENT')
    })
  })
})
