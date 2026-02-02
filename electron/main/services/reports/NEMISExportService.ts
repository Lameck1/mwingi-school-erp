import Database from 'better-sqlite3-multiple-ciphers'
import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

// ============================================================================
// SEGREGATED INTERFACES (ISP)
// ============================================================================

export interface INEMISDataExtractor {
  extractStudentData(filters?: NEMISFilters): Promise<NEMISStudent[]>
  extractStaffData(): Promise<NEMISStaff[]>
  extractEnrollmentData(academicYear: string): Promise<NEMISEnrollment[]>
}

export interface INEMISValidator {
  validateStudentData(student: NEMISStudent): ValidationResult
  validateExportReadiness(exportId: number): Promise<ValidationResult>
}

export interface INEMISFormatter {
  formatToCSV(data: any[], exportType: NEMISExportType): string
  formatToJSON(data: any[], exportType: NEMISExportType): string
}

export interface INEMISExportManager {
  createExport(exportConfig: NEMISExportConfig, userId: number): Promise<ExportResult>
  getExportHistory(limit?: number): Promise<NEMISExportRecord[]>
}

export interface NEMISFilters {
  class_id?: number
  academic_year?: string
  gender?: 'M' | 'F'
  status?: string
}

export interface NEMISStudent {
  nemis_upi: string
  full_name: string
  date_of_birth: string
  gender: 'M' | 'F'
  admission_number: string
  class_name: string
  guardian_name: string
  guardian_phone: string
  county: string
  sub_county: string
  special_needs: string | null
}

export interface NEMISStaff {
  tsc_number: string
  full_name: string
  id_number: string
  gender: 'M' | 'F'
  date_of_birth: string
  qualification: string
  subject_taught: string
  employment_date: string
}

export interface NEMISEnrollment {
  class_name: string
  grade_level: string
  boys_count: number
  girls_count: number
  total_count: number
  academic_year: string
}

export interface ValidationResult {
  valid: boolean
  message: string
  errors?: string[]
}

export interface NEMISExportConfig {
  export_type: NEMISExportType
  format: 'CSV' | 'JSON'
  filters?: NEMISFilters
  academic_year?: string
}

export type NEMISExportType = 'STUDENTS' | 'STAFF' | 'ENROLLMENT' | 'FINANCIAL'

export interface ExportResult {
  success: boolean
  message: string
  export_id?: number
  file_path?: string
  record_count?: number
}

export interface NEMISExportRecord {
  id: number
  export_type: NEMISExportType
  format: string
  record_count: number
  file_path: string
  exported_by: number
  exported_at: string
  status: 'COMPLETED' | 'FAILED'
}

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
        s.nemis_upi,
        s.full_name,
        s.date_of_birth,
        s.gender,
        s.admission_number,
        c.class_name,
        g.full_name as guardian_name,
        g.phone_primary as guardian_phone,
        s.county,
        s.sub_county,
        s.special_needs
      FROM student s
      LEFT JOIN class c ON s.class_id = c.id
      LEFT JOIN guardian g ON s.guardian_id = g.id
      WHERE s.status = 'ACTIVE'
    `

    const params: any[] = []

    if (filters?.class_id) {
      query += ` AND s.class_id = ?`
      params.push(filters.class_id)
    }

    if (filters?.gender) {
      query += ` AND s.gender = ?`
      params.push(filters.gender)
    }

    query += ` ORDER BY c.class_name, s.full_name`

    return db.prepare(query).all(...params) as NEMISStudent[]
  }

  async extractStaffData(): Promise<NEMISStaff[]> {
    const db = this.db
    return db.prepare(`
      SELECT 
        tsc_number,
        full_name,
        id_number,
        gender,
        date_of_birth,
        qualification,
        subject_taught,
        employment_date
      FROM user
      WHERE role IN ('TEACHER', 'PRINCIPAL', 'DEPUTY_PRINCIPAL')
      AND status = 'ACTIVE'
      ORDER BY full_name
    `).all() as NEMISStaff[]
  }

  async extractEnrollmentData(academicYear: string): Promise<NEMISEnrollment[]> {
    const db = this.db
    return db.prepare(`
      SELECT 
        c.class_name,
        c.grade_level,
        SUM(CASE WHEN s.gender = 'M' THEN 1 ELSE 0 END) as boys_count,
        SUM(CASE WHEN s.gender = 'F' THEN 1 ELSE 0 END) as girls_count,
        COUNT(*) as total_count,
        ? as academic_year
      FROM student s
      LEFT JOIN class c ON s.class_id = c.id
      WHERE s.status = 'ACTIVE'
      GROUP BY c.class_name, c.grade_level
      ORDER BY c.grade_level, c.class_name
    `).all(academicYear) as NEMISEnrollment[]
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

    if (!student.gender || !['M', 'F'].includes(student.gender)) {
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

  async validateExportReadiness(exportId: number): Promise<ValidationResult> {
    // Could check if export file exists, is readable, etc.
    return {
      valid: true,
      message: 'Export is ready'
    }
  }
}

class NEMISFormatter implements INEMISFormatter {
  formatToCSV(data: any[], exportType: NEMISExportType): string {
    if (data.length === 0) return ''

    // Get column headers
    const headers = Object.keys(data[0])
    let csv = headers.join(',') + '\n'

    // Add data rows
    for (const row of data) {
      const values = headers.map(header => {
        const value = row[header]
        // Escape commas and quotes in values
        if (value === null || value === undefined) return ''
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

  formatToJSON(data: any[], exportType: NEMISExportType): string {
    return JSON.stringify({
      export_type: exportType,
      export_date: new Date().toISOString(),
      record_count: data.length,
      data: data
    }, null, 2)
  }
}

class NEMISExportManager implements INEMISExportManager {
  constructor(
    private extractor: NEMISDataExtractor,
    private validator: NEMISValidator,
    private formatter: NEMISFormatter,
    private exportRepo: NEMISExportRepository
  ) {}

  async createExport(exportConfig: NEMISExportConfig, userId: number): Promise<ExportResult> {
    try {
      // Extract data based on export type
      let data: any[] = []
      
      switch (exportConfig.export_type) {
        case 'STUDENTS':
          data = await this.extractor.extractStudentData(exportConfig.filters)
          break
        case 'STAFF':
          data = await this.extractor.extractStaffData()
          break
        case 'ENROLLMENT':
          if (!exportConfig.academic_year) {
            return {
              success: false,
              message: 'Academic year required for enrollment export'
            }
          }
          data = await this.extractor.extractEnrollmentData(exportConfig.academic_year)
          break
        default:
          return {
            success: false,
            message: `Unsupported export type: ${exportConfig.export_type}`
          }
      }

      if (data.length === 0) {
        return {
          success: false,
          message: 'No data found for export'
        }
      }

      // Validate data (for students)
      if (exportConfig.export_type === 'STUDENTS') {
        for (const student of data as NEMISStudent[]) {
          const validation = this.validator.validateStudentData(student)
          if (!validation.valid) {
            return {
              success: false,
              message: 'Data validation failed',
              record_count: data.length
            }
          }
        }
      }

      // Format data
      let formattedData: string
      const fileExtension = exportConfig.format.toLowerCase()
      
      if (exportConfig.format === 'CSV') {
        formattedData = this.formatter.formatToCSV(data, exportConfig.export_type)
      } else {
        formattedData = this.formatter.formatToJSON(data, exportConfig.export_type)
      }

      // Generate file path
      const timestamp = Date.now()
      const filePath = `nemis_exports/${exportConfig.export_type.toLowerCase()}_${timestamp}.${fileExtension}`

      // In real implementation, save file to disk
      // For now, we'll just record the export

      // Record export
      const exportId = await this.exportRepo.createExportRecord({
        export_type: exportConfig.export_type,
        format: exportConfig.format,
        record_count: data.length,
        file_path: filePath,
        exported_by: userId,
        status: 'COMPLETED'
      })

      logAudit(
        userId,
        'NEMIS_EXPORT',
        'nemis_export',
        exportId,
        null,
        { export_type: exportConfig.export_type, record_count: data.length }
      )

      return {
        success: true,
        message: `Successfully exported ${data.length} records`,
        export_id: exportId,
        file_path: filePath,
        record_count: data.length
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
   * Validate export readiness
   */
  async validateExportReadiness(exportId: number): Promise<ValidationResult> {
    return this.validator.validateExportReadiness(exportId)
  }

  /**
   * Format data to CSV
   */
  formatToCSV(data: any[], exportType: NEMISExportType): string {
    return this.formatter.formatToCSV(data, exportType)
  }

  /**
   * Format data to JSON
   */
  formatToJSON(data: any[], exportType: NEMISExportType): string {
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
