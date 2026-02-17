
import { extractLegacyUserId, normalizeAllocationData, normalizeScholarshipData } from './scholarship-normalization'
import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'
import { DoubleEntryJournalService } from '../accounting/DoubleEntryJournalService'
import { SystemAccounts } from '../accounting/SystemAccounts'

import type { LegacyAllocationData, LegacyScholarshipData } from './scholarship-normalization'
import type Database from 'better-sqlite3'

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
  allocated_amount: number
  available_amount: number
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
  private readonly db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  async createScholarship(data: ScholarshipData): Promise<number> {
    const db = this.db
    const result = db.prepare(`
      INSERT INTO scholarship (
        name, description, scholarship_type, amount, percentage,
        total_amount, allocated_amount, available_amount,
        max_beneficiaries, eligibility_criteria, valid_from, valid_to,
        sponsor_name, sponsor_contact, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
    `).run(
      data.name,
      data.description,
      data.scholarship_type,
      data.amount,
      data.percentage || null,
      data.amount,
      0,
      data.amount,
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
    const db = this.db
    return db.prepare(`
      SELECT * FROM scholarship WHERE id = ?
    `).get(id) as Scholarship | null
  }

  async getActiveScholarships(): Promise<Scholarship[]> {
    const db = this.db
    return db.prepare(`
      SELECT * FROM scholarship
      WHERE status = 'ACTIVE'
      AND date('now') BETWEEN valid_from AND valid_to
      ORDER BY name
    `).all() as Scholarship[]
  }
}

class ScholarshipAllocationRepository {
  private readonly db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  async allocateScholarship(data: AllocationData): Promise<number> {
    const db = this.db

    // Get scholarship details for expiry date
    const scholarship = db.prepare(`
      SELECT valid_to FROM scholarship WHERE id = ?
    `).get(data.scholarship_id) as { valid_to: string } | undefined

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
          total_allocated = total_allocated + ?,
          allocated_amount = allocated_amount + ?,
          available_amount = available_amount - ?
      WHERE id = ?
    `).run(data.amount_allocated, data.amount_allocated, data.amount_allocated, data.scholarship_id)

    return result.lastInsertRowid as number
  }

  async getStudentScholarships(studentId: number): Promise<StudentScholarship[]> {
    const db = this.db
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
    const db = this.db
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
    const db = this.db
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM student_scholarship
      WHERE student_id = ? AND scholarship_id = ? AND status = 'ACTIVE'
    `).get(studentId, scholarshipId) as { count: number } | undefined

    return (result?.count || 0) > 0
  }
}

// ============================================================================
// BUSINESS LOGIC LAYER (SRP)
// ============================================================================

class ScholarshipCreator implements IScholarshipCreator {
  constructor(private readonly scholarshipRepo: ScholarshipRepository) { }

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
    private readonly allocationRepo: ScholarshipAllocationRepository,
    private readonly scholarshipRepo: ScholarshipRepository
  ) { }

  async allocateScholarshipToStudent(allocationData: AllocationData, userId: number): Promise<AllocationResult> {
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

      // Guard: check available_amount
      if (scholarship.available_amount < allocationData.amount_allocated) {
        return {
          success: false,
          message: `Insufficient scholarship funds. Available: ${scholarship.available_amount}, Requested: ${allocationData.amount_allocated}`
        }
      }

      // Allocate scholarship
      const allocationId = await this.allocationRepo.allocateScholarship(allocationData)

      // Create credit_transaction for the student
      const db = getDatabase()
      db.prepare(`
        INSERT INTO credit_transaction (student_id, amount, transaction_type, notes, created_at)
        VALUES (?, ?, 'CREDIT_RECEIVED', ?, CURRENT_TIMESTAMP)
      `).run(
        allocationData.student_id,
        allocationData.amount_allocated,
        `Scholarship: ${scholarship.name} (allocation #${allocationId})`
      )

      // Update student credit_balance
      db.prepare(`
        UPDATE student SET credit_balance = COALESCE(credit_balance, 0) + ? WHERE id = ?
      `).run(allocationData.amount_allocated, allocationData.student_id)

      // GL journal entry: Debit Scholarship Expense, Credit Student Receivable
      const journalService = new DoubleEntryJournalService(db)
      journalService.createJournalEntrySync({
        entry_date: allocationData.effective_date || (new Date().toISOString().split('T')[0] ?? ''),
        entry_type: 'SCHOLARSHIP',
        description: `Scholarship allocation: ${scholarship.name} to student #${allocationData.student_id}`,
        created_by_user_id: userId,
        lines: [
          {
            gl_account_code: '5400',
            debit_amount: allocationData.amount_allocated,
            credit_amount: 0,
            description: 'Scholarship expense'
          },
          {
            gl_account_code: '1300',
            debit_amount: 0,
            credit_amount: allocationData.amount_allocated,
            description: 'Student accounts receivable reduction'
          }
        ]
      })

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
  constructor(private readonly allocationRepo: ScholarshipAllocationRepository) { }

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
    private readonly scholarshipRepo: ScholarshipRepository,
    private readonly allocationRepo: ScholarshipAllocationRepository
  ) { }

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


  private readonly db: Database.Database
  private readonly creator: ScholarshipCreator
  private readonly allocator: ScholarshipAllocator
  private readonly validator: ScholarshipValidator
  private readonly queryService: ScholarshipQueryService
  private readonly journalService: DoubleEntryJournalService

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    const scholarshipRepo = new ScholarshipRepository(this.db)
    const allocationRepo = new ScholarshipAllocationRepository(this.db)

    this.creator = new ScholarshipCreator(scholarshipRepo)
    this.allocator = new ScholarshipAllocator(allocationRepo, scholarshipRepo)
    this.validator = new ScholarshipValidator(allocationRepo)
    this.queryService = new ScholarshipQueryService(scholarshipRepo, allocationRepo)
    this.journalService = new DoubleEntryJournalService(this.db)
  }

  /**
   * Create new scholarship program
   */
  async createScholarship(data: ScholarshipData | LegacyScholarshipData, userId?: number): Promise<ScholarshipResult> {
    const normalized = normalizeScholarshipData(data)
    const resolvedUserId = userId ?? extractLegacyUserId(data)
    if (resolvedUserId === undefined) {
      return {
        success: false,
        message: 'User ID is required to create scholarship'
      }
    }

    return this.creator.createScholarship(normalized, resolvedUserId)
  }

  /**
   * Allocate scholarship to student
   */
  async allocateScholarshipToStudent(allocationData: AllocationData | LegacyAllocationData, userId?: number): Promise<AllocationResult> {
    const normalized = normalizeAllocationData(allocationData)
    const resolvedUserId = userId ?? extractLegacyUserId(allocationData)

    if (resolvedUserId === undefined) {
      return {
        success: false,
        message: 'User ID is required to allocate scholarship'
      }
    }

    return this.allocator.allocateScholarshipToStudent(normalized, resolvedUserId)
  }

  // Legacy alias used by older tests
  async allocateScholarship(allocationData: AllocationData | LegacyAllocationData): Promise<AllocationResult & { allocationId?: number }> {
    const result = await this.allocateScholarshipToStudent(allocationData)
    return {
      ...result,
      allocationId: result.allocation_id
    }
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

  async getScholarshipUtilization(scholarshipId: number): Promise<{
    scholarship: Scholarship | null
    allocations: StudentScholarship[]
    utilization_percentage: number
  }> {
    const allocations = await this.queryService.getScholarshipAllocations(scholarshipId)
    const scholarship = this.db
      .prepare('SELECT * FROM scholarship WHERE id = ?')
      .get(scholarshipId) as Scholarship | undefined
    const totalAmount = scholarship?.amount || 0
    const allocated = scholarship?.total_allocated || 0
    const utilization = totalAmount > 0 ? (allocated / totalAmount) * 100 : 0

    return {
      scholarship: scholarship || null,
      allocations,
      utilization_percentage: utilization
    }
  }

  async getAvailableScholarships(type?: ScholarshipData['scholarship_type']): Promise<Scholarship[]> {
    const baseQuery = `
      SELECT * FROM scholarship
      WHERE status = 'ACTIVE'
        AND (available_amount IS NULL OR available_amount > 0)
    `

    if (type) {
      return this.db.prepare(`${baseQuery} AND scholarship_type = ?`).all(type) as Scholarship[]
    }

    return this.db.prepare(baseQuery).all() as Scholarship[]
  }

  async revokeScholarship(params: { allocationId?: number; allocation_id?: number; reason?: string; userId?: number; user_id?: number }): Promise<{
    success: boolean
    error?: string
    message?: string
  }> {
    const allocationId = params.allocationId ?? params.allocation_id
    const reason = params.reason || ''

    if (!allocationId) {
      return { success: false, error: 'Allocation ID is required' }
    }

    if (!reason) {
      return { success: false, error: 'Revocation reason is required' }
    }

    const allocation = this.db
      .prepare('SELECT * FROM student_scholarship WHERE id = ?')
      .get(allocationId) as StudentScholarship | undefined

    if (!allocation) {
      return { success: false, error: 'Allocation not found' }
    }

    if (allocation.status === 'REVOKED') {
      return { success: false, error: 'Allocation already revoked' }
    }

    this.db
      .prepare(`UPDATE student_scholarship SET status = 'REVOKED', notes = ? WHERE id = ?`)
      .run(reason, allocationId)

    this.db
      .prepare(`
        UPDATE scholarship
        SET allocated_amount = allocated_amount - ?,
            available_amount = available_amount + ?
        WHERE id = ?
      `)
      .run(allocation.amount_allocated, allocation.amount_allocated, allocation.scholarship_id)

    return { success: true, message: 'Scholarship allocation revoked' }
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
    const db = this.db

    try {
      const transaction = db.transaction(() => {
        // Get student scholarship
        const allocation = db.prepare(`
          SELECT * FROM student_scholarship WHERE id = ?
        `).get(studentScholarshipId) as StudentScholarship | undefined

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

        // Create Journal Entry for Scholarship Application
        // Debit: Scholarship Expense (Contra-Revenue)
        // Credit: Accounts Receivable (Reducing what student owes)
        this.journalService.createJournalEntrySync({
          entry_date: new Date().toISOString(),
          entry_type: 'SCHOLARSHIP_APPLICATION',
          description: `Scholarship applied to invoice #${invoiceId}`,
          student_id: allocation.student_id,
          created_by_user_id: userId,
          lines: [
            {
              gl_account_code: SystemAccounts.SCHOLARSHIP_EXPENSE,
              debit_amount: amountToApply,
              credit_amount: 0,
              description: `Scholarship Expense - Allocation #${studentScholarshipId}`
            },
            {
              gl_account_code: SystemAccounts.ACCOUNTS_RECEIVABLE,
              debit_amount: 0,
              credit_amount: amountToApply,
              description: `Scholarship Credit Applied to Invoice #${invoiceId}`
            }
          ]
        })
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

