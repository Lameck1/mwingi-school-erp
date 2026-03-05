import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

let db: Database.Database
const handlerMap = new Map<string, IpcHandler>()

vi.mock('../../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => handlerMap.set(channel, handler)),
    removeHandler: vi.fn(),
  }
}))

vi.mock('../../../database', () => ({
  getDatabase: () => db
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn(),
}))

vi.mock('../../../security/session', () => ({
  getSession: vi.fn(async () => ({
    user: {
      id: 2,
      role: 'ADMIN'
    }
  }))
}))

import { registerFinanceApprovalHandlers } from '../approval-handlers'

describe('finance approval handlers', () => {
  beforeEach(() => {
    handlerMap.clear()

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

      CREATE TABLE user (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL
      );
      INSERT INTO user (id, username) VALUES (1, 'requester'), (2, 'reviewer');

      CREATE TABLE student (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL
      );
      INSERT INTO student (id, first_name, last_name) VALUES (1, 'John', 'Doe');

      CREATE TABLE journal_entry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_ref TEXT NOT NULL,
        entry_type TEXT NOT NULL,
        description TEXT NOT NULL,
        student_id INTEGER,
        approval_status TEXT DEFAULT 'PENDING',
        approved_by_user_id INTEGER,
        approved_at DATETIME,
        is_posted INTEGER DEFAULT 0,
        posted_by_user_id INTEGER,
        posted_at DATETIME,
        is_voided INTEGER DEFAULT 0,
        voided_reason TEXT,
        voided_by_user_id INTEGER,
        voided_at DATETIME
      );
      INSERT INTO journal_entry (id, entry_ref, entry_type, description, student_id)
      VALUES (10, 'JE-10', 'FEE_PAYMENT', 'Payment approval test', 1);

      CREATE TABLE journal_entry_line (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        journal_entry_id INTEGER NOT NULL,
        debit_amount INTEGER DEFAULT 0,
        credit_amount INTEGER DEFAULT 0
      );
      INSERT INTO journal_entry_line (journal_entry_id, debit_amount, credit_amount)
      VALUES (10, 4000, 0), (10, 0, 4000);

      CREATE TABLE approval_workflow (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_name TEXT NOT NULL,
        entity_type TEXT NOT NULL
      );
      INSERT INTO approval_workflow (id, workflow_name, entity_type)
      VALUES (1, 'Journal Entry Approvals', 'JOURNAL_ENTRY');

      CREATE TABLE approval_request (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id INTEGER NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        requested_by_user_id INTEGER NOT NULL,
        final_approver_user_id INTEGER,
        completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        approval_rule_id INTEGER
      );
      INSERT INTO approval_request (
        id, workflow_id, entity_type, entity_id, status, requested_by_user_id, created_at
      ) VALUES (
        20, 1, 'JOURNAL_ENTRY', 10, 'PENDING', 1, '2026-02-14 08:00:00'
      );

      CREATE TABLE approval_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        approval_request_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        action_by INTEGER NOT NULL,
        action_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        previous_status TEXT,
        new_status TEXT,
        notes TEXT
      );
    `)

    registerFinanceApprovalHandlers()
  })

  afterEach(() => {
    db.close()
  })

  it('approvals:getQueue returns JOURNAL_ENTRY approvals from approval_request', async () => {
    const handler = handlerMap.get('approvals:getQueue')!
    const result = await handler({}, 'PENDING') as { success: boolean; data: Array<{ id: number; journal_entry_id: number }> }

    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
    expect(result.data[0].id).toBe(20)
    expect(result.data[0].journal_entry_id).toBe(10)
  })

  it('approvals:approve updates approval_request and posts journal entry', async () => {
    const handler = handlerMap.get('approvals:approve')!
    const result = await handler({}, 20, 'Approved by test', 2) as { success: boolean; error?: string }

    expect(result.success).toBe(true)

    const approval = db.prepare(`
      SELECT status, final_approver_user_id
      FROM approval_request
      WHERE id = 20
    `).get() as { status: string; final_approver_user_id: number }
    expect(approval.status).toBe('APPROVED')
    expect(approval.final_approver_user_id).toBe(2)

    const journal = db.prepare(`
      SELECT approval_status, is_posted, posted_by_user_id
      FROM journal_entry
      WHERE id = 10
    `).get() as { approval_status: string; is_posted: number; posted_by_user_id: number }
    expect(journal.approval_status).toBe('APPROVED')
    expect(journal.is_posted).toBe(1)
    expect(journal.posted_by_user_id).toBe(2)
  })

  it('approvals:reject sets status to REJECTED and voids journal entry', async () => {
    const handler = handlerMap.get('approvals:reject')!
    const result = await handler({}, 20, 'Rejected for test', 2) as { success: boolean; message?: string }

    expect(result.success).toBe(true)

    const approval = db.prepare(
      `SELECT status, final_approver_user_id FROM approval_request WHERE id = 20`
    ).get() as { status: string; final_approver_user_id: number }
    expect(approval.status).toBe('REJECTED')
    expect(approval.final_approver_user_id).toBe(2)

    const journal = db.prepare(
      `SELECT approval_status, is_voided, voided_reason FROM journal_entry WHERE id = 10`
    ).get() as { approval_status: string; is_voided: number; voided_reason: string }
    expect(journal.approval_status).toBe('REJECTED')
    expect(journal.is_voided).toBe(1)
    expect(journal.voided_reason).toBe('Rejected: Rejected for test')
  })

  it('approvals:getStats returns counts by status', async () => {
    const handler = handlerMap.get('approvals:getStats')!
    const result = await handler({}) as { success: boolean; data: { total: number; pending: number; approved: number; rejected: number } }

    expect(result.success).toBe(true)
    expect(result.data.pending).toBe(1)
    expect(result.data.approved).toBe(0)
    expect(result.data.rejected).toBe(0)
    expect(result.data.total).toBe(1)
  })

  it('approvals:approve returns not-found for already processed request', async () => {
    const handler = handlerMap.get('approvals:approve')!
    await handler({}, 20, 'First approval', 2)

    const result = await handler({}, 20, 'Second attempt', 2) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found or already processed')
  })

  it('approvals:reject returns not-found for already processed request', async () => {
    const approveHandler = handlerMap.get('approvals:approve')!
    await approveHandler({}, 20, 'Approved first', 2)

    const handler = handlerMap.get('approvals:reject')!
    const result = await handler({}, 20, 'Reject attempt', 2) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found or already processed')
  })

  it('approvals:approve rejects renderer user mismatch', async () => {
    const handler = handlerMap.get('approvals:approve')!
    const result = await handler({}, 20, 'Mismatch test', 999) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
  })

  it('approvals:reject rejects renderer user mismatch', async () => {
    const handler = handlerMap.get('approvals:reject')!
    const result = await handler({}, 20, 'Mismatch test', 999) as { success: boolean; error?: string }
    expect(result.success).toBe(false)
    expect(result.error).toContain('renderer user mismatch')
  })

  it('approvals:getQueue returns all statuses when filter is not PENDING', async () => {
    const approveHandler = handlerMap.get('approvals:approve')!
    await approveHandler({}, 20, 'Approved', 2)

    const handler = handlerMap.get('approvals:getQueue')!
    const result = await handler({}, 'ALL') as { success: boolean; data: Array<{ status: string }> }
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
    expect(result.data[0].status).toBe('APPROVED')
  })

  it('approvals:reject writes to approval_history table', async () => {
    const handler = handlerMap.get('approvals:reject')!
    await handler({}, 20, 'History test note', 2)

    const history = db.prepare(
      `SELECT action, action_by, previous_status, new_status, notes FROM approval_history WHERE approval_request_id = 20`
    ).get() as { action: string; action_by: number; previous_status: string; new_status: string; notes: string }
    expect(history.action).toBe('REJECTED')
    expect(history.action_by).toBe(2)
    expect(history.previous_status).toBe('PENDING')
    expect(history.new_status).toBe('REJECTED')
    expect(history.notes).toBe('History test note')
  })

  it('approvals:approve stores null in history when reviewNotes is empty string', async () => {
    const handler = handlerMap.get('approvals:approve')!
    const result = await handler({}, 20, '', 2) as { success: boolean }
    expect(result.success).toBe(true)

    const history = db.prepare(
      `SELECT notes FROM approval_history WHERE approval_request_id = 20`
    ).get() as { notes: string | null }
    expect(history.notes).toBeNull()
  })

  // ── Branch coverage: getQueue with 'ALL' filter returns all statuses ──
  it('approvals:getQueue returns all items when filter is ALL', async () => {
    // Approve request 20 first to have a mix of statuses
    const approveHandler = handlerMap.get('approvals:approve')!
    await approveHandler({}, 20, 'Approve it', 2)
    // Insert a new PENDING request
    db.exec(`
      INSERT INTO journal_entry (id, entry_ref, entry_type, description, student_id)
      VALUES (11, 'JE-11', 'FEE_PAYMENT', 'Another test', 1);
      INSERT INTO approval_request (id, workflow_id, entity_type, entity_id, status, requested_by_user_id)
      VALUES (21, 1, 'JOURNAL_ENTRY', 11, 'PENDING', 1);
    `)
    const handler = handlerMap.get('approvals:getQueue')!
    const result = await handler({}, 'ALL') as { success: boolean; data: unknown[] }
    expect(result.success).toBe(true)
    expect(result.data.length).toBeGreaterThanOrEqual(2)
  })

  // ── Branch coverage: approve/reject without approval_history table ──
  it('approvals:approve succeeds without approval_history table', async () => {
    db.exec('DROP TABLE IF EXISTS approval_history')
    const handler = handlerMap.get('approvals:approve')!
    const result = await handler({}, 20, 'Approve no history', 2) as { success: boolean }
    expect(result.success).toBe(true)
    // Verify journal_entry was still posted (entity_id = 10)
    const je = db.prepare('SELECT is_posted FROM journal_entry WHERE id = 10').get() as { is_posted: number }
    expect(je.is_posted).toBe(1)
  })

  it('approvals:reject succeeds without approval_history table', async () => {
    db.exec('DROP TABLE IF EXISTS approval_history')
    const handler = handlerMap.get('approvals:reject')!
    const result = await handler({}, 20, 'Reject no history', 2) as { success: boolean }
    expect(result.success).toBe(true)
    // Verify journal_entry was voided (entity_id = 10)
    const je = db.prepare('SELECT is_voided FROM journal_entry WHERE id = 10').get() as { is_voided: number }
    expect(je.is_voided).toBe(1)
  })

  // ── Branch coverage: getQueue without approval_rule_id column ──────
  it('approvals:getQueue works without approval_rule_id column in approval_request', async () => {
    // Recreate approval_request without approval_rule_id column
    db.exec(`
      DROP TABLE IF EXISTS approval_request;
      CREATE TABLE approval_request (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id INTEGER NOT NULL DEFAULT 1,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        requested_by_user_id INTEGER NOT NULL,
        final_approver_user_id INTEGER,
        status TEXT DEFAULT 'PENDING',
        completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO approval_request (id, workflow_id, entity_type, entity_id, requested_by_user_id, status)
      VALUES (20, 1, 'JOURNAL_ENTRY', 10, 1, 'PENDING');
    `)
    handlerMap.clear()
    registerFinanceApprovalHandlers()
    const handler = handlerMap.get('approvals:getQueue')!
    const result = await handler({}, 'PENDING') as { success: boolean; data: unknown[] }
    expect(result.success).toBe(true)
    expect(result.data.length).toBeGreaterThanOrEqual(1)
  })

  // ── Branch coverage: getQueue without approval_workflow table (L52, L64, L67) ──
  it('approvals:getQueue works without approval_workflow table', async () => {
    db.exec('DROP TABLE IF EXISTS approval_workflow')
    // Re-register since getQueue checks table existence at call time
    handlerMap.clear()
    registerFinanceApprovalHandlers()
    const handler = handlerMap.get('approvals:getQueue')!
    const result = await handler({}, 'PENDING') as { success: boolean; data: unknown[] }
    expect(result.success).toBe(true)
  })

  // ── Branch coverage: getQueue without approval_history table (L54, L70) ──
  it('approvals:getQueue works without approval_history table', async () => {
    db.exec('DROP TABLE IF EXISTS approval_history')
    handlerMap.clear()
    registerFinanceApprovalHandlers()
    const handler = handlerMap.get('approvals:getQueue')!
    const result = await handler({}, 'ALL') as { success: boolean; data: unknown[] }
    expect(result.success).toBe(true)
  })

  // ── Branch coverage: getQueue without both workflow and history tables ──
  it('approvals:getQueue works without workflow, history, and rule tables', async () => {
    db.exec('DROP TABLE IF EXISTS approval_workflow')
    db.exec('DROP TABLE IF EXISTS approval_history')
    db.exec('DROP TABLE IF EXISTS approval_rule')
    // Recreate approval_request without approval_rule_id column
    db.exec(`
      DROP TABLE IF EXISTS approval_request;
      CREATE TABLE approval_request (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id INTEGER NOT NULL DEFAULT 1,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        requested_by_user_id INTEGER NOT NULL,
        final_approver_user_id INTEGER,
        status TEXT DEFAULT 'PENDING',
        completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO approval_request (id, workflow_id, entity_type, entity_id, requested_by_user_id, status)
      VALUES (20, 1, 'JOURNAL_ENTRY', 10, 1, 'PENDING');
    `)
    handlerMap.clear()
    registerFinanceApprovalHandlers()
    const handler = handlerMap.get('approvals:getQueue')!
    const result = await handler({}, 'PENDING') as { success: boolean; data: unknown[] }
    expect(result.success).toBe(true)
  })

  // ── Branch coverage: columnExists when table does not exist (L27) ──
  it('approvals:getQueue handles missing approval_request table for columnExists (L27)', async () => {
    // Drop approval_rule to force hasRuleColumn → false via tableExists check
    db.exec('DROP TABLE IF EXISTS approval_rule')
    handlerMap.clear()
    registerFinanceApprovalHandlers()
    const handler = handlerMap.get('approvals:getQueue')!
    const result = await handler({}, 'PENDING') as { success: boolean; data: unknown[] }
    expect(result.success).toBe(true)
  })
})
