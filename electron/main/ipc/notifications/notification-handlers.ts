import { container } from '../../services/base/ServiceContainer'
import { safeHandleRaw } from '../ipc-result'

import type { NotificationRequest, MessageTemplate } from '../../services/notifications/NotificationService'

const getService = () => container.resolve('NotificationService')

export function registerNotificationHandlers(): void {
    // Config
    safeHandleRaw('notifications:reloadConfig', () => {
        getService().reloadConfig()
        return true
    })

    // Sending
    safeHandleRaw('notifications:send', (
        _event,
        request: NotificationRequest,
        userId: number
    ) => {
        return getService().send(request, userId)
    })

    safeHandleRaw('notifications:sendBulkFeeReminders', (
        _event,
        templateId: number,
        defaulters: Array<{
            student_id: number;
            student_name: string;
            guardian_name: string;
            guardian_phone: string;
            admission_number: string;
            class_name: string;
            balance: number;
        }>,
        userId: number
    ) => {
        return getService().sendBulkFeeReminders(templateId, defaulters, userId)
    })

    // Templates
    safeHandleRaw('notifications:getTemplates', () => {
        return getService().getTemplates()
    })

    safeHandleRaw('notifications:getTemplate', (_event, id: number) => {
        return getService().getTemplate(id)
    })

    safeHandleRaw('notifications:createTemplate', (
        _event,
        template: Omit<MessageTemplate, 'id' | 'is_active' | 'variables'>,
        userId: number
    ) => {
        return getService().createTemplate({
            name: template.template_name,
            type: template.template_type,
            category: template.category,
            subject: template.subject,
            body: template.body,
            userId
        })
    })

    safeHandleRaw('notifications:getDefaultTemplates', () => {
        return getService().getDefaultTemplates()
    })

    // History
    safeHandleRaw('notifications:getHistory', (_event, filters?: {
        recipientType?: string;
        recipientId?: number;
        channel?: string;
        status?: string;
        startDate?: string;
        endDate?: string;
    }) => {
        return getService().getCommunicationHistory(filters)
    })
}
