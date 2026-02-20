import { z } from 'zod'

// Common validation schemas
export const IdSchema = z.number().int().positive().refine((val) => val <= 2147483647, {
    message: 'ID must be 2,147,483,647 or less'
  })

export const PaginationSchema = z.object({
  page: z.number().int().refine((val) => val >= 1, {
    message: 'Page must be 1 or greater'
  }).default(1),
  limit: z.number().int().refine((val) => val >= 1 && val <= 100, {
    message: 'Limit must be between 1 and 100'
  }).default(20),
  search: z.string().optional(),
})

export const DateRangeSchema = z.object({
  startDate: z.string().refine((val) => /^\d{4}-\d{2}-\d{2}$/.test(val), {
    message: 'Date must be in YYYY-MM-DD format'
  }),
  endDate: z.string().refine((val) => /^\d{4}-\d{2}-\d{2}$/.test(val), {
    message: 'Date must be in YYYY-MM-DD format'
  }),
})

// Student validation schemas
export const StudentCreateSchema = z.object({
  admission_number: z.string().refine((val) => val.length >= 1 && val.length <= 50, {
    message: 'Admission number must be between 1 and 50 characters'
  }),
  first_name: z.string().refine((val) => val.length >= 1 && val.length <= 100, {
    message: 'First name must be between 1 and 100 characters'
  }),
  last_name: z.string().refine((val) => val.length >= 1 && val.length <= 100, {
    message: 'Last name must be between 1 and 100 characters'
  }),
  gender: z.enum(['MALE', 'FEMALE']),
  date_of_birth: z.string().refine((val) => /^\d{4}-\d{2}-\d{2}$/.test(val), {
    message: 'Date must be in YYYY-MM-DD format'
  }),
  class_id: IdSchema,
  stream_id: IdSchema.optional(),
  guardian_name: z.string().refine((val) => val.length >= 1 && val.length <= 200, {
    message: 'Guardian name must be between 1 and 200 characters'
  }),
  guardian_phone: z.string().refine((val) => /^\+?[1-9]\d{1,14}$/.test(val), {
    message: 'Phone number must be valid international format'
  }),
  guardian_email: z.email().optional(),
  address: z.string().refine((val) => val.length <= 500, {
    message: 'Address must be 500 characters or less'
  }).optional(),
  enrollment_date: z.string().refine((val) => /^\d{4}-\d{2}-\d{2}$/.test(val), {
    message: 'Date must be in YYYY-MM-DD format'
  }),
})

export const StudentUpdateSchema = z.object({
  id: IdSchema,
  first_name: z.string().refine((val) => val.length >= 1 && val.length <= 100, {
    message: 'First name must be between 1 and 100 characters'
  }).optional(),
  last_name: z.string().refine((val) => val.length >= 1 && val.length <= 100, {
    message: 'Last name must be between 1 and 100 characters'
  }).optional(),
  gender: z.enum(['MALE', 'FEMALE']).optional(),
  date_of_birth: z.string().refine((val) => /^\d{4}-\d{2}-\d{2}$/.test(val), {
    message: 'Date must be in YYYY-MM-DD format'
  }).optional(),
  class_id: IdSchema.optional(),
  stream_id: IdSchema.optional(),
  guardian_name: z.string().refine((val) => val.length >= 1 && val.length <= 200, {
    message: 'Guardian name must be between 1 and 200 characters'
  }).optional(),
  guardian_phone: z.string().refine((val) => /^\+?[1-9]\d{1,14}$/.test(val), {
    message: 'Phone number must be valid international format'
  }).optional(),
  guardian_email: z.email().optional(),
  address: z.string().refine((val) => val.length <= 500, {
    message: 'Address must be 500 characters or less'
  }).optional(),
  is_active: z.boolean().optional(),
})

// Staff validation schemas
export const StaffCreateSchema = z.object({
  employee_id: z.string().refine((val) => val.length >= 1 && val.length <= 50, {
    message: 'Employee ID must be between 1 and 50 characters'
  }),
  first_name: z.string().refine((val) => val.length >= 1 && val.length <= 100, {
    message: 'First name must be between 1 and 100 characters'
  }),
  last_name: z.string().refine((val) => val.length >= 1 && val.length <= 100, {
    message: 'Last name must be between 1 and 100 characters'
  }),
  gender: z.enum(['MALE', 'FEMALE']),
  date_of_birth: z.string().refine((val) => /^\d{4}-\d{2}-\d{2}$/.test(val), {
    message: 'Date must be in YYYY-MM-DD format'
  }),
  phone: z.string().refine((val) => /^\+?[1-9]\d{1,14}$/.test(val), {
    message: 'Phone number must be valid international format'
  }),
  email: z.email(),
  role: z.enum(['ADMIN', 'PRINCIPAL', 'DEPUTY_PRINCIPAL', 'ACCOUNTS_CLERK', 'AUDITOR', 'TEACHER']),
  department: z.string().refine((val) => val.length >= 1 && val.length <= 100, {
    message: 'Department must be between 1 and 100 characters'
  }),
  hire_date: z.string().refine((val) => /^\d{4}-\d{2}-\d{2}$/.test(val), {
    message: 'Date must be in YYYY-MM-DD format'
  }),
  salary: z.number().positive().refine((val) => val <= 1000000, {
    message: 'Salary must be 1,000,000 or less'
  }),
  bank_account: z.string().refine((val) => val.length >= 1 && val.length <= 50, {
    message: 'Bank account must be between 1 and 50 characters'
  }),
  bank_name: z.string().refine((val) => val.length >= 1 && val.length <= 100, {
    message: 'Bank name must be between 1 and 100 characters'
  }),
  kra_pin: z.string().refine((val) => /^[A-Z]\d{8}[A-Z]$/.test(val), {
    message: 'KRA PIN must be in format A12345678Z'
  }).optional(),
  nhif_number: z.string().refine((val) => /^\d{8,9}$/.test(val), {
    message: 'NHIF number must be 8-9 digits'
  }).optional(),
  nssf_number: z.string().refine((val) => /^\d{8,10}$/.test(val), {
    message: 'NSSF number must be 8-10 digits'
  }).optional(),
})

export const StaffUpdateSchema = z.object({
  id: IdSchema,
  first_name: z.string().refine((val) => val.length >= 1 && val.length <= 100, {
    message: 'First name must be between 1 and 100 characters'
  }).optional(),
  last_name: z.string().refine((val) => val.length >= 1 && val.length <= 100, {
    message: 'Last name must be between 1 and 100 characters'
  }).optional(),
  phone: z.string().refine((val) => /^\+?[1-9]\d{1,14}$/.test(val), {
    message: 'Phone number must be valid international format'
  }).optional(),
  email: z.email().optional(),
  role: z.enum(['ADMIN', 'PRINCIPAL', 'DEPUTY_PRINCIPAL', 'ACCOUNTS_CLERK', 'AUDITOR', 'TEACHER']).optional(),
  department: z.string().refine((val) => val.length >= 1 && val.length <= 100, {
    message: 'Department must be between 1 and 100 characters'
  }).optional(),
  salary: z.number().positive().refine((val) => val <= 1000000, {
    message: 'Salary must be 1,000,000 or less'
  }).optional(),
  bank_account: z.string().refine((val) => val.length >= 1 && val.length <= 50, {
    message: 'Bank account must be between 1 and 50 characters'
  }).optional(),
  bank_name: z.string().refine((val) => val.length >= 1 && val.length <= 100, {
    message: 'Bank name must be between 1 and 100 characters'
  }).optional(),
  kra_pin: z.string().refine((val) => /^[A-Z]\d{8}[A-Z]$/.test(val), {
    message: 'KRA PIN must be in format A12345678Z'
  }).optional(),
  nhif_number: z.string().refine((val) => /^\d{8,9}$/.test(val), {
    message: 'NHIF number must be 8-9 digits'
  }).optional(),
  nssf_number: z.string().refine((val) => /^\d{8,10}$/.test(val), {
    message: 'NSSF number must be 8-10 digits'
  }).optional(),
  is_active: z.boolean().optional(),
})

// Academic validation schemas
export const ExamCreateSchema = z.object({
  name: z.string().refine((val) => val.length >= 1 && val.length <= 200, {
    message: 'Exam name must be between 1 and 200 characters'
  }),
  class_id: IdSchema,
  term_id: IdSchema,
  exam_type: z.enum(['FORMATIVE', 'SUMMATIVE', 'PRACTICAL', 'PROJECT']),
  start_date: z.string().refine((val) => /^\d{4}-\d{2}-\d{2}$/.test(val), {
    message: 'Date must be in YYYY-MM-DD format'
  }),
  end_date: z.string().refine((val) => /^\d{4}-\d{2}-\d{2}$/.test(val), {
    message: 'Date must be in YYYY-MM-DD format'
  }),
  max_marks: z.number().int().positive().refine((val) => val <= 1000, {
    message: 'Maximum marks must be 1000 or less'
  }),
  passing_marks: z.number().int().positive().refine((val) => val <= 1000, {
    message: 'Passing marks must be 1000 or less'
  }),
})

export const GradeEntrySchema = z.object({
  exam_id: IdSchema,
  student_id: IdSchema,
  subject_id: IdSchema,
  marks_obtained: z.number().refine((val) => val >= 0 && val <= 1000, {
    message: 'Marks must be between 0 and 1000'
  }),
  remarks: z.string().refine((val) => val.length <= 500, {
    message: 'Remarks must be 500 characters or less'
  }).optional(),
})

// Finance validation schemas
export const PaymentCreateSchema = z.object({
  student_id: IdSchema,
  amount: z.number().positive().refine((val) => val <= 1000000, {
    message: 'Amount must be 1,000,000 or less'
  }),
  payment_method: z.enum(['CASH', 'BANK_DEPOSIT', 'MOBILE_MONEY', 'CHEQUE', 'BANK_TRANSFER']),
  transaction_date: z.string().refine((val) => /^\d{4}-\d{2}-\d{2}$/.test(val), {
    message: 'Date must be in YYYY-MM-DD format'
  }),
  payment_reference: z.string().refine((val) => val.length <= 100, {
    message: 'Payment reference must be 100 characters or less'
  }).optional(),
  description: z.string().refine((val) => val.length <= 500, {
    message: 'Description must be 500 characters or less'
  }).optional(),
  fee_structure_id: IdSchema.optional(),
  idempotency_key: z.string().refine((val) => val.length <= 128, {
    message: 'Idempotency key must be 128 characters or less'
  }).optional(),
})

export const InvoiceCreateSchema = z.object({
  student_id: IdSchema,
  fee_structure_id: IdSchema,
  term_id: IdSchema,
  due_date: z.string().refine((val) => /^\d{4}-\d{2}-\d{2}$/.test(val), {
    message: 'Date must be in YYYY-MM-DD format'
  }),
  description: z.string().refine((val) => val.length <= 500, {
    message: 'Description must be 500 characters or less'
  }).optional(),
})

// Settings validation schemas
export const SystemSettingsSchema = z.object({
  school_name: z.string().refine((val) => val.length >= 1 && val.length <= 200, {
    message: 'School name must be between 1 and 200 characters'
  }),
  school_address: z.string().refine((val) => val.length <= 500, {
    message: 'School address must be 500 characters or less'
  }),
  school_phone: z.string().refine((val) => /^\+?[1-9]\d{1,14}$/.test(val), {
    message: 'Phone number must be valid international format'
  }),
  school_email: z.email(),
  currency: z.string().refine((val) => val.length === 3, {
    message: 'Currency must be exactly 3 characters'
  }),
  academic_year: z.string().refine((val) => /^\d{4}-\d{4}$/.test(val), {
    message: 'Academic year must be in YYYY-YYYY format'
  }),
  current_term: z.enum(['TERM_1', 'TERM_2', 'TERM_3']),
})

// Report validation schemas
export const ReportGenerationSchema = z.object({
  report_type: z.enum(['STUDENT_LEDGER', 'CLASS_PERFORMANCE', 'FINANCIAL_SUMMARY', 'ATTENDANCE_REPORT', 'PAYROLL_SUMMARY']),
  parameters: z.record(z.string(), z.unknown()),
  format: z.enum(['PDF', 'EXCEL', 'CSV']),
  date_range: DateRangeSchema.optional(),
})

// Message validation schemas
export const MessageCreateSchema = z.object({
  recipient_type: z.enum(['ALL_STUDENTS', 'ALL_STAFF', 'SPECIFIC_CLASS', 'INDIVIDUAL']),
  recipient_ids: z.array(IdSchema).optional(),
  subject: z.string().refine((val) => val.length >= 1 && val.length <= 200, {
    message: 'Subject must be between 1 and 200 characters'
  }),
  message: z.string().refine((val) => val.length >= 1 && val.length <= 2000, {
    message: 'Message must be between 1 and 2000 characters'
  }),
  delivery_method: z.enum(['SMS', 'EMAIL', 'BOTH']),
  send_immediately: z.boolean().default(true),
  scheduled_at: z.string().refine((val) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(val), {
    message: 'Scheduled datetime must be in YYYY-MM-DDTHH:MM:SS format'
  }).optional(),
})
