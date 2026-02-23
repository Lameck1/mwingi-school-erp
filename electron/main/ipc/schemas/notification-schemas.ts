import { z } from 'zod'

const LEGACY_TEMPLATE_CATEGORY_MAP = {
    ACADEMIC: 'ATTENDANCE',
    FINANCE: 'FEE_REMINDER',
    ADMIN: 'GENERAL'
} as const

export const NotificationTemplateCategorySchema = z.enum([
    'FEE_REMINDER',
    'PAYMENT_RECEIPT',
    'ATTENDANCE',
    'GENERAL',
    'PAYSLIP'
])

const LegacyNotificationTemplateCategorySchema = z.enum(['ACADEMIC', 'FINANCE', 'ADMIN'])

export const NotificationTemplateCategoryInputSchema = z
    .union([NotificationTemplateCategorySchema, LegacyNotificationTemplateCategorySchema])
    .transform((category): z.infer<typeof NotificationTemplateCategorySchema> => {
        if (category in LEGACY_TEMPLATE_CATEGORY_MAP) {
            return LEGACY_TEMPLATE_CATEGORY_MAP[category as keyof typeof LEGACY_TEMPLATE_CATEGORY_MAP]
        }
        return category as z.infer<typeof NotificationTemplateCategorySchema>
    })

export const NotificationRequestSchema = z.object({
    recipientType: z.enum(['STUDENT', 'STAFF', 'GUARDIAN']),
    recipientId: z.number(),
    channel: z.enum(['SMS', 'EMAIL']),
    to: z.string(),
    subject: z.string().optional(),
    message: z.string(),
    templateId: z.number().optional(),
    variables: z.record(z.string(), z.string()).optional()
})

export const SendNotificationTuple = z.tuple([
    NotificationRequestSchema,
    z.number().optional()
])

export const DefaulterSchema = z.object({
    student_id: z.number(),
    student_name: z.string(),
    guardian_name: z.string(),
    guardian_phone: z.string(),
    admission_number: z.string(),
    class_name: z.string(),
    balance: z.number()
})

export const SendBulkFeeRemindersTuple = z.tuple([
    z.number(), // templateId
    z.array(DefaulterSchema),
    z.number().optional() // legacyUserId
])

export const CreateTemplateSchema = z.object({
    template_name: z.string().min(1),
    template_type: z.enum(['SMS', 'EMAIL']),
    category: NotificationTemplateCategoryInputSchema,
    subject: z.string().nullable(),
    body: z.string().min(1)
})

export const CreateTemplateTuple = z.tuple([
    CreateTemplateSchema,
    z.number().optional()
])

export const NotificationFilterSchema = z.object({
    recipientType: z.string().optional(),
    recipientId: z.number().optional(),
    channel: z.string().optional(),
    status: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional()
}).optional()
