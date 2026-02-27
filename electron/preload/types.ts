/**
 * Preload API input parameter types.
 *
 * These define the shape of data SENT from renderer → main process via IPC.
 * The renderer types in src/types/electron-api/ define RETURN types (main → renderer).
 * These two sets are complementary, not duplicates.
 */

// ── Students ──
export interface StudentData {
  admission_number?: string | undefined
  first_name?: string | undefined
  middle_name?: string | null | undefined
  last_name?: string | undefined
  email?: string | undefined
  phone?: string | undefined
  date_of_birth?: string | null | undefined
  gender?: 'MALE' | 'FEMALE' | undefined
  address?: string | undefined
  guardian_name?: string | undefined
  guardian_phone?: string | undefined
  guardian_email?: string | undefined
  guardian_relationship?: string | null | undefined
  notes?: string | null | undefined
  stream_id?: number | undefined
  student_type?: 'BOARDER' | 'DAY_SCHOLAR' | undefined
  admission_date?: string | undefined
  is_active?: boolean | undefined
}

export interface StudentFilters {
  stream_id?: number | undefined
  is_active?: boolean | undefined
  search?: string | undefined
  page?: number | undefined
  pageSize?: number | undefined
}

// ── Staff ──
export interface StaffData {
  staff_number?: string | undefined
  first_name?: string | undefined
  middle_name?: string | null | undefined
  last_name?: string | undefined
  id_number?: string | undefined
  kra_pin?: string | undefined
  nhif_number?: string | undefined
  nssf_number?: string | undefined
  phone?: string | undefined
  email?: string | undefined
  bank_name?: string | undefined
  bank_account?: string | undefined
  department?: string | undefined
  job_title?: string | undefined
  employment_date?: string | undefined
  basic_salary?: number | undefined
  is_active?: boolean | undefined
}

// ── Finance: Payments ──
export interface PaymentRecordData {
  student_id: number
  amount: number
  payment_method: string
  payment_reference?: string | undefined
  description?: string | undefined
  transaction_date: string
  term_id: number
  invoice_id?: number | undefined
  amount_in_words?: string | undefined
  idempotency_key?: string | undefined
}

export interface PayWithCreditData {
  studentId: number
  invoiceId: number
  amount: number
}

// ── Finance: Fee Structure ──
export interface FeeStructureCreateData {
  academic_year_id: number
  term_id: number
  stream_id: number
  student_type: string
  fee_category_id: number
  amount: number
}

// ── Finance: Transactions ──
export interface TransactionData {
  transaction_date: string
  transaction_type: string
  category_id: number
  amount: number
  payment_method: string
  payment_reference?: string | undefined
  description?: string | undefined
}

export interface TransactionFilters {
  startDate?: string | undefined
  endDate?: string | undefined
  type?: string | undefined
}

// ── Finance: Scholarships ──
export interface ScholarshipCreateData {
  name: string
  description: string
  scholarship_type: 'MERIT' | 'NEED_BASED' | 'SPORTS' | 'PARTIAL' | 'FULL'
  amount: number
  percentage?: number | undefined
  max_beneficiaries: number
  eligibility_criteria: string
  valid_from: string
  valid_to: string
  sponsor_name?: string | undefined
  sponsor_contact?: string | undefined
}

export interface ScholarshipAllocationData {
  scholarship_id: number
  student_id: number
  amount_allocated: number
  allocation_notes: string
  effective_date: string
}

// ── Finance: Budget ──
export interface BudgetCreateData {
  budget_name: string
  fiscal_year: number
  start_date: string
  end_date: string
  description?: string | undefined
  line_items?: Array<{
    gl_account_code: string
    allocated_amount: number
    description?: string | undefined
  }> | undefined
}

export interface BudgetFilters {
  fiscal_year?: number | undefined
  status?: string | undefined
}

// ── Settings ──
export interface SettingsData {
  school_name?: string | undefined
  school_motto?: string | undefined
  address?: string | undefined
  phone?: string | undefined
  email?: string | undefined
  principal_name?: string | undefined
  logo_data_url?: string | undefined
  mpesa_paybill?: string | undefined
  updated_at?: string | undefined
}

// ── Users ──
export interface UserCreateData {
  username: string
  full_name: string
  email?: string
  password: string
  role: string
}

export interface UserUpdateData {
  full_name?: string
  email?: string
  role?: string
}

// ── Operations: Inventory ──
export interface InventoryItemData {
  item_code: string
  item_name: string
  category_id: number
  unit_of_measure: string
  current_stock?: number | undefined
  reorder_level?: number | undefined
  unit_cost?: number | undefined
}

export interface StockMovementData {
  item_id: number
  movement_type: 'IN' | 'OUT' | 'ADJUSTMENT'
  quantity: number
  unit_cost?: number | undefined
  total_cost?: number | undefined
  description?: string | undefined
  movement_date: string
  reference_number?: string | undefined
  supplier_id?: number | undefined
}

// ── Operations: Hire ──
export interface HireClientData {
  client_name: string
  contact_phone?: string
  contact_email?: string
}

export interface HireAssetData {
  asset_name: string
  asset_type: 'VEHICLE' | 'FACILITY' | 'EQUIPMENT' | 'OTHER'
  default_rate?: number
}

export interface HireBookingData {
  asset_id: number
  client_id: number
  hire_date: string
  return_date?: string
  total_amount: number
}

export interface HirePaymentData {
  amount: number
  payment_date: string
  payment_method?: string
  payment_reference?: string
}

// ── Operations: Grants ──
export interface GrantCreateData {
  grant_name: string
  grant_type: 'CAPITATION' | 'FREE_DAY_SECONDARY' | 'SPECIAL_NEEDS' | 'INFRASTRUCTURE' | 'FEEDING_PROGRAM' | 'OTHER'
  fiscal_year: number
  amount_allocated: number
  amount_received: number
  date_received?: string
  nemis_reference_number?: string
  conditions?: string
  expiry_date?: string
}

// ── Reports: Scheduled ──
export interface ScheduledReportData {
  report_type: string
  frequency: string
  parameters?: Record<string, unknown>
  is_active?: boolean
}

// ── Academic ──
export interface AcademicYearCreateData {
  year_name: string
  start_date: string
  end_date: string
  is_current?: boolean
}

export interface AcademicSubjectData {
  code: string
  name: string
  curriculum: string
  is_compulsory?: boolean | undefined
  is_active?: boolean | undefined
}

export interface AcademicExamData {
  name: string
  academic_year_id: number
  term_id: number
  weight?: number | undefined
}

export interface TeacherAllocationData {
  subject_id: number
  stream_id: number
  teacher_id: number
}

export interface AcademicResultData {
  student_id: number
  score: number | null
  competency_level?: number | null
  teacher_remarks?: string
}

export interface MeritListFilters {
  examId: number
  streamId?: number | undefined
  academicYearId?: number | undefined
  termId?: number | undefined
}

export interface PerformanceFilters {
  academicYearId: number
  termId: number
  streamId?: number | undefined
  examId?: number | undefined
}

export interface BatchReportCardData {
  exam_id: number
  stream_id: number
  template_id?: string | undefined
  include_sms?: boolean | undefined
  output_path?: string | undefined
  merge?: boolean | undefined
}

export interface AwardData {
  student_id: number
  category_id: number
  title: string
  description?: string | undefined
  academic_year_id: number
  term_id: number
  awarded_by: number
}

export interface AwardActionData {
  id: number
  userId: number
}

export interface AwardFilters {
  academicYearId?: number | undefined
  termId?: number | undefined
  categoryId?: number | undefined
  studentId?: number | undefined
}

export interface ExamTimetableConfig {
  academicYearId: number
  termId: number
  startDate: string
  endDate: string
}

export interface ExamFilters {
  academicYearId?: number | undefined
  termId?: number | undefined
  classId?: number | undefined
  subjectId?: number | undefined
  status?: string | undefined
}

export interface PromotionData {
  studentId: number
  fromStreamId: number
  toStreamId: number
  fromAcademicYearId: number
  toAcademicYearId: number
  toTermId: number
}

export interface CBCExpenseData {
  strandId: number
  amount: number
  description: string
  expenseDate: string
}

export interface CBCParticipationData {
  studentId: number
  strandId: number
  startDate: string
  endDate?: string | undefined
}

export interface JSSTransitionData {
  studentId: number
  fromGrade: number
  toGrade: number
  fiscalYear: number
}

export interface JSSBulkTransitionData {
  studentIds: number[]
  fromGrade: number
  toGrade: number
  fiscalYear: number
}

export interface AttendanceEntry {
  student_id: number
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'
  remarks?: string
}

// ── Data Import ──
export interface ImportConfig {
  entityType: 'STUDENT' | 'STAFF' | 'FEE_STRUCTURE' | 'INVENTORY' | 'BANK_STATEMENT'
  mappings: Array<{
    sourceColumn: string
    targetField: string
    required?: boolean
  }>
  skipDuplicates?: boolean
  duplicateKey?: string
}

export interface PickImportFileResult {
  success: boolean
  cancelled?: boolean
  token?: string
  fileName?: string
  fileSizeBytes?: number
  extension?: string
  expiresAtMs?: number
  error?: string
}

// ── Communications: Messaging ──
export interface SMSOptions {
  to: string
  message: string
  recipientId?: number
  recipientType?: string
  userId: number
}

export interface EmailOptions {
  to: string
  subject: string
  body: string
  recipientId?: number
  recipientType?: string
  userId: number
}

export interface MessageTemplateInput {
  id?: number
  template_name: string
  template_type: 'SMS' | 'EMAIL'
  subject?: string
  body: string
  placeholders?: string
}

// ── Communications: Notifications ──
export interface NotificationRequest {
  recipientType: 'STUDENT' | 'STAFF' | 'GUARDIAN'
  recipientId: number
  channel: 'SMS' | 'EMAIL'
  to: string
  subject?: string
  message: string
}

export interface DefaulterEntry {
  student_id: number
  student_name: string
  guardian_name: string
  guardian_phone: string
  admission_number: string
  class_name: string
  balance: number
}

export interface NotificationTemplateInput {
  template_name: string
  template_type: 'SMS' | 'EMAIL'
  category: 'ACADEMIC' | 'FINANCE' | 'ADMIN' | 'FEE_REMINDER' | 'PAYMENT_RECEIPT' | 'ATTENDANCE' | 'GENERAL' | 'PAYSLIP'
  subject?: string
  body: string
}

export interface NotificationHistoryFilters {
  recipientType?: string
  recipientId?: number
  channel?: string
  status?: string
  startDate?: string
  endDate?: string
}

// ── Finance: Assets ──
export interface AssetCreateData {
  asset_name: string
  asset_code?: string
  category_id: number
  acquisition_date: string
  acquisition_cost: number
  accumulated_depreciation?: number
  location?: string
  description?: string
  serial_number?: string
  supplier_id?: number
  warranty_expiry?: string
}

export interface AssetUpdateData extends Partial<AssetCreateData> {
  status?: 'ACTIVE' | 'DISPOSED' | 'WRITTEN_OFF' | 'TRANSFERRED'
}

export interface AssetFilters {
  category_id?: number
  status?: 'ACTIVE' | 'DISPOSED' | 'WRITTEN_OFF' | 'TRANSFERRED'
  search?: string
}

export interface GLAccountData {
  account_code: string
  account_name: string
  account_type: string
  parent_id?: number
  description?: string
  is_active?: boolean
}

export interface ExemptionCreateData {
  student_id: number
  academic_year_id: number
  term_id: number | undefined
  fee_category_id: number | undefined
  exemption_type: 'FULL' | 'PARTIAL' | 'PERCENTAGE'
  amount?: number | undefined
  percentage?: number | undefined
  reason: string
  notes?: string | undefined
}

// ── Finance: Export ──
export interface ExportPDFData {
  title: string
  content: string
  orientation?: 'portrait' | 'landscape'
}

// ── Operations ──
export interface BoardingExpenseData {
  facility_id: number
  gl_account_code: string
  fiscal_year: number
  term: number
  amount_cents: number
  expense_type: 'FOOD' | 'UTILITIES' | 'BEDDING' | 'STAFF' | 'MAINTENANCE' | 'OTHER'
  description: string
  recorded_by: number
}

export interface TransportRouteData {
  route_name: string
  distance_km: number
  estimated_students: number
  budget_per_term_cents: number
  driver_id?: number
  vehicle_registration?: string
}

export interface TransportExpenseData {
  route_id: number
  gl_account_code: string
  fiscal_year: number
  term: number
  amount_cents: number
  expense_type: 'FUEL' | 'MAINTENANCE' | 'INSURANCE' | 'PERMITS' | 'DRIVER_SALARY' | 'OTHER'
  description: string
  recorded_by: number
}

// ── Auth ──
export interface SessionData {
  user: { id: number; username: string; full_name: string; role: string }
  lastActivity: number
}

// ── System ──
export interface ErrorLogData {
  error: string
  stack?: string | undefined
  componentStack?: string | undefined
  timestamp: string
}

// ── Updates ──
export interface UpdateStatusData {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  progress?: number
  error?: string
}
