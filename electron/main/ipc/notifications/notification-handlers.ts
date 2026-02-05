import { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from '../../electron-env'
import { NotificationService, NotificationRequest, MessageTemplate } from '../../services/notifications/NotificationService'

const service = new NotificationService()

export function registerNotificationHandlers(): void {
    // Config
    ipcMain.handle('notifications:reloadConfig', async () => {
        service.reloadConfig()
        return true
    })

    // Sending
    ipcMain.handle('notifications:send', async (
        _event: IpcMainInvokeEvent,
        request: NotificationRequest,
        userId: number
    ) => {
        return service.send(request, userId)
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
        return service.sendBulkFeeReminders(templateId, defaulters, userId)
    })

    // Templates
    ipcMain.handle('notifications:getTemplates', async () => {
        return service.getTemplates()
    })

    ipcMain.handle('notifications:getTemplate', async (_event: IpcMainInvokeEvent, id: number) => {
        return service.getTemplate(id)
    })

    ipcMain.handle('notifications:createTemplate', async (
        _event: IpcMainInvokeEvent,
        template: Omit<MessageTemplate, 'id' | 'is_active' | 'variables'>,
        userId: number
    ) => {
        return service.createTemplate(
            template.template_name,
            template.template_type,
            template.category,
            template.subject,
            template.body,
            userId
        )
    })

    ipcMain.handle('notifications:getDefaultTemplates', async () => {
        return service.getDefaultTemplates()
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
        return service.getCommunicationHistory(filters)
    })
}
