import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

// ============================================================================
// SEGREGATED INTERFACES (ISP)
// ============================================================================

export interface IScholarshipCreator {
  createScholarship(data: ScholarshipData, userId: number): Promise<ScholarshipResult>
}

export interface IScholarshipAllocator {
  allocateScholarshipToStudent(allocationData: AllocationData, userId: number): Promise<AllocationResult>
}

export interface IScholarshipValidator {
  validateScholarshipEligibility(studentId: number, scholarshipId: number): Promise<EligibilityResult>
}

export interface IScholarshipQueryService {
  getActiveScholarships(): Promise<Scholarship[]>
  getStudentScholarships(studentId: number): Promise<StudentScholarship[]>
  getScholarshipAllocations(scholarshipId: number): Promise<StudentScholarship[]>
}

export interface ScholarshipData {
  name: string
  description: string
  scholarship_type: 'MERIT' | 'NEED_BASED' | 'SPORTS' | 'PARTIAL' | 'FULL'
  amount: number
  percentage?: number
  max_beneficiaries: number
  eligibility_criteria: string
  valid_from: string
  valid_to: string
  sponsor_name?: string
  sponsor_contact?: string
}

export interface AllocationData {
  scholarship_id: number
  student_id: number
  amount_allocated: number
  allocation_notes: string
  effective_date: string
}

export interface Scholarship {
  id: number
  name: string
  description: string
  scholarship_type: string
  amount: number
  percentage: number | null
  current_beneficiaries: number
  max_beneficiaries: number
  total_allocated: number
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED'
  valid_from: string
  valid_to: string
  sponsor_name: string | null
}

export interface StudentScholarship {
  id: number
  scholarship_id: number
  scholarship_name: string
  student_id: number
  student_name: string
  amount_allocated: number
  amount_utilized: number
  balance: number
  status: 'ACTIVE' | 'FULLY_UTILIZED' | 'EXPIRED' | 'REVOKED'
  effective_date: string
  expiry_date: string
}

export interface ScholarshipResult {
  success: boolean
  message: string
  scholarship_id?: number
}

export interface AllocationResult {
  success: boolean
  message: string
  allocation_id?: number
}

export interface EligibilityResult {
  eligible: boolean
  message: string
  reasons?: string[]
}

// ============================================================================
// REPOSITORY LAYER (SRP)
// ============================================================================

class ScholarshipRepository {
  async createScholarship(data: ScholarshipData): Promise<number> {
    const db = getDatabase()
    const result = db.prepare(`
      INSERT INTO scholarship (
        name, description, scholarship_type, amount, percentage,
        max_beneficiaries, eligibility_criteria, valid_from, valid_to,
        sponsor_name, sponsor_contact, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
    `).run(
      data.name,
      data.description,
      data.scholarship_type,
      data.amount,
      data.percentage || null,
      data.max_beneficiaries,
      data.eligibility_criteria,
      data.valid_from,
      data.valid_to,
      data.sponsor_name || null,
      data.sponsor_contact || null
    )

    return result.lastInsertRowid as number
  }

  async getScholarship(id: number): Promise<Scholarship | null> {
    const db = getDatabase()
    return db.prepare(`
      SELECT * FROM scholarship WHERE id = ?
    `).get(id) as Scholarship | null
  }

  async getActiveScholarships(): Promise<Scholarship[]> {
    const db = getDatabase()
    return db.prepare(`
      SELECT * FROM scholarship
      WHERE status = 'ACTIVE'
      AND date('now') BETWEEN valid_from AND valid_to
      ORDER BY name
    `).all() as Scholarship[]
  }
}

class ScholarshipAllocationRepository {
  async allocateScholarship(data: AllocationData): Promise<number> {
    const db = getDatabase()
    
    // Get scholarship details for expiry date
    const scholarship = db.prepare(`
      SELECT valid_to FROM scholarship WHERE id = ?
    `).get(data.scholarship_id) as any

    const result = db.prepare(`
      INSERT INTO student_scholarship (
        scholarship_id, student_id, amount_allocated, amount_utilized,
        allocation_notes, effective_date, expiry_date, status
      ) VALUES (?, ?, ?, 0, ?, ?, ?, 'ACTIVE')
    `).run(
      data.scholarship_id,
      data.student_id,
      data.amount_allocated,
      data.allocation_notes,
      data.effective_date,
      scholarship?.valid_to || data.effective_date
    )

    // Update scholarship totals
    db.prepare(`
      UPDATE scholarship
      SET current_beneficiaries = current_beneficiaries + 1,
          total_allocated = total_allocated + ?
      WHERE id = ?
    `).run(data.amount_allocated, data.scholarship_id)

    return result.lastInsertRowid as number
  }

  async getStudentScholarships(studentId: number): Promise<StudentScholarship[]> {
    const db = getDatabase()
    return db.prepare(`
      SELECT 
        ss.*,
        s.name as scholarship_name,
        st.full_name as student_name,
        (ss.amount_allocated - ss.amount_utilized) as balance
      FROM student_scholarship ss
      LEFT JOIN scholarship s ON ss.scholarship_id = s.id
      LEFT JOIN student st ON ss.student_id = st.id
      WHERE ss.student_id = ?
      ORDER BY ss.effective_date DESC
    `).all(studentId) as StudentScholarship[]
  }

  async getScholarshipAllocations(scholarshipId: number): Promise<StudentScholarship[]> {
    const db = getDatabase()
    return db.prepare(`
      SELECT 
        ss.*,
        s.name as scholarship_name,
        st.full_name as student_name,
        (ss.amount_allocated - ss.amount_utilized) as balance
      FROM student_scholarship ss
      LEFT JOIN scholarship s ON ss.scholarship_id = s.id
      LEFT JOIN student st ON ss.student_id = st.id
      WHERE ss.scholarship_id = ?
      ORDER BY ss.effective_date DESC
    `).all(scholarshipId) as StudentScholarship[]
  }

  async checkExistingAllocation(studentId: number, scholarshipId: number): Promise<boolean> {
    const db = getDatabase()
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM student_scholarship
      WHERE student_id = ? AND scholarship_id = ? AND status = 'ACTIVE'
    `).get(studentId, scholarshipId) as any

    return (result?.count || 0) > 0
  }
}

// ============================================================================
// BUSINESS LOGIC LAYER (SRP)
// ============================================================================

class ScholarshipCreator implements IScholarshipCreator {
  constructor(private scholarshipRepo: ScholarshipRepository) {}

  async createScholarship(data: ScholarshipData, userId: number): Promise<ScholarshipResult> {
    try {
      // Validate dates
      const validFrom = new Date(data.valid_from)
      const validTo = new Date(data.valid_to)

      if (validTo <= validFrom) {
        return {
          success: false,
          message: 'Valid to date must be after valid from date'
        }
      }

      // Create scholarship
      const scholarshipId = await this.scholarshipRepo.createScholarship(data)

      logAudit(
        userId,
        'CREATE',
        'scholarship',
        scholarshipId,
        null,
        { name: data.name, type: data.scholarship_type, amount: data.amount }
      )

      return {
        success: true,
        message: `Scholarship "${data.name}" created successfully`,
        scholarship_id: scholarshipId
      }

    } catch (error) {
      throw new Error(`Failed to create scholarship: ${(error as Error).message}`)
    }
  }
}

class ScholarshipAllocator implements IScholarshipAllocator {
  constructor(
    private allocationRepo: ScholarshipAllocationRepository,
    private scholarshipRepo: ScholarshipRepository
  ) {}

  async allocateScholarshipToStudent(allocationData: AllocationData, userId: number): Promise<AllocationResult> {
    const db = getDatabase()

    try {
      // Check if scholarship exists and is active
      const scholarship = await this.scholarshipRepo.getScholarship(allocationData.scholarship_id)

      if (!scholarship) {
        return {
          success: false,
          message: 'Scholarship not found'
        }
      }

      if (scholarship.status !== 'ACTIVE') {
        return {
          success: false,
          message: `Scholarship is ${scholarship.status.toLowerCase()}, cannot allocate`
        }
      }

      // Check if max beneficiaries reached
      if (scholarship.current_beneficiaries >= scholarship.max_beneficiaries) {
        return {
          success: false,
          message: 'Maximum number of beneficiaries reached for this scholarship'
        }
      }

      // Check for existing allocation
      const hasExisting = await this.allocationRepo.checkExistingAllocation(
        allocationData.student_id,
        allocationData.scholarship_id
      )

      if (hasExisting) {
        return {
          success: false,
          message: 'Student already has an active allocation for this scholarship'
        }
      }

      // Allocate scholarship
      const allocationId = await this.allocationRepo.allocateScholarship(allocationData)

      logAudit(
        userId,
        'ALLOCATE',
        'student_scholarship',
        allocationId,
        null,
        {
          scholarship_id: allocationData.scholarship_id,
          student_id: allocationData.student_id,
          amount: allocationData.amount_allocated
        }
      )

      return {
        success: true,
        message: `Scholarship allocated successfully: ${allocationData.amount_allocated.toFixed(2)} KES`,
        allocation_id: allocationId
      }

    } catch (error) {
      throw new Error(`Failed to allocate scholarship: ${(error as Error).message}`)
    }
  }
}

class ScholarshipValidator implements IScholarshipValidator {
  constructor(private allocationRepo: ScholarshipAllocationRepository) {}

  async validateScholarshipEligibility(studentId: number, scholarshipId: number): Promise<EligibilityResult> {
    // Check existing allocations
    const hasExisting = await this.allocationRepo.checkExistingAllocation(studentId, scholarshipId)

    if (hasExisting) {
      return {
        eligible: false,
        message: 'Student already has this scholarship',
        reasons: ['Duplicate allocation not allowed']
      }
    }

    // Add more eligibility checks here (e.g., academic performance, financial need)

    return {
      eligible: true,
      message: 'Student is eligible for this scholarship'
    }
  }
}

class ScholarshipQueryService implements IScholarshipQueryService {
  constructor(
    private scholarshipRepo: ScholarshipRepository,
    private allocationRepo: ScholarshipAllocationRepository
  ) {}

  async getActiveScholarships(): Promise<Scholarship[]> {
    return this.scholarshipRepo.getActiveScholarships()
  }

  async getStudentScholarships(studentId: number): Promise<StudentScholarship[]> {
    return this.allocationRepo.getStudentScholarships(studentId)
  }

  async getScholarshipAllocations(scholarshipId: number): Promise<StudentScholarship[]> {
    return this.allocationRepo.getScholarshipAllocations(scholarshipId)
  }
}

// ============================================================================
// FACADE SERVICE (Composition, DIP)
// ============================================================================

export class ScholarshipService 
  implements IScholarshipCreator, IScholarshipAllocator, IScholarshipValidator, IScholarshipQueryService {
  
  private readonly creator: ScholarshipCreator
  private readonly allocator: ScholarshipAllocator
  private readonly validator: ScholarshipValidator
  private readonly queryService: ScholarshipQueryService

  constructor() {
    const scholarshipRepo = new ScholarshipRepository()
    const allocationRepo = new ScholarshipAllocationRepository()

    this.creator = new ScholarshipCreator(scholarshipRepo)
    this.allocator = new ScholarshipAllocator(allocationRepo, scholarshipRepo)
    this.validator = new ScholarshipValidator(allocationRepo)
    this.queryService = new ScholarshipQueryService(scholarshipRepo, allocationRepo)
  }

  /**
   * Create new scholarship program
   */
  async createScholarship(data: ScholarshipData, userId: number): Promise<ScholarshipResult> {
    return this.creator.createScholarship(data, userId)
  }

  /**
   * Allocate scholarship to student
   */
  async allocateScholarshipToStudent(allocationData: AllocationData, userId: number): Promise<AllocationResult> {
    return this.allocator.allocateScholarshipToStudent(allocationData, userId)
  }

  /**
   * Check if student is eligible for scholarship
   */
  async validateScholarshipEligibility(studentId: number, scholarshipId: number): Promise<EligibilityResult> {
    return this.validator.validateScholarshipEligibility(studentId, scholarshipId)
  }

  /**
   * Get all active scholarships
   */
  async getActiveScholarships(): Promise<Scholarship[]> {
    return this.queryService.getActiveScholarships()
  }

  /**
   * Get student's scholarship allocations
   */
  async getStudentScholarships(studentId: number): Promise<StudentScholarship[]> {
    return this.queryService.getStudentScholarships(studentId)
  }

  /**
   * Get all allocations for a scholarship
   */
  async getScholarshipAllocations(scholarshipId: number): Promise<StudentScholarship[]> {
    return this.queryService.getScholarshipAllocations(scholarshipId)
  }

  /**
   * Apply scholarship to invoice (reduce invoice amount)
   */
  async applyScholarshipToInvoice(
    studentScholarshipId: number,
    invoiceId: number,
    amountToApply: number,
    userId: number
  ): Promise<{ success: boolean; message: string }> {
    const db = getDatabase()

    try {
      const transaction = db.transaction(() => {
        // Get student scholarship
        const allocation = db.prepare(`
          SELECT * FROM student_scholarship WHERE id = ?
        `).get(studentScholarshipId) as any

        if (!allocation) {
          throw new Error('Scholarship allocation not found')
        }

        const balance = allocation.amount_allocated - allocation.amount_utilized

        if (balance < amountToApply) {
          throw new Error(`Insufficient scholarship balance: ${balance.toFixed(2)} KES available`)
        }

        // Update scholarship utilization
        db.prepare(`
          UPDATE student_scholarship
          SET amount_utilized = amount_utilized + ?
          WHERE id = ?
        `).run(amountToApply, studentScholarshipId)

        // Update invoice
        db.prepare(`
          UPDATE fee_invoice
          SET amount = amount - ?,
              updated_at = ?
          WHERE id = ?
        `).run(amountToApply, new Date().toISOString(), invoiceId)

        logAudit(
          userId,
          'APPLY_SCHOLARSHIP',
          'fee_invoice',
          invoiceId,
          null,
          { scholarship_id: studentScholarshipId, amount_applied: amountToApply }
        )
      })

      transaction()

      return {
        success: true,
        message: `Scholarship of ${amountToApply.toFixed(2)} KES applied to invoice`
      }

    } catch (error) {
      throw new Error(`Failed to apply scholarship: ${(error as Error).message}`)
    }
  }
}
