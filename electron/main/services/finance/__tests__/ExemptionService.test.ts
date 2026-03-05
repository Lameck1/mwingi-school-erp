/**
 * ExemptionService tests — create, revoke, calculate exemption, stats,
 * scope-conflict detection, and filter logic.
 */
import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { ExemptionService } from '../ExemptionService'

/* ------------------------------------------------------------------ */
/*  Mocks                                                             */
/* ------------------------------------------------------------------ */
let testDb: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => testDb,
}))

/* ------------------------------------------------------------------ */
/*  Schema + seed                                                     */
/* ------------------------------------------------------------------ */
function createSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL
    );
    CREATE TABLE academic_year (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year_name TEXT NOT NULL UNIQUE,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      is_current BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE term (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      academic_year_id INTEGER NOT NULL,
      term_number INTEGER NOT NULL,
      term_name TEXT NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      is_current BOOLEAN DEFAULT 0,
      FOREIGN KEY (academic_year_id) REFERENCES academic_year(id)
    );
    CREATE TABLE student (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_number TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      student_type TEXT NOT NULL DEFAULT 'DAY_SCHOLAR',
      admission_date DATE NOT NULL DEFAULT '2025-01-01',
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE gl_account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_code TEXT NOT NULL UNIQUE,
      account_name TEXT NOT NULL,
      account_type TEXT NOT NULL,
      normal_balance TEXT NOT NULL DEFAULT 'DEBIT'
    );
    CREATE TABLE fee_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_name TEXT NOT NULL UNIQUE,
      description TEXT,
      is_active BOOLEAN DEFAULT 1,
      gl_account_id INTEGER REFERENCES gl_account(id)
    );
    CREATE TABLE fee_exemption (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES student(id),
      academic_year_id INTEGER NOT NULL REFERENCES academic_year(id),
      term_id INTEGER REFERENCES term(id),
      fee_category_id INTEGER REFERENCES fee_category(id),
      exemption_type TEXT NOT NULL CHECK(exemption_type IN ('FULL','PARTIAL')),
      exemption_percentage REAL NOT NULL CHECK(exemption_percentage > 0 AND exemption_percentage <= 100),
      exemption_reason TEXT NOT NULL,
      supporting_document TEXT,
      notes TEXT,
      approved_by_user_id INTEGER REFERENCES user(id),
      approved_at DATETIME,
      status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED')),
      revoked_by_user_id INTEGER REFERENCES user(id),
      revoked_at DATETIME,
      revoke_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO user (id, username, password_hash, full_name, role) VALUES (1, 'admin', 'h', 'Admin', 'ADMIN');
    INSERT INTO academic_year (id, year_name, start_date, end_date) VALUES (1, '2025', '2025-01-01', '2025-12-31');
    INSERT INTO term (id, academic_year_id, term_number, term_name, start_date, end_date, is_current)
    VALUES (1, 1, 1, 'Term 1', '2025-01-15', '2025-04-15', 1);
    INSERT INTO student (id, admission_number, first_name, last_name) VALUES (1, 'ADM-001', 'John', 'Doe');
    INSERT INTO student (id, admission_number, first_name, last_name) VALUES (2, 'ADM-002', 'Jane', 'Smith');
    INSERT INTO fee_category (id, category_name) VALUES (1, 'Tuition');
    INSERT INTO fee_category (id, category_name) VALUES (2, 'Boarding');
  `)
}

/* ================================================================== */
describe('ExemptionService', () => {
  let db: Database.Database
  let service: ExemptionService

  beforeEach(() => {
    db = new Database(':memory:')
    testDb = db
    createSchema(db)
    service = new ExemptionService()
  })

  afterEach(() => { db.close() })

  /* ============================================================== */
  /*  createExemption                                               */
  /* ============================================================== */
  describe('createExemption', () => {
    it('creates a PARTIAL exemption', () => {
      const result = service.createExemption({
        student_id: 1, academic_year_id: 1, exemption_percentage: 50,
        exemption_reason: 'Financial need', fee_category_id: 1,
      }, 1)
      expect(result.success).toBe(true)
      expect(result.id).toBeGreaterThan(0)
    })

    it('creates a FULL exemption for 100%', () => {
      service.createExemption({
        student_id: 1, academic_year_id: 1, exemption_percentage: 100,
        exemption_reason: 'Orphan', fee_category_id: 1,
      }, 1)
      const row = db.prepare('SELECT exemption_type FROM fee_exemption WHERE student_id = 1').get() as { exemption_type: string }
      expect(row.exemption_type).toBe('FULL')
    })

    it('validates required fields', () => {
      const result = service.createExemption({
        student_id: 0, academic_year_id: 0, exemption_percentage: 0,
        exemption_reason: '',
      }, 1)
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('required')
    })

    it('rejects percentage > 100', () => {
      const result = service.createExemption({
        student_id: 1, academic_year_id: 1, exemption_percentage: 150,
        exemption_reason: 'Test',
      }, 1)
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('between 1 and 100')
    })

    it('rejects percentage <= 0', () => {
      const result = service.createExemption({
        student_id: 1, academic_year_id: 1, exemption_percentage: 0,
        exemption_reason: 'Test',
      }, 1)
      expect(result.success).toBe(false)
    })

    it('prevents duplicate exemption in same scope', () => {
      service.createExemption({
        student_id: 1, academic_year_id: 1, fee_category_id: 1,
        exemption_percentage: 50, exemption_reason: 'First',
      }, 1)
      const result = service.createExemption({
        student_id: 1, academic_year_id: 1, fee_category_id: 1,
        exemption_percentage: 80, exemption_reason: 'Second',
      }, 1)
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('already exists')
    })

    it('allows same student in different scope (different category)', () => {
      service.createExemption({
        student_id: 1, academic_year_id: 1, fee_category_id: 1,
        exemption_percentage: 50, exemption_reason: 'First',
      }, 1)
      const result = service.createExemption({
        student_id: 1, academic_year_id: 1, fee_category_id: 2,
        exemption_percentage: 30, exemption_reason: 'Second',
      }, 1)
      expect(result.success).toBe(true)
    })

    it('allows blanket exemption (no category)', () => {
      const result = service.createExemption({
        student_id: 1, academic_year_id: 1,
        exemption_percentage: 100, exemption_reason: 'Full orphan',
      }, 1)
      expect(result.success).toBe(true)
    })
  })

  /* ============================================================== */
  /*  revokeExemption                                               */
  /* ============================================================== */
  describe('revokeExemption', () => {
    let exemptionId: number

    beforeEach(() => {
      const result = service.createExemption({
        student_id: 1, academic_year_id: 1, fee_category_id: 1,
        exemption_percentage: 50, exemption_reason: 'Need',
      }, 1)
      exemptionId = result.id!
    })

    it('revokes an active exemption', () => {
      const result = service.revokeExemption(exemptionId, 'No longer eligible', 1)
      expect(result.success).toBe(true)
      const row = db.prepare('SELECT status FROM fee_exemption WHERE id = ?').get(exemptionId) as { status: string }
      expect(row.status).toBe('REVOKED')
    })

    it('returns error for non-existent exemption', () => {
      const result = service.revokeExemption(999, 'reason', 1)
      expect(result.success).toBe(false)
      expect(result.errors![0]).toBe('Exemption not found')
    })

    it('returns error when already revoked', () => {
      service.revokeExemption(exemptionId, 'first', 1)
      const result = service.revokeExemption(exemptionId, 'again', 1)
      expect(result.success).toBe(false)
      expect(result.errors![0]).toBe('Exemption already revoked')
    })

    it('requires revoke reason', () => {
      const result = service.revokeExemption(exemptionId, '', 1)
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('reason is required')
    })
  })

  /* ============================================================== */
  /*  calculateExemption                                            */
  /* ============================================================== */
  describe('calculateExemption', () => {
    it('returns zero exemption when no exemption exists', () => {
      const calc = service.calculateExemption(1, 1, 1, 1, 10000)
      expect(calc.exemption_percentage).toBe(0)
      expect(calc.exemption_amount).toBe(0)
      expect(calc.net_amount).toBe(10000)
    })

    it('calculates category-specific exemption', () => {
      service.createExemption({
        student_id: 1, academic_year_id: 1, fee_category_id: 1,
        exemption_percentage: 25, exemption_reason: 'Partial',
      }, 1)
      const calc = service.calculateExemption(1, 1, 1, 1, 10000)
      expect(calc.exemption_percentage).toBe(25)
      expect(calc.exemption_amount).toBe(2500) // 10000 * 25%
      expect(calc.net_amount).toBe(7500)
      expect(calc.exemption_id).toBeDefined()
    })

    it('falls back to blanket exemption if no category-specific one', () => {
      service.createExemption({
        student_id: 1, academic_year_id: 1,
        exemption_percentage: 100, exemption_reason: 'Full',
      }, 1)
      const calc = service.calculateExemption(1, 1, 1, 2, 5000)
      expect(calc.exemption_percentage).toBe(100)
      expect(calc.exemption_amount).toBe(5000)
      expect(calc.net_amount).toBe(0)
    })

    it('prefers category-specific over blanket', () => {
      // Blanket: 100%
      service.createExemption({
        student_id: 1, academic_year_id: 1,
        exemption_percentage: 100, exemption_reason: 'Full',
      }, 1)
      // Category-specific: 50%
      service.createExemption({
        student_id: 1, academic_year_id: 1, fee_category_id: 1,
        exemption_percentage: 50, exemption_reason: 'Partial',
      }, 1)
      const calc = service.calculateExemption(1, 1, 1, 1, 10000)
      expect(calc.exemption_percentage).toBe(50) // category-specific wins
    })

    it('rounds exemption amount', () => {
      service.createExemption({
        student_id: 1, academic_year_id: 1, fee_category_id: 1,
        exemption_percentage: 33, exemption_reason: 'Test',
      }, 1)
      const calc = service.calculateExemption(1, 1, 1, 1, 10000)
      // 10000 * 0.33 = 3300 → Math.round = 3300
      expect(calc.exemption_amount).toBe(3300)
      expect(calc.net_amount).toBe(6700)
    })

    it('ignores revoked exemptions', () => {
      const { id } = service.createExemption({
        student_id: 1, academic_year_id: 1, fee_category_id: 1,
        exemption_percentage: 50, exemption_reason: 'Need',
      }, 1)
      service.revokeExemption(id!, 'done', 1)
      const calc = service.calculateExemption(1, 1, 1, 1, 10000)
      expect(calc.exemption_percentage).toBe(0)
    })
  })

  /* ============================================================== */
  /*  getExemptions (list + filters)                                */
  /* ============================================================== */
  describe('getExemptions', () => {
    beforeEach(() => {
      service.createExemption({
        student_id: 1, academic_year_id: 1, fee_category_id: 1,
        exemption_percentage: 50, exemption_reason: 'Need',
      }, 1)
      service.createExemption({
        student_id: 2, academic_year_id: 1, fee_category_id: 2,
        exemption_percentage: 100, exemption_reason: 'Orphan',
      }, 1)
    })

    it('returns all exemptions', () => {
      const exemptions = service.getExemptions()
      expect(exemptions.length).toBe(2)
    })

    it('includes joined student_name', () => {
      const exemptions = service.getExemptions()
      expect(exemptions.some(e => e.student_name === 'John Doe')).toBe(true)
    })

    it('filters by studentId', () => {
      const exemptions = service.getExemptions({ studentId: 1 })
      expect(exemptions.length).toBe(1)
    })

    it('filters by status (only active)', () => {
      // Revoke one
      const all = service.getExemptions()
      service.revokeExemption(all[0].id, 'done', 1)
      const active = service.getExemptions({ status: 'ACTIVE' })
      expect(active.length).toBe(1)
    })
  })

  /* ============================================================== */
  /*  getStudentExemptions                                          */
  /* ============================================================== */
  describe('getStudentExemptions', () => {
    it('returns active exemptions for student/year/term', () => {
      service.createExemption({
        student_id: 1, academic_year_id: 1, term_id: 1, fee_category_id: 1,
        exemption_percentage: 50, exemption_reason: 'Need',
      }, 1)
      const exemptions = service.getStudentExemptions(1, 1, 1)
      expect(exemptions.length).toBe(1)
    })

    it('includes blanket exemptions (term_id IS NULL)', () => {
      service.createExemption({
        student_id: 1, academic_year_id: 1,
        exemption_percentage: 100, exemption_reason: 'Full',
      }, 1)
      const exemptions = service.getStudentExemptions(1, 1, 1)
      expect(exemptions.length).toBe(1)
    })
  })

  /* ============================================================== */
  /*  getExemptionStats                                             */
  /* ============================================================== */
  describe('getExemptionStats', () => {
    it('returns correct statistics', () => {
      service.createExemption({
        student_id: 1, academic_year_id: 1, fee_category_id: 1,
        exemption_percentage: 50, exemption_reason: 'Need',
      }, 1)
      service.createExemption({
        student_id: 2, academic_year_id: 1, fee_category_id: 2,
        exemption_percentage: 100, exemption_reason: 'Orphan',
      }, 1)
      const stats = service.getExemptionStats(1)
      expect(stats.totalExemptions).toBe(2)
      expect(stats.activeExemptions).toBe(2)
      expect(stats.fullExemptions).toBe(1)
      expect(stats.partialExemptions).toBe(1)
    })

    it('reflects revoked exemptions in total but not active count', () => {
      const { id } = service.createExemption({
        student_id: 1, academic_year_id: 1, fee_category_id: 1,
        exemption_percentage: 50, exemption_reason: 'Need',
      }, 1)
      service.revokeExemption(id!, 'done', 1)
      const stats = service.getExemptionStats(1)
      expect(stats.totalExemptions).toBe(1)
      expect(stats.activeExemptions).toBe(0)
    })

    it('returns all-zero stats when no exemptions exist', () => {
      const stats = service.getExemptionStats(1)
      expect(stats.totalExemptions).toBe(0)
      // Bug fix: COALESCE(SUM(...), 0) now returns 0 instead of null on empty set
      expect(stats.activeExemptions).toBe(0)
      expect(stats.fullExemptions).toBe(0)
      expect(stats.partialExemptions).toBe(0)
    })

    it('returns global stats when no academicYearId filter', () => {
      service.createExemption({
        student_id: 1, academic_year_id: 1, fee_category_id: 1,
        exemption_percentage: 50, exemption_reason: 'Need',
      }, 1)
      const stats = service.getExemptionStats()
      expect(stats.totalExemptions).toBe(1)
      expect(stats.activeExemptions).toBe(1)
    })
  })

  /* ============================================================== */
  /*  getExemptions – additional filters                            */
  /* ============================================================== */
  describe('getExemptions – additional filters', () => {
    beforeEach(() => {
      service.createExemption({
        student_id: 1, academic_year_id: 1, fee_category_id: 1, term_id: 1,
        exemption_percentage: 50, exemption_reason: 'Need',
      }, 1)
    })

    it('filters by academicYearId', () => {
      const exemptions = service.getExemptions({ academicYearId: 1 })
      expect(exemptions.length).toBe(1)
      const none = service.getExemptions({ academicYearId: 999 })
      expect(none.length).toBe(0)
    })

    it('filters by termId (includes NULL term exemptions)', () => {
      // Add a blanket exemption (no term)
      service.createExemption({
        student_id: 2, academic_year_id: 1,
        exemption_percentage: 100, exemption_reason: 'Orphan',
      }, 1)
      const exemptions = service.getExemptions({ termId: 1 })
      // Should include both: one with term_id=1 and one with term_id IS NULL
      expect(exemptions.length).toBe(2)
    })
  })

  /* ============================================================== */
  /*  getExemptionById                                              */
  /* ============================================================== */
  describe('getExemptionById', () => {
    it('returns exemption with joined fields', () => {
      const { id } = service.createExemption({
        student_id: 1, academic_year_id: 1, fee_category_id: 1,
        exemption_percentage: 50, exemption_reason: 'Need',
      }, 1)
      const exemption = service.getExemptionById(id!)
      expect(exemption).toBeDefined()
      expect(exemption!.student_name).toBe('John Doe')
      expect(exemption!.category_name).toBe('Tuition')
    })

    it('returns undefined for non-existent id', () => {
      const result = service.getExemptionById(999)
      expect(result).toBeUndefined()
    })
  })

  /* ============================================================== */
  /*  createExemption – term-scoped                                 */
  /* ============================================================== */
  describe('createExemption – term-scoped', () => {
    it('creates exemption with term_id', () => {
      const result = service.createExemption({
        student_id: 1, academic_year_id: 1, term_id: 1, fee_category_id: 1,
        exemption_percentage: 50, exemption_reason: 'Term-scoped',
      }, 1)
      expect(result.success).toBe(true)
    })

    it('creates with notes', () => {
      const result = service.createExemption({
        student_id: 1, academic_year_id: 1, fee_category_id: 2,
        exemption_percentage: 25, exemption_reason: 'Partial need',
        notes: 'Approved by board',
      }, 1)
      expect(result.success).toBe(true)
    })
  })

  /* ============================================================== */
  /*  Error handling branches                                       */
  /* ============================================================== */
  describe('error branches', () => {
    it('createExemption returns error on DB failure', () => {
      // Use a trigger to force INSERT failure inside the try/catch block
      db.exec(`CREATE TRIGGER fail_insert BEFORE INSERT ON fee_exemption BEGIN SELECT RAISE(ABORT, 'Trigger-forced failure'); END;`)
      const result = service.createExemption({
        student_id: 999, academic_year_id: 999, exemption_percentage: 50,
        exemption_reason: 'Trigger test',
      }, 1)
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      db.exec('DROP TRIGGER fail_insert')
    })

    it('revokeExemption returns error on DB failure', () => {
      // Create an exemption to revoke, then add trigger to break UPDATE
      const created = service.createExemption({
        student_id: 2, academic_year_id: 1, fee_category_id: 2,
        exemption_percentage: 25, exemption_reason: 'Will break',
      }, 1)
      expect(created.success).toBe(true)
      db.exec(`CREATE TRIGGER fail_update BEFORE UPDATE ON fee_exemption BEGIN SELECT RAISE(ABORT, 'Trigger-forced failure'); END;`)
      const result = service.revokeExemption(created.id!, 'reason', 1)
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      db.exec('DROP TRIGGER fail_update')
    })
  })
})
