import log from 'electron-log'

import { getDatabase } from '../database'
import { ConfigService } from './ConfigService'

interface MessageTemplateInput {
    id?: number
    template_name: string
    template_type: 'SMS' | 'EMAIL'
    subject?: string
    body: string
    placeholders?: string
}

interface SMSOptions {
    to: string
    message: string
    recipientId?: number
    recipientType?: string
    userId: number
}

export class MessageService {
    private get db() { return getDatabase() }

    getTemplates() {
        return this.db.prepare('SELECT * FROM message_template WHERE is_active = 1').all()
    }

    saveTemplate(template: MessageTemplateInput) {
        if (template.id) {
            this.db.prepare(
                `UPDATE message_template SET
                    template_name = ?, template_type = ?, subject = ?, body = ?, placeholders = ?
                WHERE id = ?`
            ).run(
                template.template_name, template.template_type, template.subject,
                template.body, template.placeholders, template.id
            )
            return { success: true, id: template.id }
        }

        const result = this.db.prepare(
            `INSERT INTO message_template
                (template_name, template_type, subject, body, placeholders)
            VALUES (?, ?, ?, ?, ?)`
        ).run(
            template.template_name, template.template_type, template.subject,
            template.body, template.placeholders
        )
        return { success: true, id: result.lastInsertRowid }
    }

    sendSms(options: SMSOptions) {
        // Read SMS credentials from encrypted system_config (F03 remediation)
        const smsApiKey = ConfigService.getConfig('sms_api_key')

        const logStmt = this.db.prepare(
            `INSERT INTO message_log
                (recipient_type, recipient_id, recipient_contact, message_type, message_body, status, sent_by_user_id)
            VALUES (?, ?, ?, 'SMS', ?, 'PENDING', ?)`
        )

        const result = logStmt.run(
            options.recipientType || 'OTHER',
            options.recipientId || null,
            options.to,
            options.message,
            options.userId
        )
        const logId = result.lastInsertRowid

        try {
            if (!smsApiKey) {
                throw new Error('SMS API Key not configured in settings')
            }

            this.db.prepare('UPDATE message_log SET status = ?, external_id = ? WHERE id = ?')
                .run('SENT', `SIM-${Date.now()}`, logId)

            return { success: true, messageId: `SIM-${Date.now()}` }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.db.prepare("UPDATE message_log SET status = 'FAILED', error_message = ? WHERE id = ?")
                .run(errorMessage, logId)
            log.warn('SMS send failed:', errorMessage)
            return { success: false, error: errorMessage }
        }
    }

    getLogs(limit = 50) {
        return this.db.prepare('SELECT * FROM message_log ORDER BY created_at DESC LIMIT ?').all(limit)
    }
}
