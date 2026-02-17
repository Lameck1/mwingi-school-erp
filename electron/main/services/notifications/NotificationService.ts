import { EmailService } from './EmailService'
import { getDefaultMessageTemplates } from './notification-default-templates'
import { SMSService } from './SMSService'
import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'
import { ConfigService } from '../ConfigService'

const UNKNOWN_ERROR = 'Unknown error'
export type {
    CommunicationLog,
    EmailProviderConfig,
    MessageTemplate,
    NotificationProvider,
    NotificationRequest,
    NotificationResult,
    SMSProviderConfig
} from './notification-types'

import type {
    CommunicationLog,
    EmailProviderConfig,
    MessageTemplate,
    NotificationRequest,
    NotificationResult,
    SMSProviderConfig
} from './notification-types'

type CommunicationHistoryFilters = {
    recipientType?: string
    recipientId?: number
    channel?: string
    status?: string
    startDate?: string
    endDate?: string
}

const buildCommunicationHistoryQuery = (filters?: CommunicationHistoryFilters) => {
    let query = `
      SELECT cl.*, u.full_name as sent_by_name
      FROM message_log cl
      LEFT JOIN user u ON cl.sent_by_user_id = u.id
      WHERE 1=1
    `
    const params: unknown[] = []

    const addStringClause = (value: string | undefined, clause: string) => {
        if (!value) {
            return
        }
        query += ` AND ${clause}`
        params.push(value)
    }

    const addNumberClause = (value: number | undefined, clause: string) => {
        if (value === undefined) {
            return
        }
        query += ` AND ${clause}`
        params.push(value)
    }

    addStringClause(filters?.recipientType, 'cl.recipient_type = ?')
    addNumberClause(filters?.recipientId, 'cl.recipient_id = ?')
    addStringClause(filters?.channel, 'cl.message_type = ?')
    addStringClause(filters?.status, 'cl.status = ?')

    const startDate = filters?.startDate
    const endDate = filters?.endDate
    if (startDate && endDate) {
        query += ' AND DATE(cl.created_at) BETWEEN ? AND ?'
        params.push(startDate, endDate)
    }

    query += ' ORDER BY cl.created_at DESC LIMIT 500'

    return { query, params }
}

export class NotificationService {
    private get db() { return getDatabase() }
    private isConfigLoaded = false
    private smsService: SMSService | null = null
    private emailService: EmailService | null = null

    private loadConfig(): void {
        if (this.isConfigLoaded) {return}
        try {
            // Read SMS config from encrypted system_config via ConfigService (F03 remediation)
            const smsApiKey = ConfigService.getConfig('sms_api_key')
            const smsApiSecret = ConfigService.getConfig('sms_api_secret')
            const smsSenderId = ConfigService.getConfig('sms_sender_id')

            if (smsApiKey) {
                const smsConfig: SMSProviderConfig = {
                    provider: 'AFRICASTALKING',
                    apiKey: smsApiKey,
                    apiSecret: smsApiSecret || '',
                    senderId: smsSenderId || ''
                }
                this.smsService = new SMSService(smsConfig)
            }

            // Email config still read from school_settings (not migrated yet)
            const settings = this.db.prepare('SELECT * FROM school_settings WHERE id = 1').get() as Record<string, string> | undefined
            if (settings?.['email_provider_config']) {
                const emailConfig: EmailProviderConfig = JSON.parse(settings['email_provider_config'])
                this.emailService = new EmailService(emailConfig)
            }
            this.isConfigLoaded = true
        } catch (error) {
            console.error('Failed to load notification config:', error)
        }
    }

    /**
     * Reload configuration (called after settings update)
     */
    reloadConfig(): void {
        this.isConfigLoaded = false
        this.smsService = null
        this.emailService = null
        this.loadConfig()
    }

    /**
     * Send notification
     */
    async send(request: NotificationRequest, userId: number): Promise<NotificationResult> {
        this.loadConfig()
        try {
            // Process template if provided
            let message = request.message
            let subject = request.subject

            if (request.templateId) {
                const template = this.getTemplate(request.templateId)
                if (template) {
                    message = this.processTemplate(template.body, request.variables || {})
                    if (template.subject) {
                        subject = this.processTemplate(template.subject, request.variables || {})
                    }
                }
            }

            const result = await this.dispatchMessage(request.channel, request.to, subject || 'Notification', message)

            // Log the communication
            this.logCommunication({
                recipientType: request.recipientType,
                recipientId: request.recipientId,
                channel: request.channel,
                to: request.to,
                subject,
                message,
                status: result.success ? 'SENT' : 'FAILED',
                externalId: result.messageId,
                errorMessage: result.error,
                userId
            })

            return result
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : UNKNOWN_ERROR

            this.logCommunication({
                recipientType: request.recipientType,
                recipientId: request.recipientId,
                channel: request.channel,
                to: request.to,
                subject: request.subject,
                message: request.message,
                status: 'FAILED',
                errorMessage,
                userId
            })

            return { success: false, error: errorMessage }
        }
    }

    /**
     * Dispatch message to the appropriate channel service
     */
    private async dispatchMessage(channel: 'SMS' | 'EMAIL', to: string, subject: string, message: string): Promise<NotificationResult> {
        if (channel === 'SMS') {
            return this.smsService
                ? this.smsService.send(to, message)
                : { success: false, error: 'SMS provider not configured' }
        }
        return this.emailService
            ? this.emailService.send(to, subject, message)
            : { success: false, error: 'Email provider not configured' }
    }

    /**
     * Process template with variables
     */
    private processTemplate(template: string, variables: Partial<Record<string, string>>): string {
        return template.replaceAll(/\{\{(\w+)\}\}/g, (match: string, key: string) => {
            return variables[key] ?? match
        })
    }

    /**
     * Log communication to database
     */
    private logCommunication(data: {
        recipientType: string
        recipientId: number
        channel: string
        to: string
        subject?: string
        message: string
        status: string
        externalId?: string
        errorMessage?: string
        userId: number
    }): void {
        try {
            this.db.prepare(`
        INSERT INTO message_log (
          recipient_type, recipient_id, message_type, subject, message_body,
          status, external_id, error_message, sent_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
                data.recipientType,
                data.recipientId,
                data.channel,
                data.subject || null,
                data.message,
                data.status,
                data.externalId || null,
                data.errorMessage || null,
                data.userId
            )
        } catch (e) {
            console.error('Failed to log communication:', e)
        }
    }

    // ==================== Template Management ====================

    /**
     * Get all templates
     */
    getTemplates(): MessageTemplate[] {
        return this.db.prepare(`
      SELECT * FROM message_template WHERE is_active = 1 ORDER BY category, template_name
    `).all() as MessageTemplate[]
    }

    /**
     * Get template by ID
     */
    getTemplate(id: number): MessageTemplate | null {
        return this.db.prepare('SELECT * FROM message_template WHERE id = ?').get(id) as MessageTemplate | undefined || null
    }

    /**
     * Create template
     */
    createTemplate(
        input: {
            name: string
            type: 'SMS' | 'EMAIL'
            category: MessageTemplate['category']
            subject: string | null
            body: string
            userId: number
        }
    ): { success: boolean; id?: number; errors?: string[] } {
        const { name, type, category, subject, body, userId } = input
        if (!name.trim()) {return { success: false, errors: ['Template name is required'] }}
        if (!body.trim()) {return { success: false, errors: ['Template body is required'] }}

        // Extract variables from body
        const variableMatches = body.match(/\{\{(\w+)\}\}/g) || []
        const variables = Array.from(new Set(variableMatches.map(m => m.replaceAll(/[{}]/g, ''))))

        const result = this.db.prepare(`
      INSERT INTO message_template (template_name, template_type, category, subject, body, variables)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, type, category, subject, body, JSON.stringify(variables))

        logAudit(userId, 'CREATE', 'message_template', result.lastInsertRowid as number, null, { name, type, category })

        return { success: true, id: result.lastInsertRowid as number }
    }

    /**
     * Get default templates for seeding
     */
    getDefaultTemplates(): Array<Omit<MessageTemplate, 'id' | 'variables' | 'is_active'>> {
        return getDefaultMessageTemplates()
    }

    // ==================== Bulk Operations ====================

    /**
     * Send bulk fee reminders to all defaulters
     */
    async sendBulkFeeReminders(
        templateId: number,
        defaulters: Array<{
            student_id: number
            student_name: string
            guardian_name: string
            guardian_phone: string
            admission_number: string
            class_name: string
            balance: number
        }>,
        userId: number
    ): Promise<{ sent: number; failed: number; errors: string[] }> {
        let sent = 0
        let failed = 0
        const errors: string[] = []

        for (const defaulter of defaulters) {
            if (!defaulter.guardian_phone) {
                failed++
                errors.push(`${defaulter.student_name}: No phone number`)
                continue
            }

            const result = await this.send({
                recipientType: 'GUARDIAN',
                recipientId: defaulter.student_id,
                templateId,
                channel: 'SMS',
                to: defaulter.guardian_phone,
                message: '', // Will use template
                variables: {
                    student_name: defaulter.student_name,
                    guardian_name: defaulter.guardian_name,
                    admission_number: defaulter.admission_number,
                    class_name: defaulter.class_name,
                    balance: String(defaulter.balance)
                }
            }, userId)

            if (result.success) {
                sent++
            } else {
                failed++
                errors.push(`${defaulter.student_name}: ${result.error}`)
            }

            // Rate limiting - wait 100ms between messages
            await new Promise(resolve => setTimeout(resolve, 100))
        }

        return { sent, failed, errors }
    }

    /**
     * Get communication history
     */
    getCommunicationHistory(filters?: CommunicationHistoryFilters): CommunicationLog[] {
        const { query, params } = buildCommunicationHistoryQuery(filters)
        return this.db.prepare(query).all(...params) as CommunicationLog[]
    }
}
