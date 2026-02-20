import { z } from 'zod'

export const ReportDateRangeSchema = z.tuple([
    z.string().min(10, 'Start date is required'), // YYYY-MM-DD
    z.string().min(10, 'End date is required')
])

export const StudentLedgerSchema = z.tuple([
    z.number().int().positive(),
    z.number().int().positive(),
    z.string().min(10),
    z.string().min(10)
])

export const ReportOptionalStreamSchema = z.tuple([
    z.string().min(10, 'Start date is required'),
    z.string().min(10, 'End date is required'),
    z.number().optional()
])

export const ReportPeriodSchema = z.number().int().positive()

export const ReportTermSchema = z.number().int().positive().optional()

export const ReportAsOfDateSchema = z.string().min(10)

export const ReportGenericFilterSchema = z.object({
    academicYear: z.string().optional(),
    streamId: z.number().optional(),
    status: z.string().optional()
}).optional()

export const NEMISExportConfigSchema = z.object({
    export_type: z.enum(['STUDENTS', 'STAFF', 'ENROLLMENT', 'FINANCIAL']),
    format: z.enum(['CSV', 'JSON']),
    filters: z.object({
        class_id: z.number().optional(),
        academic_year: z.string().optional(),
        gender: z.enum(['M', 'F']).optional(),
        status: z.string().optional()
    }).optional(),
    academic_year: z.string().optional()
})

export const NEMISStudentSchema = z.object({
    nemis_upi: z.string(),
    full_name: z.string(),
    date_of_birth: z.string(),
    gender: z.enum(['M', 'F']),
    admission_number: z.string(),
    class_name: z.string(),
    guardian_name: z.string(),
    guardian_phone: z.string(),
    county: z.string(),
    sub_county: z.string(),
    special_needs: z.string().nullable()
})

// For scheduler
export const ScheduledReportSchema = z.object({
    report_name: z.string().min(1),
    report_type: z.string().min(1),
    parameters: z.string().optional(), // JSON string
    schedule_type: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'TERM_END', 'YEAR_END']),
    day_of_week: z.number().min(0).max(6).nullable(),
    day_of_month: z.number().min(1).max(31).nullable(),
    time_of_day: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format HH:MM'),
    recipients: z.string().min(1), // JSON array string
    export_format: z.enum(['PDF', 'EXCEL', 'CSV']),
    is_active: z.boolean()
})

export const CreateScheduleSchema = z.tuple([
    ScheduledReportSchema.omit({
        // These are handled by system or are optional/generated
        // Actually the interface had id, last_run_at, next_run_at, created_at as generated
        // The handler receives Omit<ScheduledReport, 'id' | ...>
    }).omit({
        // We need to match the omit in the handler type definition
        // Omit<ScheduledReport, 'id' | 'last_run_at' | 'next_run_at' | 'created_at' | 'created_by_user_id'>
        // Wait, handler signature: data: Omit<ScheduledReport, 'id' | 'last_run_at' | 'next_run_at' | 'created_at'>
        // created_by_user_id is set by actor
    }).omit({
        // ID is auto
        // Timestamps are auto
        // CreatedBy is actor
    }).partial().required({
        report_name: true,
        report_type: true,
        schedule_type: true,
        time_of_day: true,
        recipients: true
    }), // This might be too complex for simple tuple matching if client sends partial object
    z.number().optional() // legacyUserId
])

// Let's refine Schedule schemas
export const ScheduledReportInputSchema = z.object({
    report_name: z.string(),
    report_type: z.string(),
    parameters: z.string().optional(),
    schedule_type: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'TERM_END', 'YEAR_END']),
    day_of_week: z.number().nullable(),
    day_of_month: z.number().nullable(),
    time_of_day: z.string(),
    recipients: z.string(),
    export_format: z.enum(['PDF', 'EXCEL', 'CSV']),
    is_active: z.boolean()
})

export const CreateScheduleTuple = z.tuple([
    ScheduledReportInputSchema,
    z.number().optional()
])

export const UpdateScheduleTuple = z.tuple([
    z.number(),
    ScheduledReportInputSchema.partial(),
    z.number().optional()
])
