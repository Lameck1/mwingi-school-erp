import { expect, test } from '@playwright/test'
import path from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const isE2E = process.env.E2E === 'true'
test.skip(!isE2E, 'Set E2E=true to run smoke E2E tests')

let electronApp: ElectronApplication | null = null
let page: Page | null = null

test.describe('Release Smoke', () => {
  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../../dist-electron/main/index.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
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

    await page.fill('input[type="text"]', 'admin')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button[type="submit"]')

    await expect(page.locator('h1:has-text("Financial Overview")')).toBeVisible()

    await page.click('a[href="/fee-payment"]')
    await expect(page.locator('h1:has-text("Fee Payment")')).toBeVisible()
  })
})
