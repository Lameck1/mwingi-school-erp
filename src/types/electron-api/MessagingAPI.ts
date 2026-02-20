export interface MessageTemplate {
    id: number;
    template_name: string;
    template_type: 'SMS' | 'EMAIL';
    category: string;
    subject: string | null;
    body: string;
    variables: string[];
    is_active: boolean;
}

export interface MessageLog {
    id: number;
    template_id?: number;
    recipient_type: string;
    recipient_id?: number;
    recipient_contact: string;
    message_type: 'SMS' | 'EMAIL';
    subject?: string;
    message_body: string;
    status: 'PENDING' | 'SENT' | 'FAILED';
    external_id?: string;
    error_message?: string;
    sent_by_user_id: number;
    sent_by_name?: string;
    created_at: string;
}

export interface SMSSendOptions {
    to: string;
    message: string;
    recipientId?: number;
    recipientType?: string;
    userId?: number;
}

export interface EmailSendOptions {
    to: string;
    subject: string;
    body: string;
    recipientId?: number;
    recipientType?: string;
    userId?: number;
}

type IPCResult<T> = T | { success: false; error: string; errors?: string[] };

export interface MessagingAPI {
    getMessageTemplates: () => Promise<IPCResult<MessageTemplate[]>>;
    saveMessageTemplate: (template: Partial<MessageTemplate>) => Promise<{ success: boolean; id?: number }>;
    sendSMS: (options: SMSSendOptions) => Promise<{ success: boolean; messageId?: string; error?: string }>;
    sendEmail: (options: EmailSendOptions) => Promise<{ success: boolean; messageId?: string; error?: string }>;
    getMessageLogs: (limit?: number) => Promise<IPCResult<MessageLog[]>>;
}
