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
            case 'CUSTOM':
                return { success: false, error: SMS_PROVIDER_UNSUPPORTED }
            default:
                return { success: false, error: `Unknown SMS provider: ${String(this.config.provider)}` }
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
