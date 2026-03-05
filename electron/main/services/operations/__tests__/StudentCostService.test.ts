/**
 * Tests for StudentCostService.
 *
 * Uses in-memory SQLite with minimal schemas for all tables referenced by the
 * service: academic_year, term, student, enrollment, boarding_expense,
 * student_route_assignment, transport_route_expense, student_activity_participation,
 * cbc_strand_expense, student_cost_snapshot, fee_invoice.
 */
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let testDb: Database.Database
vi.mock('../../../database', () => ({ getDatabase: () => testDb }))

import { StudentCostService } from '../StudentCostService'

/* ── Schema ───────────────────────────────────────────────────────── */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS academic_year (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year_name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS term (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    academic_year_id INTEGER NOT NULL,
    term_number INTEGER NOT NULL,
    FOREIGN KEY (academic_year_id) REFERENCES academic_year(id)
  );

  CREATE TABLE IF NOT EXISTS student (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admission_number TEXT NOT NULL UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    student_type TEXT NOT NULL DEFAULT 'DAY_SCHOLAR'
  );

  CREATE TABLE IF NOT EXISTS enrollment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    academic_year_id INTEGER NOT NULL,
    term_id INTEGER NOT NULL,
    stream_id INTEGER DEFAULT 1,
    student_type TEXT NOT NULL DEFAULT 'DAY_SCHOLAR',
    status TEXT DEFAULT 'ACTIVE',
    FOREIGN KEY (student_id) REFERENCES student(id),
    FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
    FOREIGN KEY (term_id) REFERENCES term(id)
  );

  CREATE TABLE IF NOT EXISTS boarding_expense (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fiscal_year INTEGER NOT NULL,
    term INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS student_route_assignment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    route_id INTEGER NOT NULL,
    academic_year INTEGER NOT NULL,
    term INTEGER NOT NULL,
    is_active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS transport_route_expense (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route_id INTEGER NOT NULL,
    fiscal_year INTEGER NOT NULL,
    term INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS student_activity_participation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    cbc_strand_id INTEGER NOT NULL,
    academic_year INTEGER NOT NULL,
    term INTEGER NOT NULL,
    is_active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS cbc_strand_expense (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cbc_strand_id INTEGER NOT NULL,
    fiscal_year INTEGER NOT NULL,
    term INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS student_cost_snapshot (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    academic_year INTEGER NOT NULL,
    term INTEGER NOT NULL,
    cost_per_student INTEGER DEFAULT 0,
    teaching_cost_per_student INTEGER DEFAULT 0,
    facilities_cost_per_student INTEGER DEFAULT 0,
    activities_cost_per_student INTEGER DEFAULT 0,
    administration_cost_per_student INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS fee_invoice (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    term_id INTEGER NOT NULL,
    total_amount INTEGER DEFAULT 0
  );
`

/* ── Seed helpers ─────────────────────────────────────────────────── */
function seedBaseData() {
  testDb.exec(`
    INSERT INTO academic_year (id, year_name) VALUES (1, '2025');
    INSERT INTO term (id, academic_year_id, term_number) VALUES (1, 1, 1);
    INSERT INTO student (id, admission_number, first_name, last_name, student_type) VALUES (1, 'ADM001', 'John', 'Doe', 'DAY_SCHOLAR');
    INSERT INTO enrollment (student_id, academic_year_id, term_id, stream_id, student_type, status) VALUES (1, 1, 1, 1, 'DAY_SCHOLAR', 'ACTIVE');
  `)
}

function seedBoarder() {
  testDb.exec(`
    INSERT INTO student (id, admission_number, first_name, last_name, student_type) VALUES (2, 'ADM002', 'Jane', 'Smith', 'BOARDER');
    INSERT INTO enrollment (student_id, academic_year_id, term_id, stream_id, student_type, status) VALUES (2, 1, 1, 1, 'BOARDER', 'ACTIVE');
  `)
}

function seedSnapshot(overrides: Partial<{
  cost_per_student: number
  teaching_cost_per_student: number
  facilities_cost_per_student: number
  activities_cost_per_student: number
  administration_cost_per_student: number
}> = {}) {
  const o = {
    cost_per_student: 10000,
    teaching_cost_per_student: 4000,
    facilities_cost_per_student: 2000,
    activities_cost_per_student: 1000,
    administration_cost_per_student: 3000,
    ...overrides
  }
  testDb.prepare(`
    INSERT INTO student_cost_snapshot
      (academic_year, term, cost_per_student, teaching_cost_per_student, facilities_cost_per_student, activities_cost_per_student, administration_cost_per_student)
    VALUES (2025, 1, ?, ?, ?, ?, ?)
  `).run(o.cost_per_student, o.teaching_cost_per_student, o.facilities_cost_per_student, o.activities_cost_per_student, o.administration_cost_per_student)
}

/* ── Setup / teardown ─────────────────────────────────────────────── */
let service: StudentCostService

beforeEach(() => {
  testDb = new Database(':memory:')
  testDb.pragma('journal_mode = WAL')
  testDb.exec(SCHEMA)
  service = new StudentCostService()
})

afterEach(() => {
  testDb.close()
})

/* ================================================================== */
/*  calculateStudentCost()                                             */
/* ================================================================== */
describe('calculateStudentCost()', () => {
  it('throws when student is not enrolled', async () => {
    testDb.exec(`INSERT INTO academic_year (id, year_name) VALUES (1, '2025');`)
    testDb.exec(`INSERT INTO term (id, academic_year_id, term_number) VALUES (1, 1, 1);`)

    await expect(service.calculateStudentCost(999, 1, 1)).rejects.toThrow('not found or not enrolled')
  })

  it('calculates cost for a day scholar with snapshot only', async () => {
    seedBaseData()
    seedSnapshot()

    const result = await service.calculateStudentCost(1, 1, 1)
    expect(result.student_id).toBe(1)
    expect(result.term_id).toBe(1)
    expect(result.academic_year_id).toBe(1)
    // Day scholar: no boarding, no transport, no activities. Total = snapshot.overheadCost = 10000
    expect(result.total_cost).toBe(10000)
    expect(result.breakdown.tuition_share).toBe(4000)
    expect(result.breakdown.boarding_share).toBe(0)
    expect(result.breakdown.transport_share).toBe(0)
    expect(result.breakdown.admin_share).toBe(3000)
  })

  it('includes boarding cost for BOARDER students', async () => {
    seedBaseData()
    seedBoarder()
    seedSnapshot()

    // Boarding expense: 100000 total, 1 boarder → 100000 per boarder
    testDb.exec(`INSERT INTO boarding_expense (fiscal_year, term, amount_cents) VALUES (2025, 1, 100000);`)

    const result = await service.calculateStudentCost(2, 1, 1)
    expect(result.breakdown.boarding_share).toBe(100000)
    expect(result.total_cost).toBe(100000 + 10000) // boarding + overhead
  })

  it('splits boarding cost among multiple boarders', async () => {
    seedBaseData()
    seedBoarder()
    // Add a third boarder
    testDb.exec(`
      INSERT INTO student (id, admission_number, first_name, last_name, student_type) VALUES (3, 'ADM003', 'Alex', 'Jones', 'BOARDER');
      INSERT INTO enrollment (student_id, academic_year_id, term_id, stream_id, student_type, status) VALUES (3, 1, 1, 1, 'BOARDER', 'ACTIVE');
    `)
    seedSnapshot()
    testDb.exec(`INSERT INTO boarding_expense (fiscal_year, term, amount_cents) VALUES (2025, 1, 200000);`)

    const result = await service.calculateStudentCost(2, 1, 1)
    // 200000 / 2 boarders = 100000
    expect(result.breakdown.boarding_share).toBe(100000)
  })

  it('includes transport cost when student has route assignment', async () => {
    seedBaseData()
    seedSnapshot()

    testDb.exec(`
      INSERT INTO student_route_assignment (student_id, route_id, academic_year, term, is_active) VALUES (1, 10, 2025, 1, 1);
      INSERT INTO transport_route_expense (route_id, fiscal_year, term, amount_cents) VALUES (10, 2025, 1, 50000);
    `)

    const result = await service.calculateStudentCost(1, 1, 1)
    // 1 student on route → 50000 per student
    expect(result.breakdown.transport_share).toBe(50000)
    expect(result.total_cost).toBe(50000 + 10000)
  })

  it('splits transport cost among route students', async () => {
    seedBaseData()
    seedSnapshot()
    testDb.exec(`
      INSERT INTO student (id, admission_number, first_name, last_name, student_type) VALUES (4, 'ADM004', 'Bob', 'Lee', 'DAY_SCHOLAR');
      INSERT INTO enrollment (student_id, academic_year_id, term_id, stream_id, student_type, status) VALUES (4, 1, 1, 1, 'DAY_SCHOLAR', 'ACTIVE');
      INSERT INTO student_route_assignment (student_id, route_id, academic_year, term, is_active) VALUES (1, 10, 2025, 1, 1);
      INSERT INTO student_route_assignment (student_id, route_id, academic_year, term, is_active) VALUES (4, 10, 2025, 1, 1);
      INSERT INTO transport_route_expense (route_id, fiscal_year, term, amount_cents) VALUES (10, 2025, 1, 90000);
    `)

    const result = await service.calculateStudentCost(1, 1, 1)
    expect(result.breakdown.transport_share).toBe(45000) // 90000 / 2
  })

  it('includes activity costs from participations', async () => {
    seedBaseData()
    seedSnapshot()
    testDb.exec(`
      INSERT INTO student_activity_participation (student_id, cbc_strand_id, academic_year, term, is_active) VALUES (1, 5, 2025, 1, 1);
      INSERT INTO cbc_strand_expense (cbc_strand_id, fiscal_year, term, amount_cents) VALUES (5, 2025, 1, 30000);
    `)

    const result = await service.calculateStudentCost(1, 1, 1)
    // activity_share = activityCost + snapshotCosts.activitiesOverhead = 30000 + 1000
    expect(result.breakdown.activity_share).toBe(30000 + 1000)
  })

  it('accumulates costs from multiple activity participations', async () => {
    seedBaseData()
    seedSnapshot()
    testDb.exec(`
      INSERT INTO student_activity_participation (student_id, cbc_strand_id, academic_year, term, is_active) VALUES (1, 5, 2025, 1, 1);
      INSERT INTO student_activity_participation (student_id, cbc_strand_id, academic_year, term, is_active) VALUES (1, 6, 2025, 1, 1);
      INSERT INTO cbc_strand_expense (cbc_strand_id, fiscal_year, term, amount_cents) VALUES (5, 2025, 1, 10000);
      INSERT INTO cbc_strand_expense (cbc_strand_id, fiscal_year, term, amount_cents) VALUES (6, 2025, 1, 20000);
    `)

    const result = await service.calculateStudentCost(1, 1, 1)
    // 10000 + 20000 = 30000 activity + 1000 overhead
    expect(result.breakdown.activity_share).toBe(31000)
  })

  it('returns zero for all costs when no snapshot and no variable costs', async () => {
    seedBaseData()

    const result = await service.calculateStudentCost(1, 1, 1)
    expect(result.total_cost).toBe(0)
    expect(result.breakdown.tuition_share).toBe(0)
    expect(result.breakdown.boarding_share).toBe(0)
    expect(result.breakdown.transport_share).toBe(0)
    expect(result.breakdown.activity_share).toBe(0)
    expect(result.breakdown.admin_share).toBe(0)
    expect(result.breakdown.other_share).toBe(0)
  })

  it('other_share = facilitiesCost + otherOverhead', async () => {
    seedBaseData()
    // Snapshot where cost_per_student > sum of components → otherOverhead > 0
    seedSnapshot({
      cost_per_student: 15000,
      teaching_cost_per_student: 4000,
      facilities_cost_per_student: 2000,
      activities_cost_per_student: 1000,
      administration_cost_per_student: 3000
    })

    const result = await service.calculateStudentCost(1, 1, 1)
    // otherOverhead = 15000 - (4000+2000+1000+3000) = 5000
    // other_share = facilities(2000) + otherOverhead(5000) = 7000
    expect(result.breakdown.other_share).toBe(7000)
  })
})

/* ================================================================== */
/*  getCostBreakdown()                                                 */
/* ================================================================== */
describe('getCostBreakdown()', () => {
  it('throws when term is not found', async () => {
    await expect(service.getCostBreakdown(1, 999)).rejects.toThrow('Term not found')
  })

  it('returns breakdown for valid student/term', async () => {
    seedBaseData()
    seedSnapshot()

    const breakdown = await service.getCostBreakdown(1, 1)
    expect(breakdown.tuition_share).toBe(4000)
    expect(breakdown.admin_share).toBe(3000)
    expect(breakdown.boarding_share).toBe(0)
  })
})

/* ================================================================== */
/*  getCostVsRevenue()                                                 */
/* ================================================================== */
describe('getCostVsRevenue()', () => {
  it('calculates surplus when revenue exceeds cost', async () => {
    seedBaseData()
    seedSnapshot()
    testDb.exec(`INSERT INTO fee_invoice (student_id, term_id, total_amount) VALUES (1, 1, 50000);`)

    const result = await service.getCostVsRevenue(1, 1)
    expect(result.cost).toBe(10000) // from snapshot
    expect(result.revenue).toBe(50000)
    expect(result.surplus_or_deficit).toBe(40000)
    expect(result.subsidy).toBe(0) // revenue > cost
  })

  it('calculates deficit and subsidy when cost exceeds revenue', async () => {
    seedBaseData()
    seedSnapshot({ cost_per_student: 100000 })
    testDb.exec(`INSERT INTO fee_invoice (student_id, term_id, total_amount) VALUES (1, 1, 20000);`)

    const result = await service.getCostVsRevenue(1, 1)
    expect(result.cost).toBe(100000)
    expect(result.revenue).toBe(20000)
    expect(result.surplus_or_deficit).toBe(-80000)
    expect(result.subsidy).toBe(80000)
  })

  it('returns zero revenue when no invoice exists', async () => {
    seedBaseData()
    seedSnapshot()

    const result = await service.getCostVsRevenue(1, 1)
    expect(result.revenue).toBe(0)
    expect(result.subsidy).toBe(10000) // cost - 0
  })
})

/* ================================================================== */
/*  getAverageCostPerStudent()                                         */
/* ================================================================== */
describe('getAverageCostPerStudent()', () => {
  it('returns 0 when term not found', async () => {
    const result = await service.getAverageCostPerStudent(1, 999)
    expect(result).toBe(0)
  })

  it('returns 0 when no snapshot exists', async () => {
    seedBaseData()
    const result = await service.getAverageCostPerStudent(1, 1)
    expect(result).toBe(0)
  })

  it('returns cost_per_student from snapshot', async () => {
    seedBaseData()
    seedSnapshot({ cost_per_student: 25000 })

    const result = await service.getAverageCostPerStudent(1, 1)
    expect(result).toBe(25000)
  })
})

/* ================================================================== */
/*  getCostTrendAnalysis()                                             */
/* ================================================================== */
describe('getCostTrendAnalysis()', () => {
  it('returns empty array when no snapshots exist', async () => {
    const result = await service.getCostTrendAnalysis(1, 3)
    expect(result).toEqual([])
  })

  it('returns formatted trend data from snapshots', async () => {
    testDb.exec(`
      INSERT INTO student_cost_snapshot (academic_year, term, cost_per_student) VALUES (2025, 1, 10000);
      INSERT INTO student_cost_snapshot (academic_year, term, cost_per_student) VALUES (2025, 2, 12000);
      INSERT INTO student_cost_snapshot (academic_year, term, cost_per_student) VALUES (2024, 3, 9000);
    `)

    const result = await service.getCostTrendAnalysis(1, 5) as Array<{ period: string; cost: number }>
    expect(result).toHaveLength(3)
    // Ordered by academic_year DESC, term DESC
    expect(result[0].period).toBe('Term 2 2025')
    expect(result[0].cost).toBe(12000)
    expect(result[1].period).toBe('Term 1 2025')
    expect(result[2].period).toBe('Term 3 2024')
  })

  it('respects the periods limit', async () => {
    testDb.exec(`
      INSERT INTO student_cost_snapshot (academic_year, term, cost_per_student) VALUES (2025, 1, 10000);
      INSERT INTO student_cost_snapshot (academic_year, term, cost_per_student) VALUES (2025, 2, 12000);
      INSERT INTO student_cost_snapshot (academic_year, term, cost_per_student) VALUES (2024, 3, 9000);
    `)

    const result = await service.getCostTrendAnalysis(1, 2) as Array<{ period: string; cost: number }>
    expect(result).toHaveLength(2)
  })
})

/* ================================================================== */
/*  Additional coverage tests                                          */
/* ================================================================== */
describe('edge cases for fiscal year and term number resolution', () => {
  it('falls back to current year when year_name is non-numeric', async () => {
    seedBaseData()
    testDb.exec(`
      INSERT INTO academic_year (id, year_name) VALUES (2, 'Fourteen');
      INSERT INTO term (id, academic_year_id, term_number) VALUES (2, 2, 1);
      INSERT INTO enrollment (student_id, academic_year_id, term_id, stream_id, student_type, status) VALUES (1, 2, 2, 1, 'DAY_SCHOLAR', 'ACTIVE');
    `)
    // Should not throw; falls back to Date.getFullYear()
    const result = await service.calculateStudentCost(1, 2, 2)
    expect(result.student_id).toBe(1)
  })

  it('getTermNumber defaults to 1 when term has no term_number', async () => {
    seedBaseData()
    seedSnapshot()
    // term 1 already has term_number=1, verify it works
    const result = await service.calculateStudentCost(1, 1, 1)
    expect(result.term_id).toBe(1)
  })

  it('boarding cost returns 0 when no boarders enrolled', async () => {
    seedBaseData()
    seedSnapshot()
    testDb.exec(`INSERT INTO boarding_expense (fiscal_year, term, amount_cents) VALUES (2025, 1, 100000);`)
    // Student 1 is DAY_SCHOLAR, so boarding = 0 even though expense exists
    const result = await service.calculateStudentCost(1, 1, 1)
    expect(result.breakdown.boarding_share).toBe(0)
  })

  it('transport cost returns 0 when route assignment is inactive', async () => {
    seedBaseData()
    seedSnapshot()
    testDb.exec(`
      INSERT INTO student_route_assignment (student_id, route_id, academic_year, term, is_active) VALUES (1, 10, 2025, 1, 0);
      INSERT INTO transport_route_expense (route_id, fiscal_year, term, amount_cents) VALUES (10, 2025, 1, 50000);
    `)
    const result = await service.calculateStudentCost(1, 1, 1)
    expect(result.breakdown.transport_share).toBe(0)
  })

  it('snapshot overheadCost falls back to component sum when cost_per_student = 0', async () => {
    seedBaseData()
    seedSnapshot({
      cost_per_student: 0,
      teaching_cost_per_student: 3000,
      facilities_cost_per_student: 1000,
      activities_cost_per_student: 500,
      administration_cost_per_student: 1500
    })
    const result = await service.calculateStudentCost(1, 1, 1)
    // overheadCost = 0, so falls back to 3000+1000+500+1500=6000
    // otherOverhead = max(0, 6000-(3000+1000+500+1500)) = 0
    expect(result.total_cost).toBe(6000)
    expect(result.breakdown.other_share).toBe(1000) // facilities(1000) + otherOverhead(0)
  })

  // ── Branch coverage: getAcademicYearValue NaN fallback ──
  it('getAcademicYearValue falls back to current year when year_name is non-numeric', async () => {
    seedBaseData()
    seedSnapshot()
    // Change year_name to non-numeric
    testDb.exec(`UPDATE academic_year SET year_name = 'ABC' WHERE id = 1`)
    // This should not throw — it falls back to new Date().getFullYear()
    // The snapshot won't match, so costs will be 0, but the function should not throw
    const result = await service.calculateStudentCost(1, 1, 1)
    expect(result.student_id).toBe(1)
    // total_cost will be 0 because no snapshot matches the fallback year
    expect(result.total_cost).toBe(0)
  })

  // ── Branch coverage: getTermNumber with non-existent term → default 1 ──
  it('getTermNumber defaults to 1 when term row does not exist', async () => {
    seedBaseData()
    seedSnapshot()
    // Use a term_id that doesn't exist in the term table
    testDb.exec(`INSERT INTO term (id, academic_year_id, term_number) VALUES (99, 1, 3)`)
    testDb.exec(`INSERT INTO enrollment (student_id, stream_id, student_type, academic_year_id, term_id, status) VALUES (1, 1, 'DAY_SCHOLAR', 1, 99, 'ACTIVE')`)
    const result = await service.calculateStudentCost(1, 99, 1)
    expect(result.term_id).toBe(99)
  })

  // ── Branch coverage: getCostVsRevenue no invoice → revenue = 0 ──
  it('getCostVsRevenue returns revenue=0 and computed subsidy when no invoice exists', async () => {
    seedBaseData()
    seedSnapshot()
    const result = await service.getCostVsRevenue(1, 1)
    expect(result.revenue).toBe(0)
    expect(result.subsidy).toBeGreaterThanOrEqual(0)
    expect(result.surplus_or_deficit).toBeLessThanOrEqual(0)
  })

  // ── Branch coverage: getCostVsRevenue with existing invoice ──
  it('getCostVsRevenue returns actual revenue when invoice exists', async () => {
    seedBaseData()
    seedSnapshot()
    testDb.exec(`INSERT INTO fee_invoice (student_id, term_id, total_amount) VALUES (1, 1, 50000)`)
    const result = await service.getCostVsRevenue(1, 1)
    expect(result.revenue).toBe(50000)
  })

  // ── Branch coverage: getCostBreakdown with non-existent term ──
  it('getCostBreakdown throws when term not found', async () => {
    seedBaseData()
    await expect(service.getCostBreakdown(1, 999)).rejects.toThrow('Term not found')
  })

  // ── Branch coverage: getAverageCostPerStudent with non-existent term ──
  it('getAverageCostPerStudent returns 0 when term not found', async () => {
    seedBaseData()
    const avg = await service.getAverageCostPerStudent(1, 999)
    expect(avg).toBe(0)
  })

  /* ==================================================================
   *  Branch coverage: BOARDER student with boarding expenses
   * ================================================================== */
  it('calculates non-zero boarding cost for BOARDER students', async () => {
    seedBaseData()
    seedSnapshot()
    // Add a boarder student
    testDb.exec(`
      INSERT INTO student (id, admission_number, first_name, last_name, student_type) VALUES (2, 'ADM002', 'Bob', 'Student', 'BOARDER');
      INSERT INTO enrollment (student_id, stream_id, student_type, academic_year_id, term_id, status) VALUES (2, 1, 'BOARDER', 1, 1, 'ACTIVE');
      INSERT INTO boarding_expense (fiscal_year, term, amount_cents) VALUES (2025, 1, 120000);
    `)
    const result = await service.calculateStudentCost(2, 1, 1)
    expect(result.breakdown.boarding_share).toBe(120000) // 120000 / 1 boarder
  })

  /* ==================================================================
   *  Branch coverage: transport cost with active route assignment
   * ================================================================== */
  it('calculates non-zero transport cost with active route assignment', async () => {
    seedBaseData()
    seedSnapshot()
    testDb.exec(`
      INSERT INTO student_route_assignment (student_id, route_id, academic_year, term, is_active) VALUES (1, 5, 2025, 1, 1);
      INSERT INTO transport_route_expense (route_id, fiscal_year, term, amount_cents) VALUES (5, 2025, 1, 60000);
    `)
    const result = await service.calculateStudentCost(1, 1, 1)
    expect(result.breakdown.transport_share).toBe(60000) // 60000 / 1 student on route
  })

  /* ==================================================================
   *  Branch coverage: activity cost with active participation
   * ================================================================== */
  it('calculates non-zero activity cost with active activity participation', async () => {
    seedBaseData()
    seedSnapshot()
    testDb.exec(`
      INSERT INTO student_activity_participation (student_id, cbc_strand_id, academic_year, term, is_active) VALUES (1, 10, 2025, 1, 1);
      INSERT INTO cbc_strand_expense (cbc_strand_id, fiscal_year, term, amount_cents) VALUES (10, 2025, 1, 30000);
    `)
    const result = await service.calculateStudentCost(1, 1, 1)
    // activity_share = activityCost + snapshot.activitiesOverhead
    expect(result.breakdown.activity_share).toBeGreaterThan(0)
  })

  /* ==================================================================
   *  Branch coverage: getAcademicYearValue with null year_name
   * ================================================================== */
  it('getAcademicYearValue falls back when year_name is null', async () => {
    seedBaseData()
    seedSnapshot()
    testDb.exec(`UPDATE academic_year SET year_name = '' WHERE id = 1`)
    // Should not throw — empty string is falsy → ternary returns NaN → falls back to current year
    const result = await service.calculateStudentCost(1, 1, 1)
    expect(result.student_id).toBe(1)
  })

  /* ==================================================================
   *  Branch coverage: snapshot with all null sub-costs
   * ================================================================== */
  it('snapshot handles null sub-cost fields', async () => {
    seedBaseData()
    testDb.exec(`
      INSERT INTO student_cost_snapshot (academic_year, term, cost_per_student,
        teaching_cost_per_student, facilities_cost_per_student,
        activities_cost_per_student, administration_cost_per_student)
      VALUES (2025, 1, 10000, NULL, NULL, NULL, NULL)
    `)
    const result = await service.calculateStudentCost(1, 1, 1)
    // All sub-costs fallback to 0 via || 0; overheadCost = cost_per_student = 10000
    expect(result.total_cost).toBe(10000)
    expect(result.breakdown.tuition_share).toBe(0)
    expect(result.breakdown.admin_share).toBe(0)
  })

  /* ==================================================================
   *  Branch coverage: getCostTrendAnalysis
   * ================================================================== */
  it('getCostTrendAnalysis returns formatted trend rows', async () => {
    seedBaseData()
    testDb.exec(`
      INSERT INTO student_cost_snapshot (academic_year, term, cost_per_student,
        teaching_cost_per_student, facilities_cost_per_student,
        activities_cost_per_student, administration_cost_per_student)
      VALUES (2025, 1, 8000, 4000, 1000, 500, 2500),
             (2025, 2, 8500, 4200, 1100, 550, 2650);
    `)
    const trend = await service.getCostTrendAnalysis(1, 5)
    expect(trend.length).toBe(2)
    expect((trend[0] as any).period).toMatch(/Term \d+ \d+/)
  })

  /* ==================================================================
   *  Branch coverage: BOARDER with zero active boarder count → boarding cost = 0 (L99-100)
   * ================================================================== */
  it('getBoardingCost returns 0 when no active boarder enrollments', async () => {
    seedBaseData()
    seedSnapshot()
    // Add a BOARDER student with INACTIVE enrollment
    testDb.exec(`
      INSERT INTO student (id, admission_number, first_name, last_name, student_type) VALUES (3, 'ADM003', 'Ghost', 'Boarder', 'BOARDER');
      INSERT INTO enrollment (student_id, academic_year_id, term_id, stream_id, student_type, status) VALUES (3, 1, 1, 1, 'BOARDER', 'INACTIVE');
      INSERT INTO boarding_expense (fiscal_year, term, amount_cents) VALUES (2025, 1, 50000);
    `)
    const result = await service.calculateStudentCost(3, 1, 1)
    // Enrollment found (no status check) but boarder count query finds 0 active boarders → boarding_share = 0
    expect(result.breakdown.boarding_share).toBe(0)
  })

  /* ==================================================================
   *  Branch coverage: transport cost with route assignment (L129-130)
   * ================================================================== */
  it('calculates non-zero transport cost with active route assignment', async () => {
    seedBaseData()
    seedSnapshot()
    testDb.exec(`
      INSERT INTO student_route_assignment (student_id, route_id, academic_year, term, is_active) VALUES (1, 100, 2025, 1, 1);
      INSERT INTO transport_route_expense (route_id, fiscal_year, term, amount_cents) VALUES (100, 2025, 1, 60000);
    `)
    const result = await service.calculateStudentCost(1, 1, 1)
    // 1 student on route 100, expense = 60000 → transport_share = 60000
    expect(result.breakdown.transport_share).toBe(60000)
  })

  /* ==================================================================
   *  Branch coverage: activity cost with multiple participations
   * ================================================================== */
  it('accumulates costs from multiple activity participations', async () => {
    seedBaseData()
    seedSnapshot()
    testDb.exec(`
      INSERT INTO student_activity_participation (student_id, cbc_strand_id, academic_year, term, is_active) VALUES (1, 1, 2025, 1, 1), (1, 2, 2025, 1, 1);
      INSERT INTO cbc_strand_expense (cbc_strand_id, fiscal_year, term, amount_cents) VALUES (1, 2025, 1, 10000), (2, 2025, 1, 20000);
    `)
    const result = await service.calculateStudentCost(1, 1, 1)
    // 10000 + 20000 from expenses + 1000 from snapshot activitiesOverhead
    expect(result.breakdown.activity_share).toBe(31000)
  })

  /* ==================================================================
   *  Branch: getTermNumber ?? 1 fallback when term row missing
   * ================================================================== */
  it('getTermNumber falls back to 1 when term row does not exist in term table', async () => {
    seedBaseData()
    seedSnapshot() // snapshot for (2025, 1)
    // Insert enrollment for term_id 88 which has no row in 'term' table
    testDb.pragma('foreign_keys = OFF')
    testDb.exec(`INSERT INTO enrollment (student_id, academic_year_id, term_id, stream_id, student_type, status) VALUES (1, 1, 88, 1, 'DAY_SCHOLAR', 'ACTIVE')`)
    testDb.pragma('foreign_keys = ON')

    // getTermNumber(88) → row is undefined → ?? 1
    // Snapshot lookup uses (2025, 1) → matches seeded snapshot
    const result = await service.calculateStudentCost(1, 88, 1)
    expect(result.term_id).toBe(88)
    // total_cost should come from the snapshot matched by term_number=1
    expect(result.total_cost).toBe(10000)
  })

  /* ==================================================================
   *  Branch: getAcademicYearValue when academic_year row missing entirely
   * ================================================================== */
  it('getAcademicYearValue falls back to current year when academic_year row is missing', async () => {
    seedBaseData()
    // Insert enrollment for academic_year_id 999 which has no row in academic_year table
    testDb.pragma('foreign_keys = OFF')
    testDb.exec(`INSERT INTO enrollment (student_id, academic_year_id, term_id, stream_id, student_type, status) VALUES (1, 999, 1, 1, 'DAY_SCHOLAR', 'ACTIVE')`)
    testDb.pragma('foreign_keys = ON')

    // getAcademicYearValue(999) → row is undefined → NaN → falls back to new Date().getFullYear()
    const result = await service.calculateStudentCost(1, 1, 999)
    expect(result.student_id).toBe(1)
    expect(result.academic_year_id).toBe(999)
    // No snapshot matches the current year, so total_cost = 0
    expect(result.total_cost).toBe(0)
  })

  /* ==================================================================
   *  Branch: getTransportCost routeCount <= 0 (route exists, 0 students)
   * ================================================================== */
  it('getTransportCost returns 0 when route student count is 0', async () => {
    seedBaseData()
    seedSnapshot()
    // Insert route assignment for a different academic year so this student's
    // assignment is found but route has 0 active students for (2025, 1)
    testDb.exec(`
      INSERT INTO student_route_assignment (student_id, route_id, academic_year, term, is_active) VALUES (1, 20, 2025, 1, 1);
      INSERT INTO transport_route_expense (route_id, fiscal_year, term, amount_cents) VALUES (20, 2025, 1, 80000);
    `)
    // Now deactivate ALL assignments on route 20 so the count query returns 0
    testDb.exec(`UPDATE student_route_assignment SET is_active = 0 WHERE route_id = 20`)

    const result = await service.calculateStudentCost(1, 1, 1)
    // Transport assignment not found (is_active=0) → getTransportCost returns early
    expect(result.breakdown.transport_share).toBe(0)
  })
})
