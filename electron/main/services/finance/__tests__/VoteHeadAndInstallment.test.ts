import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../database', () => ({
    getDatabase: () => { throw new Error('Must inject db') }
}))

vi.mock('../../../database/utils/audit', () => ({
    logAudit: vi.fn()
}))

import { VoteHeadSpreadingService } from '../VoteHeadSpreadingService'
import { InstallmentPolicyService } from '../InstallmentPolicyService'

function createTestDb(): Database.Database {
    const db = new Database(':memory:')
    db.exec(`
    CREATE TABLE fee_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_name TEXT NOT NULL UNIQUE,
      description TEXT,
      is_active BOOLEAN DEFAULT 1,
      priority INTEGER NOT NULL DEFAULT 99,
      gl_account_id INTEGER
    );

    CREATE TABLE fee_invoice (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      student_id INTEGER NOT NULL,
      term_id INTEGER NOT NULL,
      invoice_date DATE,
      due_date DATE,
      total_amount INTEGER NOT NULL,
      amount_paid INTEGER DEFAULT 0,
      status TEXT DEFAULT 'PENDING',
      created_by_user_id INTEGER NOT NULL
    );

    CREATE TABLE invoice_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      fee_category_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      amount INTEGER NOT NULL,
      FOREIGN KEY (invoice_id) REFERENCES fee_invoice(id),
      FOREIGN KEY (fee_category_id) REFERENCES fee_category(id)
    );

    CREATE TABLE payment_invoice_allocation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      invoice_id INTEGER NOT NULL,
      applied_amount INTEGER NOT NULL CHECK (applied_amount > 0),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE payment_item_allocation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_allocation_id INTEGER NOT NULL,
      invoice_item_id INTEGER NOT NULL,
      applied_amount INTEGER NOT NULL CHECK (applied_amount > 0),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (payment_allocation_id) REFERENCES payment_invoice_allocation(id) ON DELETE CASCADE,
      FOREIGN KEY (invoice_item_id) REFERENCES invoice_item(id) ON DELETE CASCADE
    );

    CREATE TABLE academic_year (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year_name TEXT NOT NULL UNIQUE,
      start_date DATE, end_date DATE, is_current BOOLEAN DEFAULT 0
    );

    CREATE TABLE stream (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stream_code TEXT NOT NULL UNIQUE,
      stream_name TEXT NOT NULL,
      level_order INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN DEFAULT 1
    );

    CREATE TABLE user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL,
      is_active BOOLEAN DEFAULT 1
    );

    CREATE TABLE installment_policy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      policy_name TEXT NOT NULL,
      academic_year_id INTEGER NOT NULL,
      stream_id INTEGER,
      student_type TEXT,
      number_of_installments INTEGER NOT NULL CHECK (number_of_installments >= 2),
      is_active BOOLEAN NOT NULL DEFAULT 1,
      created_by_user_id INTEGER NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
      FOREIGN KEY (stream_id) REFERENCES stream(id),
      FOREIGN KEY (created_by_user_id) REFERENCES user(id)
    );

    CREATE TABLE installment_schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      policy_id INTEGER NOT NULL,
      installment_number INTEGER NOT NULL CHECK (installment_number >= 1),
      percentage INTEGER NOT NULL CHECK (percentage > 0 AND percentage <= 100),
      due_date DATE NOT NULL,
      description TEXT,
      FOREIGN KEY (policy_id) REFERENCES installment_policy(id) ON DELETE CASCADE,
      UNIQUE(policy_id, installment_number)
    );

    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER, action_type TEXT, table_name TEXT,
      record_id INTEGER, old_values TEXT, new_values TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

    // Seed fee categories with priority
    db.exec(`
    INSERT INTO fee_category (category_name, priority) VALUES ('Tuition', 1);
    INSERT INTO fee_category (category_name, priority) VALUES ('Lunch', 2);
    INSERT INTO fee_category (category_name, priority) VALUES ('Transport', 3);
    INSERT INTO fee_category (category_name, priority) VALUES ('Activity', 4);
  `)

    // Seed academic year and stream
    db.exec(`
    INSERT INTO academic_year (year_name, start_date, end_date, is_current) VALUES ('2026', '2026-01-01', '2026-12-31', 1);
    INSERT INTO stream (stream_code, stream_name, level_order) VALUES ('G7', 'Grade 7', 7);
    INSERT INTO user (username, password_hash, full_name, role) VALUES ('admin', 'hash', 'Admin', 'ADMIN');
  `)

    return db
}

function createInvoiceWithItems(db: Database.Database): number {
    db.prepare(`
    INSERT INTO fee_invoice (invoice_number, student_id, term_id, invoice_date, due_date, total_amount, created_by_user_id)
    VALUES ('INV-001', 1, 1, '2026-01-15', '2026-02-15', 150000, 1)
  `).run()
    const invoiceId = 1

    // Tuition: 80,000 (priority 1), Lunch: 30,000 (priority 2), Transport: 25,000 (priority 3), Activity: 15,000 (priority 4)
    db.prepare('INSERT INTO invoice_item (invoice_id, fee_category_id, description, amount) VALUES (?, 1, ?, ?)').run(invoiceId, 'Tuition', 8000000)
    db.prepare('INSERT INTO invoice_item (invoice_id, fee_category_id, description, amount) VALUES (?, 2, ?, ?)').run(invoiceId, 'Lunch', 3000000)
    db.prepare('INSERT INTO invoice_item (invoice_id, fee_category_id, description, amount) VALUES (?, 3, ?, ?)').run(invoiceId, 'Transport', 2500000)
    db.prepare('INSERT INTO invoice_item (invoice_id, fee_category_id, description, amount) VALUES (?, 4, ?, ?)').run(invoiceId, 'Activity', 1500000)

    return invoiceId
}

function createPaymentAllocation(db: Database.Database, invoiceId: number, amount: number): number {
    const result = db.prepare(
        'INSERT INTO payment_invoice_allocation (transaction_id, invoice_id, applied_amount) VALUES (1, ?, ?)'
    ).run(invoiceId, amount)
    return result.lastInsertRowid as number
}

// ============================================================================
// VoteHeadSpreadingService Tests
// ============================================================================

describe('VoteHeadSpreadingService', () => {
    let db: Database.Database

    beforeEach(() => {
        db = createTestDb()
    })

    afterEach(() => {
        db.close()
    })

    it('spreads payment across items in priority order', () => {
        const invoiceId = createInvoiceWithItems(db)
        const allocationId = createPaymentAllocation(db, invoiceId, 10000000) // 100,000 KSh

        const service = new VoteHeadSpreadingService(db)
        const result = service.spreadPaymentOverItems(allocationId, invoiceId, 10000000)

        // Priority order: Tuition (80K) → Lunch (30K) → Transport (25K) → Activity (15K)
        // 100K payment: fills Tuition (80K), then Lunch (20K of 30K)
        expect(result.total_applied).toBe(10000000)
        expect(result.remaining).toBe(0)
        expect(result.allocations).toHaveLength(2)
        expect(result.allocations[0]).toEqual({ invoice_item_id: 1, applied_amount: 8000000 }) // Tuition fully paid
        expect(result.allocations[1]).toEqual({ invoice_item_id: 2, applied_amount: 2000000 }) // Lunch partially paid
    })

    it('handles partial payment covering only highest-priority item', () => {
        const invoiceId = createInvoiceWithItems(db)
        const allocationId = createPaymentAllocation(db, invoiceId, 5000000) // 50,000 KSh

        const service = new VoteHeadSpreadingService(db)
        const result = service.spreadPaymentOverItems(allocationId, invoiceId, 5000000)

        // 50K < 80K Tuition, so only partial Tuition coverage
        expect(result.allocations).toHaveLength(1)
        expect(result.allocations[0]).toEqual({ invoice_item_id: 1, applied_amount: 5000000 })
        expect(result.remaining).toBe(0)
    })

    it('correctly computes vote-head balances after partial payment', () => {
        const invoiceId = createInvoiceWithItems(db)
        const allocationId = createPaymentAllocation(db, invoiceId, 10000000)

        const service = new VoteHeadSpreadingService(db)
        service.spreadPaymentOverItems(allocationId, invoiceId, 10000000)

        const balances = service.getVoteHeadBalance(invoiceId)
        expect(balances).toHaveLength(4)

        // Tuition: 80K total, 80K paid → 0 outstanding
        expect(balances[0]?.outstanding).toBe(0)
        // Lunch: 30K total, 20K paid → 10K outstanding
        expect(balances[1]?.outstanding).toBe(1000000)
        // Transport: 25K total, 0 paid → 25K outstanding
        expect(balances[2]?.outstanding).toBe(2500000)
        // Activity: 15K total, 0 paid → 15K outstanding
        expect(balances[3]?.outstanding).toBe(1500000)
    })

    it('accumulates multiple payment spreads correctly', () => {
        const invoiceId = createInvoiceWithItems(db)
        const service = new VoteHeadSpreadingService(db)

        // First payment: 50K → fills Tuition partially
        const alloc1 = createPaymentAllocation(db, invoiceId, 5000000)
        service.spreadPaymentOverItems(alloc1, invoiceId, 5000000)

        // Second payment: 50K → fills Tuition (30K remaining) + Lunch (20K of 30K)
        const alloc2 = createPaymentAllocation(db, invoiceId, 5000000)
        const result2 = service.spreadPaymentOverItems(alloc2, invoiceId, 5000000)

        expect(result2.allocations).toHaveLength(2)
        expect(result2.allocations[0]).toEqual({ invoice_item_id: 1, applied_amount: 3000000 }) // Remaining tuition
        expect(result2.allocations[1]).toEqual({ invoice_item_id: 2, applied_amount: 2000000 }) // Partial lunch

        const balances = service.getVoteHeadBalance(invoiceId)
        expect(balances[0]?.outstanding).toBe(0)        // Tuition fully paid
        expect(balances[1]?.outstanding).toBe(1000000)   // Lunch: 30K - 20K = 10K outstanding
        expect(balances[2]?.outstanding).toBe(2500000)   // Transport untouched
        expect(balances[3]?.outstanding).toBe(1500000)   // Activity untouched
    })

    it('handles overpayment with remaining > 0', () => {
        const invoiceId = createInvoiceWithItems(db)
        const allocationId = createPaymentAllocation(db, invoiceId, 20000000) // 200K exceeds total 150K

        const service = new VoteHeadSpreadingService(db)
        const result = service.spreadPaymentOverItems(allocationId, invoiceId, 20000000)

        // All items filled: 80K + 30K + 25K + 15K = 150K. Remaining = 50K
        expect(result.total_applied).toBe(15000000)
        expect(result.remaining).toBe(5000000)
        expect(result.allocations).toHaveLength(4)
    })
})

// ============================================================================
// InstallmentPolicyService Tests
// ============================================================================

describe('InstallmentPolicyService', () => {
    let db: Database.Database

    beforeEach(() => {
        db = createTestDb()
    })

    afterEach(() => {
        db.close()
    })

    it('creates a valid installment policy with schedule', () => {
        const service = new InstallmentPolicyService(db)
        const result = service.createPolicy({
            policy_name: 'Term 1 - 3 Installments',
            academic_year_id: 1,
            student_type: 'ALL',
            schedules: [
                { installment_number: 1, percentage: 40, due_date: '2026-01-15', description: 'Opening' },
                { installment_number: 2, percentage: 30, due_date: '2026-02-15', description: 'Mid-term' },
                { installment_number: 3, percentage: 30, due_date: '2026-03-15', description: 'Closing' },
            ]
        }, 1)

        expect(result.success).toBe(true)
        expect(result.id).toBeGreaterThan(0)

        const schedules = service.getInstallmentSchedule(result.id as number)
        expect(schedules).toHaveLength(3)
        expect(schedules[0]?.percentage).toBe(40)
        expect(schedules[1]?.percentage).toBe(30)
    })

    it('rejects schedule that does not sum to 100%', () => {
        const service = new InstallmentPolicyService(db)
        const result = service.createPolicy({
            policy_name: 'Bad Schedule',
            academic_year_id: 1,
            student_type: 'ALL',
            schedules: [
                { installment_number: 1, percentage: 60, due_date: '2026-01-15' },
                { installment_number: 2, percentage: 30, due_date: '2026-02-15' },
            ]
        }, 1)

        expect(result.success).toBe(false)
        expect(result.error).toContain('100')
    })

    it('rejects schedule with fewer than 2 installments', () => {
        const service = new InstallmentPolicyService(db)
        const result = service.createPolicy({
            policy_name: 'Single',
            academic_year_id: 1,
            student_type: 'ALL',
            schedules: [
                { installment_number: 1, percentage: 100, due_date: '2026-01-15' },
            ]
        }, 1)

        expect(result.success).toBe(false)
        expect(result.error).toContain('2 installments')
    })

    it('filters policies by academic year and student type', () => {
        const service = new InstallmentPolicyService(db)
        service.createPolicy({
            policy_name: 'Boarders Plan',
            academic_year_id: 1,
            student_type: 'BOARDER',
            schedules: [
                { installment_number: 1, percentage: 50, due_date: '2026-01-15' },
                { installment_number: 2, percentage: 50, due_date: '2026-02-15' },
            ]
        }, 1)

        service.createPolicy({
            policy_name: 'Universal Plan',
            academic_year_id: 1,
            student_type: 'ALL',
            schedules: [
                { installment_number: 1, percentage: 50, due_date: '2026-01-15' },
                { installment_number: 2, percentage: 50, due_date: '2026-02-15' },
            ]
        }, 1)

        const boarderPolicies = service.getPoliciesForTerm(1, undefined, 'BOARDER')
        expect(boarderPolicies).toHaveLength(2) // Boarder-specific + ALL

        const dayPolicies = service.getPoliciesForTerm(1, undefined, 'DAY_SCHOLAR')
        expect(dayPolicies).toHaveLength(1) // Only ALL
    })

    it('deactivates a policy (soft-delete)', () => {
        const service = new InstallmentPolicyService(db)
        const { id } = service.createPolicy({
            policy_name: 'To Deactivate',
            academic_year_id: 1,
            student_type: 'ALL',
            schedules: [
                { installment_number: 1, percentage: 50, due_date: '2026-01-15' },
                { installment_number: 2, percentage: 50, due_date: '2026-02-15' },
            ]
        }, 1)

        service.deactivatePolicy(id as number, 1)

        const policies = service.getPoliciesForTerm(1)
        expect(policies).toHaveLength(0) // Deactivated
    })
})
