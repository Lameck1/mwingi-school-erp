import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db,
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn(),
}))

import { PromotionService } from '../PromotionService'

describe('PromotionService.promoteStudent', () => {
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

      CREATE TABLE enrollment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        academic_term_id INTEGER,
        stream_id INTEGER NOT NULL,
        student_type TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('fails when student is not actively enrolled in the source stream/year', async () => {
    const service = new PromotionService()

    const result = await service.promoteStudent({
      student_id: 10,
      from_stream_id: 1,
      to_stream_id: 2,
      from_academic_year_id: 2025,
      to_academic_year_id: 2026,
      to_term_id: 1,
    }, 7)

    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('not actively enrolled')
  })

  it('rejects promotion when target academic year already has active enrollment in different stream', async () => {
    db.exec(`
      INSERT INTO enrollment (student_id, academic_year_id, term_id, academic_term_id, stream_id, student_type, status)
      VALUES
        (10, 2025, 3, 3, 1, 'BOARDER', 'ACTIVE'),
        (10, 2026, 1, 1, 4, 'BOARDER', 'ACTIVE');
    `)

    const service = new PromotionService()
    const result = await service.promoteStudent({
      student_id: 10,
      from_stream_id: 1,
      to_stream_id: 2,
      from_academic_year_id: 2025,
      to_academic_year_id: 2026,
      to_term_id: 1,
    }, 7)

    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('active enrollment in the target academic year')
  })

  it('promotes student by updating source status and creating target active enrollment', async () => {
    db.exec(`
      INSERT INTO enrollment (student_id, academic_year_id, term_id, academic_term_id, stream_id, student_type, status)
      VALUES (10, 2025, 3, 3, 1, 'DAY_SCHOLAR', 'ACTIVE');
    `)

    const service = new PromotionService()
    const result = await service.promoteStudent({
      student_id: 10,
      from_stream_id: 1,
      to_stream_id: 2,
      from_academic_year_id: 2025,
      to_academic_year_id: 2026,
      to_term_id: 1,
    }, 7)

    expect(result.success).toBe(true)

    const source = db.prepare(`
      SELECT status
      FROM enrollment
      WHERE student_id = 10 AND academic_year_id = 2025 AND stream_id = 1
      LIMIT 1
    `).get() as { status: string }
    expect(source.status).toBe('PROMOTED')

    const target = db.prepare(`
      SELECT status, stream_id, student_type, term_id, academic_term_id
      FROM enrollment
      WHERE student_id = 10 AND academic_year_id = 2026
      LIMIT 1
    `).get() as { status: string; stream_id: number; student_type: string; term_id: number; academic_term_id: number }

    expect(target.status).toBe('ACTIVE')
    expect(target.stream_id).toBe(2)
    expect(target.student_type).toBe('DAY_SCHOLAR')
    expect(target.term_id).toBe(1)
    expect(target.academic_term_id).toBe(1)
  })
})

describe('PromotionService.batchPromote', () => {
  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE enrollment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        academic_year_id INTEGER NOT NULL,
        term_id INTEGER NOT NULL,
        academic_term_id INTEGER,
        stream_id INTEGER NOT NULL,
        student_type TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('returns grouped errors and per-student failure details', async () => {
    const service = new PromotionService()
    vi.spyOn(service, 'promoteStudent')
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, errors: ['Student already has an active enrollment in the target academic year'] })
      .mockResolvedValueOnce({ success: false, errors: ['Student already has an active enrollment in the target academic year'] })
      .mockResolvedValueOnce({ success: false, errors: ['Student is not actively enrolled in the source stream/year'] })

    const result = await service.batchPromote([1, 2, 3, 4], 1, 2, 2025, 2026, 1, 7)

    expect(result.success).toBe(false)
    expect(result.promoted).toBe(1)
    expect(result.failed).toBe(3)
    expect(result.failureDetails).toEqual([
      { student_id: 2, reason: 'Student already has an active enrollment in the target academic year' },
      { student_id: 3, reason: 'Student already has an active enrollment in the target academic year' },
      { student_id: 4, reason: 'Student is not actively enrolled in the source stream/year' },
    ])
    expect(result.errors).toEqual([
      'Student already has an active enrollment in the target academic year (2 students)',
      'Student is not actively enrolled in the source stream/year',
    ])
  })

  it('returns clean success payload when all promotions succeed', async () => {
    const service = new PromotionService()
    vi.spyOn(service, 'promoteStudent').mockResolvedValue({ success: true })

    const result = await service.batchPromote([1, 2], 1, 2, 2025, 2026, 1, 7)

    expect(result.success).toBe(true)
    expect(result.promoted).toBe(2)
    expect(result.failed).toBe(0)
    expect(result.errors).toBeUndefined()
    expect(result.failureDetails).toBeUndefined()
  })
})
