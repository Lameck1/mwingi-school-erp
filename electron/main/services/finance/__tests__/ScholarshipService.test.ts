import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
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
        max_beneficiaries INTEGER,
        eligibility_criteria TEXT,
        valid_from DATE,
        valid_to DATE,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
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
        allocation_date DATE NOT NULL,
        status TEXT DEFAULT 'ACTIVE',
        notes TEXT,
        FOREIGN KEY (student_id) REFERENCES student(id),
        FOREIGN KEY (scholarship_id) REFERENCES scholarship(id)
      );

      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        table_name TEXT NOT NULL,
        record_id INTEGER,
        old_values TEXT,
        new_values TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
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
    db.close()
  })

  describe('createScholarship', () => {
    it('should create new scholarship', () => {
      const result = service.createScholarship({
        name: 'Academic Excellence 2026',
        type: 'MERIT',
        totalAmount: 600000,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        eligibilityCriteria: 'GPA > 3.8',
        userId: 10
      })

      expect(result.success).toBe(true)
      expect(result.scholarshipId).toBeGreaterThan(0)

      const scholarship = db.prepare('SELECT * FROM scholarship WHERE id = ?').get(result.scholarshipId) as any
      expect(scholarship.name).toBe('Academic Excellence 2026')
      expect(scholarship.available_amount).toBe(600000)
      expect(scholarship.status).toBe('ACTIVE')
    })

    it('should validate positive amount', () => {
      const result = service.createScholarship({
        name: 'Test Scholarship',
        type: 'MERIT',
        totalAmount: -10000,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        userId: 10
      })

      expect(result.success).toBe(false)
      expect(result.message).toContain('positive')
    })

    it('should validate date range', () => {
      const result = service.createScholarship({
        name: 'Test Scholarship',
        type: 'MERIT',
        totalAmount: 100000,
        startDate: '2026-12-31',
        endDate: '2026-01-01', // End before start
        userId: 10
      })

      expect(result.success).toBe(false)
      expect(result.message).toContain('after start date')
    })

    it('should log audit trail', () => {
      service.createScholarship({
        name: 'Test Scholarship',
        type: 'MERIT',
        totalAmount: 100000,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        userId: 10
      })

      const auditLogs = db.prepare('SELECT * FROM audit_log WHERE action_type = ?').all('CREATE_SCHOLARSHIP') as any[]
      expect(auditLogs.length).toBeGreaterThan(0)
      expect(auditLogs[0].user_id).toBe(10)
    })
  })

  describe('allocateScholarship', () => {
    it('should allocate scholarship to student', () => {
      const result = service.allocateScholarship({
        studentId: 1,
        scholarshipId: 1,
        amount: 50000,
        allocationDate: '2026-01-15',
        notes: 'High academic performance',
        userId: 10
      })

      expect(result.success).toBe(true)
      expect(result.allocationId).toBeGreaterThan(0)

      // Verify allocation created
      const allocation = db.prepare('SELECT * FROM student_scholarship WHERE id = ?').get(result.allocationId) as any
      expect(allocation.amount_allocated).toBe(50000)
      expect(allocation.status).toBe('ACTIVE')
    })

    it('should update scholarship available amount', () => {
      service.allocateScholarship({
        studentId: 1,
        scholarshipId: 1,
        amount: 50000,
        allocationDate: '2026-01-15',
        userId: 10
      })

      const scholarship = db.prepare('SELECT * FROM scholarship WHERE id = ?').get(1) as any
      expect(scholarship.allocated_amount).toBe(50000)
      expect(scholarship.available_amount).toBe(450000) // 500000 - 50000
    })

    it('should prevent allocation exceeding available amount', () => {
      const result = service.allocateScholarship({
        studentId: 1,
        scholarshipId: 1,
        amount: 600000, // More than available
        allocationDate: '2026-01-15',
        userId: 10
      })

      expect(result.success).toBe(false)
      expect(result.message).toContain('insufficient funds')
    })

    it('should prevent allocation to expired scholarship', () => {
      const result = service.allocateScholarship({
        studentId: 1,
        scholarshipId: 4, // Expired scholarship
        amount: 10000,
        allocationDate: '2026-01-15',
        userId: 10
      })

      expect(result.success).toBe(false)
      expect(result.message).toContain('expired')
    })

    it('should prevent allocation to fully utilized scholarship', () => {
      const result = service.allocateScholarship({
        studentId: 1,
        scholarshipId: 3, // Sports Excellence - fully allocated
        amount: 10000,
        allocationDate: '2026-01-15',
        userId: 10
      })

      expect(result.success).toBe(false)
      expect(result.message).toContain('no funds available')
    })

    it('should validate positive allocation amount', () => {
      const result = service.allocateScholarship({
        studentId: 1,
        scholarshipId: 1,
        amount: -10000,
        allocationDate: '2026-01-15',
        userId: 10
      })

      expect(result.success).toBe(false)
      expect(result.message).toContain('positive')
    })

    it('should log audit trail', () => {
      service.allocateScholarship({
        studentId: 1,
        scholarshipId: 1,
        amount: 50000,
        allocationDate: '2026-01-15',
        userId: 10
      })

      const auditLogs = db.prepare('SELECT * FROM audit_log WHERE action_type = ?').all('ALLOCATE_SCHOLARSHIP') as any[]
      expect(auditLogs.length).toBeGreaterThan(0)
      expect(auditLogs[0].user_id).toBe(10)
    })
  })

  describe('getScholarshipUtilization', () => {
    beforeEach(() => {
      service.allocateScholarship({
        studentId: 1,
        scholarshipId: 1,
        amount: 100000,
        allocationDate: '2026-01-15',
        userId: 10
      })

      service.allocateScholarship({
        studentId: 2,
        scholarshipId: 1,
        amount: 150000,
        allocationDate: '2026-01-20',
        userId: 10
      })
    })

    it('should show scholarship utilization metrics', () => {
      const result = service.getScholarshipUtilization(1)

      expect(result).toHaveProperty('scholarship')
      expect(result).toHaveProperty('totalAmount')
      expect(result).toHaveProperty('allocatedAmount')
      expect(result).toHaveProperty('availableAmount')
      expect(result).toHaveProperty('utilizationPercentage')
      expect(result).toHaveProperty('allocations')
    })

    it('should calculate utilization percentage correctly', () => {
      const result = service.getScholarshipUtilization(1)

      // Allocated: 250000, Total: 500000
      // Utilization: (250000 / 500000) * 100 = 50%
      expect(result.utilizationPercentage).toBe(50)
    })

    it('should list all allocations', () => {
      const result = service.getScholarshipUtilization(1)

      expect(result.allocations).toHaveLength(2)
      expect(result.allocations[0]).toHaveProperty('student_name')
      expect(result.allocations[0]).toHaveProperty('amount_allocated')
    })

    it('should show 100% utilization for fully allocated scholarship', () => {
      const result = service.getScholarshipUtilization(3) // Sports Excellence - fully allocated

      expect(result.utilizationPercentage).toBe(100)
      expect(result.availableAmount).toBe(0)
    })

    it('should show 0% for unused scholarship', () => {
      // Create new scholarship
      const createResult = service.createScholarship({
        name: 'Unused Scholarship',
        type: 'MERIT',
        totalAmount: 100000,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        userId: 10
      })

      const result = service.getScholarshipUtilization(createResult.scholarshipId!)

      expect(result.utilizationPercentage).toBe(0)
      expect(result.allocatedAmount).toBe(0)
    })
  })

  describe('getStudentScholarships', () => {
    beforeEach(() => {
      service.allocateScholarship({
        studentId: 1,
        scholarshipId: 1,
        amount: 100000,
        allocationDate: '2026-01-15',
        userId: 10
      })

      service.allocateScholarship({
        studentId: 1,
        scholarshipId: 2,
        amount: 50000,
        allocationDate: '2026-01-20',
        userId: 10
      })
    })

    it('should return all scholarships for student', () => {
      const scholarships = service.getStudentScholarships(1)

      expect(scholarships).toHaveLength(2)
      scholarships.forEach(s => {
        expect(s).toHaveProperty('scholarship_name')
        expect(s).toHaveProperty('scholarship_type')
        expect(s).toHaveProperty('amount_allocated')
      })
    })

    it('should calculate total scholarship amount', () => {
      const scholarships = service.getStudentScholarships(1)

      const total = scholarships.reduce((sum, s) => sum + s.amount_allocated, 0)
      expect(total).toBe(150000) // 100000 + 50000
    })

    it('should filter by status', () => {
      // Revoke one scholarship
      db.exec(`UPDATE student_scholarship SET status = 'REVOKED' WHERE scholarship_id = 2`)

      const activeScholarships = service.getStudentScholarships(1, 'ACTIVE')
      expect(activeScholarships).toHaveLength(1)
    })

    it('should return empty array for student with no scholarships', () => {
      db.exec('INSERT INTO student (first_name, last_name, admission_number) VALUES ("New", "Student", "STU-003")')

      const scholarships = service.getStudentScholarships(3)
      expect(scholarships).toHaveLength(0)
    })
  })

  describe('validateScholarshipEligibility', () => {
    it('should validate active scholarship', () => {
      const result = service.validateScholarshipEligibility(1, 1)

      expect(result.isEligible).toBe(true)
      expect(result.reason).toBeNull()
    })

    it('should detect insufficient funds', () => {
      const result = service.validateScholarshipEligibility(1, 3) // Fully allocated

      expect(result.isEligible).toBe(false)
      expect(result.reason).toContain('no funds')
    })

    it('should detect expired scholarship', () => {
      const result = service.validateScholarshipEligibility(1, 4) // Expired

      expect(result.isEligible).toBe(false)
      expect(result.reason).toContain('expired')
    })

    it('should detect non-existent scholarship', () => {
      const result = service.validateScholarshipEligibility(1, 999)

      expect(result.isEligible).toBe(false)
      expect(result.reason).toContain('not found')
    })

    it('should detect non-existent student', () => {
      const result = service.validateScholarshipEligibility(999, 1)

      expect(result.isEligible).toBe(false)
      expect(result.reason).toContain('not found')
    })
  })

  describe('getAvailableScholarships', () => {
    it('should return active scholarships with funds', () => {
      const scholarships = service.getAvailableScholarships()

      expect(scholarships.length).toBeGreaterThan(0)
      scholarships.forEach(s => {
        expect(s.status).toBe('ACTIVE')
        expect(s.available_amount).toBeGreaterThan(0)
      })
    })

    it('should filter by scholarship type', () => {
      const meritScholarships = service.getAvailableScholarships('MERIT')

      meritScholarships.forEach(s => {
        expect(s.scholarship_type).toBe('MERIT')
      })
    })

    it('should exclude expired scholarships', () => {
      const scholarships = service.getAvailableScholarships()

      const expired = scholarships.find(s => s.status === 'EXPIRED')
      expect(expired).toBeUndefined()
    })

    it('should exclude fully utilized scholarships', () => {
      const scholarships = service.getAvailableScholarships()

      scholarships.forEach(s => {
        expect(s.available_amount).toBeGreaterThan(0)
      })
    })
  })

  describe('revokeScholarship', () => {
    let allocationId: number

    beforeEach(() => {
      const result = service.allocateScholarship({
        studentId: 1,
        scholarshipId: 1,
        amount: 50000,
        allocationDate: '2026-01-15',
        userId: 10
      })
      allocationId = result.allocationId!
    })

    it('should revoke scholarship allocation', () => {
      const result = service.revokeScholarship({
        allocationId,
        reason: 'Student withdrew',
        userId: 10
      })

      expect(result.success).toBe(true)

      const allocation = db.prepare('SELECT * FROM student_scholarship WHERE id = ?').get(allocationId) as any
      expect(allocation.status).toBe('REVOKED')
    })

    it('should restore scholarship available amount', () => {
      service.revokeScholarship({
        allocationId,
        reason: 'Student withdrew',
        userId: 10
      })

      const scholarship = db.prepare('SELECT * FROM scholarship WHERE id = ?').get(1) as any
      expect(scholarship.allocated_amount).toBe(0) // Back to 0
      expect(scholarship.available_amount).toBe(500000) // Restored
    })

    it('should require revocation reason', () => {
      const result = service.revokeScholarship({
        allocationId,
        reason: '',
        userId: 10
      })

      expect(result.success).toBe(false)
      expect(result.message).toContain('reason')
    })

    it('should prevent revoking already revoked allocation', () => {
      service.revokeScholarship({
        allocationId,
        reason: 'First revocation',
        userId: 10
      })

      const result = service.revokeScholarship({
        allocationId,
        reason: 'Second revocation',
        userId: 10
      })

      expect(result.success).toBe(false)
      expect(result.message).toContain('already revoked')
    })

    it('should log audit trail', () => {
      service.revokeScholarship({
        allocationId,
        reason: 'Test revocation',
        userId: 10
      })

      const auditLogs = db.prepare('SELECT * FROM audit_log WHERE action_type = ?').all('REVOKE_SCHOLARSHIP') as any[]
      expect(auditLogs.length).toBeGreaterThan(0)
      expect(auditLogs[0].user_id).toBe(10)
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

      expect(result.success).toBe(false)
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

      expect(result.success).toBe(true) // Should be allowed
    })

    it('should handle allocation on scholarship boundary dates', () => {
      const result = service.allocateScholarship({
        studentId: 1,
        scholarshipId: 1,
        amount: 50000,
        allocationDate: '2026-01-01', // Start date
        userId: 10
      })

      expect(result.success).toBe(true)
    })
  })
})
