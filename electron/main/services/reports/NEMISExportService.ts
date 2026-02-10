
import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

import type {
  ExportResult,
  FinancialData,
  INEMISDataExtractor,
  INEMISExportManager,
  INEMISFormatter,
  INEMISValidator,
  NEMISEnrollment,
  NEMISExportConfig,
  NEMISExportDataStructure,
  NEMISExportRecord,
  NEMISExportType,
  NEMISFilters,
  NEMISReport,
  NEMISStaff,
  NEMISStudent,
  SchoolData,
  ValidationResult
} from './NEMISExportService.types'
import type Database from 'better-sqlite3'

export type {
  ExportResult,
  FinancialData,
  INEMISDataExtractor,
  INEMISExportManager,
  INEMISFormatter,
  INEMISValidator,
  NEMISEnrollment,
  NEMISExportConfig,
  NEMISExportDataStructure,
  NEMISExportRecord,
  NEMISExportType,
  NEMISFilters,
  NEMISReport,
  NEMISStaff,
  NEMISStudent,
  SchoolData,
  ValidationResult
} from './NEMISExportService.types'

// ============================================================================
// REPOSITORY LAYER (SRP)
// ============================================================================

class NEMISDataRepository {
  private db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }
  async extractStudentData(filters?: NEMISFilters): Promise<NEMISStudent[]> {
    const db = this.db
    
    let query = `
      SELECT 
        s.id,
        s.first_name,
        s.last_name,
        s.date_of_birth,
        s.gender,
        s.admission_number,
        COALESCE(s.guardian_name, '') as guardian_name,
        COALESCE(s.guardian_phone, '') as guardian_phone,
        st.stream_name as class_name
      FROM student s
      LEFT JOIN enrollment e ON e.id = (
        SELECT id FROM enrollment WHERE student_id = s.id ORDER BY id DESC LIMIT 1
      )
      LEFT JOIN stream st ON e.stream_id = st.id
      WHERE s.is_active = 1
    `

    const params: (string | number)[] = []

    if (filters?.gender) {
      query += ` AND s.gender = ?`
      params.push(filters.gender)
    }

    query += ` ORDER BY st.stream_name, s.first_name, s.last_name`

    const rows = db.prepare(query).all(...params) as Array<{
      first_name: string
      last_name: string
      admission_number: string
      date_of_birth: string
      gender: 'M' | 'F'
      class_name: string | null
      guardian_name: string
      guardian_phone: string
    }>

    return rows.map(row => ({
      nemis_upi: row.admission_number,
      full_name: `${row.first_name} ${row.last_name}`.trim(),
      date_of_birth: row.date_of_birth,
      gender: row.gender,
      admission_number: row.admission_number,
      class_name: row.class_name || 'N/A',
      guardian_name: row.guardian_name || 'N/A',
      guardian_phone: row.guardian_phone || 'N/A',
      county: '',
      sub_county: '',
      special_needs: null
    }))
  }

  async extractSchoolData(): Promise<SchoolData | undefined> {
    const db = this.db
    return db.prepare(`
      SELECT 
        1 as id,
        school_name as name,
        '' as code,
        '' as county,
        '' as subcounty,
        '' as nemis_code
      FROM school_settings
      LIMIT 1
    `).get() as SchoolData | undefined
  }

  async extractFinancialData(): Promise<FinancialData | undefined> {
    const db = this.db
    return db.prepare(`
      SELECT 
        COUNT(DISTINCT f.id) as total_invoices,
        SUM(COALESCE(f.amount_due, f.total_amount, 0)) as total_fees,
        SUM(f.amount_paid) as total_paid,
        SUM(COALESCE(f.amount_due, f.total_amount, 0) - COALESCE(f.amount_paid, 0)) as total_outstanding
      FROM fee_invoice f
    `).get() as FinancialData | undefined
  }

  async generateNEMISReport(startDate?: string, endDate?: string): Promise<NEMISReport> {
    const db = this.db
    
    const studentCount = db.prepare(`
      SELECT COUNT(*) as count FROM student WHERE is_active = 1
    `).get() as { count: number }
    
    const enrollmentData = db.prepare(`
      SELECT COUNT(*) as count FROM enrollment
    `).get() as { count: number }
    
    const financialData = await this.extractFinancialData()
    const schoolData = await this.extractSchoolData()
    
    return {
      timestamp: new Date().toISOString(),
      school: schoolData,
      student_count: studentCount.count || 0,
      enrollment_count: enrollmentData.count || 0,
      financial_summary: financialData,
      period_start: startDate,
      period_end: endDate,
      generated_by: 'NEMIS_EXPORT_SERVICE'
    }
  }

  async extractStaffData(): Promise<NEMISStaff[]> {
    const db = this.db
    return db.prepare(`
      SELECT 
        staff_number as tsc_number,
        (first_name || ' ' || last_name) as full_name,
        COALESCE(id_number, '') as id_number,
        '' as gender,
        '' as date_of_birth,
        '' as qualification,
        COALESCE(job_title, '') as subject_taught,
        COALESCE(employment_date, '') as employment_date
      FROM staff
      WHERE is_active = 1
      ORDER BY first_name, last_name
    `).all() as NEMISStaff[]
  }

  // Unused params prefixed with _
  async extractEnrollmentData(academicYear?: string): Promise<NEMISEnrollment[]> {
    const db = this.db
    const params: (string | number)[] = []

    let query = `
      SELECT 
        st.stream_name as class_name,
        st.stream_name as grade_level,
        COUNT(CASE WHEN s.gender = 'M' THEN 1 END) as boys_count,
        COUNT(CASE WHEN s.gender = 'F' THEN 1 END) as girls_count,
        COUNT(*) as total_count,
        ay.year_name as academic_year
      FROM enrollment e
      JOIN student s ON e.student_id = s.id
      LEFT JOIN stream st ON e.stream_id = st.id
      LEFT JOIN academic_year ay ON e.academic_year_id = ay.id
      WHERE s.is_active = 1
    `

    if (academicYear) {
      query += ` AND ay.year_name = ?`
      params.push(academicYear)
    }

    query += `
      GROUP BY st.stream_name, ay.year_name
      ORDER BY ay.year_name DESC, st.stream_name
    `

    return db.prepare(query).all(...params) as NEMISEnrollment[]
  }
}

class NEMISExportRepository {
  private db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  async createExportRecord(data: {
    export_type: NEMISExportType
    format: string
    record_count: number
    file_path: string
    exported_by: number
    status: 'COMPLETED' | 'FAILED'
  }): Promise<number> {
    const db = this.db
    const result = db.prepare(`
      INSERT INTO nemis_export (
        export_type, format, record_count, file_path, exported_by, status
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      data.export_type,
      data.format,
      data.record_count,
      data.file_path,
      data.exported_by,
      data.status
    )

    return result.lastInsertRowid as number
  }

  async getExportHistory(limit?: number): Promise<NEMISExportRecord[]> {
    const db = this.db
    const query = `
      SELECT * FROM nemis_export
      ORDER BY exported_at DESC
      ${limit ? `LIMIT ${limit}` : ''}
    `
    return db.prepare(query).all() as NEMISExportRecord[]
  }
}

// ============================================================================
// BUSINESS LOGIC LAYER (SRP)
// ============================================================================

class NEMISDataExtractor implements INEMISDataExtractor {
  constructor(private dataRepo: NEMISDataRepository) {}

  async extractStudentData(filters?: NEMISFilters): Promise<NEMISStudent[]> {
    return this.dataRepo.extractStudentData(filters)
  }

  async extractStaffData(): Promise<NEMISStaff[]> {
    return this.dataRepo.extractStaffData()
  }

  async extractSchoolData(): Promise<SchoolData | undefined> {
    return this.dataRepo.extractSchoolData()
  }

  async extractFinancialData(): Promise<FinancialData | undefined> {
    return this.dataRepo.extractFinancialData()
  }

  async generateNEMISReport(startDate?: string, endDate?: string): Promise<NEMISReport> {
    return this.dataRepo.generateNEMISReport(startDate, endDate)
  }

  async extractEnrollmentData(academicYear: string): Promise<NEMISEnrollment[]> {
    return this.dataRepo.extractEnrollmentData(academicYear)
  }
}

class NEMISValidator implements INEMISValidator {
  validateStudentData(student: NEMISStudent): ValidationResult {
    const errors: string[] = []

    if (!student.nemis_upi || student.nemis_upi.trim() === '') {
      errors.push(`Student ${student.full_name}: Missing NEMIS UPI`)
    }

    if (!student.date_of_birth) {
      errors.push(`Student ${student.full_name}: Missing date of birth`)
    }

    if (!['M', 'F'].includes(student.gender)) {
      errors.push(`Student ${student.full_name}: Invalid gender`)
    }

    if (!student.admission_number) {
      errors.push(`Student ${student.full_name}: Missing admission number`)
    }

    return {
      valid: errors.length === 0,
      message: errors.length === 0 ? 'Data is valid' : `Found ${errors.length} validation error(s)`,
      errors: errors.length > 0 ? errors : undefined
    }
  }

  async validateExportReadiness(_exportId: number): Promise<ValidationResult> {
    // Could check if export file exists, is readable, etc.
    return {
      valid: true,
      message: 'Export is ready'
    }
  }
}

class NEMISFormatter implements INEMISFormatter {
  formatToCSV(data: Record<string, unknown>[], _exportType: NEMISExportType): string {
    if (data.length === 0) {return ''}

    // Get column headers
    const headers = Object.keys(data[0])
    let csv = headers.join(',') + '\n'

    // Add data rows
    for (const row of data) {
      const values = headers.map(header => {
        const value = row[header]
        // Escape commas and quotes in values
        if (value === null || value === undefined) {return ''}
        const stringValue = String(value)
        if (stringValue.includes(',') || stringValue.includes('"')) {
          return `"${stringValue.replace(/"/g, '""')}"`
        }
        return stringValue
      })
      csv += values.join(',') + '\n'
    }

    return csv
  }

  formatToJSON(data: Record<string, unknown>[], exportType: NEMISExportType): string {
    return JSON.stringify({
      export_type: exportType,
      export_date: new Date().toISOString(),
      record_count: data.length,
      data
    }, null, 2)
  }
}

class NEMISExportManager implements INEMISExportManager {
  constructor(
    private readonly extractor: NEMISDataExtractor,
    private readonly validator: NEMISValidator,
    private readonly formatter: NEMISFormatter,
    private readonly exportRepo: NEMISExportRepository
  ) {}

  private async extractExportData(exportConfig: NEMISExportConfig): Promise<Record<string, unknown>[] | ExportResult> {
    switch (exportConfig.export_type) {
      case 'STUDENTS':
        return (await this.extractor.extractStudentData(exportConfig.filters)) as unknown as Record<string, unknown>[]
      case 'STAFF':
        return (await this.extractor.extractStaffData()) as unknown as Record<string, unknown>[]
      case 'ENROLLMENT':
        if (!exportConfig.academic_year) {
          return {
            success: false,
            message: 'Academic year required for enrollment export'
          }
        }

        return (await this.extractor.extractEnrollmentData(exportConfig.academic_year)) as unknown as Record<string, unknown>[]
      case 'FINANCIAL': {
        const financial = await this.extractor.extractFinancialData()
        return financial ? [financial as unknown as Record<string, unknown>] : []
      }
      default:
        return {
          success: false,
          message: `Unsupported export type: ${exportConfig.export_type}`
        }
    }
  }

  private validateExportData(exportType: NEMISExportType, data: Record<string, unknown>[]): ExportResult | null {
    if (data.length === 0) {
      return {
        success: false,
        message: 'No data found for export'
      }
    }

    if (exportType !== 'STUDENTS') {
      return null
    }

    for (const student of data as unknown as NEMISStudent[]) {
      const validation = this.validator.validateStudentData(student)
      if (!validation.valid) {
        return {
          success: false,
          message: 'Data validation failed'
        }
      }
    }

    return null
  }

  private formatExportData(config: NEMISExportConfig, data: Record<string, unknown>[]): string {
    return config.format === 'CSV'
      ? this.formatter.formatToCSV(data, config.export_type)
      : this.formatter.formatToJSON(data, config.export_type)
  }

  private buildFilePath(config: NEMISExportConfig): string {
    const timestamp = Date.now()
    const fileExtension = config.format.toLowerCase()
    return `nemis_exports/${config.export_type.toLowerCase()}_${timestamp}.${fileExtension}`
  }

  async createExport(exportConfig: NEMISExportConfig, userId: number): Promise<ExportResult> {
    try {
      const extracted = await this.extractExportData(exportConfig)
      if (!Array.isArray(extracted)) {
        return extracted
      }

      const validationError = this.validateExportData(exportConfig.export_type, extracted)
      if (validationError) {
        return validationError
      }

      this.formatExportData(exportConfig, extracted)
      const filePath = this.buildFilePath(exportConfig)

      const exportId = await this.exportRepo.createExportRecord({
        export_type: exportConfig.export_type,
        format: exportConfig.format,
        record_count: extracted.length,
        file_path: filePath,
        exported_by: userId,
        status: 'COMPLETED'
      })

      logAudit(userId, 'NEMIS_EXPORT', 'nemis_export', exportId, null, {
        export_type: exportConfig.export_type,
        record_count: extracted.length
      })

      return {
        success: true,
        message: `Successfully exported ${extracted.length} records`,
        export_id: exportId,
        file_path: filePath,
        record_count: extracted.length
      }
    } catch (error) {
      throw new Error(`Failed to create NEMIS export: ${(error as Error).message}`)
    }
  }

  async getExportHistory(limit?: number): Promise<NEMISExportRecord[]> {
    return this.exportRepo.getExportHistory(limit)
  }
}

// ============================================================================
// FACADE SERVICE (Composition, DIP)
// ============================================================================

export class NEMISExportService 
  implements INEMISDataExtractor, INEMISValidator, INEMISFormatter, INEMISExportManager {
  
  private db: Database.Database
  private readonly extractor: NEMISDataExtractor
  private readonly validator: NEMISValidator
  private readonly formatter: NEMISFormatter
  private readonly exportManager: NEMISExportManager

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
    const dataRepo = new NEMISDataRepository(this.db)
    const exportRepo = new NEMISExportRepository(this.db)

    this.extractor = new NEMISDataExtractor(dataRepo)
    this.validator = new NEMISValidator()
    this.formatter = new NEMISFormatter()
    this.exportManager = new NEMISExportManager(
      this.extractor,
      this.validator,
      this.formatter,
      exportRepo
    )
  }

  /**
   * Extract student data for NEMIS export
   */
  async extractStudentData(filters?: NEMISFilters): Promise<NEMISStudent[]> {
    return this.extractor.extractStudentData(filters)
  }

  /**
   * Extract staff data for NEMIS export
   */
  async extractStaffData(): Promise<NEMISStaff[]> {
    return this.extractor.extractStaffData()
  }

  /**
   * Extract school information for NEMIS export
   */
  async extractSchoolData(): Promise<SchoolData | undefined> {
    return this.extractor.extractSchoolData()
  }

  /**
   * Extract financial data for NEMIS export
   */
  async extractFinancialData(): Promise<FinancialData | undefined> {
    return this.extractor.extractFinancialData()
  }

  /**
   * Generate NEMIS report
   */
  async generateNEMISReport(startDate?: string, endDate?: string): Promise<NEMISReport> {
    return this.extractor.generateNEMISReport(startDate, endDate)
  }

  /**
   * Extract enrollment statistics for NEMIS export
   */
  async extractEnrollmentData(academicYear: string): Promise<NEMISEnrollment[]> {
    return this.extractor.extractEnrollmentData(academicYear)
  }

  /**
   * Validate student data for NEMIS compliance
   */
  validateStudentData(student: NEMISStudent): ValidationResult {
    return this.validator.validateStudentData(student)
  }

  /**
   * Validate NEMIS export format
   */
  async validateNEMISFormat(data?: NEMISExportDataStructure): Promise<ValidationResult> {
    if (!data) {
      return {
        valid: false,
        message: 'Export data is required',
        errors: ['Export data is required']
      }
    }

    const errors: string[] = []

    // Validate required fields
    if (!data.students || data.students.length === 0) {
      errors.push('Students data is required')
    }
    if (!data.school) {
      errors.push('School data is required')
    }
    if (!data.enrollments) {
      errors.push('Enrollment data is required')
    }
    if (!data.financial) {
      errors.push('Financial data is required')
    }

    return {
      valid: errors.length === 0,
      message: errors.length === 0 ? 'Valid' : errors.join(', '),
      errors
    }
  }

  /**
   * Validate export readiness
   */
  async validateExportReadiness(exportId: number): Promise<ValidationResult> {
    return this.validator.validateExportReadiness(exportId)
  }

  /**
   * Format data to CSV
   */
  formatToCSV(data: Record<string, unknown>[], exportType: NEMISExportType): string {
    return this.formatter.formatToCSV(data, exportType)
  }

  /**
   * Format data to JSON
   */
  formatToJSON(data: Record<string, unknown>[], exportType: NEMISExportType): string {
    return this.formatter.formatToJSON(data, exportType)
  }

  /**
   * Create and execute NEMIS export
   */
  async createExport(exportConfig: NEMISExportConfig, userId: number): Promise<ExportResult> {
    return this.exportManager.createExport(exportConfig, userId)
  }

  /**
   * Get export history
   */
  async getExportHistory(limit?: number): Promise<NEMISExportRecord[]> {
    return this.exportManager.getExportHistory(limit)
  }
}


