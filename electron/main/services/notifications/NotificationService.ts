import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

export interface NotificationProvider {
    type: 'SMS' | 'EMAIL'
    name: string
    config: Record<string, string>
    isActive: boolean
}

export interface MessageTemplate {
    id: number
    template_name: string
    template_type: 'SMS' | 'EMAIL'
    category: 'FEE_REMINDER' | 'PAYMENT_RECEIPT' | 'ATTENDANCE' | 'GENERAL' | 'PAYSLIP'
    subject: string | null
    body: string
    variables: string[] // Extracted from {{variable}} patterns
    is_active: boolean
}

export interface NotificationRequest {
    recipientType: 'STUDENT' | 'STAFF' | 'GUARDIAN'
    recipientId: number
    templateId?: number
    channel: 'SMS' | 'EMAIL'
    to: string // Phone or email
    subject?: string
    message: string
    variables?: Record<string, string>
}

export interface NotificationResult {
    success: boolean
    messageId?: string
    error?: string
    provider?: string
}

export interface SMSProviderConfig {
    provider: 'AFRICASTALKING' | 'TWILIO' | 'NEXMO' | 'CUSTOM'
    apiKey: string
    apiSecret?: string
    senderId?: string
    baseUrl?: string
}

export interface EmailProviderConfig {
    provider: 'SMTP' | 'SENDGRID' | 'MAILGUN'
    host?: string
    port?: number
    user?: string
    password?: string
    apiKey?: string
    fromEmail: string
    fromName: string
}

export interface CommunicationLog {
    id: number
    recipient_type: string
    recipient_id: number
    message_type: string
    subject: string | null
    message_body: string
    status: string
    error_message: string | null
    sent_by_user_id: number
    created_at: string
    sent_by_name?: string
}

export class NotificationService {
    private get db() { return getDatabase() }
    private isConfigLoaded = false
    private smsConfig: SMSProviderConfig | null = null
    private emailConfig: EmailProviderConfig | null = null

    constructor() {
    }

    private loadConfig(): void {
        if (this.isConfigLoaded) return
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
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'

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
            default:
                return { success: false, error: 'Unsupported SMS provider' }
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

            const data = await response.json()

            if (data.SMSMessageData?.Recipients?.[0]?.status === 'Success') {
                return {
                    success: true,
                    messageId: data.SMSMessageData.Recipients[0].messageId,
                    provider: 'AFRICASTALKING'
                }
            }

            return {
                success: false,
                error: data.SMSMessageData?.Recipients?.[0]?.status || 'Unknown error',
                provider: 'AFRICASTALKING'
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'API request failed',
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

            const data = await response.json()

            if (data.sid) {
                return { success: true, messageId: data.sid, provider: 'TWILIO' }
            }

            return { success: false, error: data.message || 'Unknown error', provider: 'TWILIO' }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'API request failed',
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
            default:
                return { success: false, error: 'Unsupported email provider' }
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

            const data = await response.json()
            return { success: false, error: data.errors?.[0]?.message || 'Unknown error', provider: 'SENDGRID' }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'API request failed',
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
    private processTemplate(template: string, variables: Record<string, string>): string {
        return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            return variables[key] !== undefined ? variables[key] : match
        })
    }

    /**
     * Normalize phone number to international format
     */
    private normalizePhone(phone: string): string {
        // Remove spaces and dashes
        let normalized = phone.replace(/[\s-]/g, '')

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
        name: string,
        type: 'SMS' | 'EMAIL',
        category: MessageTemplate['category'],
        subject: string | null,
        body: string,
        userId: number
    ): { success: boolean; id?: number; errors?: string[] } {
        if (!name?.trim()) return { success: false, errors: ['Template name is required'] }
        if (!body?.trim()) return { success: false, errors: ['Template body is required'] }

        // Extract variables from body
        const variableMatches = body.match(/\{\{(\w+)\}\}/g) || []
        const variables = Array.from(new Set(variableMatches.map(m => m.replace(/[{}]/g, ''))))

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
        return [
            {
                template_name: 'Fee Reminder',
                template_type: 'SMS',
                category: 'FEE_REMINDER',
                subject: null,
                body: 'Dear {{guardian_name}}, this is a reminder that {{student_name}} has an outstanding fee balance of KES {{balance}}. Please settle at your earliest convenience. Thank you.'
            },
            {
                template_name: 'Payment Confirmation',
                template_type: 'SMS',
                category: 'PAYMENT_RECEIPT',
                subject: null,
                body: 'Payment Received: KES {{amount}} for {{student_name}}. Receipt No: {{receipt_number}}. New Balance: KES {{balance}}. Thank you for your payment.'
            },
            {
                template_name: 'Absence Notification',
                template_type: 'SMS',
                category: 'ATTENDANCE',
                subject: null,
                body: 'Dear {{guardian_name}}, this is to inform you that {{student_name}} was absent from school on {{date}}. Please contact the school for any concerns.'
            },
            {
                template_name: 'Fee Reminder Email',
                template_type: 'EMAIL',
                category: 'FEE_REMINDER',
                subject: 'Fee Payment Reminder - {{student_name}}',
                body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1e40af;">Fee Payment Reminder</h2>
            <p>Dear {{guardian_name}},</p>
            <p>This is a reminder that <strong>{{student_name}}</strong> has an outstanding fee balance.</p>
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0;"><strong>Student:</strong> {{student_name}}</p>
              <p style="margin: 10px 0 0;"><strong>Admission No:</strong> {{admission_number}}</p>
              <p style="margin: 10px 0 0;"><strong>Class:</strong> {{class_name}}</p>
              <p style="margin: 10px 0 0;"><strong>Outstanding Balance:</strong> <span style="color: #dc2626; font-size: 18px;">KES {{balance}}</span></p>
            </div>
            <p>Please arrange for payment at your earliest convenience.</p>
            <p>Thank you for your continued support.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            <p style="color: #6b7280; font-size: 12px;">{{school_name}}<br>{{school_address}}</p>
          </div>`
            },
            {
                template_name: 'Payslip Notification',
                template_type: 'SMS',
                category: 'PAYSLIP',
                subject: null,
                body: 'Salary Notification: Your salary for {{period}} has been processed. Net Pay: KES {{net_salary}}. Thank you.'
            }
        ]
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
    getCommunicationHistory(filters?: {
        recipientType?: string
        recipientId?: number
        channel?: string
        status?: string
        startDate?: string
        endDate?: string
    }): CommunicationLog[] {
        let query = `
      SELECT cl.*, u.full_name as sent_by_name
      FROM message_log cl
      LEFT JOIN user u ON cl.sent_by_user_id = u.id
      WHERE 1=1
    `
        const params: unknown[] = []

        if (filters?.recipientType) {
            query += ' AND cl.recipient_type = ?'
            params.push(filters.recipientType)
        }
        if (filters?.recipientId) {
            query += ' AND cl.recipient_id = ?'
            params.push(filters.recipientId)
        }
        if (filters?.channel) {
            query += ' AND cl.message_type = ?'
            params.push(filters.channel)
        }
        if (filters?.status) {
            query += ' AND cl.status = ?'
            params.push(filters.status)
        }
        if (filters?.startDate && filters?.endDate) {
            query += ' AND DATE(cl.created_at) BETWEEN ? AND ?'
            params.push(filters.startDate, filters.endDate)
        }

        query += ' ORDER BY cl.created_at DESC LIMIT 500'

        return this.db.prepare(query).all(...params) as CommunicationLog[]
    }
}

