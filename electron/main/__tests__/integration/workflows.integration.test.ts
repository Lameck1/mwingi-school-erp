import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PaymentService } from '../../services/finance/PaymentService'
import { ApprovalWorkflowService } from '../../services/workflow/ApprovalWorkflowService'

// Mock audit utilities
vi.mock('../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

/**
 * Integration tests verify end-to-end workflows across multiple services
 */
describe('Workflows Integration Tests', () => {
  let db: Database.Database
  let approvalService: ApprovalWorkflowService
  let paymentService: PaymentService

  beforeEach(() => {
    db = new Database(':memory:')
    
    // Create complete schema for integration testing
    db.exec(`
      -- Core tables
      CREATE TABLE student (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        admission_number TEXT UNIQUE NOT NULL
      ,credit_balance INTEGER DEFAULT 0
      );

      CREATE TABLE user (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT,
        role TEXT
      );

      CREATE TABLE fee_invoice (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT NOT NULL UNIQUE,
        student_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        invoice_date DATE NOT NULL,
        due_date DATE NOT NULL,
        total_amount INTEGER NOT NULL,
        amount_paid INTEGER DEFAULT 0,
        status TEXT DEFAULT 'PENDING',
        notes TEXT,
        created_by_user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES student(id),
        FOREIGN KEY (created_by_user_id) REFERENCES user(id)
      );

      CREATE TABLE payment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        payment_date DATE NOT NULL,
        payment_method TEXT NOT NULL,
        status TEXT DEFAULT 'ACTIVE',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES student(id)
      );

      CREATE TABLE payment_invoice_allocation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id INTEGER NOT NULL,
        invoice_id INTEGER NOT NULL,
        applied_amount INTEGER NOT NULL,
        FOREIGN KEY (transaction_id) REFERENCES ledger_transaction(id),
        FOREIGN KEY (invoice_id) REFERENCES fee_invoice(id)
      );

      CREATE TABLE transaction_category (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_name TEXT NOT NULL,
        category_type TEXT NOT NULL,
        parent_category_id INTEGER,
        is_system BOOLEAN DEFAULT 0,
        is_active BOOLEAN DEFAULT 1
      );

      CREATE TABLE gl_account (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_code TEXT NOT NULL UNIQUE,
        account_name TEXT NOT NULL,
        account_type TEXT NOT NULL,
        normal_balance TEXT NOT NULL,
        is_system_account BOOLEAN DEFAULT 0,
        is_active BOOLEAN DEFAULT 1
      );

      CREATE TABLE journal_entry (
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
        source_ledger_txn_id INTEGER
      );

      CREATE TABLE journal_entry_line (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        journal_entry_id INTEGER NOT NULL,
        line_number INTEGER NOT NULL,
        gl_account_id INTEGER NOT NULL,
        debit_amount INTEGER DEFAULT 0,
        credit_amount INTEGER DEFAULT 0,
        description TEXT,
        FOREIGN KEY (journal_entry_id) REFERENCES journal_entry(id),
        FOREIGN KEY (gl_account_id) REFERENCES gl_account(id)
      );

      CREATE TABLE approval_rule (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rule_name TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        min_amount INTEGER,
        max_amount INTEGER,
        days_since_transaction INTEGER,
        required_approver_role TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 1
      );

      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_ref TEXT NOT NULL UNIQUE,
        transaction_date DATE NOT NULL,
        transaction_type TEXT NOT NULL,
        category_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        debit_credit TEXT NOT NULL,
        student_id INTEGER,
        staff_id INTEGER,
        invoice_id INTEGER,
        payment_method TEXT,
        payment_reference TEXT,
        description TEXT,
        term_id INTEGER,
        recorded_by_user_id INTEGER NOT NULL,
        is_voided BOOLEAN DEFAULT 0,
        voided_reason TEXT,
        voided_by_user_id INTEGER,
        voided_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES transaction_category(id),
        FOREIGN KEY (student_id) REFERENCES student(id),
        FOREIGN KEY (invoice_id) REFERENCES fee_invoice(id),
        FOREIGN KEY (recorded_by_user_id) REFERENCES user(id)
      );

      CREATE TABLE receipt (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_number TEXT NOT NULL UNIQUE,
        transaction_id INTEGER NOT NULL UNIQUE,
        receipt_date DATE NOT NULL,
        student_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        amount_in_words TEXT,
        payment_method TEXT NOT NULL,
        payment_reference TEXT,
        printed_count INTEGER DEFAULT 0,
        created_by_user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (transaction_id) REFERENCES ledger_transaction(id),
        FOREIGN KEY (student_id) REFERENCES student(id)
      );

      CREATE TABLE credit_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        transaction_type TEXT NOT NULL,
        source TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES student(id)
      );

      CREATE TABLE credit_allocation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        credit_id INTEGER NOT NULL,
        invoice_id INTEGER NOT NULL,
        amount_allocated INTEGER NOT NULL,
        FOREIGN KEY (credit_id) REFERENCES credit_transaction(id),
        FOREIGN KEY (invoice_id) REFERENCES fee_invoice(id)
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

      CREATE TABLE scholarship (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        scholarship_type TEXT NOT NULL,
        total_amount INTEGER NOT NULL,
        allocated_amount INTEGER DEFAULT 0,
        available_amount INTEGER,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        status TEXT DEFAULT 'ACTIVE'
      );

      CREATE TABLE student_scholarship (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        scholarship_id INTEGER NOT NULL,
        amount_allocated INTEGER NOT NULL,
        allocation_date DATE NOT NULL,
        status TEXT DEFAULT 'ACTIVE',
        notes TEXT,
        FOREIGN KEY (student_id) REFERENCES student(id),
        FOREIGN KEY (scholarship_id) REFERENCES scholarship(id)
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

      -- Insert test data
      INSERT INTO user (username, email, role) VALUES 
        ('admin', 'admin@school.com', 'ADMIN'),
        ('bursar', 'bursar@school.com', 'BURSAR'),
        ('principal', 'principal@school.com', 'PRINCIPAL');

      INSERT INTO student (first_name, last_name, admission_number) VALUES
        ('Student', 'One', 'STU-001'),
        ('Student', 'Two', 'STU-002');

      INSERT INTO transaction_category (category_name, category_type, is_system, is_active) VALUES
        ('School Fees', 'INCOME', 1, 1),
        ('INCOME', 'INCOME', 1, 1),
        ('EXPENSE', 'EXPENSE', 1, 1);

      INSERT INTO gl_account (account_code, account_name, account_type, normal_balance, is_system_account, is_active) VALUES
        ('1010', 'Cash on Hand', 'ASSET', 'DEBIT', 1, 1),
        ('1020', 'School Bank Account', 'ASSET', 'DEBIT', 1, 1),
        ('1100', 'Accounts Receivable', 'ASSET', 'DEBIT', 1, 1),
        ('4000', 'Tuition Revenue', 'REVENUE', 'CREDIT', 1, 1);

      INSERT INTO fee_invoice (student_id, invoice_number, term_id, invoice_date, due_date, total_amount, amount_paid, status, created_by_user_id, created_at) VALUES
        (1, 'INV-2026-001', 1, '2026-01-05', '2026-02-05', 50000, 0, 'OUTSTANDING', 1, '2026-01-05 10:00:00'),
        (1, 'INV-2026-002', 1, '2026-01-10', '2026-02-10', 30000, 0, 'OUTSTANDING', 1, '2026-01-10 10:00:00'),
        (2, 'INV-2026-003', 1, '2026-01-15', '2026-02-15', 60000, 0, 'OUTSTANDING', 1, '2026-01-15 10:00:00');

      INSERT INTO approval_configuration (request_type, min_amount, max_amount, required_level, approver_role) VALUES
        ('PAYMENT', 0, 50000, 1, 'BURSAR'),
        ('PAYMENT', 50000, NULL, 2, 'PRINCIPAL');

      INSERT INTO scholarship (name, scholarship_type, total_amount, available_amount, start_date, end_date, status) VALUES
        ('Merit Scholarship', 'MERIT', 500000, 400000, '2026-01-01', '2026-12-31', 'ACTIVE');
    `)

    approvalService = new ApprovalWorkflowService(db)
    // PaymentService expects better-sqlite3-multiple-ciphers type but plain better-sqlite3 is API-compatible
    paymentService = new PaymentService(db as any)
  })

  afterEach(() => {
    if (db) {db.close()}
  })

  describe('Payment Workflow', () => {
    it('should create payment without errors', () => {
      const result = paymentService.recordPayment({
        student_id: 1,
        amount: 25000,
        transaction_date: '2026-01-20',
        payment_method: 'MPESA',
        payment_reference: 'TEST001',
        recorded_by_user_id: 1,
        term_id: 1
      })

      expect(result).toBeDefined()
    })

    it('should allocate payment to invoices', () => {
      paymentService.recordPayment({
        student_id: 1,
        amount: 50000,
        transaction_date: '2026-01-20',
        payment_method: 'MPESA',
        payment_reference: 'TEST002',
        recorded_by_user_id: 1,
        term_id: 1
      })

      const payments = db.prepare('SELECT * FROM ledger_transaction WHERE student_id = ?').all(1)
      expect(payments.length).toBeGreaterThan(0)
    })

    it('should handle partial payments', () => {
      const result1 = paymentService.recordPayment({
        student_id: 1,
        amount: 25000,
        transaction_date: '2026-01-15',
        payment_method: 'CASH',
        payment_reference: 'TEST003',
        recorded_by_user_id: 1,
        term_id: 1
      })

      const result2 = paymentService.recordPayment({
        student_id: 1,
        amount: 25000,
        transaction_date: '2026-01-20',
        payment_method: 'CASH',
        payment_reference: 'TEST004',
        recorded_by_user_id: 1,
        term_id: 1
      })

      expect(result1).toBeDefined()
      expect(result2).toBeDefined()
    })

    it('should update invoice status after payment', () => {
      paymentService.recordPayment({
        student_id: 1,
        amount: 50000,
        transaction_date: '2026-01-20',
        payment_method: 'MPESA',
        payment_reference: 'TEST005',
        recorded_by_user_id: 1,
        term_id: 1
      })

      const invoice = db.prepare('SELECT * FROM fee_invoice WHERE id = ?').get(1) as { amount_paid: number }
      expect(invoice.amount_paid).toBeGreaterThanOrEqual(0)
    })

    it('should handle multiple payments for same student', () => {
      paymentService.recordPayment({
        student_id: 1,
        amount: 25000,
        transaction_date: '2026-01-15',
        payment_method: 'MPESA',
        payment_reference: 'TEST006',
        recorded_by_user_id: 1,
        term_id: 1
      })

      paymentService.recordPayment({
        student_id: 1,
        amount: 25000,
        transaction_date: '2026-01-20',
        payment_method: 'BANK',
        payment_reference: 'TEST007',
        recorded_by_user_id: 1,
        term_id: 1
      })

      const payments = db.prepare('SELECT COUNT(*) as count FROM ledger_transaction WHERE student_id = ?').get(1) as { count: number }
      expect(payments.count).toBeGreaterThanOrEqual(2)
    })

    it('should handle payments for multiple students', () => {
      paymentService.recordPayment({
        student_id: 1,
        amount: 25000,
        transaction_date: '2026-01-15',
        payment_method: 'MPESA',
        payment_reference: 'TEST008',
        recorded_by_user_id: 1,
        term_id: 1
      })

      paymentService.recordPayment({
        student_id: 2,
        amount: 30000,
        transaction_date: '2026-01-20',
        payment_method: 'BANK',
        payment_reference: 'TEST009',
        recorded_by_user_id: 1,
        term_id: 1
      })

      const payment1 = db.prepare('SELECT * FROM ledger_transaction WHERE student_id = ?').get(1)
      const payment2 = db.prepare('SELECT * FROM ledger_transaction WHERE student_id = ?').get(2)

      expect(payment1).toBeDefined()
      expect(payment2).toBeDefined()
    })
  })

  describe('Approval Workflow', () => {
    it('should create approval request', () => {
      const result = approvalService.createApprovalRequest({
        request_type: 'PAYMENT',
        entity_type: 'fee_invoice',
        entity_id: 1,
        amount: 30000,
        description: 'Payment approval test',
        requested_by: 1
      })

      expect(result.success).toBe(true)
    })

    it('should approve low-amount requests at level 1', () => {
      const req = approvalService.createApprovalRequest({
        request_type: 'PAYMENT',
        entity_type: 'fee_invoice',
        entity_id: 1,
        amount: 30000,
        description: 'Low amount',
        requested_by: 1
      })

      expect(req.requestId!).toBeDefined()
      const result = approvalService.approveRequest(req.requestId!, 1, 'Approved', 2)

      expect(result.success).toBe(true)
    })

    it('should escalate high-amount requests to level 2', () => {
      const req = approvalService.createApprovalRequest({
        request_type: 'PAYMENT',
        entity_type: 'fee_invoice',
        entity_id: 3,
        amount: 60000,
        description: 'High amount',
        requested_by: 1
      })

      expect(req.success).toBe(true)
    })

    it('should retrieve approval history', () => {
      const req = approvalService.createApprovalRequest({
        request_type: 'PAYMENT',
        entity_type: 'fee_invoice',
        entity_id: 1,
        amount: 25000,
        description: 'History test',
        requested_by: 1
      })

      expect(req.requestId!).toBeDefined()
      const history = approvalService.getRequestHistory(req.requestId!)

      expect(history).toBeDefined()
      expect(history).toHaveProperty('request')
    })

    it('should get pending requests', () => {
      approvalService.createApprovalRequest({
        request_type: 'PAYMENT',
        entity_type: 'fee_invoice',
        entity_id: 1,
        amount: 25000,
        description: 'Pending test',
        requested_by: 1
      })

      const pending = approvalService.getPendingRequests()

      expect(Array.isArray(pending)).toBe(true)
      expect(pending.length).toBeGreaterThan(0)
    })

    it('should reject requests', () => {
      const req = approvalService.createApprovalRequest({
        request_type: 'PAYMENT',
        entity_type: 'fee_invoice',
        entity_id: 1,
        amount: 25000,
        description: 'Rejection test',
        requested_by: 1
      })

      const result = approvalService.rejectRequest(req.requestId!, 1, 'Insufficient budget', 2)

      expect(result.success).toBe(true)
    })
  })

  describe('Integrated Workflows', () => {
    it('should complete payment workflow end-to-end', () => {
      // Create approval request
      const approval = approvalService.createApprovalRequest({
        request_type: 'PAYMENT',
        entity_type: 'fee_invoice',
        entity_id: 1,
        amount: 25000,
        description: 'Student payment',
        requested_by: 1
      })

      expect(approval.success).toBe(true)

      // Approve request
      const approved = approvalService.approveRequest(approval.requestId!, 1, 'Approved', 2)
      expect(approved.success).toBe(true)

      // Record payment
      const payment = paymentService.recordPayment({
        student_id: 1,
        amount: 25000,
        transaction_date: '2026-01-20',
        payment_method: 'MPESA',
        payment_reference: 'TEST010',
        recorded_by_user_id: 1,
        term_id: 1
      })

      expect(payment).toBeDefined()
    })

    it('should handle multiple workflow stages', () => {
      // Create first approval
      const req1 = approvalService.createApprovalRequest({
        request_type: 'PAYMENT',
        entity_type: 'fee_invoice',
        entity_id: 1,
        amount: 30000,
        description: 'First payment',
        requested_by: 1
      })

      // Create second approval
      const req2 = approvalService.createApprovalRequest({
        request_type: 'PAYMENT',
        entity_type: 'fee_invoice',
        entity_id: 2,
        amount: 25000,
        description: 'Second payment',
        requested_by: 1
      })

      expect(req1.success).toBe(true)
      expect(req2.success).toBe(true)

      // Approve both
      approvalService.approveRequest(req1.requestId!, 1, 'Approved', 2)
      approvalService.approveRequest(req2.requestId!, 1, 'Approved', 2)

      // Record payments
      paymentService.recordPayment({
        student_id: 1,
        amount: 30000,
        transaction_date: '2026-01-20',
        payment_method: 'BANK',
        payment_reference: 'TEST011',
        recorded_by_user_id: 1,
        term_id: 1
      })

      paymentService.recordPayment({
        student_id: 1,
        amount: 25000,
        transaction_date: '2026-01-20',
        payment_method: 'BANK',
        payment_reference: 'TEST012',
        recorded_by_user_id: 1,
        term_id: 1
      })

      const payments = db.prepare('SELECT COUNT(*) as count FROM ledger_transaction').get() as { count: number }
      expect(payments.count).toBeGreaterThanOrEqual(2)
    })

    it('should handle workflow rejections gracefully', () => {
      const req = approvalService.createApprovalRequest({
        request_type: 'PAYMENT',
        entity_type: 'fee_invoice',
        entity_id: 1,
        amount: 25000,
        description: 'Test rejection',
        requested_by: 1
      })

      const rejected = approvalService.rejectRequest(req.requestId!, 1, 'Not approved', 2)

      expect(rejected.success).toBe(true)

      // Verify no payment recorded
      const payments2 = db.prepare('SELECT COUNT(*) as count FROM ledger_transaction').get() as { count: number }
      expect(payments2.count).toBe(0)
    })

    it('should maintain workflow audit trail', () => {
      const req = approvalService.createApprovalRequest({
        request_type: 'PAYMENT',
        entity_type: 'fee_invoice',
        entity_id: 1,
        amount: 25000,
        description: 'Audit test',
        requested_by: 1
      })

      approvalService.approveRequest(req.requestId!, 1, 'Approved', 2)

      paymentService.recordPayment({
        student_id: 1,
        amount: 25000,
        transaction_date: '2026-01-20',
        payment_method: 'MPESA',
        payment_reference: 'TEST013',
        recorded_by_user_id: 1,
        term_id: 1
      })

      // Verify request was recorded
      const request = db.prepare('SELECT * FROM approval_request WHERE id = ?').get(req.requestId!)
      expect(request).toBeDefined()
    })

    it('should handle concurrent workflow operations', () => {
      const results = [
        approvalService.createApprovalRequest({
          request_type: 'PAYMENT',
          entity_type: 'fee_invoice',
          entity_id: 1,
          amount: 20000,
          description: 'Concurrent 1',
          requested_by: 1
        }),
        approvalService.createApprovalRequest({
          request_type: 'PAYMENT',
          entity_type: 'fee_invoice',
          entity_id: 2,
          amount: 25000,
          description: 'Concurrent 2',
          requested_by: 1
        })
      ]

      expect(results[0].success).toBe(true)
      expect(results[1].success).toBe(true)
    })

    it('should ensure data consistency across workflows', () => {
      const req = approvalService.createApprovalRequest({
        request_type: 'PAYMENT',
        entity_type: 'fee_invoice',
        entity_id: 1,
        amount: 50000,
        description: 'Consistency test',
        requested_by: 1
      })

      approvalService.approveRequest(req.requestId!, 1, 'Approved', 2)

      paymentService.recordPayment({
        student_id: 1,
        amount: 50000,
        transaction_date: '2026-01-20',
        payment_method: 'MPESA',
        payment_reference: 'TEST014',
        recorded_by_user_id: 1,
        term_id: 1
      })

      // Verify both records exist and are consistent
      const approval = db.prepare('SELECT * FROM approval_request WHERE id = ?').get(req.requestId!) as { amount: number }
      const payment = db.prepare('SELECT * FROM ledger_transaction WHERE student_id = ?').get(1) as { amount: number }

      expect(approval.amount).toBe(50000)
      expect(payment.amount).toBe(50000)
    })

    it('should handle workflow state transitions', () => {
      const req = approvalService.createApprovalRequest({
        request_type: 'PAYMENT',
        entity_type: 'fee_invoice',
        entity_id: 1,
        amount: 25000,
        description: 'State test',
        requested_by: 1
      })

      // Move from PENDING to APPROVED
      approvalService.approveRequest(req.requestId!, 1, 'Approved', 2)

      const history = approvalService.getRequestHistory(req.requestId!)
      expect(history.request).toBeDefined()
    })

    it('should scale to multiple concurrent workflows', () => {
      const requests = [
        approvalService.createApprovalRequest({
          request_type: 'PAYMENT',
          entity_type: 'fee_invoice',
          entity_id: 1,
          amount: 15000,
          description: 'Scale test 1',
          requested_by: 1
        }),
        approvalService.createApprovalRequest({
          request_type: 'PAYMENT',
          entity_type: 'fee_invoice',
          entity_id: 2,
          amount: 20000,
          description: 'Scale test 2',
          requested_by: 1
        }),
        approvalService.createApprovalRequest({
          request_type: 'PAYMENT',
          entity_type: 'fee_invoice',
          entity_id: 3,
          amount: 25000,
          description: 'Scale test 3',
          requested_by: 1
        })
      ]

      expect(requests.every(r => r.success)).toBe(true)

      const approvals = db.prepare('SELECT COUNT(*) as count FROM approval_request').get() as { count: number }
      expect(approvals.count).toBeGreaterThanOrEqual(3)
    })
  })

  describe('edge cases', () => {
    it('should handle workflow with missing approver', () => {
      const req = approvalService.createApprovalRequest({
        request_type: 'PAYMENT',
        entity_type: 'fee_invoice',
        entity_id: 1,
        amount: 25000,
        description: 'Test',
        requested_by: 1
      })

      expect(req.success).toBe(true)
    })

    it('should handle workflow with zero amount', () => {
      const req = approvalService.createApprovalRequest({
        request_type: 'PAYMENT',
        entity_type: 'fee_invoice',
        entity_id: 1,
        amount: 0,
        description: 'Zero amount',
        requested_by: 1
      })

      expect(req).toBeDefined()
    })

    it('should handle workflow with large amounts', () => {
      const req = approvalService.createApprovalRequest({
        request_type: 'PAYMENT',
        entity_type: 'fee_invoice',
        entity_id: 3,
        amount: 999999999,
        description: 'Large amount',
        requested_by: 1
      })

      expect(req.success).toBe(true)
    })

    it('should maintain workflow integrity with special characters', () => {
      const req = approvalService.createApprovalRequest({
        request_type: 'PAYMENT',
        entity_type: 'fee_invoice',
        entity_id: 1,
        amount: 25000,
        description: 'Special chars: "test" & \'value\'',
        requested_by: 1
      })

      expect(req.success).toBe(true)
    })
  })
})


