import { type MessageTemplate } from './MessagingAPI';

export interface NotificationRequest {
    recipientType: 'STUDENT' | 'STAFF' | 'GUARDIAN'
    recipientId: number
    templateId?: number
    channel: 'SMS' | 'EMAIL'
    to: string
    subject?: string
    message: string
    variables?: Record<string, string>
}

export interface NotificationResult {
    success: boolean
    messageId?: string
    error?: string
    provider?: string
}

export interface CommunicationLog {
    id: number
    recipient_type: string
    recipient_id: number
    message_type: string
    subject: string | null
    message_body: string
    status: string
    error_message: string | null
    sent_by_user_id: number
    created_at: string
    sent_by_name?: string
}

type IPCResult<T> = T | { success: false; error: string; errors?: string[] };

export interface NotificationAPI {
    reloadNotificationConfig: () => Promise<boolean>
    sendNotification: (request: NotificationRequest, userId: number) => Promise<NotificationResult>
    sendBulkFeeReminders: (templateId: number, defaulters: Array<{
        student_id: number
        student_name: string
        guardian_name: string
        guardian_phone: string
        admission_number: string
        class_name: string
        balance: number
    }>, userId: number) => Promise<{ sent: number; failed: number; errors: string[] }>
    getNotificationTemplates: () => Promise<IPCResult<MessageTemplate[]>>
    createNotificationTemplate: (template: Omit<MessageTemplate, 'id' | 'variables' | 'is_active'>, userId: number) => Promise<{ success: boolean; id?: number; errors?: string[] }>
    getDefaultTemplates: () => Promise<IPCResult<MessageTemplate[]>>
    getNotificationHistory: (filters?: {
        recipientType?: string
        recipientId?: number
        channel?: string
        status?: string
        startDate?: string
        endDate?: string
    }) => Promise<IPCResult<CommunicationLog[]>>
}
