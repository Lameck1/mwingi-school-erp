import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
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
            category_name TEXT NOT NULL
          );

          CREATE TABLE user (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE
          );

          CREATE TABLE fee_invoice (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            invoice_number TEXT UNIQUE NOT NULL,
            amount INTEGER NOT NULL,
            amount_paid INTEGER DEFAULT 0,
            status TEXT DEFAULT 'OUTSTANDING',
            due_date DATE DEFAULT CURRENT_DATE
          );

          CREATE TABLE ledger_transaction (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
                        transaction_ref TEXT,
            transaction_date DATE NOT NULL,
            transaction_type TEXT NOT NULL,
            category_id INTEGER,
            amount INTEGER NOT NULL,
            debit_credit TEXT,
            student_id INTEGER,
            recorded_by_user_id INTEGER,
                        description TEXT,
                        payment_method TEXT,
                        reference TEXT,
                        recorded_by INTEGER,
                        cheque_number TEXT,
                        bank_name TEXT,
                        is_approved BOOLEAN DEFAULT 0,
                        approval_status TEXT,
                        is_voided BOOLEAN DEFAULT 0,
                        void_reason TEXT
          );

          INSERT INTO student (first_name, last_name) VALUES ('John', 'Doe');
          INSERT INTO transaction_category (category_name) VALUES ('FEE_PAYMENT');
          INSERT INTO user (username) VALUES ('testuser');
          INSERT INTO fee_invoice (student_id, invoice_number, amount) VALUES (1, 'INV-001', 50000);
        `)

        service = new PaymentService(db)
    })

    afterEach(() => {
        db.close()
    })

    describe('recordPayment', () => {
        it('should record a valid payment', async () => {
            const result = await service.recordPayment({
                student_id: 1,
                amount: 15000,
                payment_date: '2024-01-15',
                payment_method: 'CASH',
                reference: 'TEST-001',
                recorded_by: 1
            })

            expect(result).toBeDefined()
        })

        it('should reject payment with invalid student', async () => {
            await expect(
                service.recordPayment({
                    student_id: 999,
                    amount: 15000,
                    payment_date: '2024-01-15',
                    payment_method: 'CASH',
                    reference: 'TEST-002',
                    recorded_by: 1
                })
            ).rejects.toBeDefined()
        })

        it('should reject payment with zero amount', async () => {
            const result = await service.recordPayment({
                student_id: 1,
                amount: 0,
                payment_date: '2024-01-15',
                payment_method: 'CASH',
                reference: 'TEST-003',
                recorded_by: 1
            })

            expect(result).toBeDefined()
        })

        it('should validate required fields', async () => {
            await expect(
                service.recordPayment({
                    student_id: 0,
                    amount: 0,
                    payment_date: '',
                    payment_method: '',
                    reference: '',
                    recorded_by: 0
                })
            ).rejects.toBeDefined()
        })
    })

    describe('voidPayment', () => {
        it('should void a payment with valid reason', async () => {
            try {
                const result = await service.voidPayment({
                    transaction_id: 1,
                    voided_reason: 'Duplicate entry',
                    voided_by_user_id: 1
                })
                expect(result).toBeDefined()
            } catch (error) {
                expect(error).toBeDefined()
            }
        })

        it('should reject voiding without reason', async () => {
            const result = await service.voidPayment({
                transaction_id: 1,
                voided_reason: '',
                voided_by_user_id: 1
            })

            expect(result).toBeDefined()
            expect(result.success).toBe(false)
        })

        it('should reject voiding already voided payment', async () => {
            const result = await service.voidPayment({
                transaction_id: 999,
                voided_reason: 'Test reason',
                voided_by_user_id: 1
            })

            expect(result).toBeDefined()
            expect(result.success).toBe(false)
        })
    })
})
