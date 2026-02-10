import { getDatabase } from '../../database';
import { ipcMain } from '../../electron-env';
import { NotificationService } from '../../services/notifications/NotificationService';

import type { IpcMainInvokeEvent } from 'electron';

export function registerMessageHandlers(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = new Proxy({} as any, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        get: (_target, prop) => (getDatabase() as any)[prop]
    });

    // ======== MESSAGE TEMPLATES ========
    ipcMain.handle('message:getTemplates', async () => {
        return db.prepare('SELECT * FROM message_template WHERE is_active = 1').all();
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ipcMain.handle('message:saveTemplate', async (_event: IpcMainInvokeEvent, template: any) => {
        if (template.id) {
            db.prepare(`UPDATE message_template SET 
        template_name = ?, template_type = ?, subject = ?, body = ?, placeholders = ? 
        WHERE id = ?`
            ).run(
                template.template_name, template.template_type, template.subject,
                template.body, template.placeholders, template.id
            );
            return { success: true, id: template.id };
        } else {
            const result = db.prepare(`INSERT INTO message_template 
        (template_name, template_type, subject, body, placeholders) 
        VALUES (?, ?, ?, ?, ?)`
            ).run(
                template.template_name, template.template_type, template.subject,
                template.body, template.placeholders
            );
            return { success: true, id: result.lastInsertRowid };
        }
    });

    // ======== SENDING SMS ========
    ipcMain.handle('message:sendSms', async (_event: IpcMainInvokeEvent, options: { to: string, message: string, recipientId?: number, recipientType?: string, userId: number }) => {
        const settings = db.prepare('SELECT sms_api_key, sms_api_secret, sms_sender_id FROM school_settings WHERE id = 1').get() as { sms_api_key: string; sms_api_secret: string; sms_sender_id: string } | undefined;

        // Create log entry as PENDING
        const logStmt = db.prepare(`INSERT INTO message_log 
      (recipient_type, recipient_id, recipient_contact, message_type, message_body, status, sent_by_user_id) 
      VALUES (?, ?, ?, 'SMS', ?, 'PENDING', ?)`);

        const result = logStmt.run(
            options.recipientType || 'OTHER',
            options.recipientId || null,
            options.to,
            options.message,
            options.userId
        );
        const logId = result.lastInsertRowid;

        try {
            // IMPLEMENTATION NOTE: Africa's Talking / Twilio integration would go here
            // For now, we simulate success if credentials exist, or return failure for missing config
            if (!settings?.sms_api_key) {
                throw new Error('SMS API Key not configured in settings');
            }

            // Simulation of async API call
            // In production: const response = await africastalking.send(...)

            db.prepare('UPDATE message_log SET status = ?, external_id = ? WHERE id = ?')
                .run('SENT', `SIM-${Date.now()}`, logId);

            return { success: true, messageId: `SIM-${Date.now()}` };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            db.prepare("UPDATE message_log SET status = 'FAILED', error_message = ? WHERE id = ?")
                .run(errorMessage, logId);
            return { success: false, error: errorMessage };
        }
    });

    // ======== SENDING EMAIL ========
    ipcMain.handle('message:sendEmail', async (_event: IpcMainInvokeEvent, options: { to: string; subject: string; body: string; recipientId?: number; recipientType?: string; userId: number }) => {
        const service = new NotificationService();
        const recipientType = (options.recipientType ?? 'GUARDIAN') as 'STUDENT' | 'STAFF' | 'GUARDIAN';
        const result = await service.send({
            recipientType,
            recipientId: options.recipientId || 0,
            channel: 'EMAIL',
            to: options.to,
            subject: options.subject,
            message: options.body
        }, options.userId);
        return result;
    });

    // ======== MESSAGE LOGS ========
    ipcMain.handle('message:getLogs', async (_event: IpcMainInvokeEvent, limit = 50) => {
        return db.prepare('SELECT * FROM message_log ORDER BY created_at DESC LIMIT ?').all(limit);
    });
}
