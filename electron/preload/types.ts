/**
 * Preload API input parameter types.
 *
 * These define the shape of data SENT from renderer → main process via IPC.
 * The renderer types in src/types/electron-api/ define RETURN types (main → renderer).
 * These two sets are complementary, not duplicates.
 */

// ── Students ──
export interface StudentData {
  admission_number?: string
  first_name?: string
  middle_name?: string
  last_name?: string
  email?: string
  phone?: string
  date_of_birth?: string
  gender?: 'MALE' | 'FEMALE'
  address?: string
  guardian_name?: string
  guardian_phone?: string
  guardian_email?: string
  guardian_relationship?: string
  notes?: string
  stream_id?: number
  student_type?: 'BOARDER' | 'DAY_SCHOLAR'
  admission_date?: string
  is_active?: boolean
}

export interface StudentFilters {
  stream_id?: number
  is_active?: boolean
  search?: string
}

// ── Staff ──
export interface StaffData {
  staff_number?: string
  first_name?: string
  middle_name?: string
  last_name?: string
  id_number?: string
  kra_pin?: string
  nhif_number?: string
  nssf_number?: string
  phone?: string
  email?: string
  bank_name?: string
  bank_account?: string
  department?: string
  job_title?: string
  employment_date?: string
  basic_salary?: number
  is_active?: boolean
}

// ── Finance: Payments ──
export interface PaymentRecordData {
  student_id: number
  amount: number
  payment_method: string
  payment_reference?: string
  description?: string
  transaction_date: string
  term_id: number
  invoice_id?: number
  amount_in_words?: string
  idempotency_key?: string
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
  payment_reference?: string
  description?: string
}

export interface TransactionFilters {
  startDate?: string
  endDate?: string
  type?: string
}

// ── Finance: Scholarships ──
export interface ScholarshipCreateData {
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
  description?: string
  line_items?: Array<{
    gl_account_code: string
    allocated_amount: number
    description?: string
  }>
}

export interface BudgetFilters {
  fiscal_year?: number
  status?: string
}

// ── Settings ──
export interface SettingsData {
  school_name?: string
  school_motto?: string
  school_address?: string
  school_phone?: string
  school_email?: string
  principal_name?: string
  logo_path?: string
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
  current_stock?: number
  reorder_level?: number
  unit_cost?: number
}

export interface StockMovementData {
  item_id: number
  movement_type: 'IN' | 'OUT' | 'ADJUSTMENT'
  quantity: number
  unit_cost?: number
  total_cost?: number
  description?: string
  movement_date: string
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
  is_compulsory?: boolean
  is_active?: boolean
}

export interface AcademicExamData {
  name: string
  academic_year_id: number
  term_id: number
  weight?: number
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
  streamId?: number
  academicYearId?: number
  termId?: number
}

export interface PerformanceFilters {
  academicYearId: number
  termId: number
  streamId?: number
  examId?: number
}

export interface BatchReportCardData {
  exam_id: number
  stream_id: number
  template_id?: string
  include_sms?: boolean
  output_path?: string
  merge?: boolean
}

export interface AwardData {
  student_id: number
  category_id: number
  title: string
  description?: string
  academic_year_id: number
  term_id: number
  awarded_by: number
}

export interface AwardActionData {
  id: number
  userId: number
}

export interface AwardFilters {
  academicYearId?: number
  termId?: number
  categoryId?: number
  studentId?: number
}

export interface ExamTimetableConfig {
  academicYearId: number
  termId: number
  startDate: string
  endDate: string
}

export interface ExamFilters {
  academicYearId?: number
  termId?: number
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
  endDate?: string
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
  entityType: string
  mapping?: Record<string, string>
  skipHeader?: boolean
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
  category: string
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
  category: string
  purchase_date: string
  purchase_cost: number
  useful_life_years: number
  salvage_value?: number
  location?: string
  description?: string
  status?: string
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
  term_id: number
  fee_category_id: number
  exemption_type: 'FULL' | 'PARTIAL' | 'PERCENTAGE'
  amount?: number
  percentage?: number
  reason: string
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

// ── Updates ──
export interface UpdateStatusData {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  progress?: number
  error?: string
}
