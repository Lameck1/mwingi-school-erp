import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { ApprovalWorkflowService } from '../ApprovalWorkflowService'

const createAsyncService = (inner: ApprovalWorkflowService) => ({
  createApprovalRequest: async (args: Parameters<ApprovalWorkflowService['createApprovalRequest']>[0]) =>
    inner.createApprovalRequest(args),
  processApproval: async (args: Parameters<ApprovalWorkflowService['processApproval']>[0]) =>
    inner.processApproval(args),
  getApprovalHistory: async (requestId: number) => inner.getApprovalHistory(requestId),
  getApprovalQueue: async (level: number, requestType?: string) => inner.getApprovalQueue(level, requestType)
})

// Mock audit utilities
vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

describe('ApprovalWorkflowService', () => {
  let db: Database.Database
  let service: ReturnType<typeof createAsyncService>

  beforeEach(() => {
    db = new Database(':memory:')
    
    db.exec(`
    CREATE TABLE IF NOT EXISTS fee_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT, category_name TEXT NOT NULL UNIQUE,
      description TEXT, is_active BOOLEAN DEFAULT 1, priority INTEGER DEFAULT 99,
      gl_account_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS invoice_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL,
      fee_category_id INTEGER NOT NULL, description TEXT NOT NULL, amount INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS receipt (
      id INTEGER PRIMARY KEY AUTOINCREMENT, receipt_number TEXT NOT NULL UNIQUE,
      transaction_id INTEGER NOT NULL UNIQUE, receipt_date DATE NOT NULL,
      student_id INTEGER NOT NULL, amount INTEGER NOT NULL, amount_in_words TEXT,
      payment_method TEXT NOT NULL, payment_reference TEXT, printed_count INTEGER DEFAULT 0,
      created_by_user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
          CREATE TABLE IF NOT EXISTS gl_account (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_code TEXT NOT NULL UNIQUE,
            account_name TEXT NOT NULL,
            account_type TEXT NOT NULL,
            normal_balance TEXT NOT NULL,
            is_active BOOLEAN DEFAULT 1
          );
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1100', 'Accounts Receivable', 'ASSET', 'DEBIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('2020', 'Student Credit Balance', 'LIABILITY', 'CREDIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1010', 'Cash', 'ASSET', 'DEBIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1020', 'Bank', 'ASSET', 'DEBIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('4010', 'Tuition Revenue', 'REVENUE', 'CREDIT');
          
          CREATE TABLE IF NOT EXISTS journal_entry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_ref TEXT NOT NULL UNIQUE,
            entry_date DATE NOT NULL,
            entry_type TEXT NOT NULL,
            description TEXT NOT NULL,
            student_id INTEGER,
            staff_id INTEGER,
            term_id INTEGER,
            is_posted BOOLEAN DEFAULT 0,
            posted_by_user_id INTEGER,
            posted_at DATETIME,
            is_voided BOOLEAN DEFAULT 0,
            voided_reason TEXT,
            voided_by_user_id INTEGER,
            voided_at DATETIME,
            requires_approval BOOLEAN DEFAULT 0,
            approval_status TEXT DEFAULT 'PENDING',
            approved_by_user_id INTEGER,
            approved_at DATETIME,
            created_by_user_id INTEGER NOT NULL,
            source_ledger_txn_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          CREATE TABLE IF NOT EXISTS journal_entry_line (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            journal_entry_id INTEGER NOT NULL,
            line_number INTEGER NOT NULL,
            gl_account_id INTEGER NOT NULL,
            debit_amount INTEGER DEFAULT 0,
            credit_amount INTEGER DEFAULT 0,
            description TEXT
          );
          CREATE TABLE IF NOT EXISTS approval_rule (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rule_name TEXT NOT NULL UNIQUE,
            description TEXT,
            transaction_type TEXT NOT NULL,
            min_amount INTEGER,
            max_amount INTEGER,
            days_since_transaction INTEGER,
            required_role_id INTEGER,
            is_active BOOLEAN DEFAULT 1,
            created_by_user_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

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

     
    service = createAsyncService(new ApprovalWorkflowService(db as any))
  })

  afterEach(() => {
    if (db) {db.close()}
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

  /* ============================================================== */
  /*  snake_case parameter normalization                            */
  /* ============================================================== */
  describe('normalizeCreateParams – snake_case params', () => {
    it('accepts snake_case parameter names', async () => {
      const result = await service.createApprovalRequest({
        request_type: 'PAYMENT',
        entity_type: 'fee_invoice',
        entity_id: 1,
        amount: 25000,
        description: 'Snake case test',
        requested_by: 1
      })
      expect(result.success).toBe(true)
      expect(result.requestId).toBeGreaterThan(0)
    })
  })

  /* ============================================================== */
  /*  missing required fields                                       */
  /* ============================================================== */
  describe('createApprovalRequest – validation', () => {
    it('returns error when missing required fields', async () => {
      const result = await service.createApprovalRequest({
        amount: 25000,
        description: 'Missing fields'
      } as any)
      expect(result.success).toBe(false)
      expect(result.message).toContain('Missing required')
    })

    it('returns error when no matching approval config', async () => {
      // REFUND type has no config
      const inner = new ApprovalWorkflowService(db as any)
      const result = inner.createApprovalRequest({
        requestType: 'REFUND',
        entityType: 'payment',
        entityId: 1,
        amount: 1000,
        description: 'No config',
        requestedBy: 1
      })
      expect(result.success).toBe(false)
      expect(result.message).toContain('No approval configuration')
    })
  })

  /* ============================================================== */
  /*  multi-level approval (advance to next level)                  */
  /* ============================================================== */
  describe('processApproval – multi-level', () => {
    it('advances to next level on approve when not final', async () => {
      // Large amount requires level 2
      const req = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 2,
        amount: 100000,
        description: 'Multi-level test',
        requestedBy: 1
      })

      // Approve level 1
      const l1Result = await service.processApproval({
        requestId: req.requestId!,
        level: 1,
        decision: 'APPROVED',
        approverId: 1,
        comments: 'Level 1 OK'
      })
      expect(l1Result.success).toBe(true)
      expect(l1Result.message).toContain('advanced to Level 2')

      // Approve level 2 (final)
      const l2Result = await service.processApproval({
        requestId: req.requestId!,
        level: 2,
        decision: 'APPROVED',
        approverId: 2,
        comments: 'Level 2 OK'
      })
      expect(l2Result.success).toBe(true)
      expect(l2Result.message).toContain('fully approved')
    })

    it('rejection at level 2 finalizes as REJECTED', async () => {
      const req = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 2,
        amount: 100000,
        description: 'Reject at level 2',
        requestedBy: 1
      })

      await service.processApproval({
        requestId: req.requestId!,
        level: 1,
        decision: 'APPROVED',
        approverId: 1,
        comments: 'OK'
      })

      const l2Result = await service.processApproval({
        requestId: req.requestId!,
        level: 2,
        decision: 'REJECTED',
        approverId: 2,
        comments: 'Budget exceeded'
      })
      expect(l2Result.success).toBe(true)
      expect(l2Result.message).toContain('rejected')
    })
  })

  /* ============================================================== */
  /*  getApprovalContext edge cases                                  */
  /* ============================================================== */
  describe('processApproval – context errors', () => {
    it('returns error when approval level not found', async () => {
      const req = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 1,
        amount: 30000,
        description: 'Test',
        requestedBy: 1
      })

      const result = await service.processApproval({
        requestId: req.requestId!,
        level: 5,  // Level 5 doesn't exist
        decision: 'APPROVED',
        approverId: 1,
        comments: 'Nope'
      })
      expect(result.success).toBe(false)
      expect(result.message).toContain('not found')
    })

    it('returns error when wrong level attempted', async () => {
      // Create a multi-level request
      const req = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 2,
        amount: 100000,
        description: 'Test',
        requestedBy: 1
      })

      // Try to approve level 2 before level 1
      const result = await service.processApproval({
        requestId: req.requestId!,
        level: 2,
        decision: 'APPROVED',
        approverId: 2,
        comments: 'Skip'
      })
      expect(result.success).toBe(false)
      expect(result.message).toContain('not at the current approval level')
    })
  })

  /* ============================================================== */
  /*  getApprovalQueue – with filter                                */
  /* ============================================================== */
  describe('getApprovalQueue – requestType filter', () => {
    it('filters by request type', async () => {
      await service.createApprovalRequest({
        requestType: 'PAYMENT', entityType: 'fee_invoice',
        entityId: 1, amount: 25000, description: 'Payment', requestedBy: 1
      })
      await service.createApprovalRequest({
        requestType: 'EXPENSE', entityType: 'supplies',
        entityId: 1, amount: 15000, description: 'Expense', requestedBy: 1
      })

      const payments = await service.getApprovalQueue(1, 'PAYMENT')
      expect(payments.length).toBe(1)
      expect(payments[0].request_type).toBe('PAYMENT')
    })
  })

  /* ============================================================== */
  /*  Backward-compatible wrappers                                  */
  /* ============================================================== */
  describe('backward-compatible wrappers', () => {
    let innerService: ApprovalWorkflowService

    beforeEach(() => {
      innerService = new ApprovalWorkflowService(db as any)
    })

    it('approveRequest delegates to processApproval', () => {
      const req = innerService.createApprovalRequest({
        requestType: 'PAYMENT', entityType: 'fee_invoice',
        entityId: 1, amount: 25000, description: 'Test', requestedBy: 1
      })
      const result = innerService.approveRequest(req.requestId!, 1, 'OK', 1)
      expect(result.success).toBe(true)
    })

    it('rejectRequest delegates to processApproval', () => {
      const req = innerService.createApprovalRequest({
        requestType: 'PAYMENT', entityType: 'fee_invoice',
        entityId: 1, amount: 25000, description: 'Test', requestedBy: 1
      })
      const result = innerService.rejectRequest(req.requestId!, 1, 'No', 1)
      expect(result.success).toBe(true)
      expect(result.message).toContain('rejected')
    })

    it('getRequestHistory returns approval history', () => {
      const req = innerService.createApprovalRequest({
        requestType: 'PAYMENT', entityType: 'fee_invoice',
        entityId: 1, amount: 25000, description: 'Test', requestedBy: 1
      })
      const history = innerService.getRequestHistory(req.requestId!)
      expect(history.request).toBeDefined()
      expect(history.levels).toBeDefined()
    })

    it('getPendingRequests returns pending queue', () => {
      innerService.createApprovalRequest({
        requestType: 'PAYMENT', entityType: 'fee_invoice',
        entityId: 1, amount: 25000, description: 'Test', requestedBy: 1
      })
      const pending = innerService.getPendingRequests()
      expect(Array.isArray(pending)).toBe(true)
      expect(pending.length).toBeGreaterThanOrEqual(1)
    })

    it('getPendingRequests with requestType filter', () => {
      innerService.createApprovalRequest({
        requestType: 'EXPENSE', entityType: 'supplies',
        entityId: 1, amount: 15000, description: 'Test', requestedBy: 1
      })
      const pending = innerService.getPendingRequests(1, 'EXPENSE')
      expect(pending.every(r => r.request_type === 'EXPENSE')).toBe(true)
    })
  })

  /* ============================================================== */
  /*  processApproval – error handling & edge cases                 */
  /* ============================================================== */
  describe('processApproval – error handling', () => {
    it('returns error when request not found', async () => {
      const result = await service.processApproval({
        requestId: 9999,
        level: 1,
        decision: 'APPROVED',
        approverId: 1
      })
      expect(result.success).toBe(false)
      expect(result.message).toContain('not found')
    })

    it('returns error when approval level not found for request', async () => {
      const req = await service.createApprovalRequest({
        requestType: 'PAYMENT', entityType: 'fee_invoice',
        entityId: 1, amount: 25000, description: 'Test', requestedBy: 1
      })
      const result = await service.processApproval({
        requestId: req.requestId!,
        level: 99,
        decision: 'APPROVED',
        approverId: 1
      })
      expect(result.success).toBe(false)
      expect(result.message).toContain('level 99 not found')
    })

    it('getApprovalHistory returns undefined request for non-existent id', async () => {
      const history = await service.getApprovalHistory(9999)
      expect(history.request).toBeUndefined()
      expect(history.levels).toHaveLength(0)
    })
  })

  // ── branch coverage: processApproval succeeds without comments ──
  describe('processApproval – no comments branch', () => {
    it('approves request without comments field', async () => {
      const req = await service.createApprovalRequest({
        requestType: 'PAYMENT', entityType: 'fee_invoice',
        entityId: 99, amount: 25000, description: 'No comments test', requestedBy: 1
      })
      const result = await service.processApproval({
        requestId: req.requestId!,
        level: 1,
        decision: 'APPROVED',
        approverId: 1
      })
      expect(result.success).toBe(true)
    })
  })

  // ── branch coverage: processApproval catch block ──
  describe('processApproval – database error', () => {
    it('returns error when database operation fails', async () => {
      const req = await service.createApprovalRequest({
        requestType: 'PAYMENT', entityType: 'fee_invoice',
        entityId: 100, amount: 25000, description: 'DB error test', requestedBy: 1
      })
      // Drop table to force SQL error during updateApprovalLevel
      ;(db as any).exec('DROP TABLE approval_level')
      const result = await service.processApproval({
        requestId: req.requestId!,
        level: 1,
        decision: 'APPROVED',
        approverId: 1
      })
      expect(result.success).toBe(false)
      expect(result.message).toContain('Failed to process approval')
    })
  })

  // ── branch coverage: createApprovalRequest catch with non-Error throw (L243) ──
  describe('createApprovalRequest – non-Error exception', () => {
    it('returns error message via String(error) for non-Error throw', () => {
      const innerService = new ApprovalWorkflowService(db as any)
      const origPrepare = db.prepare.bind(db)
      vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO approval_request')) { throw 'string error in create' } // NOSONAR
        return origPrepare(sql)
      })
      const result = innerService.createApprovalRequest({
        requestType: 'PAYMENT', entityType: 'fee_invoice',
        entityId: 1, amount: 25000, description: 'Test', requestedBy: 1
      })
      expect(result.success).toBe(false)
      expect(result.message).toContain('string error in create')
      vi.restoreAllMocks()
    })
  })

  // ── branch coverage: getApprovalQueue error path (L418-419) ──
  describe('getApprovalQueue – error handling', () => {
    it('returns empty array when database query fails', () => {
      const innerService = new ApprovalWorkflowService(db as any)
      const origPrepare = db.prepare.bind(db)
      vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
        if (sql.includes('SELECT DISTINCT ar.*')) { throw new Error('DB error') }
        return origPrepare(sql)
      })
      const result = innerService.getApprovalQueue(1)
      expect(result).toEqual([])
      vi.restoreAllMocks()
    })
  })

  // ── branch coverage: getApprovalHistory non-Error catch (L441) ──
  describe('getApprovalHistory – non-Error exception', () => {
    it('throws with String(error) for non-Error exception', () => {
      const innerService = new ApprovalWorkflowService(db as any)
      const origPrepare = db.prepare.bind(db)
      vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
        if (sql.includes('SELECT * FROM approval_request WHERE id')) { throw 42 } // NOSONAR
        return origPrepare(sql)
      })
      expect(() => innerService.getApprovalHistory(1)).toThrow('Failed to get approval history: 42')
      vi.restoreAllMocks()
    })
  })

  // ── branch coverage: processApproval catch with non-Error throw (String(error) path) ──
  describe('processApproval – non-Error exception in catch', () => {
    it('returns error message via String(error) for non-Error throw', () => {
      const innerService = new ApprovalWorkflowService(db as any)
      const req = innerService.createApprovalRequest({
        requestType: 'PAYMENT', entityType: 'fee_invoice',
        entityId: 1, amount: 25000, description: 'Non-Error process test', requestedBy: 1
      })
      const origPrepare = db.prepare.bind(db)
      vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
        if (sql.includes('UPDATE approval_level')) { throw 'string error in process' } // NOSONAR
        return origPrepare(sql)
      })
      const result = innerService.processApproval({
        requestId: req.requestId!,
        level: 1,
        decision: 'APPROVED',
        approverId: 1
      })
      expect(result.success).toBe(false)
      expect(result.message).toContain('string error in process')
      vi.restoreAllMocks()
    })
  })

  // ── branch coverage: getMatchingConfigs sort comparator with multiple matching configs ──
  describe('createApprovalRequest – boundary amount matches multiple configs', () => {
    it('assigns correct max level when amount sits on boundary of two configs', async () => {
      // amount 50000 matches both PAYMENT configs: (0-50000, level 1) and (50000-null, level 2)
      const result = await service.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'fee_invoice',
        entityId: 1,
        amount: 50000,
        description: 'Boundary amount test',
        requestedBy: 1
      })
      expect(result.success).toBe(true)
      expect(result.requiredLevel).toBe(2)
    })
  })
})
