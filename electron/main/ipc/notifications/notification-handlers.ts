import { ipcMain } from '../../electron-env'
import { NotificationService, type NotificationRequest, type MessageTemplate } from '../../services/notifications/NotificationService'

import type { IpcMainInvokeEvent } from 'electron'

let cachedService: NotificationService | null = null
const getService = () => {
    cachedService ??= new NotificationService()
    return cachedService
}

export function registerNotificationHandlers(): void {
    // Config
    ipcMain.handle('notifications:reloadConfig', async () => {
        getService().reloadConfig()
        return true
    })

    // Sending
    ipcMain.handle('notifications:send', async (
        _event: IpcMainInvokeEvent,
        request: NotificationRequest,
        userId: number
    ) => {
        return getService().send(request, userId)
    })

    ipcMain.handle('notifications:sendBulkFeeReminders', async (
        _event: IpcMainInvokeEvent,
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
    ipcMain.handle('notifications:getTemplates', async () => {
        return getService().getTemplates()
    })

    ipcMain.handle('notifications:getTemplate', async (_event: IpcMainInvokeEvent, id: number) => {
        return getService().getTemplate(id)
    })

    ipcMain.handle('notifications:createTemplate', async (
        _event: IpcMainInvokeEvent,
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

    ipcMain.handle('notifications:getDefaultTemplates', async () => {
        return getService().getDefaultTemplates()
    })

    // History
    ipcMain.handle('notifications:getHistory', async (_event: IpcMainInvokeEvent, filters?: {
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
