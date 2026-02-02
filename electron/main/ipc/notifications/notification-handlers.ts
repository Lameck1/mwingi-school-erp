import { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from '../../electron-env'
import { NotificationService, NotificationRequest } from '../../services/notifications/NotificationService'

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
        defaulters: any[],
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
        template: any,
        userId: number
    ) => {
        return service.createTemplate(
            template.name,
            template.type,
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
    ipcMain.handle('notifications:getHistory', async (_event: IpcMainInvokeEvent, filters?: any) => {
        return service.getCommunicationHistory(filters)
    })
}
