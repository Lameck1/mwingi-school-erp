import type { NotificationResult, SMSProviderConfig } from './notification-types'

const UNKNOWN_ERROR = 'Unknown error'
const API_REQUEST_FAILED = 'API request failed'
const SMS_PROVIDER_UNSUPPORTED = 'Unsupported SMS provider'

export class SMSService {
    constructor(private readonly config: SMSProviderConfig) {}

    async send(to: string, message: string): Promise<NotificationResult> {
        const normalizedPhone = this.normalizePhone(to)

        switch (this.config.provider) {
            case 'AFRICASTALKING':
                return this.sendAfricasTalking(normalizedPhone, message)
            case 'TWILIO':
                return this.sendTwilio(normalizedPhone, message)
            case 'NEXMO':
                return this.sendNexmo(normalizedPhone, message)
            case 'CUSTOM':
                return this.sendCustom(normalizedPhone, message)
            default:
                return { success: false, error: `Unknown SMS provider: ${String(this.config.provider)}` }
        }
    }

    private buildAfricasTalkingResult(data: Record<string, unknown>): NotificationResult {
        const recipients = (data['SMSMessageData'] as { Recipients?: Array<{ status?: string; messageId?: string }> } | undefined)?.Recipients
        const firstRecipient = recipients?.[0]
        if (firstRecipient?.status === 'Success') {
            return {
                success: true,
                provider: 'AFRICASTALKING',
                ...(firstRecipient.messageId == null ? {} : { messageId: firstRecipient.messageId })
            }
        }

        return {
            success: false,
            error: firstRecipient?.status || UNKNOWN_ERROR,
            provider: 'AFRICASTALKING'
        }
    }

    private async sendAfricasTalking(to: string, message: string): Promise<NotificationResult> {
        try {
            const response = await fetch('https://api.africastalking.com/version1/messaging', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'apiKey': this.config.apiKey
                },
                body: new URLSearchParams({
                    username: this.config.apiSecret || 'sandbox',
                    to,
                    message,
                    from: this.config.senderId || ''
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
        const accountSid = this.config.apiKey
        const authToken = this.config.apiSecret

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
                        From: this.config.senderId || '',
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

    private async sendNexmo(to: string, message: string): Promise<NotificationResult> {
        try {
            const response = await fetch('https://rest.nexmo.com/sms/json', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    api_key: this.config.apiKey,
                    api_secret: this.config.apiSecret || '',
                    to,
                    from: this.config.senderId || '',
                    text: message
                })
            })

            const data = await response.json() as { messages?: Array<{ status?: string; 'message-id'?: string; 'error-text'?: string }> }
            const first = data.messages?.[0]

            if (first?.status === '0') {
                return { success: true, ...(first['message-id'] ? { messageId: first['message-id'] } : {}), provider: 'NEXMO' }
            }

            return { success: false, error: first?.['error-text'] || UNKNOWN_ERROR, provider: 'NEXMO' }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : API_REQUEST_FAILED,
                provider: 'NEXMO'
            }
        }
    }

    private async sendCustom(to: string, message: string): Promise<NotificationResult> {
        if (!this.config.baseUrl) {
            return { success: false, error: 'Custom provider requires baseUrl', provider: 'CUSTOM' }
        }

        try {
            const response = await fetch(this.config.baseUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    to,
                    message,
                    from: this.config.senderId || ''
                })
            })

            if (response.ok) {
                const data = await response.json() as { messageId?: string }
                return { success: true, ...(data.messageId ? { messageId: data.messageId } : {}), provider: 'CUSTOM' }
            }

            const data = await response.json() as { error?: string }
            return { success: false, error: data.error || UNKNOWN_ERROR, provider: 'CUSTOM' }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : API_REQUEST_FAILED,
                provider: 'CUSTOM'
            }
        }
    }

    /**
     * Normalize phone number to international format
     */
    normalizePhone(phone: string): string {
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
}
