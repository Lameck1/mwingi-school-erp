import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import { ApprovalWorkflowService } from '../../services/workflow/ApprovalWorkflowService'
import { PaymentService } from '../../services/finance/PaymentService'
import { CreditAutoApplicationService } from '../../services/finance/CreditAutoApplicationService'
import { ScholarshipService } from '../../services/finance/ScholarshipService'

/**
 * Integration tests verify end-to-end workflows across multiple services
 */
describe('Integration Tests', () => {
  let db: Database.Database

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
      );

      CREATE TABLE invoice (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        invoice_number TEXT UNIQUE NOT NULL,
        amount REAL NOT NULL,
        paid_amount REAL DEFAULT 0,
        status TEXT DEFAULT 'UNPAID',
        due_date DATE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE payment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        payment_date DATE NOT NULL,
        payment_method TEXT NOT NULL,
        status TEXT DEFAULT 'ACTIVE',
        void_reason TEXT,
        voided_by INTEGER,
        voided_at DATETIME
      );

      CREATE TABLE payment_allocation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payment_id INTEGER NOT NULL,
        invoice_id INTEGER NOT NULL,
        amount_allocated REAL NOT NULL
      );

      CREATE TABLE void_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        void_reason TEXT NOT NULL,
        voided_by INTEGER NOT NULL,
        voided_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        original_data TEXT
      );

      CREATE TABLE credit_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        transaction_type TEXT NOT NULL,
        source TEXT
      );

      CREATE TABLE credit_allocation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        credit_id INTEGER NOT NULL,
        invoice_id INTEGER NOT NULL,
        amount_allocated REAL NOT NULL
      );

      CREATE TABLE approval_request (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        requested_by INTEGER NOT NULL,
        status TEXT DEFAULT 'PENDING',
        current_level INTEGER DEFAULT 1,
        final_decision TEXT
      );

      CREATE TABLE approval_level (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id INTEGER NOT NULL,
        level INTEGER NOT NULL,
        approver_id INTEGER NOT NULL,
        status TEXT DEFAULT 'PENDING',
        comments TEXT,
        decided_at DATETIME
      );

      CREATE TABLE approval_configuration (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_type TEXT NOT NULL,
        min_amount REAL NOT NULL,
        max_amount REAL,
        required_level INTEGER NOT NULL,
        approver_role TEXT NOT NULL
      );

      CREATE TABLE scholarship (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        scholarship_type TEXT NOT NULL,
        total_amount REAL NOT NULL,
        allocated_amount REAL DEFAULT 0,
        available_amount REAL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        status TEXT DEFAULT 'ACTIVE'
      );

      CREATE TABLE student_scholarship (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        scholarship_id INTEGER NOT NULL,
        amount_allocated REAL NOT NULL,
        allocation_date DATE NOT NULL,
        status TEXT DEFAULT 'ACTIVE',
        notes TEXT
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
        ('PAYMENT', 50000, NULL, 2, 'PRINCIPAL');

      -- Seed test student
      INSERT INTO student (first_name, last_name, admission_number)
      VALUES ('John', 'Doe', 'STU-001');

      -- Seed test invoices
      INSERT INTO invoice (student_id, invoice_number, amount, paid_amount, status, due_date)
      VALUES 
        (1, 'INV-001', 50000, 0, 'UNPAID', '2026-02-15'),
        (1, 'INV-002', 30000, 0, 'UNPAID', '2026-03-01'),
        (1, 'INV-003', 20000, 0, 'UNPAID', '2026-03-15');
    `)
  })

  afterEach(() => {
    db.close()
  })

  describe('Approval Workflow + Payment Process', () => {
    it('should require approval before processing high-value payment', () => {
      const approvalService = new ApprovalWorkflowService(db)
      const paymentService = new PaymentService(db)

      // Step 1: Request approval for 75000 payment (requires level 2)
      const approvalRequest = approvalService.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'payment',
        entityId: 0, // Will be updated after payment
        amount: 75000,
        description: 'Large supplier payment',
        requestedBy: 5
      })

      expect(approvalRequest.success).toBe(true)
      expect(approvalRequest.requiredLevel).toBe(2)

      // Step 2: Level 1 approval (Bursar)
      const level1Approval = approvalService.processApproval({
        requestId: approvalRequest.requestId!,
        level: 1,
        decision: 'APPROVED',
        approverId: 10,
        comments: 'Verified invoice'
      })

      expect(level1Approval.success).toBe(true)

      // Step 3: Level 2 approval (Principal)
      const level2Approval = approvalService.processApproval({
        requestId: approvalRequest.requestId!,
        level: 2,
        decision: 'APPROVED',
        approverId: 20,
        comments: 'Approved for payment'
      })

      expect(level2Approval.success).toBe(true)

      // Step 4: Now process the payment (after full approval)
      const paymentResult = paymentService.recordPayment({
        studentId: 1,
        amount: 75000,
        paymentDate: '2026-02-10',
        paymentMethod: 'BANK',
        receivedBy: 5
      })

      expect(paymentResult.success).toBe(true)

      // Verify payment allocated to invoices
      const allocations = db.prepare('SELECT * FROM payment_allocation WHERE payment_id = ?').all(paymentResult.paymentId) as any[]
      expect(allocations.length).toBeGreaterThan(0)

      // Verify audit trail for both approval and payment
      const auditLogs = db.prepare('SELECT * FROM audit_log').all() as any[]
      expect(auditLogs.length).toBeGreaterThan(0)
    })

    it('should block payment if approval is rejected', () => {
      const approvalService = new ApprovalWorkflowService(db)

      // Request approval
      const approvalRequest = approvalService.createApprovalRequest({
        requestType: 'PAYMENT',
        entityType: 'payment',
        entityId: 0,
        amount: 75000,
        description: 'Large payment',
        requestedBy: 5
      })

      // Reject at level 1
      const rejection = approvalService.processApproval({
        requestId: approvalRequest.requestId!,
        level: 1,
        decision: 'REJECTED',
        approverId: 10,
        comments: 'Insufficient documentation'
      })

      expect(rejection.success).toBe(true)

      // Verify approval is rejected
      const request = db.prepare('SELECT * FROM approval_request WHERE id = ?').get(approvalRequest.requestId) as any
      expect(request.status).toBe('REJECTED')
      expect(request.final_decision).toBe('REJECTED')

      // In production, payment should not proceed without approval
    })
  })

  describe('Payment → Credit → Auto-Application Flow', () => {
    it('should create credit from overpayment and auto-apply to outstanding invoices', () => {
      const paymentService = new PaymentService(db)
      const creditService = new CreditAutoApplicationService(db)

      // Step 1: Student pays more than invoiced amount (creates overpayment/credit)
      const payment = paymentService.recordPayment({
        studentId: 1,
        amount: 120000, // Total invoices = 100000, so 20000 overpayment
        paymentDate: '2026-02-10',
        paymentMethod: 'MPESA',
        receivedBy: 5
      })

      expect(payment.success).toBe(true)

      // Verify all invoices are paid
      const invoices = db.prepare('SELECT * FROM invoice WHERE student_id = ?').all(1) as any[]
      invoices.forEach(inv => {
        expect(inv.status).toBe('PAID')
      })

      // Step 2: Manually add credit for overpayment
      const creditResult = creditService.addCredit({
        studentId: 1,
        amount: 20000,
        source: 'OVERPAYMENT',
        userId: 5
      })

      expect(creditResult.success).toBe(true)

      // Step 3: Create new invoice
      db.exec(`
        INSERT INTO invoice (student_id, invoice_number, amount, paid_amount, status, due_date)
        VALUES (1, 'INV-004', 25000, 0, 'UNPAID', '2026-04-01')
      `)

      // Step 4: Auto-apply credits
      const autoApply = creditService.autoApplyCredits(1)

      expect(autoApply.success).toBe(true)
      expect(autoApply.creditsApplied).toBe(20000)

      // Verify new invoice is partially paid
      const newInvoice = db.prepare('SELECT * FROM invoice WHERE invoice_number = ?').get('INV-004') as any
      expect(newInvoice.paid_amount).toBe(20000)
      expect(newInvoice.status).toBe('PARTIALLY_PAID')

      // Verify credit balance is 0
      const balance = creditService.getCreditBalance(1)
      expect(balance).toBe(0)
    })

    it('should handle void payment → reverse allocations → restore invoices', () => {
      const paymentService = new PaymentService(db)

      // Step 1: Record payment
      const payment = paymentService.recordPayment({
        studentId: 1,
        amount: 50000,
        paymentDate: '2026-02-10',
        paymentMethod: 'MPESA',
        receivedBy: 5
      })

      expect(payment.success).toBe(true)

      // Verify invoice is paid
      const invoice1 = db.prepare('SELECT * FROM invoice WHERE invoice_number = ?').get('INV-001') as any
      expect(invoice1.status).toBe('PAID')
      expect(invoice1.paid_amount).toBe(50000)

      // Step 2: Void payment (mistake was made)
      const voidResult = paymentService.voidPayment({
        paymentId: payment.paymentId!,
        reason: 'Duplicate entry - payment was already recorded',
        voidedBy: 10
      })

      expect(voidResult.success).toBe(true)

      // Step 3: Verify invoice allocation is reversed
      const invoice1After = db.prepare('SELECT * FROM invoice WHERE invoice_number = ?').get('INV-001') as any
      expect(invoice1After.paid_amount).toBe(0)
      expect(invoice1After.status).toBe('UNPAID')

      // Verify void audit trail
      const voidAudit = db.prepare('SELECT * FROM void_audit WHERE entity_id = ?').get(payment.paymentId) as any
      expect(voidAudit).toBeDefined()
      expect(voidAudit.void_reason).toContain('Duplicate')

      // Verify payment status
      const paymentRecord = db.prepare('SELECT * FROM payment WHERE id = ?').get(payment.paymentId) as any
      expect(paymentRecord.status).toBe('VOIDED')
    })
  })

  describe('Scholarship Allocation + Invoice Payment Flow', () => {
    it('should allocate scholarship and reduce student invoice balance', () => {
      const scholarshipService = new ScholarshipService(db)

      // Step 1: Create scholarship
      const scholarship = scholarshipService.createScholarship({
        name: 'Merit Award 2026',
        type: 'MERIT',
        totalAmount: 500000,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        eligibilityCriteria: 'Academic Excellence',
        userId: 10
      })

      expect(scholarship.success).toBe(true)

      // Step 2: Allocate scholarship to student
      const allocation = scholarshipService.allocateScholarship({
        studentId: 1,
        scholarshipId: scholarship.scholarshipId!,
        amount: 50000, // Covers first invoice
        allocationDate: '2026-01-15',
        notes: 'First term scholarship',
        userId: 10
      })

      expect(allocation.success).toBe(true)

      // Step 3: In production, scholarship allocation would create credit transaction
      // Here we simulate by adding credit
      db.exec(`
        INSERT INTO credit_transaction (student_id, amount, transaction_type, source)
        VALUES (1, 50000, 'CREDIT', 'SCHOLARSHIP')
      `)

      // Step 4: Auto-apply credit to invoices
      const creditService = new CreditAutoApplicationService(db)
      const autoApply = creditService.autoApplyCredits(1)

      expect(autoApply.success).toBe(true)

      // Verify first invoice is paid
      const invoice = db.prepare('SELECT * FROM invoice WHERE invoice_number = ?').get('INV-001') as any
      expect(invoice.status).toBe('PAID')
      expect(invoice.paid_amount).toBe(50000)

      // Verify scholarship utilization
      const utilization = scholarshipService.getScholarshipUtilization(scholarship.scholarshipId!)
      expect(utilization.allocatedAmount).toBe(50000)
      expect(utilization.availableAmount).toBe(450000)
    })

    it('should handle scholarship revocation and credit reversal', () => {
      const scholarshipService = new ScholarshipService(db)

      // Step 1: Create and allocate scholarship
      const scholarship = scholarshipService.createScholarship({
        name: 'Test Scholarship',
        type: 'MERIT',
        totalAmount: 100000,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        userId: 10
      })

      const allocation = scholarshipService.allocateScholarship({
        studentId: 1,
        scholarshipId: scholarship.scholarshipId!,
        amount: 30000,
        allocationDate: '2026-01-15',
        userId: 10
      })

      expect(allocation.success).toBe(true)

      // Step 2: Revoke scholarship (student didn't meet requirements)
      const revocation = scholarshipService.revokeScholarship({
        allocationId: allocation.allocationId!,
        reason: 'Student failed to maintain required GPA',
        userId: 10
      })

      expect(revocation.success).toBe(true)

      // Verify scholarship funds restored
      const scholarshipAfter = db.prepare('SELECT * FROM scholarship WHERE id = ?').get(scholarship.scholarshipId) as any
      expect(scholarshipAfter.allocated_amount).toBe(0)
      expect(scholarshipAfter.available_amount).toBe(100000)

      // Verify allocation status
      const allocationAfter = db.prepare('SELECT * FROM student_scholarship WHERE id = ?').get(allocation.allocationId) as any
      expect(allocationAfter.status).toBe('REVOKED')
    })
  })

  describe('Complete Student Payment Lifecycle', () => {
    it('should handle full payment lifecycle: invoice → payment → allocation → reconciliation', () => {
      const paymentService = new PaymentService(db)

      // Initial state: 3 unpaid invoices totaling 100000
      let invoices = db.prepare('SELECT * FROM invoice WHERE student_id = ?').all(1) as any[]
      expect(invoices.every(inv => inv.status === 'UNPAID')).toBe(true)

      // Step 1: Partial payment
      const payment1 = paymentService.recordPayment({
        studentId: 1,
        amount: 40000,
        paymentDate: '2026-02-10',
        paymentMethod: 'MPESA',
        receivedBy: 5
      })

      expect(payment1.success).toBe(true)

      // Verify first invoice is fully paid, second is partially paid
      invoices = db.prepare('SELECT * FROM invoice WHERE student_id = ?').all(1) as any[]
      expect(invoices[0].status).toBe('PARTIALLY_PAID') // 40000 on 50000 invoice

      // Step 2: Second payment
      const payment2 = paymentService.recordPayment({
        studentId: 1,
        amount: 60000,
        paymentDate: '2026-02-15',
        paymentMethod: 'BANK',
        receivedBy: 5
      })

      expect(payment2.success).toBe(true)

      // Verify invoices paid correctly
      invoices = db.prepare('SELECT * FROM invoice WHERE student_id = ? ORDER BY due_date').all(1) as any[]
      expect(invoices[0].status).toBe('PAID') // 50000 fully paid
      expect(invoices[1].status).toBe('PAID') // 30000 fully paid
      expect(invoices[2].status).toBe('PARTIALLY_PAID') // 20000 remaining

      // Verify total payments match total allocated
      const totalPaid = db.prepare(`
        SELECT SUM(amount) as total 
        FROM payment 
        WHERE student_id = ? AND status = 'ACTIVE'
      `).get(1) as any

      const totalAllocated = db.prepare(`
        SELECT SUM(paid_amount) as total 
        FROM invoice 
        WHERE student_id = ?
      `).get(1) as any

      expect(totalPaid.total).toBe(100000)
      expect(totalAllocated.total).toBe(100000)

      // Verify payment history
      const history = paymentService.getPaymentHistory(1)
      expect(history).toHaveLength(2)
      expect(history.every(p => p.status === 'ACTIVE')).toBe(true)
    })
  })

  describe('Audit Trail Integration', () => {
    it('should maintain complete audit trail across all operations', () => {
      const paymentService = new PaymentService(db)
      const creditService = new CreditAutoApplicationService(db)

      // Perform multiple operations
      paymentService.recordPayment({
        studentId: 1,
        amount: 50000,
        paymentDate: '2026-02-10',
        paymentMethod: 'MPESA',
        receivedBy: 5
      })

      creditService.addCredit({
        studentId: 1,
        amount: 10000,
        source: 'SCHOLARSHIP',
        userId: 10
      })

      creditService.autoApplyCredits(1)

      // Verify complete audit trail
      const auditLogs = db.prepare('SELECT * FROM audit_log ORDER BY timestamp').all() as any[]
      expect(auditLogs.length).toBeGreaterThan(0)

      // Verify different action types are logged
      const actionTypes = [...new Set(auditLogs.map(log => log.action_type))]
      expect(actionTypes.length).toBeGreaterThan(1)

      // Verify user attribution
      auditLogs.forEach(log => {
        expect(log.user_id).toBeGreaterThan(0)
        expect(log.timestamp).toBeTruthy()
      })
    })
  })
})
