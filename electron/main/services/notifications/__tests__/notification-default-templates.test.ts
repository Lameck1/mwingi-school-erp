import { describe, it, expect } from 'vitest'
import { getDefaultMessageTemplates } from '../notification-default-templates'

describe('getDefaultMessageTemplates', () => {
  const templates = getDefaultMessageTemplates()

  it('returns an array', () => {
    expect(Array.isArray(templates)).toBe(true)
  })

  it('returns exactly 5 templates', () => {
    expect(templates).toHaveLength(5)
  })

  it('each template has required fields', () => {
    for (const t of templates) {
      expect(t).toHaveProperty('template_name')
      expect(t).toHaveProperty('template_type')
      expect(t).toHaveProperty('category')
      expect(t).toHaveProperty('body')
      expect(typeof t.template_name).toBe('string')
      expect(typeof t.template_type).toBe('string')
      expect(typeof t.category).toBe('string')
      expect(typeof t.body).toBe('string')
      expect(t.body.length).toBeGreaterThan(0)
    }
  })

  it('template_type is either SMS or EMAIL', () => {
    for (const t of templates) {
      expect(['SMS', 'EMAIL']).toContain(t.template_type)
    }
  })

  it('category is one of the expected values', () => {
    const validCategories = ['FEE_REMINDER', 'PAYMENT_RECEIPT', 'ATTENDANCE', 'GENERAL', 'PAYSLIP']
    for (const t of templates) {
      expect(validCategories).toContain(t.category)
    }
  })

  it('SMS templates have subject = null', () => {
    const smsTemplates = templates.filter(t => t.template_type === 'SMS')
    expect(smsTemplates.length).toBeGreaterThan(0)
    for (const t of smsTemplates) {
      expect(t.subject).toBeNull()
    }
  })

  it('EMAIL templates have a non-null subject', () => {
    const emailTemplates = templates.filter(t => t.template_type === 'EMAIL')
    expect(emailTemplates.length).toBeGreaterThan(0)
    for (const t of emailTemplates) {
      expect(t.subject).not.toBeNull()
      expect(typeof t.subject).toBe('string')
      expect((t.subject as string).length).toBeGreaterThan(0)
    }
  })

  it('contains the "Fee Reminder" template', () => {
    expect(templates.find(t => t.template_name === 'Fee Reminder')).toBeDefined()
  })

  it('contains the "Payment Confirmation" template', () => {
    expect(templates.find(t => t.template_name === 'Payment Confirmation')).toBeDefined()
  })

  it('contains the "Absence Notification" template', () => {
    expect(templates.find(t => t.template_name === 'Absence Notification')).toBeDefined()
  })

  it('contains the "Fee Reminder Email" template', () => {
    expect(templates.find(t => t.template_name === 'Fee Reminder Email')).toBeDefined()
  })

  it('contains the "Payslip Notification" template', () => {
    expect(templates.find(t => t.template_name === 'Payslip Notification')).toBeDefined()
  })

  it('Fee Reminder body references expected variables', () => {
    const t = templates.find(t => t.template_name === 'Fee Reminder')!
    expect(t.body).toContain('{{guardian_name}}')
    expect(t.body).toContain('{{student_name}}')
    expect(t.body).toContain('{{balance}}')
  })

  it('Payment Confirmation body references receipt_number', () => {
    const t = templates.find(t => t.template_name === 'Payment Confirmation')!
    expect(t.body).toContain('{{receipt_number}}')
    expect(t.body).toContain('{{amount}}')
  })

  it('Fee Reminder Email body contains HTML', () => {
    const t = templates.find(t => t.template_name === 'Fee Reminder Email')!
    expect(t.body).toContain('<div')
    expect(t.body).toContain('</div>')
  })

  it('returns a new array each call (no shared reference)', () => {
    const a = getDefaultMessageTemplates()
    const b = getDefaultMessageTemplates()
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})
