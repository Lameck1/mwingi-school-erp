import { container } from '../../services/base/ServiceContainer'
import { ROLES, resolveActorId, safeHandleRawWithRole } from '../ipc-result'

import type { NotificationRequest, MessageTemplate } from '../../services/notifications/NotificationService'

const getService = () => container.resolve('NotificationService')

export function registerNotificationHandlers(): void {
    // Config
    safeHandleRawWithRole('notifications:reloadConfig', ROLES.ADMIN_ONLY, () => {
        getService().reloadConfig()
        return true
    })

    // Sending
    safeHandleRawWithRole('notifications:send', ROLES.STAFF, (
        event,
        request: NotificationRequest,
        legacyUserId?: number
    ) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) { return actor }
        return getService().send(request, actor.actorId)
    })

    safeHandleRawWithRole('notifications:sendBulkFeeReminders', ROLES.STAFF, (
        event,
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
        legacyUserId?: number
    ) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) { return actor }
        return getService().sendBulkFeeReminders(templateId, defaulters, actor.actorId)
    })

    // Templates
    safeHandleRawWithRole('notifications:getTemplates', ROLES.STAFF, () => {
        return getService().getTemplates()
    })

    safeHandleRawWithRole('notifications:getTemplate', ROLES.STAFF, (_event, id: number) => {
        return getService().getTemplate(id)
    })

    safeHandleRawWithRole('notifications:createTemplate', ROLES.STAFF, (
        event,
        template: Omit<MessageTemplate, 'id' | 'is_active' | 'variables'>,
        legacyUserId?: number
    ) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) { return actor }
        return getService().createTemplate({
            name: template.template_name,
            type: template.template_type,
            category: template.category,
            subject: template.subject,
            body: template.body,
            userId: actor.actorId
        })
    })

    safeHandleRawWithRole('notifications:getDefaultTemplates', ROLES.STAFF, () => {
        return getService().getDefaultTemplates()
    })

    // History
    safeHandleRawWithRole('notifications:getHistory', ROLES.STAFF, (_event, filters?: {
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
