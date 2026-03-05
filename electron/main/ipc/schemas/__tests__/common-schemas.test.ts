import { describe, expect, it } from 'vitest'
import {
  IdSchema,
  PaginationSchema,
  DateRangeSchema,
  StudentCreateSchema,
  StudentUpdateSchema,
  StaffCreateSchema,
  StaffUpdateSchema,
  ExamCreateSchema,
  GradeEntrySchema,
  PaymentCreateSchema,
  InvoiceCreateSchema,
  SystemSettingsSchema,
  ReportGenerationSchema,
  MessageCreateSchema,
} from '../common-schemas'

describe('IdSchema', () => {
  it('accepts valid positive integers', () => {
    expect(IdSchema.parse(1)).toBe(1)
    expect(IdSchema.parse(100)).toBe(100)
    expect(IdSchema.parse(2147483647)).toBe(2147483647)
  })

  it('rejects zero, negative, fractional, and overflow', () => {
    expect(() => IdSchema.parse(0)).toThrow()
    expect(() => IdSchema.parse(-1)).toThrow()
    expect(() => IdSchema.parse(1.5)).toThrow()
    expect(() => IdSchema.parse(2147483648)).toThrow()
  })
})

describe('PaginationSchema', () => {
  it('uses defaults when not provided', () => {
    const result = PaginationSchema.parse({})
    expect(result.page).toBe(1)
    expect(result.limit).toBe(20)
  })

  it('accepts valid page and limit', () => {
    const result = PaginationSchema.parse({ page: 2, limit: 50 })
    expect(result.page).toBe(2)
    expect(result.limit).toBe(50)
  })

  it('rejects page 0 and limit > 100', () => {
    expect(() => PaginationSchema.parse({ page: 0 })).toThrow()
    expect(() => PaginationSchema.parse({ limit: 101 })).toThrow()
    expect(() => PaginationSchema.parse({ limit: 0 })).toThrow()
  })

  it('accepts optional search string', () => {
    const result = PaginationSchema.parse({ search: 'test' })
    expect(result.search).toBe('test')
  })
})

describe('DateRangeSchema', () => {
  it('accepts valid YYYY-MM-DD dates', () => {
    const result = DateRangeSchema.parse({ startDate: '2026-01-01', endDate: '2026-12-31' })
    expect(result.startDate).toBe('2026-01-01')
    expect(result.endDate).toBe('2026-12-31')
  })

  it('rejects invalid date formats', () => {
    expect(() => DateRangeSchema.parse({ startDate: '01-01-2026', endDate: '2026-12-31' })).toThrow()
    expect(() => DateRangeSchema.parse({ startDate: '2026-01-01', endDate: '12/31/2026' })).toThrow()
    expect(() => DateRangeSchema.parse({ startDate: '2026-1-1', endDate: '2026-12-31' })).toThrow()
  })
})

describe('StudentCreateSchema', () => {
  const validStudent = {
    admission_number: 'ADM001',
    first_name: 'Grace',
    last_name: 'Mutua',
    gender: 'FEMALE' as const,
    date_of_birth: '2015-05-15',
    class_id: 1,
    guardian_name: 'John Mutua',
    guardian_phone: '+254700123456',
    enrollment_date: '2026-01-05',
  }

  it('accepts valid student data', () => {
    const result = StudentCreateSchema.parse(validStudent)
    expect(result.first_name).toBe('Grace')
  })

  it('accepts optional fields', () => {
    const result = StudentCreateSchema.parse({
      ...validStudent,
      stream_id: 5,
      guardian_email: 'john@example.com',
      address: '123 Main St',
    })
    expect(result.stream_id).toBe(5)
    expect(result.guardian_email).toBe('john@example.com')
  })

  it('rejects empty admission number', () => {
    expect(() => StudentCreateSchema.parse({ ...validStudent, admission_number: '' })).toThrow()
  })

  it('rejects invalid gender', () => {
    expect(() => StudentCreateSchema.parse({ ...validStudent, gender: 'OTHER' })).toThrow()
  })

  it('rejects invalid phone format', () => {
    expect(() => StudentCreateSchema.parse({ ...validStudent, guardian_phone: 'abc' })).toThrow()
  })

  it('rejects address > 500 chars', () => {
    expect(() => StudentCreateSchema.parse({ ...validStudent, address: 'x'.repeat(501) })).toThrow()
  })
})

describe('StudentUpdateSchema', () => {
  it('accepts valid partial update', () => {
    const result = StudentUpdateSchema.parse({ id: 1, first_name: 'Jane' })
    expect(result.first_name).toBe('Jane')
  })

  it('accepts is_active boolean', () => {
    const result = StudentUpdateSchema.parse({ id: 1, is_active: false })
    expect(result.is_active).toBe(false)
  })

  it('rejects missing id', () => {
    expect(() => StudentUpdateSchema.parse({ first_name: 'Jane' })).toThrow()
  })
})

describe('StaffCreateSchema', () => {
  const validStaff = {
    employee_id: 'EMP001',
    first_name: 'Mary',
    last_name: 'Wanjiku',
    gender: 'FEMALE' as const,
    date_of_birth: '1990-03-20',
    phone: '+254700123456',
    email: 'mary@school.edu',
    role: 'TEACHER' as const,
    department: 'Mathematics',
    hire_date: '2024-01-01',
    salary: 50000,
    bank_account: '123456789',
    bank_name: 'KCB',
  }

  it('accepts valid staff data', () => {
    const result = StaffCreateSchema.parse(validStaff)
    expect(result.first_name).toBe('Mary')
  })

  it('accepts optional KRA, NHIF, NSSF fields', () => {
    const result = StaffCreateSchema.parse({
      ...validStaff,
      kra_pin: 'A12345678Z',
      nhif_number: '12345678',
      nssf_number: '12345678',
    })
    expect(result.kra_pin).toBe('A12345678Z')
  })

  it('rejects invalid KRA pin format', () => {
    expect(() => StaffCreateSchema.parse({ ...validStaff, kra_pin: '123' })).toThrow()
  })

  it('rejects invalid NHIF number', () => {
    expect(() => StaffCreateSchema.parse({ ...validStaff, nhif_number: '123' })).toThrow()
  })

  it('rejects salary > 1000000', () => {
    expect(() => StaffCreateSchema.parse({ ...validStaff, salary: 1000001 })).toThrow()
  })

  it('rejects invalid role', () => {
    expect(() => StaffCreateSchema.parse({ ...validStaff, role: 'JANITOR' })).toThrow()
  })

  it('accepts all valid roles', () => {
    for (const role of ['ADMIN', 'PRINCIPAL', 'DEPUTY_PRINCIPAL', 'ACCOUNTS_CLERK', 'AUDITOR', 'TEACHER']) {
      const result = StaffCreateSchema.parse({ ...validStaff, role })
      expect(result.role).toBe(role)
    }
  })
})

describe('StaffUpdateSchema', () => {
  it('accepts partial update with id', () => {
    const result = StaffUpdateSchema.parse({ id: 2, phone: '+254711222333' })
    expect(result.phone).toBe('+254711222333')
  })

  it('accepts is_active flag', () => {
    const result = StaffUpdateSchema.parse({ id: 3, is_active: true })
    expect(result.is_active).toBe(true)
  })

  it('rejects invalid NSSF format', () => {
    expect(() => StaffUpdateSchema.parse({ id: 1, nssf_number: '12' })).toThrow()
  })
})

describe('ExamCreateSchema', () => {
  const validExam = {
    name: 'Midterm Exam',
    class_id: 1,
    term_id: 1,
    exam_type: 'SUMMATIVE' as const,
    start_date: '2026-03-01',
    end_date: '2026-03-10',
    max_marks: 100,
    passing_marks: 40,
  }

  it('accepts valid exam data', () => {
    const result = ExamCreateSchema.parse(validExam)
    expect(result.name).toBe('Midterm Exam')
  })

  it('rejects empty name', () => {
    expect(() => ExamCreateSchema.parse({ ...validExam, name: '' })).toThrow()
  })

  it('rejects name > 200 chars', () => {
    expect(() => ExamCreateSchema.parse({ ...validExam, name: 'x'.repeat(201) })).toThrow()
  })

  it('rejects max_marks > 1000', () => {
    expect(() => ExamCreateSchema.parse({ ...validExam, max_marks: 1001 })).toThrow()
  })

  it('accepts all valid exam types', () => {
    for (const exam_type of ['FORMATIVE', 'SUMMATIVE', 'PRACTICAL', 'PROJECT']) {
      const result = ExamCreateSchema.parse({ ...validExam, exam_type })
      expect(result.exam_type).toBe(exam_type)
    }
  })
})

describe('GradeEntrySchema', () => {
  it('accepts valid grade entry', () => {
    const result = GradeEntrySchema.parse({ exam_id: 1, student_id: 1, subject_id: 1, marks_obtained: 85 })
    expect(result.marks_obtained).toBe(85)
  })

  it('rejects marks outside 0-1000', () => {
    expect(() => GradeEntrySchema.parse({ exam_id: 1, student_id: 1, subject_id: 1, marks_obtained: -1 })).toThrow()
    expect(() => GradeEntrySchema.parse({ exam_id: 1, student_id: 1, subject_id: 1, marks_obtained: 1001 })).toThrow()
  })

  it('accepts optional remarks', () => {
    const result = GradeEntrySchema.parse({ exam_id: 1, student_id: 1, subject_id: 1, marks_obtained: 50, remarks: 'Fair' })
    expect(result.remarks).toBe('Fair')
  })

  it('rejects remarks > 500 chars', () => {
    expect(() =>
      GradeEntrySchema.parse({ exam_id: 1, student_id: 1, subject_id: 1, marks_obtained: 50, remarks: 'x'.repeat(501) })
    ).toThrow()
  })
})

describe('PaymentCreateSchema', () => {
  const validPayment = {
    student_id: 1,
    amount: 5000,
    payment_method: 'CASH' as const,
    transaction_date: '2026-02-15',
  }

  it('accepts valid payment', () => {
    const result = PaymentCreateSchema.parse(validPayment)
    expect(result.amount).toBe(5000)
  })

  it('accepts all payment methods', () => {
    for (const pm of ['CASH', 'BANK_DEPOSIT', 'MOBILE_MONEY', 'CHEQUE', 'BANK_TRANSFER']) {
      expect(PaymentCreateSchema.parse({ ...validPayment, payment_method: pm }).payment_method).toBe(pm)
    }
  })

  it('rejects amount > 1000000', () => {
    expect(() => PaymentCreateSchema.parse({ ...validPayment, amount: 1000001 })).toThrow()
  })

  it('rejects payment_reference > 100 chars', () => {
    expect(() => PaymentCreateSchema.parse({ ...validPayment, payment_reference: 'x'.repeat(101) })).toThrow()
  })

  it('accepts optional idempotency_key', () => {
    const result = PaymentCreateSchema.parse({ ...validPayment, idempotency_key: 'key-123' })
    expect(result.idempotency_key).toBe('key-123')
  })

  it('rejects idempotency_key > 128 chars', () => {
    expect(() => PaymentCreateSchema.parse({ ...validPayment, idempotency_key: 'x'.repeat(129) })).toThrow()
  })
})

describe('InvoiceCreateSchema', () => {
  it('accepts valid invoice', () => {
    const result = InvoiceCreateSchema.parse({
      student_id: 1,
      fee_structure_id: 1,
      term_id: 1,
      due_date: '2026-03-01',
    })
    expect(result.due_date).toBe('2026-03-01')
  })

  it('accepts description', () => {
    const result = InvoiceCreateSchema.parse({
      student_id: 1,
      fee_structure_id: 1,
      term_id: 1,
      due_date: '2026-03-01',
      description: 'Term 1 fees',
    })
    expect(result.description).toBe('Term 1 fees')
  })

  it('rejects description > 500 chars', () => {
    expect(() => InvoiceCreateSchema.parse({
      student_id: 1,
      fee_structure_id: 1,
      term_id: 1,
      due_date: '2026-03-01',
      description: 'x'.repeat(501),
    })).toThrow()
  })
})

describe('SystemSettingsSchema', () => {
  const valid = {
    school_name: 'Mwingi School',
    school_address: '123 Main St',
    school_phone: '+254700123456',
    school_email: 'info@school.edu',
    currency: 'KES',
    academic_year: '2025-2026',
    current_term: 'TERM_1' as const,
  }

  it('accepts valid settings', () => {
    const result = SystemSettingsSchema.parse(valid)
    expect(result.school_name).toBe('Mwingi School')
  })

  it('rejects empty school name', () => {
    expect(() => SystemSettingsSchema.parse({ ...valid, school_name: '' })).toThrow()
  })

  it('rejects currency != 3 chars', () => {
    expect(() => SystemSettingsSchema.parse({ ...valid, currency: 'US' })).toThrow()
    expect(() => SystemSettingsSchema.parse({ ...valid, currency: 'USDD' })).toThrow()
  })

  it('rejects invalid academic year format', () => {
    expect(() => SystemSettingsSchema.parse({ ...valid, academic_year: '2026' })).toThrow()
  })

  it('accepts all term values', () => {
    for (const t of ['TERM_1', 'TERM_2', 'TERM_3']) {
      expect(SystemSettingsSchema.parse({ ...valid, current_term: t }).current_term).toBe(t)
    }
  })
})

describe('ReportGenerationSchema', () => {
  it('accepts valid report generation', () => {
    const result = ReportGenerationSchema.parse({
      report_type: 'STUDENT_LEDGER',
      parameters: { student_id: '1' },
      format: 'PDF',
    })
    expect(result.report_type).toBe('STUDENT_LEDGER')
  })

  it('accepts optional date_range', () => {
    const result = ReportGenerationSchema.parse({
      report_type: 'FINANCIAL_SUMMARY',
      parameters: {},
      format: 'EXCEL',
      date_range: { startDate: '2026-01-01', endDate: '2026-03-31' },
    })
    expect(result.date_range?.startDate).toBe('2026-01-01')
  })

  it('accepts all report types', () => {
    for (const t of ['STUDENT_LEDGER', 'CLASS_PERFORMANCE', 'FINANCIAL_SUMMARY', 'ATTENDANCE_REPORT', 'PAYROLL_SUMMARY']) {
      expect(ReportGenerationSchema.parse({ report_type: t, parameters: {}, format: 'CSV' }).report_type).toBe(t)
    }
  })

  it('accepts all format types', () => {
    for (const f of ['PDF', 'EXCEL', 'CSV']) {
      expect(ReportGenerationSchema.parse({ report_type: 'STUDENT_LEDGER', parameters: {}, format: f }).format).toBe(f)
    }
  })
})

describe('MessageCreateSchema', () => {
  const valid = {
    recipient_type: 'ALL_STUDENTS' as const,
    subject: 'Fee Reminder',
    message: 'Please pay your fees by end of month.',
    delivery_method: 'SMS' as const,
  }

  it('accepts valid message', () => {
    const result = MessageCreateSchema.parse(valid)
    expect(result.subject).toBe('Fee Reminder')
    expect(result.send_immediately).toBe(true)
  })

  it('accepts individual recipient with IDs', () => {
    const result = MessageCreateSchema.parse({
      ...valid,
      recipient_type: 'INDIVIDUAL',
      recipient_ids: [1, 2, 3],
    })
    expect(result.recipient_ids).toEqual([1, 2, 3])
  })

  it('rejects empty subject', () => {
    expect(() => MessageCreateSchema.parse({ ...valid, subject: '' })).toThrow()
  })

  it('rejects message > 2000 chars', () => {
    expect(() => MessageCreateSchema.parse({ ...valid, message: 'x'.repeat(2001) })).toThrow()
  })

  it('rejects empty message', () => {
    expect(() => MessageCreateSchema.parse({ ...valid, message: '' })).toThrow()
  })

  it('accepts scheduled_at datetime', () => {
    const result = MessageCreateSchema.parse({
      ...valid,
      send_immediately: false,
      scheduled_at: '2026-03-01T09:00:00',
    })
    expect(result.scheduled_at).toBe('2026-03-01T09:00:00')
  })

  it('rejects invalid scheduled_at format', () => {
    expect(() => MessageCreateSchema.parse({ ...valid, scheduled_at: '2026-03-01' })).toThrow()
  })

  it('accepts all delivery methods', () => {
    for (const dm of ['SMS', 'EMAIL', 'BOTH']) {
      expect(MessageCreateSchema.parse({ ...valid, delivery_method: dm }).delivery_method).toBe(dm)
    }
  })

  it('accepts all recipient types', () => {
    for (const rt of ['ALL_STUDENTS', 'ALL_STAFF', 'SPECIFIC_CLASS', 'INDIVIDUAL']) {
      expect(MessageCreateSchema.parse({ ...valid, recipient_type: rt }).recipient_type).toBe(rt)
    }
  })

  it('rejects subject > 200 characters', () => {
    expect(() => MessageCreateSchema.parse({ ...valid, subject: 'x'.repeat(201) })).toThrow('Subject must be between 1 and 200 characters')
  })
})

// ── Branch‑coverage additions ────────────────────────────────────
describe('PaginationSchema – negative values', () => {
  it('rejects negative page', () => {
    expect(() => PaginationSchema.parse({ page: -1 })).toThrow()
  })

  it('rejects negative limit', () => {
    expect(() => PaginationSchema.parse({ limit: -5 })).toThrow()
  })
})

describe('PaymentCreateSchema – zero / negative amount', () => {
  const base = { student_id: 1, payment_method: 'CASH' as const, transaction_date: '2026-01-01' }

  it('rejects zero amount', () => {
    expect(() => PaymentCreateSchema.parse({ ...base, amount: 0 })).toThrow()
  })

  it('rejects negative amount', () => {
    expect(() => PaymentCreateSchema.parse({ ...base, amount: -100 })).toThrow()
  })

  it('accepts boundary amount exactly 1000000', () => {
    const result = PaymentCreateSchema.parse({ ...base, amount: 1000000 })
    expect(result.amount).toBe(1000000)
  })
})

describe('ExamCreateSchema – passing_marks boundary', () => {
  const base = { name: 'Test', class_id: 1, term_id: 1, exam_type: 'SUMMATIVE' as const, start_date: '2026-01-01', end_date: '2026-01-10', max_marks: 100 }

  it('rejects passing_marks > 1000', () => {
    expect(() => ExamCreateSchema.parse({ ...base, passing_marks: 1001 })).toThrow()
  })

  it('rejects passing_marks = 0 (non-positive)', () => {
    expect(() => ExamCreateSchema.parse({ ...base, passing_marks: 0 })).toThrow()
  })

  it('accepts passing_marks at boundary 1000', () => {
    expect(ExamCreateSchema.parse({ ...base, passing_marks: 1000 }).passing_marks).toBe(1000)
  })
})

describe('StaffUpdateSchema – salary boundary', () => {
  it('accepts salary at exactly 1000000', () => {
    const result = StaffUpdateSchema.parse({ id: 1, salary: 1000000 })
    expect(result.salary).toBe(1000000)
  })

  it('rejects salary > 1000000', () => {
    expect(() => StaffUpdateSchema.parse({ id: 1, salary: 1000001 })).toThrow()
  })

  it('rejects zero salary (non-positive)', () => {
    expect(() => StaffUpdateSchema.parse({ id: 1, salary: 0 })).toThrow()
  })

  it('rejects negative salary', () => {
    expect(() => StaffUpdateSchema.parse({ id: 1, salary: -500 })).toThrow()
  })
})

describe('StudentCreateSchema – boundary lengths', () => {
  const base = {
    admission_number: 'ADM001', first_name: 'Grace', last_name: 'Mutua',
    gender: 'FEMALE' as const, date_of_birth: '2015-05-15', class_id: 1,
    guardian_name: 'John Mutua', guardian_phone: '+254700123456', enrollment_date: '2026-01-05',
  }

  it('accepts first_name at exactly 100 chars', () => {
    const result = StudentCreateSchema.parse({ ...base, first_name: 'A'.repeat(100) })
    expect(result.first_name.length).toBe(100)
  })

  it('rejects first_name > 100 chars', () => {
    expect(() => StudentCreateSchema.parse({ ...base, first_name: 'A'.repeat(101) })).toThrow()
  })

  it('accepts admission_number at exactly 50 chars', () => {
    const result = StudentCreateSchema.parse({ ...base, admission_number: 'X'.repeat(50) })
    expect(result.admission_number.length).toBe(50)
  })

  it('rejects admission_number > 50 chars', () => {
    expect(() => StudentCreateSchema.parse({ ...base, admission_number: 'X'.repeat(51) })).toThrow()
  })

  it('accepts guardian_name at exactly 200 chars', () => {
    const result = StudentCreateSchema.parse({ ...base, guardian_name: 'G'.repeat(200) })
    expect(result.guardian_name.length).toBe(200)
  })

  it('rejects guardian_name > 200 chars', () => {
    expect(() => StudentCreateSchema.parse({ ...base, guardian_name: 'G'.repeat(201) })).toThrow()
  })
})

// ── Branch‑coverage: StudentUpdateSchema optional fields ──────────
describe('StudentUpdateSchema – optional field refine branches', () => {
  it('accepts last_name when provided', () => {
    const result = StudentUpdateSchema.parse({ id: 1, last_name: 'Ochieng' })
    expect(result.last_name).toBe('Ochieng')
  })

  it('rejects last_name with empty string', () => {
    expect(() => StudentUpdateSchema.parse({ id: 1, last_name: '' })).toThrow()
  })

  it('accepts guardian_name when provided', () => {
    const result = StudentUpdateSchema.parse({ id: 1, guardian_name: 'Mary Kamau' })
    expect(result.guardian_name).toBe('Mary Kamau')
  })

  it('rejects guardian_name with empty string', () => {
    expect(() => StudentUpdateSchema.parse({ id: 1, guardian_name: '' })).toThrow()
  })

  it('accepts date_of_birth when provided', () => {
    const result = StudentUpdateSchema.parse({ id: 1, date_of_birth: '2010-05-15' })
    expect(result.date_of_birth).toBe('2010-05-15')
  })

  it('accepts guardian_phone when provided', () => {
    const result = StudentUpdateSchema.parse({ id: 1, guardian_phone: '+254700123456' })
    expect(result.guardian_phone).toBe('+254700123456')
  })

  it('accepts address when provided', () => {
    const result = StudentUpdateSchema.parse({ id: 1, address: '123 Main St' })
    expect(result.address).toBe('123 Main St')
  })
})

// ── Branch‑coverage: StaffUpdateSchema optional fields ────────────
describe('StaffUpdateSchema – optional field refine branches', () => {
  it('accepts first_name when provided', () => {
    const result = StaffUpdateSchema.parse({ id: 1, first_name: 'Grace' })
    expect(result.first_name).toBe('Grace')
  })

  it('rejects first_name with empty string', () => {
    expect(() => StaffUpdateSchema.parse({ id: 1, first_name: '' })).toThrow()
  })

  it('accepts last_name when provided', () => {
    const result = StaffUpdateSchema.parse({ id: 1, last_name: 'Mutua' })
    expect(result.last_name).toBe('Mutua')
  })

  it('accepts phone when provided', () => {
    const result = StaffUpdateSchema.parse({ id: 1, phone: '+254711223344' })
    expect(result.phone).toBe('+254711223344')
  })

  it('accepts department when provided', () => {
    const result = StaffUpdateSchema.parse({ id: 1, department: 'Mathematics' })
    expect(result.department).toBe('Mathematics')
  })

  it('accepts bank_account when provided', () => {
    const result = StaffUpdateSchema.parse({ id: 1, bank_account: '0012345678' })
    expect(result.bank_account).toBe('0012345678')
  })

  it('accepts bank_name when provided', () => {
    const result = StaffUpdateSchema.parse({ id: 1, bank_name: 'KCB Bank' })
    expect(result.bank_name).toBe('KCB Bank')
  })
})

// ── Statement coverage: ExamCreateSchema ──────────────────────────
describe('ExamCreateSchema', () => {
  it('accepts valid exam data', () => {
    const result = ExamCreateSchema.parse({
      name: 'End Term 1', class_id: 1, term_id: 1, exam_type: 'SUMMATIVE',
      start_date: '2026-01-10', end_date: '2026-01-15', max_marks: 100, passing_marks: 40
    })
    expect(result.name).toBe('End Term 1')
  })

  it('rejects empty exam name', () => {
    expect(() => ExamCreateSchema.parse({
      name: '', class_id: 1, term_id: 1, exam_type: 'SUMMATIVE',
      start_date: '2026-01-10', end_date: '2026-01-15', max_marks: 100, passing_marks: 40
    })).toThrow()
  })

  it('rejects invalid exam_type', () => {
    expect(() => ExamCreateSchema.parse({
      name: 'Test', class_id: 1, term_id: 1, exam_type: 'INVALID',
      start_date: '2026-01-10', end_date: '2026-01-15', max_marks: 100, passing_marks: 40
    })).toThrow()
  })

  it('rejects max_marks over 1000', () => {
    expect(() => ExamCreateSchema.parse({
      name: 'Test', class_id: 1, term_id: 1, exam_type: 'FORMATIVE',
      start_date: '2026-01-10', end_date: '2026-01-15', max_marks: 1001, passing_marks: 40
    })).toThrow()
  })
})

// ── Statement coverage: GradeEntrySchema ──────────────────────────
describe('GradeEntrySchema', () => {
  it('accepts valid grade entry', () => {
    const result = GradeEntrySchema.parse({ exam_id: 1, student_id: 1, subject_id: 1, marks_obtained: 85 })
    expect(result.marks_obtained).toBe(85)
  })

  it('accepts grade entry with remarks', () => {
    const result = GradeEntrySchema.parse({ exam_id: 1, student_id: 1, subject_id: 1, marks_obtained: 50, remarks: 'Good' })
    expect(result.remarks).toBe('Good')
  })

  it('rejects negative marks', () => {
    expect(() => GradeEntrySchema.parse({ exam_id: 1, student_id: 1, subject_id: 1, marks_obtained: -1 })).toThrow()
  })

  it('rejects marks over 1000', () => {
    expect(() => GradeEntrySchema.parse({ exam_id: 1, student_id: 1, subject_id: 1, marks_obtained: 1001 })).toThrow()
  })

  it('rejects remarks over 500 chars', () => {
    expect(() => GradeEntrySchema.parse({ exam_id: 1, student_id: 1, subject_id: 1, marks_obtained: 50, remarks: 'x'.repeat(501) })).toThrow()
  })
})

// ── Statement coverage: PaymentCreateSchema ───────────────────────
describe('PaymentCreateSchema', () => {
  it('accepts valid payment', () => {
    const result = PaymentCreateSchema.parse({
      student_id: 1, amount: 5000, payment_method: 'CASH', transaction_date: '2026-01-10'
    })
    expect(result.amount).toBe(5000)
  })

  it('accepts optional fields', () => {
    const result = PaymentCreateSchema.parse({
      student_id: 1, amount: 5000, payment_method: 'MOBILE_MONEY', transaction_date: '2026-03-01',
      payment_reference: 'MPE-123', description: 'Term 1 fee', fee_structure_id: 2, idempotency_key: 'abc-def'
    })
    expect(result.payment_reference).toBe('MPE-123')
    expect(result.idempotency_key).toBe('abc-def')
  })

  it('rejects amount over 1M', () => {
    expect(() => PaymentCreateSchema.parse({
      student_id: 1, amount: 1000001, payment_method: 'CASH', transaction_date: '2026-01-10'
    })).toThrow()
  })

  it('rejects invalid payment_method', () => {
    expect(() => PaymentCreateSchema.parse({
      student_id: 1, amount: 5000, payment_method: 'BITCOIN', transaction_date: '2026-01-10'
    })).toThrow()
  })
})

// ── Statement coverage: InvoiceCreateSchema ───────────────────────
describe('InvoiceCreateSchema', () => {
  it('accepts valid invoice', () => {
    const result = InvoiceCreateSchema.parse({ student_id: 1, fee_structure_id: 1, term_id: 1, due_date: '2026-03-15' })
    expect(result.due_date).toBe('2026-03-15')
  })

  it('accepts invoice with description', () => {
    const result = InvoiceCreateSchema.parse({
      student_id: 1, fee_structure_id: 1, term_id: 1, due_date: '2026-03-15', description: 'Term fee'
    })
    expect(result.description).toBe('Term fee')
  })

  it('rejects description over 500 chars', () => {
    expect(() => InvoiceCreateSchema.parse({
      student_id: 1, fee_structure_id: 1, term_id: 1, due_date: '2026-03-15', description: 'x'.repeat(501)
    })).toThrow()
  })
})

// ── Statement coverage: SystemSettingsSchema ──────────────────────
describe('SystemSettingsSchema', () => {
  it('accepts valid settings', () => {
    const result = SystemSettingsSchema.parse({
      school_name: 'Mwingi Adventist',
      school_address: 'P.O. Box 123',
      school_phone: '+254700000000',
      school_email: 'info@mwingi.ac.ke',
      currency: 'KES',
      academic_year: '2025-2026',
      current_term: 'TERM_1'
    })
    expect(result.school_name).toBe('Mwingi Adventist')
  })

  it('rejects currency not 3 chars', () => {
    expect(() => SystemSettingsSchema.parse({
      school_name: 'Test', school_address: 'Addr', school_phone: '+254700000000',
      school_email: 'a@b.com', currency: 'US', academic_year: '2025-2026', current_term: 'TERM_1'
    })).toThrow()
  })

  it('rejects invalid academic_year format', () => {
    expect(() => SystemSettingsSchema.parse({
      school_name: 'Test', school_address: 'Addr', school_phone: '+254700000000',
      school_email: 'a@b.com', currency: 'KES', academic_year: '2025', current_term: 'TERM_1'
    })).toThrow()
  })

  it('rejects invalid current_term', () => {
    expect(() => SystemSettingsSchema.parse({
      school_name: 'Test', school_address: 'Addr', school_phone: '+254700000000',
      school_email: 'a@b.com', currency: 'KES', academic_year: '2025-2026', current_term: 'TERM_4'
    })).toThrow()
  })
})

// ── Statement coverage: ReportGenerationSchema ────────────────────
describe('ReportGenerationSchema', () => {
  it('accepts valid report generation request', () => {
    const result = ReportGenerationSchema.parse({
      report_type: 'STUDENT_LEDGER', parameters: { student_id: 1 }, format: 'PDF'
    })
    expect(result.report_type).toBe('STUDENT_LEDGER')
  })

  it('accepts report with date_range', () => {
    const result = ReportGenerationSchema.parse({
      report_type: 'FINANCIAL_SUMMARY', parameters: {}, format: 'EXCEL',
      date_range: { startDate: '2026-01-01', endDate: '2026-03-31' }
    })
    expect(result.date_range?.startDate).toBe('2026-01-01')
  })

  it('rejects invalid report_type', () => {
    expect(() => ReportGenerationSchema.parse({
      report_type: 'INVALID', parameters: {}, format: 'PDF'
    })).toThrow()
  })

  it('rejects invalid format', () => {
    expect(() => ReportGenerationSchema.parse({
      report_type: 'STUDENT_LEDGER', parameters: {}, format: 'HTML'
    })).toThrow()
  })
})

// ── Statement coverage: MessageCreateSchema ───────────────────────
describe('MessageCreateSchema', () => {
  it('accepts valid message', () => {
    const result = MessageCreateSchema.parse({
      recipient_type: 'ALL_STUDENTS', subject: 'Exam Notice',
      message: 'Exams start next Monday.', delivery_method: 'SMS'
    })
    expect(result.subject).toBe('Exam Notice')
    expect(result.send_immediately).toBe(true) // default
  })

  it('accepts message with optional fields', () => {
    const result = MessageCreateSchema.parse({
      recipient_type: 'INDIVIDUAL', recipient_ids: [1, 2], subject: 'Reminder',
      message: 'Fee balance.', delivery_method: 'BOTH', send_immediately: false,
      scheduled_at: '2026-03-10T09:00:00'
    })
    expect(result.recipient_ids).toEqual([1, 2])
    expect(result.send_immediately).toBe(false)
  })

  it('rejects empty subject', () => {
    expect(() => MessageCreateSchema.parse({
      recipient_type: 'ALL_STAFF', subject: '', message: 'Hi', delivery_method: 'EMAIL'
    })).toThrow()
  })

  it('rejects message over 2000 chars', () => {
    expect(() => MessageCreateSchema.parse({
      recipient_type: 'ALL_STAFF', subject: 'Test', message: 'x'.repeat(2001), delivery_method: 'EMAIL'
    })).toThrow()
  })

  it('rejects invalid delivery_method', () => {
    expect(() => MessageCreateSchema.parse({
      recipient_type: 'ALL_STAFF', subject: 'Test', message: 'Hi', delivery_method: 'FAX'
    })).toThrow()
  })

  it('rejects invalid scheduled_at format', () => {
    expect(() => MessageCreateSchema.parse({
      recipient_type: 'ALL_STAFF', subject: 'Test', message: 'Hi', delivery_method: 'SMS',
      scheduled_at: '2026-03-10'
    })).toThrow()
  })
})
