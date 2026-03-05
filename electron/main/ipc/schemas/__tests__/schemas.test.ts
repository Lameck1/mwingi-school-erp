/**
 * Consolidated tests for all Zod schema files in electron/main/ipc/schemas/
 *
 * Covers: academic-schemas, common-schemas, finance-transaction-schemas,
 * operations-schemas, reports-schemas.
 *
 * Each schema tested with valid input, invalid input, and edge cases.
 */
import { describe, it, expect } from 'vitest'

// ===== Academic Schemas =====
import {
  AcademicYearCreateSchema,
  AcademicYearActivateSchema,
  SubjectCreateSchema,
  SubjectUpdateDataSchema,
  SubjectSetActiveSchema,
  GetExamsSchema,
  CreateExamSchema,
  DeleteExamSchema,
  AllocateTeacherSchema,
  GetAllocationsSchema,
  ExamResultItemSchema,
  SaveResultsSchema,
  GetResultsSchema,
  AttendanceGetByDateSchema,
  DailyAttendanceEntrySchema,
  MarkAttendanceSchema,
  AwardAssignSchema,
  AwardRejectSchema,
  JssTransitionSchema,
  JssBulkTransitionSchema,
  MeritListGenerateSchema,
  CbcRecordExpenseSchema,
  PromotionStudentSchema,
  ReportCardGenerateBatchSchema,
  ScheduleExportPdfSchema,
} from '../academic-schemas'

// ===== Common Schemas =====
import {
  IdSchema,
  PaginationSchema,
  DateRangeSchema,
  StudentCreateSchema,
  StudentUpdateSchema,
  StaffCreateSchema,
  ExamCreateSchema,
  GradeEntrySchema,
  PaymentCreateSchema,
  InvoiceCreateSchema,
  SystemSettingsSchema,
  ReportGenerationSchema,
  MessageCreateSchema,
} from '../common-schemas'

// ===== Finance Transaction Schemas =====
import {
  InvoiceItemSchema,
  InvoiceDataSchema,
  FeeStructureItemSchema,
  PaymentDataSchema,
  RecordPaymentTuple,
  PayWithCreditDataSchema,
  VoidPaymentTuple,
  AddCreditTuple,
  CalculateProratedFeeTuple,
  ScholarshipDataSchema,
  ScholarshipAllocationSchema,
} from '../finance-transaction-schemas'

// ===== Operations Schemas =====
import {
  BoardingExpenseSchema,
  TransportExpenseSchema,
  TransportRouteSchema,
  GetExpensesTuple,
  GrantCreateSchema,
  GrantUtilizationSchema,
  CostCalculateTuple,
} from '../operations-schemas'

// ===== Reports Schemas =====
import {
  ReportDateRangeSchema,
  StudentLedgerSchema,
  ReportPeriodSchema,
  ReportAsOfDateSchema,
  NEMISExportConfigSchema,
  NEMISStudentSchema,
  ScheduledReportSchema,
  ScheduledReportInputSchema,
} from '../reports-schemas'

// =========================================================================
//  ACADEMIC SCHEMAS
// =========================================================================
describe('Academic Schemas', () => {
  describe('AcademicYearCreateSchema', () => {
    const valid = { year_name: '2025', start_date: '2025-01-01', end_date: '2025-12-31' }

    it('accepts valid input', () => {
      expect(AcademicYearCreateSchema.parse(valid)).toMatchObject(valid)
    })

    it('accepts with optional is_current', () => {
      expect(AcademicYearCreateSchema.parse({ ...valid, is_current: true }).is_current).toBe(true)
    })

    it('rejects empty year_name', () => {
      expect(() => AcademicYearCreateSchema.parse({ ...valid, year_name: '' })).toThrow()
    })

    it('rejects missing start_date', () => {
      expect(() => AcademicYearCreateSchema.parse({ year_name: '2025', end_date: '2025-12-31' })).toThrow()
    })

    it('rejects missing end_date', () => {
      expect(() => AcademicYearCreateSchema.parse({ year_name: '2025', start_date: '2025-01-01' })).toThrow()
    })
  })

  describe('AcademicYearActivateSchema', () => {
    it('accepts [number]', () => {
      expect(AcademicYearActivateSchema.parse([5])).toEqual([5])
    })
    it('rejects [string]', () => {
      expect(() => AcademicYearActivateSchema.parse(['five'])).toThrow()
    })
    it('rejects empty tuple', () => {
      expect(() => AcademicYearActivateSchema.parse([])).toThrow()
    })
  })

  describe('SubjectCreateSchema', () => {
    const valid = { code: 'MATH', name: 'Mathematics', curriculum: 'CBC' }

    it('accepts valid input', () => {
      expect(SubjectCreateSchema.parse(valid)).toMatchObject(valid)
    })

    it('rejects empty code', () => {
      expect(() => SubjectCreateSchema.parse({ ...valid, code: '' })).toThrow()
    })

    it('rejects empty name', () => {
      expect(() => SubjectCreateSchema.parse({ ...valid, name: '' })).toThrow()
    })

    it('rejects empty curriculum', () => {
      expect(() => SubjectCreateSchema.parse({ ...valid, curriculum: '' })).toThrow()
    })

    it('accepts optional booleans', () => {
      const result = SubjectCreateSchema.parse({ ...valid, is_compulsory: true, is_active: false })
      expect(result.is_compulsory).toBe(true)
      expect(result.is_active).toBe(false)
    })
  })

  describe('SubjectUpdateDataSchema', () => {
    it('accepts empty object (all optional)', () => {
      expect(SubjectUpdateDataSchema.parse({})).toEqual({})
    })

    it('accepts partial update', () => {
      expect(SubjectUpdateDataSchema.parse({ name: 'New Name' })).toMatchObject({ name: 'New Name' })
    })
  })

  describe('SubjectSetActiveSchema', () => {
    it('accepts [number, boolean]', () => {
      expect(SubjectSetActiveSchema.parse([5, true])).toEqual([5, true])
    })
    it('rejects wrong types', () => {
      expect(() => SubjectSetActiveSchema.parse(['a', 'b'])).toThrow()
    })
  })

  describe('GetExamsSchema / DeleteExamSchema', () => {
    it('GetExamsSchema accepts [yearId, termId]', () => {
      expect(GetExamsSchema.parse([1, 2])).toEqual([1, 2])
    })
    it('DeleteExamSchema accepts [id]', () => {
      expect(DeleteExamSchema.parse([10])).toEqual([10])
    })
  })

  describe('CreateExamSchema', () => {
    const valid = { academic_year_id: 1, term_id: 2, name: 'Final Exam' }

    it('accepts valid input', () => {
      expect(CreateExamSchema.parse(valid)).toMatchObject(valid)
    })

    it('accepts with optional weight', () => {
      expect(CreateExamSchema.parse({ ...valid, weight: 0.4 }).weight).toBe(0.4)
    })

    it('rejects empty name', () => {
      expect(() => CreateExamSchema.parse({ ...valid, name: '' })).toThrow()
    })
  })

  describe('AllocateTeacherSchema', () => {
    it('accepts valid allocation', () => {
      const valid = { academic_year_id: 1, term_id: 2, stream_id: 3, subject_id: 4, teacher_id: 5 }
      expect(AllocateTeacherSchema.parse(valid)).toMatchObject(valid)
    })
    it('rejects missing teacher_id', () => {
      expect(() => AllocateTeacherSchema.parse({ academic_year_id: 1, term_id: 2, stream_id: 3, subject_id: 4 })).toThrow()
    })
  })

  describe('GetAllocationsSchema', () => {
    it('accepts [year, term]', () => {
      expect(GetAllocationsSchema.parse([1, 2])).toEqual([1, 2])
    })
    it('accepts [year, term, stream]', () => {
      expect(GetAllocationsSchema.parse([1, 2, 3])).toEqual([1, 2, 3])
    })
  })

  describe('ExamResultItemSchema', () => {
    it('accepts a valid result item', () => {
      const item = { student_id: 1, subject_id: 2, score: 85, competency_level: 4, teacher_remarks: 'Good' }
      expect(ExamResultItemSchema.parse(item)).toMatchObject(item)
    })

    it('accepts null score and competency_level', () => {
      const item = { student_id: 1, subject_id: 2, score: null, competency_level: null, teacher_remarks: null }
      expect(ExamResultItemSchema.parse(item).score).toBeNull()
    })

    it('rejects missing student_id', () => {
      expect(() => ExamResultItemSchema.parse({ subject_id: 2, score: 85, competency_level: 4, teacher_remarks: '' })).toThrow()
    })
  })

  describe('SaveResultsSchema', () => {
    it('accepts [examId, results[]]', () => {
      const results = [{ student_id: 1, subject_id: 2, score: 90, competency_level: 5, teacher_remarks: null }]
      expect(SaveResultsSchema.parse([1, results])).toBeDefined()
    })
    it('accepts empty results array', () => {
      expect(SaveResultsSchema.parse([1, []])).toBeDefined()
    })
  })

  describe('GetResultsSchema', () => {
    it('accepts [examId, subjectId, streamId]', () => {
      expect(GetResultsSchema.parse([1, 2, 3])).toEqual([1, 2, 3])
    })
  })

  describe('AttendanceGetByDateSchema', () => {
    it('accepts [streamId, date, yearId, termId]', () => {
      expect(AttendanceGetByDateSchema.parse([1, '2024-05-01', 2, 3])).toEqual([1, '2024-05-01', 2, 3])
    })
    it('rejects non-string date', () => {
      expect(() => AttendanceGetByDateSchema.parse([1, 20240501, 2, 3])).toThrow()
    })
  })

  describe('DailyAttendanceEntrySchema', () => {
    it('accepts valid entry', () => {
      expect(DailyAttendanceEntrySchema.parse({ student_id: 1, status: 'PRESENT' })).toBeDefined()
    })
    it('accepts all valid statuses', () => {
      for (const status of ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']) {
        expect(DailyAttendanceEntrySchema.parse({ student_id: 1, status })).toBeDefined()
      }
    })
    it('rejects invalid status', () => {
      expect(() => DailyAttendanceEntrySchema.parse({ student_id: 1, status: 'UNKNOWN' })).toThrow()
    })
  })

  describe('MarkAttendanceSchema', () => {
    it('accepts valid attendance mark', () => {
      const entries = [{ student_id: 1, status: 'PRESENT' }]
      expect(MarkAttendanceSchema.parse([entries, 1, '2024-05-01', 2, 3])).toBeDefined()
    })
    it('accepts with optional userId', () => {
      const entries = [{ student_id: 1, status: 'ABSENT' }]
      expect(MarkAttendanceSchema.parse([entries, 1, '2024-05-01', 2, 3, 99])).toBeDefined()
    })
  })

  describe('AwardAssignSchema', () => {
    it('accepts valid award', () => {
      expect(AwardAssignSchema.parse({ studentId: 1, categoryId: 2, academicYearId: 3 })).toBeDefined()
    })
    it('rejects missing studentId', () => {
      expect(() => AwardAssignSchema.parse({ categoryId: 2, academicYearId: 3 })).toThrow()
    })
  })

  describe('AwardRejectSchema', () => {
    it('requires reason', () => {
      expect(AwardRejectSchema.parse({ awardId: 1, reason: 'Not eligible' })).toBeDefined()
    })
    it('rejects missing reason', () => {
      expect(() => AwardRejectSchema.parse({ awardId: 1 })).toThrow()
    })
  })

  describe('JssTransitionSchema', () => {
    const valid = { student_id: 1, from_grade: 6, to_grade: 7, transition_date: '2024-12-15', processed_by: 1 }

    it('accepts valid transition', () => {
      expect(JssTransitionSchema.parse(valid)).toMatchObject(valid)
    })

    it('rejects missing student_id', () => {
      expect(() => JssTransitionSchema.parse({ from_grade: 6, to_grade: 7, transition_date: '2024-12-15', processed_by: 1 })).toThrow()
    })
  })

  describe('JssBulkTransitionSchema', () => {
    it('accepts valid bulk transition', () => {
      const valid = { student_ids: [1, 2, 3], from_grade: 6, to_grade: 7, transition_date: '2024-12-15', processed_by: 1 }
      expect(JssBulkTransitionSchema.parse(valid)).toMatchObject(valid)
    })

    it('accepts empty student_ids (schema has no min constraint)', () => {
      const result = JssBulkTransitionSchema.parse({ student_ids: [], from_grade: 6, to_grade: 7, transition_date: '2024-12-15', processed_by: 1 })
      expect(result.student_ids).toEqual([])
    })
  })

  describe('MeritListGenerateSchema', () => {
    it('accepts valid input', () => {
      expect(MeritListGenerateSchema.parse({ academicYearId: 1, termId: 2, streamId: 3 })).toBeDefined()
    })
    it('rejects missing field', () => {
      expect(() => MeritListGenerateSchema.parse({ academicYearId: 1, termId: 2 })).toThrow()
    })
  })

  describe('CbcRecordExpenseSchema', () => {
    const valid = {
      strand_id: 1, expense_date: '2024-06-15', description: 'Materials', gl_account_code: '4000',
      amount_cents: 50000, term: 1, fiscal_year: 2024, created_by: 1,
    }
    it('accepts valid input', () => {
      expect(CbcRecordExpenseSchema.parse(valid)).toMatchObject(valid)
    })
    it('accepts negative amount_cents (schema has no min constraint)', () => {
      const result = CbcRecordExpenseSchema.parse({ ...valid, amount_cents: -100 })
      expect(result.amount_cents).toBe(-100)
    })
    it('accepts empty description (schema has no min constraint)', () => {
      const result = CbcRecordExpenseSchema.parse({ ...valid, description: '' })
      expect(result.description).toBe('')
    })
  })

  describe('PromotionStudentSchema', () => {
    const valid = { student_id: 1, from_stream_id: 2, to_stream_id: 3, from_academic_year_id: 1, to_academic_year_id: 2, to_term_id: 1 }
    it('accepts valid', () => {
      expect(PromotionStudentSchema.parse(valid)).toMatchObject(valid)
    })
    it('rejects missing student_id', () => {
      expect(() => PromotionStudentSchema.parse({ from_stream_id: 2, to_stream_id: 3, from_academic_year_id: 1, to_academic_year_id: 2, to_term_id: 1 })).toThrow()
    })
  })

  describe('ReportCardGenerateBatchSchema', () => {
    it('accepts valid', () => {
      expect(ReportCardGenerateBatchSchema.parse({ exam_id: 1, stream_id: 2 })).toBeDefined()
    })
    it('rejects missing exam_id', () => {
      expect(() => ReportCardGenerateBatchSchema.parse({ stream_id: 2 })).toThrow()
    })
  })

  describe('ScheduleExportPdfSchema', () => {
    it('accepts valid config with slots', () => {
      const valid = {
        examId: 1,
        title: 'Exam Schedule',
        slots: [{
          id: 1, subject_id: 1, subject_name: 'Math', start_date: '2024-06-01', end_date: '2024-06-01',
          start_time: '08:00', end_time: '10:00', venue_id: 1, venue_name: 'Hall A', max_capacity: 50, enrolled_students: 30,
        }],
      }
      expect(ScheduleExportPdfSchema.parse(valid)).toBeDefined()
    })
    it('rejects empty slots', () => {
      expect(() => ScheduleExportPdfSchema.parse({ slots: [] })).toThrow()
    })
  })
})

// =========================================================================
//  COMMON SCHEMAS
// =========================================================================
describe('Common Schemas', () => {
  describe('IdSchema', () => {
    it('accepts positive integer', () => {
      expect(IdSchema.parse(1)).toBe(1)
    })
    it('accepts max int', () => {
      expect(IdSchema.parse(2147483647)).toBe(2147483647)
    })
    it('rejects 0', () => {
      expect(() => IdSchema.parse(0)).toThrow()
    })
    it('rejects negative', () => {
      expect(() => IdSchema.parse(-5)).toThrow()
    })
    it('rejects float', () => {
      expect(() => IdSchema.parse(1.5)).toThrow()
    })
    it('rejects over max', () => {
      expect(() => IdSchema.parse(2147483648)).toThrow()
    })
  })

  describe('PaginationSchema', () => {
    it('uses defaults', () => {
      const result = PaginationSchema.parse({})
      expect(result.page).toBe(1)
      expect(result.limit).toBe(20)
    })
    it('accepts valid input', () => {
      expect(PaginationSchema.parse({ page: 3, limit: 50 })).toMatchObject({ page: 3, limit: 50 })
    })
    it('rejects page 0', () => {
      expect(() => PaginationSchema.parse({ page: 0 })).toThrow()
    })
    it('rejects limit > 100', () => {
      expect(() => PaginationSchema.parse({ limit: 101 })).toThrow()
    })
    it('rejects limit 0', () => {
      expect(() => PaginationSchema.parse({ limit: 0 })).toThrow()
    })
    it('accepts optional search', () => {
      expect(PaginationSchema.parse({ search: 'test' }).search).toBe('test')
    })
  })

  describe('DateRangeSchema', () => {
    it('accepts valid date range', () => {
      expect(DateRangeSchema.parse({ startDate: '2024-01-01', endDate: '2024-12-31' })).toBeDefined()
    })
    it('rejects invalid date format', () => {
      expect(() => DateRangeSchema.parse({ startDate: '01-01-2024', endDate: '2024-12-31' })).toThrow()
    })
    it('rejects empty strings', () => {
      expect(() => DateRangeSchema.parse({ startDate: '', endDate: '' })).toThrow()
    })
  })

  describe('StudentCreateSchema', () => {
    const valid = {
      admission_number: 'A001',
      first_name: 'John',
      last_name: 'Doe',
      gender: 'MALE',
      date_of_birth: '2010-05-15',
      class_id: 1,
      guardian_name: 'Jane Doe',
      guardian_phone: '+254700000000',
      enrollment_date: '2024-01-15',
    }

    it('accepts valid student', () => {
      expect(StudentCreateSchema.parse(valid)).toBeDefined()
    })

    it('rejects empty admission_number', () => {
      expect(() => StudentCreateSchema.parse({ ...valid, admission_number: '' })).toThrow()
    })

    it('rejects invalid gender', () => {
      expect(() => StudentCreateSchema.parse({ ...valid, gender: 'OTHER' })).toThrow()
    })

    it('rejects invalid date format', () => {
      expect(() => StudentCreateSchema.parse({ ...valid, date_of_birth: '15-05-2010' })).toThrow()
    })

    it('rejects invalid phone', () => {
      expect(() => StudentCreateSchema.parse({ ...valid, guardian_phone: 'abc' })).toThrow()
    })

    it('rejects long admission_number (>50)', () => {
      expect(() => StudentCreateSchema.parse({ ...valid, admission_number: 'A'.repeat(51) })).toThrow()
    })
  })

  describe('StudentUpdateSchema', () => {
    it('requires id', () => {
      expect(StudentUpdateSchema.parse({ id: 1 })).toBeDefined()
    })
    it('rejects id = 0', () => {
      expect(() => StudentUpdateSchema.parse({ id: 0 })).toThrow()
    })
    it('accepts partial updates', () => {
      expect(StudentUpdateSchema.parse({ id: 1, first_name: 'Jane' })).toBeDefined()
    })
  })

  describe('StaffCreateSchema', () => {
    const valid = {
      employee_id: 'E001',
      first_name: 'Alice',
      last_name: 'Smith',
      gender: 'FEMALE',
      date_of_birth: '1985-03-20',
      phone: '+254711111111',
      email: 'alice@school.edu',
      role: 'TEACHER',
      department: 'Science',
      hire_date: '2020-01-01',
      salary: 50000,
      bank_account: '1234567890',
      bank_name: 'KCB',
    }

    it('accepts valid staff', () => {
      expect(StaffCreateSchema.parse(valid)).toBeDefined()
    })

    it('rejects invalid role', () => {
      expect(() => StaffCreateSchema.parse({ ...valid, role: 'JANITOR' })).toThrow()
    })

    it('rejects salary > 1000000', () => {
      expect(() => StaffCreateSchema.parse({ ...valid, salary: 1000001 })).toThrow()
    })

    it('rejects negative salary', () => {
      expect(() => StaffCreateSchema.parse({ ...valid, salary: -100 })).toThrow()
    })

    it('validates KRA PIN format', () => {
      expect(StaffCreateSchema.parse({ ...valid, kra_pin: 'A12345678Z' })).toBeDefined()
      expect(() => StaffCreateSchema.parse({ ...valid, kra_pin: '1234' })).toThrow()
    })

    it('validates NHIF number', () => {
      expect(StaffCreateSchema.parse({ ...valid, nhif_number: '12345678' })).toBeDefined()
      expect(() => StaffCreateSchema.parse({ ...valid, nhif_number: '123' })).toThrow()
    })

    it('validates NSSF number', () => {
      expect(StaffCreateSchema.parse({ ...valid, nssf_number: '12345678' })).toBeDefined()
      expect(() => StaffCreateSchema.parse({ ...valid, nssf_number: '123' })).toThrow()
    })
  })

  describe('ExamCreateSchema (common)', () => {
    const valid = {
      name: 'Midterm', class_id: 1, term_id: 1, exam_type: 'FORMATIVE',
      start_date: '2024-03-01', end_date: '2024-03-05', max_marks: 100, passing_marks: 40,
    }

    it('accepts valid exam', () => {
      expect(ExamCreateSchema.parse(valid)).toBeDefined()
    })

    it('rejects invalid exam_type', () => {
      expect(() => ExamCreateSchema.parse({ ...valid, exam_type: 'QUIZ' })).toThrow()
    })

    it('rejects max_marks > 1000', () => {
      expect(() => ExamCreateSchema.parse({ ...valid, max_marks: 1001 })).toThrow()
    })

    it('rejects negative max_marks', () => {
      expect(() => ExamCreateSchema.parse({ ...valid, max_marks: -10 })).toThrow()
    })
  })

  describe('GradeEntrySchema', () => {
    it('accepts valid grade', () => {
      expect(GradeEntrySchema.parse({ exam_id: 1, student_id: 1, subject_id: 1, marks_obtained: 85 })).toBeDefined()
    })
    it('rejects marks < 0', () => {
      expect(() => GradeEntrySchema.parse({ exam_id: 1, student_id: 1, subject_id: 1, marks_obtained: -1 })).toThrow()
    })
    it('rejects marks > 1000', () => {
      expect(() => GradeEntrySchema.parse({ exam_id: 1, student_id: 1, subject_id: 1, marks_obtained: 1001 })).toThrow()
    })
  })

  describe('PaymentCreateSchema (common)', () => {
    const valid = {
      student_id: 1, amount: 5000, payment_method: 'CASH',
      transaction_date: '2024-01-15',
    }

    it('accepts valid payment', () => {
      expect(PaymentCreateSchema.parse(valid)).toBeDefined()
    })

    it('rejects amount > 1,000,000', () => {
      expect(() => PaymentCreateSchema.parse({ ...valid, amount: 1000001 })).toThrow()
    })

    it('rejects negative amount', () => {
      expect(() => PaymentCreateSchema.parse({ ...valid, amount: -100 })).toThrow()
    })

    it('rejects invalid payment_method', () => {
      expect(() => PaymentCreateSchema.parse({ ...valid, payment_method: 'BITCOIN' })).toThrow()
    })
  })

  describe('InvoiceCreateSchema', () => {
    const valid = { student_id: 1, fee_structure_id: 1, term_id: 1, due_date: '2024-03-01' }

    it('accepts valid', () => {
      expect(InvoiceCreateSchema.parse(valid)).toBeDefined()
    })
    it('rejects missing required field', () => {
      expect(() => InvoiceCreateSchema.parse({ student_id: 1, term_id: 1 })).toThrow()
    })
  })

  describe('SystemSettingsSchema', () => {
    const valid = {
      school_name: 'Test School',
      school_address: '123 School St',
      school_phone: '+254700000000',
      school_email: 'info@school.edu',
      currency: 'KES',
      academic_year: '2024-2025',
      current_term: 'TERM_1',
    }

    it('accepts valid', () => {
      expect(SystemSettingsSchema.parse(valid)).toBeDefined()
    })

    it('rejects empty school name', () => {
      expect(() => SystemSettingsSchema.parse({ ...valid, school_name: '' })).toThrow()
    })

    it('rejects currency not 3 chars', () => {
      expect(() => SystemSettingsSchema.parse({ ...valid, currency: 'KESH' })).toThrow()
    })

    it('rejects invalid academic_year format', () => {
      expect(() => SystemSettingsSchema.parse({ ...valid, academic_year: '2024' })).toThrow()
    })

    it('rejects invalid term', () => {
      expect(() => SystemSettingsSchema.parse({ ...valid, current_term: 'TERM_4' })).toThrow()
    })
  })

  describe('ReportGenerationSchema', () => {
    const valid = { report_type: 'FINANCIAL_SUMMARY', parameters: {}, format: 'PDF' }

    it('accepts valid', () => {
      expect(ReportGenerationSchema.parse(valid)).toBeDefined()
    })

    it('rejects invalid report_type', () => {
      expect(() => ReportGenerationSchema.parse({ ...valid, report_type: 'UNKNOWN' })).toThrow()
    })

    it('rejects invalid format', () => {
      expect(() => ReportGenerationSchema.parse({ ...valid, format: 'DOCX' })).toThrow()
    })
  })

  describe('MessageCreateSchema', () => {
    const valid = { recipient_type: 'ALL_STUDENTS', subject: 'Notice', message: 'Hello students', delivery_method: 'SMS' }

    it('accepts valid', () => {
      expect(MessageCreateSchema.parse(valid)).toBeDefined()
    })

    it('rejects empty subject', () => {
      expect(() => MessageCreateSchema.parse({ ...valid, subject: '' })).toThrow()
    })

    it('rejects empty message', () => {
      expect(() => MessageCreateSchema.parse({ ...valid, message: '' })).toThrow()
    })

    it('rejects invalid delivery_method', () => {
      expect(() => MessageCreateSchema.parse({ ...valid, delivery_method: 'FAX' })).toThrow()
    })

    it('rejects message > 2000 chars', () => {
      expect(() => MessageCreateSchema.parse({ ...valid, message: 'x'.repeat(2001) })).toThrow()
    })
  })
})

// =========================================================================
//  FINANCE TRANSACTION SCHEMAS
// =========================================================================
describe('Finance Transaction Schemas', () => {
  describe('InvoiceItemSchema', () => {
    it('accepts valid', () => {
      expect(InvoiceItemSchema.parse({ fee_category_id: 1, amount: 5000 })).toBeDefined()
    })
    it('rejects negative amount', () => {
      expect(() => InvoiceItemSchema.parse({ fee_category_id: 1, amount: -100 })).toThrow()
    })
    it('rejects zero amount', () => {
      expect(() => InvoiceItemSchema.parse({ fee_category_id: 1, amount: 0 })).toThrow()
    })
    it('rejects non-positive fee_category_id', () => {
      expect(() => InvoiceItemSchema.parse({ fee_category_id: 0, amount: 100 })).toThrow()
    })
  })

  describe('InvoiceDataSchema', () => {
    it('accepts valid with due_date >= invoice_date', () => {
      expect(InvoiceDataSchema.parse({ student_id: 1, term_id: 1, invoice_date: '2024-01-01', due_date: '2024-02-01' })).toBeDefined()
    })
    it('accepts same-day dates', () => {
      expect(InvoiceDataSchema.parse({ student_id: 1, term_id: 1, invoice_date: '2024-01-01', due_date: '2024-01-01' })).toBeDefined()
    })
    it('rejects due_date before invoice_date', () => {
      expect(() => InvoiceDataSchema.parse({ student_id: 1, term_id: 1, invoice_date: '2024-02-01', due_date: '2024-01-01' })).toThrow()
    })
    it('rejects invalid date format', () => {
      expect(() => InvoiceDataSchema.parse({ student_id: 1, term_id: 1, invoice_date: 'bad', due_date: '2024-01-01' })).toThrow()
    })
  })

  describe('FeeStructureItemSchema', () => {
    it('accepts valid', () => {
      expect(FeeStructureItemSchema.parse({ stream_id: 1, fee_category_id: 1, amount: 1000, student_type: 'BOARDER' })).toBeDefined()
    })
    it('rejects invalid student_type', () => {
      expect(() => FeeStructureItemSchema.parse({ stream_id: 1, fee_category_id: 1, amount: 1000, student_type: 'UNKNOWN' })).toThrow()
    })
  })

  describe('PaymentDataSchema', () => {
    it('accepts valid payment data', () => {
      const data = { student_id: 1, amount: 5000, transaction_date: getTodayOrPast(), payment_method: 'MPESA' }
      expect(PaymentDataSchema.parse(data)).toBeDefined()
    })

    it('rejects future transaction_date', () => {
      expect(() => PaymentDataSchema.parse({ student_id: 1, amount: 5000, transaction_date: '2099-01-01', payment_method: 'CASH' })).toThrow()
    })

    it('rejects empty payment_method', () => {
      expect(() => PaymentDataSchema.parse({ student_id: 1, amount: 5000, transaction_date: getTodayOrPast(), payment_method: '' })).toThrow()
    })
  })

  describe('RecordPaymentTuple', () => {
    it('accepts [paymentData, userId]', () => {
      const data = { student_id: 1, amount: 500, transaction_date: getTodayOrPast(), payment_method: 'CASH' }
      expect(RecordPaymentTuple.parse([data, 1])).toBeDefined()
    })
    it('accepts [paymentData] without userId', () => {
      const data = { student_id: 1, amount: 500, transaction_date: getTodayOrPast(), payment_method: 'CASH' }
      expect(RecordPaymentTuple.parse([data])).toBeDefined()
    })
  })

  describe('PayWithCreditDataSchema', () => {
    it('accepts valid', () => {
      expect(PayWithCreditDataSchema.parse({ studentId: 1, invoiceId: 2, amount: 1000 })).toBeDefined()
    })
    it('rejects zero amount', () => {
      expect(() => PayWithCreditDataSchema.parse({ studentId: 1, invoiceId: 2, amount: 0 })).toThrow()
    })
  })

  describe('VoidPaymentTuple', () => {
    it('accepts [transactionId, reason]', () => {
      expect(VoidPaymentTuple.parse([1, 'Duplicate'])).toBeDefined()
    })
    it('rejects empty reason', () => {
      expect(() => VoidPaymentTuple.parse([1, ''])).toThrow()
    })
  })

  describe('AddCreditTuple', () => {
    it('accepts [studentId, amount, notes]', () => {
      expect(AddCreditTuple.parse([1, 500, 'Overpayment'])).toBeDefined()
    })
    it('rejects empty notes', () => {
      expect(() => AddCreditTuple.parse([1, 500, ''])).toThrow()
    })
  })

  describe('CalculateProratedFeeTuple', () => {
    it('accepts [amount, termStart, termEnd, enrollment]', () => {
      expect(CalculateProratedFeeTuple.parse([10000, '2024-01-01', '2024-04-30', '2024-02-15'])).toBeDefined()
    })
    it('rejects invalid date', () => {
      expect(() => CalculateProratedFeeTuple.parse([10000, 'bad', '2024-04-30', '2024-02-15'])).toThrow()
    })
  })

  describe('ScholarshipDataSchema', () => {
    it('accepts valid', () => {
      expect(ScholarshipDataSchema.parse({ name: 'Merit', amount: 5000, fund_id: 1 })).toBeDefined()
    })
    it('rejects empty name', () => {
      expect(() => ScholarshipDataSchema.parse({ name: '', amount: 5000, fund_id: 1 })).toThrow()
    })
    it('rejects zero amount', () => {
      expect(() => ScholarshipDataSchema.parse({ name: 'Merit', amount: 0, fund_id: 1 })).toThrow()
    })
  })

  describe('ScholarshipAllocationSchema', () => {
    it('accepts valid', () => {
      expect(ScholarshipAllocationSchema.parse({ scholarship_id: 1, student_id: 2, term_id: 3, amount: 1000 })).toBeDefined()
    })
    it('rejects missing student_id', () => {
      expect(() => ScholarshipAllocationSchema.parse({ scholarship_id: 1, term_id: 3, amount: 1000 })).toThrow()
    })
  })
})

// =========================================================================
//  OPERATIONS SCHEMAS
// =========================================================================
describe('Operations Schemas', () => {
  describe('BoardingExpenseSchema', () => {
    const valid = {
      amount_cents: 5000, fiscal_year: 2024, gl_account_code: '5010', recorded_by: 1,
      term: 1, description: 'Food supplies', facility_id: 1, expense_type: 'FOOD',
    }

    it('accepts valid', () => {
      expect(BoardingExpenseSchema.parse(valid)).toBeDefined()
    })

    it('rejects negative amount_cents', () => {
      expect(() => BoardingExpenseSchema.parse({ ...valid, amount_cents: -100 })).toThrow()
    })

    it('rejects zero amount_cents', () => {
      expect(() => BoardingExpenseSchema.parse({ ...valid, amount_cents: 0 })).toThrow()
    })

    it('rejects invalid expense_type', () => {
      expect(() => BoardingExpenseSchema.parse({ ...valid, expense_type: 'UNKNOWN' })).toThrow()
    })

    it('rejects fiscal_year out of range', () => {
      expect(() => BoardingExpenseSchema.parse({ ...valid, fiscal_year: 1999 })).toThrow()
    })

    it('rejects invalid term', () => {
      expect(() => BoardingExpenseSchema.parse({ ...valid, term: 4 })).toThrow()
    })

    it('accepts optional payment_method', () => {
      expect(BoardingExpenseSchema.parse({ ...valid, payment_method: 'CASH' })).toBeDefined()
    })
  })

  describe('TransportExpenseSchema', () => {
    const valid = {
      amount_cents: 3000, fiscal_year: 2024, gl_account_code: '5020', recorded_by: 1,
      term: 2, description: 'Fuel', route_id: 1, expense_type: 'FUEL',
    }

    it('accepts valid', () => {
      expect(TransportExpenseSchema.parse(valid)).toBeDefined()
    })

    it('rejects invalid expense_type', () => {
      expect(() => TransportExpenseSchema.parse({ ...valid, expense_type: 'PARKING' })).toThrow()
    })
  })

  describe('TransportRouteSchema (union)', () => {
    it('accepts canonical format', () => {
      const result = TransportRouteSchema.parse({ route_name: 'Route A', distance_km: 20, estimated_students: 30, budget_per_term_cents: 50000 })
      expect(result.route_name).toBe('Route A')
    })

    it('accepts legacy format and transforms', () => {
      const result = TransportRouteSchema.parse({ route_name: 'Route B', cost_per_term: 30000 })
      expect(result.route_name).toBe('Route B')
      expect(result.distance_km).toBe(0)
      expect(result.budget_per_term_cents).toBe(30000)
    })

    it('rejects empty route_name', () => {
      expect(() => TransportRouteSchema.parse({ route_name: '', distance_km: 0, estimated_students: 0, budget_per_term_cents: 0 })).toThrow()
    })
  })

  describe('GetExpensesTuple', () => {
    it('accepts [facilityId, fiscalYear]', () => {
      expect(GetExpensesTuple.parse([1, 2024])).toBeDefined()
    })
    it('accepts [facilityId, fiscalYear, term]', () => {
      expect(GetExpensesTuple.parse([1, 2024, 1])).toBeDefined()
    })
  })

  describe('GrantCreateSchema', () => {
    const valid = {
      grant_name: 'Capitation Grant', grant_type: 'CAPITATION', amount_allocated: 500000,
      amount_received: 200000, fiscal_year: 2024, source: 'Government',
      start_date: '2024-01-01', end_date: '2024-12-31',
    }

    it('accepts valid', () => {
      expect(GrantCreateSchema.parse(valid)).toBeDefined()
    })

    it('rejects invalid grant_type', () => {
      expect(() => GrantCreateSchema.parse({ ...valid, grant_type: 'UNKNOWN' })).toThrow()
    })

    it('rejects negative amount_allocated', () => {
      expect(() => GrantCreateSchema.parse({ ...valid, amount_allocated: -1 })).toThrow()
    })

    it('rejects invalid date format', () => {
      expect(() => GrantCreateSchema.parse({ ...valid, start_date: '01/01/2024' })).toThrow()
    })

    it('rejects empty source', () => {
      expect(() => GrantCreateSchema.parse({ ...valid, source: '' })).toThrow()
    })
  })

  describe('GrantUtilizationSchema', () => {
    const valid = {
      grantId: 1, amount: 10000, utilizationDate: '2024-06-15',
      description: 'Textbooks', glAccountCode: '4010',
    }

    it('accepts valid', () => {
      expect(GrantUtilizationSchema.parse(valid)).toBeDefined()
    })

    it('rejects empty description', () => {
      expect(() => GrantUtilizationSchema.parse({ ...valid, description: '' })).toThrow()
    })

    it('rejects invalid date', () => {
      expect(() => GrantUtilizationSchema.parse({ ...valid, utilizationDate: 'bad' })).toThrow()
    })
  })

  describe('CostCalculateTuple', () => {
    it('accepts [studentId, termId, yearId]', () => {
      expect(CostCalculateTuple.parse([1, 2, 3])).toEqual([1, 2, 3])
    })
    it('rejects non-positive', () => {
      expect(() => CostCalculateTuple.parse([0, 2, 3])).toThrow()
    })
  })
})

// =========================================================================
//  REPORTS SCHEMAS
// =========================================================================
describe('Reports Schemas', () => {
  describe('ReportDateRangeSchema', () => {
    it('accepts two date strings', () => {
      expect(ReportDateRangeSchema.parse(['2024-01-01', '2024-12-31'])).toEqual(['2024-01-01', '2024-12-31'])
    })
    it('rejects short dates', () => {
      expect(() => ReportDateRangeSchema.parse(['2024', '2024-12'])).toThrow()
    })
  })

  describe('StudentLedgerSchema', () => {
    it('accepts [studentId, yearId, startDate, endDate]', () => {
      expect(StudentLedgerSchema.parse([1, 1, '2024-01-01', '2024-12-31'])).toBeDefined()
    })
    it('rejects non-positive studentId', () => {
      expect(() => StudentLedgerSchema.parse([0, 1, '2024-01-01', '2024-12-31'])).toThrow()
    })
  })

  describe('ReportPeriodSchema', () => {
    it('accepts positive integer', () => {
      expect(ReportPeriodSchema.parse(1)).toBe(1)
    })
    it('rejects 0', () => {
      expect(() => ReportPeriodSchema.parse(0)).toThrow()
    })
    it('rejects negative', () => {
      expect(() => ReportPeriodSchema.parse(-1)).toThrow()
    })
  })

  describe('ReportAsOfDateSchema', () => {
    it('accepts date string >= 10 chars', () => {
      expect(ReportAsOfDateSchema.parse('2024-12-31')).toBe('2024-12-31')
    })
    it('rejects short string', () => {
      expect(() => ReportAsOfDateSchema.parse('2024')).toThrow()
    })
  })

  describe('NEMISExportConfigSchema', () => {
    it('accepts valid config', () => {
      expect(NEMISExportConfigSchema.parse({ export_type: 'STUDENTS', format: 'CSV' })).toBeDefined()
    })
    it('rejects invalid export_type', () => {
      expect(() => NEMISExportConfigSchema.parse({ export_type: 'UNKNOWN', format: 'CSV' })).toThrow()
    })
    it('rejects invalid format', () => {
      expect(() => NEMISExportConfigSchema.parse({ export_type: 'STUDENTS', format: 'XML' })).toThrow()
    })
    it('accepts optional filters', () => {
      expect(NEMISExportConfigSchema.parse({ export_type: 'ENROLLMENT', format: 'JSON', filters: { gender: 'M' } })).toBeDefined()
    })
  })

  describe('NEMISStudentSchema', () => {
    const valid = {
      nemis_upi: 'UPI001', full_name: 'John Doe', date_of_birth: '2010-01-01',
      gender: 'M', admission_number: 'A001', class_name: 'Grade 4',
      guardian_name: 'Jane Doe', guardian_phone: '+254700000000',
      county: 'Nairobi', sub_county: 'Westlands', special_needs: null,
    }

    it('accepts valid', () => {
      expect(NEMISStudentSchema.parse(valid)).toBeDefined()
    })

    it('rejects invalid gender', () => {
      expect(() => NEMISStudentSchema.parse({ ...valid, gender: 'X' })).toThrow()
    })

    it('accepts null special_needs', () => {
      expect(NEMISStudentSchema.parse(valid).special_needs).toBeNull()
    })
  })

  describe('ScheduledReportSchema', () => {
    const valid = {
      report_name: 'Weekly Fee Report', report_type: 'fee_collection',
      schedule_type: 'WEEKLY', day_of_week: 1, day_of_month: null,
      time_of_day: '08:00', recipients: '["admin@school.edu"]',
      export_format: 'PDF', is_active: true,
    }

    it('accepts valid', () => {
      expect(ScheduledReportSchema.parse(valid)).toBeDefined()
    })

    it('rejects empty report_name', () => {
      expect(() => ScheduledReportSchema.parse({ ...valid, report_name: '' })).toThrow()
    })

    it('rejects invalid schedule_type', () => {
      expect(() => ScheduledReportSchema.parse({ ...valid, schedule_type: 'HOURLY' })).toThrow()
    })

    it('rejects invalid time_of_day format', () => {
      expect(() => ScheduledReportSchema.parse({ ...valid, time_of_day: '8AM' })).toThrow()
    })

    it('rejects day_of_week > 6', () => {
      expect(() => ScheduledReportSchema.parse({ ...valid, day_of_week: 7 })).toThrow()
    })

    it('rejects invalid export_format', () => {
      expect(() => ScheduledReportSchema.parse({ ...valid, export_format: 'HTML' })).toThrow()
    })
  })

  describe('ScheduledReportInputSchema', () => {
    const valid = {
      report_name: 'Daily Summary', report_type: 'financial_summary',
      schedule_type: 'DAILY', day_of_week: null, day_of_month: null,
      time_of_day: '18:00', recipients: '["principal@school.edu"]',
      export_format: 'EXCEL', is_active: true,
    }

    it('accepts valid', () => {
      expect(ScheduledReportInputSchema.parse(valid)).toBeDefined()
    })
    it('rejects missing report_name', () => {
      expect(() => ScheduledReportInputSchema.parse({ ...valid, report_name: undefined })).toThrow()
    })
  })
})

// =========================================================================
//  Helpers
// =========================================================================
function getTodayOrPast(): string {
  return new Date().toISOString().slice(0, 10)
}
