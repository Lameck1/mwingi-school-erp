import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

// ============================================================================
// SEGREGATED INTERFACES (ISP)
// ============================================================================

export interface IProRateCalculator {
  calculateProRatedFee(fullAmount: number, termStartDate: string, termEndDate: string, enrollmentDate: string): ProRationResult
}

export interface ITermDateValidator {
  validateEnrollmentDate(termStartDate: string, termEndDate: string, enrollmentDate: string): ValidationResult
}

export interface IProRatedInvoiceGenerator {
  generateProRatedInvoice(studentId: number, templateInvoiceId: number, enrollmentDate: string, userId: number): Promise<InvoiceGenerationResult>
}

export interface ProRationResult {
  full_amount: number
  pro_rated_amount: number
  discount_percentage: number
  days_in_term: number
  days_enrolled: number
  enrollment_date: string
  calculation_method: 'DAILY' | 'WEEKLY' | 'MONTHLY'
}

export interface ValidationResult {
  valid: boolean
  message: string
}

export interface InvoiceGenerationResult {
  success: boolean
  message: string
  invoice_id?: number
  pro_ration_details?: ProRationResult
}

// ============================================================================
// REPOSITORY LAYER (SRP)
// ============================================================================

class InvoiceTemplateRepository {
  async getInvoiceTemplate(templateId: number): Promise<any> {
    const db = getDatabase()
    return db.prepare(`
      SELECT * FROM fee_invoice WHERE id = ?
    `).get(templateId)
  }

  async getTermDates(termId: number): Promise<{ term_start: string; term_end: string } | null> {
    const db = getDatabase()
    const result = db.prepare(`
      SELECT term_start, term_end FROM academic_term WHERE id = ?
    `).get(termId) as any

    if (!result) return null

    return {
      term_start: result.term_start,
      term_end: result.term_end
    }
  }
}

class ProRatedInvoiceRepository {
  async createProRatedInvoice(data: {
    student_id: number
    amount: number
    due_date: string
    invoice_date: string
    description: string
    invoice_type: string
    term_id: number
    class_id: number
  }): Promise<number> {
    const db = getDatabase()
    const invoiceNumber = `INV-${Date.now()}`

    const result = db.prepare(`
      INSERT INTO fee_invoice (
        student_id, amount, amount_paid, due_date, invoice_date,
        invoice_number, description, invoice_type, term_id, class_id, status
      ) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `).run(
      data.student_id,
      data.amount,
      data.due_date,
      data.invoice_date,
      invoiceNumber,
      data.description,
      data.invoice_type,
      data.term_id,
      data.class_id
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
    const db = getDatabase()
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

    // Calculate days
    const daysInTerm = Math.ceil((termEnd.getTime() - termStart.getTime()) / (1000 * 60 * 60 * 24))
    const daysEnrolled = Math.ceil((termEnd.getTime() - enrollment.getTime()) / (1000 * 60 * 60 * 24))

    // Calculate pro-rated amount
    const discountPercentage = ((daysInTerm - daysEnrolled) / daysInTerm) * 100
    const proRatedAmount = fullAmount * (daysEnrolled / daysInTerm)

    return {
      full_amount: fullAmount,
      pro_rated_amount: Math.round(proRatedAmount * 100) / 100, // Round to 2 decimals
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
    private templateRepo: InvoiceTemplateRepository,
    private invoiceRepo: ProRatedInvoiceRepository,
    private calculator: ProRateCalculator,
    private validator: TermDateValidator
  ) {}

  async generateProRatedInvoice(
    studentId: number,
    templateInvoiceId: number,
    enrollmentDate: string,
    userId: number
  ): Promise<InvoiceGenerationResult> {
    const db = getDatabase()

    try {
      // Get template invoice
      const template = await this.templateRepo.getInvoiceTemplate(templateInvoiceId)

      if (!template) {
        return {
          success: false,
          message: 'Template invoice not found'
        }
      }

      // Get term dates
      const termDates = await this.templateRepo.getTermDates(template.term_id)

      if (!termDates) {
        return {
          success: false,
          message: 'Term dates not found'
        }
      }

      // Validate enrollment date
      const validation = this.validator.validateEnrollmentDate(
        termDates.term_start,
        termDates.term_end,
        enrollmentDate
      )

      if (!validation.valid) {
        return {
          success: false,
          message: validation.message
        }
      }

      // Calculate pro-rated fee
      const proRation = this.calculator.calculateProRatedFee(
        template.amount,
        termDates.term_start,
        termDates.term_end,
        enrollmentDate
      )

      // Create pro-rated invoice
      const invoiceId = await this.invoiceRepo.createProRatedInvoice({
        student_id: studentId,
        amount: proRation.pro_rated_amount,
        due_date: template.due_date,
        invoice_date: new Date().toISOString().split('T')[0],
        description: `${template.description} (Pro-rated: ${proRation.discount_percentage.toFixed(1)}% discount)`,
        invoice_type: template.invoice_type,
        term_id: template.term_id,
        class_id: template.class_id
      })

      // Record proration log
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

      // Audit log
      logAudit(
        userId,
        'CREATE_PRORATED_INVOICE',
        'fee_invoice',
        invoiceId,
        null,
        {
          student_id: studentId,
          full_amount: proRation.full_amount,
          pro_rated_amount: proRation.pro_rated_amount,
          discount_percentage: proRation.discount_percentage
        }
      )

      return {
        success: true,
        message: `Pro-rated invoice created: ${proRation.pro_rated_amount.toFixed(2)} KES (${proRation.discount_percentage.toFixed(1)}% discount)`,
        invoice_id: invoiceId,
        pro_ration_details: proRation
      }

    } catch (error) {
      throw new Error(`Failed to generate pro-rated invoice: ${(error as Error).message}`)
    }
  }
}

// ============================================================================
// FACADE SERVICE (Composition, DIP)
// ============================================================================

export class FeeProrationService implements IProRateCalculator, ITermDateValidator, IProRatedInvoiceGenerator {
  private readonly calculator: ProRateCalculator
  private readonly validator: TermDateValidator
  private readonly invoiceGenerator: ProRatedInvoiceGenerator

  constructor() {
    this.calculator = new ProRateCalculator()
    this.validator = new TermDateValidator()

    const templateRepo = new InvoiceTemplateRepository()
    const invoiceRepo = new ProRatedInvoiceRepository()

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
  async generateProRatedInvoice(
    studentId: number,
    templateInvoiceId: number,
    enrollmentDate: string,
    userId: number
  ): Promise<InvoiceGenerationResult> {
    return this.invoiceGenerator.generateProRatedInvoice(studentId, templateInvoiceId, enrollmentDate, userId)
  }

  /**
   * Get proration history for a student
   */
  async getStudentProRationHistory(studentId: number): Promise<any[]> {
    const db = getDatabase()
    return db.prepare(`
      SELECT 
        pl.*,
        fi.invoice_number,
        fi.description
      FROM pro_ration_log pl
      LEFT JOIN fee_invoice fi ON pl.invoice_id = fi.id
      WHERE pl.student_id = ?
      ORDER BY pl.created_at DESC
    `).all(studentId) as any[]
  }
}
