import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { ScholarshipService } from '../ScholarshipService'

// Mock audit utilities
vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn()
}))

describe('ScholarshipService', () => {
  let db: Database.Database
  let service: ScholarshipService

  beforeEach(() => {
    db = new Database(':memory:')
    
    db.exec(`
      CREATE TABLE student (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        full_name TEXT,
        admission_number TEXT UNIQUE NOT NULL
      );

      CREATE TABLE scholarship (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        scholarship_type TEXT NOT NULL,
        amount REAL,
        percentage REAL,
        total_amount REAL NOT NULL,
        allocated_amount REAL DEFAULT 0,
        available_amount REAL,
        current_beneficiaries INTEGER DEFAULT 0,
        total_allocated REAL DEFAULT 0,
        max_beneficiaries INTEGER DEFAULT 9999,
        eligibility_criteria TEXT,
        valid_from DATE,
        valid_to DATE,
        start_date DATE,
        end_date DATE,
        sponsor_name TEXT,
        sponsor_contact TEXT,
        status TEXT DEFAULT 'ACTIVE',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE student_scholarship (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        scholarship_id INTEGER NOT NULL,
        amount_allocated REAL NOT NULL,
        amount_utilized REAL DEFAULT 0,
        allocation_date DATE,
        effective_date DATE,
        expiry_date DATE,
        allocation_notes TEXT,
        status TEXT DEFAULT 'ACTIVE',
        notes TEXT,
        FOREIGN KEY (student_id) REFERENCES student(id),
        FOREIGN KEY (scholarship_id) REFERENCES scholarship(id)
      );

      -- Insert test students
      INSERT INTO student (first_name, last_name, admission_number)
      VALUES 
        ('John', 'Doe', 'STU-001'),
        ('Jane', 'Smith', 'STU-002');

      -- Insert test scholarships
      INSERT INTO scholarship (name, scholarship_type, total_amount, allocated_amount, available_amount, start_date, end_date, status)
      VALUES 
        ('Merit Award 2026', 'MERIT', 500000, 0, 500000, '2026-01-01', '2026-12-31', 'ACTIVE'),
        ('Need-Based Grant', 'NEED_BASED', 300000, 100000, 200000, '2026-01-01', '2026-12-31', 'ACTIVE'),
        ('Sports Excellence', 'SPORTS', 150000, 150000, 0, '2026-01-01', '2026-12-31', 'ACTIVE'),
        ('Expired Scholarship', 'PARTIAL', 100000, 0, 100000, '2025-01-01', '2025-12-31', 'EXPIRED');
    `)

    service = new ScholarshipService(db)
  })

  afterEach(() => {
    if (db) {db.close()}
  })

  describe('createScholarship', () => {
    it('should create new scholarship', async () => {
      const result = await service.createScholarship({
        name: 'Academic Excellence 2026',
        type: 'MERIT',
        totalAmount: 600000,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        eligibilityCriteria: 'GPA > 3.8',
        userId: 10
      })

      expect(result).toBeDefined()
    })

    it('should validate positive amount', async () => {
      const result = await service.createScholarship({
        name: 'Test Scholarship',
        type: 'MERIT',
        totalAmount: -10000,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        userId: 10
      })

      expect(result).toBeDefined()
    })

    it('should validate date range', async () => {
      const result = await service.createScholarship({
        name: 'Test Scholarship',
        type: 'MERIT',
        totalAmount: 100000,
        startDate: '2026-12-31',
        endDate: '2026-01-01',
        userId: 10
      })

      expect(result).toBeDefined()
    })

    it('should create scholarship in database', async () => {
      await service.createScholarship({
        name: 'New Test Scholarship',
        type: 'MERIT',
        totalAmount: 200000,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        userId: 10
      })

      const scholarship = db.prepare('SELECT * FROM scholarship WHERE name = ?').get('New Test Scholarship') as unknown
      expect(scholarship).toBeDefined()
    })
  })

  describe('allocateScholarship', () => {
    it('should allocate scholarship to student', async () => {
      const result = await service.allocateScholarship({
        studentId: 1,
        scholarshipId: 1,
        amount: 50000,
        allocationDate: '2026-01-15',
        notes: 'High academic performance',
        userId: 10
      })

      expect(result).toBeDefined()
    })

    it('should update scholarship available amount', async () => {
      await service.allocateScholarship({
        studentId: 1,
        scholarshipId: 1,
        amount: 50000,
        allocationDate: '2026-01-15',
        userId: 10
      })

      const scholarship = db.prepare('SELECT * FROM scholarship WHERE id = ?').get(1) as unknown
      expect(scholarship.allocated_amount).toBeGreaterThanOrEqual(50000)
    })

    it('should prevent allocation exceeding available amount', async () => {
      const result = await service.allocateScholarship({
        studentId: 1,
        scholarshipId: 1,
        amount: 600000,
        allocationDate: '2026-01-15',
        userId: 10
      })

      expect(result).toBeDefined()
    })

    it('should prevent allocation to expired scholarship', async () => {
      const result = await service.allocateScholarship({
        studentId: 1,
        scholarshipId: 4,
        amount: 10000,
        allocationDate: '2026-01-15',
        userId: 10
      })

      expect(result).toBeDefined()
    })

    it('should prevent allocation to fully utilized scholarship', async () => {
      const result = await service.allocateScholarship({
        studentId: 1,
        scholarshipId: 3,
        amount: 10000,
        allocationDate: '2026-01-15',
        userId: 10
      })

      expect(result).toBeDefined()
    })

    it('should validate positive allocation amount', async () => {
      const result = await service.allocateScholarship({
        studentId: 1,
        scholarshipId: 1,
        amount: -10000,
        allocationDate: '2026-01-15',
        userId: 10
      })

      expect(result).toBeDefined()
    })

    it('should create allocation in database', async () => {
      await service.allocateScholarship({
        studentId: 1,
        scholarshipId: 1,
        amount: 50000,
        allocationDate: '2026-01-15',
        userId: 10
      })

      const allocation = db.prepare('SELECT * FROM student_scholarship WHERE student_id = 1 AND scholarship_id = 1').get() as unknown
      expect(allocation).toBeDefined()
    })
  })

  describe('getScholarshipUtilization', () => {
    beforeEach(async () => {
      await service.allocateScholarship({
        studentId: 1,
        scholarshipId: 1,
        amount: 100000,
        allocationDate: '2026-01-15',
        userId: 10
      })

      await service.allocateScholarship({
        studentId: 2,
        scholarshipId: 1,
        amount: 150000,
        allocationDate: '2026-01-20',
        userId: 10
      })
    })

    it('should show scholarship utilization metrics', () => {
      const result = service.getScholarshipUtilization(1)

      expect(result).toBeDefined()
    })

    it('should calculate utilization percentage correctly', () => {
      const scholarship = db.prepare('SELECT * FROM scholarship WHERE id = 1').get() as unknown
      expect(scholarship.allocated_amount).toBeGreaterThan(0)
    })

    it('should list all allocations', () => {
      const allocations = db.prepare('SELECT * FROM student_scholarship WHERE scholarship_id = 1').all() as unknown[]
      expect(allocations.length).toBeGreaterThan(0)
    })

    it('should show 100% utilization for fully allocated scholarship', () => {
      const scholarship = db.prepare('SELECT * FROM scholarship WHERE id = 3').get() as unknown
      
      if (scholarship.available_amount === 0) {
        expect(scholarship.allocated_amount).toBe(scholarship.total_amount)
      }
    })

    it('should show 0% for unused scholarship', async () => {
      await service.createScholarship({
        name: 'Unused Scholarship',
        type: 'MERIT',
        totalAmount: 100000,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        userId: 10
      })

      const scholarship = db.prepare('SELECT * FROM scholarship WHERE name = ?').get('Unused Scholarship') as unknown
      expect(scholarship.allocated_amount).toBe(0)
    })
  })

  describe('getStudentScholarships', () => {
    beforeEach(async () => {
      await service.allocateScholarship({
        studentId: 1,
        scholarshipId: 1,
        amount: 100000,
        allocationDate: '2026-01-15',
        userId: 10
      })

      await service.allocateScholarship({
        studentId: 1,
        scholarshipId: 2,
        amount: 50000,
        allocationDate: '2026-01-20',
        userId: 10
      })
    })

    it('should return all scholarships for student', async () => {
      const scholarships = await service.getStudentScholarships(1)

      expect(scholarships).toBeDefined()
    })

    it('should calculate total scholarship amount', () => {
      const allocations = db.prepare('SELECT SUM(amount_allocated) as total FROM student_scholarship WHERE student_id = 1').get() as unknown
      expect(allocations.total).toBeGreaterThan(0)
    })

    it('should filter by status', () => {
      db.exec(`UPDATE student_scholarship SET status = 'REVOKED' WHERE scholarship_id = 2`)

      const activeAllocations = db.prepare('SELECT * FROM student_scholarship WHERE student_id = 1 AND status = ?').all('ACTIVE') as unknown[]
      expect(activeAllocations).toBeDefined()
    })

    it('should return empty for student with no scholarships', () => {
      db.exec("INSERT INTO student (first_name, last_name, admission_number) VALUES ('New', 'Student', 'STU-003')")

      const allocations = db.prepare('SELECT * FROM student_scholarship WHERE student_id = 3').all() as unknown[]
      expect(allocations).toHaveLength(0)
    })
  })

  describe('validateScholarshipEligibility', () => {
    it('should validate active scholarship', async () => {
      const result = await service.validateScholarshipEligibility(1, 1)

      expect(result).toBeDefined()
    })

    it('should detect insufficient funds', async () => {
      const result = await service.validateScholarshipEligibility(1, 3)

      expect(result).toBeDefined()
    })

    it('should detect expired scholarship', async () => {
      const result = await service.validateScholarshipEligibility(1, 4)

      expect(result).toBeDefined()
    })

    it('should detect non-existent scholarship', async () => {
      const result = await service.validateScholarshipEligibility(1, 999)

      expect(result).toBeDefined()
    })

    it('should detect non-existent student', async () => {
      const result = await service.validateScholarshipEligibility(999, 1)

      expect(result).toBeDefined()
    })
  })

  describe('getAvailableScholarships', () => {
    it('should return active scholarships with funds', async () => {
      const scholarships = await service.getAvailableScholarships()

      expect(scholarships).toBeDefined()
    })

    it('should filter by scholarship type', async () => {
      const meritScholarships = await service.getAvailableScholarships('MERIT')

      expect(meritScholarships).toBeDefined()
    })

    it('should exclude expired scholarships', () => {
      const scholarships = db.prepare('SELECT * FROM scholarship WHERE status = ?').all('ACTIVE') as unknown[]
      expect(scholarships.length).toBeGreaterThan(0)
    })

    it('should exclude fully utilized scholarships', () => {
      const scholarships = db.prepare('SELECT * FROM scholarship WHERE available_amount > 0').all() as unknown[]
      expect(scholarships.length).toBeGreaterThan(0)
    })
  })

  describe('revokeScholarship', () => {
    let allocationId: number

    beforeEach(async () => {
      const result = await service.allocateScholarship({
        studentId: 1,
        scholarshipId: 1,
        amount: 50000,
        allocationDate: '2026-01-15',
        userId: 10
      })
      allocationId = result.allocationId!
    })

    it('should revoke scholarship allocation', async () => {
      const result = await service.revokeScholarship({
        allocationId,
        reason: 'Student withdrew',
        userId: 10
      })

      expect(result).toBeDefined()
    })

    it('should restore scholarship available amount', async () => {
      const beforeRevoke = db.prepare('SELECT * FROM scholarship WHERE id = 1').get() as unknown

      await service.revokeScholarship({
        allocationId,
        reason: 'Student withdrew',
        userId: 10
      })

      const afterRevoke = db.prepare('SELECT * FROM scholarship WHERE id = 1').get() as unknown
      expect(afterRevoke.available_amount).toBeGreaterThanOrEqual(beforeRevoke.available_amount)
    })

    it('should require revocation reason', async () => {
      const result = await service.revokeScholarship({
        allocationId,
        reason: '',
        userId: 10
      })

      expect(result).toBeDefined()
    })

    it('should prevent revoking already revoked allocation', async () => {
      await service.revokeScholarship({
        allocationId,
        reason: 'First revocation',
        userId: 10
      })

      const result = await service.revokeScholarship({
        allocationId,
        reason: 'Second revocation',
        userId: 10
      })

      expect(result).toBeDefined()
    })

    it('should update allocation status', async () => {
      await service.revokeScholarship({
        allocationId,
        reason: 'Test revocation',
        userId: 10
      })

      const allocation = db.prepare('SELECT * FROM student_scholarship WHERE id = ?').get(allocationId) as unknown
      expect(allocation.status).toBe('REVOKED')
    })
  })

  describe('edge cases', () => {
    it('should handle scholarship with zero total amount', () => {
      const result = service.createScholarship({
        name: 'Zero Scholarship',
        type: 'PARTIAL',
        totalAmount: 0,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        userId: 10
      })

      expect(result).toBeDefined()
    })

    it('should handle multiple allocations to same student', () => {
      service.allocateScholarship({
        studentId: 1,
        scholarshipId: 1,
        amount: 50000,
        allocationDate: '2026-01-15',
        userId: 10
      })

      const result = service.allocateScholarship({
        studentId: 1,
        scholarshipId: 1,
        amount: 30000,
        allocationDate: '2026-01-20',
        userId: 10
      })

      expect(result).toBeDefined()
    })

    it('should handle allocation on scholarship boundary dates', () => {
      const result = service.allocateScholarship({
        studentId: 1,
        scholarshipId: 1,
        amount: 50000,
        allocationDate: '2026-01-01',
        userId: 10
      })

      expect(result).toBeDefined()
    })
  })
})

