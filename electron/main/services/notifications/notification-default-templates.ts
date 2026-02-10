import type { MessageTemplate } from './notification-types'

export const getDefaultMessageTemplates = (): Array<Omit<MessageTemplate, 'id' | 'variables' | 'is_active'>> => {
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
