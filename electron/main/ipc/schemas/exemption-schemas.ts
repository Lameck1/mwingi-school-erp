import { z } from 'zod'

export const ExemptionCreateSchema = z.object({
    student_id: z.number(),
    academic_year_id: z.number(),
    term_id: z.number().optional(),
    fee_category_id: z.number().optional(),
    exemption_percentage: z.number().min(0).max(100),
    exemption_reason: z.string().min(1, 'Reason is required'),
    notes: z.string().optional()
})

export const ExemptionGetAllSchema = z.object({
    studentId: z.number().optional(),
    academicYearId: z.number().optional(),
    termId: z.number().optional(),
    status: z.string().optional()
}).optional()

export const ExemptionGetByIdSchema = z.tuple([z.number()])

export const ExemptionGetStudentSchema = z.tuple([
    z.number(), // studentId
    z.number(), // academicYearId
    z.number()  // termId
])

export const ExemptionCalculateSchema = z.tuple([
    z.number(), // studentId
    z.number(), // academicYearId
    z.number(), // termId
    z.number(), // categoryId
    z.number()  // originalAmount
])

export const ExemptionRevokeSchema = z.tuple([
    z.number(), // id
    z.string().min(1, 'Revoke reason is required'),
    z.number().optional() // legacyUserId
])

export const ExemptionGetStatsSchema = z.tuple([z.number().optional()])
