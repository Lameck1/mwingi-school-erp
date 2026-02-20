import { z } from 'zod'

import { container } from '../../services/base/ServiceContainer'
import { ROLES } from '../ipc-result'
import {
    SendNotificationTuple,
    SendBulkFeeRemindersTuple,
    CreateTemplateTuple,
    NotificationFilterSchema
} from '../schemas/notification-schemas'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

import type { NotificationRequest } from '../../services/notifications/NotificationService'

const getService = () => container.resolve('NotificationService')

export function registerNotificationHandlers(): void {
    // Config
    validatedHandler('notifications:reloadConfig', ROLES.ADMIN_ONLY, z.void(), () => {
        getService().reloadConfig()
        return true
    })

    // Sending
    validatedHandlerMulti('notifications:send', ROLES.STAFF, SendNotificationTuple, (
        event,
        [request, _legacyId],
        actorCtx
    ) => {
        return getService().send(request as NotificationRequest, actorCtx.id)
    })

    validatedHandlerMulti('notifications:sendBulkFeeReminders', ROLES.STAFF, SendBulkFeeRemindersTuple, (
        event,
        [templateId, defaulters, _legacyId],
        actorCtx
    ) => {
        return getService().sendBulkFeeReminders(templateId, defaulters, actorCtx.id)
    })

    // Templates
    validatedHandler('notifications:getTemplates', ROLES.STAFF, z.void(), () => {
        return getService().getTemplates()
    })

    validatedHandler('notifications:getTemplate', ROLES.STAFF, z.number(), (_event, id) => {
        return getService().getTemplate(id)
    })

    validatedHandlerMulti('notifications:createTemplate', ROLES.STAFF, CreateTemplateTuple, (
        event,
        [template, _legacyId],
        actorCtx
    ) => {
        return getService().createTemplate({
            name: template.template_name,
            type: template.template_type,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            category: template.category as any,
            subject: template.subject,
            body: template.body,
            userId: actorCtx.id
        })
    })

    validatedHandler('notifications:getDefaultTemplates', ROLES.STAFF, z.void(), () => {
        return getService().getDefaultTemplates()
    })

    // History
    validatedHandler('notifications:getHistory', ROLES.STAFF, NotificationFilterSchema, (_event, filters) => {
        return getService().getCommunicationHistory(filters)
    })
}
