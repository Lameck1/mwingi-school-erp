import { ipcRenderer } from 'electron'

export function createCommunicationsAPI() {
  return {
    // Messaging
    sendSMS: (options: unknown) => ipcRenderer.invoke('message:sendSms', options),
    sendEmail: (options: unknown) => ipcRenderer.invoke('message:sendEmail', options),
    getMessageTemplates: () => ipcRenderer.invoke('message:getTemplates'),
    saveMessageTemplate: (template: unknown) => ipcRenderer.invoke('message:saveTemplate', template),
    getMessageLogs: (limit?: number) => ipcRenderer.invoke('message:getLogs', limit),

    // Notifications
    reloadNotificationConfig: () => ipcRenderer.invoke('notifications:reloadConfig'),
    sendNotification: (request: unknown, userId: number) => ipcRenderer.invoke('notifications:send', request, userId),
    sendBulkFeeReminders: (templateId: number, defaulters: unknown[], userId: number) =>
      ipcRenderer.invoke('notifications:sendBulkFeeReminders', templateId, defaulters, userId),
    getNotificationTemplates: () => ipcRenderer.invoke('notifications:getTemplates'),
    createNotificationTemplate: (template: unknown, userId: number) => ipcRenderer.invoke('notifications:createTemplate', template, userId),
    getDefaultTemplates: () => ipcRenderer.invoke('notifications:getDefaultTemplates'),
    getNotificationHistory: (filters?: unknown) => ipcRenderer.invoke('notifications:getHistory', filters),
  }
}
