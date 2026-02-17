import type { EmailProviderConfig, NotificationResult } from './notification-types'

const UNKNOWN_ERROR = 'Unknown error'
const API_REQUEST_FAILED = 'API request failed'
const EMAIL_PROVIDER_UNSUPPORTED = 'Unsupported email provider'

export class EmailService {
    constructor(private readonly config: EmailProviderConfig) {}

    async send(to: string, subject: string, body: string): Promise<NotificationResult> {
        switch (this.config.provider) {
            case 'SENDGRID':
                return this.sendSendGrid(to, subject, body)
            case 'SMTP':
                return this.sendSMTP(to, subject, body)
            case 'MAILGUN':
                return { success: false, error: EMAIL_PROVIDER_UNSUPPORTED }
            default:
                return { success: false, error: `Unknown email provider: ${String(this.config.provider)}` }
        }
    }

    private async sendSendGrid(to: string, subject: string, body: string): Promise<NotificationResult> {
        try {
            const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    personalizations: [{ to: [{ email: to }] }],
                    from: { email: this.config.fromEmail, name: this.config.fromName },
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

        try {
            const transporter = nodemailer.createTransport({
                host: this.config.host,
                port: this.config.port || 587,
                secure: this.config.port === 465,
                auth: {
                    user: this.config.user,
                    pass: this.config.password
                }
            })

            const info = await transporter.sendMail({
                from: `"${this.config.fromName}" <${this.config.fromEmail}>`,
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
}
