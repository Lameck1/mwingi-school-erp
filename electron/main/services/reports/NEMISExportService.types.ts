export interface INEMISDataExtractor {
  extractStudentData(filters?: NEMISFilters): Promise<NEMISStudent[]>
  extractStaffData(): Promise<NEMISStaff[]>
  extractEnrollmentData(academicYear: string): Promise<NEMISEnrollment[]>
  extractSchoolData(): Promise<SchoolData | undefined>
  extractFinancialData(): Promise<FinancialData | undefined>
  generateNEMISReport(startDate?: string, endDate?: string): Promise<NEMISReport>
}

export interface INEMISValidator {
  validateStudentData(student: NEMISStudent): ValidationResult
  validateExportReadiness(exportId: number): Promise<ValidationResult>
}

export interface INEMISFormatter {
  formatToCSV(data: Record<string, unknown>[], exportType: NEMISExportType): string
  formatToJSON(data: Record<string, unknown>[], exportType: NEMISExportType): string
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
  gender: string
  date_of_birth: string
  qualification: string
  subject_taught: string
  employment_date: string
}

export interface SchoolData {
  id: number
  name: string
  code: string
  county: string
  subcounty: string
  nemis_code: string
}

export interface FinancialData {
  total_invoices: number
  total_fees: number
  total_paid: number
  total_outstanding: number
}

export interface NEMISReport {
  timestamp: string
  school: SchoolData | undefined
  student_count: number
  enrollment_count: number
  financial_summary: FinancialData | undefined
  period_start?: string
  period_end?: string
  generated_by: string
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

export interface NEMISExportDataStructure {
  students?: unknown[]
  school?: unknown
  enrollments?: unknown[]
  financial?: unknown
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
