import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../database', () => ({
    getDatabase: () => { throw new Error('Must inject db') }
}))

vi.mock('../../../database/utils/audit', () => ({
    logAudit: vi.fn()
}))

import { MpesaReconciliationService } from '../MpesaReconciliationService'

function createTestDb(): Database.Database {
    const db = new Database(':memory:')
    db.exec(`
    CREATE TABLE student (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_number TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL, last_name TEXT NOT NULL,
      date_of_birth DATE, gender TEXT, student_type TEXT NOT NULL DEFAULT 'DAY_SCHOLAR',
      admission_date DATE NOT NULL DEFAULT '2025-01-01',
      guardian_name TEXT, guardian_phone TEXT, is_active BOOLEAN DEFAULT 1,
      credit_balance INTEGER DEFAULT 0
    );

    CREATE TABLE user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL, role TEXT NOT NULL
    );

    CREATE TABLE ledger_transaction (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_ref TEXT NOT NULL UNIQUE,
      transaction_date DATE NOT NULL,
      transaction_type TEXT NOT NULL,
      category_id INTEGER NOT NULL, amount INTEGER NOT NULL,
      debit_credit TEXT NOT NULL, student_id INTEGER,
      payment_method TEXT, payment_reference TEXT,
      description TEXT, recorded_by_user_id INTEGER NOT NULL, is_voided BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE mpesa_transaction (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mpesa_receipt_number TEXT NOT NULL UNIQUE,
      transaction_date DATETIME NOT NULL,
      phone_number TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK (amount > 0),
      account_reference TEXT, payer_name TEXT,
      transaction_type TEXT NOT NULL DEFAULT 'C2B',
      status TEXT NOT NULL DEFAULT 'UNMATCHED',
      matched_student_id INTEGER,
      matched_payment_id INTEGER,
      match_method TEXT, match_confidence REAL,
      imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      imported_by_user_id INTEGER NOT NULL,
      reconciled_at DATETIME, reconciled_by_user_id INTEGER,
      notes TEXT,
      FOREIGN KEY (matched_student_id) REFERENCES student(id),
      FOREIGN KEY (imported_by_user_id) REFERENCES user(id)
    );

    CREATE TABLE mpesa_reconciliation_batch (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      total_imported INTEGER NOT NULL DEFAULT 0,
      total_matched INTEGER NOT NULL DEFAULT 0,
      total_unmatched INTEGER NOT NULL DEFAULT 0,
      total_amount INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'CSV',
      file_name TEXT,
      imported_by_user_id INTEGER NOT NULL
    );

    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER, action_type TEXT, table_name TEXT,
      record_id INTEGER, old_values TEXT, new_values TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

    db.exec(`
    INSERT INTO user (username, password_hash, full_name, role) VALUES ('clerk', 'h', 'Clerk', 'ACCOUNTS_CLERK');
    INSERT INTO student (admission_number, first_name, last_name, student_type, guardian_phone)
      VALUES ('ADM001', 'John', 'Doe', 'DAY_SCHOLAR', '0712345678');
    INSERT INTO student (admission_number, first_name, last_name, student_type, guardian_phone)
      VALUES ('ADM002', 'Jane', 'Smith', 'BOARDER', '+254711222333');
  `)

    return db
}

describe('MpesaReconciliationService', () => {
    let db: Database.Database
    let service: MpesaReconciliationService

    beforeEach(() => {
        db = createTestDb()
        service = new MpesaReconciliationService(db)
    })

    afterEach(() => {
        db.close()
    })

    it('imports M-Pesa transactions and auto-matches by phone', () => {
        const result = service.importTransactions([
            { mpesa_receipt_number: 'RGH123ABC', transaction_date: '2026-02-25 10:30:00', phone_number: '0712345678', amount: 5000000, payer_name: 'Guardian A' },
            { mpesa_receipt_number: 'RGH456DEF', transaction_date: '2026-02-25 11:00:00', phone_number: '0799999999', amount: 3000000, payer_name: 'Unknown' },
        ], 1, 'CSV', 'february_statement.csv')

        expect(result.success).toBe(true)
        expect(result.total_imported).toBe(2)
        expect(result.total_matched).toBe(1) // Phone 0712345678 matches student ADM001
        expect(result.total_unmatched).toBe(1)
        expect(result.duplicates_skipped).toBe(0)
        expect(result.batch_id).toBeGreaterThan(0)
    })

    it('auto-matches by admission number in account reference', () => {
        const result = service.importTransactions([
            { mpesa_receipt_number: 'XYZ111', transaction_date: '2026-02-25 10:30:00', phone_number: '0700000000', amount: 2000000, account_reference: 'ADM002' },
        ], 1)

        expect(result.total_matched).toBe(1)
        // Verify the match details
        const txn = db.prepare("SELECT * FROM mpesa_transaction WHERE mpesa_receipt_number = 'XYZ111'").get() as {
            matched_student_id: number; match_method: string; match_confidence: number
        }
        expect(txn.matched_student_id).toBe(2) // ADM002 = Jane Smith
        expect(txn.match_method).toBe('AUTO_ADMISSION')
        expect(txn.match_confidence).toBe(0.95)
    })

    it('skips duplicate M-Pesa receipt numbers', () => {
        service.importTransactions([
            { mpesa_receipt_number: 'DUP001', transaction_date: '2026-02-25', phone_number: '0700000000', amount: 1000 },
        ], 1)

        const result = service.importTransactions([
            { mpesa_receipt_number: 'DUP001', transaction_date: '2026-02-25', phone_number: '0700000000', amount: 1000 },
            { mpesa_receipt_number: 'NEW001', transaction_date: '2026-02-25', phone_number: '0700000000', amount: 2000 },
        ], 1)

        expect(result.total_imported).toBe(1) // Only NEW001
        expect(result.duplicates_skipped).toBe(1)
    })

    it('supports manual matching of unmatched transactions', () => {
        service.importTransactions([
            { mpesa_receipt_number: 'UNMATCHED01', transaction_date: '2026-02-25', phone_number: '0799999999', amount: 5000 },
        ], 1)

        const unmatched = service.getUnmatchedTransactions()
        expect(unmatched).toHaveLength(1)

        const matchResult = service.manualMatch(unmatched[0]!.id, 1, 1)
        expect(matchResult.success).toBe(true)

        // Now no unmatched
        expect(service.getUnmatchedTransactions()).toHaveLength(0)
    })

    it('provides reconciliation summary', () => {
        service.importTransactions([
            { mpesa_receipt_number: 'A1', transaction_date: '2026-02-25', phone_number: '0712345678', amount: 3000 }, // Matches
            { mpesa_receipt_number: 'A2', transaction_date: '2026-02-25', phone_number: '0799999999', amount: 2000 }, // Unmatched
        ], 1)

        const summary = service.getReconciliationSummary()
        expect(summary.total_transactions).toBe(2)
        expect(summary.total_matched).toBe(1)
        expect(summary.total_unmatched).toBe(1)
        expect(summary.total_amount).toBe(5000)
        expect(summary.unmatched_amount).toBe(2000)
    })

    it('matches +254 phone format to 07 format', () => {
        const result = service.importTransactions([
            { mpesa_receipt_number: 'INT01', transaction_date: '2026-02-25', phone_number: '+254711222333', amount: 5000 },
        ], 1)

        // +254711222333 → 0711222333 should match Jane Smith's +254711222333
        expect(result.total_matched).toBe(1)
    })
})
