
import { randomUUID } from 'node:crypto'

import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

import type {
  GenerateProRatedInvoiceInput,
  InvoiceGenerationResult,
  InvoiceTemplate,
  IProRateCalculator,
  IProRatedInvoiceGenerator,
  ITermDateValidator,
  ProRationLogEntry,
  ProRationResult,
  ProrationDetail,
  ValidationResult
} from './FeeProrationService.types'
import type Database from 'better-sqlite3'

export type {
  GenerateProRatedInvoiceInput,
  InvoiceGenerationResult,
  InvoiceTemplate,
  IProRateCalculator,
  IProRatedInvoiceGenerator,
  ITermDateValidator,
  ProRationLogEntry,
  ProRationResult,
  ProrationDetail,
  ValidationResult
} from './FeeProrationService.types'

// ============================================================================
// REPOSITORY LAYER (SRP)
// ============================================================================

class InvoiceTemplateRepository {
  private readonly db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  async getInvoiceTemplate(templateId: number): Promise<InvoiceTemplate | undefined> {
    const db = this.db
    return db.prepare(`
      SELECT * FROM fee_invoice WHERE id = ?
    `).get(templateId) as InvoiceTemplate | undefined
  }

  async getTermDates(termId: number): Promise<{ term_start: string; term_end: string } | null> {
    const db = this.db
    const result = db.prepare(`
      SELECT start_date, end_date FROM academic_term WHERE id = ?
    `).get(termId) as { start_date: string; end_date: string } | undefined

    if (!result) { return null }

    return {
      term_start: result.start_date,
      term_end: result.end_date
    }
  }
}

class ProRatedInvoiceRepository {
  private readonly db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  async createProRatedInvoice(data: {
    student_id: number
    amount: number
    original_amount?: number
    due_date: string
    invoice_date: string
    description: string
    invoice_type: string
    term_id: number
    academic_term_id?: number
    class_id: number
    created_by_user_id: number
  }): Promise<number> {
    const db = this.db
    const invoiceNumber = `INV-${Date.now()}`
    const academicTermId = data.academic_term_id ?? data.term_id
    const originalAmount = data.original_amount ?? data.amount

    const result = db.prepare(`
      INSERT INTO fee_invoice (
        student_id, term_id, academic_term_id, invoice_date, due_date,
        total_amount, amount, amount_due, original_amount, amount_paid,
        invoice_number, description, invoice_type, class_id, status, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'PENDING', ?)
    `).run(
      data.student_id,
      data.term_id,
      academicTermId,
      data.invoice_date,
      data.due_date,
      data.amount,
      data.amount,
      data.amount,
      originalAmount,
      invoiceNumber,
      data.description,
      data.invoice_type,
      data.class_id,
      data.created_by_user_id
    )

    return result.lastInsertRowid as number
  }

  async recordProRationLog(data: {
    invoice_id: number
    student_id: number
    full_amount: number
    pro_rated_amount: number
    discount_percentage: number
    enrollment_date: string
    term_start: string
    term_end: string
    days_in_term: number
    days_enrolled: number
  }): Promise<void> {
    const db = this.db
    db.prepare(`
      INSERT INTO pro_ration_log (
        invoice_id, student_id, full_amount, pro_rated_amount,
        discount_percentage, enrollment_date, term_start, term_end,
        days_in_term, days_enrolled
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.invoice_id,
      data.student_id,
      data.full_amount,
      data.pro_rated_amount,
      data.discount_percentage,
      data.enrollment_date,
      data.term_start,
      data.term_end,
      data.days_in_term,
      data.days_enrolled
    )
  }
}

// ============================================================================
// BUSINESS LOGIC LAYER (SRP)
// ============================================================================

class ProRateCalculator implements IProRateCalculator {
  calculateProRatedFee(
    fullAmount: number,
    termStartDate: string,
    termEndDate: string,
    enrollmentDate: string
  ): ProRationResult {
    const termStart = new Date(termStartDate)
    const termEnd = new Date(termEndDate)
    const enrollment = new Date(enrollmentDate)

    // Calculate days (Inclusive of start and end dates)
    const daysInTerm = Math.ceil((termEnd.getTime() - termStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
    const daysEnrolled = Math.ceil((termEnd.getTime() - enrollment.getTime()) / (1000 * 60 * 60 * 24)) + 1

    // Calculate pro-rated amount
    const discountPercentage = ((daysInTerm - daysEnrolled) / daysInTerm) * 100
    const proRatedAmount = fullAmount * (daysEnrolled / daysInTerm)

    return {
      full_amount: fullAmount,
      pro_rated_amount: Math.round(proRatedAmount), // Round to integer cents
      discount_percentage: Math.round(discountPercentage * 100) / 100,
      days_in_term: daysInTerm,
      days_enrolled: daysEnrolled,
      enrollment_date: enrollmentDate,
      calculation_method: 'DAILY'
    }
  }
}

class TermDateValidator implements ITermDateValidator {
  validateEnrollmentDate(
    termStartDate: string,
    termEndDate: string,
    enrollmentDate: string
  ): ValidationResult {
    const termStart = new Date(termStartDate)
    const termEnd = new Date(termEndDate)
    const enrollment = new Date(enrollmentDate)

    // Check if enrollment date is within term
    if (enrollment < termStart) {
      return {
        valid: false,
        message: 'Enrollment date cannot be before term start date'
      }
    }

    if (enrollment > termEnd) {
      return {
        valid: false,
        message: 'Enrollment date cannot be after term end date'
      }
    }

    // Check if enrollment is on term start (no proration needed)
    if (enrollment.getTime() === termStart.getTime()) {
      return {
        valid: false,
        message: 'Enrollment is on term start date - full fee applies, no proration needed'
      }
    }

    return {
      valid: true,
      message: 'Enrollment date is valid for proration'
    }
  }
}

class ProRatedInvoiceGenerator implements IProRatedInvoiceGenerator {
  constructor(
    private readonly templateRepo: InvoiceTemplateRepository,
    private readonly invoiceRepo: ProRatedInvoiceRepository,
    private readonly calculator: ProRateCalculator,
    private readonly validator: TermDateValidator
  ) {}

  private async loadTemplateAndTermDates(
    templateInvoiceId: number
  ): Promise<{ template: InvoiceTemplate; termDates: { term_start: string; term_end: string } } | InvoiceGenerationResult> {
    const template = await this.templateRepo.getInvoiceTemplate(templateInvoiceId)
    if (!template) {
      return {
        success: false,
        message: 'Template invoice not found'
      }
    }

    const termDates = await this.templateRepo.getTermDates(template.term_id)
    if (!termDates) {
      return {
        success: false,
        message: 'Term dates not found'
      }
    }

    return { template, termDates }
  }

  private validateProrationDates(
    termDates: { term_start: string; term_end: string },
    enrollmentDate: string
  ): ValidationResult {
    return this.validator.validateEnrollmentDate(termDates.term_start, termDates.term_end, enrollmentDate)
  }

  private async createInvoiceAndAudit(args: {
    studentId: number
    userId: number
    enrollmentDate: string
    template: InvoiceTemplate
    termDates: { term_start: string; term_end: string }
    proRation: ProRationResult
  }): Promise<number> {
    const { studentId, userId, enrollmentDate, template, termDates, proRation } = args

    const invoiceId = await this.invoiceRepo.createProRatedInvoice({
      student_id: studentId,
      amount: proRation.pro_rated_amount,
      original_amount: proRation.full_amount,
      due_date: template.due_date,
      invoice_date: new Date().toISOString().split('T')[0],
      description: `${template.description} (Pro-rated: ${proRation.discount_percentage.toFixed(1)}% discount)`,
      invoice_type: template.invoice_type,
      term_id: template.term_id,
      academic_term_id: template.term_id,
      class_id: template.class_id,
      created_by_user_id: userId
    })

    await this.invoiceRepo.recordProRationLog({
      invoice_id: invoiceId,
      student_id: studentId,
      full_amount: proRation.full_amount,
      pro_rated_amount: proRation.pro_rated_amount,
      discount_percentage: proRation.discount_percentage,
      enrollment_date: enrollmentDate,
      term_start: termDates.term_start,
      term_end: termDates.term_end,
      days_in_term: proRation.days_in_term,
      days_enrolled: proRation.days_enrolled
    })

    logAudit(userId, 'CREATE_PRORATED_INVOICE', 'fee_invoice', invoiceId, null, {
      student_id: studentId,
      full_amount: proRation.full_amount,
      pro_rated_amount: proRation.pro_rated_amount,
      discount_percentage: proRation.discount_percentage
    })

    return invoiceId
  }

  private buildSuccess(invoiceId: number, proRation: ProRationResult): InvoiceGenerationResult {
    return {
      success: true,
      message: `Pro-rated invoice created: ${(proRation.pro_rated_amount / 100).toFixed(2)} KES (${proRation.discount_percentage.toFixed(1)}% discount)`,
      invoice_id: invoiceId,
      pro_ration_details: proRation
    }
  }

  async generateProRatedInvoice(
    studentId: number,
    templateInvoiceId: number,
    enrollmentDate: string,
    userId: number
  ): Promise<InvoiceGenerationResult> {
    try {
      const loaded = await this.loadTemplateAndTermDates(templateInvoiceId)
      if (!('template' in loaded)) {
        return loaded
      }

      const { template, termDates } = loaded
      const validation = this.validateProrationDates(termDates, enrollmentDate)
      if (!validation.valid) {
        return {
          success: false,
          message: validation.message
        }
      }

      const proRation = this.calculator.calculateProRatedFee(
        template.amount,
        termDates.term_start,
        termDates.term_end,
        enrollmentDate
      )

      const invoiceId = await this.createInvoiceAndAudit({
        studentId,
        userId,
        enrollmentDate,
        template,
        termDates,
        proRation
      })

      return this.buildSuccess(invoiceId, proRation)
    } catch (error) {
      throw new Error(`Failed to generate pro-rated invoice: ${(error as Error).message}`)
    }
  }
}
// ============================================================================
// FACADE SERVICE (Composition, DIP)
// ============================================================================

export class FeeProrationService implements IProRateCalculator, ITermDateValidator, IProRatedInvoiceGenerator {
  private readonly db: Database.Database
  private readonly calculator: ProRateCalculator
  private readonly validator: TermDateValidator
  private readonly invoiceGenerator: ProRatedInvoiceGenerator

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    this.calculator = new ProRateCalculator()
    this.validator = new TermDateValidator()

    const templateRepo = new InvoiceTemplateRepository(this.db)
    const invoiceRepo = new ProRatedInvoiceRepository(this.db)

    this.invoiceGenerator = new ProRatedInvoiceGenerator(
      templateRepo,
      invoiceRepo,
      this.calculator,
      this.validator
    )
  }

  /**
   * Calculate pro-rated fee for mid-term enrollment
   */
  calculateProRatedFee(
    fullAmount: number,
    termStartDate: string,
    termEndDate: string,
    enrollmentDate: string
  ): ProRationResult {
    return this.calculator.calculateProRatedFee(fullAmount, termStartDate, termEndDate, enrollmentDate)
  }

  /**
   * Validate enrollment date is within term and requires proration
   */
  validateEnrollmentDate(
    termStartDate: string,
    termEndDate: string,
    enrollmentDate: string
  ): ValidationResult {
    return this.validator.validateEnrollmentDate(termStartDate, termEndDate, enrollmentDate)
  }

  /**
   * Generate pro-rated invoice for mid-term enrollment
   */
  // Synchronous wrapper for test compatibility
  generateProRatedInvoiceSync(data: GenerateProRatedInvoiceInput): InvoiceGenerationResult {
    const db = this.db

    try {
      // Find invoice template for the grade
      const template = db.prepare(`
        SELECT * FROM invoice_template WHERE grade = ? LIMIT 1
      `).get(data.grade) as { amount: number } | undefined

      if (!template) {
        return {
          success: false,
          message: 'No invoice template found for grade: ' + data.grade
        }
      }

      // Get term dates
      const term = db.prepare(`
        SELECT id, start_date, end_date FROM academic_term WHERE is_current = 1
      `).get() as { id: number; start_date: string; end_date: string } | undefined

      if (!term) {
        return {
          success: false,
          message: 'No current term found'
        }
      }

      const termStartDate = term.start_date
      const termEndDate = term.end_date
      const termId = term.id

      // Calculate Proration using the centralized calculator
      const prorationResult = this.calculator.calculateProRatedFee(
        template.amount,
        termStartDate,
        termEndDate,
        data.enrollmentDate
      )

      const daysInTerm = prorationResult.days_in_term
      const daysEnrolled = prorationResult.days_enrolled
      const discountPercentage = prorationResult.discount_percentage
      const proratedAmount = prorationResult.pro_rated_amount
      const prorationType = (daysEnrolled / daysInTerm) * 100 // Kept for legacy schema column 'proration_percentage' if needed, though 'discount_percentage' is usually preferred. Keeping specific logic to match original intent of 'amount_paid' field usage if any.


      // Create invoice with unique invoice number
      const invoiceToken = randomUUID().replace(/-/g, '').slice(0, 9).toUpperCase()
      const invoiceNumber = `INV-${Date.now()}-${invoiceToken}`
      const invoiceResult = db.prepare(`
        INSERT INTO fee_invoice (
          student_id, term_id, academic_term_id, invoice_number,
          total_amount, amount, amount_due, original_amount, amount_paid,
          is_prorated, proration_percentage, created_at, status, created_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, 'PENDING', ?)
      `).run(data.studentId, termId, termId, invoiceNumber, proratedAmount, proratedAmount, proratedAmount, template.amount, prorationType, new Date().toISOString(), data.userId)

      const invoiceId = invoiceResult.lastInsertRowid

      // Record proration log
      db.prepare(`
        INSERT INTO pro_ration_log (
          student_id, invoice_id, enrollment_date, term_start, term_end,
          days_in_term, days_enrolled, discount_percentage, full_amount, pro_rated_amount, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(data.studentId, invoiceId, data.enrollmentDate, termStartDate, termEndDate, daysInTerm, daysEnrolled, discountPercentage, template.amount, proratedAmount, new Date().toISOString())

      logAudit(
        data.userId,
        'CREATE_PRORATED_INVOICE',
        'fee_invoice',
        Number(invoiceId),
        null,
        {
          student_id: data.studentId,
          original_amount: template.amount,
          prorated_amount: proratedAmount,
          proration_percentage: discountPercentage
        }
      )

      return {
        success: true,
        message: `Pro-rated invoice created: ${(proratedAmount / 100).toFixed(2)} KES (${discountPercentage.toFixed(1)}% discount)`,
        invoice_id: Number(invoiceId)
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to generate pro-rated invoice: ${(error as Error).message}`
      }
    }
  }

  async generateProRatedInvoice(
    studentIdOrData: number | GenerateProRatedInvoiceInput,
    templateInvoiceId?: number,
    enrollmentDate?: string,
    userId?: number
  ): Promise<InvoiceGenerationResult> {
    // Handle both API styles
    if (typeof studentIdOrData === 'object') {
      // New style: { studentId, enrollmentDate, grade, userId }
      return this.generateProRatedInvoiceSync(studentIdOrData)
    } else {
      // Old style: (studentId, templateInvoiceId, enrollmentDate, userId)
      return this.invoiceGenerator.generateProRatedInvoice(studentIdOrData, templateInvoiceId!, enrollmentDate!, userId!)
    }
  }

  /**
   * Get proration history for a student
   */
  async getStudentProRationHistory(studentId: number): Promise<ProRationLogEntry[]> {
    const db = this.db
    return db.prepare(`
      SELECT 
        pl.*,
        fi.invoice_number,
        fi.description
      FROM pro_ration_log pl
      LEFT JOIN fee_invoice fi ON pl.invoice_id = fi.id
      WHERE pl.student_id = ?
      ORDER BY pl.created_at DESC
    `).all(studentId) as ProRationLogEntry[]
  }

  /**
   * Get proration details for a student
   */
  getProrationDetails(studentId: number): ProrationDetail[] {
    const db = this.db
    const result = db.prepare(`
      SELECT 
        fi.*,
        pl.full_amount as original_amount,
        pl.pro_rated_amount as prorated_amount,
        pl.discount_percentage,
        pl.days_in_term,
        pl.days_enrolled,
        pl.enrollment_date
      FROM fee_invoice fi
      LEFT JOIN pro_ration_log pl ON pl.invoice_id = fi.id
      WHERE fi.student_id = ? AND fi.is_prorated = 1
      ORDER BY fi.created_at DESC
    `).all(studentId) as ProrationDetail[]

    return result
  }

  /**
   * Get proration history (alias for getStudentProRationHistory)
   */
  getProrationHistory(studentId: number, startDate?: string, endDate?: string): ProRationLogEntry[] {
    const db = this.db
    let query = `
      SELECT 
        pl.*,
        fi.invoice_number
      FROM pro_ration_log pl
      LEFT JOIN fee_invoice fi ON pl.invoice_id = fi.id
      WHERE pl.student_id = ?
    `

    const params: (string | number)[] = [studentId]

    if (startDate && endDate) {
      query += ` AND pl.created_at BETWEEN ? AND ?`
      params.push(startDate, endDate)
    }

    query += ` ORDER BY pl.created_at DESC`

    return db.prepare(query).all(...params) as ProRationLogEntry[]
  }

  /**
   * Calculate proration percentage based on enrollment date
   */
  calculateProrationPercentage(enrollmentDate: string, termStartDate: string, termEndDate: string): number {
    const termStart = new Date(termStartDate)
    const termEnd = new Date(termEndDate)
    const enrollment = new Date(enrollmentDate)

    // Calculate days in term
    const daysInTerm = Math.ceil((termEnd.getTime() - termStart.getTime()) / (1000 * 60 * 60 * 24)) + 1

    // Calculate days enrolled
    const daysEnrolled = Math.ceil((termEnd.getTime() - enrollment.getTime()) / (1000 * 60 * 60 * 24)) + 1

    // Calculate percentage
    const percentage = (daysEnrolled / daysInTerm) * 100

    // Round to 2 decimal places
    return Math.round(percentage * 100) / 100
  }
}




