import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { ApprovalService } from '../ApprovalService'

// Mock audit log
vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

// Mock getDatabase to return our test db
let testDb: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => testDb
}))

describe('ApprovalService', () => {
  let service: ApprovalService

  beforeEach(() => {
    testDb = new Database(':memory:')
    testDb.exec(`
      CREATE TABLE user (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        full_name TEXT,
        email TEXT,
        role TEXT,
        is_active BOOLEAN DEFAULT 1,
        last_login DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE approval_workflow (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_name TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE approval_request (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id INTEGER NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        current_step INTEGER DEFAULT 1,
        status TEXT DEFAULT 'PENDING',
        requested_by_user_id INTEGER NOT NULL,
        final_approver_user_id INTEGER,
        completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workflow_id) REFERENCES approval_workflow(id),
        FOREIGN KEY (requested_by_user_id) REFERENCES user(id)
      );

      CREATE TABLE budget (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        budget_name TEXT NOT NULL,
        status TEXT DEFAULT 'DRAFT',
        approved_by_user_id INTEGER,
        approved_at DATETIME,
        notes TEXT
      );

      CREATE TABLE journal_entry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_ref TEXT NOT NULL UNIQUE,
        entry_date DATE NOT NULL,
        entry_type TEXT NOT NULL,
        description TEXT NOT NULL,
        student_id INTEGER,
        is_posted BOOLEAN DEFAULT 0,
        posted_by_user_id INTEGER,
        posted_at DATETIME,
        is_voided BOOLEAN DEFAULT 0,
        created_by_user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_ref TEXT NOT NULL UNIQUE,
        description TEXT,
        transaction_date DATE NOT NULL,
        transaction_type TEXT NOT NULL,
        category_id INTEGER,
        amount INTEGER NOT NULL,
        debit_credit TEXT NOT NULL,
        recorded_by_user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action_type TEXT NOT NULL,
        table_name TEXT NOT NULL,
        record_id INTEGER,
        old_values TEXT,
        new_values TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Test data
      INSERT INTO user (username, full_name, role) VALUES
        ('admin', 'Admin User', 'ADMIN'),
        ('bursar', 'Bursar User', 'ACCOUNTS_CLERK'),
        ('principal', 'Principal User', 'PRINCIPAL');

      INSERT INTO approval_workflow (workflow_name, entity_type) VALUES
        ('Budget Approval', 'BUDGET'),
        ('Expense Approval', 'EXPENSE');

      INSERT INTO budget (budget_name, status) VALUES
        ('Q1 Budget', 'DRAFT'),
        ('Q2 Budget', 'DRAFT');

      INSERT INTO journal_entry (entry_ref, entry_date, entry_type, description, created_by_user_id)
      VALUES ('JE-001', '2026-01-15', 'PAYMENT', 'Test entry', 1);
    `)

    service = new ApprovalService()
  })

  afterEach(() => {
    if (testDb) { testDb.close() }
  })

  describe('getWorkflows', () => {
    it('should return active workflows', async () => {
      const workflows = await service.getWorkflows()
      expect(workflows).toHaveLength(2)
      expect(workflows[0].workflow_name).toBe('Budget Approval')
    })
  })

  describe('createApprovalRequest', () => {
    it('should create an approval request for a budget', async () => {
      const result = await service.createApprovalRequest('BUDGET', 1, 1)
      expect(result.success).toBe(true)
      expect(result.id).toBeGreaterThan(0)
    })

    it('should auto-approve when no workflow exists for entity type', async () => {
      const result = await service.createApprovalRequest('UNKNOWN_TYPE', 1, 1)
      expect(result.success).toBe(true)
      expect(result.id).toBe(0)
    })

    it('should reject duplicate pending requests', async () => {
      await service.createApprovalRequest('BUDGET', 1, 1)
      const result = await service.createApprovalRequest('BUDGET', 1, 1)
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors![0]).toContain('already pending')
    })

    it('should set initial status to PENDING', async () => {
      const result = await service.createApprovalRequest('BUDGET', 1, 1)
      const request = testDb.prepare(`SELECT status FROM approval_request WHERE id = ?`).get(result.id!) as { status: string }
      expect(request.status).toBe('PENDING')
    })
  })

  describe('approve', () => {
    it('should approve a pending request', async () => {
      const createResult = await service.createApprovalRequest('BUDGET', 1, 1)
      const result = await service.approve(createResult.id!, 2)
      expect(result.success).toBe(true)

      const request = testDb.prepare(`SELECT status, final_approver_user_id FROM approval_request WHERE id = ?`).get(createResult.id!) as {
        status: string; final_approver_user_id: number
      }
      expect(request.status).toBe('APPROVED')
      expect(request.final_approver_user_id).toBe(2)
    })

    it('should update budget status when approving a BUDGET request', async () => {
      const createResult = await service.createApprovalRequest('BUDGET', 1, 1)
      await service.approve(createResult.id!, 2)

      const budget = testDb.prepare(`SELECT status FROM budget WHERE id = 1`).get() as { status: string }
      expect(budget.status).toBe('APPROVED')
    })

    it('should reject approval of non-existent request', async () => {
      const result = await service.approve(999, 1)
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('not found')
    })

    it('should reject approval of already processed request', async () => {
      const createResult = await service.createApprovalRequest('BUDGET', 1, 1)
      await service.approve(createResult.id!, 2)

      const result = await service.approve(createResult.id!, 3)
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('already been processed')
    })
  })

  describe('reject', () => {
    it('should reject a pending request', async () => {
      const createResult = await service.createApprovalRequest('BUDGET', 1, 1)
      const result = await service.reject(createResult.id!, 2, 'Budget too high')
      expect(result.success).toBe(true)

      const request = testDb.prepare(`SELECT status FROM approval_request WHERE id = ?`).get(createResult.id!) as { status: string }
      expect(request.status).toBe('REJECTED')
    })

    it('should update budget notes with rejection reason', async () => {
      const createResult = await service.createApprovalRequest('BUDGET', 1, 1)
      await service.reject(createResult.id!, 2, 'Too expensive')

      const budget = testDb.prepare(`SELECT status, notes FROM budget WHERE id = 1`).get() as { status: string; notes: string }
      expect(budget.status).toBe('REJECTED')
      expect(budget.notes).toContain('Too expensive')
    })

    it('should reject non-pending requests', async () => {
      const createResult = await service.createApprovalRequest('BUDGET', 1, 1)
      await service.approve(createResult.id!, 2)

      const result = await service.reject(createResult.id!, 3, 'Changed mind')
      expect(result.success).toBe(false)
    })
  })

  describe('cancel', () => {
    it('should cancel a pending request by the requester', async () => {
      const createResult = await service.createApprovalRequest('BUDGET', 1, 1)
      const result = await service.cancel(createResult.id!, 1)
      expect(result.success).toBe(true)

      const request = testDb.prepare(`SELECT status FROM approval_request WHERE id = ?`).get(createResult.id!) as { status: string }
      expect(request.status).toBe('CANCELLED')
    })

    it('should not allow non-requester to cancel', async () => {
      const createResult = await service.createApprovalRequest('BUDGET', 1, 1)
      const result = await service.cancel(createResult.id!, 2)
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('Only the requester')
    })
  })

  describe('getApprovalCounts', () => {
    it('should return counts by status', async () => {
      await service.createApprovalRequest('BUDGET', 1, 1)
      await service.createApprovalRequest('BUDGET', 2, 1)

      const req1 = testDb.prepare(`SELECT id FROM approval_request WHERE entity_id = 1`).get() as { id: number }
      await service.approve(req1.id, 2)

      const counts = await service.getApprovalCounts()
      expect(counts.pending).toBe(1)
      expect(counts.approved).toBe(1)
      expect(counts.rejected).toBe(0)
    })
  })

  describe('getAllApprovals', () => {
    it('should return all approvals without filters', async () => {
      await service.createApprovalRequest('BUDGET', 1, 1)
      await service.createApprovalRequest('EXPENSE', 1, 1)
      const approvals = await service.getAllApprovals()
      expect(approvals.length).toBe(2)
    })

    it('should filter by status', async () => {
      const r = await service.createApprovalRequest('BUDGET', 1, 1)
      await service.approve(r.id!, 2)
      await service.createApprovalRequest('BUDGET', 2, 1)
      const approved = await service.getAllApprovals({ status: 'APPROVED' })
      expect(approved.length).toBe(1)
    })

    it('should filter by entity_type', async () => {
      await service.createApprovalRequest('BUDGET', 1, 1)
      await service.createApprovalRequest('EXPENSE', 1, 1)
      const budgets = await service.getAllApprovals({ entity_type: 'BUDGET' })
      expect(budgets.length).toBe(1)
    })

    it('should filter by both status and entity_type', async () => {
      await service.createApprovalRequest('BUDGET', 1, 1)
      await service.createApprovalRequest('EXPENSE', 1, 1)
      const result = await service.getAllApprovals({ status: 'PENDING', entity_type: 'EXPENSE' })
      expect(result.length).toBe(1)
    })
  })

  describe('getPendingApprovals', () => {
    it('should return only pending requests', async () => {
      await service.createApprovalRequest('BUDGET', 1, 1)
      const r2 = await service.createApprovalRequest('BUDGET', 2, 1)
      await service.approve(r2.id!, 2)
      const pending = await service.getPendingApprovals()
      expect(pending.length).toBe(1)
    })

    it('should accept optional userId parameter', async () => {
      await service.createApprovalRequest('BUDGET', 1, 1)
      const pending = await service.getPendingApprovals(1)
      expect(pending.length).toBe(1)
    })
  })

  describe('approve - JOURNAL_ENTRY', () => {
    it('should post journal_entry when approving a JOURNAL_ENTRY request', async () => {
      testDb.exec(`INSERT INTO approval_workflow (workflow_name, entity_type) VALUES ('JE Approval', 'JOURNAL_ENTRY')`)
      const cr = await service.createApprovalRequest('JOURNAL_ENTRY', 1, 1)
      const result = await service.approve(cr.id!, 2)
      expect(result.success).toBe(true)
      const je = testDb.prepare('SELECT is_posted, posted_by_user_id FROM journal_entry WHERE id = 1').get() as { is_posted: number; posted_by_user_id: number }
      expect(je.is_posted).toBe(1)
      expect(je.posted_by_user_id).toBe(2)
    })
  })

  describe('reject edge cases', () => {
    it('should return error for non-existent request', async () => {
      const result = await service.reject(999, 1, 'reason')
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('not found')
    })

    it('should not update budget for non-BUDGET entity reject', async () => {
      testDb.exec(`INSERT INTO approval_workflow (workflow_name, entity_type) VALUES ('JE Reject', 'JOURNAL_ENTRY')`)
      const cr = await service.createApprovalRequest('JOURNAL_ENTRY', 1, 1)
      const result = await service.reject(cr.id!, 2, 'some reason')
      expect(result.success).toBe(true)
    })
  })

  describe('cancel edge cases', () => {
    it('should return error for non-existent request', async () => {
      const result = await service.cancel(999, 1)
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('not found')
    })

    it('should not allow cancelling a non-pending request', async () => {
      const cr = await service.createApprovalRequest('BUDGET', 1, 1)
      await service.approve(cr.id!, 2)
      const result = await service.cancel(cr.id!, 1)
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('pending')
    })

    it('should revert budget to DRAFT when cancelling BUDGET request', async () => {
      const cr = await service.createApprovalRequest('BUDGET', 1, 1)
      await service.cancel(cr.id!, 1)
      const budget = testDb.prepare('SELECT status FROM budget WHERE id = 1').get() as { status: string }
      expect(budget.status).toBe('DRAFT')
    })

    it('should not update budget for non-BUDGET entity cancel', async () => {
      testDb.exec(`INSERT INTO approval_workflow (workflow_name, entity_type) VALUES ('Exp Cancel', 'EXPENSE')`)
      const cr = await service.createApprovalRequest('EXPENSE', 1, 1)
      const result = await service.cancel(cr.id!, 1)
      expect(result.success).toBe(true)
    })
  })

  describe('getWorkflowByEntityType', () => {
    it('should return workflow for valid entity type', async () => {
      const workflow = await service.getWorkflowByEntityType('BUDGET')
      expect(workflow).not.toBeNull()
      expect(workflow!.entity_type).toBe('BUDGET')
    })

    it('should return null for unknown entity type', async () => {
      const workflow = await service.getWorkflowByEntityType('NONEXISTENT')
      expect(workflow).toBeUndefined()
    })
  })

  describe('error handling', () => {
    it('should handle error in approve gracefully', async () => {
      const cr = await service.createApprovalRequest('BUDGET', 1, 1)
      const origPrepare = testDb.prepare.bind(testDb)
      vi.spyOn(testDb, 'prepare').mockImplementation((sql: string) => {
        if (sql.includes('UPDATE approval_request')) { throw new Error('DB write error') }
        return origPrepare(sql)
      })
      const result = await service.approve(cr.id!, 2)
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('DB write error')
      vi.restoreAllMocks()
    })

    it('should handle non-Error throw in reject', async () => {
      const cr = await service.createApprovalRequest('BUDGET', 1, 1)
      const origPrepare = testDb.prepare.bind(testDb)
      vi.spyOn(testDb, 'prepare').mockImplementation((sql: string) => {
        if (sql.includes('UPDATE approval_request') && sql.includes('REJECTED')) { throw 'string error' } // NOSONAR
        return origPrepare(sql)
      })
      const result = await service.reject(cr.id!, 2, 'reason')
      expect(result.success).toBe(false)
      expect(result.errors![0]).toBe('Unknown error')
      vi.restoreAllMocks()
    })

    it('should handle non-Error throw in cancel', async () => {
      const cr = await service.createApprovalRequest('BUDGET', 1, 1)
      const origPrepare = testDb.prepare.bind(testDb)
      vi.spyOn(testDb, 'prepare').mockImplementation((sql: string) => {
        if (sql.includes('UPDATE approval_request SET status = \'CANCELLED\'')) { throw 42 } // NOSONAR
        return origPrepare(sql)
      })
      const result = await service.cancel(cr.id!, 1)
      expect(result.success).toBe(false)
      expect(result.errors![0]).toBe('Unknown error')
      vi.restoreAllMocks()
    })
  })

  describe('JOURNAL_ENTRY approval', () => {
    it('approve updates journal_entry is_posted when entity_type is JOURNAL_ENTRY', async () => {
      testDb.exec(`INSERT INTO approval_workflow (workflow_name, entity_type) VALUES ('JE Approval', 'JOURNAL_ENTRY')`)
      const cr = await service.createApprovalRequest('JOURNAL_ENTRY', 1, 1)
      expect(cr.success).toBe(true)

      const result = await service.approve(cr.id!, 2)
      expect(result.success).toBe(true)

      const je = testDb.prepare('SELECT is_posted, posted_by_user_id FROM journal_entry WHERE id = 1').get() as { is_posted: number; posted_by_user_id: number }
      expect(je.is_posted).toBe(1)
      expect(je.posted_by_user_id).toBe(2)
    })

    it('reject does not update journal_entry posted status', async () => {
      testDb.exec(`INSERT INTO approval_workflow (workflow_name, entity_type) VALUES ('JE Approval 2', 'JOURNAL_ENTRY')`)
      // Need a fresh JE to avoid duplicate pending check
      testDb.prepare(`INSERT INTO journal_entry (entry_ref, entry_date, entry_type, description, created_by_user_id) VALUES ('JE-002', '2026-02-15', 'PAYMENT', 'Second entry', 1)`).run()
      const cr = await service.createApprovalRequest('JOURNAL_ENTRY', 2, 1)
      expect(cr.success).toBe(true)

      const result = await service.reject(cr.id!, 2, 'Not valid')
      expect(result.success).toBe(true)

      const je = testDb.prepare('SELECT is_posted FROM journal_entry WHERE id = 2').get() as { is_posted: number }
      expect(je.is_posted).toBe(0)
    })
  })

  describe('getAllApprovals filtering', () => {
    it('filters by entity_type', async () => {
      await service.createApprovalRequest('BUDGET', 1, 1)
      await service.createApprovalRequest('EXPENSE', 1, 1)
      const budgets = await service.getAllApprovals({ entity_type: 'BUDGET' })
      expect(budgets.length).toBe(1)
      expect(budgets[0].entity_type).toBe('BUDGET')
    })
  })

  // ── branch coverage: approve with EXPENSE entity (not BUDGET/JOURNAL_ENTRY) ──
  describe('approve – non-BUDGET/JOURNAL_ENTRY entity', () => {
    it('approves EXPENSE entity without updating any related entity', async () => {
      testDb.exec(`INSERT INTO approval_workflow (workflow_name, entity_type) VALUES ('Expense Approval', 'EXPENSE')`)
      const cr = await service.createApprovalRequest('EXPENSE', 1, 1)
      expect(cr.success).toBe(true)
      expect(cr.id).toBeGreaterThan(0)
      const result = await service.approve(cr.id!, 2)
      expect(result.success).toBe(true)
    })
  })

  // ── branch coverage: cancel with non-BUDGET entity type ──
  describe('cancel – non-BUDGET entity', () => {
    it('cancels EXPENSE request without reverting entity', async () => {
      testDb.exec(`INSERT INTO approval_workflow (workflow_name, entity_type) VALUES ('Expense Cancel', 'EXPENSE')`)
      const cr = await service.createApprovalRequest('EXPENSE', 1, 1)
      expect(cr.success).toBe(true)
      const result = await service.cancel(cr.id!, 1)
      expect(result.success).toBe(true)
    })
  })

  // ── branch coverage: getApprovalCounts null→zero fallback ──
  describe('getApprovalCounts', () => {
    it('returns zero counts when no requests exist', async () => {
      testDb.exec('DELETE FROM approval_request')
      const counts = await service.getApprovalCounts()
      expect(counts.pending).toBe(0)
      expect(counts.approved).toBe(0)
      expect(counts.rejected).toBe(0)
    })
  })

  // ── branch coverage: approve rejects when status is already APPROVED ──
  describe('approve – already-processed request', () => {
    it('returns error when request is already APPROVED', async () => {
      const cr = await service.createApprovalRequest('BUDGET', 1, 1)
      await service.approve(cr.id!, 2)
      const result = await service.approve(cr.id!, 2)
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('already been processed')
    })
  })

  // ── branch coverage: createApprovalRequest non-Error throw (L143) ──
  describe('createApprovalRequest – non-Error exception', () => {
    it('returns Unknown error for non-Error throw in createApprovalRequest', async () => {
      const origPrepare = testDb.prepare.bind(testDb)
      vi.spyOn(testDb, 'prepare').mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO approval_request')) { throw 'non-error value' } // NOSONAR
        return origPrepare(sql)
      })
      const result = await service.createApprovalRequest('BUDGET', 2, 1)
      expect(result.success).toBe(false)
      expect(result.errors![0]).toBe('Unknown error')
      vi.restoreAllMocks()
    })

    it('returns Error message for Error throw in createApprovalRequest', async () => {
      const origPrepare = testDb.prepare.bind(testDb)
      vi.spyOn(testDb, 'prepare').mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO approval_request')) { throw new Error('DB constraint violation') }
        return origPrepare(sql)
      })
      const result = await service.createApprovalRequest('BUDGET', 2, 1)
      expect(result.success).toBe(false)
      expect(result.errors![0]).toBe('DB constraint violation')
      vi.restoreAllMocks()
    })
  })

  // ── branch coverage: createApprovalRequest returns duplicate pending error ──
  describe('createApprovalRequest – duplicate pending', () => {
    it('returns error when pending request already exists for same entity', async () => {
      await service.createApprovalRequest('BUDGET', 1, 1)
      const dup = await service.createApprovalRequest('BUDGET', 1, 1)
      expect(dup.success).toBe(false)
      expect(dup.errors![0]).toContain('already pending')
    })
  })

  // ── branch coverage: reject already-rejected request ──
  describe('reject – already-rejected request', () => {
    it('returns error when request is already REJECTED', async () => {
      const cr = await service.createApprovalRequest('BUDGET', 1, 1)
      await service.reject(cr.id!, 2, 'initial')
      const result = await service.reject(cr.id!, 2, 'second')
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('already been processed')
    })
  })
})
