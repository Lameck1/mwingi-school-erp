import { getDefaultMessageTemplates } from './notification-default-templates'
import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

const UNKNOWN_ERROR = 'Unknown error'
const API_REQUEST_FAILED = 'API request failed'
const SMS_PROVIDER_UNSUPPORTED = 'Unsupported SMS provider'
const EMAIL_PROVIDER_UNSUPPORTED = 'Unsupported email provider'
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
    private smsConfig: SMSProviderConfig | null = null
    private emailConfig: EmailProviderConfig | null = null

    private loadConfig(): void {
        if (this.isConfigLoaded) {return}
        try {
            const settings = this.db.prepare('SELECT * FROM settings LIMIT 1').get() as Record<string, string> | undefined

            if (settings?.sms_provider_config) {
                this.smsConfig = JSON.parse(settings.sms_provider_config)
            }

            if (settings?.email_provider_config) {
                this.emailConfig = JSON.parse(settings.email_provider_config)
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

            let result: NotificationResult

            if (request.channel === 'SMS') {
                result = await this.sendSMS(request.to, message)
            } else {
                result = await this.sendEmail(request.to, subject || 'Notification', message)
            }

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
     * Send SMS
     */
    private async sendSMS(to: string, message: string): Promise<NotificationResult> {
        if (!this.smsConfig) {
            return { success: false, error: 'SMS provider not configured' }
        }

        const normalizedPhone = this.normalizePhone(to)

        switch (this.smsConfig.provider) {
            case 'AFRICASTALKING':
                return this.sendAfricasTalking(normalizedPhone, message)
            case 'TWILIO':
                return this.sendTwilio(normalizedPhone, message)
            case 'NEXMO':
            case 'CUSTOM':
                return { success: false, error: SMS_PROVIDER_UNSUPPORTED }
            default:
                return { success: false, error: `Unknown SMS provider: ${String(this.smsConfig.provider)}` }
        }
    }

    private buildAfricasTalkingResult(data: Record<string, unknown>): NotificationResult {
        const recipients = (data.SMSMessageData as { Recipients?: Array<{ status?: string; messageId?: string }> } | undefined)?.Recipients
        const firstRecipient = recipients?.[0]
        if (firstRecipient?.status === 'Success') {
            return {
                success: true,
                messageId: firstRecipient.messageId,
                provider: 'AFRICASTALKING'
            }
        }

        return {
            success: false,
            error: firstRecipient?.status || UNKNOWN_ERROR,
            provider: 'AFRICASTALKING'
        }
    }

    private async sendAfricasTalking(to: string, message: string): Promise<NotificationResult> {
        const config = this.smsConfig!

        try {
            const response = await fetch('https://api.africastalking.com/version1/messaging', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'apiKey': config.apiKey
                },
                body: new URLSearchParams({
                    username: config.apiSecret || 'sandbox',
                    to,
                    message,
                    from: config.senderId || ''
                })
            })

            const data = await response.json() as Record<string, unknown>
            return this.buildAfricasTalkingResult(data)
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : API_REQUEST_FAILED,
                provider: 'AFRICASTALKING'
            }
        }
    }

    private async sendTwilio(to: string, message: string): Promise<NotificationResult> {
        const config = this.smsConfig!
        const accountSid = config.apiKey
        const authToken = config.apiSecret

        try {
            const response = await fetch(
                `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: new URLSearchParams({
                        To: to,
                        From: config.senderId || '',
                        Body: message
                    })
                }
            )

            const data = await response.json() as { sid?: string; message?: string }

            if (data.sid) {
                return { success: true, messageId: data.sid, provider: 'TWILIO' }
            }

            return { success: false, error: data.message || UNKNOWN_ERROR, provider: 'TWILIO' }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : API_REQUEST_FAILED,
                provider: 'TWILIO'
            }
        }
    }

    /**
     * Send Email
     */
    private async sendEmail(to: string, subject: string, body: string): Promise<NotificationResult> {
        if (!this.emailConfig) {
            return { success: false, error: 'Email provider not configured' }
        }

        switch (this.emailConfig.provider) {
            case 'SENDGRID':
                return this.sendSendGrid(to, subject, body)
            case 'SMTP':
                return this.sendSMTP(to, subject, body)
            case 'MAILGUN':
                return { success: false, error: EMAIL_PROVIDER_UNSUPPORTED }
            default:
                return { success: false, error: `Unknown email provider: ${String(this.emailConfig.provider)}` }
        }
    }

    private async sendSendGrid(to: string, subject: string, body: string): Promise<NotificationResult> {
        const config = this.emailConfig!

        try {
            const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    personalizations: [{ to: [{ email: to }] }],
                    from: { email: config.fromEmail, name: config.fromName },
                    subject,
                    content: [{ type: 'text/html', value: body }]
                })
            })

            if (response.status === 202) {
                return { success: true, provider: 'SENDGRID' }
            }

            const data = await response.json() as { errors?: Array<{ message?: string }> }
            return { success: false, error: data.errors?.[0]?.message || UNKNOWN_ERROR, provider: 'SENDGRID' }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : API_REQUEST_FAILED,
                provider: 'SENDGRID'
            }
        }
    }

    private async sendSMTP(to: string, subject: string, body: string): Promise<NotificationResult> {
        // Use nodemailer for SMTP
        const { default: nodemailer } = await import('nodemailer')
        const config = this.emailConfig!

        try {
            const transporter = nodemailer.createTransport({
                host: config.host,
                port: config.port || 587,
                secure: config.port === 465,
                auth: {
                    user: config.user,
                    pass: config.password
                }
            })

            const info = await transporter.sendMail({
                from: `"${config.fromName}" <${config.fromEmail}>`,
                to,
                subject,
                html: body
            })

            return { success: true, messageId: info.messageId, provider: 'SMTP' }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'SMTP error',
                provider: 'SMTP'
            }
        }
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
     * Normalize phone number to international format
     */
    private normalizePhone(phone: string): string {
        // Remove spaces and dashes
        let normalized = phone.replaceAll(/[\s-]/g, '')

        // Handle Kenya numbers
        if (normalized.startsWith('0')) {
            normalized = '+254' + normalized.substring(1)
        } else if (normalized.startsWith('254')) {
            normalized = '+' + normalized
        } else if (!normalized.startsWith('+')) {
            normalized = '+254' + normalized
        }

        return normalized
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
