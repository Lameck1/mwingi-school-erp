export interface MessageTemplate {
    id: number;
    template_name: string;
    template_type: 'SMS' | 'EMAIL';
    subject?: string;
    body: string;
    placeholders?: string;
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
    created_at: string;
}

export interface SMSSendOptions {
    to: string;
    message: string;
    recipientId?: number;
    recipientType?: string;
}

export interface EmailSendOptions {
    to: string;
    subject: string;
    body: string;
    recipientId?: number;
    recipientType?: string;
}

export interface MessagingAPI {
    getTemplates: () => Promise<MessageTemplate[]>;
    saveTemplate: (template: Partial<MessageTemplate>) => Promise<{ success: boolean; id?: number }>;
    deleteTemplate: (id: number) => Promise<{ success: boolean }>;
    sendSMS: (options: SMSSendOptions) => Promise<{ success: boolean; messageId?: string; error?: string }>;
    sendEmail: (options: EmailSendOptions) => Promise<{ success: boolean; messageId?: string; error?: string }>;
    getMessageLogs: (limit?: number) => Promise<MessageLog[]>;
}
