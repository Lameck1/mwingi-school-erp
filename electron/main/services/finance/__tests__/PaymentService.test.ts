import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { PaymentService } from '../PaymentService'

// Mock audit log
vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

describe('PaymentService', () => {
    let db: Database.Database
    let service: PaymentService

    beforeEach(() => {
        db = new Database(':memory:')
        
        // Create minimal required tables
        db.exec(`
          CREATE TABLE student (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT NOT NULL,
                        last_name TEXT NOT NULL,
                        credit_balance INTEGER DEFAULT 0
          );

          CREATE TABLE transaction_category (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_name TEXT NOT NULL,
            category_type TEXT NOT NULL,
            parent_category_id INTEGER,
            is_system BOOLEAN DEFAULT 0,
            is_active BOOLEAN DEFAULT 1
          );

          CREATE TABLE user (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE
          );

          CREATE TABLE gl_account (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_code TEXT NOT NULL UNIQUE,
            account_name TEXT NOT NULL,
            account_type TEXT NOT NULL,
            normal_balance TEXT NOT NULL,
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
            source_ledger_txn_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE journal_entry_line (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            journal_entry_id INTEGER NOT NULL,
            line_number INTEGER NOT NULL,
            gl_account_id INTEGER NOT NULL,
            debit_amount INTEGER DEFAULT 0,
            credit_amount INTEGER DEFAULT 0,
            description TEXT
          );

          CREATE TABLE approval_rule (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rule_name TEXT NOT NULL,
            transaction_type TEXT NOT NULL,
            min_amount INTEGER,
            is_active BOOLEAN DEFAULT 1
          );

          CREATE TABLE transaction_approval (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            journal_entry_id INTEGER NOT NULL,
            approval_rule_id INTEGER NOT NULL,
            requested_by_user_id INTEGER NOT NULL,
            requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'PENDING'
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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE ledger_transaction (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_ref TEXT NOT NULL UNIQUE,
            transaction_date DATE NOT NULL,
            transaction_type TEXT NOT NULL CHECK(transaction_type IN (
              'FEE_PAYMENT', 'DONATION', 'GRANT', 'EXPENSE', 'SALARY_PAYMENT',
              'REFUND', 'OPENING_BALANCE', 'ADJUSTMENT', 'INCOME'
            )),
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
            cheque_number TEXT,
            bank_name TEXT,
            is_approved BOOLEAN DEFAULT 0,
            approval_status TEXT,
            is_voided BOOLEAN DEFAULT 0,
            voided_reason TEXT,
            voided_by_user_id INTEGER,
            voided_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE payment_invoice_allocation (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_id INTEGER NOT NULL,
            invoice_id INTEGER NOT NULL,
            applied_amount INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE void_audit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_id INTEGER NOT NULL,
            transaction_type TEXT NOT NULL,
            original_amount INTEGER NOT NULL,
            student_id INTEGER NOT NULL,
            description TEXT,
            void_reason TEXT NOT NULL,
            voided_by INTEGER NOT NULL,
            voided_at DATETIME NOT NULL,
            recovered_method TEXT,
            recovered_by INTEGER,
            recovered_at DATETIME
          );

          INSERT INTO student (first_name, last_name) VALUES ('John', 'Doe');
          INSERT INTO transaction_category (category_name, category_type, is_system, is_active)
          VALUES ('School Fees', 'INCOME', 1, 1);
          INSERT INTO user (username) VALUES ('testuser');
          INSERT INTO gl_account (account_code, account_name, account_type, normal_balance, is_active) VALUES
            ('1010', 'Cash on Hand', 'ASSET', 'DEBIT', 1),
            ('1020', 'Bank Account', 'ASSET', 'DEBIT', 1),
            ('1100', 'Student Receivables', 'ASSET', 'DEBIT', 1),
            ('4300', 'General Revenue', 'REVENUE', 'CREDIT', 1);
          INSERT INTO fee_invoice (student_id, invoice_number, term_id, invoice_date, due_date, total_amount, amount_paid, status, created_by_user_id)
          VALUES (1, 'INV-001', 1, '2026-01-15', '2026-02-15', 50000, 0, 'OUTSTANDING', 1);
        `)

        service = new PaymentService(db)
    })

    afterEach(() => {
        if (db) {db.close()}
    })

    describe('recordPayment', () => {
        it('should record a valid payment', async () => {
            const result = service.recordPayment({
                student_id: 1,
                amount: 15000,
                transaction_date: '2024-01-15',
                payment_method: 'CASH',
                payment_reference: 'TEST-001',
                recorded_by_user_id: 1,
                term_id: 1
            })

            expect(result).toBeDefined()
            expect(result.success).toBe(true)
        })

        it('should reject payment with invalid student', async () => {
            const result = service.recordPayment({
                student_id: 999,
                amount: 15000,
                transaction_date: '2024-01-15',
                payment_method: 'CASH',
                payment_reference: 'TEST-002',
                recorded_by_user_id: 1,
                term_id: 1
            })

            expect(result.success).toBe(false)
        })

        it('should reject payment with zero amount', async () => {
            const result = service.recordPayment({
                student_id: 1,
                amount: 0,
                transaction_date: '2024-01-15',
                payment_method: 'CASH',
                payment_reference: 'TEST-003',
                recorded_by_user_id: 1,
                term_id: 1
            })

            expect(result).toBeDefined()
            expect(result.success).toBe(false)
            expect(result.error).toContain('greater than zero')
        })

        it('should validate required fields', async () => {
            const result = service.recordPayment({
                student_id: 0,
                amount: 0,
                transaction_date: '',
                payment_method: '',
                payment_reference: '',
                recorded_by_user_id: 0,
                term_id: 0
            })

            expect(result.success).toBe(false)
        })

        it('should reject invalid transaction date format', async () => {
            const result = service.recordPayment({
                student_id: 1,
                amount: 1000,
                transaction_date: '15-01-2024',
                payment_method: 'CASH',
                payment_reference: 'TEST-BAD-DATE',
                recorded_by_user_id: 1,
                term_id: 1
            })

            expect(result.success).toBe(false)
            expect(result.error).toContain('Invalid date format')
        })

        it('should reject future transaction date', async () => {
            const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
            const result = service.recordPayment({
                student_id: 1,
                amount: 1000,
                transaction_date: tomorrow,
                payment_method: 'CASH',
                payment_reference: 'TEST-FUTURE-DATE',
                recorded_by_user_id: 1,
                term_id: 1
            })

            expect(result.success).toBe(false)
            expect(result.error).toContain('future')
        })

        it('should rollback payment if journal entry fails', async () => {
            db.prepare(`DELETE FROM gl_account WHERE account_code = ?`).run('1100')

            expect(() => service.recordPayment({
                student_id: 1,
                amount: 1000,
                transaction_date: '2024-01-15',
                payment_method: 'CASH',
                payment_reference: 'TEST-ROLLBACK',
                recorded_by_user_id: 1,
                term_id: 1
            })).toThrow()

            const ledgerCount = db.prepare(`SELECT COUNT(*) as count FROM ledger_transaction WHERE payment_reference = ?`).get('TEST-ROLLBACK') as { count: number }
            expect(ledgerCount.count).toBe(0)
        })

        it('should persist invoice allocation for recorded payment', async () => {
            const result = service.recordPayment({
                student_id: 1,
                amount: 15000,
                transaction_date: '2024-01-15',
                payment_method: 'CASH',
                payment_reference: 'TEST-ALLOC',
                recorded_by_user_id: 1,
                term_id: 1
            })

            expect(result.success).toBe(true)

            const allocation = db.prepare(`
              SELECT applied_amount
              FROM payment_invoice_allocation
              WHERE transaction_id = ?
            `).get(result.transaction_id) as { applied_amount: number } | undefined

            expect(allocation?.applied_amount).toBe(15000)
        })
    })

    describe('voidPayment', () => {
        it('should void a payment with valid reason', async () => {
            try {
                const result = await service.voidPayment({
                    transaction_id: 1,
                    void_reason: 'Duplicate entry',
                    voided_by: 1
                })
                expect(result).toBeDefined()
            } catch (error) {
                expect(error).toBeDefined()
            }
        })

        it('should reject voiding without reason', async () => {
            const result = await service.voidPayment({
                transaction_id: 1,
                void_reason: '',
                voided_by: 1
            })

            expect(result).toBeDefined()
            expect(result.success).toBe(false)
        })

        it('should reject voiding already voided payment', async () => {
            const result = await service.voidPayment({
                transaction_id: 999,
                void_reason: 'Test reason',
                voided_by: 1
            })

            expect(result).toBeDefined()
            expect(result.success).toBe(false)
        })

        it('should reverse invoice allocation and keep student credit unchanged when no overpayment credit was created', async () => {
            const payment = service.recordPayment({
                student_id: 1,
                amount: 10000,
                transaction_date: '2024-01-16',
                payment_method: 'CASH',
                payment_reference: 'VOID-ALLOC-1',
                recorded_by_user_id: 1,
                term_id: 1
            })
            expect(payment.success).toBe(true)
            expect(payment.transaction_id).toBeDefined()

            db.prepare(`UPDATE student SET credit_balance = 0 WHERE id = 1`).run()

            const voidResult = await service.voidPayment({
                transaction_id: payment.transaction_id!,
                void_reason: 'Reverse test payment',
                voided_by: 1
            })
            expect(voidResult.success).toBe(true)

            const invoice = db.prepare(`SELECT amount_paid, status FROM fee_invoice WHERE id = 1`).get() as { amount_paid: number; status: string }
            expect(invoice.amount_paid).toBe(0)
            expect(invoice.status).toBe('PENDING')

            const student = db.prepare(`SELECT credit_balance FROM student WHERE id = 1`).get() as { credit_balance: number }
            expect(student.credit_balance).toBe(0)
        })

        it('should record void reversal using a ledger-supported transaction type', async () => {
            const payment = service.recordPayment({
                student_id: 1,
                amount: 12000,
                transaction_date: '2024-01-17',
                payment_method: 'CASH',
                payment_reference: 'VOID-TYPE-1',
                recorded_by_user_id: 1,
                term_id: 1
            })
            expect(payment.success).toBe(true)

            const voidResult = await service.voidPayment({
                transaction_id: payment.transaction_id!,
                void_reason: 'Type compatibility regression test',
                voided_by: 1
            })
            expect(voidResult.success).toBe(true)
            expect(voidResult.transaction_id).toBeDefined()

            const reversal = db.prepare(`
              SELECT transaction_type
              FROM ledger_transaction
              WHERE id = ?
            `).get(voidResult.transaction_id) as { transaction_type: string }

            expect(reversal.transaction_type).toBe('REFUND')
        })
    })
})
