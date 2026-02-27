import { z } from 'zod'

export const InstallmentScheduleSchema = z.object({
    installment_number: z.number().int().min(1),
    percentage: z.number().min(0.01).max(100),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
    description: z.string().optional()
})

export const InstallmentPolicyCreateSchema = z.object({
    policy_name: z.string().min(3),
    academic_year_id: z.number().int().positive(),
    stream_id: z.number().int().positive().optional(),
    student_type: z.enum(['DAY_SCHOLAR', 'BOARDER', 'ALL']),
    schedules: z.array(InstallmentScheduleSchema).min(2, 'At least 2 installments required')
})

export const InstallmentPolicyGetSchema = z.object({
    academicYearId: z.number().int().positive(),
    streamId: z.number().int().positive().optional(),
    studentType: z.enum(['DAY_SCHOLAR', 'BOARDER', 'ALL']).optional()
})

export const PolicyIdSchema = z.number().int().positive()
export const InvoiceIdSchema = z.number().int().positive()
