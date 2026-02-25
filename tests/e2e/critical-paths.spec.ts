import { expect, test } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const isE2E = process.env.E2E === 'true'
test.skip(!isE2E, 'Set E2E=true to run critical-path E2E tests')

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
  await authenticateForE2E(activePage)
}

async function getSessionUserId(activePage: Page): Promise<number> {
  const userId = await activePage.evaluate(async () => {
    const session = await globalThis.electronAPI.auth.getSession()
    return session?.user?.id ?? 0
  })
  expect(userId).toBeGreaterThan(0)
  return userId
}

// eslint-disable-next-line max-lines-per-function
test.describe('Critical Path E2E', () => {
  test.beforeAll(async () => {
    const launchEnv = { ...process.env, NODE_ENV: 'test' }
    delete launchEnv.ELECTRON_RUN_AS_NODE

    electronApp = await electron.launch({
      args: [path.join(__dirname, '../../dist-electron/main/index.js')],
      env: launchEnv
    })
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await authenticateForE2E(page)
    await seedDeterministicData(page)
  })

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close()
    }
  })

  test('backup create + restore guardrails path', async () => {
    if (!page) {
      throw new Error('Critical path setup failed: no active Electron page')
    }

    const backupResult = await page.evaluate(async () => {
      return globalThis.electronAPI.system.createBackup()
    })
    expect(backupResult.success).toBe(true)

    const backups = await page.evaluate(async () => {
      return globalThis.electronAPI.system.getBackupList()
    })
    expect(Array.isArray(backups)).toBe(true)
    expect(backups.length).toBeGreaterThan(0)

    const restoreResult = await page.evaluate(async () => {
      return globalThis.electronAPI.system.restoreBackup('../bad.sqlite')
    })
    expect(restoreResult.success).toBe(false)
  })

  test('payroll run -> disbursement record path', async () => {
    if (!page) {
      throw new Error('Critical path setup failed: no active Electron page')
    }
    const userId = await getSessionUserId(page)
    const month = 12
    const year = 2099

    const runResult = await page.evaluate(async ({ month, year, userId }) => {
      return globalThis.electronAPI.runPayroll(month, year, userId)
    }, { month, year, userId })
    expect(runResult.success).toBe(true)
    expect(runResult.periodId).toBeGreaterThan(0)

    const confirmResult = await page.evaluate(async ({ periodId, userId }) => {
      return globalThis.electronAPI.confirmPayroll(periodId, userId)
    }, { periodId: runResult.periodId, userId })
    expect(confirmResult.success).toBe(true)

    const paidResult = await page.evaluate(async ({ periodId, userId }) => {
      return globalThis.electronAPI.markPayrollPaid(periodId, userId)
    }, { periodId: runResult.periodId, userId })
    expect(paidResult.success).toBe(true)

    const detailsResult = await page.evaluate(async (periodId) => {
      return globalThis.electronAPI.getPayrollDetails(periodId)
    }, runResult.periodId)
    expect(detailsResult.success).toBe(true)
  })

  test('report card generation blocks malicious filename inputs', async () => {
    if (!page) {
      throw new Error('Critical path setup failed: no active Electron page')
    }

    const mergeResult = await page.evaluate(async () => {
      return globalThis.electronAPI.mergeReportCards({
        exam_id: 1,
        stream_id: 1,
        output_path: '../evil.pdf'
      })
    })

    expect(mergeResult.success).toBe(false)
    expect(String(mergeResult.error ?? '')).toContain('Validation failed')
  })

  test('updater error-path returns explicit non-success result', async () => {
    if (!page) {
      throw new Error('Critical path setup failed: no active Electron page')
    }

    const updateResult = await page.evaluate(async () => {
      return globalThis.electronAPI.system.checkForUpdates()
    })

    expect(updateResult.success).toBe(false)
  })
})
