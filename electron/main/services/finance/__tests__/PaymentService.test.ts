import Database from 'better-sqlite3-multiple-ciphers'
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
            cheque_number TEXT,
            bank_name TEXT,
            is_approved BOOLEAN DEFAULT 0,
            approval_status TEXT,
            is_voided BOOLEAN DEFAULT 0,
            void_reason TEXT,
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

          INSERT INTO student (first_name, last_name) VALUES ('John', 'Doe');
          INSERT INTO transaction_category (category_name, category_type, is_system, is_active)
          VALUES ('School Fees', 'INCOME', 1, 1);
          INSERT INTO user (username) VALUES ('testuser');
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
    })
})
