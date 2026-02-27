import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../database', () => ({
    getDatabase: () => { throw new Error('Must inject db') }
}))

vi.mock('../../../database/utils/audit', () => ({
    logAudit: vi.fn()
}))

import { VirementPreventionService } from '../VirementPreventionService'

function createTestDb(): Database.Database {
    const db = new Database(':memory:')
    db.exec(`
    CREATE TABLE fee_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_name TEXT NOT NULL UNIQUE,
      description TEXT,
      is_active BOOLEAN DEFAULT 1,
      priority INTEGER NOT NULL DEFAULT 99,
      gl_account_id INTEGER,
      jss_account_type TEXT CHECK(jss_account_type IN ('TUITION', 'OPERATIONS', 'INFRASTRUCTURE'))
    );

    CREATE TABLE user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL,
      is_active BOOLEAN DEFAULT 1
    );

    CREATE TABLE jss_virement_request (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_account_type TEXT NOT NULL CHECK(from_account_type IN ('TUITION', 'OPERATIONS', 'INFRASTRUCTURE')),
      to_account_type TEXT NOT NULL CHECK(to_account_type IN ('TUITION', 'OPERATIONS', 'INFRASTRUCTURE')),
      amount INTEGER NOT NULL CHECK (amount > 0),
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
      requested_by_user_id INTEGER NOT NULL,
      reviewed_by_user_id INTEGER,
      reviewed_at DATETIME,
      review_notes TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (requested_by_user_id) REFERENCES user(id),
      FOREIGN KEY (reviewed_by_user_id) REFERENCES user(id),
      CHECK (from_account_type != to_account_type)
    );

    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER, action_type TEXT, table_name TEXT,
      record_id INTEGER, old_values TEXT, new_values TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

    // Seed fee categories with JSS account types
    db.exec(`
    INSERT INTO fee_category (category_name, jss_account_type) VALUES ('Tuition', 'TUITION');
    INSERT INTO fee_category (category_name, jss_account_type) VALUES ('Exam Fee', 'TUITION');
    INSERT INTO fee_category (category_name, jss_account_type) VALUES ('Lunch', 'OPERATIONS');
    INSERT INTO fee_category (category_name, jss_account_type) VALUES ('Transport', 'OPERATIONS');
    INSERT INTO fee_category (category_name, jss_account_type) VALUES ('ICT Development', 'INFRASTRUCTURE');
    INSERT INTO fee_category (category_name) VALUES ('Miscellaneous');
  `)

    db.exec(`
    INSERT INTO user (username, password_hash, full_name, role) VALUES ('clerk', 'h', 'Clerk', 'ACCOUNTS_CLERK');
    INSERT INTO user (username, password_hash, full_name, role) VALUES ('principal', 'h', 'Principal', 'PRINCIPAL');
  `)

    return db
}

describe('VirementPreventionService', () => {
    let db: Database.Database
    let service: VirementPreventionService

    beforeEach(() => {
        db = createTestDb()
        service = new VirementPreventionService(db)
    })

    afterEach(() => {
        db.close()
    })

    it('allows expenditure from same account type', () => {
        // Tuition category (id=1) funding TUITION expense
        const result = service.validateExpenditure('TUITION', 1)
        expect(result.allowed).toBe(true)
        expect(result.from_account).toBe('TUITION')
    })

    it('blocks cross-account expenditure (Tuition → Operations)', () => {
        // Tuition category (id=1) trying to fund OPERATIONS expense
        const result = service.validateExpenditure('OPERATIONS', 1)
        expect(result.allowed).toBe(false)
        expect(result.reason).toContain('Virement blocked')
        expect(result.from_account).toBe('TUITION')
        expect(result.to_account).toBe('OPERATIONS')
    })

    it('allows expenditure from unclassified categories (fail-open)', () => {
        // Miscellaneous (id=6, jss_account_type = NULL) — should allow
        const result = service.validateExpenditure('OPERATIONS', 6)
        expect(result.allowed).toBe(true)
    })

    it('creates and retrieves virement requests', () => {
        const createResult = service.requestVirement('TUITION', 'INFRASTRUCTURE', 50000, 'Emergency ICT repair', 1)
        expect(createResult.success).toBe(true)

        const pending = service.getPendingRequests()
        expect(pending).toHaveLength(1)
        expect(pending[0]?.from_account_type).toBe('TUITION')
        expect(pending[0]?.to_account_type).toBe('INFRASTRUCTURE')
        expect(pending[0]?.amount).toBe(50000)
    })

    it('rejects virement request with same source and destination', () => {
        const result = service.requestVirement('TUITION', 'TUITION', 50000, 'Invalid', 1)
        expect(result.success).toBe(false)
        expect(result.error).toContain('differ')
    })

    it('principal can approve or reject virement requests', () => {
        service.requestVirement('OPERATIONS', 'INFRASTRUCTURE', 100000, 'Building repair', 1)
        const pending = service.getPendingRequests()
        expect(pending).toHaveLength(1)

        // Principal approves
        const reviewResult = service.reviewVirement(pending[0]!.id, 'APPROVED', 'Justified emergency', 2)
        expect(reviewResult.success).toBe(true)

        // No more pending
        const afterReview = service.getPendingRequests()
        expect(afterReview).toHaveLength(0)
    })

    it('prevents double-review of virement requests', () => {
        service.requestVirement('TUITION', 'OPERATIONS', 75000, 'Lunch shortage', 1)
        const pending = service.getPendingRequests()

        service.reviewVirement(pending[0]!.id, 'REJECTED', 'Not justified', 2)

        // Try to approve already rejected
        const result = service.reviewVirement(pending[0]!.id, 'APPROVED', 'Changed mind', 2)
        expect(result.success).toBe(false)
        expect(result.error).toContain('already rejected')
    })
})
