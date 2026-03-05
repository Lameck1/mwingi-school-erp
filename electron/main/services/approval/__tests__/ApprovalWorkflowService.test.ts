import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { ApprovalWorkflowService } from '../../workflow/ApprovalWorkflowService'

vi.mock('../../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

describe('ApprovalWorkflowService', () => {
  let db: Database.Database
  let service: ApprovalWorkflowService

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
        user_id INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        table_name TEXT NOT NULL,
        record_id INTEGER,
        old_values TEXT,
        new_values TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

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
        ('PAYMENT', 50000, NULL, 2, 'PRINCIPAL');
    `)

    service = new ApprovalWorkflowService(db)
  })

  afterEach(() => {
    if (db) {db.close()}
  })

  it('should create approval request successfully', async () => {
    const result = service.createApprovalRequest({
      requestType: 'PAYMENT',
      entityType: 'fee_invoice',
      entityId: 1,
      amount: 30000,
      description: 'Payment request',
      requestedBy: 1
    })

    expect(result.success).toBe(true)
  })

  it('should return request ID', async () => {
    const result = service.createApprovalRequest({
      requestType: 'PAYMENT',
      entityType: 'fee_invoice',
      entityId: 1,
      amount: 25000,
      description: 'Request with ID',
      requestedBy: 1
    })

    expect(result.requestId).toBeDefined()
  })

  it('should approve request successfully', async () => {
    const request = service.createApprovalRequest({
      requestType: 'PAYMENT',
      entityType: 'fee_invoice',
      entityId: 1,
      amount: 30000,
      description: 'Approve request',
      requestedBy: 1
    })

    const result = service.processApproval({
      requestId: request.requestId as number,
      level: 1,
      decision: 'APPROVED',
      approverId: 1,
      comments: 'Approved'
    })

    expect(result.success).toBe(true)
  })

  it('should reject request successfully', async () => {
    const request = service.createApprovalRequest({
      requestType: 'PAYMENT',
      entityType: 'fee_invoice',
      entityId: 1,
      amount: 30000,
      description: 'Reject request',
      requestedBy: 1
    })

    const result = service.processApproval({
      requestId: request.requestId as number,
      level: 1,
      decision: 'REJECTED',
      approverId: 1,
      comments: 'Rejected'
    })

    expect(result.success).toBe(true)
  })

  it('should return approval history', () => {
    const request = service.createApprovalRequest({
      requestType: 'PAYMENT',
      entityType: 'fee_invoice',
      entityId: 1,
      amount: 30000,
      description: 'History request',
      requestedBy: 1
    })

    const history = service.getApprovalHistory(request.requestId as number)
    expect(history.request).toBeDefined()
    expect(Array.isArray(history.levels)).toBe(true)
  })

  it('should return pending requests', () => {
    service.createApprovalRequest({
      requestType: 'PAYMENT',
      entityType: 'fee_invoice',
      entityId: 1,
      amount: 30000,
      description: 'Pending request',
      requestedBy: 1
    })

    const pending = service.getApprovalQueue(1)
    expect(Array.isArray(pending)).toBe(true)
  })
})
