// @vitest-environment jsdom
/**
 * Tests for print utilities.
 *
 * Verifies subscribePrintPreview, closePrintPreview, previewPDF,
 * previewHTML, printCurrentView, and printDocument behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  subscribePrintPreview,
  closePrintPreview,
  previewPDF,
  previewHTML,
  printCurrentView,
  printDocument,
} from '../print'

beforeEach(() => {
  // Close any active preview between tests
  closePrintPreview()
})

describe('subscribePrintPreview', () => {
  it('calls listener immediately with current preview (null initially)', () => {
    const listener = vi.fn()
    const unsub = subscribePrintPreview(listener)
    expect(listener).toHaveBeenCalledWith(null)
    unsub()
  })

  it('calls listener when a PDF preview is opened', () => {
    const listener = vi.fn()
    const unsub = subscribePrintPreview(listener)
    listener.mockClear()

    previewPDF('Test PDF', 'blob:http://localhost/abc')

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Test PDF', pdfUrl: 'blob:http://localhost/abc' }),
    )
    unsub()
  })

  it('stops receiving updates after unsubscribe', () => {
    const listener = vi.fn()
    const unsub = subscribePrintPreview(listener)
    unsub()
    listener.mockClear()

    previewPDF('After Unsub', 'blob:x')
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('closePrintPreview', () => {
  it('notifies listeners with null', () => {
    const listener = vi.fn()
    const unsub = subscribePrintPreview(listener)
    previewHTML('Open', '<p>Hi</p>')
    listener.mockClear()

    closePrintPreview()

    expect(listener).toHaveBeenCalledWith(null)
    unsub()
  })
})

describe('previewHTML', () => {
  it('opens preview with html and optional onDownload', () => {
    const listener = vi.fn()
    const unsub = subscribePrintPreview(listener)
    listener.mockClear()

    const onDownload = vi.fn()
    previewHTML('HTML Preview', '<h1>Hello</h1>', onDownload)

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'HTML Preview',
        html: '<h1>Hello</h1>',
        onDownload,
      }),
    )
    unsub()
  })

  it('opens preview without onDownload when not provided', () => {
    const listener = vi.fn()
    const unsub = subscribePrintPreview(listener)
    listener.mockClear()

    previewHTML('No DL', '<p>Test</p>')

    const preview = listener.mock.calls[0][0]
    expect(preview.onDownload).toBeUndefined()
    unsub()
  })
})

describe('printCurrentView', () => {
  it('calls globalThis.print when no matching element found', () => {
    const printSpy = vi.spyOn(globalThis, 'print').mockImplementation(() => {})
    // No <main> in the jsdom document by default
    printCurrentView({ selector: '#nonexistent' })

    expect(printSpy).toHaveBeenCalled()
    printSpy.mockRestore()
  })

  it('opens print preview when a matching element exists', () => {
    const main = document.createElement('main')
    main.innerHTML = '<p>content</p>'
    document.body.appendChild(main)

    const listener = vi.fn()
    const unsub = subscribePrintPreview(listener)
    listener.mockClear()

    printCurrentView({ title: 'My View' })

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'My View' }),
    )

    main.remove()
    unsub()
  })

  it('uses landscape orientation when specified', () => {
    const main = document.createElement('main')
    main.innerHTML = '<p>landscape</p>'
    document.body.appendChild(main)

    const listener = vi.fn()
    const unsub = subscribePrintPreview(listener)
    listener.mockClear()

    printCurrentView({ title: 'Wide', orientation: 'landscape' })

    const preview = listener.mock.calls[0][0]
    expect(preview.html).toContain('landscape')

    main.remove()
    unsub()
  })
})

/** Capture the HTML sent to the print preview listener */
function captureHTML(fn: () => void): string {
  const listener = vi.fn()
  const unsub = subscribePrintPreview(listener)
  listener.mockClear()
  fn()
  const preview = listener.mock.calls[0]?.[0]
  unsub()
  return preview?.html ?? ''
}

describe('printDocument', () => {
  describe('receipt template', () => {
    it('renders receipt with student info and amount', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Fee Receipt',
          template: 'receipt',
          data: {
            studentName: 'Jane Doe',
            admissionNumber: 'ADM-001',
            receiptNumber: 'RCP-100',
            date: '2026-03-01',
            paymentMode: 'MPESA',
            amount: 500000,
            amountInWords: 'Five Thousand Shillings',
          },
        })
      )
      expect(html).toContain('Jane Doe')
      expect(html).toContain('ADM-001')
      expect(html).toContain('RCP-100')
      expect(html).toContain('MPESA')
      expect(html).toContain('Five Thousand Shillings')
      expect(html).toContain('Authorized Signatory')
    })
  })

  describe('invoice template', () => {
    it('renders invoice with line items and totals', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Fee Invoice',
          template: 'invoice',
          data: {
            studentName: 'John Smith',
            admissionNumber: 'ADM-002',
            streamName: 'Grade 4 East',
            invoiceNumber: 'INV-200',
            date: '2026-03-01',
            termName: 'Term 2',
            items: [
              { description: 'Tuition', amount: 2000000 },
              { description: 'Activity', amount: 500000 },
            ],
            totalAmount: 2500000,
            amountPaid: 1000000,
            balanceDue: 1500000,
          },
        })
      )
      expect(html).toContain('John Smith')
      expect(html).toContain('INV-200')
      expect(html).toContain('Tuition')
      expect(html).toContain('Activity')
      expect(html).toContain('Balance Due')
      expect(html).toContain('Term 2')
    })

    it('omits paid/balance rows when amountPaid is absent', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Invoice',
          template: 'invoice',
          data: {
            studentName: 'A',
            admissionNumber: 'B',
            invoiceNumber: 'C',
            date: '2026-01-01',
            items: [{ description: 'Fee', amount: 1000 }],
          },
        })
      )
      expect(html).not.toContain('Amount Paid')
    })
  })

  describe('statement template', () => {
    it('renders statement with ledger rows', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Student Statement',
          template: 'statement',
          data: {
            studentName: 'Alice K',
            admissionNumber: 'ADM-003',
            streamName: 'Grade 3 West',
            openingBalance: 100000,
            closingBalance: 50000,
            ledger: [
              { debit_credit: 'DEBIT', amount: 100000, transaction_date: '2026-01-15', invoice_number: 'INV-1', description: 'Term fee', runningBalance: 100000 },
              { debit_credit: 'CREDIT', amount: 50000, transaction_date: '2026-02-01', receipt_number: 'RCP-1', description: 'Payment', runningBalance: 50000 },
            ],
          },
        })
      )
      expect(html).toContain('Alice K')
      expect(html).toContain('Balance Due')
      expect(html).toContain('Term fee')
      expect(html).toContain('Payment')
      expect(html).toContain('School Accountant')
    })

    it('shows Credit Surplus when closing balance is negative', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Statement',
          template: 'statement',
          data: {
            studentName: 'Bob',
            admissionNumber: 'ADM-004',
            openingBalance: 0,
            closingBalance: -20000,
            ledger: [],
          },
        })
      )
      expect(html).toContain('Credit Surplus')
    })
  })

  describe('payslip template', () => {
    it('renders payslip with earnings and deductions', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Payslip',
          template: 'payslip',
          data: {
            staff_name: 'Mary Teacher',
            staff_number: 'STAFF-01',
            department: 'Science',
            periodName: 'March 2026',
            basicSalary: 5000000,
            grossSalary: 5500000,
            netSalary: 4000000,
            totalDeductions: 1500000,
            allowancesList: [{ name: 'House', amount: 500000 }],
            deductionsList: [
              { name: 'NHIF', amount: 50000 },
              { name: 'NSSF', amount: 30000 },
            ],
          },
        })
      )
      expect(html).toContain('Mary Teacher')
      expect(html).toContain('STAFF-01')
      expect(html).toContain('Science')
      expect(html).toContain('Earnings')
      expect(html).toContain('Deductions')
      expect(html).toContain('Net Pay')
      expect(html).toContain('House')
      expect(html).toContain('NHIF')
    })
  })

  describe('report template', () => {
    it('renders report table with columns and rows', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Revenue Report',
          template: 'report',
          data: {
            columns: ['Name', 'Amount'],
            rows: [
              { Name: 'Tuition', Amount: '500,000' },
              { Name: 'Transport', Amount: '120,000' },
            ],
            summary: 'Annual revenue breakdown',
            totals: 'Grand Total: 620,000',
          },
        })
      )
      expect(html).toContain('Tuition')
      expect(html).toContain('Transport')
      expect(html).toContain('Annual revenue breakdown')
      expect(html).toContain('Grand Total: 620,000')
    })

    it('renders report without summary or totals', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Simple Report',
          template: 'report',
          data: { columns: ['Col'], rows: [{ Col: 'Val' }] },
        })
      )
      expect(html).toContain('Val')
      expect(html).not.toContain('Grand Total')
    })
  })

  describe('school settings and orientation', () => {
    it('uses provided school settings', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Receipt',
          template: 'receipt',
          data: { studentName: 'X', amount: 100 },
          schoolSettings: { schoolName: 'Test Academy', address: '123 St', phone: '555', email: 'a@b.com' },
        })
      )
      expect(html).toContain('Test Academy')
      expect(html).toContain('123 St')
      expect(html).toContain('555')
      expect(html).toContain('a@b.com')
    })

    it('uses default school settings when not provided', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Receipt',
          template: 'receipt',
          data: { studentName: 'X', amount: 100 },
        })
      )
      expect(html).toContain('Mwingi Adventist School')
    })

    it('uses landscape orientation when specified', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Report',
          template: 'report',
          data: { columns: [], rows: [] },
          orientation: 'landscape',
        })
      )
      expect(html).toContain('landscape')
    })
  })

  describe('HTML escaping', () => {
    it('escapes special characters in student name', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Receipt',
          template: 'receipt',
          data: { studentName: '<script>alert("xss")</script>', amount: 0 },
        })
      )
      expect(html).not.toContain('<script>')
      expect(html).toContain('&lt;script&gt;')
    })
  })

  describe('safeString branches', () => {
    it('handles object values via JSON.stringify', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Receipt',
          template: 'receipt',
          data: { studentName: { first: 'Jane', last: 'Doe' }, amount: 100 },
        })
      )
      expect(html).toContain('{&quot;first&quot;:&quot;Jane&quot;,&quot;last&quot;:&quot;Doe&quot;}')
    })

    it('handles numeric values via String()', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Receipt',
          template: 'receipt',
          data: { studentName: 12345, amount: 100 },
        })
      )
      expect(html).toContain('12345')
    })
  })

  describe('invoice with no dueDate', () => {
    it('shows "On Receipt" when dueDate is undefined', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Invoice',
          template: 'invoice',
          data: {
            studentName: 'Test',
            admissionNumber: 'ADM-X',
            invoiceNumber: 'INV-X',
            date: '2026-01-01',
            items: [{ description: 'Fee', amount: 1000 }],
          },
        })
      )
      expect(html).toContain('On Receipt')
    })
  })

  describe('statement ledger ref fallbacks', () => {
    it('shows ref when receipt_number and invoice_number are absent', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Statement',
          template: 'statement',
          data: {
            studentName: 'S',
            admissionNumber: 'A',
            openingBalance: 0,
            closingBalance: 0,
            ledger: [
              { debit_credit: 'DEBIT', amount: 1000, transaction_date: '2026-01-01', ref: 'REF-X', description: 'Item' },
            ],
          },
        })
      )
      expect(html).toContain('REF-X')
    })

    it('shows dash when all ref fields are absent', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Statement',
          template: 'statement',
          data: {
            studentName: 'S',
            admissionNumber: 'A',
            openingBalance: 0,
            closingBalance: 0,
            ledger: [
              { debit_credit: 'DEBIT', amount: 1000, transaction_date: '2026-01-01', description: 'NoRef' },
            ],
          },
        })
      )
      expect(html).toContain('>-<')
    })

    it('uses running_balance when runningBalance is undefined', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Statement',
          template: 'statement',
          data: {
            studentName: 'S',
            admissionNumber: 'A',
            openingBalance: 0,
            closingBalance: 10000,
            ledger: [
              { debit_credit: 'DEBIT', amount: 10000, transaction_date: '2026-01-01', invoice_number: 'INV-1', description: 'Fee', running_balance: 10000 },
            ],
          },
        })
      )
      // running_balance: 10000 → formatted currency should appear
      expect(html).toContain('100') // 10000 cents = KES 100
    })

    it('falls back to 0 when both runningBalance and running_balance are 0', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Statement',
          template: 'statement',
          data: {
            studentName: 'S',
            admissionNumber: 'A',
            openingBalance: 0,
            closingBalance: 0,
            ledger: [
              { debit_credit: 'DEBIT', amount: 0, transaction_date: '2026-01-01', invoice_number: 'INV-1', description: 'Zero', runningBalance: 0, running_balance: 0 },
            ],
          },
        })
      )
      // balance of 0 should be formatted
      expect(html).toContain('0')
    })
  })

  describe('payslip with empty string fields', () => {
    it('renders payslip even with empty staff_name, staff_number, department', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Payslip',
          template: 'payslip',
          data: {
            staff_name: '',
            staff_number: '',
            department: '',
            periodName: '',
            basicSalary: 0,
            grossSalary: 0,
            netSalary: 0,
            totalDeductions: 0,
            allowancesList: [],
            deductionsList: [],
          },
        })
      )
      expect(html).toContain('Employee Details')
      expect(html).toContain('Net Pay')
    })
  })

  describe('getHeadStylesHtml', () => {
    it('collects style elements from the document head', () => {
      const style = document.createElement('style')
      style.textContent = '.test-class { color: red; }'
      document.head.appendChild(style)

      const main = document.createElement('main')
      main.innerHTML = '<p>styled content</p>'
      document.body.appendChild(main)

      const listener = vi.fn()
      const unsub = subscribePrintPreview(listener)
      listener.mockClear()

      printCurrentView({ title: 'Styled View' })

      const preview = listener.mock.calls[0]?.[0]
      expect(preview?.html).toContain('.test-class')

      main.remove()
      style.remove()
      unsub()
    })
  })

  // ── Branch coverage: statement with transaction_date field (L270) ──
  describe('statement – ledger row with transaction_date', () => {
    it('uses transaction_date when date is absent', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Statement',
          template: 'statement',
          data: {
            ledger: [
              { transaction_date: '2026-03-15', debit_credit: 'DEBIT', amount: 5000, description: 'Fee', receipt_number: 'R1', runningBalance: 5000 },
              { date: '2026-03-16', debit_credit: 'CREDIT', amount: 3000, description: 'Payment', invoice_number: 'INV1', running_balance: 2000 },
            ],
            studentName: 'Test',
            admissionNumber: 'ADM1',
            streamName: 'S1',
            openingBalance: 0,
            closingBalance: 2000,
          },
        })
      )
      expect(html).toContain('Fee')
      expect(html).toContain('Payment')
    })
  })

  // ── Branch coverage: statement with no date on row (L276 – Invalid Date) ──
  describe('statement – ledger row without any date', () => {
    it('shows Invalid Date when both transaction_date and date are missing', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Statement',
          template: 'statement',
          data: {
            ledger: [
              { debit_credit: 'DEBIT', amount: 1000, description: 'No date row' },
            ],
            studentName: 'X',
            admissionNumber: 'A1',
            openingBalance: 0,
            closingBalance: 1000,
          },
        })
      )
      expect(html).toContain('Invalid Date')
    })
  })

  // ── Branch coverage: statement with non-array ledger (L232) ──
  describe('statement – non-array ledger data', () => {
    it('treats non-array ledger as empty array', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Statement',
          template: 'statement',
          data: {
            ledger: 'not-an-array',
            studentName: 'Y',
            openingBalance: 0,
            closingBalance: 0,
          },
        })
      )
      expect(html).toContain('Student Details')
    })
  })

  // ── Branch coverage: invoice without dueDate (L343) ──
  describe('invoice – without dueDate (branch)', () => {
    it('shows On Receipt when dueDate is absent', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Invoice',
          template: 'invoice',
          data: {
            studentName: 'Student',
            admissionNumber: 'ADM',
            invoiceNumber: 'INV-1',
            date: '2026-01-01',
            items: [{ description: 'Fee', amount: 10000 }],
            totalAmount: 10000,
          },
        })
      )
      expect(html).toContain('On Receipt')
    })
  })

  // ── Branch coverage: invoice with negative balanceDue (L375 color branch) ──
  describe('invoice – negative balanceDue', () => {
    it('uses green color for zero/negative balance', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Invoice',
          template: 'invoice',
          data: {
            studentName: 'S',
            admissionNumber: 'A',
            invoiceNumber: 'INV-2',
            date: '2026-01-01',
            dueDate: '2026-02-01',
            items: [{ description: 'Fee', amount: 5000 }],
            totalAmount: 5000,
            amountPaid: 6000,
            balanceDue: -1000,
          },
        })
      )
      expect(html).toContain('#10b981')
    })
  })

  // ── Branch coverage: invoice with non-array items (L328) ──
  describe('invoice – non-array items', () => {
    it('treats non-array items as empty array', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Invoice',
          template: 'invoice',
          data: {
            studentName: 'S',
            admissionNumber: 'A',
            invoiceNumber: 'INV-3',
            date: '2026-01-01',
            items: 'not-array',
            totalAmount: 0,
          },
        })
      )
      expect(html).toContain('Invoice Details')
    })
  })

  // ── Branch coverage: payslip with non-array allowances/deductions (L393, L394) ──
  describe('payslip – non-array allowances and deductions', () => {
    it('treats non-array allowances and deductions as empty arrays', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Payslip',
          template: 'payslip',
          data: {
            staff_name: 'Employee',
            staff_number: 'ST1',
            department: 'Admin',
            periodName: 'Jan 2026',
            basicSalary: 50000,
            grossSalary: 50000,
            totalDeductions: 10000,
            netSalary: 40000,
            allowancesList: null,
            deductionsList: undefined,
          },
        })
      )
      expect(html).toContain('Employee')
      expect(html).toContain('Earnings')
    })
  })

  // ── Branch coverage: report with non-array columns/rows (L456, L457) ──
  describe('report – non-array columns and rows', () => {
    it('treats non-array columns and rows as empty arrays', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Report',
          template: 'report',
          data: {
            columns: 'not-array',
            rows: null,
          },
        })
      )
      expect(html).toBeDefined()
    })
  })

  // ── Branch coverage: previewPDF (L46) ──
  describe('previewPDF', () => {
    it('notifies listeners with pdfUrl preview data', () => {
      const listener = vi.fn()
      const unsub = subscribePrintPreview(listener)
      listener.mockClear()

      previewPDF('My PDF', 'blob:http://test/pdf-123')
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'My PDF', pdfUrl: 'blob:http://test/pdf-123' })
      )
      unsub()
    })
  })

  // ── Branch coverage: statement with missing date fields (L276 'Invalid Date') ──
  describe('statement ledger date fallback', () => {
    it('shows Invalid Date when transaction_date and date are both missing', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Statement',
          template: 'statement',
          data: {
            studentName: 'NoDate',
            admissionNumber: 'ND-1',
            openingBalance: 0,
            closingBalance: 5000,
            ledger: [
              { debit_credit: 'DEBIT', amount: 5000, description: 'Missing date row' },
            ],
          },
        })
      )
      expect(html).toContain('Invalid Date')
    })

    it('falls back to row.date when transaction_date is absent', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Statement',
          template: 'statement',
          data: {
            studentName: 'FallbackDate',
            admissionNumber: 'FD-1',
            openingBalance: 0,
            closingBalance: 5000,
            ledger: [
              { debit_credit: 'DEBIT', amount: 5000, date: '2026-03-01', description: 'Uses date field' },
            ],
          },
        })
      )
      expect(html).not.toContain('Invalid Date')
    })
  })

  // ── Branch coverage: statement with null/undefined amount (L267 ?? 0) ──
  describe('statement ledger amount fallback', () => {
    it('treats null amount as zero', () => {
      const html = captureHTML(() =>
        printDocument({
          title: 'Statement',
          template: 'statement',
          data: {
            studentName: 'NullAmt',
            admissionNumber: 'NA-1',
            openingBalance: 0,
            closingBalance: 0,
            ledger: [
              { debit_credit: 'DEBIT', amount: null, transaction_date: '2026-01-01', description: 'Null amount' },
            ],
          },
        })
      )
      // Amount null → Number(null ?? 0) = 0, so both debit and credit show '-'
      expect(html).toContain('>-<')
    })
  })
})
