import { formatCurrencyFromCents } from './format'

export interface PrintOptions {
  title: string
  template: 'receipt' | 'invoice' | 'statement' | 'report' | 'payslip'
  data: Record<string, unknown>
  schoolSettings?: Record<string, unknown>
  orientation?: 'portrait' | 'landscape'
}

export interface PrintPreviewData {
  title: string
  html?: string
  pdfUrl?: string
  onDownload?: () => void
}

type PrintPreviewListener = (preview: PrintPreviewData | null) => void

const previewListeners = new Set<PrintPreviewListener>()
let activePreview: PrintPreviewData | null = null

function notifyPreviewListeners(preview: PrintPreviewData | null): void {
  activePreview = preview
  previewListeners.forEach((listener) => listener(preview))
}

export function subscribePrintPreview(listener: PrintPreviewListener): () => void {
  previewListeners.add(listener)
  listener(activePreview)
  return () => {
    previewListeners.delete(listener)
  }
}

export function closePrintPreview(): void {
  notifyPreviewListeners(null)
}

function openPrintPreview(preview: PrintPreviewData): void {
  notifyPreviewListeners(preview)
}

export function previewPDF(title: string, pdfUrl: string): void {
  openPrintPreview({
    title,
    pdfUrl
  })
}

export function previewHTML(title: string, html: string, onDownload?: () => void): void {
  openPrintPreview({
    title,
    html,
    onDownload
  })
}

function getHeadStylesHtml(): string {
  return Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((node) => node.outerHTML)
    .join('\n')
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function safeString(value: unknown): string {
  if (typeof value === 'string') { return value }
  if (value == null) { return '' }
  if (typeof value === 'object') { return JSON.stringify(value) }
  return String(value)
}

function buildHtmlDocument(params: {
  title: string
  bodyContent: string
  embeddedStyles: string
  orientation: 'portrait' | 'landscape'
  includeAppStyles?: boolean
}): string {
  const headStyles = params.includeAppStyles ? getHeadStylesHtml() : ''
  const safeTitle = escapeHtml(params.title)

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${safeTitle}</title>
        ${headStyles}
        <style>
          @page { size: A4 ${params.orientation}; margin: 10mm; }
          ${params.embeddedStyles}
        </style>
      </head>
      <body>
        ${params.bodyContent}
      </body>
    </html>
  `
}

export function printCurrentView(params?: { title?: string; selector?: string; orientation?: 'portrait' | 'landscape' }): void {
  const selector = params?.selector
  const target = selector
    ? document.querySelector(selector)
    : document.querySelector('main')

  if (!(target instanceof HTMLElement)) {
    globalThis.print()
    return
  }

  const bodyClass = escapeHtml(document.body.className || '')
  const html = buildHtmlDocument({
    title: params?.title ?? document.title,
    orientation: params?.orientation ?? 'portrait',
    includeAppStyles: true,
    embeddedStyles: `
      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff !important;
        color: #0f172a !important;
        font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      .print-container {
        width: 100%;
      }
      .print-only-hide {
        display: none !important;
      }
    `,
    bodyContent: `<div class="${bodyClass}"><div class="print-container">${target.outerHTML}</div></div>`
  })

  openPrintPreview({
    title: params?.title ?? 'Print Preview',
    html
  })
}

export function printDocument(options: PrintOptions): void {
  const { title, template, data, schoolSettings, orientation = 'portrait' } = options
  const html = generatePrintHTML(template, data, schoolSettings, title, orientation)

  openPrintPreview({
    title,
    html
  })
}

const safeStr = (v: unknown, fallback: string): string => (typeof v === 'string' && v) ? v : fallback
const safeNum = (v: unknown, fallback: number): number => (typeof v === 'number') ? v : fallback

function generatePrintHTML(
  template: string,
  data: Record<string, unknown>,
  settings: Record<string, unknown> | undefined,
  title: string,
  orientation: 'portrait' | 'landscape'
) {
  interface LedgerRow {
    debit_credit?: string
    amount?: number
    transaction_date?: string
    date?: string
    receipt_number?: string
    invoice_number?: string
    ref?: string
    runningBalance?: number
    running_balance?: number
    description?: string
  }

  const schoolName = safeStr(settings?.['schoolName'], 'Mwingi Adventist School')
  const schoolAddress = safeStr(settings?.['address'], 'P.O Box 123, Mwingi')
  const schoolPhone = safeStr(settings?.['phone'], '0700 000 000')
  const schoolEmail = safeStr(settings?.['email'], 'info@mwingischool.ac.ke')

  const css = `
    html, body {
      margin: 0;
      padding: 0;
      font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #1e293b;
      line-height: 1.5;
      font-size: 12px;
      background: #ffffff;
    }
    .print-content {
      padding: 20px;
    }
    .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
    .school-name { font-size: 24px; font-weight: bold; color: #0f172a; text-transform: uppercase; }
    .school-info { font-size: 11px; color: #64748b; }
    .doc-title { font-size: 18px; font-weight: bold; margin: 15px 0; text-align: center; text-transform: uppercase; }
    table { border-collapse: collapse; margin-bottom: 20px; width: 100%; }
    th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
    th { background-color: #f8fafc; font-weight: 600; text-transform: uppercase; font-size: 10px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
    .meta-box { border: 1px solid #e2e8f0; padding: 10px; border-radius: 4px; }
    .meta-label { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: bold; }
    .meta-value { font-size: 12px; font-weight: 600; }
    .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
    .signatures { display: flex; justify-content: space-between; margin-top: 50px; }
    .sig-line { border-top: 1px solid #000; width: 200px; padding-top: 5px; text-align: center; font-size: 11px; }
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 100px;
      opacity: 0.03;
      font-weight: bold;
      pointer-events: none;
      z-index: -1;
    }
  `

  let content = ''

  if (template === 'statement') {
    const ledger = (Array.isArray(data['ledger']) ? data['ledger'] : []) as LedgerRow[]
    content = `
      <div class="meta-grid">
        <div class="meta-box">
          <div class="meta-label">Student Details</div>
          <div class="meta-value">${escapeHtml(safeString(data['studentName']))}</div>
          <div>ADM: ${escapeHtml(safeString(data['admissionNumber']))}</div>
          <div>Stream: ${escapeHtml(safeString(data['streamName']))}</div>
        </div>
        <div class="meta-box">
          <div class="meta-label">Statement Summary</div>
          <div>Opening: ${formatCurrencyFromCents(safeNum(data['openingBalance'], 0))}</div>
          <div style="margin-top: 5px; font-weight: bold;">
            ${safeNum(data['closingBalance'], 0) < 0
        ? `Credit Surplus: <span style="color: #10b981">${formatCurrencyFromCents(Math.abs(safeNum(data['closingBalance'], 0)))} (CR)</span>`
        : `Balance Due: <span style="color: #f59e0b">${formatCurrencyFromCents(safeNum(data['closingBalance'], 0))}</span>`
      }
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Ref</th>
            <th>Description</th>
            <th style="text-align: right">Debit</th>
            <th style="text-align: right">Credit</th>
            <th style="text-align: right">Balance</th>
          </tr>
        </thead>
        <tbody>
          ${ledger.map((row) => {
        const isDebit = row.debit_credit === 'DEBIT'
        const amount = Number(row.amount ?? 0)
        const debit = isDebit ? amount : 0
        const credit = isDebit ? 0 : amount
        const date = row.transaction_date || row.date
        const ref = row.receipt_number || row.invoice_number || row.ref || '-'
        const balance = row.runningBalance || row.running_balance || 0

        return `
              <tr>
                <td>${date ? new Date(date).toLocaleDateString() : 'Invalid Date'}</td>
                <td>${escapeHtml(ref)}</td>
                <td>${escapeHtml(row.description ?? '')}</td>
                <td style="text-align: right">${debit > 0 ? formatCurrencyFromCents(debit) : '-'}</td>
                <td style="text-align: right">${credit > 0 ? formatCurrencyFromCents(credit) : '-'}</td>
                <td style="text-align: right">${formatCurrencyFromCents(balance)}</td>
              </tr>
            `
      }).join('')}
        </tbody>
      </table>

      <div class="signatures">
        <div class="sig-line">School Accountant</div>
        <div class="sig-line">Parent/Guardian</div>
      </div>
    `
  } else if (template === 'receipt') {
    content = `
      <div class="meta-grid">
        <div class="meta-box">
          <div class="meta-label">Receipt For</div>
          <div class="meta-value">${escapeHtml(safeString(data['studentName']))}</div>
          <div>ADM: ${escapeHtml(safeString(data['admissionNumber']))}</div>
        </div>
        <div class="meta-box">
          <div class="meta-label">Receipt Details</div>
          <div class="meta-value">No: ${escapeHtml(safeString(data['receiptNumber']))}</div>
          <div>Date: ${new Date(safeStr(data['date'], '')).toLocaleDateString()}</div>
          <div>Mode: ${escapeHtml(safeString(data['paymentMode']))}</div>
        </div>
      </div>

      <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; margin-bottom: 20px;">
        <div style="font-size: 14px; text-align: center;">Amount Received</div>
        <div style="font-size: 24px; font-weight: bold; text-align: center; margin: 10px 0;">
          ${formatCurrencyFromCents(safeNum(data['amount'], 0))}
        </div>
        <div style="text-align: center; font-style: italic; color: #64748b;">
          ${escapeHtml(safeString(data['amountInWords']))}
        </div>
      </div>

      <div class="signatures">
        <div class="sig-line">Authorized Signatory</div>
      </div>
    `
  } else if (template === 'invoice') {
    interface InvoiceItem {
      description?: string
      amount?: number
    }
    const items = (Array.isArray(data['items']) ? data['items'] : []) as InvoiceItem[]
    const totalAmount = safeNum(data['totalAmount'], items.reduce((sum, item) => sum + safeNum(item.amount, 0), 0))

    content = `
      <div class="meta-grid">
        <div class="meta-box">
          <div class="meta-label">Bill To</div>
          <div class="meta-value">${escapeHtml(safeString(data['studentName']))}</div>
          <div>ADM: ${escapeHtml(safeString(data['admissionNumber']))}</div>
          <div>Stream: ${escapeHtml(safeString(data['streamName']))}</div>
        </div>
        <div class="meta-box">
          <div class="meta-label">Invoice Details</div>
          <div class="meta-value">No: ${escapeHtml(safeString(data['invoiceNumber']))}</div>
          <div>Date: ${new Date(safeStr(data['date'], '')).toLocaleDateString()}</div>
          <div>Due: ${data['dueDate'] ? new Date(safeStr(data['dueDate'], '')).toLocaleDateString() : 'On Receipt'}</div>
          <div>Term: ${escapeHtml(safeString(data['termName']))}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 60%">Description</th>
            <th style="text-align: right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => `
            <tr>
              <td>${escapeHtml(safeString(item.description))}</td>
              <td style="text-align: right">${formatCurrencyFromCents(safeNum(item.amount, 0))}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td style="font-weight: bold; text-align: right">Total</td>
            <td style="font-weight: bold; text-align: right">${formatCurrencyFromCents(totalAmount)}</td>
          </tr>
          ${data['amountPaid'] != null ? `
          <tr>
            <td style="text-align: right">Amount Paid</td>
            <td style="text-align: right">${formatCurrencyFromCents(safeNum(data['amountPaid'], 0))}</td>
          </tr>
          <tr>
            <td style="font-weight: bold; text-align: right">Balance Due</td>
            <td style="font-weight: bold; text-align: right; color: ${safeNum(data['balanceDue'], 0) > 0 ? '#f59e0b' : '#10b981'};">
              ${formatCurrencyFromCents(safeNum(data['balanceDue'], 0))}
            </td>
          </tr>
          ` : ''}
        </tfoot>
      </table>

      <div class="signatures">
        <div class="sig-line">School Accountant</div>
        <div class="sig-line">Parent/Guardian</div>
      </div>
    `
  } else if (template === 'payslip') {
    interface PayslipLine {
      name?: string
      amount?: number
    }
    const allowances = (Array.isArray(data['allowancesList']) ? data['allowancesList'] : []) as PayslipLine[]
    const deductions = (Array.isArray(data['deductionsList']) ? data['deductionsList'] : []) as PayslipLine[]

    content = `
      <div class="meta-grid">
        <div class="meta-box">
          <div class="meta-label">Employee Details</div>
          <div class="meta-value">${escapeHtml(safeString(data['staff_name']))}</div>
          <div>Staff No: ${escapeHtml(safeString(data['staff_number']))}</div>
          <div>Department: ${escapeHtml(safeString(data['department']))}</div>
        </div>
        <div class="meta-box">
          <div class="meta-label">Pay Period</div>
          <div class="meta-value">${escapeHtml(safeString(data['periodName']))}</div>
        </div>
      </div>

      <div class="meta-grid">
        <div>
          <table>
            <thead><tr><th colspan="2">Earnings</th></tr></thead>
            <tbody>
              <tr><td>Basic Salary</td><td style="text-align: right">${formatCurrencyFromCents(safeNum(data['basicSalary'], 0))}</td></tr>
              ${allowances.map((a) => `
                <tr><td>${escapeHtml(safeString(a.name))}</td><td style="text-align: right">${formatCurrencyFromCents(safeNum(a.amount, 0))}</td></tr>
              `).join('')}
              <tr style="font-weight: bold; border-top: 2px solid #e2e8f0">
                <td>Gross Salary</td>
                <td style="text-align: right">${formatCurrencyFromCents(safeNum(data['grossSalary'], 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div>
          <table>
            <thead><tr><th colspan="2">Deductions</th></tr></thead>
            <tbody>
              ${deductions.map((d) => `
                <tr><td>${escapeHtml(safeString(d.name))}</td><td style="text-align: right">${formatCurrencyFromCents(safeNum(d.amount, 0))}</td></tr>
              `).join('')}
              <tr style="font-weight: bold; border-top: 2px solid #e2e8f0">
                <td>Total Deductions</td>
                <td style="text-align: right">${formatCurrencyFromCents(safeNum(data['totalDeductions'], 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; margin: 20px 0; text-align: center;">
        <div style="font-size: 14px;">Net Pay</div>
        <div style="font-size: 24px; font-weight: bold; margin: 10px 0;">${formatCurrencyFromCents(safeNum(data['netSalary'], 0))}</div>
      </div>

      <div class="signatures">
        <div class="sig-line">HR / Payroll Officer</div>
        <div class="sig-line">Employee Signature</div>
      </div>
    `
  } else if (template === 'report') {
    interface ReportRow {
      [key: string]: unknown
    }
    const columns = (Array.isArray(data['columns']) ? data['columns'] : []) as string[]
    const rows = (Array.isArray(data['rows']) ? data['rows'] : []) as ReportRow[]
    const summary = safeString(data['summary'])

    content = `
      ${summary ? `<div style="margin-bottom: 15px; color: #64748b; font-size: 11px;">${escapeHtml(summary)}</div>` : ''}

      <table>
        <thead>
          <tr>
            ${columns.map((col) => `<th>${escapeHtml(safeString(col))}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              ${columns.map((col) => `<td>${escapeHtml(safeString(row[col]))}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${data['totals'] ? `
        <div style="text-align: right; font-weight: bold; margin-top: 10px; padding: 10px; border-top: 2px solid #e2e8f0;">
          ${escapeHtml(safeString(data['totals']))}
        </div>
      ` : ''}
    `
  }

  return buildHtmlDocument({
    title,
    bodyContent: `
      <div class="print-content">
        <div class="watermark">${escapeHtml(schoolName)}</div>
        <div class="header">
          <div class="school-name">${escapeHtml(schoolName)}</div>
          <div class="school-info">
            ${escapeHtml(schoolAddress)} | ${escapeHtml(schoolPhone)} | ${escapeHtml(schoolEmail)}
          </div>
        </div>
        <div class="doc-title">${title}</div>
        ${content}
        <div class="footer">
          Generated on ${new Date().toLocaleString()} by School ERP System
        </div>
      </div>
    `,
    embeddedStyles: css,
    orientation,
    includeAppStyles: false
  })
}
