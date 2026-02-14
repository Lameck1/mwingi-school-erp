import { ipcRenderer } from 'electron'

import type { SMSOptions, EmailOptions, MessageTemplateInput, NotificationRequest, DefaulterEntry, NotificationTemplateInput, NotificationHistoryFilters } from '../types'

export function createCommunicationsAPI() {
  return {
    // Messaging
    sendSMS: (options: SMSOptions) => ipcRenderer.invoke('message:sendSms', options),
    sendEmail: (options: EmailOptions) => ipcRenderer.invoke('message:sendEmail', options),
    getMessageTemplates: () => ipcRenderer.invoke('message:getTemplates'),
    saveMessageTemplate: (template: MessageTemplateInput) => ipcRenderer.invoke('message:saveTemplate', template),
    getMessageLogs: (limit?: number) => ipcRenderer.invoke('message:getLogs', limit),

    // Notifications
    reloadNotificationConfig: () => ipcRenderer.invoke('notifications:reloadConfig'),
    sendNotification: (request: NotificationRequest, userId: number) => ipcRenderer.invoke('notifications:send', request, userId),
    sendBulkFeeReminders: (templateId: number, defaulters: DefaulterEntry[], userId: number) =>
      ipcRenderer.invoke('notifications:sendBulkFeeReminders', templateId, defaulters, userId),
    getNotificationTemplates: () => ipcRenderer.invoke('notifications:getTemplates'),
    createNotificationTemplate: (template: NotificationTemplateInput, userId: number) => ipcRenderer.invoke('notifications:createTemplate', template, userId),
    getDefaultTemplates: () => ipcRenderer.invoke('notifications:getDefaultTemplates'),
    getNotificationHistory: (filters?: NotificationHistoryFilters) => ipcRenderer.invoke('notifications:getHistory', filters),
  }
}
