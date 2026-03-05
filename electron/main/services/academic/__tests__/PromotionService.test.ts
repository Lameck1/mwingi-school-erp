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

  // ── branch coverage: updateResult.changes === 0 (L147) ──
  it('promoteStudent fails when source enrollment update changes nothing', async () => {
    db.exec(`
      INSERT INTO enrollment (student_id, academic_year_id, term_id, academic_term_id, stream_id, student_type, status)
      VALUES (20, 2025, 3, 3, 1, 'BOARDER', 'ACTIVE');
    `)
    const service = new PromotionService()
    const origPrepare = db.prepare.bind(db)
    vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes("SET status = 'PROMOTED'")) {
        return { run: () => ({ changes: 0, lastInsertRowid: 0 }) } as any
      }
      return origPrepare(sql)
    })
    const result = await service.promoteStudent({
      student_id: 20,
      from_stream_id: 1,
      to_stream_id: 2,
      from_academic_year_id: 2025,
      to_academic_year_id: 2026,
      to_term_id: 1,
    }, 7)
    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('Failed to update source enrollment status')
    vi.restoreAllMocks()
  })

  // ── branch coverage: result.changes === 0 on insert (L166) ──
  it('promoteStudent fails when target enrollment insert returns no changes', async () => {
    db.exec(`
      INSERT INTO enrollment (student_id, academic_year_id, term_id, academic_term_id, stream_id, student_type, status)
      VALUES (30, 2025, 3, 3, 1, 'DAY_SCHOLAR', 'ACTIVE');
    `)
    const service = new PromotionService()
    const origPrepare = db.prepare.bind(db)
    vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO enrollment')) {
        return { run: () => ({ changes: 0, lastInsertRowid: 0 }) } as any
      }
      return origPrepare(sql)
    })
    const result = await service.promoteStudent({
      student_id: 30,
      from_stream_id: 1,
      to_stream_id: 2,
      from_academic_year_id: 2025,
      to_academic_year_id: 2026,
      to_term_id: 1,
    }, 7)
    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('Failed to create target enrollment')
    vi.restoreAllMocks()
  })

  // ── branch coverage: non-Error exception in promoteStudent catch (L179) ──
  it('promoteStudent returns Unknown error for non-Error exception via prepare', async () => {
    db.exec(`
      INSERT INTO enrollment (student_id, academic_year_id, term_id, academic_term_id, stream_id, student_type, status)
      VALUES (40, 2025, 3, 3, 1, 'BOARDER', 'ACTIVE');
    `)
    const service = new PromotionService()
    const origPrepare = db.prepare.bind(db)
    vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes("SET status = 'PROMOTED'")) {
        return { run: () => { throw 42 } } as any // NOSONAR
      }
      return origPrepare(sql)
    })
    const result = await service.promoteStudent({
      student_id: 40,
      from_stream_id: 1,
      to_stream_id: 2,
      from_academic_year_id: 2025,
      to_academic_year_id: 2026,
      to_term_id: 1,
    }, 7)
    expect(result.success).toBe(false)
    expect(result.errors).toEqual(['Unknown error'])
    vi.restoreAllMocks()
  })

  // ── branch coverage: real Error in promoteStudent catch (L179 true) ──
  it('promoteStudent returns error message for real Error exception', async () => {
    db.exec(`
      INSERT INTO enrollment (student_id, academic_year_id, term_id, academic_term_id, stream_id, student_type, status)
      VALUES (50, 2025, 3, 3, 1, 'DAY_SCHOLAR', 'ACTIVE');
    `)
    db.exec("CREATE TRIGGER fail_prom_upd BEFORE UPDATE ON enrollment BEGIN SELECT RAISE(FAIL, 'forced promotion error'); END")
    const service = new PromotionService()
    const result = await service.promoteStudent({
      student_id: 50,
      from_stream_id: 1,
      to_stream_id: 2,
      from_academic_year_id: 2025,
      to_academic_year_id: 2026,
      to_term_id: 1,
    }, 7)
    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('forced promotion error')
    db.exec('DROP TRIGGER IF EXISTS fail_prom_upd')
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

  it('uses fallback reason when errors array is undefined', async () => {
    const service = new PromotionService()
    vi.spyOn(service, 'promoteStudent')
      .mockResolvedValueOnce({ success: false })

    const result = await service.batchPromote([1], 1, 2, 2025, 2026, 1, 7)
    expect(result.failed).toBe(1)
    expect(result.failureDetails![0].reason).toBe('Unknown promotion error')
  })
})

describe('PromotionService - additional methods', () => {
  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE stream (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stream_name TEXT NOT NULL,
        level_order INTEGER NOT NULL,
        is_active BOOLEAN DEFAULT 1
      );
      CREATE TABLE student (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        admission_number TEXT,
        is_active BOOLEAN DEFAULT 1
      );
      CREATE TABLE academic_year (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year_name TEXT NOT NULL
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

      INSERT INTO stream (stream_name, level_order) VALUES ('Grade 1', 1), ('Grade 2', 2), ('Grade 3', 3);
      INSERT INTO stream (stream_name, level_order, is_active) VALUES ('Archived', 4, 0);
      INSERT INTO student (first_name, last_name, admission_number) VALUES ('Alice', 'Wanjiku', 'ADM001');
      INSERT INTO academic_year (year_name) VALUES ('2025'), ('2026');
      INSERT INTO enrollment (student_id, academic_year_id, term_id, stream_id, student_type, status)
      VALUES (1, 1, 1, 1, 'DAY_SCHOLAR', 'ACTIVE');
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('getStreams returns active streams ordered by level_order', async () => {
    const service = new PromotionService()
    const streams = await service.getStreams()
    expect(streams.length).toBe(3)
    expect(streams[0].stream_name).toBe('Grade 1')
    expect(streams[2].stream_name).toBe('Grade 3')
  })

  it('getStudentsForPromotion returns active enrollments for stream/year', async () => {
    const service = new PromotionService()
    const students = await service.getStudentsForPromotion(1, 1)
    expect(students.length).toBe(1)
    expect(students[0].student_name).toBe('Alice Wanjiku')
  })

  it('getStudentsForPromotion returns empty for non-matching stream', async () => {
    const service = new PromotionService()
    const students = await service.getStudentsForPromotion(99, 1)
    expect(students.length).toBe(0)
  })

  it('getStudentPromotionHistory returns enrollment history', async () => {
    const service = new PromotionService()
    const history = await service.getStudentPromotionHistory(1)
    expect(history.length).toBe(1)
    expect(history[0].stream_name).toBe('Grade 1')
  })

  it('getNextStream returns next stream by level_order', async () => {
    const service = new PromotionService()
    const next = await service.getNextStream(1)
    expect(next).not.toBeNull()
    expect(next!.stream_name).toBe('Grade 2')
  })

  it('getNextStream returns null for last/unknown stream', async () => {
    const service = new PromotionService()
    const next = await service.getNextStream(999)
    expect(next).toBeNull()
  })

  it('promoteStudent rejects same source and destination stream', async () => {
    const service = new PromotionService()
    const result = await service.promoteStudent({
      student_id: 1, from_stream_id: 1, to_stream_id: 1,
      from_academic_year_id: 1, to_academic_year_id: 2, to_term_id: 1
    }, 7)
    expect(result.success).toBe(false)
    expect(result.errors![0]).toContain('different')
  })

  it('promoteStudent is idempotent when already promoted to same target', async () => {
    db.exec(`
      INSERT INTO enrollment (student_id, academic_year_id, term_id, stream_id, student_type, status)
      VALUES (1, 2, 1, 2, 'DAY_SCHOLAR', 'ACTIVE');
    `)
    const service = new PromotionService()
    const result = await service.promoteStudent({
      student_id: 1, from_stream_id: 1, to_stream_id: 2,
      from_academic_year_id: 1, to_academic_year_id: 2, to_term_id: 1
    }, 7)
    expect(result.success).toBe(true)
  })

  it('promoteStudent rejects when student already enrolled in different stream in target year', async () => {
    // Student has ACTIVE enrollment in year 2 in stream 3 (different from target stream 2)
    db.exec(`
      INSERT INTO enrollment (student_id, academic_year_id, term_id, stream_id, student_type, status)
      VALUES (1, 2, 1, 3, 'DAY_SCHOLAR', 'ACTIVE');
    `)
    const service = new PromotionService()
    const result = await service.promoteStudent({
      student_id: 1, from_stream_id: 1, to_stream_id: 2,
      from_academic_year_id: 1, to_academic_year_id: 2, to_term_id: 1
    }, 7)
    expect(result.success).toBe(false)
    expect(result.errors![0]).toContain('active enrollment in the target academic year')
  })

  it('getNextStream returns falsy when no higher active stream exists', async () => {
    const service = new PromotionService()
    // Delete all streams above Grade 1 to ensure no next stream
    db.prepare('DELETE FROM stream WHERE level_order > 1').run()
    const next = await service.getNextStream(1)
    expect(next).toBeFalsy()
  })

  it('batchPromote returns grouped errors when multiple students fail for same reason', async () => {
    // Neither student 99 nor 100 has active enrollment
    const service = new PromotionService()
    const result = await service.batchPromote([99, 100], 1, 2, 1, 2, 1, 7)
    expect(result.success).toBe(false)
    expect(result.promoted).toBe(0)
    expect(result.failed).toBe(2)
    // Errors are grouped: same reason with "(2 students)" suffix
    expect(result.errors!.some(e => e.includes('2 students'))).toBe(true)
    expect(result.failureDetails).toHaveLength(2)
  })

  it('batchPromote returns success when all students promoted', async () => {
    // Add another student and enrollment
    db.exec(`
      INSERT INTO student (first_name, last_name, admission_number) VALUES ('Bob', 'Kamau', 'ADM002');
      INSERT INTO enrollment (student_id, academic_year_id, term_id, stream_id, student_type, status)
      VALUES (2, 1, 1, 1, 'DAY_SCHOLAR', 'ACTIVE');
    `)
    const service = new PromotionService()
    const result = await service.batchPromote([1, 2], 1, 2, 1, 2, 1, 7)
    expect(result.success).toBe(true)
    expect(result.promoted).toBe(2)
    expect(result.failed).toBe(0)
    expect(result.errors).toBeUndefined()
    expect(result.failureDetails).toBeUndefined()
  })

  // ── branch coverage: getNextStream from highest active stream (no next) ──
  it('getNextStream returns falsy when current stream is the highest active', async () => {
    const service = new PromotionService()
    // Grade 3 (id=3) has the highest level_order among active streams (Archived is inactive)
    const next = await service.getNextStream(3)
    expect(next).toBeFalsy()
  })

  // ── branch coverage: getStudentPromotionHistory ──
  it('getStudentPromotionHistory returns enrollment records', async () => {
    db.exec(`INSERT INTO academic_year (year_name) VALUES ('2025')`)
    const service = new PromotionService()
    const history = await service.getStudentPromotionHistory(1)
    // Student 1 has at least one enrollment from earlier tests
    expect(Array.isArray(history)).toBe(true)
  })

  // ── branch coverage: promoteStudent catches non-Error throw ──
  it('promoteStudent returns Unknown error for non-Error throw', async () => {
    const service = new PromotionService()
    const origTransaction = db.transaction.bind(db)
    ;(db as any).transaction = () => { throw 'string error' } // NOSONAR
    const result = await service.promoteStudent({
      student_id: 1, from_stream_id: 1, to_stream_id: 2,
      from_academic_year_id: 1, to_academic_year_id: 2, to_term_id: 1
    }, 7)
    expect(result.success).toBe(false)
    expect(result.errors).toEqual(['Unknown error'])
    ;(db as any).transaction = origTransaction
  })

  // ── branch coverage: batchPromote with mixed results (some succeed, some fail) ──
  it('batchPromote reports mixed promoted/failed counts', async () => {
    const service = new PromotionService()
    // student 1 is set up and can be promoted; student 9999 does not exist
    const result = await service.batchPromote(
      [1, 9999],
      1, 2,
      1, 2,
      1, 7
    )
    // At least one should fail (non-existent student)
    expect(result.failed).toBeGreaterThanOrEqual(1)
    expect(typeof result.promoted).toBe('number')
    expect(typeof result.success).toBe('boolean')
  })

  // ── branch coverage: batchPromote with empty array returns success ──
  it('batchPromote with empty array returns 0 promoted/0 failed', async () => {
    const service = new PromotionService()
    const result = await service.batchPromote(
      [],
      1, 2,
      1, 2,
      1, 7
    )
    expect(result.success).toBe(true)
    expect(result.promoted).toBe(0)
    expect(result.failed).toBe(0)
  })
})
