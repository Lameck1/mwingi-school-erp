import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { InstallmentPolicyService } from '../InstallmentPolicyService'

// Mock audit log
vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

// Mock getDatabase for default-constructor branch (line 52)
let fallbackDb: Database.Database
vi.mock('../../../database', () => ({
  getDatabase: () => fallbackDb
}))

describe('InstallmentPolicyService', () => {
  let db: Database.Database
  let service: InstallmentPolicyService

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE installment_policy (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        policy_name TEXT NOT NULL,
        academic_year_id INTEGER NOT NULL,
        stream_id INTEGER,
        student_type TEXT NOT NULL,
        number_of_installments INTEGER NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        created_by_user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE installment_schedule (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        policy_id INTEGER NOT NULL,
        installment_number INTEGER NOT NULL,
        percentage INTEGER NOT NULL,
        due_date DATE NOT NULL,
        description TEXT,
        FOREIGN KEY (policy_id) REFERENCES installment_policy(id)
      );

      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action_type TEXT NOT NULL,
        table_name TEXT NOT NULL,
        record_id INTEGER,
        old_values TEXT,
        new_values TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)

    service = new InstallmentPolicyService(db)
  })

  afterEach(() => {
    if (db) { db.close() }
  })

  describe('createPolicy', () => {
    it('should create a policy with valid schedules summing to 100', () => {
      const result = service.createPolicy({
        policy_name: 'Term 1 Plan',
        academic_year_id: 1,
        student_type: 'ALL',
        schedules: [
          { installment_number: 1, percentage: 50, due_date: '2026-02-01' },
          { installment_number: 2, percentage: 50, due_date: '2026-04-01' }
        ]
      }, 1)

      expect(result.success).toBe(true)
      expect(result.id).toBeGreaterThan(0)
    })

    it('should reject schedules not summing to 100', () => {
      const result = service.createPolicy({
        policy_name: 'Bad Plan',
        academic_year_id: 1,
        student_type: 'ALL',
        schedules: [
          { installment_number: 1, percentage: 40, due_date: '2026-02-01' },
          { installment_number: 2, percentage: 40, due_date: '2026-04-01' }
        ]
      }, 1)

      expect(result.success).toBe(false)
      expect(result.error).toContain('sum to 100')
    })

    it('should reject fewer than 2 installments', () => {
      const result = service.createPolicy({
        policy_name: 'Single',
        academic_year_id: 1,
        student_type: 'ALL',
        schedules: [
          { installment_number: 1, percentage: 100, due_date: '2026-02-01' }
        ]
      }, 1)

      expect(result.success).toBe(false)
      expect(result.error).toContain('At least 2')
    })

    it('should create schedule rows for each installment', () => {
      const result = service.createPolicy({
        policy_name: 'Three Installments',
        academic_year_id: 1,
        student_type: 'BOARDER',
        schedules: [
          { installment_number: 1, percentage: 40, due_date: '2026-02-01', description: 'First' },
          { installment_number: 2, percentage: 30, due_date: '2026-04-01', description: 'Second' },
          { installment_number: 3, percentage: 30, due_date: '2026-06-01', description: 'Third' }
        ]
      }, 1)

      expect(result.success).toBe(true)

      const schedules = db.prepare(`SELECT * FROM installment_schedule WHERE policy_id = ?`).all(result.id!)
      expect(schedules).toHaveLength(3)
    })

    it('should accept stream_id when provided', () => {
      const result = service.createPolicy({
        policy_name: 'Stream Plan',
        academic_year_id: 1,
        stream_id: 5,
        student_type: 'DAY_SCHOLAR',
        schedules: [
          { installment_number: 1, percentage: 60, due_date: '2026-02-01' },
          { installment_number: 2, percentage: 40, due_date: '2026-04-01' }
        ]
      }, 1)

      expect(result.success).toBe(true)

      const policy = db.prepare(`SELECT stream_id FROM installment_policy WHERE id = ?`).get(result.id!) as { stream_id: number }
      expect(policy.stream_id).toBe(5)
    })

    /* ---- Float tolerance (|sum - 100| > 0.01) ---- */

    it('should accept float percentages that round to 100 (33.33 + 33.33 + 33.34)', () => {
      const result = service.createPolicy({
        policy_name: 'Float Plan',
        academic_year_id: 1,
        student_type: 'ALL',
        schedules: [
          { installment_number: 1, percentage: 33.33, due_date: '2026-02-01' },
          { installment_number: 2, percentage: 33.33, due_date: '2026-04-01' },
          { installment_number: 3, percentage: 33.34, due_date: '2026-06-01' }
        ]
      }, 1)

      expect(result.success).toBe(true)
    })

    it('should reject 3 × 33.33 = 99.99 (IEEE-754 diff slightly > 0.01)', () => {
      const result = service.createPolicy({
        policy_name: 'Edge Plan',
        academic_year_id: 1,
        student_type: 'ALL',
        schedules: [
          { installment_number: 1, percentage: 33.33, due_date: '2026-02-01' },
          { installment_number: 2, percentage: 33.33, due_date: '2026-04-01' },
          { installment_number: 3, percentage: 33.33, due_date: '2026-06-01' }
        ]
      }, 1)

      // In IEEE-754: 33.33+33.33+33.33 - 100 ≈ -0.0100000000000051, abs > 0.01
      expect(result.success).toBe(false)
    })

    it('should accept percentages within tolerance (49.99 + 50 = 99.99, diff = 0.01)', () => {
      // 49.99 + 50 = 99.99 exactly in IEEE-754, |99.99 - 100| = 0.01, NOT > 0.01
      const result = service.createPolicy({
        policy_name: 'Edge Exact',
        academic_year_id: 1,
        student_type: 'ALL',
        schedules: [
          { installment_number: 1, percentage: 49.99, due_date: '2026-02-01' },
          { installment_number: 2, percentage: 50, due_date: '2026-04-01' }
        ]
      }, 1)

      expect(result.success).toBe(true)
    })

    it('should reject schedules that clearly do not sum to 100 (40 + 40 = 80)', () => {
      const result = service.createPolicy({
        policy_name: 'Short Plan',
        academic_year_id: 1,
        student_type: 'ALL',
        schedules: [
          { installment_number: 1, percentage: 40, due_date: '2026-02-01' },
          { installment_number: 2, percentage: 40, due_date: '2026-04-01' }
        ]
      }, 1)

      expect(result.success).toBe(false)
      expect(result.error).toContain('sum to 100')
    })
  })

  describe('getPoliciesForTerm', () => {
    beforeEach(() => {
      service.createPolicy({
        policy_name: 'Day Scholar Plan',
        academic_year_id: 1,
        student_type: 'DAY_SCHOLAR',
        schedules: [
          { installment_number: 1, percentage: 50, due_date: '2026-02-01' },
          { installment_number: 2, percentage: 50, due_date: '2026-04-01' }
        ]
      }, 1)

      service.createPolicy({
        policy_name: 'Boarder Plan',
        academic_year_id: 1,
        student_type: 'BOARDER',
        schedules: [
          { installment_number: 1, percentage: 60, due_date: '2026-02-01' },
          { installment_number: 2, percentage: 40, due_date: '2026-04-01' }
        ]
      }, 1)

      service.createPolicy({
        policy_name: 'Universal Plan',
        academic_year_id: 1,
        student_type: 'ALL',
        schedules: [
          { installment_number: 1, percentage: 70, due_date: '2026-02-01' },
          { installment_number: 2, percentage: 30, due_date: '2026-04-01' }
        ]
      }, 1)
    })

    it('should return all active policies for an academic year', () => {
      const policies = service.getPoliciesForTerm(1)
      expect(policies).toHaveLength(3)
    })

    it('should filter by student type and include ALL', () => {
      const policies = service.getPoliciesForTerm(1, undefined, 'DAY_SCHOLAR')
      expect(policies).toHaveLength(2) // DAY_SCHOLAR + ALL
    })

    it('should return empty array for non-existent academic year', () => {
      const policies = service.getPoliciesForTerm(999)
      expect(policies).toEqual([])
    })
  })

  describe('getInstallmentSchedule', () => {
    it('should return ordered schedule for a policy', () => {
      const result = service.createPolicy({
        policy_name: 'Schedule Test',
        academic_year_id: 1,
        student_type: 'ALL',
        schedules: [
          { installment_number: 1, percentage: 50, due_date: '2026-02-01' },
          { installment_number: 2, percentage: 50, due_date: '2026-04-01' }
        ]
      }, 1)

      const schedule = service.getInstallmentSchedule(result.id!)
      expect(schedule).toHaveLength(2)
      expect(schedule[0].installment_number).toBe(1)
      expect(schedule[1].installment_number).toBe(2)
    })
  })

  describe('deactivatePolicy', () => {
    it('should soft-delete a policy', () => {
      const result = service.createPolicy({
        policy_name: 'To Deactivate',
        academic_year_id: 1,
        student_type: 'ALL',
        schedules: [
          { installment_number: 1, percentage: 50, due_date: '2026-02-01' },
          { installment_number: 2, percentage: 50, due_date: '2026-04-01' }
        ]
      }, 1)

      const deactivateResult = service.deactivatePolicy(result.id!, 1)
      expect(deactivateResult.success).toBe(true)

      const policies = service.getPoliciesForTerm(1)
      expect(policies).toHaveLength(0)
    })
  })

  // ── branch coverage: constructor default db fallback (line 52) ──
  describe('constructor – default database fallback', () => {
    it('uses getDatabase() when no db argument is provided', () => {
      fallbackDb = db // point mock at the same in-memory db
      const svcNoArg = new InstallmentPolicyService()

      const result = svcNoArg.createPolicy({
        policy_name: 'Fallback DB Plan',
        academic_year_id: 1,
        student_type: 'ALL',
        schedules: [
          { installment_number: 1, percentage: 50, due_date: '2026-02-01' },
          { installment_number: 2, percentage: 50, due_date: '2026-04-01' }
        ]
      }, 1)

      expect(result.success).toBe(true)
      expect(result.id).toBeGreaterThan(0)
    })
  })
})
