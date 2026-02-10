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
  variables: string[]
  is_active: boolean
}

export interface NotificationRequest {
  recipientType: 'STUDENT' | 'STAFF' | 'GUARDIAN'
  recipientId: number
  templateId?: number
  channel: 'SMS' | 'EMAIL'
  to: string
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
