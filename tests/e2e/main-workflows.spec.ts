import { expect, test } from '@playwright/test'

/**
 * E2E tests verify complete user workflows from UI to database
 * These tests run against the actual Electron application
 */

test.describe('Payment Recording Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Launch app and login
    await page.goto('/')
    await page.fill('input[name="username"]', 'admin')
    await page.fill('input[name="password"]', 'admin123')
    await page.click('button[type="submit"]')
    await expect(page.getByText('Dashboard')).toBeVisible()
  })

  test('should record a payment successfully', async ({ page }) => {
    // Navigate to Finance → Payments
    await page.click('text=Finance')
    await page.click('text=Payments')
    
    // Click Record Payment button
    await page.click('button:has-text("Record Payment")')
    
    // Fill payment form
    await page.fill('input[name="studentId"]', '1')
    await page.fill('input[name="amount"]', '50000')
    await page.selectOption('select[name="paymentMethod"]', 'MPESA')
    await page.fill('input[name="referenceNumber"]', 'ABC123456')
    await page.fill('input[name="paymentDate"]', '2026-02-10')
    await page.fill('textarea[name="notes"]', 'School fees payment')
    
    // Submit form
    await page.click('button[type="submit"]')
    
    // Verify success message
    await expect(page.getByText('Payment recorded successfully')).toBeVisible()
    
    // Verify payment appears in list
    await expect(page.getByText('ABC123456')).toBeVisible()
    await expect(page.getByText('50,000')).toBeVisible()
  })

  test('should void a payment with reason', async ({ page }) => {
    // Navigate to Payments
    await page.click('text=Finance')
    await page.click('text=Payments')
    
    // Find a payment and click void
    await page.click('button[aria-label="Void Payment"]:first-of-type')
    
    // Fill void reason
    await page.fill('textarea[name="voidReason"]', 'Duplicate payment entry')
    
    // Confirm void
    await page.click('button:has-text("Confirm Void")')
    
    // Verify success
    await expect(page.getByText('Payment voided successfully')).toBeVisible()
    
    // Verify payment marked as voided
    await expect(page.getByText('VOIDED')).toBeVisible()
  })

  test('should show validation error for invalid amount', async ({ page }) => {
    await page.click('text=Finance')
    await page.click('text=Payments')
    await page.click('button:has-text("Record Payment")')
    
    // Try to submit with negative amount
    await page.fill('input[name="amount"]', '-100')
    await page.click('button[type="submit"]')
    
    // Verify error message
    await expect(page.getByText('Amount must be positive')).toBeVisible()
  })
})

test.describe('Invoice Management Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.fill('input[name="username"]', 'admin')
    await page.fill('input[name="password"]', 'admin123')
    await page.click('button[type="submit"]')
  })

  test('should generate invoices for student', async ({ page }) => {
    await page.click('text=Finance')
    await page.click('text=Invoices')
    await page.click('button:has-text("Generate Invoice")')
    
    // Fill invoice form
    await page.fill('input[name="studentId"]', '1')
    await page.selectOption('select[name="invoiceType"]', 'TUITION')
    await page.fill('input[name="amount"]', '60000')
    await page.fill('input[name="dueDate"]', '2026-03-15')
    
    await page.click('button[type="submit"]')
    
    await expect(page.getByText('Invoice generated successfully')).toBeVisible()
  })

  test('should view invoice details', async ({ page }) => {
    await page.click('text=Finance')
    await page.click('text=Invoices')
    
    // Click on first invoice
    await page.click('tr:has-text("INV-") >> first')
    
    // Verify invoice details modal
    await expect(page.getByText('Invoice Details')).toBeVisible()
    await expect(page.getByText('Student:')).toBeVisible()
    await expect(page.getByText('Amount:')).toBeVisible()
    await expect(page.getByText('Status:')).toBeVisible()
  })

  test('should filter invoices by status', async ({ page }) => {
    await page.click('text=Finance')
    await page.click('text=Invoices')
    
    // Filter by UNPAID
    await page.selectOption('select[name="statusFilter"]', 'UNPAID')
    
    // Verify only unpaid invoices shown
    const invoiceRows = await page.locator('tr:has-text("UNPAID")').count()
    expect(invoiceRows).toBeGreaterThan(0)
    
    const paidRows = await page.locator('tr:has-text("PAID")').count()
    expect(paidRows).toBe(0)
  })
})

test.describe('Report Generation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.fill('input[name="username"]', 'admin')
    await page.fill('input[name="password"]', 'admin123')
    await page.click('button[type="submit"]')
  })

  test('should generate cash flow statement', async ({ page }) => {
    await page.click('text=Reports')
    await page.click('text=Cash Flow Statement')
    
    // Set date range
    await page.fill('input[name="startDate"]', '2026-01-01')
    await page.fill('input[name="endDate"]', '2026-01-31')
    
    // Generate report
    await page.click('button:has-text("Generate Report")')
    
    // Verify report sections
    await expect(page.getByText('Operating Activities')).toBeVisible()
    await expect(page.getByText('Investing Activities')).toBeVisible()
    await expect(page.getByText('Financing Activities')).toBeVisible()
    await expect(page.getByText('Net Cash Flow')).toBeVisible()
  })

  test('should generate aged receivables report', async ({ page }) => {
    await page.click('text=Reports')
    await page.click('text=Aged Receivables')
    
    await page.click('button:has-text("Generate Report")')
    
    // Verify aging buckets
    await expect(page.getByText('Current (0-30 days)')).toBeVisible()
    await expect(page.getByText('31-60 days')).toBeVisible()
    await expect(page.getByText('61-90 days')).toBeVisible()
    await expect(page.getByText('Over 120 days')).toBeVisible()
  })

  test('should export report to CSV', async ({ page }) => {
    await page.click('text=Reports')
    await page.click('text=Student Ledger')
    
    await page.fill('input[name="studentId"]', '1')
    await page.click('button:has-text("Generate")')
    
    // Download CSV
    const downloadPromise = page.waitForEvent('download')
    await page.click('button:has-text("Export CSV")')
    const download = await downloadPromise
    
    // Verify download
    expect(download.suggestedFilename()).toContain('ledger')
    expect(download.suggestedFilename()).toContain('.csv')
  })
})

test.describe('Approval Workflow Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.fill('input[name="username"]', 'bursar')
    await page.fill('input[name="password"]', 'bursar123')
    await page.click('button[type="submit"]')
  })

  test('should request approval for high-value payment', async ({ page }) => {
    await page.click('text=Approvals')
    await page.click('text=Payment Approvals')
    
    // View pending approvals
    await expect(page.getByText('Pending Approvals')).toBeVisible()
    
    // Find approval request
    const approvalRow = page.locator('tr:has-text("PENDING")').first()
    await expect(approvalRow).toBeVisible()
    
    // View details
    await approvalRow.click()
    
    await expect(page.getByText('Approval Request Details')).toBeVisible()
    await expect(page.getByText('Amount:')).toBeVisible()
  })

  test('should approve pending request', async ({ page }) => {
    await page.click('text=Approvals')
    await page.click('text=Payment Approvals')
    
    // Click approve on first pending
    await page.click('button[aria-label="Approve"]:first-of-type')
    
    // Add comments
    await page.fill('textarea[name="comments"]', 'Approved - documentation verified')
    
    // Confirm approval
    await page.click('button:has-text("Confirm Approval")')
    
    // Verify success
    await expect(page.getByText('Approval processed successfully')).toBeVisible()
  })

  test('should reject request with reason', async ({ page }) => {
    await page.click('text=Approvals')
    await page.click('text=Payment Approvals')
    
    await page.click('button[aria-label="Reject"]:first-of-type')
    
    await page.fill('textarea[name="comments"]', 'Insufficient documentation provided')
    
    await page.click('button:has-text("Confirm Rejection")')
    
    await expect(page.getByText('Request rejected')).toBeVisible()
  })
})

test.describe('Scholarship Management Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.fill('input[name="username"]', 'admin')
    await page.fill('input[name="password"]', 'admin123')
    await page.click('button[type="submit"]')
  })

  test('should create new scholarship', async ({ page }) => {
    await page.click('text=Finance')
    await page.click('text=Scholarships')
    await page.click('button:has-text("Create Scholarship")')
    
    await page.fill('input[name="name"]', 'Academic Excellence 2026')
    await page.selectOption('select[name="type"]', 'MERIT')
    await page.fill('input[name="totalAmount"]', '500000')
    await page.fill('input[name="startDate"]', '2026-01-01')
    await page.fill('input[name="endDate"]', '2026-12-31')
    
    await page.click('button[type="submit"]')
    
    await expect(page.getByText('Scholarship created successfully')).toBeVisible()
  })

  test('should allocate scholarship to student', async ({ page }) => {
    await page.click('text=Finance')
    await page.click('text=Scholarships')
    
    // Click allocate on first scholarship
    await page.locator('button:has-text("Allocate")').first().click()
    
    await page.fill('input[name="studentId"]', '1')
    await page.fill('input[name="amount"]', '50000')
    await page.fill('textarea[name="notes"]', 'First term award')
    
    await page.click('button[type="submit"]')
    
    await expect(page.getByText('Scholarship allocated successfully')).toBeVisible()
  })
})

test.describe('Credit Auto-Application Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.fill('input[name="username"]', 'admin')
    await page.fill('input[name="password"]', 'admin123')
    await page.click('button[type="submit"]')
  })

  test('should view student credit balance', async ({ page }) => {
    await page.click('text=Finance')
    await page.click('text=Credits')
    
    await page.fill('input[name="studentSearch"]', 'STU-001')
    await page.press('input[name="studentSearch"]', 'Enter')
    
    await expect(page.getByText('Credit Balance:')).toBeVisible()
    await expect(page.getByText('Available Credits:')).toBeVisible()
  })

  test('should auto-apply credits to invoices', async ({ page }) => {
    await page.click('text=Finance')
    await page.click('text=Credits')
    
    await page.fill('input[name="studentSearch"]', 'STU-001')
    await page.press('input[name="studentSearch"]', 'Enter')
    
    await page.click('button:has-text("Auto-Apply Credits")')
    
    await expect(page.getByText('Credits applied successfully')).toBeVisible()
    await expect(page.getByText('Credits Applied:')).toBeVisible()
    await expect(page.getByText('Invoices Affected:')).toBeVisible()
  })
})
