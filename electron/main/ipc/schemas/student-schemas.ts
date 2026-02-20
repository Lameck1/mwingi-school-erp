import { z } from 'zod'

export const StudentFiltersSchema = z.object({
    search: z.string().optional(),
    streamId: z.number().optional(),
    isActive: z.boolean().optional()
}).optional()

export const StudentCreateSchema = z.object({
    admission_number: z.string().min(1, 'Admission number is required'),
    first_name: z.string().min(1, 'First name is required'),
    middle_name: z.string().optional(),
    last_name: z.string().min(1, 'Last name is required'),
    date_of_birth: z.string(), // ISO date string validation in handler or regex here
    gender: z.enum(['MALE', 'FEMALE']),
    student_type: z.enum(['BOARDER', 'DAY_SCHOLAR']),
    admission_date: z.string(),
    guardian_name: z.string(),
    guardian_phone: z.string(),
    guardian_email: z.string().email().optional().or(z.literal('')),
    guardian_relationship: z.string(),
    address: z.string(),
    notes: z.string().optional(),
    is_active: z.boolean().optional(),
    stream_id: z.number().optional()
})

// Tuple for update: [id, data, legacyUserId?]
export const StudentUpdateSchema = z.tuple([
    z.number().int().positive(),
    StudentCreateSchema.partial(),
    z.number().optional() // legacyUserId
])

export const StudentDeactivateSchema = z.tuple([
    z.number().int().positive(),
    z.number().optional() // legacyUserId
])

export const StudentPurgeSchema = z.tuple([
    z.number().int().positive(),
    z.string().optional() // reason
])

export const StudentPhotoUploadSchema = z.tuple([
    z.number().int().positive(), // studentId
    z.string().min(1) // base64 data URL
])

export const StudentPhotoRemoveSchema = z.number().int().positive()
