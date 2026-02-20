import { z } from 'zod'

export const NotificationRequestSchema = z.object({
    recipientType: z.enum(['STUDENT', 'STAFF', 'GUARDIAN', 'USER']),
    recipientId: z.number(),
    channel: z.enum(['SMS', 'EMAIL']),
    to: z.string(),
    subject: z.string().optional(),
    message: z.string(),
    templateId: z.number().optional(),
    variables: z.record(z.string()).optional()
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
    category: z.enum(['ACADEMIC', 'FINANCE', 'ADMIN', 'GENERAL']),
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
