import { expect, test } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const isE2E = process.env.E2E === 'true'
test.skip(!isE2E, 'Set E2E=true to run smoke E2E tests')

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let electronApp: ElectronApplication | null = null
let page: Page | null = null

async function authenticateForE2E(activePage: Page): Promise<void> {
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

test.describe('Release Smoke', () => {
  test.beforeAll(async () => {
    const launchEnv = { ...process.env, NODE_ENV: 'test' }
    delete launchEnv.ELECTRON_RUN_AS_NODE

    electronApp = await electron.launch({
      args: [path.join(__dirname, '../../dist-electron/main/index.js')],
      env: launchEnv
    })
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
  })

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close()
    }
  })

  test('launches, authenticates, and reaches fee payment workflow route', async () => {
    if (!page) {
      throw new Error('Smoke setup failed: application window was not initialized')
    }

    await authenticateForE2E(page)

    await page.locator('a[href*="fee-payment"]').first().click()
    await expect(page.locator('h1:has-text("Fee Collection")')).toBeVisible()
  })
})
