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

import { registerFinanceApprovalHandlers } from '../approval-handlers'

describe('finance approval handlers', () => {
  beforeEach(() => {
    handlerMap.clear()

    db = new Database(':memory:')
    db.exec(`
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
})
