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

import type { MessageTemplate, NotificationRequest } from '../../services/notifications/notification-types'

const getService = () => container.resolve('NotificationService')
type TemplateCategory = MessageTemplate['category']

export function normalizeTemplateCategory(category: string): TemplateCategory {
    if (category === 'ACADEMIC') {
        return 'ATTENDANCE'
    }
    if (category === 'FINANCE') {
        return 'FEE_REMINDER'
    }
    if (category === 'ADMIN') {
        return 'GENERAL'
    }
    return category as TemplateCategory
}

export function registerNotificationHandlers(): void {
    // Config
    validatedHandler('notifications:reloadConfig', ROLES.ADMIN_ONLY, z.void(), () => {
        getService().reloadConfig()
        return true
    })

    // Sending
    validatedHandlerMulti('notifications:send', ROLES.STAFF, SendNotificationTuple, (
        _event,
        [request, _legacyId],
        actorCtx
    ) => {
        if (_legacyId !== undefined && _legacyId !== actorCtx.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        const normalizedRequest: NotificationRequest = {
            recipientType: request.recipientType,
            recipientId: request.recipientId,
            channel: request.channel,
            to: request.to,
            message: request.message,
            ...(request.subject === undefined ? {} : { subject: request.subject }),
            ...(request.templateId === undefined ? {} : { templateId: request.templateId }),
            ...(request.variables === undefined ? {} : { variables: request.variables })
        }
        return getService().send(normalizedRequest, actorCtx.id)
    })

    validatedHandlerMulti('notifications:sendBulkFeeReminders', ROLES.STAFF, SendBulkFeeRemindersTuple, (
        _event,
        [templateId, defaulters, _legacyId],
        actorCtx
    ) => {
        if (_legacyId !== undefined && _legacyId !== actorCtx.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
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
        _event,
        [template, _legacyId],
        actorCtx
    ) => {
        if (_legacyId !== undefined && _legacyId !== actorCtx.id) {
            throw new Error("Unauthorized: renderer user mismatch")
        }
        return getService().createTemplate({
            name: template.template_name,
            type: template.template_type,
            category: normalizeTemplateCategory(template.category),
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
        if (!filters) {
            return getService().getCommunicationHistory()
        }
        const normalized: {
            recipientType?: string
            recipientId?: number
            channel?: string
            status?: string
            startDate?: string
            endDate?: string
        } = {}
        if (filters.recipientType !== undefined) {
            normalized.recipientType = filters.recipientType
        }
        if (filters.recipientId !== undefined) {
            normalized.recipientId = filters.recipientId
        }
        if (filters.channel !== undefined) {
            normalized.channel = filters.channel
        }
        if (filters.status !== undefined) {
            normalized.status = filters.status
        }
        if (filters.startDate !== undefined) {
            normalized.startDate = filters.startDate
        }
        if (filters.endDate !== undefined) {
            normalized.endDate = filters.endDate
        }
        return getService().getCommunicationHistory(normalized)
    })
}
