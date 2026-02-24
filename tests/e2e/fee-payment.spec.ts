import { expect, test } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const isE2E = process.env.E2E === 'true'
test.skip(!isE2E, 'Set E2E=true to run fee-payment E2E tests')

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let electronApp: ElectronApplication | null = null
let page: Page | null = null

async function loginAsAdmin(activePage: Page): Promise<void> {
  const adminUsername = 'admin'
  // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- deterministic local E2E credential
  const adminPassword = 'Admin123!'

  const initialSetupHeading = activePage.locator('h1:has-text("Initial Setup")')
  if (await initialSetupHeading.isVisible().catch(() => false)) {
    await activePage.fill('input[placeholder="Enter full name"]', 'Administrator')
    await activePage.fill('input[placeholder="Enter email (optional)"]', 'admin@example.com')
    await activePage.fill('input[placeholder="Choose a username"]', adminUsername)
    await activePage.fill('input[placeholder="Create a password"]', adminPassword)
    await activePage.fill('input[placeholder="Confirm password"]', adminPassword)
    await activePage.click('button:has-text("Create Admin Account")')
  }

  const usernameInput = activePage.locator('input[type="text"]').first()
  const passwordInput = activePage.locator('input[type="password"]').first()
  const submitButton = activePage.locator('button[type="submit"]').first()

  if (
    await usernameInput.isVisible().catch(() => false)
    && await passwordInput.isVisible().catch(() => false)
    && await submitButton.isVisible().catch(() => false)
  ) {
    for (const candidatePassword of [adminPassword, 'admin123']) {
      await usernameInput.fill(adminUsername)
      await passwordInput.fill(candidatePassword)
      await submitButton.click()
      if (await activePage.locator('a[href*="fee-payment"]').first().isVisible({ timeout: 3000 }).catch(() => false)) {
        break
      }
    }
  }

  await expect(activePage.locator('a[href*="fee-payment"]').first()).toBeVisible({ timeout: 15000 })
}

async function seedDeterministicData(activePage: Page): Promise<void> {
  const seeded = await activePage.evaluate(async () => {
    const session = await globalThis.electronAPI.auth.getSession()
    const userId = session?.user?.id
    if (!userId) {
      return { success: false, error: 'Missing session user id' }
    }
    return globalThis.electronAPI.resetAndSeedDatabase(userId)
  })

  expect(seeded.success).toBe(true)
  await activePage.reload()
  await activePage.waitForLoadState('domcontentloaded')
}

test.describe('Fee Payment Flow', () => {
  test.beforeAll(async () => {
    const launchEnv = { ...process.env, NODE_ENV: 'test' }
    delete launchEnv.ELECTRON_RUN_AS_NODE

    electronApp = await electron.launch({
      args: [path.join(__dirname, '../../dist-electron/main/index.js')],
      env: launchEnv
    })
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await loginAsAdmin(page)
    await seedDeterministicData(page)
    await loginAsAdmin(page)
  })

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close()
    }
  })

  test('records fee payment deterministically and shows success confirmation', async () => {
    if (!page) {
      throw new Error('Fee payment test setup failed: no active Electron page')
    }

    await page.locator('a[href*="fee-payment"]').first().click()
    await expect(page.locator('h1:has-text("Fee Collection")')).toBeVisible()

    const searchInput = page.locator('input[placeholder="Search by name or admission..."]')
    await searchInput.fill('2026/')
    await searchInput.press('Enter')

    const firstStudent = page.getByRole('button', { name: /select/i }).first()
    await expect(firstStudent).toBeVisible({ timeout: 10000 })
    await firstStudent.click()

    const amountInput = page.getByLabel('Amount Payable (KES)')
    await expect(amountInput).toBeEnabled()
    await amountInput.fill('1000')
    await page.getByLabel('Reference / Slip Number').fill(`E2E-${Date.now()}`)
    await page.getByLabel('Transaction Narrative').fill('Automated deterministic E2E payment')
    await page.click('button[type="submit"]:has-text("Finalize Payment")')

    await expect(page.locator('text=Recent Ledger Entries')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('text=/Ksh\\s*1,000\\.00/i')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('text=Ledger Posted')).toBeVisible({ timeout: 15000 })
  })
})
