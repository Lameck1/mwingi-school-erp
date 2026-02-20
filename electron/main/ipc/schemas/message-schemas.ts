import { z } from 'zod'

export const MessageGetTemplatesSchema = z.void()

export const MessageSaveTemplateSchema = z.object({
    id: z.number().optional(),
    template_name: z.string().min(1, 'Template name is required'),
    subject: z.string().optional(),
    body: z.string().min(1, 'Body is required'),
    template_type: z.enum(['SMS', 'EMAIL']),
    placeholders: z.string().optional()
})

export const MessageSendSmsSchema = z.object({
    to: z.string().min(1, 'Recipient number is required'),
    message: z.string().min(1, 'Message body is required'),
    recipientId: z.number().optional(),
    userId: z.number().optional()
})

export const MessageSendEmailSchema = z.object({
    to: z.string().email('Invalid email address'),
    subject: z.string().min(1, 'Subject is required'),
    body: z.string().min(1, 'Email body is required'),
    recipientId: z.number().optional(),
    recipientType: z.string().optional(),
    userId: z.number().optional() // legacy
})

export const MessageGetLogsSchema = z.tuple([z.number().optional()])
