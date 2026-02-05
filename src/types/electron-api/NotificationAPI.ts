import { MessageTemplate } from './MessagingAPI';

export interface NotificationRequest {
    type: string;
    recipient_id: number;
    data: Record<string, any>;
    channels?: ('SMS' | 'EMAIL' | 'IN_APP')[];
}

export interface NotificationAPI {
    reloadNotificationConfig: () => Promise<{ success: boolean }>;
    sendNotification: (request: NotificationRequest, userId: number) => Promise<{ success: boolean; errors?: string[] }>;
    sendBulkFeeReminders: (templateId: number, defaulters: any[], userId: number) => Promise<{ success: boolean; count: number }>;
    getNotificationTemplates: () => Promise<MessageTemplate[]>;
    createNotificationTemplate: (template: Partial<MessageTemplate>, userId: number) => Promise<{ success: boolean; id?: number; errors?: string[] }>;
    getDefaultTemplates: () => Promise<MessageTemplate[]>;
    getNotificationHistory: (filters: any) => Promise<any[]>;
}
